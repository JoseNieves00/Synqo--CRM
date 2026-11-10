import type { IndustryPreset } from '@/lib/ai/prompt-compiler';
import { PROMPT_ASSISTANT_CONFIG } from '@/lib/ai/config';
import { PROMPT_BLUEPRINT_SLOTS } from './blueprint';
import { isSlotApplicable, type PromptAssistantState } from './state';
import { estimatePromptTokens, splitGalleryTail } from './versions';

export type HealthActionTarget = 'assistant' | 'gallery' | 'follow_up' | 'gaps' | 'sandbox' | 'payments';

export interface PromptHealthCheckItem {
  id: string;
  label: string;
  status: 'ok' | 'warning' | 'missing';
  detail: string;
  actionTarget?: HealthActionTarget;
  actionLabel?: string;
}

export interface PromptHealthReport {
  completenessPct: number;
  missingRequiredLabels: string[];
  estimatedPromptTokens: number;
  targetPromptTokens: number;
  galleryWithoutPriceCount: number;
  pendingGapsCount: number;
  followUpEnabled: boolean;
  sandboxTested: boolean;
  checks: PromptHealthCheckItem[];
}

export function evaluatePromptHealth(params: {
  prompt: string;
  state: PromptAssistantState;
  preset?: IndustryPreset;
  gallery?: Array<{ name?: string; price?: string }>;
  paymentAccounts?: Array<{ label?: string; bank?: string; provider?: string; account_number?: string }>;
  businessHours?: { enabled?: boolean; start?: string; end?: string } | null;
  pendingGapsCount?: number;
  followUpEnabled?: boolean;
  whatsappProvider?: 'meta' | 'evolution' | string;
  hasMetaTemplatesInFollowUp?: boolean;
}): PromptHealthReport {
  const { body } = splitGalleryTail(params.prompt || '');
  const estimatedTokens = estimatePromptTokens(body);
  const targetTokens = PROMPT_ASSISTANT_CONFIG.targetPromptTokens;
  const lowerPrompt = body.toLowerCase();

  const applicableSlots = PROMPT_BLUEPRINT_SLOTS.filter((s) =>
    isSlotApplicable(s, params.state.slots, params.preset)
  );
  const requiredSlots = applicableSlots.filter((s) => s.required);

  // En modo sin slots llenos todavía, estimamos presencia heurística básica por secciones/palabras clave en el prompt
  const slotHasSignal = (slotId: string): boolean => {
    const val = params.state.slots[slotId];
    if (Array.isArray(val) && val.length > 0) return true;
    if (typeof val === 'string' && val.trim().length > 0) return true;
    if (!body.trim()) return false;

    switch (slotId) {
      case 'empresa.resumen':
        return body.length >= 40;
      case 'catalogo.items':
        return /(\$|precio|valor|plan|servicio|producto|##\s*cat[aá]logo)/i.test(lowerPrompt);
      case 'pagos.medios':
        return /(pago|transferencia|tarjeta|efectivo|contraentrega|enlace|abono|##\s*pagos)/i.test(lowerPrompt);
      case 'tono.estilo':
        return /(tono|tute|usted|emoji|cercan|amable|##\s*tono)/i.test(lowerPrompt);
      case 'cierre.datos':
        return /(nombre|tel[eé]fono|direcci[oó]n|ciudad|correo|datos|confirmar|##\s*datos de cierre)/i.test(lowerPrompt);
      case 'relevo.reglas':
        return /(asesor|humano|relevo|reclamo|comprobante|horario|##\s*relevo)/i.test(lowerPrompt);
      case 'envios.cobertura':
        return /(env[ií]o|domicilio|entrega|transportadora|cobertura|presencial|sede|##\s*env[ií]os)/i.test(lowerPrompt);
      case 'politicas.garantia':
        return /(garant[ií]a|cambio|devoluci[oó]n|cancelaci[oó]n|reprogram|pol[ií]tica|##\s*pol[ií]ticas)/i.test(lowerPrompt);
      case 'faq.lista':
        return /(pregunta|frecuente|faq|##\s*preguntas frecuentes)/i.test(lowerPrompt);
      case 'seguimiento.estrategia':
        return /(seguimiento|recontacto|recordatorio|promoci[oó]n|descuento|##\s*seguimiento)/i.test(lowerPrompt);
      case 'adicional.flujo':
      case 'adicional.notas':
        return /(reglas adicionales|regla de flujo|no repetir|ruta de cierre|prohib|nunca|restricci|##\s*reglas adicionales)/i.test(lowerPrompt);
      default:
        return false;
    }
  };

  const filledApplicable = applicableSlots.filter((s) => slotHasSignal(s.id)).length;
  const missingRequired = requiredSlots.filter((s) => !slotHasSignal(s.id)).map((s) => s.label);
  const completenessPct =
    applicableSlots.length > 0 ? Math.round((filledApplicable / applicableSlots.length) * 100) : 0;

  const galleryList = Array.isArray(params.gallery) ? params.gallery : [];
  const galleryWithoutPriceCount = galleryList.filter((g) => !String(g?.price || '').trim()).length;
  const pendingGapsCount = Number(params.pendingGapsCount || 0);
  const followUpEnabled = Boolean(params.followUpEnabled);
  const sandboxTested = Boolean(params.state.sandboxTestedAt);

  const checks: PromptHealthCheckItem[] = [];

  checks.push({
    id: 'required_slots',
    label: 'Información esencial del negocio',
    status: missingRequired.length === 0 ? 'ok' : 'missing',
    detail:
      missingRequired.length === 0
        ? 'Todas las secciones obligatorias están cubiertas.'
        : `Falta completar: ${missingRequired.join(', ')}.`,
    actionTarget: missingRequired.length > 0 ? 'assistant' : undefined,
    actionLabel: missingRequired.length > 0 ? 'Completar ahora' : undefined,
  });

  checks.push({
    id: 'prompt_size',
    label: 'Extensión del prompt por mensaje',
    status: estimatedTokens === 0 ? 'missing' : estimatedTokens <= targetTokens ? 'ok' : 'warning',
    detail:
      estimatedTokens === 0
        ? 'Aún no has redactado las instrucciones de tu empresa.'
        : estimatedTokens <= targetTokens
        ? `~${estimatedTokens} tokens estimados (óptimo ≤ ${targetTokens}).`
        : `~${estimatedTokens} tokens (supera el objetivo de ${targetTokens}). Conviene resumir o mover fotos extra a la Galería.`,
    actionTarget: estimatedTokens > targetTokens ? 'assistant' : undefined,
    actionLabel: estimatedTokens > targetTokens ? 'Optimizar' : undefined,
  });

  checks.push({
    id: 'gallery_prices',
    label: 'Precios en galería visual',
    status: galleryWithoutPriceCount === 0 ? 'ok' : 'warning',
    detail:
      galleryWithoutPriceCount === 0
        ? galleryList.length > 0
          ? `${galleryList.length} fotos con precio verificado.`
          : 'Sin fotos cargadas en galería todavía.'
        : `${galleryWithoutPriceCount} foto(s) de tu galería no tienen precio cargado.`,
    actionTarget: galleryWithoutPriceCount > 0 ? 'gallery' : undefined,
    actionLabel: galleryWithoutPriceCount > 0 ? 'Revisar galería' : undefined,
  });

  checks.push({
    id: 'knowledge_gaps',
    label: 'Vacíos de conocimiento detectados',
    status: pendingGapsCount === 0 ? 'ok' : 'warning',
    detail:
      pendingGapsCount === 0
        ? 'Sin preguntas sin respuesta pendientes.'
        : `Tienes ${pendingGapsCount} duda(s) que la IA no supo responder a clientes.`,
    actionTarget: pendingGapsCount > 0 ? 'gaps' : undefined,
    actionLabel: pendingGapsCount > 0 ? 'Resolver vacíos' : undefined,
  });

  const metaNeedsTplWarn = params.whatsappProvider === 'meta' && followUpEnabled && !params.hasMetaTemplatesInFollowUp;
  checks.push({
    id: 'follow_up',
    label: 'Seguimientos automáticos',
    status: metaNeedsTplWarn ? 'warning' : followUpEnabled ? 'ok' : 'warning',
    detail: metaNeedsTplWarn
      ? 'Activos en Meta, pero faltan plantillas aprobadas para envíos fuera de 24h.'
      : followUpEnabled
      ? 'Secuencias activadas.'
      : 'Seguimiento automático por prompt activo; también puedes activar secuencias fijas.',
    actionTarget: !followUpEnabled || metaNeedsTplWarn ? 'follow_up' : undefined,
    actionLabel: !followUpEnabled || metaNeedsTplWarn ? 'Configurar' : undefined,
  });

  checks.push({
    id: 'sandbox',
    label: 'Prueba previa en Sandbox',
    status: sandboxTested ? 'ok' : 'warning',
    detail: sandboxTested
      ? 'Ya validaste las respuestas de tu bot.'
      : 'Prueba 3 preguntas clave antes de atender clientes en vivo.',
    actionTarget: !sandboxTested ? 'sandbox' : undefined,
    actionLabel: !sandboxTested ? 'Probar bot' : undefined,
  });

  // Validación cruzada Prompt <-> Galería (precios consistentes)
  if (galleryList.length > 0 && body.trim()) {
    const bodyLines = body.split('\n');
    const mismatchedNames: string[] = [];
    for (const g of galleryList) {
      const gName = String(g?.name || '').trim();
      const gDigits = String(g?.price || '').replace(/[^0-9]/g, '');
      if (gName.length < 3 || gDigits.length < 3) continue;
      const gLower = gName.toLowerCase();
      const matchingLine = bodyLines.find((l) => l.toLowerCase().includes(gLower));
      if (!matchingLine) continue;
      const linePrices = (matchingLine.match(/\$\s*[0-9]{1,3}(?:[.,][0-9]{3})+|\$\s*[0-9]{4,}/g) || []).map((m) =>
        m.replace(/[^0-9]/g, '')
      );
      if (linePrices.length > 0 && !linePrices.includes(gDigits)) {
        mismatchedNames.push(gName);
      }
    }
    if (mismatchedNames.length > 0) {
      checks.push({
        id: 'gallery_price_sync',
        label: 'Coherencia de precios Prompt vs Galería',
        status: 'warning',
        detail: `Diferencia de precio entre el texto y la foto de: ${mismatchedNames.slice(0, 3).join(', ')}.`,
        actionTarget: 'gallery',
        actionLabel: 'Revisar precios',
      });
    }
  }

  // Validación cruzada Prompt <-> Cuentas de Pago configuradas
  const payAccounts = Array.isArray(params.paymentAccounts) ? params.paymentAccounts : [];
  if (payAccounts.length > 0 && body.trim()) {
    const missingInPrompt = payAccounts
      .map((a) => String(a?.bank || a?.provider || a?.label || '').trim())
      .filter((name) => name.length >= 3 && !lowerPrompt.includes(name.toLowerCase()));
    if (missingInPrompt.length > 0) {
      checks.push({
        id: 'payments_sync',
        label: 'Sincronía con tus cuentas de pago',
        status: 'warning',
        detail: `Tienes cuenta(s) en Pagos (${missingInPrompt.slice(0, 2).join(', ')}) no mencionadas en el texto del prompt.`,
        actionTarget: 'payments',
        actionLabel: 'Ver Pagos',
      });
    }
  }

  // Validación cruzada Horarios <-> Prompt
  if (params.businessHours?.enabled && params.businessHours.start && params.businessHours.end && body.trim()) {
    const hasHoursText = /(horario|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|a\.m\.|p\.m\.|\d{1,2}:\d{2})/i.test(lowerPrompt);
    if (!hasHoursText) {
      checks.push({
        id: 'hours_sync',
        label: 'Horario de atención en el prompt',
        status: 'warning',
        detail: `Tienes horario configurado (${params.businessHours.start}–${params.businessHours.end}) pero no está escrito para que el cliente lo conozca.`,
        actionTarget: 'assistant',
        actionLabel: 'Agregar horario',
      });
    }
  }

  return {
    completenessPct,
    missingRequiredLabels: missingRequired,
    estimatedPromptTokens: estimatedTokens,
    targetPromptTokens: targetTokens,
    galleryWithoutPriceCount,
    pendingGapsCount,
    followUpEnabled,
    sandboxTested,
    checks,
  };
}
