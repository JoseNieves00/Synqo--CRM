'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import {
  calculateOpenAiLiquidityForecast,
  evaluateBillingCycleRollover,
  fetchLiveUsdToCopRate,
  prunePendingQuotes,
  type OpenAiLiquidityForecast,
  type PendingQuoteRecord,
} from '@/services/erp.service';
import { calculateTurnCostUsd } from '@/lib/ai/config';
import { TOKEN_PACK_CATALOG } from '@/lib/billing/plan-defaults';

async function requireStrictSuperAdmin() {
  if (process.env.NODE_ENV === 'test') {
    return { userId: 'test-super-admin', email: 'test@synqo.dev' };
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('No autorizado: Inicia sesión para continuar.');
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('id, email, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_super_admin) {
    throw new Error('Acceso denegado: Se requieren privilegios de Super Administrador.');
  }

  return { userId: user.id as string, email: (profile.email || user.email || '') as string };
}

export async function getErpCreditsAndWalletAction(): Promise<{
  wallet: {
    balanceUsd: number;
    trmCopPerUsd: number;
    trmSource: 'live_api' | 'fallback';
    safetyBufferPct: number;
    notes: string;
    updatedAt: string | null;
  };
  forecast: OpenAiLiquidityForecast;
  packages: any[];
  recentLedger: any[];
}> {
  await requireStrictSuperAdmin();

  const [walletRes, orgsRes, pkgsRes, ledgerRes] = await Promise.all([
    (supabaseAdmin.from('ai_provider_wallet') as any).select('*').eq('id', 'openai_primary').maybeSingle(),
    (supabaseAdmin.from('organizations') as any).select(
      'id, name, is_active, cycle_kind, ai_tokens_used, ai_tokens_limit, extra_tokens_balance'
    ),
    (supabaseAdmin.from('token_packages') as any).select('*').order('sort_order', { ascending: true }),
    (supabaseAdmin.from('token_ledger') as any)
      .select('id, organization_id, entry_type, tokens_delta, balance_after_limit, notes, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const w = walletRes?.data;
  const liveTrm = await fetchLiveUsdToCopRate(Number(w?.trm_cop_per_usd ?? 4200));
  const walletUpdatedAt: string | null = w?.updated_at || null;

  // Descontar consumo real de OpenAI en ai_runs desde el último registro de saldo (vía RPC SQL sin límite de filas)
  let spentSinceUpdateUsd = 0;
  let observedBlendedCostPer1M: number | undefined = undefined;
  if (walletUpdatedAt && Number(w?.balance_usd ?? 0) > 0) {
    let rpcHandled = false;
    try {
      const { data: rpcSpend, error: rpcErr } = await (supabaseAdmin as any).rpc(
        'get_openai_spend_since',
        { p_since: walletUpdatedAt }
      );
      if (!rpcErr && Array.isArray(rpcSpend) && rpcSpend[0]) {
        spentSinceUpdateUsd = Number(rpcSpend[0].total_cost_usd || 0);
        const totalToks = Number(rpcSpend[0].total_tokens || 0);
        if (totalToks >= 50_000 && spentSinceUpdateUsd > 0) {
          observedBlendedCostPer1M = Number(((spentSinceUpdateUsd / totalToks) * 1_000_000).toFixed(4));
        }
        rpcHandled = true;
      }
    } catch {
      // Fallback si la RPC aún no está desplegada en BD
    }

    if (!rpcHandled) {
      const { data: openAiRuns } = await (supabaseAdmin.from('ai_runs') as any)
        .select('model, prompt_tokens, cached_tokens, completion_tokens, cost_usd')
        .eq('provider', 'openai')
        .gte('created_at', walletUpdatedAt)
        .limit(10000);
      if (Array.isArray(openAiRuns)) {
        let totalToks = 0;
        for (const r of openAiRuns) {
          const explicitCost = Number(r.cost_usd || 0);
          spentSinceUpdateUsd +=
            explicitCost > 0
              ? explicitCost
              : calculateTurnCostUsd({
                  model: r.model,
                  promptTokens: r.prompt_tokens,
                  cachedTokens: r.cached_tokens,
                  completionTokens: r.completion_tokens,
                });
          totalToks += Number(r.prompt_tokens || 0) + Number(r.completion_tokens || 0);
        }
        if (totalToks >= 50_000 && spentSinceUpdateUsd > 0) {
          observedBlendedCostPer1M = Number(((spentSinceUpdateUsd / totalToks) * 1_000_000).toFixed(4));
        }
      }
    }
  }

  const wallet = {
    balanceUsd: Number(w?.balance_usd ?? 0),
    trmCopPerUsd: liveTrm.rate,
    trmSource: liveTrm.source,
    safetyBufferPct: Number(w?.safety_buffer_pct ?? 15),
    notes: String(w?.notes || ''),
    updatedAt: walletUpdatedAt,
  };

  const orgs = Array.isArray(orgsRes?.data) ? orgsRes.data : [];
  const forecast = calculateOpenAiLiquidityForecast({
    organizations: orgs,
    wallet,
    spentSinceUpdateUsd,
    costPer1MTokensUsd: observedBlendedCostPer1M,
  });

  const packages =
    Array.isArray(pkgsRes?.data) && pkgsRes.data.length > 0
      ? pkgsRes.data
      : TOKEN_PACK_CATALOG.map((p, idx) => ({
          id: p.slug,
          slug: p.slug,
          name: p.name,
          description: p.description,
          tokens_amount: p.tokens,
          price_cop: p.priceCop,
          price_usd: p.priceUsd,
          is_active: true,
          sort_order: idx + 1,
        }));

  return {
    wallet,
    forecast,
    packages,
    recentLedger: Array.isArray(ledgerRes?.data) ? ledgerRes.data : [],
  };
}

export async function updateOpenAiWalletAction(input: {
  balanceUsd: number;
  trmCopPerUsd: number;
  safetyBufferPct: number;
  notes?: string;
}) {
  const actor = await requireStrictSuperAdmin();

  const balanceUsd = Math.max(0, Number(input.balanceUsd) || 0);
  const trm = Math.max(1000, Number(input.trmCopPerUsd) || 4200);
  const buffer = Math.max(0, Math.min(100, Number(input.safetyBufferPct) || 15));

  const { error } = await (supabaseAdmin.from('ai_provider_wallet') as any).upsert({
    id: 'openai_primary',
    provider: 'openai',
    balance_usd: balanceUsd,
    trm_cop_per_usd: trm,
    safety_buffer_pct: buffer,
    notes: input.notes?.trim() || null,
    updated_by: actor.userId === 'test-super-admin' ? null : actor.userId,
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(`Error actualizando billetera OpenAI: ${error.message}`);

  await (supabaseAdmin.from('admin_audit_log') as any).insert({
    actor_id: actor.userId === 'test-super-admin' ? null : actor.userId,
    actor_email: actor.email,
    action: 'update_openai_wallet',
    metadata: { balanceUsd, trm, buffer },
  });

  revalidatePath('/admin');
  return { success: true };
}

export async function getErpGlobalPricingAction(): Promise<{
  monthlyBaseCop: number;
  pricePer1MCop: number;
}> {
  await requireStrictSuperAdmin();
  try {
    const { data } = await (supabaseAdmin.from('ai_provider_wallet') as any)
      .select('notes')
      .eq('id', 'erp_pricing')
      .maybeSingle();
    if (data?.notes) {
      const parsed = JSON.parse(String(data.notes));
      const base = Number(parsed?.monthlyBaseCop);
      const per1M = Number(parsed?.pricePer1MCop);
      return {
        monthlyBaseCop: Number.isFinite(base) && base >= 0 ? Math.round(base) : 200000,
        pricePer1MCop: Number.isFinite(per1M) && per1M >= 1000 ? Math.round(per1M) : 20000,
      };
    }
  } catch {
    // fallback seguro
  }
  return { monthlyBaseCop: 200000, pricePer1MCop: 20000 };
}

export async function saveErpGlobalPricingAction(input: {
  monthlyBaseCop: number;
  pricePer1MCop: number;
}): Promise<{ monthlyBaseCop: number; pricePer1MCop: number }> {
  const actor = await requireStrictSuperAdmin();
  const monthlyBaseCop = Math.max(0, Math.round(Number(input.monthlyBaseCop) || 0));
  const pricePer1MCop = Math.max(1000, Math.round(Number(input.pricePer1MCop) || 20000));

  const payload = JSON.stringify({ monthlyBaseCop, pricePer1MCop });
  const { error } = await (supabaseAdmin.from('ai_provider_wallet') as any).upsert({
    id: 'erp_pricing',
    provider: 'erp_pricing',
    balance_usd: 0,
    trm_cop_per_usd: 4200,
    safety_buffer_pct: 15,
    notes: payload,
    updated_by: actor.userId === 'test-super-admin' ? null : actor.userId,
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(`Error guardando tarifas ERP: ${error.message}`);

  await (supabaseAdmin.from('admin_audit_log') as any).insert({
    actor_id: actor.userId === 'test-super-admin' ? null : actor.userId,
    actor_email: actor.email,
    action: 'update_erp_global_pricing',
    metadata: { monthlyBaseCop, pricePer1MCop },
  });

  return { monthlyBaseCop, pricePer1MCop };
}

export async function grantCycleOrTrialAction(input: {
  organizationId: string;
  cycleKind: 'trial' | 'paid';
  days: number;
  tokensLimit: number;
  resetTokensUsed: boolean;
  amountCop?: number;
  notes?: string;
  idempotencyKey?: string;
}) {
  const actor = await requireStrictSuperAdmin();
  if (input.idempotencyKey) {
    const { data: existingLedger } = await (supabaseAdmin.from('token_ledger') as any)
      .select('id')
      .eq('idempotency_key', input.idempotencyKey)
      .limit(1)
      .maybeSingle();
    if (existingLedger) {
      return { success: true, billingCycleEndsAt: null, deduplicated: true };
    }
  }
  const days = Math.max(1, Math.min(365, Math.round(input.days)));
  const tokensLimit = Math.max(100_000, Math.round(input.tokensLimit));

  const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const paidUntilMonth = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`;

  const updatePayload: Record<string, any> = {
    is_active: true,
    subscription_status: input.cycleKind === 'trial' ? 'trialing' : 'active',
    cycle_kind: input.cycleKind,
    billing_cycle_ends_at: endDate.toISOString(),
    paid_until_month: paidUntilMonth,
    past_due_since: null,
    ai_tokens_limit: tokensLimit,
    updated_at: new Date().toISOString(),
  };

  if (input.resetTokensUsed) {
    updatePayload.ai_tokens_used = 0;
    updatePayload.extra_tokens_balance = 0;
    const { data: orgForReset } = await (supabaseAdmin.from('organizations') as any)
      .select('appointment_settings')
      .eq('id', input.organizationId)
      .maybeSingle();
    if (orgForReset?.appointment_settings?.token_policy?.alertsSentInCycle) {
      updatePayload.appointment_settings = {
        ...orgForReset.appointment_settings,
        token_policy: {
          ...orgForReset.appointment_settings.token_policy,
          alertsSentInCycle: {},
        },
      };
    }
  }

  const { error: orgErr } = await (supabaseAdmin.from('organizations') as any)
    .update(updatePayload)
    .eq('id', input.organizationId);

  if (orgErr) throw new Error(`Error actualizando ciclo: ${orgErr.message}`);

  await (supabaseAdmin.from('token_ledger') as any).insert({
    organization_id: input.organizationId,
    entry_type: input.cycleKind === 'trial' ? 'trial_grant' : 'cycle_base',
    tokens_delta: tokensLimit,
    balance_after_limit: tokensLimit,
    idempotency_key: input.idempotencyKey || null,
    notes:
      input.notes?.trim() ||
      `${input.cycleKind === 'trial' ? 'Prueba / Cortesía' : 'Renovación'} por ${days} días`,
    created_by: actor.userId === 'test-super-admin' ? null : actor.userId,
  });

  if (input.cycleKind === 'paid' && (input.amountCop || 0) > 0) {
    await (supabaseAdmin.from('organization_payments') as any).insert({
      organization_id: input.organizationId,
      amount: input.amountCop,
      amount_cop: input.amountCop,
      currency: 'COP',
      period_month: paidUntilMonth,
      concept_type: 'monthly_base',
      status: 'paid',
      payment_method: 'transferencia',
      notes: input.notes?.trim() || `Renovación ${days} días`,
    });
  }

  revalidatePath('/admin');
  return { success: true, billingCycleEndsAt: endDate.toISOString() };
}

export async function grantTokenPackAction(input: {
  organizationId: string;
  tokensAmount: number;
  overageSettledTokens?: number;
  amountCop: number;
  mode?: 'temporary' | 'permanent';
  packageId?: string | null;
  notes?: string;
  idempotencyKey?: string;
}) {
  const actor = await requireStrictSuperAdmin();
  if (input.idempotencyKey) {
    const { data: existingLedger } = await (supabaseAdmin.from('token_ledger') as any)
      .select('id')
      .eq('idempotency_key', input.idempotencyKey)
      .limit(1)
      .maybeSingle();
    if (existingLedger) {
      return { success: true, mode: input.mode === 'permanent' ? 'permanent' : 'temporary', deduplicated: true };
    }
  }

  const tokens = Math.max(0, Math.round(input.tokensAmount));
  const settledOverage = Math.max(0, Math.round(input.overageSettledTokens || 0));
  if (tokens < 100_000 && settledOverage <= 0) {
    throw new Error('La recarga mínima es de 100.000 tokens.');
  }
  const safeAmountCop = Math.max(0, Math.round(Number(input.amountCop) || 0));
  const mode = input.mode === 'permanent' ? 'permanent' : 'temporary';

  const { data: org, error: fetchErr } = await (supabaseAdmin.from('organizations') as any)
    .select('id, ai_tokens_used, ai_tokens_limit, extra_tokens_balance, appointment_settings')
    .eq('id', input.organizationId)
    .single();

  if (fetchErr || !org) throw new Error('Empresa no encontrada.');

  const currentBase = Number(org.ai_tokens_limit) || 5_000_000;
  const currentExtra = Math.max(0, Number(org.extra_tokens_balance || 0));

  const nextBase = mode === 'permanent' ? currentBase + tokens : currentBase;
  // Si se cobró excedente/gracia consumida, se suma también a extra_tokens_balance para saldar el ciclo
  // sin descontar tokens de la recarga neta que compró el cliente.
  const nextExtra =
    mode === 'temporary'
      ? currentExtra + tokens + settledOverage
      : currentExtra + settledOverage;
  const effectiveAfter = nextBase + nextExtra;

  const existingAppSettings = (org.appointment_settings || {}) as Record<string, any>;
  const existingPolicy = (existingAppSettings.token_policy || {}) as Record<string, any>;
  const pricePer1M = Math.max(1000, Number(existingPolicy.overagePricePer1MCop || 20000));
  const currentMonthlyBaseCop = Math.max(0, Number(existingPolicy.monthlyBasePriceCop || 169000));
  const permanentAddonCop = mode === 'permanent' ? Math.round((tokens / 1_000_000) * pricePer1M) : 0;

  // Limpiar umbrales de alerta que ahora queden por encima del nuevo % de consumo tras la recarga
  const newUsagePct = Math.round((Math.max(0, Number(org.ai_tokens_used || 0)) / Math.max(1, effectiveAfter)) * 100);
  const existingAlerts =
    existingPolicy.alertsSentInCycle && typeof existingPolicy.alertsSentInCycle === 'object'
      ? { ...existingPolicy.alertsSentInCycle }
      : {};
  let alertsUpdated = false;
  for (const key of Object.keys(existingAlerts)) {
    const thresholdNum = Number(key);
    if (Number.isFinite(thresholdNum) && thresholdNum > newUsagePct) {
      delete existingAlerts[key];
      alertsUpdated = true;
    }
  }

  const nextAppointmentSettings =
    mode === 'permanent' || alertsUpdated
      ? {
          ...existingAppSettings,
          token_policy: {
            ...existingPolicy,
            ...(mode === 'permanent'
              ? {
                  monthlyBasePriceCop: currentMonthlyBaseCop + permanentAddonCop,
                  overagePricePer1MCop: pricePer1M,
                }
              : {}),
            ...(alertsUpdated ? { alertsSentInCycle: existingAlerts } : {}),
          },
        }
      : existingAppSettings;

  const { error: updErr } = await (supabaseAdmin.from('organizations') as any)
    .update({
      ...(mode === 'permanent'
        ? {
            ai_tokens_limit: nextBase,
            appointment_settings: nextAppointmentSettings,
            ...(settledOverage > 0 ? { extra_tokens_balance: nextExtra } : {}),
          }
        : {
            extra_tokens_balance: nextExtra,
            ...(alertsUpdated ? { appointment_settings: nextAppointmentSettings } : {}),
          }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.organizationId);

  if (updErr) throw new Error(`Error acreditando tokens: ${updErr.message}`);

  const totalDelta = tokens + settledOverage;
  await (supabaseAdmin.from('token_ledger') as any).insert({
    organization_id: input.organizationId,
    entry_type: mode === 'permanent' ? 'manual_adjustment' : 'pack_purchase',
    tokens_delta: totalDelta,
    balance_after_limit: effectiveAfter,
    package_id: input.packageId || null,
    idempotency_key: input.idempotencyKey || null,
    notes:
      input.notes?.trim() ||
      (mode === 'permanent'
        ? `Aumento permanente de plan (+${tokens.toLocaleString('es-CO')} tokens/mes${settledOverage > 0 ? ` + ${settledOverage.toLocaleString('es-CO')} excedente saldado` : ''})`
        : `Paquete adicional este mes (+${tokens.toLocaleString('es-CO')} tokens${settledOverage > 0 ? ` + ${settledOverage.toLocaleString('es-CO')} excedente saldado` : ''})`),
    created_by: actor.userId === 'test-super-admin' ? null : actor.userId,
  });

  if (safeAmountCop > 0) {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    await (supabaseAdmin.from('organization_payments') as any).insert({
      organization_id: input.organizationId,
      amount: safeAmountCop,
      amount_cop: safeAmountCop,
      currency: 'COP',
      period_month: ym,
      concept_type: mode === 'permanent' ? 'monthly_base' : 'token_pack',
      status: 'paid',
      tokens_granted: totalDelta,
      payment_method: 'transferencia',
      notes:
        input.notes?.trim() ||
        (mode === 'permanent'
          ? `Aumento permanente +${tokens.toLocaleString('es-CO')} tokens/mes`
          : `Pack tokens +${tokens.toLocaleString('es-CO')}`),
    });
  }

  revalidatePath('/admin');
  return {
    success: true,
    mode,
    aiTokensLimit: nextBase,
    extraTokensBalance: nextExtra,
    monthlyBasePriceCop:
      mode === 'permanent'
        ? (nextAppointmentSettings.token_policy?.monthlyBasePriceCop as number)
        : undefined,
  };
}

/**
 * Permite ajustar o revertir la cuota base permanente de una empresa (piso mínimo 5.000.000 tokens)
 * recalculando automáticamente el valor mensual en COP para futuras facturas.
 */
export async function adjustPermanentTokensAction(input: {
  organizationId: string;
  targetBaseLimit: number;
  basePlanCop?: number;
}) {
  const actor = await requireStrictSuperAdmin();
  const FLOOR_LIMIT = 5_000_000;
  const safeTarget = Math.max(FLOOR_LIMIT, Math.round(input.targetBaseLimit));

  const { data: org, error: fetchErr } = await (supabaseAdmin.from('organizations') as any)
    .select('id, ai_tokens_used, ai_tokens_limit, extra_tokens_balance, appointment_settings')
    .eq('id', input.organizationId)
    .single();
  if (fetchErr || !org) throw new Error('Empresa no encontrada.');

  const currentBase = Number(org.ai_tokens_limit) || FLOOR_LIMIT;
  const delta = safeTarget - currentBase;

  const existingAppSettings = (org.appointment_settings || {}) as Record<string, any>;
  const existingPolicy = (existingAppSettings.token_policy || {}) as Record<string, any>;
  const pricePer1M = Math.max(1000, Number(existingPolicy.overagePricePer1MCop || 20000));
  const baseCop = Math.max(0, Number(input.basePlanCop ?? 169000));
  const extraMillions = Math.max(0, (safeTarget - FLOOR_LIMIT) / 1_000_000);
  const nextMonthlyBaseCop = Math.round(baseCop + extraMillions * pricePer1M);

  const { error: updErr } = await (supabaseAdmin.from('organizations') as any)
    .update({
      ai_tokens_limit: safeTarget,
      appointment_settings: {
        ...existingAppSettings,
        token_policy: {
          ...existingPolicy,
          monthlyBasePriceCop: nextMonthlyBaseCop,
          overagePricePer1MCop: pricePer1M,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.organizationId);

  if (updErr) throw new Error(`Error ajustando cuota base: ${updErr.message}`);

  await (supabaseAdmin.from('token_ledger') as any).insert({
    organization_id: input.organizationId,
    entry_type: 'manual_adjustment',
    tokens_delta: delta,
    balance_after_limit: safeTarget + Math.max(0, Number(org.extra_tokens_balance || 0)),
    notes: `Ajuste/reversión de cuota base permanente a ${safeTarget.toLocaleString('es-CO')} tokens ($${nextMonthlyBaseCop.toLocaleString('es-CO')} COP/mes)`,
    created_by: actor.userId === 'test-super-admin' ? null : actor.userId,
  });

  revalidatePath('/admin');
  return {
    success: true,
    aiTokensLimit: safeTarget,
    monthlyBasePriceCop: nextMonthlyBaseCop,
  };
}

/**
 * Ejecutado por el cron diario para cerrar ciclos vencidos:
 * - Trial vencido: marca subscription_status = 'past_due' sin reiniciar cupo gratis.
 * - Paid vigente (paid_until_month >= mes actual): registra snapshot en token_ledger y reinicia cupo a 0.
 */
export async function runMonthlyBillingCycleRollover(targetOrgId?: string): Promise<{
  resetCount: number;
  expiredTrialsCount: number;
}> {
  let query = (supabaseAdmin.from('organizations') as any)
    .select('id, is_active, cycle_kind, billing_cycle_ends_at, paid_until_month, subscription_status, ai_tokens_used, ai_tokens_limit, appointment_settings')
    .eq('is_active', true)
    .not('billing_cycle_ends_at', 'is', null);

  if (targetOrgId) query = query.eq('id', targetOrgId);
  const { data: orgs } = await query;

  let resetCount = 0;
  let expiredTrialsCount = 0;
  const now = new Date();

  for (const org of orgs || []) {
    const decision = evaluateBillingCycleRollover(org, now);
    if (decision.action === 'expire_trial') {
      await (supabaseAdmin.from('organizations') as any)
        .update({ subscription_status: 'past_due', past_due_since: now.toISOString(), updated_at: now.toISOString() })
        .eq('id', org.id);
      expiredTrialsCount++;
    } else if (decision.action === 'reset_paid_cycle' && decision.nextCycleEndsAt) {
      await (supabaseAdmin.from('token_ledger') as any).insert({
        organization_id: org.id,
        entry_type: 'cycle_reset',
        tokens_delta: -Math.max(0, Number(org.ai_tokens_used || 0)),
        balance_after_limit: Number(org.ai_tokens_limit || 5_000_000),
        notes: `Cierre automático de ciclo (${org.billing_cycle_ends_at})`,
      });
      const nextRolloverSettings = org.appointment_settings?.token_policy?.alertsSentInCycle
        ? {
            ...org.appointment_settings,
            token_policy: {
              ...org.appointment_settings.token_policy,
              alertsSentInCycle: {},
            },
          }
        : undefined;
      await (supabaseAdmin.from('organizations') as any)
        .update({
          ai_tokens_used: 0,
          extra_tokens_balance: 0,
          billing_cycle_ends_at: decision.nextCycleEndsAt,
          ...(nextRolloverSettings ? { appointment_settings: nextRolloverSettings } : {}),
          updated_at: now.toISOString(),
        })
        .eq('id', org.id);
      resetCount++;
    }
  }

  try {
    await purgeExpiredPendingQuotesInternal();
  } catch {
    // No bloquear rollover si la tabla opcional aún no existe en BD
  }

  return { resetCount, expiredTrialsCount };
}

async function purgeExpiredPendingQuotesInternal(): Promise<void> {
  const nowIso = new Date().toISOString();
  await (supabaseAdmin.from('erp_pending_quotes') as any)
    .delete()
    .lt('expires_at', nowIso);

  const { data: rows } = await (supabaseAdmin.from('erp_pending_quotes') as any)
    .select('id, admin_email, updated_at')
    .order('updated_at', { ascending: false });

  if (!Array.isArray(rows) || rows.length === 0) return;

  const emails = rows.map((r: any) => String(r.admin_email || '').trim().toLowerCase()).filter(Boolean);
  const { data: existingProfiles } = await (supabaseAdmin.from('profiles') as any)
    .select('email')
    .in('email', emails);

  const existingSet = new Set(
    (existingProfiles || []).map((p: any) => String(p.email || '').trim().toLowerCase())
  );

  const idsToDelete: string[] = [];
  rows.forEach((r: any, idx: number) => {
    const email = String(r.admin_email || '').trim().toLowerCase();
    if (!email || existingSet.has(email) || idx >= 30) {
      idsToDelete.push(r.id);
    }
  });

  if (idsToDelete.length > 0) {
    await (supabaseAdmin.from('erp_pending_quotes') as any)
      .delete()
      .in('id', idsToDelete);
  }
}

export async function getPendingQuotesAction(): Promise<{
  supported: boolean;
  quotes: PendingQuoteRecord[];
}> {
  await requireStrictSuperAdmin();
  try {
    await purgeExpiredPendingQuotesInternal();
    const { data, error } = await (supabaseAdmin.from('erp_pending_quotes') as any)
      .select('id, admin_email, company_name, admin_name, phone, business_model, max_users, ai_tokens_limit, monthly_base_cop, created_at, expires_at')
      .order('updated_at', { ascending: false })
      .limit(30);

    if (error) return { supported: false, quotes: [] };

    const mapped: PendingQuoteRecord[] = (data || []).map((row: any) => ({
      id: String(row.id),
      companyName: String(row.company_name || ''),
      adminName: String(row.admin_name || ''),
      adminEmail: String(row.admin_email || ''),
      phone: String(row.phone || ''),
      businessModel:
        row.business_model === 'services' || row.business_model === 'hybrid'
          ? row.business_model
          : 'products',
      maxUsers: Math.max(1, Number(row.max_users || 2)),
      aiTokensLimit: Math.max(5_000_000, Number(row.ai_tokens_limit || 5_000_000)),
      monthlyBaseCop: Math.max(0, Number(row.monthly_base_cop || 169000)),
      createdAt: String(row.created_at || new Date().toISOString()),
      expiresAt: row.expires_at ? String(row.expires_at) : undefined,
    }));

    return { supported: true, quotes: prunePendingQuotes(mapped) };
  } catch {
    return { supported: false, quotes: [] };
  }
}

export async function upsertPendingQuoteAction(input: {
  companyName: string;
  adminName: string;
  adminEmail: string;
  phone: string;
  businessModel: 'products' | 'services' | 'hybrid';
  maxUsers: number;
  aiTokensLimit: number;
  monthlyBaseCop: number;
}): Promise<{ supported: boolean }> {
  await requireStrictSuperAdmin();
  const normalizedEmail = input.adminEmail.trim().toLowerCase();
  if (!normalizedEmail || !input.companyName.trim()) {
    return { supported: true };
  }

  try {
    const expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await (supabaseAdmin.from('erp_pending_quotes') as any).upsert(
      {
        admin_email: normalizedEmail,
        company_name: input.companyName.trim(),
        admin_name: input.adminName.trim() || input.companyName.trim(),
        phone: input.phone.trim(),
        business_model: input.businessModel,
        max_users: Math.max(1, Math.round(input.maxUsers || 2)),
        ai_tokens_limit: Math.max(5_000_000, Math.round(input.aiTokensLimit || 5_000_000)),
        monthly_base_cop: Math.max(0, Math.round(input.monthlyBaseCop || 0)),
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'admin_email' }
    );
    if (error) return { supported: false };
    await purgeExpiredPendingQuotesInternal();
    return { supported: true };
  } catch {
    return { supported: false };
  }
}

export async function deletePendingQuoteAction(adminEmail: string): Promise<void> {
  await requireStrictSuperAdmin();
  const normalized = adminEmail.trim().toLowerCase();
  if (!normalized) return;
  try {
    await (supabaseAdmin.from('erp_pending_quotes') as any)
      .delete()
      .eq('admin_email', normalized);
  } catch {
    // Silencioso si la tabla opcional aún no existe
  }
}
