import { supabaseAdmin } from '@/lib/supabase/admin';
import { NotificationService } from '@/lib/notifications/resend';
import { MessagingService } from '@/services/messaging.service';
import { HandoffService } from '@/services/handoff.service';
import {
  computeTokenStatus,
  formatPushTokenAlertMessage,
  normalizeTokenPolicy,
  type TokenStatusSnapshot,
} from './token-policy';

interface RecordTokenUsageInput {
  organizationId: string;
  contactId: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens?: number;
  totalTokens: number;
  model: string;
  provider?: 'google' | 'openai';
}

/**
 * Envía en segundo plano la notificación Push única por umbral (WhatsApp a admins + Email Resend)
 * cuando la empresa cruza alguno de los porcentajes configurados (ej. 80%, 90%, 100%).
 */
async function dispatchTokenThresholdPushAlerts(params: {
  org: any;
  threshold: number;
  status: TokenStatusSnapshot;
  overagePricePer500kCop?: number | null;
}): Promise<void> {
  const { org, threshold, status } = params;
  try {
    const { data: profiles } = await (supabaseAdmin.from('profiles') as any)
      .select('id, full_name, email, role, whatsapp_phone, whatsapp_alerts_enabled')
      .eq('organization_id', org.id)
      .in('role', ['admin', 'supervisor']);

    const list: any[] = profiles || [];
    if (list.length === 0) return;

    const admins = list.filter((p) => p.role === 'admin');
    const whatsappTargets = list.filter(
      (p) => p.whatsapp_phone && p.whatsapp_alerts_enabled !== false
    );

    const hasMeta = Boolean(org.whatsapp_phone_number_id && org.whatsapp_access_token);
    const hasEvolution = Boolean(
      org.evolution_api_url && org.evolution_api_key && org.evolution_instance_name
    );

    if ((hasMeta || hasEvolution) && whatsappTargets.length > 0) {
      const seenPhones = new Set<string>();
      for (const target of whatsappTargets) {
        const cleanPhone = HandoffService.cleanE164Phone(String(target.whatsapp_phone || ''));
        if (!cleanPhone || seenPhones.has(cleanPhone)) continue;
        seenPhones.add(cleanPhone);

        const waBody = formatPushTokenAlertMessage({
          orgName: org.name || 'Synqo CRM',
          adminName: target.full_name,
          threshold,
          used: status.used,
          limit: status.limit,
          rawPercentage: status.rawPercentage,
          overageTokens: status.overageTokens,
          overagePricePer500kCop: params.overagePricePer500kCop,
        });

        try {
          await MessagingService.sendTextMessage({
            organization: org,
            to: cleanPhone,
            body: waBody,
            simulateTyping: false,
            isColdOutbound: true,
          });
        } catch (waErr: any) {
          console.warn(
            `[TOKEN PUSH WHATSAPP WARN] Org ${org.id} (${cleanPhone}):`,
            waErr?.message || waErr
          );
        }
      }
    }

    // Respaldo garantizado por Email Resend al administrador principal
    const emailTargets = admins.length > 0 ? admins : list;
    const seenEmails = new Set<string>();
    for (const adm of emailTargets) {
      const email = String(adm.email || '').trim().toLowerCase();
      if (!email || seenEmails.has(email)) continue;
      seenEmails.add(email);

      await NotificationService.sendTokenQuotaExhaustedAlert({
        adminEmail: email,
        companyName: org.name || 'Synqo CRM',
        usedTokens: status.used,
        limitTokens: status.limit,
        percentage: status.rawPercentage,
        threshold,
        overageTokens: status.overageTokens,
        overageMode: true,
      });
    }
  } catch (err) {
    console.warn('[TOKEN THRESHOLD DISPATCH WARN]', err);
  }
}

/**
 * Registra el consumo de tokens de IA en tiempo real, diferenciando entre
 * Google Gemini (motor primario costo $0) y OpenAI (respaldo de emergencia).
 * Actualiza el contador acumulado de la organización, evalúa umbrales x% Push
 * y guarda trazabilidad por prospecto.
 */
