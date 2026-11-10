/**
 * Tipos compartidos y utilidades de formato para Categorización de Leads,
 * Secuencias de Seguimiento por Embudo y Recordatorios Agendados.
 */

export type LeadTemperature = 'hot' | 'qualified_doubt' | 'warm' | 'cold';

export type FollowUpCategory =
  | 'hot_unclosed'
  | 'qualified_doubt'
  | 'warm'
  | 'unresponsive'
  | 'post_order';

export const LEAD_TEMPERATURE_ORDER: LeadTemperature[] = [
  'hot',
  'qualified_doubt',
  'warm',
  'cold',
];

export const LEAD_TEMPERATURE_META: Record<
  LeadTemperature,
  {
    label: string;
    shortLabel: string;
    badge: string;
    description: string;
    dotClass: string;
    pillClass: string;
  }
> = {
  hot: {
    label: 'Calificado · Listo',
    shortLabel: 'Listo',
    badge: '🔥 Listo para cerrar',
    description: 'Quiere comprar, pagar o agendar ya.',
    dotClass: 'bg-rose-500 shadow-xs',
    pillClass:
      'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30',
  },
  qualified_doubt: {
    label: 'Calificado · Con dudas',
    shortLabel: 'Con dudas',
    badge: '🟠 Por confirmar',
    description: 'Calificado con intención clara, pero aún tiene dudas puntuales.',
    dotClass: 'bg-orange-500',
    pillClass:
      'bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/30',
  },
  warm: {
    label: 'Tibio',
    shortLabel: 'Tibio',
    badge: '⚡ Evaluando',
    description: 'Consulta precios o info general y sigue comparando.',
    dotClass: 'bg-amber-500',
    pillClass:
      'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
  },
  cold: {
    label: 'Frío',
    shortLabel: 'Frío',
    badge: '❄️ Sin interés',
    description: 'No interesado, fuera de alcance o descartado.',
    dotClass: 'bg-sky-400',
    pillClass:
      'bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/30',
  },
};

export interface FollowUpStep {
  id: string;
  delayValue: number;
  delayUnit: 'hours' | 'days';
  text: string;
  imageUrls?: string[];
  metaTemplateName?: string;
  metaTemplateParams?: string[];
  metaTemplateLanguage?: string;
}

export interface FollowUpSequenceConfig {
  category: FollowUpCategory;
  enabled: boolean;
  steps: FollowUpStep[];
}

export interface FollowUpSettingsConfig {
  enabled: boolean;
  dailyCap?: number;
  sequences: Record<FollowUpCategory, FollowUpSequenceConfig>;
}

export interface ContactFollowUpState {
  category: FollowUpCategory;
  currentStepIndex: number;
  nextSendAt?: string | null;
  lastSentAt?: string | null;
  completed?: boolean;
  paused?: boolean;
  scheduledReminderId?: string | null;
}

export const FOLLOW_UP_CATEGORY_META: Record<
  FollowUpCategory,
  { label: string; badge: string; description: string }
> = {
  hot_unclosed: {
    label: 'Calificado · Listo para cerrar',
    badge: '🔥 Quiere cerrar',
    description: 'Prospectos listos para comprar, pagar o agendar que aún no confirman el cierre.',
  },
  qualified_doubt: {
    label: 'Calificado · Con dudas',
    badge: '🟠 Con dudas',
    description: 'Prospectos con intención clara que tienen preguntas puntuales antes de confirmar.',
  },
  warm: {
    label: 'Tibio',
    badge: '⚡ Evaluando',
    description: 'Prospectos que consultaron precios o información general y siguen comparando.',
  },
  unresponsive: {
    label: 'Sin respuesta',
    badge: '💬 En silencio',
    description: 'Contactos que dejaron de responder después de recibir información inicial.',
  },
  post_order: {
    label: 'Post-cierre (opcional)',
    badge: '✅ Cliente cerrado',
    description: 'Seguimiento opcional posterior a la compra, cita o servicio para confirmar atención o pedir reseña.',
  },
};

export function createEmptyFollowUpSettings(): FollowUpSettingsConfig {
  return {
    enabled: false,
    dailyCap: 40,
    sequences: {
      hot_unclosed: { category: 'hot_unclosed', enabled: true, steps: [] },
      qualified_doubt: { category: 'qualified_doubt', enabled: true, steps: [] },
      warm: { category: 'warm', enabled: true, steps: [] },
      unresponsive: { category: 'unresponsive', enabled: true, steps: [] },
      post_order: { category: 'post_order', enabled: false, steps: [] },
    },
  };
}

