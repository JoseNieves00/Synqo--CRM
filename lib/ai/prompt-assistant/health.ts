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