export async function recordTokenUsage(input: RecordTokenUsageInput) {
  const { organizationId, contactId, totalTokens, model } = input;
  if (!totalTokens || totalTokens <= 0) return;

  const isGoogle = input.provider === 'google' || model.toLowerCase().includes('gemini');
  const isOpenAi = input.provider === 'openai' || model.toLowerCase().includes('gpt');

  try {
    // 1. Obtener la organización para leer tokens actuales, política de umbrales y canal WhatsApp
    const { data: org } = await (supabaseAdmin.from('organizations') as any)
      .select(
        'id, name, ai_tokens_used, ai_tokens_limit, ai_tokens_google_used, ai_tokens_openai_used, appointment_settings, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, evolution_api_url, evolution_api_key, evolution_instance_name, evolution_anti_ban_mode, evolution_max_outbound_per_hour'
      )
      .eq('id', organizationId)
      .single();

    if (org) {
      const currentUsed = Number(org.ai_tokens_used || 0);
      const newTotal = currentUsed + totalTokens;
      const limit = Number(org.ai_tokens_limit) || 500000;
      const currentGoogle = Number(
        org.ai_tokens_google_used || Math.max(0, currentUsed - Number(org.ai_tokens_openai_used || 0))
      );
      const currentOpenAi = Number(org.ai_tokens_openai_used || 0);

      const newGoogle = isGoogle ? currentGoogle + totalTokens : currentGoogle;
      const newOpenAi = isOpenAi ? currentOpenAi + totalTokens : currentOpenAi;

      const currentSettings =
        org.appointment_settings && typeof org.appointment_settings === 'object'
          ? { ...org.appointment_settings }
          : {};
      const policy = normalizeTokenPolicy(currentSettings.token_policy);
      const nextStatus = computeTokenStatus({
        used: newTotal,
        limit,
        policy,
      });

      const nowIso = new Date().toISOString();
      const orgUpdatePayload: Record<string, any> = {
        ai_tokens_used: newTotal,
        ai_tokens_google_used: newGoogle,
        ai_tokens_openai_used: newOpenAi,
        updated_at: nowIso,
      };

      // Si cruzó algún umbral no notificado aún en este ciclo, marcarlo inmediatamente para evitar spam
      let thresholdToNotify: number | null = null;
      if (nextStatus.highestUnnotifiedThreshold !== null) {
        thresholdToNotify = nextStatus.highestUnnotifiedThreshold;
        const nextAlertsSent = { ...policy.alertsSentInCycle };
        for (const t of nextStatus.unnotifiedThresholds) {
          nextAlertsSent[String(t)] = nowIso;
        }
        orgUpdatePayload.appointment_settings = {
          ...currentSettings,
          token_policy: {
            ...policy,
            alertsSentInCycle: nextAlertsSent,
          },
        };
      }

      // Intentar actualizar con desglose dual (Google vs OpenAI)
      try {
        await (supabaseAdmin.from('organizations') as any)
          .update(orgUpdatePayload)
          .eq('id', organizationId);
      } catch {
        const fallbackUpdate: Record<string, any> = {
          ai_tokens_used: newTotal,
          updated_at: nowIso,
          ...(orgUpdatePayload.appointment_settings
            ? { appointment_settings: orgUpdatePayload.appointment_settings }
            : {}),
        };
        await (supabaseAdmin.from('organizations') as any)
          .update(fallbackUpdate)
          .eq('id', organizationId);
      }

      if (thresholdToNotify !== null) {
        dispatchTokenThresholdPushAlerts({
          org,
          threshold: thresholdToNotify,
          status: nextStatus,
          overagePricePer500kCop: policy.overagePricePer500kCop,
        }).catch(() => {});
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
      const contactCached =
        Number(currentCustom.total_cached_tokens || 0) + Number(input.cachedTokens || 0);

      await (supabaseAdmin.from('contacts') as any)
        .update({
          custom_fields: {
            ...currentCustom,
            total_tokens: contactTokens,
            google_tokens: contactGoogle,
            openai_tokens: contactOpenAi,
            total_cached_tokens: contactCached,
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
 * Verifica el consumo de tokens mensual de la organización.
 * En Synqo opera siempre en Modo Excedente al superar el 100%: el bot nunca se detiene,
 * reporta excedente acumulado y las alertas Push se disparan 1 vez por umbral en recordTokenUsage.
 */
export async function checkTokenQuota(organizationId: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
  percentage: number;
  rawPercentage: number;
  overageTokens: number;
  isOverage: boolean;
  isWarning: boolean;
}> {
  try {
    const { data: org } = await (supabaseAdmin.from('organizations') as any)
      .select('ai_tokens_used, ai_tokens_limit, appointment_settings')
      .eq('id', organizationId)
      .single();

    if (!org) {
      return {
        allowed: true,
        used: 0,
        limit: 500000,
        percentage: 0,
        rawPercentage: 0,
        overageTokens: 0,
        isOverage: false,
        isWarning: false,
      };
    }

    const status = computeTokenStatus({
      used: Number(org.ai_tokens_used || 0),
      limit: Number(org.ai_tokens_limit) || 500000,
      policy: org.appointment_settings?.token_policy,
    });

    return {
      allowed: true, // Siempre Modo Excedente al 100%
      used: status.used,
      limit: status.limit,
      percentage: status.displayPercentage,
      rawPercentage: status.rawPercentage,
      overageTokens: status.overageTokens,
      isOverage: status.isOverage,
      isWarning: status.isWarning,
    };
  } catch (err) {
    console.warn('[Token Tracker] Error verificando cuota:', err);
    return {
      allowed: true,
      used: 0,
      limit: 500000,
      percentage: 0,
      rawPercentage: 0,
      overageTokens: 0,
      isOverage: false,
      isWarning: false,
    };
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
