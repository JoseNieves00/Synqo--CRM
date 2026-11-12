import { supabaseAdmin } from '@/lib/supabase/admin';
import { isConversationClosed } from '@/lib/crm/constants';
import { MessagingService } from './messaging.service';
import { InstagramService } from './instagram.service';
import { PlatformAlertService } from './platform-alert.service';
import { isLeadWindowOpen } from './contact.service';
import { decryptSecret } from '@/lib/security/encryption';

/**
 * ============================================================================
 * AiRetryService — Reintentos diferidos de IA (dead-letter con reintento real)
 * ============================================================================
 * Problema que resuelve: si `processLeadMessage` falla (caída de proveedor,
 * timeout, excepción) o si el despacho al canal falla, el cliente se quedaba
 * sin respuesta para siempre: el run se registraba en `ai_runs` pero nadie
 * reintentaba y nadie avisaba con urgencia al asesor.
 *
 * Flujo:
 *  1. `InboundCoreService` encola un reintento cuando falla la generación
 *     (strategy 'regenerate') o el despacho (strategy 'resend').
 *  2. El cron de reactivación (`/api/cron/lead-reactivation`) procesa la cola
 *     con presupuesto de tiempo propio, antes de las campañas.
 *  3. Backoff exponencial corto (90s → 4min → 9min), máx. 2 reintentos.
 *  4. Si se agotan los intentos: mensaje de sistema en el chat, badge
 *     "Requiere atención" y alerta al SuperAdmin.
 */

/** Errores de credenciales del canal: no tienen remedio con reintento (ya disparan su propia alerta). */
export function isChannelAuthError(message: string | null | undefined): boolean {
  const m = String(message || '').toLowerCase();
  return (
    m.includes('190') ||
    m.includes('oauthexception') ||
    m.includes('token expir') ||
    m.includes('credenciales del canal')
  );
}

/** Backoff exponencial corto: intento 1 → 90s, intento 2 → 4min, intento 3 → 9min. */
export function computeNextRetryDelayMs(attempts: number): number {
  const slot = Math.max(1, Math.floor(attempts));
  return 90_000 * slot * slot;
}

export interface RetryQueueRow {
  id: string;
  organization_id: string;
  contact_id: string;
  channel: string;
  strategy: 'regenerate' | 'resend';
  payload: Record<string, any>;
  attempts: number;
  max_attempts: number;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  last_error: string | null;
  next_retry_at: string;
  created_at: string;
  updated_at: string;
}

export class AiRetryService {
  /**
   * Encola un reintento. Deduplica: si ya hay una fila pendiente del mismo
   * contacto con la misma estrategia, no duplica.
   */
  static async enqueueRetry(params: {
    organizationId: string;
    contactId: string;
    channel: string;
    strategy: 'regenerate' | 'resend';
    payload?: Record<string, any>;
    maxAttempts?: number;
  }): Promise<boolean> {
    try {
      const { data: existing } = await (supabaseAdmin.from('ai_retry_queue') as any)
        .select('id')
        .eq('organization_id', params.organizationId)
        .eq('contact_id', params.contactId)
        .eq('strategy', params.strategy)
        .eq('status', 'pending')
        .limit(1)
        .maybeSingle();

      if (existing) return false;

      const { error } = await (supabaseAdmin.from('ai_retry_queue') as any).insert({
        organization_id: params.organizationId,
        contact_id: params.contactId,
        channel: params.channel,
        strategy: params.strategy,
        payload: params.payload || {},
        max_attempts: params.maxAttempts ?? 2,
        status: 'pending',
      });

      if (error) {
        console.warn('[AI RETRY ENQUEUE WARN]', error);
        return false;
      }
      console.log(`[AI RETRY] Reintento encolado (${params.strategy}) para contacto ${params.contactId}`);
      return true;
    } catch (err) {
      console.warn('[AI RETRY ENQUEUE ERROR]', err);
      return false;
    }
  }

