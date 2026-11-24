import { resolveLeadTemperature, resolveProductInterest, type LeadTemperature } from '@/lib/ai/follow-up-types';

/**
 * Score de propensión de compra (0-100) — modelo híbrido:
 *   temperatura asignada por la IA (base) + señales deterministas de comportamiento.
 *
 * Es una función pura: no consulta la base de datos. `LeadScoreService` arma las señales.
 * Devuelve `score = null` para contactos fuera del ranking comercial (ganado / perdido).
 */

export interface LeadScoreSignals {
  pipelineStage?: string | null;
  customFields?: Record<string, any> | null;
  dealValue?: number | null;
  /** Último mensaje ENTRANTE del cliente (ISO). */
  lastLeadMessageAt?: string | null;
  /** Cantidad de mensajes del cliente en los últimos 7 días. */
  leadMessagesLast7d?: number;
  now?: number;
}

export interface LeadScoreFactor {
  key: string;
  label: string;
  points: number;
}

export interface RecommendedCommercialAction {
  actionKey:
    | 'confirm_closing_and_receipt'
    | 'offer_payment_or_separe'
    | 'clarify_and_quote'
    | 'qualify_needs'
    | 'post_sale_service';
  label: string;
  urgency: 'immediate' | 'high' | 'medium' | 'low';
  playbookTip: string;
}

export interface LeadScoreResult {
  score: number | null;
  breakdown: LeadScoreFactor[];
  recommendedAction?: RecommendedCommercialAction | null;
}

export const LEAD_SCORE_TEMPERATURE_BASE: Record<LeadTemperature, number> = {
  hot: 70,
  qualified_doubt: 55,
  warm: 35,
  cold: 10,
};

/** Base cuando la IA aún no clasificó al contacto. */
export const LEAD_SCORE_UNCLASSIFIED_BASE = 30;

const DAY_MS = 24 * 3600 * 1000;

