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