  /**
   * Procesa la cola de reintentos con presupuesto de tiempo (llamado desde el cron).
   */
  static async processRetryQueue(params: {
    organizationId?: string;
    deadlineMs?: number;
    maxItems?: number;
  }): Promise<{
    processed: number;
    succeeded: number;
    rescheduled: number;
    exhausted: number;
    skipped: number;
  }> {
    const deadline = params.deadlineMs || Date.now() + 15_000;
    const maxItems = params.maxItems || 12;
    const summary = { processed: 0, succeeded: 0, rescheduled: 0, exhausted: 0, skipped: 0 };

    let query = (supabaseAdmin.from('ai_retry_queue') as any)
      .select('*')
      .eq('status', 'pending')
      .lte('next_retry_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(maxItems);

    if (params.organizationId) query = query.eq('organization_id', params.organizationId);

    const { data: dueRows, error } = await query;
    if (error) {
      console.warn('[AI RETRY QUEUE FETCH WARN]', error);
      return summary;
    }
    if (!dueRows || dueRows.length === 0) return summary;

    for (const row of dueRows as RetryQueueRow[]) {
      if (Date.now() >= deadline) break;

      // Claim atómico: solo una instancia puede tomar la fila (evita doble envío entre crons concurrentes)
      const { data: claimed, error: claimError } = await (supabaseAdmin.from('ai_retry_queue') as any)
        .update({ status: 'in_progress', updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('status', 'pending')
        .select('id');
      if (claimError || !claimed || claimed.length === 0) {
        summary.skipped++;
        continue;
      }

      const attempts = (row.attempts || 0) + 1;
      let outcome: { success: boolean; error?: string; handoff?: boolean; skipped?: string };

      try {
        outcome = row.strategy === 'resend'
          ? await this.attemptResend(row)
          : await this.attemptRegenerate(row);
      } catch (err: any) {
        outcome = { success: false, error: err?.message || 'Error desconocido en reintento' };
      }

      if (outcome.success) {
        summary.succeeded++;
        await (supabaseAdmin.from('ai_retry_queue') as any)
          .update({
            status: 'done',
            attempts,
            // Si se omitió por conversación cerrada, queda rastro auditado sin escalar
            last_error: outcome.skipped ? `skipped: ${outcome.skipped}` : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        continue;
      }

      if (attempts >= (row.max_attempts || 2)) {
        summary.exhausted++;
        // 🛡️ Anti-falsos-positivos: si la conversación se cerró mientras la fila
        // esperaba, no escalar al asesor ni al SuperAdmin (no hay nada que atender).
        const closed = await this.isContactClosed(row.contact_id);
        await (supabaseAdmin.from('ai_retry_queue') as any)
          .update({
            status: closed ? 'done' : 'failed',
            attempts,
            last_error: closed
              ? 'skipped: conversation closed'
              : (outcome.error || '').slice(0, 400),
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        if (!closed) await this.escalateToAdvisor(row, outcome.error || 'Error desconocido');
        continue;
      }

      summary.rescheduled++;
      const nextAt = new Date(Date.now() + computeNextRetryDelayMs(attempts)).toISOString();
      await (supabaseAdmin.from('ai_retry_queue') as any)
        .update({
          status: 'pending',
          attempts,
          last_error: (outcome.error || '').slice(0, 400),
          next_retry_at: nextAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
    }

    return summary;
  }

  // -------------------------------------------------------------------------

  /**
   * Reintento de despacho: la respuesta YA fue generada pero el envío al canal falló.
   * Reenvía el mismo texto (y las media que se hubieran extraído del texto) sin
   * gastar tokens de nuevo en el LLM.
   */
  private static async attemptResend(row: RetryQueueRow): Promise<{ success: boolean; error?: string; skipped?: string }> {
    const payload = row.payload || {};
    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    const media: Array<{ url: string; caption?: string }> = Array.isArray(payload.media) ? payload.media : [];
    const recipientId = payload.recipientId || null;
    const messageRowId = payload.messageId || null;

    if (!text && media.length === 0) {
      return { success: false, error: 'Payload de resend sin texto ni media' };
    }
    if (!recipientId) {
      return { success: false, error: 'Payload de resend sin destinatario' };
    }

    // Ventana Meta 24h: si el lead no escribió en 24h, Meta rechazaría el texto libre
    if (row.channel !== 'instagram') {
      const { data: contact } = await (supabaseAdmin.from('contacts') as any)
        .select('last_lead_message_at, custom_fields, conversation_status, closed_at, pipeline_stage')
        .eq('id', row.contact_id)
        .maybeSingle();
      // 🛡️ Anti-falsos-positivos: si la conversación se cerró, no reenviar al cliente
      if (contact && isConversationClosed(contact)) {
        return { success: true, skipped: 'conversation closed' };
      }
      const provider = (await this.getOrganizationProvider(row.organization_id)) || 'meta';
      if (provider === 'meta' && !isLeadWindowOpen(contact || {})) {
        return { success: false, error: 'meta_outside_24h_no_template' };
      }
    }

    const { data: org } = await (supabaseAdmin.from('organizations') as any)
      .select(this.ORG_FIELDS)
      .eq('id', row.organization_id)
      .maybeSingle();
    if (!org) return { success: false, error: 'Organización no encontrada' };

    try {
      for (const mediaItem of media) {
        if (!mediaItem?.url) continue;
        if (row.channel === 'instagram') {
          let igToken = org.instagram_access_token || '';
          try {
            igToken = decryptSecret(igToken);
          } catch {}
          await InstagramService.sendMediaMessage({
            instagramAccountId: org.instagram_account_id || '',
            accessToken: igToken,
            recipientId,
            mediaUrl: mediaItem.url,
          });
        } else {
          await MessagingService.sendMediaMessage({
            organization: this.toMessagingOrg(org),
            to: recipientId,
            mediaUrl: mediaItem.url,
            caption: mediaItem.caption || undefined,
            mediaType: 'image',
          });
        }
        await (supabaseAdmin.from('messages') as any).insert({
          contact_id: row.contact_id,
          organization_id: row.organization_id,
          sender_type: 'ai',
          content: mediaItem.caption ? `🖼️ ${mediaItem.caption}` : '[Imagen]',
          status: 'sent',
          channel: row.channel === 'instagram' ? 'instagram' : 'whatsapp',
        });
      }

      let providerMessageId: string | null = null;
      if (text) {
        if (row.channel === 'instagram') {
          let igToken = org.instagram_access_token || '';
          try {
            igToken = decryptSecret(igToken);
          } catch {}
          providerMessageId = await InstagramService.sendDirectMessage({
            instagramAccountId: org.instagram_account_id || '',
            accessToken: igToken,
            recipientId,
            text,
          });
        } else {
          providerMessageId = await MessagingService.sendTextMessage({
            organization: this.toMessagingOrg(org),
            to: recipientId,
            body: text,
            simulateTyping: true,
          });
        }

        if (messageRowId) {
          await (supabaseAdmin.from('messages') as any)
            .update({
              status: 'sent',
              meta_message_id: providerMessageId || null,
              error_message: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', messageRowId);
        } else {
          await (supabaseAdmin.from('messages') as any).insert({
            contact_id: row.contact_id,
            organization_id: row.organization_id,
            sender_type: 'ai',
            content: text,
            status: 'sent',
            channel: row.channel === 'instagram' ? 'instagram' : 'whatsapp',
          });
        }
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error de despacho en reintento' };
    }
  }

  /**
   * Reintento de generación: la IA falló antes de producir respuesta. Reconstruye
   * el payload desde la DB y re-ejecuta el worker completo (con sus defensas de
   * debounce, anti-duplicados y lock atómico).
   */
  private static async attemptRegenerate(row: RetryQueueRow): Promise<{
    success: boolean;
    error?: string;
    handoff?: boolean;
    skipped?: string;
  }> {
    const { data: contact } = await (supabaseAdmin.from('contacts') as any)
      .select('id, organization_id, phone, name, is_ai_active, custom_fields, last_lead_message_at, conversation_status, closed_at, pipeline_stage')
      .eq('id', row.contact_id)
      .maybeSingle();

    if (!contact) return { success: false, error: 'Contacto no encontrado' };

    // Si un asesor ya tomó el chat, no hay nada que regenerar
    if (!contact.is_ai_active) return { success: true, handoff: true };

    // 🛡️ Anti-falsos-positivos: conversación cerrada → no regenerar ni responder
    if (isConversationClosed(contact)) {
      return { success: true, skipped: 'conversation closed' };
    }

    const { data: org } = await (supabaseAdmin.from('organizations') as any)
      .select(this.ORG_FIELDS)
      .eq('id', row.organization_id)
      .maybeSingle();
    if (!org) return { success: false, error: 'Organización no encontrada' };

    const { data: lastLeadMsg } = await (supabaseAdmin.from('messages') as any)
      .select('id, content, created_at')
      .eq('contact_id', row.contact_id)
      .eq('sender_type', 'lead')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lastLeadMsg) return { success: false, error: 'Sin mensaje del lead para responder' };

    // Ventana Meta 24h: fuera de ventana, regenerar produciría un envío rechazado
    if (row.channel !== 'instagram') {
      const provider = (org.whatsapp_provider as string) || 'meta';
      if (provider === 'meta' && !isLeadWindowOpen(contact)) {
        return { success: false, error: 'meta_outside_24h_no_template' };
      }
    }

    const insertedMessageId = row.payload?.insertedMessageId || lastLeadMsg.id;

    // Import dinámico para evitar dependencia circular (inbound-core ↔ ai-retry)
    const { InboundCoreService } = await import('./inbound-core.service');
    const retryStartIso = new Date().toISOString();

    await InboundCoreService.runAiWorker({
      payload: {
        organization: org,
        channel: row.channel as any,
        channelMessageId: insertedMessageId,
        senderId: contact.phone,
        senderName: contact.name || 'Cliente',
        rawContent: lastLeadMsg.content || '',
        remoteJid: contact.custom_fields?.remote_jid || null,
      },
      contactId: row.contact_id,
      insertedMessageId,
    });

    // Verificación: ¿la IA produjo un mensaje saliente después del reintento?
    const { data: newOutbound } = await (supabaseAdmin.from('messages') as any)
      .select('id, status')
      .eq('contact_id', row.contact_id)
      .in('sender_type', ['ai', 'agent_manual'])
      .gte('created_at', retryStartIso)
      .limit(1)
      .maybeSingle();

    if (newOutbound && newOutbound.status !== 'failed') return { success: true };

    // El worker pudo abortar limpiamente (asesor tomó el chat durante la espera)
    const { data: recheck } = await (supabaseAdmin.from('contacts') as any)
      .select('is_ai_active')
      .eq('id', row.contact_id)
      .maybeSingle();
    if (recheck && !recheck.is_ai_active) return { success: true, handoff: true };

    return { success: false, error: 'El worker de IA no produjo respuesta en el reintento' };
  }

  /**
   * Escalada tras agotar reintentos: mensaje de sistema en el chat, badge
   * "Requiere atención" y alerta al SuperAdmin.
   */
  private static async escalateToAdvisor(row: RetryQueueRow, lastError: string): Promise<void> {
    try {
      // 🛡️ Nada que escalar si la conversación ya se cerró mientras se reintentaba
      if (await this.isContactClosed(row.contact_id)) {
        console.log(`[AI RETRY] Escalada omitida: conversación ${row.contact_id} cerrada`);
        return;
      }

      await (supabaseAdmin.from('messages') as any).insert({
        contact_id: row.contact_id,
        organization_id: row.organization_id,
        sender_type: 'system',
        content: `⚠️ El asistente automático no pudo responder a este cliente tras varios intentos (${String(lastError).slice(0, 140)}). Revísalo y respóndele manualmente.`,
      });

      const { data: contact } = await (supabaseAdmin.from('contacts') as any)
        .select('custom_fields')
        .eq('id', row.contact_id)
        .maybeSingle();
      const cf = (contact?.custom_fields as Record<string, any>) || {};
      await (supabaseAdmin.from('contacts') as any)
        .update({
          conversation_status: 'open',
          waiting_since: new Date().toISOString(),
          custom_fields: { ...cf, unattended_handoff: true },
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.contact_id);

      const { data: org } = await (supabaseAdmin.from('organizations') as any)
        .select('name')
        .eq('id', row.organization_id)
        .maybeSingle();

      PlatformAlertService.notifySuperAdminEvent({
        type: 'ai_retry_exhausted',
        orgId: row.organization_id,
        companyName: org?.name || 'Empresa Synqo',
        title: 'IA sin respuesta tras reintentos',
        details: `Contacto ${row.contact_id} (${row.strategy}). Último error: ${String(lastError).slice(0, 160)}`,
        dedupeWindowMinutes: 30,
      }).catch(() => {});
    } catch (err) {
      console.warn('[AI RETRY ESCALATE WARN]', err);
    }
  }

  // -------------------------------------------------------------------------

  private static async getOrganizationProvider(organizationId: string): Promise<string | null> {
    const { data } = await (supabaseAdmin.from('organizations') as any)
      .select('whatsapp_provider')
      .eq('id', organizationId)
      .maybeSingle();
    return data?.whatsapp_provider || null;
  }

  /** 🛡️ Consulta el cierre de la conversación con la fuente única compartida. */
  private static async isContactClosed(contactId: string): Promise<boolean> {
    try {
      const { data } = await (supabaseAdmin.from('contacts') as any)
        .select('conversation_status, closed_at, pipeline_stage, custom_fields')
        .eq('id', contactId)
        .maybeSingle();
      return isConversationClosed(data);
    } catch {
      return false;
    }
  }

  private static toMessagingOrg(org: Record<string, any>) {
    return {
      id: org.id,
      name: org.name,
      whatsapp_provider: org.whatsapp_provider,
      whatsapp_phone_number_id: org.whatsapp_phone_number_id,
      whatsapp_access_token: org.whatsapp_access_token,
      evolution_api_url: org.evolution_api_url,
      evolution_api_key: org.evolution_api_key,
      evolution_instance_name: org.evolution_instance_name,
      evolution_anti_ban_mode: true,
    };
  }

  private static readonly ORG_FIELDS =
    'id, name, is_active, subscription_status, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, whatsapp_app_secret, evolution_api_url, evolution_api_key, evolution_instance_name, instagram_account_id, instagram_access_token, system_prompt, structured_prompt_data, handoff_mode, after_hours_message, business_hours, ai_provider, enabled_modules, appointment_settings';
}
