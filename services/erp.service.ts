/**
 * Servicio puro de cálculo financiero y liquidez de créditos IA para Synqo Master ERP.
 */

export interface OrgTokenCommitmentInput {
  id: string;
  name: string;
  is_active: boolean;
  cycle_kind?: string | null;
  ai_tokens_used: number;
  ai_tokens_limit: number;
  extra_tokens_balance?: number;
}

export interface OpenAiWalletInput {
  balanceUsd: number;
  trmCopPerUsd: number;
  safetyBufferPct: number;
}

export interface OpenAiLiquidityForecast {
  activeOrgsCount: number;
  trialOrgsCount: number;
  committedRemainingTokens: number;
  estimatedCostPer1MTokensUsd: number;
  estimatedCommittedCostUsd: number;
  estimatedWithBufferUsd: number;
  recordedWalletBalanceUsd: number;
  spentSinceUpdateUsd: number;
  walletBalanceUsd: number;
  deficitUsd: number;
  deficitCop: number;
  surplusUsd: number;
  isSufficient: boolean;
}

// Costo real promedio ponderado observado en gpt-4o-mini (98.4% input @ $0.15/1M, 1.6% output @ $0.60/1M)
export const DEFAULT_BLENDED_COST_PER_1M_USD = 0.1572;

let cachedUsdCop: { rate: number; fetchedAt: number } | null = null;

/**
 * Obtiene la TRM en vivo USD -> COP desde open.er-api.com (cache 1 hora, fallback seguro).
 */
export async function fetchLiveUsdToCopRate(fallbackRate = 4200): Promise<{
  rate: number;
  source: 'live_api' | 'fallback';
}> {
  const now = Date.now();
  if (cachedUsdCop && now - cachedUsdCop.fetchedAt < 60 * 60 * 1000) {
    return { rate: cachedUsdCop.rate, source: 'live_api' };
  }
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: AbortSignal.timeout(3500),
      cache: 'no-store',
    });
    if (res.ok) {
      const json = await res.json();
      const cop = Number(json?.rates?.COP);
      if (Number.isFinite(cop) && cop > 1000) {
        const rounded = Math.round(cop);
        cachedUsdCop = { rate: rounded, fetchedAt: now };
        return { rate: rounded, source: 'live_api' };
      }
    }
  } catch {
    // fallback silencioso
  }
  return { rate: fallbackRate, source: 'fallback' };
}

export function calculateOpenAiLiquidityForecast(params: {
  organizations: OrgTokenCommitmentInput[];
  wallet: OpenAiWalletInput;
  spentSinceUpdateUsd?: number;
  costPer1MTokensUsd?: number;
}): OpenAiLiquidityForecast {
  const costPer1M =
    params.costPer1MTokensUsd && params.costPer1MTokensUsd > 0
      ? params.costPer1MTokensUsd
      : DEFAULT_BLENDED_COST_PER_1M_USD;

  let activeOrgsCount = 0;
  let trialOrgsCount = 0;
  let committedRemainingTokens = 0;

  for (const org of params.organizations) {
    if (org.is_active === false) continue;
    activeOrgsCount++;
    if (org.cycle_kind === 'trial') trialOrgsCount++;

    const effectiveLimit =
      Math.max(0, Number(org.ai_tokens_limit) || 0) +
      Math.max(0, Number(org.extra_tokens_balance) || 0);
    const used = Math.max(0, Number(org.ai_tokens_used) || 0);
    committedRemainingTokens += Math.max(0, effectiveLimit - used);
  }

  const estimatedCommittedCostUsd = Number(
    ((committedRemainingTokens / 1_000_000) * costPer1M).toFixed(2)
  );
  const bufferMultiplier = 1 + Math.max(0, Number(params.wallet.safetyBufferPct) || 0) / 100;
  const estimatedWithBufferUsd = Number((estimatedCommittedCostUsd * bufferMultiplier).toFixed(2));
  const recordedWalletBalanceUsd = Math.max(0, Number(params.wallet.balanceUsd) || 0);
  const spentSinceUpdateUsd = Number(Math.max(0, Number(params.spentSinceUpdateUsd) || 0).toFixed(4));
  const walletBalanceUsd = Number(Math.max(0, recordedWalletBalanceUsd - spentSinceUpdateUsd).toFixed(2));
  const trm = Math.max(1, Number(params.wallet.trmCopPerUsd) || 4200);

  const deficitUsd = Number(Math.max(0, estimatedWithBufferUsd - walletBalanceUsd).toFixed(2));
  const surplusUsd = Number(Math.max(0, walletBalanceUsd - estimatedWithBufferUsd).toFixed(2));
  const deficitCop = Math.round(deficitUsd * trm);

  return {
    activeOrgsCount,
    trialOrgsCount,
    committedRemainingTokens,
    estimatedCostPer1MTokensUsd: costPer1M,
    estimatedCommittedCostUsd,
    estimatedWithBufferUsd,
    recordedWalletBalanceUsd,
    spentSinceUpdateUsd,
    walletBalanceUsd,
    deficitUsd,
    deficitCop,
    surplusUsd,
    isSufficient: deficitUsd <= 0,
  };
}

export function estimateMarginalOpenAiCost(params: {
  tokens: number;
  trmCopPerUsd?: number;
  costPer1MTokensUsd?: number;
}): { usd: number; cop: number } {
  const costPer1M = params.costPer1MTokensUsd || DEFAULT_BLENDED_COST_PER_1M_USD;
  const trm = params.trmCopPerUsd || 4200;
  const usd = Number(((Math.max(0, params.tokens) / 1_000_000) * costPer1M).toFixed(2));
  return { usd, cop: Math.round(usd * trm) };
}

export interface CycleRolloverDecision {
  action: 'none' | 'reset_paid_cycle' | 'expire_trial';
  nextCycleEndsAt?: string;
}

/**
 * Evalúa si una organización venció su ciclo y debe resetear cupo o marcar prueba vencida.
 */
export function evaluateBillingCycleRollover(
  org: {
    is_active?: boolean;
    cycle_kind?: string | null;
    billing_cycle_ends_at?: string | null;
    paid_until_month?: string | null;
    subscription_status?: string | null;
  },
  now = new Date()
): CycleRolloverDecision {
  if (org.is_active === false || !org.billing_cycle_ends_at) {
    return { action: 'none' };
  }
  const endMs = new Date(org.billing_cycle_ends_at).getTime();
  if (!Number.isFinite(endMs) || endMs > now.getTime()) {
    return { action: 'none' };
  }

  if (org.cycle_kind === 'trial') {
    if (org.subscription_status === 'past_due') return { action: 'none' };
    return { action: 'expire_trial' };
  }

  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (org.paid_until_month && org.paid_until_month >= currentYm) {
    const nextEnd = new Date(endMs);
    nextEnd.setMonth(nextEnd.getMonth() + 1);
    return { action: 'reset_paid_cycle', nextCycleEndsAt: nextEnd.toISOString() };
  }

  return { action: 'none' };
}
