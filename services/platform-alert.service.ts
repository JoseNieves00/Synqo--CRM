import { supabaseAdmin } from '@/lib/supabase/admin';
import { MessagingService } from '@/services/messaging.service';
import { HandoffService } from '@/services/handoff.service';
import { NotificationService } from '@/lib/notifications/resend';

export type PlatformAlertEventType =
  | 'new_ticket'
  | 'channel_disconnected'
  | 'token_expired'
  | 'company_token_threshold'
  | 'assistant_cap_exceeded'
  | 'daily_digest';

export interface PlatformAlertEvent {
  type: PlatformAlertEventType;
  orgId?: string;
  companyName: string;
  title: string;
  details: string;
  dedupeWindowMinutes?: number;
}

const recentAlertTimestamps = new Map<string, number>();

function shouldSkipByCooldown(key: string, windowMinutes: number): boolean {
  if (windowMinutes <= 0) return false;
  const last = recentAlertTimestamps.get(key);
  const now = Date.now();
  if (last && now - last < windowMinutes * 60 * 1000) {
    return true;
  }
  recentAlertTimestamps.set(key, now);
  return false;
}

export function buildSuperAdminDigestText(params: {
  activeOrgs: number;
  disconnectedOrgs: Array<{ name: string }>;
  openTicketsCount: number;
  highUsageOrgs: Array<{ name: string; pct: number; used: number; limit: number }>;
}): string {
  const lines: string[] = [
    '🛡️ *Resumen Plataforma Synqo (SuperAdmin)*',
    `• Empresas activas: ${params.activeOrgs}`,
    `• Tickets abiertos: ${params.openTicketsCount}`,
    `• Canales Evolution desconectados: ${params.disconnectedOrgs.length}${
      params.disconnectedOrgs.length > 0
        ? ` (${params.disconnectedOrgs.slice(0, 5).map((o) => o.name).join(', ')})`
        : ''
    }`,
  ];

  if (params.highUsageOrgs.length > 0) {
    lines.push('• Mayor consumo de tokens:');
    for (const o of params.highUsageOrgs.slice(0, 4)) {
      lines.push(
        `  - ${o.name}: ${o.pct}% (${Math.round(o.used / 1000)}k / ${Math.round(o.limit / 1000)}k)`
      );
    }
  } else {
    lines.push('• Consumo de tokens: todas las empresas bajo 80%.');
  }

  return lines.join('\n');
}

export class PlatformAlertService {
  /**
   * Resuelve la organización emisora del SuperAdmin (su WhatsApp API anclado)
   * y los teléfonos/correos destino de los SuperAdmins.
   */
  private static async resolveSuperAdminChannel(): Promise<{
    platformOrg: any | null;
    phones: string[];
    emails: string[];
  }> {
    const { data: superProfiles } = await (supabaseAdmin.from('profiles') as any)
      .select('id, organization_id, whatsapp_phone, email, whatsapp_alerts_enabled')
      .eq('is_super_admin', true);

    const list = Array.isArray(superProfiles) ? superProfiles : [];
    const envPhone = HandoffService.cleanE164Phone(process.env.SYNQO_SUPERADMIN_PHONE || '');

    const phonesSet = new Set<string>();
    if (envPhone) phonesSet.add(envPhone);
    for (const p of list) {
      if (p?.whatsapp_alerts_enabled === false) continue;
      const clean = HandoffService.cleanE164Phone(String(p?.whatsapp_phone || ''));
      if (clean) phonesSet.add(clean);
    }

    const emails = Array.from(
      new Set(
        list
          .map((p) => String(p?.email || '').trim().toLowerCase())
          .filter(Boolean)
      )
    );

    const targetOrgId =
      process.env.SYNQO_PLATFORM_ORG_ID?.trim() ||
      list.find((p) => p?.organization_id)?.organization_id ||
      null;

    if (!targetOrgId) {
      return { platformOrg: null, phones: Array.from(phonesSet), emails };
    }

    const { data: org } = await (supabaseAdmin.from('organizations') as any)
      .select(
        'id, name, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, evolution_api_url, evolution_api_key, evolution_instance_name, evolution_anti_ban_mode, evolution_max_outbound_per_hour, appointment_settings'
      )
      .eq('id', targetOrgId)
      .maybeSingle();

    return {
      platformOrg: org || null,
      phones: Array.from(phonesSet),
      emails,
    };
  }

