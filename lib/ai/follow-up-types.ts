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
  /** Recontactar primero a los contactos con mayor score de propensión de compra. */
  prioritizeByScore?: boolean;
  /** Score mínimo (0-100) para recibir recontacto autónomo. No aplica a post-pedido. */
  minLeadScore?: number;
  sequences: Record<FollowUpCategory, FollowUpSequenceConfig>;
}

export const DEFAULT_MIN_LEAD_SCORE = 25;

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
    prioritizeByScore: true,
    minLeadScore: DEFAULT_MIN_LEAD_SCORE,
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
    prioritizeByScore: raw.prioritizeByScore !== false,
    minLeadScore:
      raw.minLeadScore !== undefined && raw.minLeadScore !== null && Number.isFinite(Number(raw.minLeadScore))
        ? Math.max(0, Math.min(100, Math.round(Number(raw.minLeadScore))))
        : DEFAULT_MIN_LEAD_SCORE,
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
  painPoint?: string | null;
  purchasingPower?: 'economico' | 'estandar' | 'premium' | null;
  objection?: string | null;
  lostReason?: string | null;
  daysInactive?: number;
  followUpSettings?: FollowUpSettingsConfig | null;
  businessHours?: any;
  timezone?: string;
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
  if (params.painPoint?.trim()) {
    const cleanPain = params.painPoint.trim().slice(0, 300);
    cf.pain_point = cleanPain;
    cf.ai_summary = {
      ...(cf.ai_summary || {}),
      pain_point: cleanPain,
    };
  }
  if (params.purchasingPower) {
    cf.purchasing_power = params.purchasingPower;
    cf.ai_summary = {
      ...(cf.ai_summary || {}),
      purchasing_power: params.purchasingPower,
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
        const rawDate = new Date(Date.now() + Math.max(1, step.delayValue) * unitMs);
        nextFu.nextSendAt = clampToSafeBusinessHours(rawDate, params.businessHours, params.timezone).toISOString();
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
 * Extrae y valida un primer nombre de pila auténtico a partir de nombres o pushNames de WhatsApp.
 * Evita saludos robóticos como "¡Hola Dios!" o "¡Hola Life!" filtrando:
 * - Teléfonos o identificadores numéricos.
 * - Textos genéricos: "lead whatsapp", "usuario", "sin nombre", etc.
 * - Frases religiosas: "Dios es mi pastor", "Dios es amor", "Hija del Rey", "Salmo 91", "Jesús", etc.
 * - Frases en inglés o títulos: "Life goes on", "Stay humble", etc.
 * - Apodos, emojis puros o saludos: "🌵", "Esqueleto", "Hola", "Robotina", "Te extraño...", etc.
 * - Decora caracteres unicode especiales (ej: 𝑨𝒏𝒅𝒓𝒆𝒂 -> Andrea, 🄴🄼🄼🄰 -> Emma).
 * Retorna el nombre si es un antropónimo válido, o "" si no parece un nombre de persona real.
 */
export function extractGenuineFirstName(rawName?: string | null): string {
  if (!rawName) return '';
  // 1. Normalizar estilos decorativos (𝑨𝒏𝒅𝒓𝒆𝒂 -> Andrea, 🄴🄼🄼🄰 -> EMMA) preservando tildes y caracteres hispanos
  let s = rawName.normalize('NFKC');
  // 2. Quitar emojis, símbolos, puntuación y caracteres de formato (ZWJ, variation selectors)
  s = s.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Symbol}\p{Punctuation}\uFE00-\uFE0F\u200D\u200B\u200C]/gu, ' ');
  s = s.trim().replace(/\s+/g, ' ');
  if (!s) return '';

  // 3. Descartar si es solo número o teléfono
  if (/^[+0-9\s()-]+$/.test(s)) return '';

  const lower = s.toLowerCase();

  // 4. Blacklist de frases religiosas, saludos, apodos no-nombres o frases comunes
  const invalidPhrases = [
    'dios', 'jesus', 'jesucristo', 'cristo', 'señor', 'senor', 'pastor', 'salmo', 'biblia',
    'hija de', 'hijo de', 'rey de', 'vida mia', 'vida mía', 'te extrano', 'te extraño',
    'hola', 'buenas', 'buenos', 'cliente', 'usuario', 'lead', 'sin nombre',
    'esqueleto', 'robotina', 'life goes', 'stay', 'family', 'tienda', 'ventas',
    'asesor', 'soporte', 'servicio', 'contacto', 'jym'
  ];

  for (const phrase of invalidPhrases) {
    if (lower.startsWith(phrase) || lower.includes(phrase)) {
      return '';
    }
  }

  // 5. Tomar primera palabra
  const firstWord = s.split(' ')[0].trim();
  if (firstWord.length < 2 || firstWord.length > 20) return '';
  if (!/[aeiouáéíóúy]/i.test(firstWord)) return '';

  // 6. Capitalizar: primera letra mayúscula, resto minúsculas
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
}