export function normalizeFollowUpSettings(raw: any): FollowUpSettingsConfig {
  const base = createEmptyFollowUpSettings();
  if (!raw || typeof raw !== 'object') return base;

  const categories: FollowUpCategory[] = ['hot_unclosed', 'qualified_doubt', 'warm', 'unresponsive', 'post_order'];
  const sequences = { ...base.sequences };

  for (const cat of categories) {
    const src = raw.sequences?.[cat];
    if (src && typeof src === 'object') {
      sequences[cat] = {
        category: cat,
        enabled: src.enabled !== false,
        steps: Array.isArray(src.steps)
          ? src.steps
              .filter((s: any) => s && typeof s.text === 'string' && s.text.trim().length > 0)
              .map((s: any, idx: number) => ({
                id: String(s.id || `${cat}-step-${idx + 1}`),
                delayValue: Math.max(1, Number(s.delayValue) || 1),
                delayUnit: s.delayUnit === 'days' ? 'days' : 'hours',
                text: String(s.text).trim().slice(0, 1500),
                imageUrls: Array.isArray(s.imageUrls)
                  ? s.imageUrls.filter((u: any) => typeof u === 'string' && /^https?:\/\//i.test(u))
                  : [],
                metaTemplateName: s.metaTemplateName ? String(s.metaTemplateName).trim() : undefined,
                metaTemplateParams: Array.isArray(s.metaTemplateParams)
                  ? s.metaTemplateParams
                      .filter((p: any) => typeof p === 'string' && p.trim().length > 0)
                      .slice(0, 6)
                  : undefined,
                metaTemplateLanguage: s.metaTemplateLanguage ? String(s.metaTemplateLanguage).trim() : undefined,
              }))
          : [],
      };
    }
  }

  return {
    enabled: Boolean(raw.enabled),
    dailyCap: Number(raw.dailyCap) > 0 ? Math.min(500, Math.floor(Number(raw.dailyCap))) : 40,
    sequences,
  };
}

/**
 * Unifica la lectura de temperatura entre la clave canónica `lead_temperature` y la legacy `temperature`.
 */
export function resolveLeadTemperature(customFields?: any): LeadTemperature | null {
  const raw = customFields?.lead_temperature || customFields?.temperature;
  if (raw === 'hot' || raw === 'qualified_doubt' || raw === 'warm' || raw === 'cold') return raw;
  return null;
}

/**
 * Mapea una calificación de 4 niveles y etapa del pipeline a su categoría de secuencia de seguimiento.
 */
export function temperatureToFollowUpCategory(
  temp: LeadTemperature,
  pipelineStage?: string | null
): FollowUpCategory {
  if (pipelineStage === 'ganado') return 'post_order';
  if (temp === 'hot') return 'hot_unclosed';
  if (temp === 'qualified_doubt') return 'qualified_doubt';
  if (temp === 'warm') return 'warm';
  return 'unresponsive';
}

/**
 * Sincroniza de manera uniforme `lead_temperature`, `follow_up` y `pipeline_stage`
 * para mantener coherencia entre IA, edición humana y clasificador automático.
 */
export function buildSynchronizedClassification(params: {
  customFields?: any;
  currentStage?: string | null;
  temperature: LeadTemperature;
  product?: string | null;
  objection?: string | null;
  lostReason?: string | null;
  daysInactive?: number;
  followUpSettings?: FollowUpSettingsConfig | null;
}): {
  customFields: Record<string, any>;
  nextStage: string | null;
  followUpCategory: FollowUpCategory;
  shouldCancelPendingReactivations: boolean;
} {
  const cf: Record<string, any> = {
    ...(params.customFields && typeof params.customFields === 'object' ? params.customFields : {}),
  };
  cf.lead_temperature = params.temperature;
  delete cf.temperature;

  if (params.product?.trim()) {
    const cleanProd = params.product.trim().slice(0, 140);
    cf.product_interest = cleanProd;
    cf.last_quoted_product = cleanProd;
    cf.ai_summary = {
      ...(cf.ai_summary || {}),
      product_of_interest: cleanProd,
      product_interest: cleanProd,
    };
  }
  if (params.objection?.trim()) {
    const cleanObj = params.objection.trim().slice(0, 200);
    cf.last_objection = cleanObj;
    cf.ai_summary = {
      ...(cf.ai_summary || {}),
      objections_doubts: cleanObj,
    };
  }
  if (params.lostReason?.trim()) {
    cf.lost_reason = params.lostReason.trim().slice(0, 140);
  }

  let nextStage: string | null = null;
  const currentStage = params.currentStage || 'nuevo';
  if ((params.temperature === 'hot' || params.temperature === 'qualified_doubt') && currentStage === 'nuevo') {
    nextStage = 'calificado';
  } else if (
    params.temperature === 'cold' &&
    (Boolean(params.lostReason?.trim()) || cf.opted_out === true || (params.daysInactive ?? 0) >= 14) &&
    currentStage !== 'ganado' &&
    currentStage !== 'perdido' &&
    currentStage !== 'cita_agendada'
  ) {
    nextStage = 'perdido';
  }

  const effectiveStage = nextStage || currentStage;
  const followUpCategory = temperatureToFollowUpCategory(params.temperature, effectiveStage);

  const prevFu = cf.follow_up && typeof cf.follow_up === 'object' ? { ...cf.follow_up } : {};
  const isPostOrderLocked = prevFu.category === 'post_order' && effectiveStage === 'ganado';

  if (params.temperature === 'cold') {
    cf.follow_up = {
      ...prevFu,
      category: isPostOrderLocked ? 'post_order' : followUpCategory,
      currentStepIndex: prevFu.currentStepIndex ?? 0,
      paused: true,
    };
    delete cf.follow_up.nextSendAt;
    if (cf.active_reminder?.reminderType === 'reactivation') {
      delete cf.active_reminder;
    }
  } else if (!isPostOrderLocked) {
    const categoryChanged = Boolean(prevFu.category && prevFu.category !== followUpCategory);
    const nextStepIndex = categoryChanged ? 0 : Number(prevFu.currentStepIndex || 0);
    const nextFu: Record<string, any> = {
      ...prevFu,
      category: followUpCategory,
      currentStepIndex: nextStepIndex,
      paused: false,
      ...(categoryChanged ? { completed: false } : {}),
    };

    // Si hay secuencia activa configurada y aún no tiene nextSendAt, calcular próximo envío visible
    if (params.followUpSettings?.enabled && !nextFu.completed) {
      const catSeq = params.followUpSettings.sequences[followUpCategory];
      const step = catSeq?.enabled ? catSeq.steps[nextStepIndex] : undefined;
      if (step && !nextFu.nextSendAt) {
        const unitMs = step.delayUnit === 'days' ? 24 * 3600 * 1000 : 3600 * 1000;
        nextFu.nextSendAt = new Date(Date.now() + Math.max(1, step.delayValue) * unitMs).toISOString();
      }
    }
    cf.follow_up = nextFu;
  }

  return {
    customFields: cf,
    nextStage,
    followUpCategory,
    shouldCancelPendingReactivations: params.temperature === 'cold',
  };
}

/**
 * Unifica la lectura del producto/servicio de interés en todas las vistas y servicios.
 */
export function resolveProductInterest(customFields?: any, dealValue?: number | null): string | null {
  return (
    customFields?.ai_summary?.product_of_interest ||
    customFields?.ai_summary?.product_interest ||
    customFields?.product_of_interest ||
    customFields?.product_interest ||
    customFields?.last_quoted_product ||
    (dealValue ? `Cierre ($${Number(dealValue).toLocaleString('es-CO')})` : null)
  );
}

/**
 * Interpola variables {nombre}, {primer_nombre}, {producto}, {empresa} sanitizando teléfonos como nombre.
 */
export function interpolateFollowUpText(
  template: string,
  params: {
    contactName?: string | null;
    productName?: string | null;
    companyName?: string | null;
  }
): string {
  const rawName = (params.contactName || '').trim();
  const isPhoneOrGeneric =
    !rawName ||
    /^[+0-9\s()-]+$/.test(rawName) ||
    /^(lead whatsapp|lead instagram|usuario instagram|sin nombre)/i.test(rawName);
  const firstName = !isPhoneOrGeneric ? rawName.split(/\s+/)[0] : '';
  const fullName = !isPhoneOrGeneric ? rawName : '';

  return (template || '')
    .replace(/\{\{?\s*primer_nombre\s*\}?\}/gi, firstName)
    .replace(/\{\{?\s*nombre\s*\}?\}/gi, firstName || fullName)
    .replace(/\{\{?\s*producto\s*\}?\}/gi, params.productName?.trim() || 'tu consulta')
    .replace(/\{\{?\s*empresa\s*\}?\}/gi, params.companyName?.trim() || 'nuestro equipo')
    .replace(/¡Hola\s+([!¡?,.:])/gi, '¡Hola$1')
    .replace(/Hola\s+,/gi, 'Hola,')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Construye los `components` del body para Meta Cloud API (`sendTemplateMessage`)
 * interpolando {nombre}, {producto}, {empresa} con valores limpios (nunca vacíos ni teléfonos crudos).
 */
export function buildMetaTemplateBodyComponents(params: {
  templateParams?: string[];
  contactName?: string | null;
  productName?: string | null;
  companyName?: string | null;
}): any[] {
  const list = Array.isArray(params.templateParams) ? params.templateParams : [];
  if (list.length === 0) return [];

  const parameters = list.map((expr) => {
    const val = interpolateFollowUpText(String(expr || '{nombre}'), {
      contactName: params.contactName,
      productName: params.productName,
      companyName: params.companyName,
    });
    return {
      type: 'text',
      text: (val || 'cliente').slice(0, 120),
    };
  });

  return [{ type: 'body', parameters }];
}
