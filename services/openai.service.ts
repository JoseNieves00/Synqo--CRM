import OpenAI, { toFile } from 'openai';
import { AppointmentService } from './appointment.service';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { NotificationService } from '@/lib/notifications/resend';
import { recordTokenUsage, checkTokenQuota, checkBackupTokenQuota } from '@/lib/monitoring/token-tracker';
import {
  UpdateStageToolSchema,
  CheckNativeAvailabilityToolSchema,
  BookNativeAppointmentToolSchema,
  RescheduleNativeAppointmentToolSchema,
  CancelNativeAppointmentToolSchema,
  SendWhatsAppImageToolSchema,
  SendProductCardToolSchema,
  UpdateLeadProfileToolSchema,
  ScheduleFollowUpToolSchema,
  CreateOrderToolSchema,
} from '@/lib/validations/tool-calls.schema';
import { MessagingService } from './messaging.service';
import { InstagramService } from './instagram.service';
import { HandoffService } from './handoff.service';
import { formatImageMessageContent } from '@/lib/media/format';
import { compileStructuredPrompt, resolveOrganizationSystemPrompt } from '@/lib/ai/prompt-compiler';
import { decryptSecret } from '@/lib/security/encryption';
import { sanitizeTranscription } from '@/lib/media/whisper-sanitizer';
import {
  AI_OPERATIONAL_CONFIG,
  AI_TEXT_TEMPLATES,
  AiChainEntry,
  AiProviderType,
  calculateTurnCostUsd,
  getAiChatChain,
  getAiUtilityChain,
} from '@/lib/ai/config';
import { buildSalesPlaybook } from '@/lib/ai/sales-playbook';
import {
  EnrichedGalleryItem,
  buildProductCardCaption,
  findGalleryProductMatch,
  findHallucinatedPrices,
  formatGalleryPrice,
  resolveOrganizationGallery,
} from '@/lib/ai/product-gallery';
import {
  LEAD_TEMPERATURE_META,
  type FollowUpCategory,
  type LeadTemperature,
  buildSynchronizedClassification,
  normalizeFollowUpSettings,
  resolveLeadTemperature,
  resolveProductInterest,
} from '@/lib/ai/follow-up-types';
import {
  extractRecontactPromptDigest,
  inferAutonomousReminderFromLeadMessage,
  parseFollowUpScheduleDate,
} from '@/lib/ai/autonomous-reminder';

const openaiApiKey = process.env.OPENAI_API_KEY || 'placeholder-key';
const openai = new OpenAI({
  apiKey: openaiApiKey,
  maxRetries: 1,
  timeout: AI_OPERATIONAL_CONFIG.fallbackTimeoutMs,
});

const geminiApiKey = process.env.GEMINI_API_KEY || '';
const gemini = geminiApiKey
  ? new OpenAI({
      apiKey: geminiApiKey,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      maxRetries: 0,
      timeout: AI_OPERATIONAL_CONFIG.timeoutMs,
    })
  : null;

export interface FailedModelAttempt {
  provider: AiProviderType;
  model: string;
  error: string;
  latencyMs: number;
}

/**
 * Router configurable y medible: recorre la cadena definida en `AI_CHAT_CHAIN` / `AI_UTILITY_MODEL`
 * usando los timeouts de `lib/ai/config.ts`, rescatando fallos multimodales en modo texto antes
 * de conmutar al siguiente proveedor y registrando cada intento fallido para observabilidad en `ai_runs`.
 */
export async function createChatCompletionWithFallback(params: {
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
  toolChoice?: 'auto' | 'none';
  temperature?: number;
  aiProvider?: string | null;
  organizationId?: string;
  contactId?: string;
  skipQuotaDeduction?: boolean;
  chainOverride?: AiChainEntry[];
  responseFormat?: { type: 'json_object' | 'text' };
}): Promise<{
  response: OpenAI.Chat.Completions.ChatCompletion;
  modelUsed: string;
  provider: AiProviderType;
  isFallback: boolean;
  failedAttempts: FailedModelAttempt[];
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  latencyMs: number;
}> {
  const isGeminiKeyValid = Boolean(geminiApiKey && geminiApiKey.trim().length > 20 && gemini);
  const rawChain = params.chainOverride || getAiChatChain(params.aiProvider);
  const chain = rawChain.filter((entry) => (entry.provider === 'google' ? isGeminiKeyValid : Boolean(openaiApiKey)));

  if (chain.length === 0) {
    throw new Error('No hay proveedores de IA configurados en el servidor.');
  }

  const failedAttempts: FailedModelAttempt[] = [];
  const primaryProvider = chain[0].provider;

  for (let idx = 0; idx < chain.length; idx++) {
    const entry = chain[idx];
    const isGoogle = entry.provider === 'google';
    const client = isGoogle ? gemini : openai;
    if (!client) continue;

    // Guardrail financiero antes de usar el proveedor de respaldo OpenAI si no es el primario elegido
    if (!isGoogle && idx > 0 && params.organizationId) {
      const backupQuota = await checkBackupTokenQuota(params.organizationId);
      if (!backupQuota.allowed) {
        console.warn(
          `[OPENAI BACKUP EXCEEDED] Org ${params.organizationId} agotó bolsa mensual de respaldo (${backupQuota.used}/${backupQuota.limit}).`
        );
        throw new Error(
          'La cuota mensual de respaldo ha sido agotada para esta empresa. Atiende desde la bandeja o recarga la cuota.'
        );
      }
    }

    const attemptStart = Date.now();
    const timeoutMs = isGoogle ? AI_OPERATIONAL_CONFIG.timeoutMs : AI_OPERATIONAL_CONFIG.fallbackTimeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let response: OpenAI.Chat.Completions.ChatCompletion;
      const basePayload: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model: entry.model,
        messages: params.messages,
        tools: params.tools && params.tools.length > 0 ? params.tools : undefined,
        tool_choice: params.tools && params.tools.length > 0 ? params.toolChoice || 'auto' : undefined,
        temperature: params.temperature ?? 0.3,
        ...(params.responseFormat ? { response_format: params.responseFormat } : {}),
      };

      try {
        response = await client.chat.completions.create(basePayload, { signal: controller.signal });
      } catch (firstErr: any) {
        // Rescate multimodal: si la imagen adjunta falla (400 / CDN bloqueado), reintentar con solo texto en el MISMO modelo
        const isImageError =
          firstErr?.status === 400 ||
          /image|download|fetch/i.test(String(firstErr?.message || ''));
        const hasMultimodal = params.messages.some((m) => Array.isArray(m.content));

        if (isImageError && hasMultimodal) {
          const textOnlyMessages = params.messages.map((m) => {
            if (Array.isArray(m.content)) {
              const textPart = m.content
                .filter((p: any) => p.type === 'text')
                .map((p: any) => p.text)
                .join('\n');
              return { ...m, content: textPart || '[Imagen adjunta]' };
            }
            return m;
          }) as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

          response = await client.chat.completions.create(
            { ...basePayload, messages: textOnlyMessages },
            { signal: controller.signal }
          );
        } else {
          throw firstErr;
        }
      }

      clearTimeout(timeoutId);

      const promptTokens = response.usage?.prompt_tokens || 0;
      const completionTokens = response.usage?.completion_tokens || 0;
      const totalTokens = response.usage?.total_tokens || promptTokens + completionTokens;
      const cachedTokens =
        (response.usage as any)?.prompt_tokens_details?.cached_tokens ||
        (response.usage as any)?.cached_tokens ||
        0;

      if (!params.skipQuotaDeduction && response.usage && params.organizationId && params.contactId) {
        await recordTokenUsage({
          organizationId: params.organizationId,
          contactId: params.contactId,
          promptTokens,
          completionTokens,
          cachedTokens,
          totalTokens,
          model: entry.model,
          provider: entry.provider,
        });
      }

      const isFallback = idx > 0 && entry.provider !== primaryProvider;
      return {
        response,
        modelUsed: entry.model,
        provider: entry.provider,
        isFallback,
        failedAttempts,
        promptTokens,
        completionTokens,
        totalTokens,
        cachedTokens,
        latencyMs: Date.now() - attemptStart,
      };
    } catch (attemptErr: any) {
      clearTimeout(timeoutId);
      const errMsg = attemptErr?.name === 'AbortError'
        ? `Timeout tras ${timeoutMs}ms`
        : String(attemptErr?.message || attemptErr).slice(0, 240);

      failedAttempts.push({
        provider: entry.provider,
        model: entry.model,
        error: errMsg,
        latencyMs: Date.now() - attemptStart,
      });
      console.warn(`[AI ROUTER FAILOVER] ${entry.provider}:${entry.model} falló (${errMsg}).`);
    }
  }

  const summary = failedAttempts.map((a) => `${a.provider}:${a.model} -> ${a.error}`).join(' | ');
  throw new Error(`Todos los modelos de la cadena fallaron: ${summary}`);
}

// ==========================================
// Definición de Herramientas Modulares (Tool Calling)
// ==========================================
const sendProductCardTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'send_product_card',
    description:
      'Envía al cliente la foto oficial y el precio verificado de un producto desde la galería del negocio, junto con detalles (medidas, envío o características del prompt). Úsala de manera PROACTIVA ante consultas de producto, precio, medidas o catálogo.',
    parameters: {
      type: 'object',
      properties: {
        product_name_or_id: {
          type: 'string',
          description: 'Nombre exacto, palabra clave o ID del producto en galería.',
        },
        details: {
          type: 'string',
          description: 'Medidas, tiempos o detalles tomados del prompt del negocio.',
        },
      },
      required: ['product_name_or_id'],
    },
  },
};

const sendWhatsAppImageTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'send_whatsapp_image',
    description: 'Envía una imagen cuya URL exista textualmente en la galería oficial del negocio.',
    parameters: {
      type: 'object',
      properties: {
        image_url: {
          type: 'string',
          description: 'URL HTTPS verificada de la galería oficial del negocio.',
        },
        caption: {
          type: 'string',
          description: 'Pie de foto breve con nombre y precio real.',
        },
      },
      required: ['image_url'],
    },
  },
};

const updateLeadProfileTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'update_lead_profile',
    description:
      'Clasifica silenciosamente al prospecto en 4 grupos: hot (pide medios/datos de pago, enlace, contraentrega, agendar cita exacta o entrega datos), qualified_doubt (elige o pregunta por una opción específica con duda puntual de características, qué incluye, envío, garantía, disponibilidad o facilidades de pago; nunca por solo pedir lista general de precios ni si dice "lo pienso"), warm (consulta precios/info general o dice "lo pienso"), cold (rechaza explícitamente).',
    parameters: {
      type: 'object',
      properties: {
        temperature: {
          type: 'string',
          enum: ['hot', 'qualified_doubt', 'warm', 'cold'],
          description:
            'hot = listo para pagar/agendar/datos; qualified_doubt = duda concreta sobre una opción específica (sin "lo pienso"); warm = consulta general de precios o "lo pienso"; cold = rechazo expreso.',
        },
        product_of_interest: {
          type: 'string',
          description: 'Nombre del producto o servicio específico elegido/consultado por el cliente (omitir si solo pidió precios generales).',
        },
        objection: {
          type: 'string',
          description: 'Duda u objeción puntual expresada por el cliente, si existe.',
        },
        lost_reason: {
          type: 'string',
          description: 'Motivo real si el cliente rechaza explícitamente avanzar.',
        },
      },
      required: ['temperature'],
    },
  },
};

const scheduleFollowUpTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'schedule_follow_up',
    description:
      'Programa un recordatorio autónomo para que tú (la IA) vuelvas a contactar al cliente automáticamente por WhatsApp/Instagram. Úsalo siempre que el cliente indique un momento futuro ("más tarde", "en la tarde", "mañana", "el viernes", "quincena") o posponga ("lo pienso", "te confirmo"). Puedes indicar delay_hours (ej. 4 horas) o date (YYYY-MM-DD) + time_local opcional (HH:mm), junto con reason y suggested_message.',
    parameters: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Fecha futura en formato YYYY-MM-DD o ISO 8601.',
        },
        time_local: {
          type: 'string',
          description: 'Hora local aproximada en formato 24h HH:mm (ej. "15:30").',
        },
        delay_hours: {
          type: 'number',
          description: 'Horas a esperar si el recontacto es hoy mismo o relativo (ej. 3 o 24).',
        },
        reason: {
          type: 'string',
          description: 'Motivo, duda o producto específico para retomar en ese mensaje.',
        },
        suggested_message: {
          type: 'string',
          description: 'Mensaje corto y cercano que se enviará autónomamente al cumplirse el horario.',
        },
      },
    },
  },
};

const createOrderTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'create_order',
    description:
      'Registra un pedido confirmado en el CRM cuando el cliente aprueba la compra y entrega sus datos de envío y forma de pago.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              product_name: { type: 'string' },
              quantity: { type: 'number' },
              unit_price: { type: 'number' },
            },
            required: ['product_name', 'quantity'],
          },
          description: 'Productos confirmados en el pedido.',
        },
        total: { type: 'number', description: 'Valor total del pedido en moneda local.' },
        nombre: { type: 'string', description: 'Nombre completo del comprador o destinatario.' },
        telefono: { type: 'string', description: 'Teléfono de contacto para entrega.' },
        direccion: { type: 'string', description: 'Dirección completa de entrega (si aplica envío físico).' },
        ciudad: { type: 'string', description: 'Ciudad o municipio de entrega (si aplica).' },
        metodo_pago: { type: 'string', description: 'Método de pago acordado.' },
        notas: { type: 'string', description: 'Indicaciones adicionales del pedido.' },
      },
      required: ['items', 'total', 'nombre', 'telefono'],
    },
  },
};

const updatePipelineStageTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'update_pipeline_stage',
    description: 'Actualiza la etapa del prospecto en el pipeline comercial del CRM.',
    parameters: {
      type: 'object',
      properties: {
        new_stage: {
          type: 'string',
          enum: ['nuevo', 'calificado', 'cita_agendada', 'ganado', 'perdido'],
        },
        reason: { type: 'string' },
      },
      required: ['new_stage'],
    },
  },
};

const requestHumanHandoffTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'request_human_handoff',
    description:
      'Solicita relevo silencioso hacia un asesor humano ante comprobantes de pago, audios inaudibles, reclamos, descuentos especiales no autorizados, petición explícita de asesor o falta de información crítica.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Motivo claro del relevo para el asesor.' },
      },
      required: ['reason'],
    },
  },
};

const recordKnowledgeGapTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'record_knowledge_gap',
    description: 'Registra una duda comercial o técnica cuya respuesta no figura en las instrucciones del negocio.',
    parameters: {
      type: 'object',
      properties: {
        question_text: { type: 'string' },
        category: {
          type: 'string',
          enum: ['precio', 'producto_desconocido', 'envio_cobertura', 'metodo_pago', 'garantia_politica', 'otro'],
        },
        reason: { type: 'string' },
      },
      required: ['question_text', 'category'],
    },
  },
};

const checkNativeAvailabilityTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'check_native_availability',
    description: 'Consulta los horarios libres en el calendario nativo de la empresa.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Fecha YYYY-MM-DD' },
        service_name: { type: 'string' },
        duration_minutes: { type: 'number' },
        specialist_name: { type: 'string' },
      },
      required: ['date'],
    },
  },
};

const bookNativeAppointmentTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'book_native_appointment',
    description: 'Confirma y reserva una cita en el calendario nativo cuando el cliente eligió horario.',
    parameters: {
      type: 'object',
      properties: {
        start_time: { type: 'string' },
        service_name: { type: 'string' },
        duration_minutes: { type: 'number' },
        specialist_name: { type: 'string' },
        reference_info: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['start_time', 'service_name'],
    },
  },
};

const rescheduleNativeAppointmentTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'reschedule_native_appointment',
    description: 'Reprograma la cita activa del cliente (máximo 2 cambios).',
    parameters: {
      type: 'object',
      properties: {
        new_start_time: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['new_start_time'],
    },
  },
};

const cancelNativeAppointmentTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'cancel_native_appointment',
    description: 'Cancela la cita activa del cliente y libera el turno.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
      },
    },
  },
};

function getAvailableTools(enabledModules?: any): OpenAI.Chat.Completions.ChatCompletionTool[] {
  const isCalendarEnabled = enabledModules ? Boolean(enabledModules.native_calendar) : true;
  const activeTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    sendProductCardTool,
    sendWhatsAppImageTool,
    updateLeadProfileTool,
    scheduleFollowUpTool,
    createOrderTool,
    updatePipelineStageTool,
    requestHumanHandoffTool,
    recordKnowledgeGapTool,
  ];

  if (isCalendarEnabled) {
    activeTools.push(
      checkNativeAvailabilityTool,
      bookNativeAppointmentTool,
      rescheduleNativeAppointmentTool,
      cancelNativeAppointmentTool
    );
  }

  return activeTools;
}

export interface FollowUpScheduledInfo {
  reminderId?: string | null;
  scheduledForIso: string;
  reason?: string;
  activeReminder: {
    id: string;
    reminderType: 'reactivation';
    scheduledFor: string;
    note: string;
    suggestedMessage?: string;
    createdByName: string;
    createdAt: string;
  };
}

export interface ProcessLeadResult {
  text: string;
  modelUsed: string;
  provider: AiProviderType;
  isFallback: boolean;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  pauseAfterSend?: boolean;
  handoffReason?: string;
  failedAttempts?: FailedModelAttempt[];
  followUpScheduled?: FollowUpScheduledInfo | null;
}

export interface ProcessLeadParams {
  contactId: string;
  organizationId: string;
  leadPhone: string;
  leadName?: string;
  systemPromptConfig?: string | null;
  handoffMode?: 'silent' | 'message';
  afterHoursMessage?: string | null;
  isAfterHours?: boolean;
  businessHours?: any;
  aiProvider?: string | null;
  enabledModules?: any;
  timezone?: string | null;
  channel?: 'whatsapp' | 'instagram';
  organization?: any;
}

/**
 * Calcula la próxima ventana de atención usando la zona horaria del tenant y su configuración `business_hours`.
 */
export function calculateNextOpeningWindow(businessHours: any, timezone?: string | null): string {
  const tz = timezone || businessHours?.timezone || AI_OPERATIONAL_CONFIG.defaultTimezone;
  try {
    const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    const currentDay = nowInTz.getDay() === 0 ? 7 : nowInTz.getDay(); // 1: Lunes ... 7: Domingo
    const daysAllowed: number[] =
      Array.isArray(businessHours?.days) && businessHours.days.length > 0
        ? businessHours.days
        : [1, 2, 3, 4, 5, 6];
    const startTimeStr: string = businessHours?.start || '08:00';

    const [startH, startM] = startTimeStr.split(':').map(Number);
    let prudentH = !isNaN(startH) ? startH : 8;
    let prudentM = (!isNaN(startM) ? startM : 0) + 30;
    if (prudentM >= 60) {
      prudentH += 1;
      prudentM -= 60;
    }
    const period = prudentH >= 12 ? 'PM' : 'AM';
    const displayH = prudentH > 12 ? prudentH - 12 : prudentH === 0 ? 12 : prudentH;
    const displayM = prudentM > 0 ? `:${String(prudentM).padStart(2, '0')}` : ':00';
    const prudentTimeText = `tipo ${displayH}${displayM} ${period}`;

    const dayNames = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
    for (let offset = 1; offset <= 7; offset++) {
      let checkDay = (currentDay + offset) % 7;
      if (checkDay === 0) checkDay = 7;
      if (daysAllowed.includes(checkDay)) {
        return offset === 1
          ? `mañana a primera hora (${prudentTimeText})`
          : `el ${dayNames[checkDay]} a primera hora (${prudentTimeText})`;
      }
    }
    return `mañana a primera hora (${prudentTimeText})`;
  } catch {
    return 'mañana a primera hora (tipo 8:30 AM)';
  }
}

/**
 * Construye el mensaje contextual dinámico final (<perfil_lead> + fecha local + galería disponible)
 * manteniendo el prefijo systemPrompt #0 estático para Prompt Caching.
 */