/**
 * Interpola variables {nombre}, {primer_nombre}, {producto}, {empresa} sanitizando teléfonos y nombres no genuinos.
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
  const firstName = extractGenuineFirstName(rawName);
  const fullName = firstName ? rawName : '';

  let res = template || '';

  if (!firstName) {
    // Si no es un nombre real (ej: "Dios es amor", "🌵", "Life Goes On"),
    // convertimos limpiamente "¡Hola {primer_nombre}!" en "¡Hola!" sin sonar robóticos
    res = res
      .replace(/¡?Hola\s+\{\{?\s*(primer[\s_-]+nombre|primerNombre|primer_nombre|nombre)\s*\}?\}!?/gi, '¡Hola!')
      .replace(/Hola\s+\{\{?\s*(primer[\s_-]+nombre|primerNombre|primer_nombre|nombre)\s*\}?\},?/gi, 'Hola,')
      .replace(/\{\{?\s*(primer[\s_-]+nombre|primerNombre|primer_nombre|nombre)\s*\}?\}/gi, '');
  } else {
    res = res
      .replace(/\{\{?\s*(primer[\s_-]+nombre|primerNombre|primer_nombre)\s*\}?\}/gi, firstName)
      .replace(/\{\{?\s*nombre\s*\}?\}/gi, firstName || fullName);
  }

  return res
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

/**
 * Ajusta cualquier fecha programada (nextSendAt o scheduled_for) para que caiga
 * estrictamente dentro de un horario comercial seguro y prudente, evitando cualquier
 * riesgo de ser reportado por spam por enviar mensajes en noches, madrugadas o domingos.
 *
 * Reglas:
 * - Días hábiles permitidos: Lunes a Sábado (Domingo prohibido).
 * - Ventana segura por defecto: 09:15 a 18:00 (o el horario configurado en businessHours).
 * - Si cae después del cierre (ej: 21:55) -> se rueda al siguiente día hábil a las 09:30 AM.
 * - Si cae en Domingo -> se rueda al Lunes a las 09:30 AM.
 * - Si cae en la madrugada (ej: 05:45 AM) -> se rueda a las 09:15 AM de ese mismo día hábil.
 */
