'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import {
  calculateOpenAiLiquidityForecast,
  evaluateBillingCycleRollover,
  fetchLiveUsdToCopRate,
  type OpenAiLiquidityForecast,
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

  // Descontar consumo real de OpenAI en ai_runs desde el último registro de saldo
  let spentSinceUpdateUsd = 0;
  if (walletUpdatedAt && Number(w?.balance_usd ?? 0) > 0) {
    const { data: openAiRuns } = await (supabaseAdmin.from('ai_runs') as any)
      .select('model, prompt_tokens, completion_tokens')
      .eq('provider', 'openai')
      .gte('created_at', walletUpdatedAt)
      .limit(5000);
    if (Array.isArray(openAiRuns)) {
      for (const r of openAiRuns) {
        spentSinceUpdateUsd += calculateTurnCostUsd({
          model: r.model,
          promptTokens: r.prompt_tokens,
          completionTokens: r.completion_tokens,
        });
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
  amountCop: number;
  mode?: 'temporary' | 'permanent';
  packageId?: string | null;
  notes?: string;
  idempotencyKey?: string;
}) {
  const actor = await requireStrictSuperAdmin();
  const tokens = Math.max(100_000, Math.round(input.tokensAmount));
  const mode = input.mode === 'permanent' ? 'permanent' : 'temporary';

  const { data: org, error: fetchErr } = await (supabaseAdmin.from('organizations') as any)
    .select('id, ai_tokens_limit, extra_tokens_balance')
    .eq('id', input.organizationId)
    .single();

  if (fetchErr || !org) throw new Error('Empresa no encontrada.');

  const currentBase = Number(org.ai_tokens_limit) || 5_000_000;
  const currentExtra = Math.max(0, Number(org.extra_tokens_balance || 0));

  const nextBase = mode === 'permanent' ? currentBase + tokens : currentBase;
  const nextExtra = mode === 'temporary' ? currentExtra + tokens : currentExtra;
  const effectiveAfter = nextBase + nextExtra;

  const { error: updErr } = await (supabaseAdmin.from('organizations') as any)
    .update({
      ...(mode === 'permanent' ? { ai_tokens_limit: nextBase } : { extra_tokens_balance: nextExtra }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.organizationId);

  if (updErr) throw new Error(`Error acreditando tokens: ${updErr.message}`);

  await (supabaseAdmin.from('token_ledger') as any).insert({
    organization_id: input.organizationId,
    entry_type: mode === 'permanent' ? 'manual_adjustment' : 'pack_purchase',
    tokens_delta: tokens,
    balance_after_limit: effectiveAfter,
    package_id: input.packageId || null,
    idempotency_key: input.idempotencyKey || null,
    notes:
      input.notes?.trim() ||
      (mode === 'permanent'
        ? `Aumento permanente de plan (+${tokens.toLocaleString('es-CO')} tokens/mes)`
        : `Paquete adicional este mes (+${tokens.toLocaleString('es-CO')} tokens)`),
    created_by: actor.userId === 'test-super-admin' ? null : actor.userId,
  });

  if (input.amountCop > 0) {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    await (supabaseAdmin.from('organization_payments') as any).insert({
      organization_id: input.organizationId,
      amount: input.amountCop,
      amount_cop: input.amountCop,
      currency: 'COP',
      period_month: ym,
      concept_type: mode === 'permanent' ? 'monthly_base' : 'token_pack',
      status: 'paid',
      tokens_granted: tokens,
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
    .select('id, is_active, cycle_kind, billing_cycle_ends_at, paid_until_month, subscription_status, ai_tokens_used, ai_tokens_limit')
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
      await (supabaseAdmin.from('organizations') as any)
        .update({
          ai_tokens_used: 0,
          extra_tokens_balance: 0,
          billing_cycle_ends_at: decision.nextCycleEndsAt,
          updated_at: now.toISOString(),
        })
        .eq('id', org.id);
      resetCount++;
    }
  }

  return { resetCount, expiredTrialsCount };
}