  /**
   * Envía alertas operativas al WhatsApp del SuperAdmin usando la WhatsApp API anclada al SuperAdmin
   * (con respaldo por plantilla Meta opcional si >24h y correo Resend si falla la red).
   */
  static async notifySuperAdminEvent(event: PlatformAlertEvent): Promise<{
    sentWhatsApp: boolean;
    sentEmailFallback: boolean;
  }> {
    const cooldownKey = `${event.type}:${event.orgId || 'global'}`;
    if (shouldSkipByCooldown(cooldownKey, event.dedupeWindowMinutes ?? 20)) {
      return { sentWhatsApp: false, sentEmailFallback: false };
    }

    const { platformOrg, phones, emails } = await this.resolveSuperAdminChannel();
    const messageBody = [
      `🔔 *Synqo Ops — ${event.title}*`,
      `Empresa: *${event.companyName}*`,
      event.details,
    ]
      .filter(Boolean)
      .join('\n');

    let sentWhatsApp = false;
    let sentEmailFallback = false;

    const hasMeta = Boolean(
      platformOrg?.whatsapp_phone_number_id && platformOrg?.whatsapp_access_token
    );
    const hasEvolution = Boolean(
      platformOrg?.evolution_api_url &&
        platformOrg?.evolution_api_key &&
        platformOrg?.evolution_instance_name
    );

    if (platformOrg && (hasMeta || hasEvolution) && phones.length > 0) {
      for (const phone of phones) {
        try {
          await MessagingService.sendTextMessage({
            organization: platformOrg,
            to: phone,
            body: messageBody,
            simulateTyping: false,
          });
          sentWhatsApp = true;
        } catch (waErr: any) {
          const optionalTpl = process.env.SYNQO_PLATFORM_META_TEMPLATE?.trim();
          if (optionalTpl && (platformOrg.whatsapp_provider || 'meta') === 'meta') {
            try {
              await MessagingService.sendTemplateMessage({
                organization: platformOrg,
                to: phone,
                templateKey: optionalTpl,
                templateName: optionalTpl,
                components: [
                  {
                    type: 'body',
                    parameters: [
                      { type: 'text', text: event.companyName.slice(0, 80) },
                      { type: 'text', text: `${event.title}: ${event.details}`.slice(0, 180) },
                    ],
                  },
                ],
              });
              sentWhatsApp = true;
              continue;
            } catch {}
          }
          console.warn(
            `[PLATFORM ALERT WA WARN] ${event.type} -> ${phone}:`,
            waErr?.message || waErr
          );
        }
      }
    }

    // Si WhatsApp falló (ej. ventana 24h expirada sin plantilla) y el evento es crítico, respaldar por Resend
    const isCritical =
      event.type === 'channel_disconnected' ||
      event.type === 'token_expired' ||
      event.type === 'new_ticket';

    if (!sentWhatsApp && isCritical && emails.length > 0) {
      for (const email of emails.slice(0, 2)) {
        try {
          await NotificationService.sendChannelDisconnectedAlert({
            adminEmail: email,
            companyName: `${event.companyName} (${event.title})`,
            provider: event.type === 'token_expired' ? 'meta' : 'evolution',
            reason: event.details,
          });
          sentEmailFallback = true;
        } catch {}
      }
    }

    return { sentWhatsApp, sentEmailFallback };
  }

  /**
   * Genera el resumen en vivo de la plataforma para el comando `#plataforma` / `#resumen` del SuperAdmin.
   */
  static async generateLivePlatformDigest(): Promise<string> {
    const [{ data: orgs }, { count: openTicketsCount }] = await Promise.all([
      (supabaseAdmin.from('organizations') as any)
        .select(
          'id, name, is_active, subscription_status, ai_tokens_used, ai_tokens_limit, whatsapp_provider, evolution_status'
        )
        .neq('is_active', false),
      (supabaseAdmin.from('support_tickets') as any)
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),
    ]);

    const list: any[] = Array.isArray(orgs) ? orgs : [];
    const disconnectedOrgs = list
      .filter(
        (o) =>
          o.whatsapp_provider === 'evolution' &&
          o.evolution_status === 'disconnected'
      )
      .map((o) => ({ name: o.name || 'Sin nombre' }));

    const highUsageOrgs = list
      .map((o) => {
        const used = Number(o.ai_tokens_used || 0);
        const limit = Math.max(1, Number(o.ai_tokens_limit || 500000));
        return {
          name: o.name || 'Sin nombre',
          used,
          limit,
          pct: Math.round((used / limit) * 100),
        };
      })
      .filter((o) => o.pct >= 60)
      .sort((a, b) => b.pct - a.pct);

    return buildSuperAdminDigestText({
      activeOrgs: list.length,
      disconnectedOrgs,
      openTicketsCount: Number(openTicketsCount || 0),
      highUsageOrgs,
    });
  }

  /**
   * Envía un digest diario al SuperAdmin (máx 1 vez al día) si hay novedades operativas relevantes.
   */
  static async sendDailyDigestIfDue(): Promise<boolean> {
    const { platformOrg } = await this.resolveSuperAdminChannel();
    if (!platformOrg) return false;

    const now = new Date();
    const todayBogota = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(
      now
    );
    const localHour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Bogota',
        hour: '2-digit',
        hour12: false,
      }).format(now)
    );
    if (localHour < 8 || localHour > 20) return false;

    const appSettings =
      platformOrg.appointment_settings && typeof platformOrg.appointment_settings === 'object'
        ? { ...platformOrg.appointment_settings }
        : {};
    if (appSettings.last_platform_digest_day === todayBogota) {
      return false;
    }

    const digest = await this.generateLivePlatformDigest();
    const res = await this.notifySuperAdminEvent({
      type: 'daily_digest',
      orgId: 'platform',
      companyName: 'Synqo Global',
      title: 'Resumen Diario',
      details: digest,
      dedupeWindowMinutes: 60 * 12,
    });

    if (res.sentWhatsApp) {
      appSettings.last_platform_digest_day = todayBogota;
      await (supabaseAdmin.from('organizations') as any)
        .update({ appointment_settings: appSettings, updated_at: new Date().toISOString() })
        .eq('id', platformOrg.id);
    }

    return res.sentWhatsApp;
  }
}
