'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { computeTokenStatus, normalizeTokenPolicy } from '@/lib/monitoring/token-policy';

export interface TokenUsageData {
  organizationId: string;
  organizationName: string;
  planType: string;
  tokensUsed: number;
  tokensLimit: number;
  percentage: number;
  rawPercentage: number;
  overageTokens: number;
  isOverage: boolean;
  isWarning: boolean;
  isExceeded: boolean;
  alertThresholds: number[];
}

/**
 * Obtiene el estado de consumo de tokens, excedente y política de alertas de la empresa actual.
 */
export async function getOrganizationTokenUsage(): Promise<TokenUsageData | null> {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) return null;

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name, plan_type, ai_tokens_used, ai_tokens_limit, appointment_settings')
    .eq('id', profile.organization_id)
    .single();

  if (!org) return null;

  const policy = normalizeTokenPolicy((org.appointment_settings as any)?.token_policy);
  const status = computeTokenStatus({
    used: Number(org.ai_tokens_used || 0),
    limit: Number(org.ai_tokens_limit) || 500000,
    policy,
  });

  return {
    organizationId: org.id,
    organizationName: org.name,
    planType: org.plan_type || 'base',
    tokensUsed: status.used,
    tokensLimit: status.limit,
    percentage: status.displayPercentage,
    rawPercentage: status.rawPercentage,
    overageTokens: status.overageTokens,
    isOverage: status.isOverage,
    isWarning: status.isWarning,
    isExceeded: status.isOverage,
    alertThresholds: policy.alertThresholds,
  };
}
