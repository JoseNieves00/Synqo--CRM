import { PlanType } from '@/lib/supabase/types';

export interface PlanLimits {
  maxUsers: number;
  aiTokensLimit: number;
  label: string;
}

export const PLAN_DEFAULTS: Record<string, PlanLimits> = {
  starter: { maxUsers: 2, aiTokensLimit: 500000, label: 'Starter (Validación)' },
  core: { maxUsers: 2, aiTokensLimit: 500000, label: 'Starter (Validación)' },
  pro: { maxUsers: 5, aiTokensLimit: 2500000, label: 'Pro (Comercial)' },
  enterprise: { maxUsers: 12, aiTokensLimit: 7500000, label: 'Enterprise (Corporativo)' },
};

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
 * Estimación de volumen de conversaciones cubiertas
 * (Promedio en OpenAI GPT-4o: ~1,000 a 1,400 tokens por chat comercial)
 */
export function estimateChatsFromTokens(tokens: number): string {
  if (!tokens || tokens <= 0) return '0 chats';
  const minChats = Math.round(tokens / 1400);
  const maxChats = Math.round(tokens / 1000);
  if (tokens >= 1_000_000) {
    return `~${minChats.toLocaleString()} a ${maxChats.toLocaleString()} chats`;
  }
  return `~${minChats} a ${maxChats} chats`;
}