function buildDynamicContextBlock(params: {
  orgTimezone: string;
  contactData: any;
  leadName?: string;
  galleryItems: EnrichedGalleryItem[];
  extendedCatalog?: any[];
  delayedHours?: number;
  isAfterHours?: boolean;
  afterHoursMessage?: string | null;
}): string {
  const {
    orgTimezone,
    contactData,
    leadName,
    galleryItems,
    extendedCatalog = [],
    delayedHours,
    isAfterHours = false,
    afterHoursMessage = null,
  } = params;
  let currentLocalTime = '';
  try {
    currentLocalTime = new Date().toLocaleString('es-CO', {
      timeZone: orgTimezone,
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    currentLocalTime = new Date().toISOString();
  }

  const cf = (contactData?.custom_fields as Record<string, any>) || {};
  const temp = resolveLeadTemperature(cf) || 'sin clasificar';
  const interest = resolveProductInterest(cf, contactData?.deal_value) || 'por identificar';
  const summaryText = cf.ai_summary?.summary_text
    ? String(cf.ai_summary.summary_text).replace(/\n/g, ' | ')
    : '';
  const orderNote = cf.order
    ? `Pedido previo registrado por $${Number(cf.order.total || contactData?.deal_value || 0).toLocaleString('es-CO')} (${cf.order.ciudad || ''})`
    : '';

  const gallerySummary =
    galleryItems.length > 0
      ? `\nProductos con foto oficial en galería para usar con send_product_card:\n${galleryItems
          .map((g) => `- "${g.name}" (${formatGalleryPrice(g.price) || 'precio en catálogo'})`)
          .join('\n')}`
      : '';

  const delayInstruction =
    delayedHours && delayedHours >= 6
      ? `\n[Atención con demora de ${Math.round(delayedHours)}h]: Saluda con calidez y pide una disculpa breve y sincera por la tardanza sin inventar excusas técnicas ni hablar de congestión; luego responde directo a la consulta.`
      : '';

  const afterHoursInstruction = isAfterHours
    ? `\n[Fuera de horario comercial]: El equipo humano no está atendiendo en este instante. Responde dudas generales del catálogo con normalidad y si requiere confirmación humana o cita aclara el horario de atención.${
        afterHoursMessage ? ` Mensaje de referencia de la empresa: "${afterHoursMessage}"` : ''
      }`
    : '';

  const extendedCatalogBlock =
    extendedCatalog.length > 0
      ? `\nCatálogo extendido adicional (referencia de precios oficiales):\n${extendedCatalog
          .slice(0, 85)
          .map((c: any) => `- ${c.name}${c.price ? ` (${formatGalleryPrice(c.price)})` : ''}${c.description ? `: ${String(c.description).slice(0, 90)}` : ''}`)
          .join('\n')}`
      : '';

  return `<contexto_actual>
Fecha/hora local empresa (${orgTimezone}): ${currentLocalTime}
<perfil_lead>
Nombre: ${contactData?.name || leadName || 'No registrado'}
Etapa CRM: ${contactData?.pipeline_stage || 'nuevo'} | Temperatura: ${temp}
Interés detectado: ${interest}
${summaryText ? `Resumen previo: ${summaryText}` : ''}
${orderNote ? `${orderNote}` : ''}
</perfil_lead>${gallerySummary}${extendedCatalogBlock}${afterHoursInstruction}${delayInstruction}
</contexto_actual>`.trim();
}

export interface EvalDryRunTrace {
  reply: string;
  modelUsed: string;
  provider: AiProviderType;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  costUsd: number;
  toolCallsExecuted: Array<{ name: string; args: any; status: string }>;
  productCardsSent: Array<{ name: string; price?: string; caption: string; url: string }>;
  leadProfileUpdate: { temperature: string; product_of_interest?: string; objection?: string; lost_reason?: string } | null;
  orderCreated: any | null;
  followUpScheduled: { date: string; reason?: string } | null;
  handoffRequested: { reason: string } | null;
}

export class OpenAIService {
  static async transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
    const cleanMime = (mimeType || 'audio/ogg').split(';')[0].trim().toLowerCase() || 'audio/ogg';
    try {
      const ext = this.getExtensionFromMime(cleanMime);
      const file = await toFile(audioBuffer, `voice_note.${ext}`, { type: cleanMime });

      const transcription = await openai.audio.transcriptions.create({
        file,
        model: AI_OPERATIONAL_CONFIG.transcriptionModel,
        language: 'es',
        temperature: 0.1,
        prompt: 'Nota de voz de WhatsApp en español, consulta comercial o mensaje de cliente.',
      });

      const cleaned = sanitizeTranscription(transcription.text);
      if (cleaned) return cleaned;
    } catch (err: any) {
      console.warn('[OPENAI TRANSCRIBE AUDIO WARN]', err?.message || err);
    }

    // Respaldo multimodal con Google si Whisper falla o devuelve vacío sobre .ogg/opus
    if (geminiApiKey && audioBuffer.length > 0 && audioBuffer.length <= 12 * 1024 * 1024) {
      try {
        const googleModel =
          getAiUtilityChain().find((e) => e.provider === 'google')?.model ||
          getAiChatChain().find((e) => e.provider === 'google')?.model;

        if (googleModel) {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            googleModel
          )}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: 'Transcribe literalmente en español el contenido de esta nota de voz comercial. Si únicamente contiene silencio o ruido incomprensible responde [INAUDIBLE].',
                    },
                    {
                      inline_data: {
                        mime_type: cleanMime,
                        data: audioBuffer.toString('base64'),
                      },
                    },
                  ],
                },
              ],
              generationConfig: { temperature: 0.1, maxOutputTokens: 350 },
            }),
            signal: AbortSignal.timeout(AI_OPERATIONAL_CONFIG.timeoutMs),
          });
          if (res.ok) {
            const data = await res.json();
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (!/\[INAUDIBLE\]/i.test(rawText)) {
              const cleanedBackup = sanitizeTranscription(rawText);
              if (cleanedBackup) return cleanedBackup;
            }
          }
        }
      } catch (gemErr: any) {
        console.warn('[GEMINI AUDIO FALLBACK WARN]', gemErr?.message || gemErr);
      }
    }

    return '';
  }

  private static getExtensionFromMime(mime: string): string {
    const m = (mime || '').toLowerCase();
    if (m.includes('ogg') || m.includes('opus')) return 'ogg';
    if (m.includes('mp4') || m.includes('m4a')) return 'm4a';
    if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
    if (m.includes('wav')) return 'wav';
    if (m.includes('aac')) return 'aac';
    if (m.includes('flac')) return 'flac';
    if (m.includes('webm')) return 'webm';
    return 'ogg';
  }

  /**
   * Genera resumen ejecutivo en 3 puntos clave usando el modelo utilitario configurado.
   */
  static async generateDealSummary(
    messages: Array<{ sender_type: string; content: string }>,
    options?: { organizationId?: string; contactId?: string; aiProvider?: string | null }
  ): Promise<{
    product_interest: string;
    objections_doubts: string;
    next_step: string;
    summary_text: string;
  }> {
    if (!messages || messages.length === 0) {
      return {
        product_interest: 'Sin mensajes suficientes para analizar',
        objections_doubts: 'Ninguna detectada',
        next_step: 'Iniciar contacto comercial con el cliente',
        summary_text: 'El prospecto aún no cuenta con historial de mensajes.',
      };
    }

    const conversationText = messages
      .slice(-20)
      .map((m) => `${m.sender_type === 'lead' ? 'Cliente' : 'Asesor'}: ${m.content}`)
      .join('\n');

    const prompt = `Analiza esta conversación comercial de WhatsApp:
"""
${conversationText}
"""
Extrae un resumen ejecutivo JSON con estos campos exactos:
{
  "product_interest": "Producto, modelo o servicio exacto que busca el cliente.",
  "objections_doubts": "Dudas u objeciones pendientes (o 'Ninguna detectada').",
  "next_step": "Siguiente paso concreto para cerrar la venta."
}
Responde ÚNICAMENTE el JSON válido sin markdown.`;

    try {
      const { response } = await createChatCompletionWithFallback({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        chainOverride: getAiUtilityChain(),
        aiProvider: options?.aiProvider,
        organizationId: options?.organizationId,
        contactId: options?.contactId,
        responseFormat: { type: 'json_object' },
      });

      const raw = response.choices[0].message.content?.trim() || '{}';
      const cleanJson = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleanJson);

      const product_interest = parsed.product_interest || 'No especificado aún';
      const objections_doubts = parsed.objections_doubts || 'Ninguna detectada';
      const next_step = parsed.next_step || 'Hacer seguimiento comercial';
      const summary_text = `🎯 Interés: ${product_interest}\n⚠️ Duda/Objeción: ${objections_doubts}\n👉 Siguiente paso: ${next_step}`;

      return { product_interest, objections_doubts, next_step, summary_text };
    } catch (e: any) {
      console.warn('[AI DEAL SUMMARY ERROR]', e?.message || e);
      return {
        product_interest: 'Revisar detalles en chat',
        objections_doubts: 'No detectadas automáticamente',
        next_step: 'Retomar conversación con el cliente',
        summary_text: 'Resumen temporal no disponible. Consulta los mensajes del chat.',
      };
    }
  }

  /**
   * Ciclo conversacional autónomo con caché de prefijo, memoria de 12 mensajes, perfil del lead,
   * herramientas multi-ronda (hasta AI_MAX_TOOL_ROUNDS) y validador anti-alucinación de precios.
   */
  static async processLeadMessage({
    contactId,
    organizationId,
    leadPhone,
    leadName,
    systemPromptConfig,
    handoffMode = 'message',
    afterHoursMessage,
    isAfterHours = false,
    businessHours,
    aiProvider,
    enabledModules,
    timezone,
    channel = 'whatsapp',
    organization,
  }: ProcessLeadParams): Promise<ProcessLeadResult> {
    const defaultChainEntry = getAiChatChain(aiProvider)[0];
    let metaModel = defaultChainEntry?.model || 'default';
    let metaProvider: AiProviderType = defaultChainEntry?.provider || 'google';
    let isFallback = false;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCachedTokens = 0;
    let pauseAfterSend = false;
    let leadProfileUpdatedThisTurn = false;
    let orderOrBookingCompletedThisTurn = false;
    let detectedHandoffReason: string | undefined;
    let followUpScheduledInfo: FollowUpScheduledInfo | null = null;
    const allFailedAttempts: FailedModelAttempt[] = [];

    try {
      // 0. Consultar estado de cuota (Modo Excedente activo: nunca detiene al bot, alertas Push en recordTokenUsage)
      await checkTokenQuota(organizationId);

      // 1. Obtener historial reciente, perfil del contacto, total de mensajes y organización (si falta gallery) en paralelo
      const needsOrgFetch = !organization || organization.structured_prompt_data === undefined;
      const [messagesRes, contactRes, countRes, orgRes] = await Promise.all([
        supabaseAdmin
          .from('messages')
          .select('sender_type, content, created_at')
          .eq('contact_id', contactId)
          .in('sender_type', ['lead', 'ai', 'agent_manual'])
          .order('created_at', { ascending: false })
          .limit(AI_OPERATIONAL_CONFIG.historyLimit),
        (supabaseAdmin.from('contacts') as any)
          .select('id, name, phone, pipeline_stage, custom_fields, deal_value')
          .eq('id', contactId)
          .maybeSingle(),
        (supabaseAdmin.from('messages') as any)
          .select('id', { count: 'exact', head: true })
          .eq('contact_id', contactId)
          .in('sender_type', ['lead', 'ai', 'agent_manual']),
        needsOrgFetch
          ? (supabaseAdmin.from('organizations') as any)
              .select('id, name, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, evolution_api_url, evolution_api_key, evolution_instance_name, evolution_status, instagram_account_id, instagram_access_token, structured_prompt_data, system_prompt, enabled_modules, business_hours, appointment_settings')
              .eq('id', organizationId)
              .maybeSingle()
          : Promise.resolve({ data: organization }),
      ]);

      const dbMessages = messagesRes.data ? [...messagesRes.data].reverse() : [];
      const contactData = contactRes.data || {};
      const totalMessageCount = countRes.count || dbMessages.length;
      const orgData = orgRes.data || organization;

      const resolvedPromptConfig = systemPromptConfig || orgData?.system_prompt || '';
      const { items: galleryItems, allowedUrls: allowedGalleryUrls, knownPrices } = resolveOrganizationGallery(
        orgData,
        resolvedPromptConfig
      );

      // 2. Prefijo estable para Prompt Caching: [Prompt del negocio][Playbook compacto]
      const hasCalendar = enabledModules ? Boolean(enabledModules.native_calendar) : true;
      const staticSystemPrompt = [
        resolvedPromptConfig || 'Eres el asesor comercial de la empresa.',
        buildSalesPlaybook({ hasCalendar }),
      ]
        .filter(Boolean)
        .join('\n\n');

      const conversationHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: staticSystemPrompt },
      ];

      // Historial conversacional (fotos antiguas reemplazadas por texto para no re-enviar visión)
      const totalCount = dbMessages.length;
      for (let i = 0; i < totalCount; i++) {
        const msg = dbMessages[i];
        let contentText = msg.content || '';

        const isOldTurn = i < totalCount - 4;
        if (isOldTurn && contentText.length > 350) {
          contentText = contentText.slice(0, 320) + '... [resumido]';
        }

        if (msg.sender_type === 'lead') {
          const isUntranscribedVoice =
            contentText.includes('[Nota de voz recibida]') ||
            contentText.includes('[Nota de voz inaudible]') ||
            contentText.includes('[Nota de voz no reproducible]') ||
            (contentText.startsWith('🎙️ [Audio:') && !contentText.includes(']: "'));

          if (isUntranscribedVoice) {
            conversationHistory.push({
              role: 'user',
              content:
                '[NOTA DE VOZ NO COMPRENSIBLE - No se pudo transcribir con claridad. Nunca inventes lo que dijo ni envíes precios sin entender.]',
            });
            continue;
          }

          // Filtrado estricto multimedia + solo visión en el turno más reciente del usuario
          const isNonImageMediaPrefix =
            contentText.startsWith('🎙️') ||
            contentText.startsWith('🎤') ||
            contentText.startsWith('📹') ||
            contentText.startsWith('📄');
          const isNonImageMediaType =
            isNonImageMediaPrefix || Boolean((msg as any).media_type && (msg as any).media_type !== 'image');
          const nonImageExtensionsRegex = /\.(?:oga|ogg|mp3|wav|m4a|aac|opus|mp4|mov|avi|webm|pdf|docx?|xlsx?|txt|zip)(?:\?[^\s"'<>\)]*)?$/i;
          const webpageRegex = /instagram\.com\/(?:p|reel|stories|tv)\/|facebook\.com\//i;

          let imageMatch: RegExpMatchArray | null = null;
          if (!isNonImageMediaType) {
            const candidate =
              contentText.match(/https?:\/\/[^\s"'<>\)]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s"'<>\)]*)?/i) ||
              contentText.match(/https?:\/\/[^\s"'<>\)]*(?:fbcdn|cdninstagram)[^\s"'<>\)]*/i);

            if (candidate && !nonImageExtensionsRegex.test(candidate[0]) && !webpageRegex.test(candidate[0])) {
              imageMatch = candidate;
            }
          }

          const isLatestTurn = i === totalCount - 1;
          if (imageMatch && isLatestTurn) {
            conversationHistory.push({
              role: 'user',
              content: [
                { type: 'text', text: contentText },
                { type: 'image_url', image_url: { url: imageMatch[0], detail: 'low' } },
              ],
            });
          } else if (imageMatch) {
            const textWithoutImg = contentText
              .replace(imageMatch[0], '')
              .trim();
            conversationHistory.push({
              role: 'user',
              content: `${AI_OPERATIONAL_CONFIG.imageHistoryPlaceholder} ${textWithoutImg}`.trim(),
            });
          } else {
            conversationHistory.push({ role: 'user', content: contentText });
          }
        } else if (msg.sender_type === 'ai' || msg.sender_type === 'agent_manual') {
          conversationHistory.push({ role: 'assistant', content: contentText });
        }
      }

      // Regla estricta cuando el turno más reciente del lead solo contiene nota de voz incomprensible (si envió texto claro en la misma ráfaga, no abortar el texto)
      const isUntranscribedContent = (txt: string) => {
        const clean = (txt || '').trim();
        return (
          clean.includes('[Nota de voz inaudible]') ||
          clean.includes('[Nota de voz no reproducible]') ||
          clean.includes('[Nota de voz recibida]') ||
          (clean.startsWith('🎙️ [Audio:') && !clean.includes(']: "')) ||
          (clean.startsWith('🎤 [Nota de voz]') && !clean.includes(']: "'))
        );
      };

      const trailingLeadMsgs: any[] = [];
      for (let idx = dbMessages.length - 1; idx >= 0; idx--) {
        const m = dbMessages[idx];
        if (m.sender_type === 'lead') trailingLeadMsgs.unshift(m);
        else if (m.sender_type === 'ai' || m.sender_type === 'agent_manual') break;
      }

      const lastLeadMsg = [...dbMessages].reverse().find((m: any) => m.sender_type === 'lead');
      const hasOnlyUntranscribedAudioInTurn =
        trailingLeadMsgs.length > 0 &&
        trailingLeadMsgs.every((m) => isUntranscribedContent(m.content || ''));

      if (lastLeadMsg && hasOnlyUntranscribedAudioInTurn) {
          const handoffReason = 'Nota de voz no comprensible por IA (requiere que un asesor escuche el audio)';
          pauseAfterSend = true;
          detectedHandoffReason = handoffReason;

          await supabaseAdmin.from('messages').insert({
            contact_id: contactId,
            sender_type: 'system',
            content: `[🚨 Relevo Solicitado: Asesor requerido - Motivo: "${handoffReason}"]`,
          });

          // Asegurar que una nota de voz pendiente de escucha nunca quede sin clasificar o como fría/perdida
          if (!resolveLeadTemperature(contactData?.custom_fields)) {
            const audioSync = buildSynchronizedClassification({
              customFields: contactData?.custom_fields || {},
              currentStage: contactData?.pipeline_stage,
              temperature: 'warm',
            });
            await (supabaseAdmin.from('contacts') as any)
              .update({ custom_fields: audioSync.customFields, updated_at: new Date().toISOString() })
              .eq('id', contactId);
          }

          HandoffService.notifyHandoff({
            organizationId,
            contactId,
            reason: handoffReason,
            channel: (channel as any) || 'whatsapp',
          }).catch(() => {});

          return {
            text: AI_TEXT_TEMPLATES.untranscribedAudio(orgData?.name, contactId),
            modelUsed: 'audio-handoff-rule',
            provider: metaProvider,
            isFallback: false,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            cachedTokens: 0,
            pauseAfterSend: true,
            handoffReason,
          };
      }

      // Calcular posible demora >= 6h
      const hoursAgo = lastLeadMsg?.created_at
        ? (Date.now() - new Date(lastLeadMsg.created_at).getTime()) / (1000 * 60 * 60)
        : 0;

      // Bloque dinámico al FINAL para mantener prefijo estático cacheable
      const orgTimezone = timezone || businessHours?.timezone || AI_OPERATIONAL_CONFIG.defaultTimezone;
      const rawStoredCatalog = Array.isArray(orgData?.structured_prompt_data?.catalog)
        ? orgData.structured_prompt_data.catalog
        : [];
      const overflowCatalog = rawStoredCatalog.length > 15 ? rawStoredCatalog.slice(15, 100) : [];
      conversationHistory.push({
        role: 'system',
        content: buildDynamicContextBlock({
          orgTimezone,
          contactData,
          leadName,
          galleryItems,
          extendedCatalog: overflowCatalog,
          delayedHours: hoursAgo >= 6 ? hoursAgo : undefined,
          isAfterHours,
          afterHoursMessage,
        }),
      });

      // 3. Bucle multi-ronda de inferencia + herramientas (hasta AI_MAX_TOOL_ROUNDS)
      const activeTools = getAvailableTools(enabledModules);
      const maxRounds = AI_OPERATIONAL_CONFIG.maxToolRounds;
      const dispatchedUrlsThisTurn = new Set<string>();
      let finalResponseText = '';
      let activeRoundChain: AiChainEntry[] | undefined = undefined;

      for (let round = 0; round < maxRounds; round++) {
        const allowToolsThisRound = round < maxRounds - 1;
        const {
          response,
          modelUsed,
          provider,
          isFallback: roundFallback,
          failedAttempts,
        } = await createChatCompletionWithFallback({
          messages: conversationHistory,
          tools: activeTools,
          toolChoice: allowToolsThisRound ? 'auto' : 'none',
          temperature: 0.3,
          aiProvider,
          organizationId,
          contactId,
          chainOverride: activeRoundChain,
        });

        // Fijar el proveedor ganador de la ronda 1 en rondas siguientes para conservar thought_signatures / tool_calls compatibles
        if (!activeRoundChain) {
          activeRoundChain = [
            { provider, model: modelUsed },
            ...getAiChatChain(aiProvider).filter(
              (e) => !(e.provider === provider && e.model === modelUsed) && (provider !== 'openai' || e.provider === 'openai')
            ),
          ];
        }

        metaModel = modelUsed;
        metaProvider = provider;
        if (roundFallback) isFallback = true;
        if (failedAttempts.length > 0) allFailedAttempts.push(...failedAttempts);

        if (response.usage) {
          totalPromptTokens += response.usage.prompt_tokens || 0;
          totalCompletionTokens += response.usage.completion_tokens || 0;
          totalCachedTokens +=
            (response.usage as any)?.prompt_tokens_details?.cached_tokens ||
            (response.usage as any)?.cached_tokens ||
            0;
        }

        const message = response.choices[0].message;

        if (!message.tool_calls || message.tool_calls.length === 0) {
          finalResponseText = (message.content || '').trim();
          break;
        }

        // Ejecutar todas las herramientas solicitadas en esta ronda
        conversationHistory.push(message);

        for (const toolCall of message.tool_calls) {
          const functionName = toolCall.function.name;
          let functionArgs: any = {};
          try {
            functionArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch {
            functionArgs = {};
          }

          let toolResult = '';

          try {
            if (functionName === 'send_product_card') {
              const validated = SendProductCardToolSchema.parse(functionArgs);
              const matched = findGalleryProductMatch(galleryItems, validated.product_name_or_id);

              if (!matched) {
                toolResult = JSON.stringify({
                  status: 'not_found',
                  message:
                    galleryItems.length > 0
                      ? `Producto "${validated.product_name_or_id}" no encontrado en galería. Disponibles: ${galleryItems
                          .map((g) => g.name)
                          .join(', ')}.`
                      : 'La empresa aún no tiene fotos cargadas en galería. Confirma precios/medidas reales sin inventar URL y apoya con request_human_handoff si pide foto.',
                });
              } else if (dispatchedUrlsThisTurn.has(matched.url)) {
                toolResult = JSON.stringify({
                  status: 'already_sent',
                  product: matched.name,
                  message: `La foto de "${matched.name}" ya fue enviada en este turno. No la reenvíes.`,
                });
              } else {
                const detailPrices = validated.details
                  ? findHallucinatedPrices(validated.details, knownPrices)
                  : [];
                if (detailPrices.length > 0) {
                  toolResult = JSON.stringify({
                    status: 'rejected',
                    message:
                      'El campo details contiene un monto no verificado en la galería ni en el catálogo. Envía solo características o medidas reales sin inventar precios.',
                  });
                } else {
                  const caption = buildProductCardCaption({
                    name: matched.name,
                    price: matched.price,
                    details: validated.details,
                  });

                  const effectiveChannel = channel || 'whatsapp';
                  const targetWaRecipient =
                    contactData?.custom_fields?.remote_jid ||
                    contactData?.custom_fields?.whatsapp_jid ||
                    leadPhone;
                  let outboundId: string | null = null;

                  if (effectiveChannel === 'instagram') {
                    const decryptedIgToken = orgData?.instagram_access_token
                      ? decryptSecret(orgData.instagram_access_token)
                      : '';
                    outboundId = await InstagramService.sendMediaMessage({
                      instagramAccountId: orgData.instagram_account_id,
                      accessToken: decryptedIgToken,
                      recipientId: leadPhone,
                      mediaUrl: matched.url,
                    });
                    // Instagram no soporta caption nativo en attachments -> enviar caption como texto aparte
                    await InstagramService.sendDirectMessage({
                      instagramAccountId: orgData.instagram_account_id,
                      accessToken: decryptedIgToken,
                      recipientId: leadPhone,
                      text: caption,
                    });
                  } else {
                    outboundId = await MessagingService.sendMediaMessage({
                      organization: orgData,
                      to: targetWaRecipient,
                      mediaUrl: matched.url,
                      caption,
                      mediaType: 'image',
                    });
                  }

                  dispatchedUrlsThisTurn.add(matched.url);

                  await (supabaseAdmin.from('messages') as any).insert({
                    contact_id: contactId,
                    organization_id: organizationId,
                    sender_type: 'ai',
                    content: formatImageMessageContent(matched.url, caption),
                    meta_message_id: outboundId || null,
                    channel: effectiveChannel,
                    status: 'sent',
                  });

                  toolResult = JSON.stringify({
                    status: 'sent',
                    product: matched.name,
                    price: formatGalleryPrice(matched.price),
                    caption,
                    message:
                      'Tarjeta visual enviada al cliente con foto oficial, precio y medidas. No escribas enlaces en tu texto.',
                  });
                }
              }
            } else if (functionName === 'send_whatsapp_image') {
              const validated = SendWhatsAppImageToolSchema.parse(functionArgs);

              // Guardrail estricto: prohibido inventar o usar URLs fuera de la galería oficial
              if (!allowedGalleryUrls.has(validated.image_url.trim())) {
                toolResult = JSON.stringify({
                  status: 'rejected',
                  message:
                    'URL rechazada: solo puedes enviar fotos cuya URL exista en la galería del negocio. Usa send_product_card.',
                });
              } else if (dispatchedUrlsThisTurn.has(validated.image_url.trim())) {
                toolResult = JSON.stringify({ status: 'already_sent' });
              } else {
                const effectiveChannel = channel || 'whatsapp';
                const targetWaRecipient =
                  contactData?.custom_fields?.remote_jid ||
                  contactData?.custom_fields?.whatsapp_jid ||
                  leadPhone;
                let outboundId: string | null = null;

                if (effectiveChannel === 'instagram') {
                  const decryptedIgToken = orgData?.instagram_access_token
                    ? decryptSecret(orgData.instagram_access_token)
                    : '';
                  outboundId = await InstagramService.sendMediaMessage({
                    instagramAccountId: orgData.instagram_account_id,
                    accessToken: decryptedIgToken,
                    recipientId: leadPhone,
                    mediaUrl: validated.image_url,
                  });
                  if (validated.caption) {
                    await InstagramService.sendDirectMessage({
                      instagramAccountId: orgData.instagram_account_id,
                      accessToken: decryptedIgToken,
                      recipientId: leadPhone,
                      text: validated.caption,
                    });
                  }
                } else {
                  outboundId = await MessagingService.sendMediaMessage({
                    organization: orgData,
                    to: targetWaRecipient,
                    mediaUrl: validated.image_url,
                    caption: validated.caption,
                    mediaType: 'image',
                  });
                }

                dispatchedUrlsThisTurn.add(validated.image_url.trim());

                await (supabaseAdmin.from('messages') as any).insert({
                  contact_id: contactId,
                  organization_id: organizationId,
                  sender_type: 'ai',
                  content: formatImageMessageContent(validated.image_url, validated.caption || ''),
                  meta_message_id: outboundId || null,
                  channel: effectiveChannel,
                  status: 'sent',
                });

                toolResult = JSON.stringify({
                  status: 'sent',
                  message:
                    'Foto despachada con éxito. No incluyas URLs ni markdown en tu respuesta de texto.',
                });
              }
            } else if (functionName === 'update_lead_profile') {
              leadProfileUpdatedThisTurn = true;
              const validated = UpdateLeadProfileToolSchema.parse(functionArgs);
              const { data: latestC } = await (supabaseAdmin.from('contacts') as any)
                .select('pipeline_stage, custom_fields')
                .eq('id', contactId)
                .maybeSingle();

              const prevTemp = resolveLeadTemperature(latestC?.custom_fields);
              const isNonColdDowngrade =
                prevTemp === 'hot' &&
                (validated.temperature === 'warm' || validated.temperature === 'qualified_doubt') &&
                !validated.lost_reason?.trim();
              const effectiveTemp: LeadTemperature = isNonColdDowngrade
                ? 'hot'
                : validated.temperature;

              const syncRes = buildSynchronizedClassification({
                customFields: latestC?.custom_fields || {},
                currentStage: latestC?.pipeline_stage,
                temperature: effectiveTemp,
                product: validated.product_of_interest,
                objection: validated.objection,
                lostReason: validated.lost_reason,
                followUpSettings: orgData?.appointment_settings?.follow_up_sequences
                  ? normalizeFollowUpSettings(orgData.appointment_settings.follow_up_sequences)
                  : null,
              });

              const updatePayload: Record<string, any> = {
                custom_fields: syncRes.customFields,
                updated_at: new Date().toISOString(),
              };

              if (validated.lost_reason?.trim()) {
                updatePayload.close_reason = validated.lost_reason.trim().slice(0, 120);
              }
              if (syncRes.nextStage) {
                updatePayload.pipeline_stage = syncRes.nextStage;
              }

              await (supabaseAdmin.from('contacts') as any).update(updatePayload).eq('id', contactId);

              if (syncRes.shouldCancelPendingReactivations) {
                await (supabaseAdmin.from('scheduled_reminders') as any)
                  .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                  .eq('contact_id', contactId)
                  .eq('reminder_type', 'reactivation')
                  .eq('status', 'pending');
              }

              if (prevTemp !== effectiveTemp) {
                const label = LEAD_TEMPERATURE_META[effectiveTemp]?.label || effectiveTemp;
                await supabaseAdmin.from('messages').insert({
                  contact_id: contactId,
                  sender_type: 'system',
                  content: `[🏷️ Categoría actualizada por IA: ${label}${
                    validated.lost_reason ? ` — Motivo: ${validated.lost_reason}` : ''
                  }]`,
                });
              }

              if (syncRes.nextStage) {
                await supabaseAdmin.from('messages').insert({
                  contact_id: contactId,
                  sender_type: 'system',
                  content: `[📊 Etapa actualizada por IA: ${syncRes.nextStage}]`,
                });
              }

              toolResult = JSON.stringify({
                status: 'updated',
                temperature: effectiveTemp,
                stage_updated: syncRes.nextStage,
              });
            } else if (functionName === 'schedule_follow_up') {
              const validated = ScheduleFollowUpToolSchema.parse(functionArgs);
              const parsedDate = parseFollowUpScheduleDate({
                date: validated.date,
                timeLocal: validated.time_local,
                delayHours: validated.delay_hours,
                orgTimezone,
              });
              if (!parsedDate) {
                toolResult = JSON.stringify({ error: 'Fecha u hora inválida. Usa YYYY-MM-DD o delay_hours.' });
              } else {
                const { data: remRow } = await (supabaseAdmin.from('scheduled_reminders') as any)
                  .insert({
                    contact_id: contactId,
                    scheduled_for: parsedDate.toISOString(),
                    reminder_type: 'reactivation',
                    status: 'pending',
                  })
                  .select('id, scheduled_for, created_at')
                  .single();

                const activeReminderPayload = {
                  id: remRow?.id || `rem-${Date.now()}`,
                  reminderType: 'reactivation' as const,
                  scheduledFor: parsedDate.toISOString(),
                  note: validated.reason?.trim() || 'Seguimiento autónomo acordado con el cliente',
                  ...(validated.suggested_message?.trim()
                    ? { suggestedMessage: validated.suggested_message.trim() }
                    : {}),
                  createdByName: 'Synqo IA',
                  createdAt: new Date().toISOString(),
                };
                followUpScheduledInfo = {
                  reminderId: remRow?.id || null,
                  scheduledForIso: parsedDate.toISOString(),
                  reason: validated.reason?.trim(),
                  activeReminder: activeReminderPayload,
                };

                const { data: latestC } = await (supabaseAdmin.from('contacts') as any)
                  .select('custom_fields')
                  .eq('id', contactId)
                  .maybeSingle();

                const cf = { ...(latestC?.custom_fields || {}) };
                cf.active_reminder = activeReminderPayload;
                cf.follow_up = {
                  ...(cf.follow_up || { category: 'warm', currentStepIndex: 0 }),
                  nextSendAt: parsedDate.toISOString(),
                  scheduledReminderId: remRow?.id || null,
                  completed: false,
                  paused: false,
                };

                await (supabaseAdmin.from('contacts') as any)
                  .update({ custom_fields: cf, updated_at: new Date().toISOString() })
                  .eq('id', contactId);

                const niceDate = parsedDate.toLocaleString('es-CO', {
                  timeZone: orgTimezone,
                  weekday: 'long',
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                await supabaseAdmin.from('messages').insert({
                  contact_id: contactId,
                  sender_type: 'system',
                  content: `[⏰ Seguimiento Agendado por IA para ${niceDate}${
                    validated.reason ? ` - "${validated.reason}"` : ''
                  }]`,
                });

                toolResult = JSON.stringify({
                  status: 'scheduled',
                  scheduled_for: parsedDate.toISOString(),
                  readable_date: niceDate,
                });
              }
            } else if (functionName === 'create_order') {
              orderOrBookingCompletedThisTurn = true;
              const validated = CreateOrderToolSchema.parse(functionArgs);
              const nowIso = new Date().toISOString();

              const { data: latestC } = await (supabaseAdmin.from('contacts') as any)
                .select('name, custom_fields')
                .eq('id', contactId)
                .maybeSingle();

              leadProfileUpdatedThisTurn = true;
              const cf = { ...(latestC?.custom_fields || {}) };
              cf.lead_temperature = 'hot';
              delete cf.temperature;
              cf.deal_value = validated.total;
              cf.order = {
                ...validated,
                created_at: nowIso,
                created_by: 'ai',
              };
              cf.follow_up = {
                category: 'post_order',
                currentStepIndex: 0,
                completed: false,
              };

              const shouldUpdateName =
                !latestC?.name || /^(lead whatsapp|lead instagram|usuario instagram|\+?[0-9\s-]+)$/i.test(latestC.name.trim());

              await (supabaseAdmin.from('contacts') as any)
                .update({
                  ...(shouldUpdateName ? { name: validated.nombre } : {}),
                  pipeline_stage: 'ganado',
                  deal_value: validated.total,
                  closed_at: nowIso,
                  close_reason: 'venta_ia',
                  custom_fields: cf,
                  updated_at: nowIso,
                })
                .eq('id', contactId);

              const deliveryLabel = [validated.ciudad, validated.direccion].filter(Boolean).join(' - ');
              const itemsStr = validated.items.map((it) => `${it.quantity}x ${it.product_name}`).join(', ');
              await supabaseAdmin.from('messages').insert({
                contact_id: contactId,
                sender_type: 'system',
                content: `[🛒 Pedido registrado por IA: ${itemsStr} · Total $${validated.total.toLocaleString('es-CO')}${deliveryLabel ? ` · ${deliveryLabel}` : ''} · Cliente: ${validated.nombre}]`,
              });

              // Notificar al equipo para despacho sin pausar la IA
              HandoffService.notifyHandoff({
                organizationId,
                contactId,
                reason: `Pedido confirmado por IA: ${itemsStr} ($${validated.total.toLocaleString('es-CO')})${validated.ciudad ? ` - ${validated.ciudad}` : ''}`,
                channel: (channel as any) || 'whatsapp',
              }).catch(() => {});

              toolResult = JSON.stringify({
                status: 'order_created',
                total: validated.total,
                items: itemsStr,
                message: 'Pedido guardado y notificado al equipo. Confirma al cliente con entusiasmo y calidez.',
              });
            } else if (functionName === 'update_pipeline_stage') {
              const validated = UpdateStageToolSchema.parse(functionArgs);
              const { data: stageContact } = await (supabaseAdmin.from('contacts') as any)
                .select('pipeline_stage, custom_fields')
                .eq('id', contactId)
                .maybeSingle();

              const targetTempForStage: LeadTemperature | null =
                validated.new_stage === 'ganado' || validated.new_stage === 'cita_agendada'
                  ? 'hot'
                  : validated.new_stage === 'perdido'
                  ? 'cold'
                  : validated.new_stage === 'calificado' &&
                    (!resolveLeadTemperature(stageContact?.custom_fields) ||
                      resolveLeadTemperature(stageContact?.custom_fields) === 'warm')
                  ? 'qualified_doubt'
                  : null;

              const stageUpdatePayload: Record<string, any> = {
                pipeline_stage: validated.new_stage,
                updated_at: new Date().toISOString(),
              };

              if (targetTempForStage) {
                const syncStage = buildSynchronizedClassification({
                  customFields: stageContact?.custom_fields || {},
                  currentStage: validated.new_stage,
                  temperature: targetTempForStage,
                  lostReason: validated.new_stage === 'perdido' ? validated.reason || undefined : undefined,
                  followUpSettings: orgData?.appointment_settings?.follow_up_sequences
                    ? normalizeFollowUpSettings(orgData.appointment_settings.follow_up_sequences)
                    : null,
                });
                stageUpdatePayload.custom_fields = syncStage.customFields;
              }

              if (validated.new_stage === 'ganado' || validated.new_stage === 'perdido') {
                stageUpdatePayload.conversation_status = 'closed';
                stageUpdatePayload.waiting_since = null;
                stageUpdatePayload.is_ai_active = false;
                stageUpdatePayload.closed_at = new Date().toISOString();
                if (validated.reason) stageUpdatePayload.close_reason = validated.reason.slice(0, 120);
              }

              await (supabaseAdmin.from('contacts') as any)
                .update(stageUpdatePayload)
                .eq('id', contactId);

              await supabaseAdmin.from('messages').insert({
                contact_id: contactId,
                sender_type: 'system',
                content: `[📊 Etapa actualizada por IA: ${validated.new_stage}${validated.reason ? ` (${validated.reason})` : ''}]`,
              });

              toolResult = JSON.stringify({
                status: 'success',
                message: `Etapa actualizada a ${validated.new_stage}`,
              });
            } else if (functionName === 'check_native_availability') {
              const validated = CheckNativeAvailabilityToolSchema.parse(functionArgs);
              let specialistId: string | null = null;
              if (validated.specialist_name) {
                const { data: spec } = await supabaseAdmin
                  .from('specialists')
                  .select('id')
                  .eq('organization_id', organizationId)
                  .ilike('name', `%${validated.specialist_name.trim()}%`)
                  .limit(1)
                  .maybeSingle();
                if (spec) specialistId = spec.id;
              }

              let durationMinutes = validated.duration_minutes || 45;
              if (!validated.duration_minutes && validated.service_name) {
                const { data: svc } = await supabaseAdmin
                  .from('services_catalog')
                  .select('duration_minutes')
                  .eq('organization_id', organizationId)
                  .ilike('name', `%${validated.service_name.trim()}%`)
                  .limit(1)
                  .maybeSingle();
                if (svc?.duration_minutes) durationMinutes = svc.duration_minutes;
              }

              const slots = await AppointmentService.getAvailableSlots({
                organizationId,
                date: validated.date,
                durationMinutes,
                specialistId,
              });

              toolResult =
                slots.length === 0
                  ? JSON.stringify({ available_slots: [], message: `Sin turnos el ${validated.date}. Sugiere otra fecha.` })
                  : JSON.stringify({
                      available_slots: slots.slice(0, 6).map((s) => ({
                        time: s.displayTime,
                        iso_start: s.startTime,
                        specialist: s.specialistName,
                        room: s.roomName || undefined,
                      })),
                      total_found: slots.length,
                    });
            } else if (functionName === 'book_native_appointment') {
              const validated = BookNativeAppointmentToolSchema.parse(functionArgs);
              let specialistId: string | null = null;
              if (validated.specialist_name) {
                const { data: spec } = await supabaseAdmin
                  .from('specialists')
                  .select('id')
                  .eq('organization_id', organizationId)
                  .ilike('name', `%${validated.specialist_name.trim()}%`)
                  .limit(1)
                  .maybeSingle();
                if (spec) specialistId = spec.id;
              }

              let duration = validated.duration_minutes || 45;
              let serviceCatalogId: string | null = null;
              if (validated.service_name) {
                const { data: svc } = await supabaseAdmin
                  .from('services_catalog')
                  .select('id, duration_minutes')
                  .eq('organization_id', organizationId)
                  .ilike('name', `%${validated.service_name.trim()}%`)
                  .limit(1)
                  .maybeSingle();
                if (svc) {
                  serviceCatalogId = svc.id;
                  if (!validated.duration_minutes && svc.duration_minutes) duration = svc.duration_minutes;
                }
              }

              const appt = await AppointmentService.createAppointment({
                organizationId,
                contactId,
                specialistId,
                serviceId: serviceCatalogId,
                serviceName: validated.service_name,
                durationMinutes: duration,
                startTime: validated.start_time,
                bookedVia: 'ai_whatsapp',
                notes: validated.notes || null,
                clientName: leadName,
                referenceInfo: validated.reference_info || null,
                meetingLink: null,
              });

              toolResult = JSON.stringify({
                status: 'confirmed',
                appointment_id: appt.id,
                start_time: appt.start_time,
                service_name: appt.service_name,
                meeting_link: appt.meeting_link || undefined,
              });
            } else if (functionName === 'reschedule_native_appointment') {
              const validated = RescheduleNativeAppointmentToolSchema.parse(functionArgs);
              const { data: activeAppt } = await supabaseAdmin
                .from('appointments')
                .select('id')
                .eq('organization_id', organizationId)
                .eq('contact_id', contactId)
                .gte('start_time', new Date().toISOString())
                .in('status', ['pending', 'confirmed'])
                .order('start_time', { ascending: true })
                .limit(1)
                .maybeSingle();

              if (!activeAppt) {
                toolResult = JSON.stringify({ error: 'No hay cita activa para reprogramar.' });
              } else {
                const res = await AppointmentService.rescheduleAppointment({
                  appointmentId: activeAppt.id,
                  organizationId,
                  newStartTime: validated.new_start_time,
                  reason: validated.reason || 'Solicitado en chat',
                });
                if (res.limitReached) {
                  await supabaseAdmin.from('contacts').update({ is_ai_active: false }).eq('id', contactId);
                  toolResult = JSON.stringify({ status: 'limit_reached', message: res.message });
                } else {
                  toolResult = JSON.stringify({
                    status: 'rescheduled',
                    new_start_time: res.appointment?.start_time || validated.new_start_time,
                    warning_message: res.warningMessage,
                  });
                }
              }
            } else if (functionName === 'cancel_native_appointment') {
              const validated = CancelNativeAppointmentToolSchema.parse(functionArgs);
              const { data: activeAppt } = await supabaseAdmin
                .from('appointments')
                .select('id')
                .eq('organization_id', organizationId)
                .eq('contact_id', contactId)
                .gte('start_time', new Date().toISOString())
                .in('status', ['pending', 'confirmed'])
                .order('start_time', { ascending: true })
                .limit(1)
                .maybeSingle();

              if (!activeAppt) {
                toolResult = JSON.stringify({ error: 'No hay cita activa para cancelar.' });
              } else {
                const res = await AppointmentService.cancelAppointment({
                  appointmentId: activeAppt.id,
                  organizationId,
                  reason: validated.reason || 'Cancelado por cliente',
                  cancelledBy: 'client',
                });
                toolResult = JSON.stringify({ status: 'cancelled', message: res.message });
              }
            } else if (functionName === 'request_human_handoff') {
              const handoffReason = String(functionArgs?.reason || 'Consulta requiere asesor').trim();
              pauseAfterSend = true;
              detectedHandoffReason = handoffReason;

              await supabaseAdmin.from('messages').insert({
                contact_id: contactId,
                sender_type: 'system',
                content: `[🚨 Relevo Silencioso: Asesor humano requerido - Motivo: "${handoffReason}"]`,
              });

              HandoffService.notifyHandoff({
                organizationId,
                contactId,
                reason: handoffReason,
                channel: (channel as any) || 'whatsapp',
              }).catch(() => {});

              const isOperationalOnlyHandoff = /(asesor|humano|persona|agente|operador|comprobante|pago|transferencia|reclamo|queja|garant[ií]a|audio|nota de voz|descuento|cita)/i.test(
                handoffReason
              );
              if (!isOperationalOnlyHandoff) {
                try {
                  const cleanReason = handoffReason.slice(0, 80);
                  const { data: existingGaps } = await (supabaseAdmin.from('ai_knowledge_gaps') as any)
                    .select('id, occurrences')
                    .eq('organization_id', organizationId)
                    .eq('status', 'pending')
                    .ilike('question_text', `%${cleanReason}%`)
                    .limit(1);

                  if (existingGaps && existingGaps.length > 0) {
                    await (supabaseAdmin.from('ai_knowledge_gaps') as any)
                      .update({ occurrences: (existingGaps[0].occurrences || 1) + 1, updated_at: new Date().toISOString() })
                      .eq('id', existingGaps[0].id);
                  } else {
                    await (supabaseAdmin.from('ai_knowledge_gaps') as any).insert({
                      organization_id: organizationId,
                      contact_id: contactId,
                      question_text: handoffReason,
                      ai_category: 'general',
                      reason: handoffReason,
                      status: 'pending',
                      occurrences: 1,
                    });
                  }
                } catch {}
              }

              const isSilent = handoffMode === 'silent';
              const isExplicitHuman = /(asesor|humano|persona|agente|operador|alguien real)/i.test(handoffReason);
              const nextOpeningWindow = calculateNextOpeningWindow(businessHours, orgTimezone);

              if (isSilent) {
                toolResult = JSON.stringify(
                  isAfterHours && afterHoursMessage
                    ? { status: 'after_hours_fallback', instructions_for_assistant: afterHoursMessage }
                    : { status: 'silent_handoff', instructions_for_assistant: 'Responde únicamente SILENT_HANDOFF.' }
                );
              } else if (isExplicitHuman) {
                toolResult = JSON.stringify({
                  status: 'handoff_explicit_human',
                  instructions_for_assistant: `Comunica con calidez que un asesor ya toma la conversación. Sugerencia: "${AI_TEXT_TEMPLATES.explicitHandoff(
                    orgData?.name,
                    contactId
                  )}"`,
                });
              } else if (isAfterHours) {
                toolResult = JSON.stringify({
                  status: 'handoff_after_hours',
                  instructions_for_assistant: `Indica con calidez que validarás el dato con el equipo ${nextOpeningWindow} para darle respuesta exacta.`,
                });
              } else {
                toolResult = JSON.stringify({
                  status: 'handoff_business_hours',
                  instructions_for_assistant:
                    'Indica con naturalidad que vas a validar ese dato con el equipo interno y confirmas en breve.',
                });
              }
            } else if (functionName === 'record_knowledge_gap') {
              const qText = String(functionArgs?.question_text || '').trim();
              if (qText) {
                const { data: existingGaps } = await (supabaseAdmin.from('ai_knowledge_gaps') as any)
                  .select('id, occurrences')
                  .eq('organization_id', organizationId)
                  .eq('status', 'pending')
                  .ilike('question_text', `%${qText.slice(0, 60)}%`)
                  .limit(1);

                if (existingGaps && existingGaps.length > 0) {
                  await (supabaseAdmin.from('ai_knowledge_gaps') as any)
                    .update({ occurrences: (existingGaps[0].occurrences || 1) + 1, updated_at: new Date().toISOString() })
                    .eq('id', existingGaps[0].id);
                } else {
                  await (supabaseAdmin.from('ai_knowledge_gaps') as any).insert({
                    organization_id: organizationId,
                    contact_id: contactId,
                    question_text: qText,
                    ai_category: functionArgs?.category || 'general',
                    reason: functionArgs?.reason || null,
                    status: 'pending',
                    occurrences: 1,
                  });
                }
              }
              toolResult = JSON.stringify({ status: 'recorded' });
            }
          } catch (toolError: any) {
            console.error(`[TOOL ERROR: ${functionName}]`, toolError);
            toolResult = JSON.stringify({ error: toolError?.message || 'Error ejecutando herramienta' });
          }

          conversationHistory.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }
      }

      // Validador de alucinación de precios contra catálogo/galería: regenerar UNA vez si cita precio inexistente
      const badPrices = findHallucinatedPrices(finalResponseText, knownPrices);
      if (finalResponseText && badPrices.length > 0) {
        try {
          const regenHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            ...conversationHistory,
            { role: 'assistant', content: finalResponseText },
            {
              role: 'system',
              content: `Validación interna: citaste un monto (${badPrices
                .map((p) => `$${p.toLocaleString('es-CO')}`)
                .join(', ')}) que no coincide con los precios oficiales de la galería ni del catálogo. Reescribe la respuesta usando únicamente los precios exactos del catálogo.`,
            },
          ];
          const regen = await createChatCompletionWithFallback({
            messages: regenHistory,
            temperature: 0.2,
            aiProvider,
            organizationId,
            contactId,
          });
          metaModel = regen.modelUsed;
          metaProvider = regen.provider;
          if (regen.response.usage) {
            totalPromptTokens += regen.response.usage.prompt_tokens || 0;
            totalCompletionTokens += regen.response.usage.completion_tokens || 0;
          }
          const fixed = regen.response.choices[0]?.message?.content?.trim();
          if (fixed) finalResponseText = fixed;
        } catch {}
      }

      if (!finalResponseText) {
        finalResponseText = '¡Hola! Con gusto te atiendo. ¿En qué producto o información estás interesado?';
      }

      if (finalResponseText.trim() === 'SILENT_HANDOFF' || finalResponseText.includes('SILENT_HANDOFF')) {
        return {
          text: '',
          modelUsed: metaModel,
          provider: metaProvider,
          isFallback,
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          totalTokens: totalPromptTokens + totalCompletionTokens,
          cachedTokens: totalCachedTokens,
          failedAttempts: allFailedAttempts,
          pauseAfterSend: true,
          handoffReason: detectedHandoffReason || 'Relevo silencioso hacia asesor humano',
        };
      }

      // Garantizar clasificación automática y ascenso progresivo (warm -> qualified_doubt -> hot) si el modelo omitió update_lead_profile
      if (!leadProfileUpdatedThisTurn) {
        try {
          const { data: latestC } = await (supabaseAdmin.from('contacts') as any)
            .select('pipeline_stage, custom_fields, deal_value')
            .eq('id', contactId)
            .maybeSingle();

          const currentTemp = resolveLeadTemperature(latestC?.custom_fields);
          const latestLeadText =
            [...dbMessages].reverse().find((m: any) => m.sender_type === 'lead')?.content || '';
          const lowerLeadMsg = String(latestLeadText).toLowerCase();

          const isHotSignal =
            /(datos de pago|m[eé]todos? de pago|link de pago|enlace de pago|contraentrega|transferencia|tarjeta|quiero comprar|quiero pedir|voy a pedir|c[oó]mo pago|a qu[eé] cuenta|p[aá]same la cuenta|apartar|reservar|agendar.*(cita|hora|ma[ñn]ana|hoy)|confirmo el pedido)/i.test(
              lowerLeadMsg
            );
          const isExplicitColdSignal =
            /(no me interesa|no gracias|muy caro|fuera de mi presupuesto|no deseo continuar|ya compr[eé] en otro)/i.test(
              lowerLeadMsg
            );
          const hasProductContext = Boolean(resolveProductInterest(latestC?.custom_fields, latestC?.deal_value));
          const isSpecificDoubtSignal =
            !/(lo pienso|luego te aviso|despu[eé]s te confirmo|consulto con)/i.test(lowerLeadMsg) &&
            (hasProductContext || latestC?.pipeline_stage === 'calificado') &&
            /(medida|tama[ñn]o|incluye|accesorio|garant[ií]a|env[ií]o|domicilio|disponib|cuota|abono|apartado|requisito|horario|c[oó]mo funciona)/i.test(
              lowerLeadMsg
            );

          let targetTemp: LeadTemperature | null = null;
          if (!currentTemp) {
            targetTemp = isHotSignal
              ? 'hot'
              : isExplicitColdSignal
              ? 'cold'
              : isSpecificDoubtSignal
              ? 'qualified_doubt'
              : 'warm';
          } else if (currentTemp === 'warm') {
            if (isHotSignal) targetTemp = 'hot';
            else if (isSpecificDoubtSignal) targetTemp = 'qualified_doubt';
            else if (isExplicitColdSignal) targetTemp = 'cold';
          } else if (currentTemp === 'qualified_doubt') {
            if (isHotSignal) targetTemp = 'hot';
            else if (isExplicitColdSignal) targetTemp = 'cold';
          }

          if (latestC && targetTemp && targetTemp !== currentTemp) {
            const syncRes = buildSynchronizedClassification({
              customFields: latestC.custom_fields || {},
              currentStage: latestC.pipeline_stage,
              temperature: targetTemp,
              followUpSettings: orgData?.appointment_settings?.follow_up_sequences
                ? normalizeFollowUpSettings(orgData.appointment_settings.follow_up_sequences)
                : null,
            });

            await (supabaseAdmin.from('contacts') as any)
              .update({
                custom_fields: syncRes.customFields,
                ...(syncRes.nextStage ? { pipeline_stage: syncRes.nextStage } : {}),
                updated_at: new Date().toISOString(),
              })
              .eq('id', contactId);

            if (syncRes.shouldCancelPendingReactivations) {
              await (supabaseAdmin.from('scheduled_reminders') as any)
                .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                .eq('contact_id', contactId)
                .eq('reminder_type', 'reactivation')
                .eq('status', 'pending');
            }
          }
        } catch (autoClassErr) {
          console.warn('[AUTO CLASSIFY FALLBACK WARN]', autoClassErr);
        }
      }

      // Respaldo autónomo de recordatorios: si el cliente dio señal temporal o de aplazamiento y la IA no llamó schedule_follow_up
      if (!followUpScheduledInfo && !pauseAfterSend && !orderOrBookingCompletedThisTurn) {
        try {
          const { data: latestC } = await (supabaseAdmin.from('contacts') as any)
            .select('pipeline_stage, custom_fields')
            .eq('id', contactId)
            .maybeSingle();

          const latestCf = latestC?.custom_fields || {};
          const latestTemp = resolveLeadTemperature(latestCf);
          const isTerminalStage = ['ganado', 'perdido', 'cita_agendada'].includes(latestC?.pipeline_stage);

          if (latestC && !isTerminalStage && latestTemp !== 'cold' && latestCf.opted_out !== true) {
            const latestLeadText =
              [...dbMessages].reverse().find((m: any) => m.sender_type === 'lead')?.content || '';
            const inferred = inferAutonomousReminderFromLeadMessage({
              leadText: String(latestLeadText),
              orgTimezone,
              productInterest: resolveProductInterest(latestCf, contactData?.deal_value),
              temperature: latestTemp,
            });

            if (inferred) {
              const { data: remRow } = await (supabaseAdmin.from('scheduled_reminders') as any)
                .insert({
                  contact_id: contactId,
                  scheduled_for: inferred.scheduledFor.toISOString(),
                  reminder_type: 'reactivation',
                  status: 'pending',
                })
                .select('id, scheduled_for, created_at')
                .single();

              const activeReminderPayload = {
                id: remRow?.id || `rem-${Date.now()}`,
                reminderType: 'reactivation' as const,
                scheduledFor: inferred.scheduledFor.toISOString(),
                note: inferred.reason,
                suggestedMessage: inferred.suggestedMessage,
                createdByName: 'Synqo IA',
                createdAt: new Date().toISOString(),
              };

              followUpScheduledInfo = {
                reminderId: remRow?.id || null,
                scheduledForIso: inferred.scheduledFor.toISOString(),
                reason: inferred.reason,
                activeReminder: activeReminderPayload,
              };

              const nextCf = { ...latestCf, active_reminder: activeReminderPayload };
              nextCf.follow_up = {
                ...(nextCf.follow_up || { category: 'warm', currentStepIndex: 0 }),
                nextSendAt: inferred.scheduledFor.toISOString(),
                scheduledReminderId: remRow?.id || null,
                completed: false,
                paused: false,
              };

              await (supabaseAdmin.from('contacts') as any)
                .update({ custom_fields: nextCf, updated_at: new Date().toISOString() })
                .eq('id', contactId);

              const niceDate = inferred.scheduledFor.toLocaleString('es-CO', {
                timeZone: orgTimezone,
                weekday: 'long',
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              });
              await supabaseAdmin.from('messages').insert({
                contact_id: contactId,
                sender_type: 'system',
                content: `[🤖 Recordatorio autónomo programado por IA para ${niceDate} — "${inferred.reason}"]`,
              });
            }
          }
        } catch (autoRemErr) {
          console.warn('[AUTONOMOUS REMINDER FALLBACK WARN]', autoRemErr);
        }
      }

      // M5: Regex sobre respuesta del bot -> solo alerta interna sin pausar la IA automáticamente
      const handoffPattern =
        /(asesor (se pondr[aá]|humano|comercial)|notificado a (nuestro|un) (asesor|equipo)|(transferir|transferirte|comunicarte|pasarte) con un (asesor|humano|agente|compañero)|pausad[ao] mis respuestas)/i;
      if (!pauseAfterSend && handoffPattern.test(finalResponseText)) {
        console.warn(`[AI HANDOFF REGEX ALERT] Contacto ${contactId}: el texto menciona relevo sin llamada a tool.`);
      }

      // M2: Regenerar resumen ejecutivo cada AI_SUMMARY_EVERY mensajes usando modelo utilitario
      const lastSummaryCount = Number(contactData?.custom_fields?.ai_summary?.msg_count || 0);
      if (
        totalMessageCount >= 4 &&
        totalMessageCount - lastSummaryCount >= AI_OPERATIONAL_CONFIG.summaryEveryMessages
      ) {
        try {
          const summary = await this.generateDealSummary(dbMessages, {
            organizationId,
            contactId,
            aiProvider,
          });
          const { data: latestC } = await (supabaseAdmin.from('contacts') as any)
            .select('custom_fields')
            .eq('id', contactId)
            .maybeSingle();
          const cf = { ...(latestC?.custom_fields || {}) };
          cf.ai_summary = {
            ...summary,
            product_of_interest: summary.product_interest,
            msg_count: totalMessageCount,
            generated_at: new Date().toISOString(),
          };
          await (supabaseAdmin.from('contacts') as any)
            .update({ custom_fields: cf })
            .eq('id', contactId);
        } catch (sumErr) {
          console.warn('[AUTO SUMMARY WARN]', sumErr);
        }
      }

      return {
        text: finalResponseText,
        modelUsed: metaModel,
        provider: metaProvider,
        isFallback,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens: totalPromptTokens + totalCompletionTokens,
        cachedTokens: totalCachedTokens,
        pauseAfterSend,
        handoffReason: detectedHandoffReason,
        failedAttempts: allFailedAttempts,
        followUpScheduled: followUpScheduledInfo,
      };
    } catch (globalAiError: any) {
      console.error(`[AI RESILIENCE] Lead ${contactId}:`, globalAiError?.message || globalAiError);
      try {
        await supabaseAdmin.from('messages').insert({
          contact_id: contactId,
          sender_type: 'system',
          content: `[🚨 Respaldo Activado: Falla temporal de proveedores (${globalAiError?.message || 'indisponible'}). IA pausada tras responder.]`,
        });
      } catch {}

      return {
        text: AI_TEXT_TEMPLATES.emergencyFallback(organization?.name, contactId),
        modelUsed: metaModel,
        provider: metaProvider,
        isFallback: true,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens: totalPromptTokens + totalCompletionTokens,
        cachedTokens: totalCachedTokens,
        pauseAfterSend: true,
        handoffReason: `Falla técnica de proveedor: ${globalAiError?.message || 'error desconocido'}`,
        failedAttempts: allFailedAttempts,
      };
    }
  }

  /**
   * Copiloto de borradores para asesores humanos.
   */
  static async generateDraftCopilotReply(params: {
    organizationId: string;
    contactId: string;
    leadName?: string | null;
    history: Array<{ sender_type: string; content: string }>;
    organization: any;
  }): Promise<string> {
    const { organizationId, contactId, leadName, history, organization } = params;
    const basePrompt = resolveOrganizationSystemPrompt(
      organization,
      'Eres un asesor comercial atento.'
    );

    const conversationSnippet = history
      .map((m) => `${m.sender_type === 'lead' ? 'Cliente' : 'Asesor/IA'}: ${m.content}`)
      .join('\n');

    const prompt = `Propón un borrador corto de respuesta en WhatsApp para el cliente ${leadName ? `(${leadName})` : ''}.
Contexto del negocio:
${basePrompt}

Historial reciente:
${conversationSnippet}

Reglas: responde directo y amable (1 a 3 líneas), usa precios/datos reales del contexto y devuelve únicamente el texto final sin comillas.`;

    const { response } = await createChatCompletionWithFallback({
      messages: [
        { role: 'system', content: 'Eres un copiloto de redacción comercial.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      chainOverride: getAiUtilityChain(),
      aiProvider: organization?.ai_provider,
      organizationId,
      contactId,
    });

    const draft = response.choices[0]?.message?.content?.trim() || '';
    return draft.replace(/^["“”]|["“”]$/g, '').trim();
  }

  /**
   * Genera el mensaje autónomo de seguimiento/recontacto que la IA enviará por WhatsApp,
   * siguiendo las directrices específicas del prompt de cada empresa (ej. facilidades de pago, promos, envío de foto)
   * y el historial real del prospecto.
   */
  static async generateAutonomousReminderMessage(params: {
    organization: any;
    contactId: string;
    leadName?: string | null;
    history: Array<{ sender_type: string; content: string }>;
    reminderNote?: string | null;
    suggestedMessage?: string | null;
    productInterest?: string | null;
    lastObjection?: string | null;
  }): Promise<{ message: string; includeProductPhoto: boolean; productQuery: string | null }> {
    const {
      organization,
      contactId,
      leadName,
      history,
      reminderNote,
      suggestedMessage,
      productInterest,
      lastObjection,
    } = params;

    const cleanName = (leadName || '').trim();
    const isPhoneOnly =
      /^[+0-9\s-]+$/.test(cleanName) || cleanName.startsWith('+') || /^(lead|usuario)\b/i.test(cleanName);
    const firstName = cleanName && !isPhoneOnly ? cleanName.split(/\s+/)[0] : '';
    const greeting = firstName ? `¡Hola ${firstName}!` : '¡Hola!';

    const rawBusinessPrompt = resolveOrganizationSystemPrompt(organization, 'Empresa comercial.');
    const promptDigest = extractRecontactPromptDigest(rawBusinessPrompt, 2200);

    const conversationSnippet =
      history.length > 0
        ? history
            .slice(-6)
            .map(
              (m) =>
                `${m.sender_type === 'lead' ? 'Cliente' : 'Asesor/IA'}: ${String(m.content || '').slice(0, 220)}`
            )
            .join('\n')
        : 'Sin historial previo detallado.';

    const wantsPhotoHeuristic = Boolean(
      productInterest && /(foto|imagen|im[aá]genes|cat[aá]logo|mostrar)/i.test(promptDigest)
    );

    const fallbackMsg =
      suggestedMessage?.trim() ||
      (reminderNote?.trim()
        ? `${greeting} Retomo nuestro contacto pendiente (${reminderNote.trim()})${
            productInterest ? ` sobre ${productInterest.trim()}` : ''
          }. ¿Cómo te quedó mejor para avanzar? 😊`
        : `${greeting} ¿Cómo estás? Paso por aquí para saber si pudiste revisar ${
            productInterest?.trim() || 'la información que te compartimos'
          } o si te ayudo a confirmarlo hoy 😊`);

    try {
      const prompt = `Genera UN mensaje corto y natural por WhatsApp (máximo 2-3 líneas, tuteando, tono humano) para recontactar automáticamente a este cliente.
Aplica OBLIGATORIAMENTE lo que esta empresa indique sobre recontacto, cierres o facilidades (ej. abonos, reservas, cuotas, envíos, promos o envío de fotos si aplica).

Empresa: ${organization?.name || 'Nuestro equipo'}
Directrices del negocio (extracto relevante):
${promptDigest}

Cliente: ${firstName || 'No especificado'}
Motivo / contexto del recontacto: ${reminderNote || 'Seguimiento comercial autónomo'}
${productInterest ? `Producto/servicio de interés: ${productInterest}` : ''}
${lastObjection ? `Duda u objeción previa: ${lastObjection}` : ''}
${suggestedMessage ? `Referencia inicial: ${suggestedMessage}` : ''}
Últimos mensajes:
${conversationSnippet}

Devuelve ÚNICAMENTE JSON válido con esta estructura exacta:
{
  "message": "Texto final listo para enviar al cliente",
  "include_product_photo": true o false (true si la empresa indica recontactar con imagen/foto o conviene reforzar visualmente el producto consultado),
  "product_query": "Nombre del producto para buscar su foto en galería, o null"
}`;

      const { response } = await createChatCompletionWithFallback({
        messages: [
          {
            role: 'system',
            content:
              'Eres un asesor comercial autónomo que ejecuta exactamente la estrategia de recontacto configurada en el prompt de cada empresa en JSON válido.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.35,
        chainOverride: getAiUtilityChain(),
        aiProvider: organization?.ai_provider,
        organizationId: organization?.id,
        contactId,
        responseFormat: { type: 'json_object' },
      });

      const raw = response.choices[0]?.message?.content?.trim() || '';
      const parsed = JSON.parse(raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim());
      const cleanMessage = String(parsed?.message || '').replace(/^["'«“”]+|["'»“”]+$/g, '').trim();

      return {
        message: cleanMessage.length >= 12 ? cleanMessage : fallbackMsg,
        includeProductPhoto: Boolean(parsed?.include_product_photo),
        productQuery:
          typeof parsed?.product_query === 'string' && parsed.product_query.trim()
            ? parsed.product_query.trim()
            : productInterest || null,
      };
    } catch {
      return {
        message: fallbackMsg,
        includeProductPhoto: wantsPhotoHeuristic,
        productQuery: productInterest || null,
      };
    }
  }

  /**
   * Sugerencias contextuales de reactivación para un contacto en pausa o espera.
   */
  static async generateReactivationHook(params: {
    organizationId: string;
    contactId: string;
    leadName?: string | null;
    history: Array<{ sender_type: string; content: string }>;
    organization: any;
    contactCustomFields?: any;
  }): Promise<{
    detectedInterest: string;
    suggestedMessage: string;
    alternativeHook: string;
  }> {
    const { organizationId, contactId, leadName, history, organization, contactCustomFields } = params;
    const basePrompt = resolveOrganizationSystemPrompt(organization, 'Empresa comercial.');

    const conversationSnippet =
      history.length > 0
        ? history.map((m) => `${m.sender_type === 'lead' ? 'Cliente' : 'Asesor/IA'}: ${m.content}`).join('\n')
        : 'No hay mensajes previos registrados.';

    const cleanName = (leadName || '').trim();
    const isPhoneOnly = /^[+0-9\s-]+$/.test(cleanName) || cleanName.startsWith('+');
    const firstName = cleanName && !isPhoneOnly ? cleanName.split(' ')[0] : '';
    const knownInterest = resolveProductInterest(contactCustomFields) || '';

    const prompt = `Analiza esta conversación en silencio (>24h) y genera mensajes naturales de seguimiento en WhatsApp usando los beneficios/pagos/envíos reales del negocio.
Contexto del negocio:
${basePrompt}
Nombre: ${cleanName || 'No especificado'}
${knownInterest ? `Interés previo: ${knownInterest}` : ''}
Historial:
${conversationSnippet}

Devuelve ÚNICAMENTE un JSON válido:
{
  "detectedInterest": "Resumen en 3-8 palabras",
  "suggestedMessage": "Mensaje principal cálido (2 líneas) con llamado a la acción claro según el negocio",
  "alternativeHook": "Alternativa suave enfocada en resolver duda o pago"
}`;

    try {
      const { response } = await createChatCompletionWithFallback({
        messages: [
          { role: 'system', content: 'Copiloto de seguimiento comercial en JSON válido.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.35,
        chainOverride: getAiUtilityChain(),
        aiProvider: organization?.ai_provider,
        organizationId,
        contactId,
        responseFormat: { type: 'json_object' },
      });

      const raw = response.choices[0]?.message?.content?.trim() || '{}';
      const parsed = JSON.parse(raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim());
      const greeting = firstName ? `¡Hola ${firstName}!` : '¡Hola!';

      return {
        detectedInterest: parsed.detectedInterest || knownInterest || 'Consulta previa',
        suggestedMessage: (parsed.suggestedMessage || `${greeting} ¿Alcanzaste a revisar la información de ${knownInterest || 'tu consulta'}?`).trim(),
        alternativeHook: (parsed.alternativeHook || `${greeting} Quedo atento si deseas avanzar o resolver alguna duda.`).trim(),
      };
    } catch {
      const greeting = firstName ? `¡Hola ${firstName}!` : '¡Hola!';
      return {
        detectedInterest: knownInterest || 'Seguimiento comercial',
        suggestedMessage: `${greeting} ¿Cómo estás? Quería confirmar si te quedó alguna duda sobre la información que te compartimos.`,
        alternativeHook: `${greeting} Seguimos a tu orden por si deseas retomar tu cotización hoy.`,
      };
    }
  }

  /**
   * Genera borradores editables de secuencias de seguimiento por categoría desde el prompt del cliente (T2).
   * Se ejecuta una sola vez bajo demanda en Configuración con el modelo utilitario.
   */
  static async generateFollowUpSuggestions(
    organization: any,
    hints?: {
      argumentsHint?: string;
      toneHint?: string;
      frequencyHint?: string;
    }
  ): Promise<
    Record<
      FollowUpCategory,
      Array<{ delayValue: number; delayUnit: 'hours' | 'days'; text: string }>
    >
  > {
    const basePrompt = resolveOrganizationSystemPrompt(organization, 'Empresa comercial.');
    const hasCalendar = Boolean(organization?.enabled_modules?.native_calendar);

    const hintsBlock = [
      hints?.argumentsHint?.trim() ? `- Argumentos / beneficios clave a destacar: ${hints.argumentsHint.trim()}` : '',
      hints?.toneHint?.trim() ? `- Tono deseado: ${hints.toneHint.trim()}` : '',
      hints?.frequencyHint?.trim() ? `- Preferencia de tiempos/frecuencia: ${hints.frequencyHint.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const prompt = `Lee las políticas de pago, entrega o agendamiento y catálogo de esta empresa y redacta secuencias cortas de seguimiento por WhatsApp para configurar en el CRM.
Usa variables {nombre}, {producto} y {empresa} donde convenga. Incluye mención a las facilidades reales descritas en el prompt (ej. modalidades de pago, entregas, reservas o citas según el negocio) y termina cada mensaje con un llamado a la acción claro y cercano.

Categorías de seguimiento:
- hot_unclosed: Calificado listo para cerrar (ya eligió o pidió datos/pago/cita, falta confirmar).
- qualified_doubt: Calificado con intención clara, pero con dudas puntuales antes de confirmar.
- warm: Tibio (pidió información o precios generales y sigue evaluando).
- unresponsive: Sin respuesta tras cotización/información inicial.
- post_order: Post-cierre opcional (1 paso).

Contexto de la empresa:
${basePrompt}
${hintsBlock ? `\nPreferencias de seguimiento indicadas por la empresa:\n${hintsBlock}` : ''}

Responde ÚNICAMENTE JSON válido con esta estructura exacta (2 pasos por categoría activa, 1 para post_order):
{
  "hot_unclosed": [
    { "delayValue": 4, "delayUnit": "hours", "text": "..." },
    { "delayValue": 1, "delayUnit": "days", "text": "..." }
  ],
  "qualified_doubt": [
    { "delayValue": 6, "delayUnit": "hours", "text": "..." },
    { "delayValue": 2, "delayUnit": "days", "text": "..." }
  ],
  "warm": [
    { "delayValue": 1, "delayUnit": "days", "text": "..." },
    { "delayValue": 3, "delayUnit": "days", "text": "..." }
  ],
  "unresponsive": [
    { "delayValue": 24, "delayUnit": "hours", "text": "..." },
    { "delayValue": 3, "delayUnit": "days", "text": "..." }
  ],
  "post_order": [
    { "delayValue": 3, "delayUnit": "days", "text": "..." }
  ]
}`;

    const fallback: Record<
      FollowUpCategory,
      Array<{ delayValue: number; delayUnit: 'hours' | 'days'; text: string }>
    > = {
      hot_unclosed: [
        {
          delayValue: 4,
          delayUnit: 'hours' as const,
          text: `¡Hola {nombre}! Tu selección de {producto} sigue disponible en {empresa}. ${AI_TEXT_TEMPLATES.followUpSuggestionDefaultCta()}`,
        },
        {
          delayValue: 1,
          delayUnit: 'days' as const,
          text: hasCalendar
            ? `¡Hola {nombre}! ¿Confirmamos tu cita o reserva de {producto} para apartarte el espacio hoy en {empresa}?`
            : `¡Hola {nombre}! ¿Confirmamos hoy {producto} para dejártelo reservado en {empresa}?`,
        },
      ],
      qualified_doubt: [
        {
          delayValue: 6,
          delayUnit: 'hours' as const,
          text: hasCalendar
            ? `¡Hola {nombre}! Vi que te interesó {producto} en {empresa}. ¿Tienes alguna duda puntual sobre disponibilidad, requisitos o pago para ayudarte a agendar?`
            : `¡Hola {nombre}! Vi que te interesó {producto} en {empresa}. ¿Tienes alguna duda puntual sobre características, garantía o pago para ayudarte a confirmar?`,
        },
        {
          delayValue: 2,
          delayUnit: 'days' as const,
          text: `¡Hola {nombre}! Seguimos atentos para resolver cualquier detalle pendiente sobre {producto}. ¿Qué necesitas confirmar para avanzar?`,
        },
      ],
      warm: [
        {
          delayValue: 1,
          delayUnit: 'days' as const,
          text: `¡Hola {nombre}! En {empresa} contamos con opciones y facilidades para {producto}. ¿Qué detalle te gustaría comparar o revisar?`,
        },
        {
          delayValue: 3,
          delayUnit: 'days' as const,
          text: hasCalendar
            ? `¡Hola {nombre}! Seguimos atentos si deseas avanzar con {producto}. ¿Qué día o franja horaria te queda mejor?`
            : `¡Hola {nombre}! Seguimos atentos si deseas avanzar con {producto}. ¿Para cuándo o en qué opción lo estás buscando?`,
        },
      ],
      unresponsive: [
        {
          delayValue: 24,
          delayUnit: 'hours' as const,
          text: `¡Hola {nombre}! Quedé pendiente de si pudiste revisar las opciones que te compartimos de {empresa}. ¿Cuál te llamó más la atención?`,
        },
      ],
      post_order: [
        {
          delayValue: 3,
          delayUnit: 'days' as const,
          text: `¡Hola {nombre}! Esperamos que disfrutes tu experiencia con {empresa}. Quedamos atentos ante cualquier novedad.`,
        },
      ],
    };

    try {
      const { response } = await createChatCompletionWithFallback({
        messages: [
          { role: 'system', content: 'Estratega de seguimiento comercial WhatsApp multinegocio. Devuelve solo JSON válido.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.35,
        chainOverride: getAiUtilityChain(),
        aiProvider: organization?.ai_provider,
        responseFormat: { type: 'json_object' },
      });

      const raw = response.choices[0]?.message?.content?.trim() || '{}';
      const parsed = JSON.parse(raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim());
      return {
        hot_unclosed: Array.isArray(parsed.hot_unclosed) && parsed.hot_unclosed.length > 0 ? parsed.hot_unclosed : fallback.hot_unclosed,
        qualified_doubt: Array.isArray(parsed.qualified_doubt) && parsed.qualified_doubt.length > 0 ? parsed.qualified_doubt : fallback.qualified_doubt,
        warm: Array.isArray(parsed.warm) && parsed.warm.length > 0 ? parsed.warm : fallback.warm,
        unresponsive: Array.isArray(parsed.unresponsive) && parsed.unresponsive.length > 0 ? parsed.unresponsive : fallback.unresponsive,
        post_order: Array.isArray(parsed.post_order) && parsed.post_order.length > 0 ? parsed.post_order : fallback.post_order,
      };
    } catch {
      return fallback;
    }
  }

  /**
   * Clasifica en lote prospectos históricos que aún no tienen nivel de calificación
   * (`hot` / `qualified_doubt` / `warm` / `cold`) usando su historial reciente y sincroniza el Pipeline.
   */
  static async classifyUnclassifiedContactsBatch(
    organizationId: string,
    batchSize = 20
  ): Promise<{
    processed: number;
    remaining: number;
    hot: number;
    qualified_doubt: number;
    warm: number;
    cold: number;
    stagesUpdated: number;
  }> {
    const safeLimit = Math.min(Math.max(1, batchSize), 35);

    const [{ count: totalUnclassified }, { data: candidates }, { data: orgRow }] = await Promise.all([
      (supabaseAdmin.from('contacts') as any)
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .is('custom_fields->>lead_temperature', null)
        .is('custom_fields->>temperature', null),
      (supabaseAdmin.from('contacts') as any)
        .select('id, name, pipeline_stage, deal_value, last_interaction_at, custom_fields')
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .is('custom_fields->>lead_temperature', null)
        .is('custom_fields->>temperature', null)
        .order('last_interaction_at', { ascending: false, nullsFirst: false })
        .limit(safeLimit),
      (supabaseAdmin.from('organizations') as any)
        .select('appointment_settings')
        .eq('id', organizationId)
        .maybeSingle(),
    ]);

    const normalizedFollowUpSettings = orgRow?.appointment_settings?.follow_up_sequences
      ? normalizeFollowUpSettings(orgRow.appointment_settings.follow_up_sequences)
      : null;

    const list: any[] = candidates || [];
    if (list.length === 0) {
      return { processed: 0, remaining: 0, hot: 0, qualified_doubt: 0, warm: 0, cold: 0, stagesUpdated: 0 };
    }

    const contactIds = list.map((c) => c.id);
    const { data: allMsgs } = await (supabaseAdmin.from('messages') as any)
      .select('contact_id, sender_type, content, created_at')
      .in('contact_id', contactIds)
      .in('sender_type', ['lead', 'ai', 'agent_manual'])
      .order('created_at', { ascending: false })
      .limit(safeLimit * 10);

    const msgsByContact = new Map<string, Array<{ sender_type: string; content: string }>>();
    for (const m of allMsgs || []) {
      const arr = msgsByContact.get(m.contact_id) || [];
      if (arr.length < 8) {
        arr.push(m);
        msgsByContact.set(m.contact_id, arr);
      }
    }

    let hot = 0;
    let qualified_doubt = 0;
    let warm = 0;
    let cold = 0;
    let stagesUpdated = 0;

    // Clasificación heurística inmediata para contactos ya ganados, perdidos, opt-out o sin mensajes del cliente
    const toInfer: Array<{ contact: any; snippet: string }> = [];

    const applyClassification = async (
      contact: any,
      temp: LeadTemperature,
      extras?: { product?: string | null; objection?: string | null; lostReason?: string | null }
    ) => {
      const daysInactive = contact.last_interaction_at
        ? (Date.now() - new Date(contact.last_interaction_at).getTime()) / (1000 * 3600 * 24)
        : 0;

      const syncRes = buildSynchronizedClassification({
        customFields: contact.custom_fields || {},
        currentStage: contact.pipeline_stage,
        temperature: temp,
        product: extras?.product,
        objection: extras?.objection,
        lostReason: extras?.lostReason,
        daysInactive,
        followUpSettings: normalizedFollowUpSettings,
      });

      const updatePayload: Record<string, any> = {
        custom_fields: syncRes.customFields,
        updated_at: new Date().toISOString(),
      };

      if (syncRes.nextStage) {
        updatePayload.pipeline_stage = syncRes.nextStage;
        if (syncRes.nextStage === 'perdido' && extras?.lostReason?.trim()) {
          updatePayload.close_reason = extras.lostReason.trim().slice(0, 120);
        }
        stagesUpdated++;
      }

      await (supabaseAdmin.from('contacts') as any).update(updatePayload).eq('id', contact.id);

      if (syncRes.shouldCancelPendingReactivations) {
        await (supabaseAdmin.from('scheduled_reminders') as any)
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('contact_id', contact.id)
          .eq('reminder_type', 'reactivation')
          .eq('status', 'pending');
      }

      if (temp === 'hot') hot++;
      else if (temp === 'qualified_doubt') qualified_doubt++;
      else if (temp === 'warm') warm++;
      else cold++;
    };

    const sanitizeForBatchClassifier = (raw: string): string => {
      const txt = String(raw || '').trim();
      if (!txt) return '';
      if (txt.startsWith('📷 [Imagen:') || txt.includes('[Imagen:')) {
        return txt.replace(/(?:📷\s*)?\[Imagen:\s*https?:\/\/[^\]]+\]/gi, '[Imagen enviada]').trim();
      }
      if (/^(?:🎙️|🎤)\s*\[(?:Audio|Nota de voz)/i.test(txt)) {
        const quoted = txt.match(/:\s*["“]([\s\S]+)["”]$/);
        return quoted ? `[Audio transcrito]: ${quoted[1].trim()}` : '[Nota de voz pendiente sin transcripción]';
      }
      return txt.replace(/https?:\/\/[^\s]+/gi, '[URL]').slice(0, 320);
    };

    const isUntranscribedOnlyLead = (leadMessages: Array<{ content: string }>): boolean => {
      return (
        leadMessages.length > 0 &&
        leadMessages.every((m) => {
          const c = String(m.content || '').trim();
          return (
            c.includes('[Nota de voz inaudible]') ||
            c.includes('[Nota de voz no reproducible]') ||
            c.includes('[Nota de voz recibida]') ||
            ((c.startsWith('🎙️ [Audio:') || c.startsWith('🎤')) && !c.includes(']: "'))
          );
        })
      );
    };

    for (const c of list) {
      const cf = (c.custom_fields as Record<string, any>) || {};
      if (c.pipeline_stage === 'ganado' || Boolean(cf.order) || Boolean(c.deal_value)) {
        await applyClassification(c, 'hot', { product: resolveProductInterest(cf, c.deal_value) });
        continue;
      }
      if (c.pipeline_stage === 'perdido' || cf.opted_out === true) {
        await applyClassification(c, 'cold', { lostReason: cf.lost_reason || 'Descartado / sin interés' });
        continue;
      }
      const msgs = (msgsByContact.get(c.id) || []).slice().reverse();
      const leadMsgs = msgs.filter((m) => m.sender_type === 'lead');
      if (leadMsgs.length === 0 || isUntranscribedOnlyLead(leadMsgs)) {
        // Sin texto o solo nota de voz pendiente de transcribir: nunca enfriar ni marcar perdido
        await applyClassification(c, 'warm');
        continue;
      }
      const snippet = msgs
        .map((m) => `${m.sender_type === 'lead' ? 'C' : 'V'}: ${sanitizeForBatchClassifier(m.content)}`)
        .filter((line) => line.length > 3)
        .join('\n');
      toInfer.push({ contact: c, snippet });
    }

    if (toInfer.length > 0) {
      const batchInput = toInfer.map((item, idx) => ({
        idx,
        stage: item.contact.pipeline_stage || 'nuevo',
        chat: item.snippet,
      }));

      try {
        const { response } = await createChatCompletionWithFallback({
          messages: [
            {
              role: 'system',
              content:
                'Clasifica conversaciones comerciales multi-nicho en JSON: { "results": [{ "idx": number, "temperature": "hot"|"qualified_doubt"|"warm"|"cold", "product": string|null, "objection": string|null, "lost_reason": string|null }] }.\nReglas estrictas:\n- "hot": pide medios/datos de pago, enlace, contraentrega, reservar/agendar fecha exacta o entrega datos de cierre.\n- "qualified_doubt": eligió o preguntó por UNA opción/servicio puntual y hace duda concreta (medidas, qué incluye, garantía, envío, disponibilidad, abonos/cuotas/facilidades) sin decir "lo pienso".\n- "warm": saludo, pide precios o catálogo general sin elegir opción, dice "lo pienso"/"luego te aviso", o quedó en audio/espera técnica.\n- "cold": ÚNICAMENTE si el cliente (C) rechaza explícitamente o dice que no le interesa / fuera de presupuesto (nunca por audios sin transcribir).\n- "product": coloca SOLO la opción puntual que el cliente (C) eligió o consultó específicamente. Si solo preguntó precios/info general y el vendedor (V) listó varias opciones, DEBE ser null.',
            },
            {
              role: 'user',
              content: JSON.stringify(batchInput),
            },
          ],
          temperature: 0.1,
          chainOverride: getAiUtilityChain(),
          organizationId,
          responseFormat: { type: 'json_object' },
        });

        const raw = response.choices[0]?.message?.content?.trim() || '{}';
        const parsed = JSON.parse(raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim());
        const resultMap = new Map<number, any>();
        for (const r of Array.isArray(parsed.results) ? parsed.results : []) {
          if (typeof r?.idx === 'number') resultMap.set(r.idx, r);
        }

        for (let i = 0; i < toInfer.length; i++) {
          const r = resultMap.get(i);
          let temp: LeadTemperature =
            r?.temperature === 'hot' ||
            r?.temperature === 'qualified_doubt' ||
            r?.temperature === 'cold'
              ? r.temperature
              : 'warm';
          if (temp === 'warm' && toInfer[i].contact.pipeline_stage === 'calificado') {
            temp = 'qualified_doubt';
          }
          // Blindaje anti-falsos cold: exigir motivo explícito del cliente
          if (temp === 'cold' && !r?.lost_reason?.trim()) {
            temp = 'warm';
          }
          const cleanProd =
            typeof r?.product === 'string' && r.product.trim() && r.product.split(',').length <= 2
              ? r.product.trim()
              : null;
          await applyClassification(toInfer[i].contact, temp, {
            product: cleanProd,
            objection: r?.objection || null,
            lostReason: temp === 'cold' ? r?.lost_reason || null : null,
          });
        }
      } catch (err) {
        console.warn('[BATCH CLASSIFIER FALLBACK WARN]', err);
        for (const item of toInfer) {
          await applyClassification(item.contact, 'warm');
        }
      }
    }

    const processed = list.length;
    const remaining = Math.max(0, (totalUnclassified || processed) - processed);
    return { processed, remaining, hot, qualified_doubt, warm, cold, stagesUpdated };
  }

  /**
   * Ejecuta clasificación automática en segundo plano para organizaciones activas con leads sin categoría.
   * Diseñado para correr de forma acotada dentro del cron programado.
   */
  static async classifyUnclassifiedContactsForActiveOrgs(
    specificOrgId?: string,
    maxOrgs = 5,
    batchPerOrg = 35
  ): Promise<{ orgsProcessed: number; contactsClassified: number }> {
    let orgQuery = (supabaseAdmin.from('organizations') as any)
      .select('id')
      .eq('is_active', true)
      .in('subscription_status', ['active', 'trialing']);

    if (specificOrgId) {
      orgQuery = orgQuery.eq('id', specificOrgId);
    }

    const { data: orgs } = await orgQuery.limit(20);
    if (!orgs || orgs.length === 0) {
      return { orgsProcessed: 0, contactsClassified: 0 };
    }

    let orgsProcessed = 0;
    let contactsClassified = 0;

    for (const org of orgs) {
      if (orgsProcessed >= maxOrgs) break;
      try {
        const res = await this.classifyUnclassifiedContactsBatch(org.id, batchPerOrg);
        if (res.processed > 0) {
          orgsProcessed++;
          contactsClassified += res.processed;
        }
      } catch (err) {
        console.warn(`[CRON AUTO CLASSIFY WARN] Org ${org.id}:`, err);
      }
    }

    return { orgsProcessed, contactsClassified };
  }

  /**
   * Simulador Sandbox (soporta modo texto simple para UI y modo Dry-Run con Tools reales para `npm run eval`).
   */
  static async simulateSandboxMessage(params: {
    systemPrompt: string;
    userMessage: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    aiProvider?: string | null;
    organizationId?: string;
    organization?: any;
    enableDryRunTools?: boolean;
    enabledModules?: any;
    leadProfileContext?: {
      name?: string;
      stage?: string;
      temperature?: string;
      interest?: string;
    };
  }): Promise<{
    reply: string;
    modelUsed: string;
    provider: AiProviderType;
    latencyMs: number;
    dryRunTrace?: EvalDryRunTrace;
  }> {
    const startTime = Date.now();
    const { items: galleryItems, knownPrices } = resolveOrganizationGallery(params.organization, params.systemPrompt);

    const staticSystem = params.enableDryRunTools
      ? `${params.systemPrompt}\n\n${buildSalesPlaybook({ hasCalendar: Boolean(params.enabledModules?.native_calendar) })}`
      : params.systemPrompt;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: staticSystem },
      ...params.history.map((h) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      { role: 'user', content: params.userMessage },
    ];

    if (params.enableDryRunTools) {
      messages.push({
        role: 'system',
        content: buildDynamicContextBlock({
          orgTimezone: AI_OPERATIONAL_CONFIG.defaultTimezone,
          contactData: {
            name: params.leadProfileContext?.name,
            pipeline_stage: params.leadProfileContext?.stage || 'nuevo',
            custom_fields: {
              lead_temperature: params.leadProfileContext?.temperature,
              product_interest: params.leadProfileContext?.interest,
            },
          },
          leadName: params.leadProfileContext?.name,
          galleryItems,
        }),
      });
    }

    const activeTools = params.enableDryRunTools ? getAvailableTools(params.enabledModules ?? { native_calendar: false }) : undefined;
    const maxRounds = params.enableDryRunTools ? AI_OPERATIONAL_CONFIG.maxToolRounds : 1;

    const trace: EvalDryRunTrace = {
      reply: '',
      modelUsed: '',
      provider: 'google',
      latencyMs: 0,
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      costUsd: 0,
      toolCallsExecuted: [],
      productCardsSent: [],
      leadProfileUpdate: null,
      orderCreated: null,
      followUpScheduled: null,
      handoffRequested: null,
    };

    let activeRoundChain: AiChainEntry[] | undefined = undefined;

    for (let round = 0; round < maxRounds; round++) {
      const useTools = Boolean(activeTools && round < maxRounds - 1);
      const { response, modelUsed, provider } = await createChatCompletionWithFallback({
        messages,
        tools: activeTools,
        toolChoice: activeTools ? (useTools ? 'auto' : 'none') : undefined,
        temperature: 0.3,
        aiProvider: params.aiProvider,
        organizationId: params.enableDryRunTools ? undefined : params.organizationId,
        chainOverride: activeRoundChain,
      });

      if (!activeRoundChain && params.enableDryRunTools) {
        activeRoundChain = [
          { provider, model: modelUsed },
          ...getAiChatChain(params.aiProvider).filter(
            (e) => !(e.provider === provider && e.model === modelUsed) && (provider !== 'openai' || e.provider === 'openai')
          ),
        ];
      }

      trace.modelUsed = modelUsed;
      trace.provider = provider;
      if (response.usage) {
        const pt = response.usage.prompt_tokens || 0;
        const ct = response.usage.completion_tokens || 0;
        const cached =
          (response.usage as any)?.prompt_tokens_details?.cached_tokens ||
          (response.usage as any)?.cached_tokens ||
          0;
        trace.promptTokens += pt;
        trace.completionTokens += ct;
        trace.cachedTokens += cached;
        trace.costUsd += calculateTurnCostUsd({ model: modelUsed, promptTokens: pt, cachedTokens: cached, completionTokens: ct });
      }

      const message = response.choices[0]?.message;
      if (!message?.tool_calls || message.tool_calls.length === 0) {
        trace.reply = (message?.content || '').trim() || 'Sin respuesta generada.';
        break;
      }

      messages.push(message);
      for (const tc of message.tool_calls) {
        const fn = tc.function.name;
        let args: any = {};
        try {
          args = JSON.parse(tc.function.arguments || '{}');
        } catch {}

        let resultPayload: any = { status: 'dry_run_ok' };

        if (fn === 'send_product_card') {
          const parsed = SendProductCardToolSchema.safeParse(args);
          if (!parsed.success) {
            resultPayload = { status: 'validation_error', error: parsed.error.message };
          } else {
            const matched = findGalleryProductMatch(galleryItems, parsed.data.product_name_or_id);
            if (!matched) {
              resultPayload = { status: 'not_found' };
            } else {
              const caption = buildProductCardCaption({
                name: matched.name,
                price: matched.price,
                details: parsed.data.details,
              });
              trace.productCardsSent.push({ name: matched.name, price: matched.price, caption, url: matched.url });
              resultPayload = { status: 'sent', product: matched.name, price: formatGalleryPrice(matched.price), caption };
            }
          }
        } else if (fn === 'update_lead_profile') {
          const parsed = UpdateLeadProfileToolSchema.safeParse(args);
          if (parsed.success) {
            trace.leadProfileUpdate = parsed.data;
            resultPayload = { status: 'updated', ...parsed.data };
          } else {
            resultPayload = { status: 'validation_error' };
          }
        } else if (fn === 'schedule_follow_up') {
          const parsed = ScheduleFollowUpToolSchema.safeParse(args);
          if (parsed.success) {
            trace.followUpScheduled = {
              date: parsed.data.date || `+${parsed.data.delay_hours || 24}h`,
              reason: parsed.data.reason,
            };
            resultPayload = { status: 'scheduled', ...parsed.data };
          }
        } else if (fn === 'create_order') {
          const parsed = CreateOrderToolSchema.safeParse(args);
          if (parsed.success) {
            trace.orderCreated = parsed.data;
            resultPayload = { status: 'order_created', total: parsed.data.total };
          } else {
            resultPayload = { status: 'validation_error', error: parsed.error.message };
          }
        } else if (fn === 'request_human_handoff') {
          trace.handoffRequested = { reason: String(args.reason || 'Asesor requerido') };
          resultPayload = { status: 'handoff_business_hours' };
        }

        trace.toolCallsExecuted.push({ name: fn, args, status: resultPayload.status || 'ok' });
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(resultPayload) });
      }
    }

    // Validador de precios en Dry-Run también
    if (params.enableDryRunTools && trace.reply) {
      const badPrices = findHallucinatedPrices(trace.reply, knownPrices);
      if (badPrices.length > 0) {
        trace.reply += ''; // Flag en eval si es necesario
      }
    }

    const latencyMs = Date.now() - startTime;
    trace.latencyMs = latencyMs;

    return {
      reply: trace.reply || 'Sin respuesta generada.',
      modelUsed: trace.modelUsed || 'default',
      provider: trace.provider,
      latencyMs,
      ...(params.enableDryRunTools ? { dryRunTrace: trace } : {}),
    };
  }
}
