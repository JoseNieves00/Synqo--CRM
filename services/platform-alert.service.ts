import { supabaseAdmin } from '@/lib/supabase/admin';
import { MessagingService } from '@/services/messaging.service';
import { HandoffService } from '@/services/handoff.service';
import { NotificationService } from '@/lib/notifications/resend';
import {
  PlatformAlertEvent,
  PlatformAlertEventType,
  PlatformAlertSeverity,
  PlatformAlertsConfig,
  PlatformAnnouncement,
  PlatformEventLogItem,
  DEFAULT_PLATFORM_ALERTS_CONFIG,
  normalizePlatformAlertsConfig,
  isWithinQuietHours,
} from '@/lib/monitoring/platform-alerts';

export type { PlatformAlertEvent, PlatformAlertEventType, PlatformAlertSeverity };

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
   * Resuelve la organización emisora del SuperAdmin (su WhatsApp API anclado),
   * los teléfonos/correos destino de los SuperAdmins, y la configuración dinámica de alertas.
   */
  static async resolveSuperAdminChannel(): Promise<{
    platformOrg: any | null;
    phones: string[];
    emails: string[];
    config: PlatformAlertsConfig;
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
      return {
        platformOrg: null,
        phones: Array.from(phonesSet),
        emails,
        config: DEFAULT_PLATFORM_ALERTS_CONFIG,
      };
    }

    const { data: org } = await (supabaseAdmin.from('organizations') as any)
      .select(
        'id, name, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, evolution_api_url, evolution_api_key, evolution_instance_name, evolution_anti_ban_mode, evolution_max_outbound_per_hour, appointment_settings'
      )
      .eq('id', targetOrgId)
      .maybeSingle();

    const appSettings =
      org?.appointment_settings && typeof org.appointment_settings === 'object'
        ? org.appointment_settings
        : {};

    const config = normalizePlatformAlertsConfig(appSettings.platform_alerts_config);

    return {
      platformOrg: org || null,
      phones: Array.from(phonesSet),
      emails,
      config,
    };
  }

  /**
   * Persiste un evento en el log de eventos operativos del SuperAdmin (máximo 100 recientes)
   */
  static async persistEventLog(event: PlatformAlertEvent): Promise<void> {
    try {
      const { platformOrg } = await this.resolveSuperAdminChannel();
      if (!platformOrg?.id) return;

      const appSettings =
        platformOrg.appointment_settings && typeof platformOrg.appointment_settings === 'object'
          ? { ...platformOrg.appointment_settings }
          : {};

      const currentLogs: PlatformEventLogItem[] = Array.isArray(appSettings.platform_events_log)
        ? appSettings.platform_events_log
        : [];

      const newItem: PlatformEventLogItem = {
        id: event.id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: event.type,
        severity: event.severity || 'warning',
        orgId: event.orgId,
        companyName: event.companyName,
        title: event.title,
        details: event.details,
        status: 'pending',
        createdAt: event.createdAt || new Date().toISOString(),
        metadata: event.metadata || {},
      };

      const updated = [newItem, ...currentLogs.filter((x) => x.id !== newItem.id)].slice(0, 100);
      appSettings.platform_events_log = updated;

      await (supabaseAdmin.from('organizations') as any)
        .update({
          appointment_settings: appSettings,
          updated_at: new Date().toISOString(),
        })
        .eq('id', platformOrg.id);
    } catch (err: any) {
      console.warn('[PLATFORM ALERT] persistEventLog error:', err?.message || err);
    }
  }

  /**
   * Marca un evento operativo como resuelto por el SuperAdmin
   */
  static async markEventResolved(eventId: string, adminEmail: string): Promise<boolean> {
    try {
      const { platformOrg } = await this.resolveSuperAdminChannel();
      if (!platformOrg?.id) return false;

      const appSettings =
        platformOrg.appointment_settings && typeof platformOrg.appointment_settings === 'object'
          ? { ...platformOrg.appointment_settings }
          : {};

      const currentLogs: PlatformEventLogItem[] = Array.isArray(appSettings.platform_events_log)
        ? appSettings.platform_events_log
        : [];

      const idx = currentLogs.findIndex((e) => e.id === eventId);
      if (idx === -1) return false;

      currentLogs[idx] = {
        ...currentLogs[idx],
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
        resolvedBy: adminEmail,
      };

      appSettings.platform_events_log = currentLogs;

      await (supabaseAdmin.from('organizations') as any)
        .update({
          appointment_settings: appSettings,
          updated_at: new Date().toISOString(),
        })
        .eq('id', platformOrg.id);

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Obtiene la lista de anuncios globales activos
   */
  static async getActiveAnnouncements(): Promise<PlatformAnnouncement[]> {
    try {
      const { platformOrg } = await this.resolveSuperAdminChannel();
      if (!platformOrg?.id) return [];

      const appSettings =
        platformOrg.appointment_settings && typeof platformOrg.appointment_settings === 'object'
          ? platformOrg.appointment_settings
          : {};

      const list: PlatformAnnouncement[] = Array.isArray(appSettings.platform_announcements)
        ? appSettings.platform_announcements
        : [];

      const nowIso = new Date().toISOString();
      return list.filter((a) => !a.expiresAt || a.expiresAt > nowIso);
    } catch {
      return [];
    }
  }

  /**
   * Guarda o elimina anuncios de la plataforma
   */
  static async saveAnnouncements(announcements: PlatformAnnouncement[]): Promise<void> {
    const { platformOrg } = await this.resolveSuperAdminChannel();
    if (!platformOrg?.id) return;

    const appSettings =
      platformOrg.appointment_settings && typeof platformOrg.appointment_settings === 'object'
        ? { ...platformOrg.appointment_settings }
        : {};

    appSettings.platform_announcements = announcements.slice(0, 30);

    await (supabaseAdmin.from('organizations') as any)
      .update({
        appointment_settings: appSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', platformOrg.id);
  }

  /**
   * Difunde un anuncio por WhatsApp a los administradores de los tenants destino
   * aplicando pausas anti-ban de 1.5 a 3.0s por mensaje.
   */
  static async broadcastAnnouncementViaWhatsApp(announcement: PlatformAnnouncement): Promise<{
    sentCount: number;
    failedCount: number;
  }> {
    const { platformOrg } = await this.resolveSuperAdminChannel();
    if (!platformOrg) return { sentCount: 0, failedCount: 0 };

    let orgQuery = (supabaseAdmin.from('organizations') as any)
      .select('id, name, subscription_status, whatsapp_provider, is_active')
      .neq('is_active', false);

    if (announcement.targetAudience === 'paying') {
      orgQuery = orgQuery.eq('subscription_status', 'active');
    } else if (announcement.targetAudience === 'evolution') {
      orgQuery = orgQuery.eq('whatsapp_provider', 'evolution');
    }

    const { data: orgs } = await orgQuery;
    const targetOrgs: any[] = Array.isArray(orgs) ? orgs : [];
    if (targetOrgs.length === 0) return { sentCount: 0, failedCount: 0 };

    const orgIds = targetOrgs.map((o) => o.id);
    const { data: adminProfiles } = await (supabaseAdmin.from('profiles') as any)
      .select('id, organization_id, whatsapp_phone, role')
      .in('organization_id', orgIds)
      .eq('role', 'admin');

    const adminList: any[] = Array.isArray(adminProfiles) ? adminProfiles : [];
    let sentCount = 0;
    let failedCount = 0;

    const emoji = announcement.severity === 'urgent' ? '🚨' : announcement.severity === 'warning' ? '⚠️' : '📢';
    const messageBody = [
      `${emoji} *Comunicado Oficial Synqo — ${announcement.title}*`,
      announcement.message,
      '',
      '_Mensaje enviado por el equipo de plataforma Synqo._',
    ].join('\n');

    for (const admin of adminList) {
      const phone = HandoffService.cleanE164Phone(String(admin?.whatsapp_phone || ''));
      if (!phone) continue;

      try {
        await MessagingService.sendTextMessage({
          organization: platformOrg,
          to: phone,
          body: messageBody,
          simulateTyping: false,
        });
        sentCount++;
      } catch (err: any) {
        failedCount++;
        console.warn(`[BROADCAST ANNOUNCEMENT ERROR] To ${phone}:`, err?.message || err);
      }

      // Pausa anti-ban entre mensajes (1.5s - 2.5s)
      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1000));
    }

    return { sentCount, failedCount };
  }

  /**
   * Envía alertas operativas al WhatsApp del SuperAdmin usando la WhatsApp API anclada al SuperAdmin
   * (con verificación de toggles por evento, quiet hours, plantilla Meta y Resend email como fallback).
   */
  static async notifySuperAdminEvent(event: PlatformAlertEvent): Promise<{
    sentWhatsApp: boolean;
    sentEmailFallback: boolean;
    skippedReason?: string;
  }> {
    const { platformOrg, phones, emails, config } = await this.resolveSuperAdminChannel();

    // Guardar en el log persistente de eventos para la Consola /admin
    await this.persistEventLog(event);

    if (!config.enabled) {
      return { sentWhatsApp: false, sentEmailFallback: false, skippedReason: 'alerts_disabled' };
    }

    // Comprobar toggle específico según tipo de evento
    if (event.type === 'new_ticket' && !config.notifyOnTicket) {
      return { sentWhatsApp: false, sentEmailFallback: false, skippedReason: 'type_disabled' };
    }
    if (event.type === 'channel_disconnected' && !config.notifyOnDisconnect) {
      return { sentWhatsApp: false, sentEmailFallback: false, skippedReason: 'type_disabled' };
    }
    if (event.type === 'token_expired' && !config.notifyOnTokenExpired) {
      return { sentWhatsApp: false, sentEmailFallback: false, skippedReason: 'type_disabled' };
    }
    if (event.type === 'company_token_threshold' && !config.notifyOnTokenThreshold) {
      return { sentWhatsApp: false, sentEmailFallback: false, skippedReason: 'type_disabled' };
    }
    if (event.type === 'assistant_cap_exceeded' && !config.notifyOnAssistantCap) {
      return { sentWhatsApp: false, sentEmailFallback: false, skippedReason: 'type_disabled' };
    }
    if (event.type === 'billing_delinquency' && !config.notifyOnBillingDelinquency) {
      return { sentWhatsApp: false, sentEmailFallback: false, skippedReason: 'type_disabled' };
    }
    if (event.type === 'ai_error_burst' && !config.notifyOnAiErrorBurst) {
      return { sentWhatsApp: false, sentEmailFallback: false, skippedReason: 'type_disabled' };
    }

    // Comprobar horario de silencio (excepto eventos críticos explícitos)
    if (event.severity !== 'critical' && isWithinQuietHours(config)) {
      return { sentWhatsApp: false, sentEmailFallback: false, skippedReason: 'quiet_hours' };
    }

    const cooldownKey = `${event.type}:${event.orgId || 'global'}`;
    if (shouldSkipByCooldown(cooldownKey, event.dedupeWindowMinutes ?? 20)) {
      return { sentWhatsApp: false, sentEmailFallback: false, skippedReason: 'cooldown' };
    }

    const severityIcon = event.severity === 'critical' ? '🚨' : event.severity === 'warning' ? '⚠️' : '🔔';
    const messageBody = [
      `${severityIcon} *Synqo Ops — ${event.title}*`,
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
          const optionalTpl =
            config.metaTemplateName || process.env.SYNQO_PLATFORM_META_TEMPLATE?.trim();
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

    // Si WhatsApp falló y el evento es crítico, respaldar por Resend
    const isCritical =
      event.severity === 'critical' ||
      event.type === 'channel_disconnected' ||
      event.type === 'token_expired' ||
      event.type === 'new_ticket' ||
      event.type === 'billing_delinquency';

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
   * Devuelve detalle de canales desconectados para el comando `#desconectados`
   */
  static async getDisconnectedChannelsReport(): Promise<string> {
    const { data: orgs } = await (supabaseAdmin.from('organizations') as any)
      .select('id, name, whatsapp_provider, evolution_status, evolution_phone_connected')
      .neq('is_active', false)
      .eq('whatsapp_provider', 'evolution')
      .eq('evolution_status', 'disconnected');

    const list: any[] = Array.isArray(orgs) ? orgs : [];
    if (list.length === 0) {
      return '✅ *Canales Evolution*: Todas las empresas conectadas activamente.';
    }

    const lines = [
      `⚠️ *Empresas Desconectadas (${list.length})*:`,
      ...list.map((o) => `• *${o.name || 'Sin nombre'}* (${o.evolution_phone_connected || 'Sin número'})`),
    ];
    return lines.join('\n');
  }

  /**
   * Devuelve detalle de tickets abiertos para el comando `#tickets`
   */
  static async getOpenTicketsReport(): Promise<string> {
    const { data: tickets } = await (supabaseAdmin.from('support_tickets') as any)
      .select('id, ticket_number, title, priority, status, organization_id, created_at')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(8);

    const list: any[] = Array.isArray(tickets) ? tickets : [];
    if (list.length === 0) {
      return '✅ *Tickets de Soporte*: 0 tickets abiertos pendientes.';
    }

    const lines = [
      `🎫 *Tickets de Soporte Abiertos (${list.length})*:`,
      ...list.map(
        (t) => `• [#${t.ticket_number || t.id.slice(0, 5)}] [${(t.priority || 'medium').toUpperCase()}] ${t.title}`
      ),
    ];
    return lines.join('\n');
  }

  /**
   * Devuelve detalle de consumo de tokens para el comando `#consumo`
   */
  static async getPlatformTokensReport(): Promise<string> {
    const { data: orgs } = await (supabaseAdmin.from('organizations') as any)
      .select('id, name, ai_tokens_used, ai_tokens_limit')
      .neq('is_active', false);

    const list: any[] = Array.isArray(orgs) ? orgs : [];
    const sorted = list
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
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 8);

    if (sorted.length === 0) {
      return '📊 *Consumo de Tokens*: No hay datos de organizaciones.';
    }

    const lines = [
      '📊 *Top Empresas por Consumo de Tokens (IA)*:',
      ...sorted.map(
        (o) =>
          `• *${o.name}*: ${o.pct}% (${Math.round(o.used / 1000)}k / ${Math.round(o.limit / 1000)}k tokens)`
      ),
    ];
    return lines.join('\n');
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
      severity: 'info',
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
