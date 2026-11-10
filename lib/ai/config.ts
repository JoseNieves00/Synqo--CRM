/**
 * Configuración centralizada del motor de Inteligencia Artificial (Synqo CRM).
 * Única fuente de verdad para enrutamiento de modelos, precios por token, límites
 * operativos y variantes neutrales de texto multi-tenant.
 */

export type AiProviderType = 'google' | 'openai';

export interface AiChainEntry {
  provider: AiProviderType;
  model: string;
}

export interface ModelPricing {
  input: number;       // USD por 1M tokens de entrada sin caché
  cachedInput: number; // USD por 1M tokens de entrada cacheados
  output: number;      // USD por 1M tokens de salida
}

const DEFAULT_MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-4o-mini': { input: 0.15, cachedInput: 0.075, output: 0.60 },
  'gpt-4o': { input: 2.50, cachedInput: 1.25, output: 10.00 },
  'gpt-4.1-mini': { input: 0.40, cachedInput: 0.10, output: 1.60 },
  'gpt-4.1-nano': { input: 0.10, cachedInput: 0.025, output: 0.40 },
  'gemini-3.5-flash-lite': { input: 0.075, cachedInput: 0.01875, output: 0.30 },
  'gemini-3.5-flash': { input: 0.15, cachedInput: 0.0375, output: 0.60 },
  'gemini-3.1-flash-lite': { input: 0.075, cachedInput: 0.01875, output: 0.30 },
  'gemini-2.5-flash': { input: 0.15, cachedInput: 0.0375, output: 0.60 },
  'gemini-2.5-flash-lite': { input: 0.075, cachedInput: 0.01875, output: 0.30 },
  'gemini-flash-latest': { input: 0.10, cachedInput: 0.025, output: 0.40 },
  'gemini-1.5-flash': { input: 0.075, cachedInput: 0.01875, output: 0.30 },
  default: { input: 0.15, cachedInput: 0.075, output: 0.60 },
};

function parsePositiveInt(val: string | undefined, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export const AI_OPERATIONAL_CONFIG = {
  get timeoutMs(): number {
    return parsePositiveInt(process.env.AI_TIMEOUT_MS, 12000);
  },
  get fallbackTimeoutMs(): number {
    return parsePositiveInt(process.env.AI_FALLBACK_TIMEOUT_MS, 15000);
  },
  get historyLimit(): number {
    return parsePositiveInt(process.env.AI_HISTORY_LIMIT, 12);
  },
  get summaryEveryMessages(): number {
    return parsePositiveInt(process.env.AI_SUMMARY_EVERY, 8);
  },
  get maxToolRounds(): number {
    return parsePositiveInt(process.env.AI_MAX_TOOL_ROUNDS, 3);
  },
  get debounceMs(): number {
    return parsePositiveInt(process.env.AI_DEBOUNCE_MS, 3500);
  },
  get debounceMaxMs(): number {
    return parsePositiveInt(process.env.AI_DEBOUNCE_MAX_MS, 9000);
  },
  get imageHistoryPlaceholder(): string {
    return '[Imagen previa ya revisada]';
  },
  get transcriptionModel(): string {
    return (process.env.AI_TRANSCRIPTION_MODEL || 'whisper-1').trim();
  },
  get defaultTimezone(): string {
    return (process.env.DEFAULT_TIMEZONE || 'America/Bogota').trim();
  },
};

/**
 * Límites y umbrales centralizados del Asistente de Prompt (cortesía Synqo sin cobro al cupo del cliente).
 */
export const PROMPT_ASSISTANT_CONFIG = {
  get dailyTokenCap(): number {
    return parsePositiveInt(process.env.PROMPT_ASSISTANT_DAILY_TOKEN_CAP, 50000);
  },
  get weeklyTokenCap(): number {
    return parsePositiveInt(process.env.PROMPT_ASSISTANT_WEEKLY_TOKEN_CAP, 150000);
  },
  get weeklyAuditReserveTokens(): number {
    return parsePositiveInt(process.env.PROMPT_ASSISTANT_AUDIT_RESERVE_TOKENS, 15000);
  },
  get clientWarningPct(): number {
    return parsePositiveInt(process.env.PROMPT_ASSISTANT_WARNING_PCT, 75);
  },
  get targetPromptTokens(): number {
    return parsePositiveInt(process.env.PROMPT_TARGET_TOKENS, 1800);
  },
  get maxAudioSeconds(): number {
    return parsePositiveInt(process.env.PROMPT_ASSISTANT_MAX_AUDIO_SEC, 120);
  },
  get pdfMaxPages(): number {
    return parsePositiveInt(process.env.PROMPT_ASSISTANT_PDF_MAX_PAGES, 10);
  },
  get catalogInlineMax(): number {
    return parsePositiveInt(process.env.PROMPT_ASSISTANT_CATALOG_INLINE_MAX, 15);
  },
};

function normalizeProvider(raw: string): AiProviderType {
  const clean = raw.trim().toLowerCase();
  return clean === 'openai' ? 'openai' : 'google';
}

function parseChainEntry(raw: string): AiChainEntry | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx === -1) {
    const isGoogle = trimmed.toLowerCase().includes('gemini');
    return { provider: isGoogle ? 'google' : 'openai', model: trimmed };
  }
  const prov = normalizeProvider(trimmed.slice(0, colonIdx));
  const model = trimmed.slice(colonIdx + 1).trim();
  if (!model) return null;
  return { provider: prov, model };
}