export function clampToSafeBusinessHours(
  targetDate: Date | string,
  businessHours?: any,
  timeZone: string = 'America/Bogota'
): Date {
  const tz = timeZone || 'America/Bogota';
  const rawDate = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
  const initial = isNaN(rawDate.getTime()) ? new Date() : rawDate;

  const getParts = (d: Date) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour12: false,
    }).formatToParts(d);

    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    const hh = Number(get('hour') ?? '12');
    const mm = Number(get('minute') ?? '0');
    const weekdayStr = get('weekday') || 'Mon';
    const year = Number(get('year') ?? '2026');
    const month = Number(get('month') ?? '11');
    const day = Number(get('day') ?? '17');

    const weekdayToIso: Record<string, number> = {
      Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
    };
    const weekdayToKey: Record<string, string> = {
      Sun: 'sunday', Mon: 'monday', Tue: 'tuesday', Wed: 'wednesday', Thu: 'thursday', Fri: 'friday', Sat: 'saturday',
    };

    return {
      hh: hh === 24 ? 0 : hh,
      mm,
      weekdayStr,
      isoDay: weekdayToIso[weekdayStr] || 1,
      dayKey: weekdayToKey[weekdayStr] || 'monday',
      year,
      month,
      day,
    };
  };

  const constructTzDate = (year: number, month: number, day: number, hour: number, minute: number): Date => {
    const yStr = String(year).padStart(4, '0');
    const mStr = String(month).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    const hStr = String(hour).padStart(2, '0');
    const minStr = String(minute).padStart(2, '0');
    const targetIso = `${yStr}-${mStr}-${dStr}T${hStr}:${minStr}:00`;

    const temp = new Date(targetIso + 'Z');
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(temp);
    const offsetStr = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT-5';
    const match = offsetStr.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/i);
    let sign = '-';
    let hOffset = 5;
    let mOffset = 0;
    if (match) {
      sign = match[1].startsWith('+') ? '+' : '-';
      hOffset = Math.abs(parseInt(match[1], 10));
      mOffset = match[2] ? parseInt(match[2], 10) : 0;
    }
    const offsetSign = sign === '+' ? -1 : 1;
    const utcMs = Date.UTC(year, month - 1, day, hour, minute) + offsetSign * (hOffset * 3600000 + mOffset * 60000);
    return new Date(utcMs);
  };

  let current = new Date(initial);

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const p = getParts(current);
    let isDayAllowed = p.isoDay !== 7; // Domingo prohibido por defecto
    let startHour = 9;
    let startMinute = 15;
    let endHour = 18; // 6:00 PM máximo
    let endMinute = 0;

    if (businessHours?.enabled) {
      if (businessHours.schedule && businessHours.schedule[p.dayKey]) {
        const dayCfg = businessHours.schedule[p.dayKey];
        if (dayCfg?.active === false) {
          isDayAllowed = false;
        } else {
          const s = (dayCfg.start || '09:00').split(':').map(Number);
          const e = (dayCfg.end || '18:00').split(':').map(Number);
          startHour = s[0] || 9;
          startMinute = s[1] || 0;
          endHour = e[0] || 18;
          endMinute = e[1] || 0;
        }
      } else {
        const daysAllowed: number[] = Array.isArray(businessHours.days) ? businessHours.days : [1, 2, 3, 4, 5, 6];
        isDayAllowed = daysAllowed.includes(p.isoDay);
        const s = (businessHours.start || '09:00').split(':').map(Number);
        const e = (businessHours.end || '18:00').split(':').map(Number);
        startHour = s[0] || 9;
        startMinute = s[1] || 0;
        endHour = e[0] || 18;
        endMinute = e[1] || 0;
      }
    }

    if (isDayAllowed) {
      const currentHHMM = p.hh * 60 + p.mm;
      const startHHMM = startHour * 60 + startMinute;
      const endHHMM = endHour * 60 + endMinute;

      // Si cae antes de la apertura (ej: 06:00 AM) -> programar para la apertura
      if (currentHHMM < startHHMM) {
        return constructTzDate(p.year, p.month, p.day, startHour, startMinute);
      }

      // Si cae dentro de la ventana comercial permitida -> mantener
      if (currentHHMM <= endHHMM) {
        return current;
      }
    }

    // Rodar al día siguiente a las 09:30 AM
    current = constructTzDate(p.year, p.month, p.day + 1, startHour, Math.max(startMinute, 30));
  }

  return current;
}

/**
 * Detecta si el mensaje del cliente contiene un rechazo explícito o despedida definitiva
 * (p. ej. "no me interesa", "chao no me inporta", "no quiero", "no insistas", "dejemos así")
 * para mover el chat a Perdido / Cerrado sin insistir, evitando falsos positivos ante aplazamientos.
 */
export function isExplicitRejectionSignal(text: string): boolean {
  const normalized = String(text || '').trim().toLowerCase();
  if (!normalized) return false;
  if (/(lo pienso|luego te aviso|despu[eé]s te confirmo|te aviso|consulto con|m[aá]s tarde|otra ocasi[oó]n)/i.test(normalized)) {
    return false;
  }
  const explicitRejectionPattern =
    /(no me interesa|no me i[mn]porta|ya no (?:me interesa|quiero)|no quiero(?:\s+(?:continuar|seguir|comprar|nada|m[aá]s))?\b|no deseo continuar|no insistas?|dejemos\s+as[ií]|ya compr[eé] en otro|olv[ií]dalo|fuera de mi presupuesto|no gracias)/i;
  const dismissiveGoodbyePattern =
    /(?:^|\b)(?:chao|adi[oó]s|bye)\b.*\b(?:no me i[mn]porta|no me interesa|no quiero|dejemos|olv[ií]dalo)\b|\b(?:no me i[mn]porta|no me interesa|no quiero)\b.*\b(?:chao|adi[oó]s|bye)\b/i;
  return explicitRejectionPattern.test(normalized) || dismissiveGoodbyePattern.test(normalized);
}


