export const DEFAULT_AI_TOKENS_LIMIT = 5_000_000;
export const DEFAULT_MAX_USERS = 5;
export const DEFAULT_OPENAI_BACKUP_LIMIT = 250_000;
export const EMPIRICAL_TOKENS_PER_CHAT = 12_500;
export const OPTIMIZED_TOKENS_PER_CHAT = 7_500;

export interface TokenPackPreset {
  slug: string;
  name: string;
  tokens: number;
  priceCop: number;
  priceUsd: number;
  description: string;
}

export const TOKEN_PACK_CATALOG: TokenPackPreset[] = [
  {
    slug: 'pack-impulso-2-5m',
    name: 'Pack Impulso (+2.5M)',
    tokens: 2_500_000,
    priceCop: 45_000,
    priceUsd: 10.71,
    description: 'Ideal para picos de fin de mes o campañas puntuales',
  },
  {
    slug: 'pack-crecimiento-5m',
    name: 'Pack Crecimiento (+5M)',
    tokens: 5_000_000,
    priceCop: 80_000,
    priceUsd: 19.05,
    description: 'Duplica la capacidad mensual habitual',
  },
  {
    slug: 'pack-temporada-10m',
    name: 'Pack Temporada (+10M)',
    tokens: 10_000_000,
    priceCop: 145_000,
    priceUsd: 34.52,
    description: 'Para lanzamientos, Black Friday o alto volumen',
  },
];

export interface PlanLimits {
  maxUsers: number;
  aiTokensLimit: number;
  openaiBackupLimit: number;
  estimatedChats: string;
  label: string;
}

const defaultLimits: PlanLimits = {
  maxUsers: DEFAULT_MAX_USERS,
  aiTokensLimit: DEFAULT_AI_TOKENS_LIMIT,
  openaiBackupLimit: DEFAULT_OPENAI_BACKUP_LIMIT,
  estimatedChats: 'Hasta ~400–650 conversaciones / mes',
  label: 'Licencia Completa',
};

/**
 * Mapeo retrocompatible que provee los límites base por defecto.
 */
export const PLAN_DEFAULTS: Record<string, PlanLimits> = new Proxy(
  {},
  {
    get: () => defaultLimits,
  }
);

/**
 * Formatea cuotas de tokens de forma compacta e intuitiva:
 * - 250,000 -> "250k"
 * - 500,000 -> "500k"
 * - 1,000,000 -> "1M"
 * - 2,500,000 -> "2.5M" (en vez de "2500k")
 * - 7,500,000 -> "7.5M" (en vez de "7500k")
 * - 10,000,000 -> "10M"
 */
export function formatTokenQuota(tokens: number): string {
  if (!tokens || tokens <= 0) return '0';
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return Number.isInteger(m) ? `${m}M` : `${parseFloat(m.toFixed(2))}M`;
  }
  const k = tokens / 1_000;
  return Number.isInteger(k) ? `${k}k` : `${parseFloat(k.toFixed(1))}k`;
}

/**
 * Formatea cuotas con descripción textual legible:
 * Ej: "2.5 Millones (2.5M)" o "500k tokens"
 */
export function formatTokenDetailed(tokens: number): string {
  if (!tokens || tokens <= 0) return '0 tokens';
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    const label = Number.isInteger(m) ? `${m}` : `${parseFloat(m.toFixed(2))}`;
    return `${label} Millones (${formatTokenQuota(tokens)})`;
  }
  return `${(tokens / 1000).toLocaleString()}k (${tokens.toLocaleString()} tokens)`;
}

/**
 * Estimación híbrida de volumen de conversaciones cubiertas.
 * Calibrada con datos reales de producción (~7,500 optimizado a ~12,500 tokens/chat)
 * o usando el promedio real de la empresa cuando está disponible.
 */
export function estimateChatsFromTokens(tokens: number, avgTokensPerChat?: number | null): string {
  if (!tokens || tokens <= 0) return '0 chats';
  if (avgTokensPerChat && avgTokensPerChat >= 1000) {
    const est = Math.max(1, Math.round(tokens / avgTokensPerChat));
    return `~${est.toLocaleString('es-CO')} chats`;
  }
  const minChats = Math.max(1, Math.round(tokens / EMPIRICAL_TOKENS_PER_CHAT));
  const maxChats = Math.max(minChats, Math.round(tokens / OPTIMIZED_TOKENS_PER_CHAT));
  return `~${minChats.toLocaleString('es-CO')} a ${maxChats.toLocaleString('es-CO')} chats`;
}