/**
 * Devuelve la cadena ordenada de proveedor:modelo para el chat principal.
 * Configurable vía AI_CHAT_CHAIN (ej: "gemini:gemini-3.5-flash-lite,openai:gpt-4o-mini").
 */
export function getAiChatChain(aiProviderPreference?: string | null): AiChainEntry[] {
  const envChain = (process.env.AI_CHAT_CHAIN || '').trim();
  const defaultPrimaryGemini = (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim();
  const defaultOpenAi = (process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini').trim();

  const rawEntries = envChain
    ? envChain.split(',').map(parseChainEntry).filter((x): x is AiChainEntry => Boolean(x))
    : [
        { provider: 'google' as const, model: defaultPrimaryGemini },
        { provider: 'google' as const, model: 'gemini-3.5-flash-lite' },
        { provider: 'openai' as const, model: defaultOpenAi },
      ];

  // Deduplicar manteniendo orden
  const seen = new Set<string>();
  const deduped: AiChainEntry[] = [];
  for (const item of rawEntries) {
    const key = `${item.provider}:${item.model}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  // Respetar preferencia explícita del tenant por OpenAI si fue configurada
  if (aiProviderPreference?.toLowerCase() === 'openai') {
    const openAiEntries = deduped.filter((e) => e.provider === 'openai');
    const googleEntries = deduped.filter((e) => e.provider === 'google');
    return [...openAiEntries, ...googleEntries];
  }

  return deduped;
}

/**
 * Devuelve la cadena para tareas utilitarias (resúmenes, catálogo, sugerencias de seguimiento).
 * Configurable vía AI_UTILITY_MODEL (ej: "gemini:gemini-3.5-flash-lite" o "openai:gpt-4o-mini").
 */
export function getAiUtilityChain(): AiChainEntry[] {
  const envUtility = (process.env.AI_UTILITY_MODEL || '').trim();
  const defaultOpenAi = (process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini').trim();
  const defaultGemini = (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim();

  const parsed = envUtility ? parseChainEntry(envUtility) : null;
  const list: AiChainEntry[] = parsed
    ? [parsed, { provider: 'openai', model: defaultOpenAi }]
    : [
        { provider: 'google', model: defaultGemini },
        { provider: 'openai', model: defaultOpenAi },
      ];

  const seen = new Set<string>();
  return list.filter((item) => {
    const k = `${item.provider}:${item.model}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

let cachedEnvPricing: Record<string, ModelPricing> | null = null;
let cachedEnvPricingRaw: string | undefined;

function getPricingTable(): Record<string, ModelPricing> {
  const raw = process.env.AI_MODEL_PRICING;
  if (cachedEnvPricing && cachedEnvPricingRaw === raw) {
    return cachedEnvPricing;
  }
  let merged = { ...DEFAULT_MODEL_PRICING };
  if (raw && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        merged = { ...merged, ...parsed };
      }
    } catch {
      console.warn('[AI CONFIG WARN] AI_MODEL_PRICING no es JSON válido; usando precios por defecto.');
    }
  }
  cachedEnvPricing = merged;
  cachedEnvPricingRaw = raw;
  return merged;
}

export function getModelPricing(model: string | null | undefined): ModelPricing {
  const table = getPricingTable();
  if (!model) return table.default;
  const clean = model.trim();
  if (table[clean]) return table[clean];

  // Búsqueda por prefijo (ej: gpt-4o-mini-2024-07-18 -> gpt-4o-mini)
  const lower = clean.toLowerCase();
  const matchedKey = Object.keys(table).find(
    (k) => k !== 'default' && lower.startsWith(k.toLowerCase())
  );
  return matchedKey ? table[matchedKey] : table.default;
}

export function calculateTurnCostUsd(params: {
  model?: string | null;
  promptTokens?: number;
  cachedTokens?: number;
  completionTokens?: number;
}): number {
  const pricing = getModelPricing(params.model);
  const prompt = Math.max(0, Number(params.promptTokens || 0));
  const cached = Math.min(prompt, Math.max(0, Number(params.cachedTokens || 0)));
  const uncached = Math.max(0, prompt - cached);
  const completion = Math.max(0, Number(params.completionTokens || 0));

  return (
    (uncached * pricing.input +
      cached * pricing.cachedInput +
      completion * pricing.output) /
    1_000_000
  );
}

/**
 * Selector determinístico de variantes para evitar respuestas repetitivas/robóticas.
 */
function pickVariant(variants: string[], seed?: string): string {
  if (variants.length === 0) return '';
  if (!seed) return variants[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return variants[hash % variants.length];
}

export const AI_TEXT_TEMPLATES = {
  quotaExceeded(orgName?: string, seed?: string): string {
    const brand = orgName ? ` de ${orgName}` : '';
    return pickVariant(
      [
        `¡Hola! Con mucho gusto te atendemos${brand}. En un momento uno de nuestros asesores continúa contigo por este mismo chat.`,
        `¡Hola! Ya mismo paso tu consulta con un asesor${brand} para darte atención personalizada en unos minutos.`,
      ],
      seed
    );
  },

  untranscribedAudio(orgName?: string, seed?: string): string {
    const brand = orgName ? ` en ${orgName}` : '';
    return pickVariant(
      [
        `¡Hola! Recibí tu nota de voz, pero no se alcanzó a escuchar con total claridad. Ya se la pasé a uno de nuestros asesores${brand} para que la escuche y te responda en un momento 🙌.`,
        `¡Hola! Me llegó tu audio algo entrecortado y prefiero pasárselo a un asesor${brand} para que lo escuche bien y te dé la información exacta.`,
        `¡Hola! Tu nota de voz no se logró procesar con claridad; ya un asesor${brand} la va a escuchar personalmente para responderte enseguida 🙌.`,
      ],
      seed
    );
  },

  emergencyFallback(orgName?: string, seed?: string): string {
    const brand = orgName ? ` de ${orgName}` : '';
    return pickVariant(
      [
        `¡Hola! En un momento uno de nuestros asesores${brand} continúa contigo para darte toda la información con gusto.`,
        `¡Hola! Gracias por escribirnos${brand}. Enseguida te atiende personalmente un asesor de nuestro equipo.`,
      ],
      seed
    );
  },

  explicitHandoff(orgName?: string, seed?: string): string {
    const brand = orgName ? ` de ${orgName}` : '';
    return pickVariant(
      [
        `¡Claro que sí! Ya mismo paso tu conversación con uno de nuestros asesores${brand} para que te atienda personalmente.`,
        `Con mucho gusto, enseguida un asesor${brand} toma tu chat para ayudarte directamente.`,
        `¡Por supuesto! Ya le avisé a un asesor de nuestro equipo${brand} y te escribe en un momento.`,
      ],
      seed
    );
  },

  paymentReceiptAck(seed?: string): string {
    return pickVariant(
      [
        '¡Listo, recibido! Ya lo valido con el equipo y te confirmo enseguida.',
        '¡Recibido! Ya mismo verificamos el comprobante para confirmarte.',
      ],
      seed
    );
  },

  followUpSuggestionDefaultCta(): string {
    return '¿Te gustaría que te lo apartemos hoy o te ayudo con el valor del envío a tu ciudad?';
  },
};
