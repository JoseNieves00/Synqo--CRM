import { supabaseAdmin } from '@/lib/supabase/admin';

interface RecordTokenUsageInput {
  organizationId: string;
  contactId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  provider?: 'google' | 'openai';
}

/**
 * Registra el consumo de tokens de IA en tiempo real, diferenciando entre
 * Google Gemini (motor primario costo $0) y OpenAI (respaldo de emergencia).
 * Actualiza el contador acumulado de la organización y el historial del prospecto.
 */
export async function recordTokenUsage(input: RecordTokenUsageInput) {
  const { organizationId, contactId, totalTokens, model } = input;
  if (!totalTokens || totalTokens <= 0) return;

  const isGoogle = input.provider === 'google' || model.toLowerCase().includes('gemini');
  const isOpenAi = input.provider === 'openai' || model.toLowerCase().includes('gpt');

  try {
    // 1. Obtener la organización para leer tokens actuales
    const { data: org } = await (supabaseAdmin.from('organizations') as any)
      .select('id, ai_tokens_used, ai_tokens_limit, ai_tokens_google_used, ai_tokens_openai_used')
      .eq('id', organizationId)
      .single();

    if (org) {
      const currentUsed = Number(org.ai_tokens_used || 0);
      const newTotal = currentUsed + totalTokens;
      const currentGoogle = Number(org.ai_tokens_google_used || (currentUsed - Number(org.ai_tokens_openai_used || 0)));
      const currentOpenAi = Number(org.ai_tokens_openai_used || 0);

      const newGoogle = isGoogle ? currentGoogle + totalTokens : currentGoogle;
      const newOpenAi = isOpenAi ? currentOpenAi + totalTokens : currentOpenAi;

      // Intentar actualizar con desglose dual (Google vs OpenAI)
      try {
        await (supabaseAdmin.from('organizations') as any)
          .update({
            ai_tokens_used: newTotal,
            ai_tokens_google_used: newGoogle,
            ai_tokens_openai_used: newOpenAi,
            updated_at: new Date().toISOString(),
          })
          .eq('id', organizationId);
      } catch (colErr) {
        // Fallback si las columnas duales aún no existen en la base de datos remota
        await (supabaseAdmin.from('organizations') as any)
          .update({
            ai_tokens_used: newTotal,
            updated_at: new Date().toISOString(),
          })
          .eq('id', organizationId);
      }
    }

    // 2. Acumular también en el prospecto para trazabilidad por cliente
    const { data: contact } = await (supabaseAdmin.from('contacts') as any)
      .select('id, custom_fields')
      .eq('id', contactId)
      .single();

    if (contact) {
      const currentCustom = contact.custom_fields || {};
      const contactTokens = Number(currentCustom.total_tokens || 0) + totalTokens;
      const contactGoogle = Number(currentCustom.google_tokens || 0) + (isGoogle ? totalTokens : 0);
      const contactOpenAi = Number(currentCustom.openai_tokens || 0) + (isOpenAi ? totalTokens : 0);

      await (supabaseAdmin.from('contacts') as any)
        .update({
          custom_fields: {
            ...currentCustom,
            total_tokens: contactTokens,
            google_tokens: contactGoogle,
            openai_tokens: contactOpenAi,
            last_tokens: totalTokens,
            last_model: model,
            last_provider: isGoogle ? 'google' : 'openai',
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
 * Si lo superó, devuelve `allowed: false` para silenciar la IA y pedir recarga.
 */
export async function checkTokenQuota(organizationId: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
  percentage: number;
}> {
  try {
    const { data: org } = await (supabaseAdmin.from('organizations') as any)
      .select('ai_tokens_used, ai_tokens_limit')
      .eq('id', organizationId)
      .single();

    if (!org) {
      return { allowed: true, used: 0, limit: 500000, percentage: 0 };
    }

    const limit = Number(org.ai_tokens_limit) || 500000;
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
    return { allowed: true, used: 0, limit: 500000, percentage: 0 };
  }
}

/**
 * Verifica si una organización aún dispone de créditos de respaldo de emergencia (OpenAI).
 * Evita que fallos o lentitud prolongada de Google agoten el saldo en USD del Super Admin.
 */
export async function checkBackupTokenQuota(organizationId: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
  percentage: number;
}> {
  try {
    const { data: org } = await (supabaseAdmin.from('organizations') as any)
      .select('ai_tokens_openai_used, ai_tokens_openai_backup_limit')
      .eq('id', organizationId)
      .single();

    if (!org) {
      return { allowed: true, used: 0, limit: 25000, percentage: 0 };
    }

    const limit = Number(org.ai_tokens_openai_backup_limit) || 25000;
    const used = Number(org.ai_tokens_openai_used) || 0;
    const percentage = Math.min(100, Math.round((used / limit) * 100));

    return {
      allowed: used < limit,
      used,
      limit,
      percentage,
    };
  } catch (err) {
    console.warn('[Token Tracker] Error verificando cuota de backup:', err);
    return { allowed: true, used: 0, limit: 25000, percentage: 0 };
  }
}

