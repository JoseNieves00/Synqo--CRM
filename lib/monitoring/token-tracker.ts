import { supabaseAdmin } from '@/lib/supabase/admin';

interface RecordTokenUsageInput {
  organizationId: string;
  contactId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
}

/**
 * Registra el consumo de tokens de OpenAI en tiempo real.
 * Actualiza el contador acumulado de la organización y el historial del prospecto.
 */
export async function recordTokenUsage(input: RecordTokenUsageInput) {
  const { organizationId, contactId, totalTokens } = input;
  if (!totalTokens || totalTokens <= 0) return;

  try {
    // 1. Obtener la organización para leer tokens actuales
    const { data: org } = await (supabaseAdmin.from('organizations') as any)
      .select('id, ai_tokens_used, ai_tokens_limit, plan_type')
      .eq('id', organizationId)
      .single();

    if (org) {
      const currentUsed = Number(org.ai_tokens_used || 0);
      const newTotal = currentUsed + totalTokens;

      // Intentar actualizar el contador en organizations
      await (supabaseAdmin.from('organizations') as any)
        .update({
          ai_tokens_used: newTotal,
          updated_at: new Date().toISOString(),
        })
        .eq('id', organizationId);
    }

    // 2. Acumular también en el prospecto para trazabilidad por cliente
    const { data: contact } = await (supabaseAdmin.from('contacts') as any)
      .select('id, custom_fields')
      .eq('id', contactId)
      .single();

    if (contact) {
      const currentCustom = contact.custom_fields || {};
      const contactTokens = Number(currentCustom.total_tokens || 0) + totalTokens;

      await (supabaseAdmin.from('contacts') as any)
        .update({
          custom_fields: {
            ...currentCustom,
            total_tokens: contactTokens,
            last_tokens: totalTokens,
            last_tokens_at: new Date().toISOString(),
          },
        })
        .eq('id', contactId);
    }
  } catch (err) {
    console.warn('[Token Tracker] No se pudo persistir consumo de tokens:', err);
  }
}

/**
 * Verifica si una organización ha superado su límite mensual de tokens de IA.
 * Si lo superó, devuelve `isExceeded: true` para silenciar la IA y pedir recarga.
 */
export async function checkTokenQuota(organizationId: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
  percentage: number;
}> {
  try {
    const { data: org } = await (supabaseAdmin.from('organizations') as any)
      .select('ai_tokens_used, ai_tokens_limit, plan_type')
      .eq('id', organizationId)
      .single();

    if (!org) {
      return { allowed: true, used: 0, limit: 100000, percentage: 0 };
    }

    const defaultLimits: Record<string, number> = {
      core: 100000,
      pro: 500000,
      enterprise: 2000000,
    };

    const limit = Number(org.ai_tokens_limit) || defaultLimits[org.plan_type] || 100000;
    const used = Number(org.ai_tokens_used) || 0;
    const percentage = Math.min(100, Math.round((used / limit) * 100));

    return {
      allowed: used < limit,
      used,
      limit,
      percentage,
    };
  } catch (err) {
    console.warn('[Token Tracker] Error verificando cuota:', err);
    return { allowed: true, used: 0, limit: 100000, percentage: 0 };
  }
}