function parseTime(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Puntos por recencia del último mensaje del cliente:
 * +15 si escribió hace < 1 día, decae linealmente hasta −15 a los 14 días o más.
 */
export function recencyPoints(lastLeadMessageAt: string | null | undefined, now: number): number {
  const t = parseTime(lastLeadMessageAt);
  if (t === null) return -10;
  const days = Math.max(0, (now - t) / DAY_MS);
  if (days <= 1) return 15;
  if (days >= 14) return -15;
  // Interpolación lineal entre (1 día, +15) y (14 días, −15)
  return Math.round(15 - ((days - 1) / 13) * 30);
}

export function computeLeadScore(signals: LeadScoreSignals): LeadScoreResult {
  const now = signals.now ?? Date.now();
  const cf = (signals.customFields && typeof signals.customFields === 'object' ? signals.customFields : {}) as Record<
    string,
    any
  >;
  const stage = signals.pipelineStage || 'nuevo';

  if (stage === 'ganado' || stage === 'perdido') {
    return {
      score: null,
      breakdown: [{ key: 'closed', label: stage === 'ganado' ? 'Venta cerrada' : 'Descartado', points: 0 }],
    };
  }

  if (cf.opted_out === true) {
    return { score: 0, breakdown: [{ key: 'opt_out', label: 'Pidió no ser contactado', points: 0 }] };
  }

  const breakdown: LeadScoreFactor[] = [];
  const add = (key: string, label: string, points: number) => {
    if (points !== 0) breakdown.push({ key, label, points });
  };

  // 1. Base por temperatura IA
  const temp = resolveLeadTemperature(cf);
  if (temp) {
    const labels: Record<LeadTemperature, string> = {
      hot: 'IA: listo para comprar',
      qualified_doubt: 'IA: interesado con dudas',
      warm: 'IA: tibio',
      cold: 'IA: frío',
    };
    add('temperature', labels[temp], LEAD_SCORE_TEMPERATURE_BASE[temp]);
  } else {
    add('temperature', 'Sin clasificar', LEAD_SCORE_UNCLASSIFIED_BASE);
  }

  // 2. Etapa del pipeline
  if (stage === 'calificado') add('stage', 'Etapa: calificado', 8);
  if (stage === 'cita_agendada') add('stage', 'Etapa: cita agendada', 15);

  // 3. Recencia del último mensaje del cliente
  const lastLeadAt = signals.lastLeadMessageAt || cf.last_lead_message_at || null;
  add('recency', 'Actividad reciente del cliente', recencyPoints(lastLeadAt, now));

  // 4. Engagement (mensajes del cliente últimos 7 días, máx +10)
  const msgs7d = Math.max(0, Number(signals.leadMessagesLast7d || 0));
  if (msgs7d > 0) add('engagement', `${msgs7d} mensajes en 7 días`, Math.min(10, Math.round(msgs7d * 1.5)));

  // 5. Respuesta / silencio frente a seguimientos
  const fu = cf.follow_up && typeof cf.follow_up === 'object' ? cf.follow_up : {};
  const lastFollowUpAt = parseTime(fu.lastSentAt || cf.reactivation_sent_at);
  const lastLeadTime = parseTime(lastLeadAt);
  if (lastFollowUpAt !== null) {
    if (lastLeadTime !== null && lastLeadTime > lastFollowUpAt) {
      add('follow_up_reply', 'Respondió a un seguimiento', 8);
    } else {
      const unanswered = Math.min(3, Math.max(1, Number(fu.currentStepIndex || fu.autonomousAttemptCount || 1)));
      add('follow_up_ignored', `${unanswered} seguimiento(s) sin respuesta`, -7 * unanswered);
    }
  }

  // 6. Interés de producto y objeciones
  if (resolveProductInterest(cf, signals.dealValue)) add('product', 'Producto de interés identificado', 5);
  if (cf.last_objection || cf.ai_summary?.objections_doubts) add('objection', 'Objeción detectada', -5);

  // 7. Señal de alta conversión: Comprobante de pago o Plan Separe (+20)
  const hasReceipt = cf.has_pending_receipt === true;
  const isSepare =
    cf.is_separe === true ||
    (cf.deposit_paid && Number(cf.deposit_paid) > 0) ||
    cf.order?.is_separe === true;
  if (hasReceipt || isSepare) {
    add('receipt_or_deposit', hasReceipt ? 'Comprobante de pago enviado' : 'Abono / Plan Separe acordado', 20);
  }

  // 8. Señales explícitas de intención de compra (+12)
  const hasPaymentInquiry = cf.requested_payment_info === true;
  const hasShippingQuote = cf.requested_shipping_quote === true || Boolean(cf.shipping_data?.destination_city);
  const hasStockVerified = cf.verified_availability === true;
  if (hasPaymentInquiry || hasShippingQuote || hasStockVerified) {
    const label = hasPaymentInquiry
      ? 'Pidió cuentas de pago / contraentrega'
      : hasShippingQuote
      ? 'Cotizó flete / ciudad de envío'
      : 'Verificó stock / disponibilidad';
    add('buying_intent', label, 12);
  }

  // 9. Cotización formal activa o deal_value definido (+8)
  const val = Number(signals.dealValue || cf.order?.total || cf.active_quote_value || 0);
  if (val > 0) {
    add('quoted_value', `Cotización definida ($${val.toLocaleString('es-CO')})`, 8);
  }

  // 10. Urgencia inmediata (+6)
  const urgencyStr = String(cf.urgency || '').toLowerCase();
  if (
    urgencyStr.includes('inmediata') ||
    urgencyStr.includes('hoy') ||
    urgencyStr.includes('48h') ||
    urgencyStr.includes('urgente') ||
    urgencyStr.includes('semana')
  ) {
    add('high_urgency', 'Urgencia alta de compra', 6);
  }

  // 11. Tomador de decisión directo (+4)
  const dmStr = String(cf.decision_maker || '').toLowerCase();
  if (dmStr.includes('directo') || cf.decision_maker === true) {
    add('decision_maker', 'Tomador de decisión directo', 4);
  }

  // 12. Poder adquisitivo confirmado (+4)
  if (cf.purchasing_power === 'premium' || cf.purchasing_power === 'estandar') {
    add('purchasing_power', 'Poder adquisitivo confirmado', 4);
  }

  // 13. Respuesta a campaña comercial (+8)
  if (cf.replied_to_campaign === true || cf.campaign_replied_at) {
    add('campaign_reply', 'Respondió a campaña comercial', 8);
  }

  const raw = breakdown.reduce((acc, f) => acc + f.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const recommendedAction = resolveRecommendedCommercialAction({
    score,
    stage,
    customFields: cf,
    dealValue: signals.dealValue,
  });
  return { score, breakdown, recommendedAction };
}

export function resolveRecommendedCommercialAction(params: {
  score: number;
  stage?: string | null;
  customFields?: Record<string, any> | null;
  dealValue?: number | null;
}): RecommendedCommercialAction {
  const { score, stage, customFields } = params;
  const cf = customFields || {};

  if (stage === 'ganado') {
    return {
      actionKey: 'post_sale_service',
      label: 'Post-venta: Agradecer y fidelizar',
      urgency: 'low',
      playbookTip:
        'Venta cerrada. Confirma satisfacción, comparte guía de envío si aplica y deja la puerta abierta para recompra.',
    };
  }

  const hasReceipt = cf.has_pending_receipt === true;
  const isSepare = cf.is_separe === true || (cf.deposit_paid && Number(cf.deposit_paid) > 0);

  if (hasReceipt || isSepare || score >= 80) {
    return {
      actionKey: 'confirm_closing_and_receipt',
      label: 'Cierre inmediato: Confirmar comprobante o pedir datos de envío',
      urgency: 'immediate',
      playbookTip:
        'El cliente está en la meta. No des rodeos ni agregues preguntas abiertas: confirma el comprobante, o solicita nombre, cédula, dirección y ciudad para despachar.',
    };
  }

  const hasPaymentInquiry = cf.requested_payment_info === true;
  const hasShippingQuote = cf.requested_shipping_quote === true || Boolean(cf.shipping_data?.destination_city);

  if (
    score >= 60 ||
    hasPaymentInquiry ||
    hasShippingQuote ||
    resolveLeadTemperature(cf) === 'qualified_doubt'
  ) {
    return {
      actionKey: 'offer_payment_or_separe',
      label: 'Cierre asistido: Ofrecer cuentas de pago o Plan Separe',
      urgency: 'high',
      playbookTip:
        'El cliente está altamente interesado pero necesita un empuje fácil: presenta Bancolombia/Nequi/Daviplata o pago contraentrega, o sugiérele apartar su cupo con un abono mínimo.',
    };
  }

  if (score >= 40 || resolveProductInterest(cf, params.dealValue)) {
    return {
      actionKey: 'clarify_and_quote',
      label: 'Presentar catálogo, fotos oficiales y disponibilidad',
      urgency: 'medium',
      playbookTip:
        'Envía tarjeta o foto oficial del producto consultado, valida disponibilidad de talla/modelo y menciona que el cupo se reserva por un par de horas.',
    };
  }

  return {
    actionKey: 'qualify_needs',
    label: 'Indagar necesidad o interés comercial',
    urgency: 'medium',
    playbookTip:
      'Pregunta qué modelo busca, para quién es o qué necesidad prioritaria desea resolver antes de enviar tarifas o cotizaciones frías.',
  };
}

export type LeadScoreBand = 'very_high' | 'high' | 'medium' | 'low';

export function getLeadScoreBand(score: number | null | undefined): LeadScoreBand | null {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  if (score >= 75) return 'very_high';
  if (score >= 55) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

export const LEAD_SCORE_BAND_META: Record<LeadScoreBand, { label: string; className: string }> = {
  very_high: { label: 'Muy alta', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  high: { label: 'Alta', className: 'bg-lime-100 text-lime-800 border-lime-300' },
  medium: { label: 'Media', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  low: { label: 'Baja', className: 'bg-slate-100 text-slate-600 border-slate-300' },
};
