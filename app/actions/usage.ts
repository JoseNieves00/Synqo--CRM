'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export interface TokenUsageData {
  organizationId: string;
  organizationName: string;
  planType: string;
  tokensUsed: number;
  tokensLimit: number;
  percentage: number;
  isWarning: boolean;
  isExceeded: boolean;
}

/**
 * Obtiene el estado de consumo de tokens y cuotas de la empresa actual.
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
    .select('id, name, plan_type, ai_tokens_used, ai_tokens_limit')
    .eq('id', profile.organization_id)
    .single();

  if (!org) return null;

  const defaultLimits: Record<string, number> = {
    starter: 500000,
    core: 500000,
    pro: 2500000,
    enterprise: 7500000,
  };

  const tokensUsed = Number(org.ai_tokens_used || 0);
  const tokensLimit = Number(org.ai_tokens_limit) || defaultLimits[org.plan_type] || 100000;
  const percentage = Math.min(100, Math.round((tokensUsed / tokensLimit) * 100));

  return {
    organizationId: org.id,
    organizationName: org.name,
    planType: org.plan_type,
    tokensUsed,
    tokensLimit,
    percentage,
    isWarning: percentage >= 80 && percentage < 100,
    isExceeded: percentage >= 100,
  };
}

