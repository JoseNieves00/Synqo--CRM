/**
 * Servicio puro de cálculo financiero y liquidez de créditos IA para Synqo Master ERP.
 */
import { estimateChatsFromTokens } from '@/lib/billing/plan-defaults';

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

export interface SmartBillingQuote {
  mode: 'end_of_month' | 'mid_month_recharge';
  daysRemainingInCycle: number;
  daysElapsedInCycle: number;
  dailyBurnRate: number;
  effectiveLimit: number;
  usedTokens: number;
  overageTokens: number;
  overageCop: number;
  recommendedRechargeTokens: number;
  recommendedRechargeCop: number;
  monthlyBaseCop: number;
  totalToCollectCop: number;
}

/**
 * Calcula excedente acumulado, proyección estadística para cerrar el mes
 * y el monto sugerido (editable en UI) para Cotizar & Cobrar.
 */
export function calculateSmartOverageAndRechargeQuote(params: {
  usedTokens: number;
  baseLimit: number;
  extraBalance?: number;
  billingDueDay?: number | null;
  billingCycleEndsAt?: string | null;
  monthlyBasePriceCop?: number;
  overagePricePer1MCop?: number;
  now?: Date;
}): SmartBillingQuote {
  const now = params.now || new Date();
  const effectiveLimit = Math.max(1, Number(params.baseLimit || 5_000_000)) + Math.max(0, Number(params.extraBalance || 0));
  const usedTokens = Math.max(0, Number(params.usedTokens || 0));
  const overageTokens = Math.max(0, usedTokens - effectiveLimit);

  const monthlyBaseCop = Math.max(0, Math.round(Number(params.monthlyBasePriceCop ?? 169000)));
  const pricePer1M = Math.max(1, Math.round(Number(params.overagePricePer1MCop ?? 20000)));

  let daysRemainingInCycle = 15;
  if (params.billingCycleEndsAt) {
    const endMs = new Date(params.billingCycleEndsAt).getTime();
    if (Number.isFinite(endMs)) {
      daysRemainingInCycle = Math.max(0, Math.ceil((endMs - now.getTime()) / (24 * 60 * 60 * 1000)));
    }
  } else if (params.billingDueDay && params.billingDueDay >= 1 && params.billingDueDay <= 31) {
    const target = new Date(now.getFullYear(), now.getMonth(), params.billingDueDay);
    if (target.getTime() < now.getTime()) {
      target.setMonth(target.getMonth() + 1);
    }
    daysRemainingInCycle = Math.max(0, Math.ceil((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
  }

  const daysElapsedInCycle = Math.max(1, 30 - Math.min(30, daysRemainingInCycle));
  const dailyBurnRate = Math.round(usedTokens / daysElapsedInCycle);

  const mode: 'end_of_month' | 'mid_month_recharge' =
    daysRemainingInCycle <= 5 ? 'end_of_month' : 'mid_month_recharge';

  const overageCop = Math.round((overageTokens / 1_000_000) * pricePer1M);

  let recommendedRechargeTokens = 0;
  if (mode === 'mid_month_recharge') {
    const projectedNeed = Math.max(0, dailyBurnRate * daysRemainingInCycle * 1.15 - Math.max(0, effectiveLimit - usedTokens));
    if (projectedNeed > 0 || overageTokens > 0) {
      const rawBlocks = Math.ceil(Math.max(1_000_000, projectedNeed) / 500_000);
      recommendedRechargeTokens = rawBlocks * 500_000;
    }
  }

  const recommendedRechargeCop = Math.round((recommendedRechargeTokens / 1_000_000) * pricePer1M);
  const totalToCollectCop =
    mode === 'end_of_month'
      ? monthlyBaseCop + overageCop
      : overageCop + recommendedRechargeCop;

  return {
    mode,
    daysRemainingInCycle,
    daysElapsedInCycle,
    dailyBurnRate,
    effectiveLimit,
    usedTokens,
    overageTokens,
    overageCop,
    recommendedRechargeTokens,
    recommendedRechargeCop,
    monthlyBaseCop,
    totalToCollectCop,
  };
}

export function buildQuoteWhatsAppUrl(params: {
  phone?: string | null;
  companyName: string;
  contactName?: string | null;
  mode: 'end_of_month' | 'mid_month_recharge' | 'new_client';
  overageTokens: number;
  overageCop: number;
  rechargeTokens: number;
  rechargeCop: number;
  monthlyBaseCop: number;
  totalCop: number;
  daysRemaining: number;
  baseTokensLimit?: number;
  maxUsers?: number;
  discountCop?: number;
}): string {
  const cleanPhone = String(params.phone || '').replace(/[^0-9]/g, '');
  const greeting = params.contactName ? `Hola ${params.contactName}` : 'Hola';
  const baseTokens = Math.max(5_000_000, Number(params.baseTokensLimit || 5_000_000));
  const baseChatsLabel = estimateChatsFromTokens(baseTokens);
  const overageChatsLabel = params.overageTokens > 0 ? estimateChatsFromTokens(params.overageTokens) : '';
  const rechargeChatsLabel = params.rechargeTokens > 0 ? estimateChatsFromTokens(params.rechargeTokens) : '';
  const discountLine =
    params.discountCop && params.discountCop > 0
      ? [`• Descuento aplicado: *-$${params.discountCop.toLocaleString('es-CO')} COP*`]
      : [];

  const lines =
    params.mode === 'new_client'
      ? [
          `${greeting}, te comparto la cotización de *Synqo CRM* para *${params.companyName}*:`,
          `• Capacidad mensual: *${baseChatsLabel}* (${baseTokens.toLocaleString('es-CO')} tokens IA)`,
          ...(params.maxUsers ? [`• Usuarios incluidos: *hasta ${params.maxUsers}*`] : []),
          `• Mensualidad: *$${params.monthlyBaseCop.toLocaleString('es-CO')} COP/mes*`,
          ...discountLine,
          ...(params.discountCop && params.discountCop > 0
            ? [`• Total con descuento: *$${params.totalCop.toLocaleString('es-CO')} COP*`]
            : []),
          `Una vez confirmemos el pago activamos tu cuenta de inmediato y ese día queda como tu fecha de pago mensual. ¿Confirmamos?`,
        ]
      : params.mode === 'end_of_month'
      ? [
          `${greeting}, te comparto la cuenta de cobro de *${params.companyName}* en Synqo:`,
          `• Mensualidad base (${baseChatsLabel}): *$${params.monthlyBaseCop.toLocaleString('es-CO')} COP*`,
          ...(params.overageTokens > 0
            ? [
                `• Excedente del ciclo (${overageChatsLabel} · +${params.overageTokens.toLocaleString('es-CO')} tok): *$${params.overageCop.toLocaleString('es-CO')} COP*`,
              ]
            : []),
          ...discountLine,
          `• Total a pagar: *$${params.totalCop.toLocaleString('es-CO')} COP*`,
          `Apenas confirmemos el pago queda renovado tu ciclo. ¿Confirmamos?`,
        ]
      : [
          `${greeting}, *${params.companyName}* superó su capacidad base del mes${
            params.overageTokens > 0
              ? ` (consumo adicional: ${overageChatsLabel} · +${params.overageTokens.toLocaleString('es-CO')} tok = $${params.overageCop.toLocaleString('es-CO')} COP)`
              : ''
          }.`,
          `Para cubrir los ${params.daysRemaining} días restantes del mes te recomiendo sumar *${rechargeChatsLabel}* (${params.rechargeTokens.toLocaleString('es-CO')} tokens IA) por *$${params.rechargeCop.toLocaleString('es-CO')} COP*.`,
          ...discountLine,
          `Total a pagar: *$${params.totalCop.toLocaleString('es-CO')} COP*. ¿Confirmamos?`,
        ];

  const text = encodeURIComponent(lines.join('\n'));
  return cleanPhone ? `https://wa.me/${cleanPhone}?text=${text}` : `https://wa.me/?text=${text}`;
}

export interface PendingQuoteRecord {
  id: string;
  companyName: string;
  adminName: string;
  adminEmail: string;
  phone: string;
  businessModel: 'products' | 'services' | 'hybrid';
  maxUsers: number;
  aiTokensLimit: number;
  monthlyBaseCop: number;
  createdAt: string;
  expiresAt?: string;
}

/**
 * Depura cotizaciones duplicadas, expiradas (>15 días) o ya creadas como empresas,
 * manteniendo un tope máximo de 30 borradores ordenados del más reciente al más antiguo.
 */
export function prunePendingQuotes(
  quotes: PendingQuoteRecord[],
  options?: { existingEmails?: Set<string>; now?: Date; maxItems?: number }
): PendingQuoteRecord[] {
  const nowMs = (options?.now || new Date()).getTime();
  const maxItems = options?.maxItems ?? 30;
  const existing = options?.existingEmails;
  const seen = new Set<string>();
  const valid: PendingQuoteRecord[] = [];

  const sorted = [...quotes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  for (const q of sorted) {
    const emailKey = String(q.adminEmail || '').trim().toLowerCase();
    if (!emailKey || seen.has(emailKey)) continue;
    if (existing?.has(emailKey)) continue;
    const expMs = q.expiresAt
      ? new Date(q.expiresAt).getTime()
      : new Date(q.createdAt).getTime() + 15 * 24 * 60 * 60 * 1000;
    if (Number.isFinite(expMs) && expMs < nowMs) continue;
    seen.add(emailKey);
    valid.push(q);
    if (valid.length >= maxItems) break;
  }

  return valid;
}
