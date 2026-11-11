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

export interface LeadScoreResult {
  score: number | null;
  breakdown: LeadScoreFactor[];
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

  const raw = breakdown.reduce((acc, f) => acc + f.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { score, breakdown };
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
