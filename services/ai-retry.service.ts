import { supabaseAdmin } from '@/lib/supabase/admin';
import { MessagingService } from '@/services/messaging.service';
import { isLeadWindowOpen } from '@/services/contact.service';

/**
 * Reintentos diferidos de IA.
 *
 * Dos estrategias:
 * - `resend`: la respuesta ya estaba generada pero el despacho al canal falló (transitorio).
 *   Se reenvía el texto/media ya generados SIN volver a gastar tokens del LLM.
 * - `regenerate`: el worker de IA falló antes de responder al lead. Se re-dispara el turno
 *   de IA pendiente del contacto (con los candados de ventana y atención humana revalidados).
 *
 * Errores de credenciales del canal (token expirado, 401/403) NO se reintentan: ya disparan
 * su propia alerta de plataforma y un reintento solo acumularía fallos.
 */

export type AiRetryStrategy = 'resend' | 'regenerate';

export interface AiRetryPayload {
  messageId?: string | null;
  recipientId?: string | null;
  text?: string | null;
  media?: Array<{ url: string; caption?: string }>;
  insertedMessageId?: string | null;
  reason?: string | null;
}

export interface AiRetryEnqueueParams {
  organizationId: string;
  contactId: string;
  channel: string;
  strategy: AiRetryStrategy;
  payload: AiRetryPayload;
}

export interface AiRetryProcessResult {
  processed: number;
  sent: number;
  failed: number;
  cancelled: number;
  deferred: number;
}

/** Backoff por intento (minutos): 2 → 10 → 30. */
export const RETRY_BACKOFF_MINUTES = [2, 10, 30];

export function computeNextRetryDelayMs(attempt: number): number {
  const n = Math.max(1, attempt || 1);
  return 90_000 * n * n;
}

/**
 * Detecta errores de autenticación/credenciales del canal: no vale la pena reintentarlos.
 */
export function isChannelAuthError(message?: string | null): boolean {
  if (!message) return false;
  const msg = String(message).toLowerCase();
  return (
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('authentication') ||
    msg.includes('access token') ||
    msg.includes('token expired') ||
    (msg.includes('token') && (msg.includes('invalid') || msg.includes('expired') || msg.includes('revoked'))) ||
    msg.includes('oauth') ||
    msg.includes('bad credentials') ||
    msg.includes('credenciales')
  );
}

export class AiRetryService {
  static processRetryQueue = (params?: { organizationId?: string; limit?: number; deadlineMs?: number; maxBatch?: number; force?: boolean }) =>
    AiRetryService.processPendingRetries(params ? { organizationId: params.organizationId, limit: params.limit ?? params.maxBatch, deadlineMs: params.deadlineMs } : undefined);
  /**
   * Encola un reintento diferido. Nunca lanza: los callers usan `.catch(() => {})`
   * y un fallo de encolado no debe romper el turno de IA.
   */
  static async enqueueRetry(params: AiRetryEnqueueParams): Promise<{ queued: boolean; id?: string }> {
    try {
      const { data, error } = await (supabaseAdmin.from('ai_retry_queue') as any)
        .insert({
          organization_id: params.organizationId,
          contact_id: params.contactId,
          channel: params.channel || 'whatsapp',
          strategy: params.strategy,
          payload: params.payload || {},
          status: 'pending',
          next_attempt_at: new Date(Date.now() + RETRY_BACKOFF_MINUTES[0] * 60 * 1000).toISOString(),
        })
        .select('id')
        .single();
      if (error) throw error;
      return { queued: true, id: data?.id };
    } catch (err: any) {
      console.warn('[AI RETRY ENQUEUE WARN]', err?.message || err);
      return { queued: false };
    }
  }

  /**
   * Procesa la cola de reintentos vencidos. Diseñado para correr dentro del cron de
   * reactivación con presupuesto de tiempo (deadlineMs).
   */
  static async processPendingRetries(params?: {
    organizationId?: string;
    limit?: number;
    deadlineMs?: number;
  }): Promise<AiRetryProcessResult> {
    const result: AiRetryProcessResult = { processed: 0, sent: 0, failed: 0, cancelled: 0, deferred: 0 };
    const limit = Math.min(Math.max(params?.limit ?? 25, 1), 100);
    const deadline = params?.deadlineMs ?? Date.now() + 30_000;

    let query = (supabaseAdmin.from('ai_retry_queue') as any)
      .select('id, organization_id, contact_id, channel, strategy, payload, attempts, max_attempts')
      .eq('status', 'pending')
      .lte('next_attempt_at', new Date().toISOString())
      .order('next_attempt_at', { ascending: true })
      .limit(limit);
    if (params?.organizationId) query = query.eq('organization_id', params.organizationId);

    const { data: jobs, error: jobsErr } = await query;
    if (jobsErr || !jobs || jobs.length === 0) return result;

    // Cargar contactos de una vez para los candados
    const contactIds = Array.from(new Set(jobs.map((j: any) => j.contact_id)));
    const { data: contacts } = await (supabaseAdmin.from('contacts') as any)
      .select('id, organization_id, name, phone, channel, custom_fields, unread_count, waiting_since, conversation_status, pipeline_stage')
      .in('id', contactIds)
      .is('deleted_at', null);
    const cMap = new Map<string, any>((contacts || []).map((c: any) => [c.id, c]));

    for (const job of jobs) {
      if (Date.now() >= deadline) break;
      result.processed++;

      const contact = cMap.get(job.contact_id);
      await (supabaseAdmin.from('ai_retry_queue') as any)
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', job.id);

      // Guardas de validez: si el chat ya no es reintentable, cancelar.
      if (!contact) {
        await this.cancelJob(job.id, 'Contacto eliminado');
        result.cancelled++;
        continue;
      }
      const cf = (contact.custom_fields as Record<string, any>) || {};
      if (
        cf.opted_out === true ||
        contact.conversation_status === 'closed' ||
        cf.conversation_status === 'closed' ||
        contact.pipeline_stage === 'ganado' ||
        contact.pipeline_stage === 'perdido'
      ) {
        await this.cancelJob(job.id, 'Contacto cerrado u opt-out');
        result.cancelled++;
        continue;
      }
      // No interrumpir la atención humana: si el lead escribió y nadie respondió,
      // el reintento de la IA NO debe pisar al asesor.
      if ((contact.unread_count || 0) > 0 || contact.waiting_since || cf.unattended_handoff === true) {
        await this.cancelJob(job.id, 'El chat está en atención humana');
        result.cancelled++;
        continue;
      }

      try {
        if (job.strategy === 'resend') {
          // Fuera de ventana Meta 24h un texto libre no puede salir: cancelar (el
          // seguimiento con plantilla corre por el motor de reactivación, no aquí).
          const provider = (await this.getProvider(job.organization_id)) || 'meta';
          if (provider === 'meta' && !isLeadWindowOpen(contact)) {
            await this.cancelJob(job.id, 'Fuera de ventana Meta 24h');
            result.cancelled++;
            continue;
          }
          const sent = await this.executeResend(contact, job.payload);
          if (sent) {
            await this.markDone(job.id);
            result.sent++;
          } else {
            await this.markFailed(job.id, job.attempts, job.max_attempts, 'El canal no confirmó el envío');
            result.failed++;
          }
        } else {
          // regenerate: re-disparar el turno de IA pendiente (import dinámico para
          // evitar el ciclo estático inbound-core ⇄ ai-retry).
          const mod = await import('./inbound-core.service');
          const ok = await mod.InboundCoreService.triggerPendingAiForContact(job.contact_id);
          if (ok) {
            await this.markDone(job.id);
            result.sent++;
          } else {
            await this.markFailed(job.id, job.attempts, job.max_attempts, 'El contacto ya no tiene mensaje pendiente de IA');
            result.failed++;
          }
        }
      } catch (err: any) {
        const errMsg = String(err?.message || err);
        if (isChannelAuthError(errMsg)) {
          await this.cancelJob(job.id, `Error de credenciales del canal: ${errMsg.slice(0, 180)}`);
          result.cancelled++;
        } else {
          await this.markFailed(job.id, job.attempts, job.max_attempts, errMsg.slice(0, 400));
          result.failed++;
        }
      }
    }

    return result;
  }

  private static async getProvider(organizationId: string): Promise<string | null> {
    try {
      const { data: org } = await (supabaseAdmin.from('organizations') as any)
        .select('whatsapp_provider')
        .eq('id', organizationId)
        .single();
      return org?.whatsapp_provider || null;
    } catch {
      return null;
    }
  }

  /**
   * Reenvía texto + media ya generados por la IA (0 tokens nuevos).
   */
  private static async executeResend(contact: any, payload: AiRetryPayload): Promise<boolean> {
    const orgRes = await (supabaseAdmin.from('organizations') as any)
      .select('*')
      .eq('id', contact.organization_id)
      .single();
    const org = orgRes?.data;
    if (!org) return false;

    const cf = (contact.custom_fields as Record<string, any>) || {};
    const targetRecipient = payload?.recipientId || cf.remote_jid || cf.whatsapp_jid || contact.phone;
    const text = String(payload?.text || '').trim();
    const media = Array.isArray(payload?.media) ? payload.media.slice(0, 3) : [];

    let sentSomething = false;
    if (text) {
      const msgId = await MessagingService.sendTextMessage({
        organization: org,
        to: targetRecipient,
        body: text,
        simulateTyping: false,
      });
      sentSomething = Boolean(msgId);
    }
    for (const m of media) {
      if (!m?.url) continue;
      try {
        const mediaId = await MessagingService.sendMediaMessage({
          organization: org,
          to: targetRecipient,
          mediaUrl: m.url,
          caption: m.caption || undefined,
        });
        if (mediaId) sentSomething = true;
      } catch (err: any) {
        console.warn('[AI RETRY MEDIA WARN]', err?.message || err);
      }
    }

    // Marcar el mensaje original como entregado (estaba en 'sending'/'failed')
    if (sentSomething && payload?.messageId) {
      await (supabaseAdmin.from('messages') as any)
        .update({ status: 'sent', updated_at: new Date().toISOString() })
        .eq('id', payload.messageId);
    }
    return sentSomething;
  }

  private static async markDone(jobId: string): Promise<void> {
    await (supabaseAdmin.from('ai_retry_queue') as any)
      .update({ status: 'sent', updated_at: new Date().toISOString() })
      .eq('id', jobId);
  }

  private static async cancelJob(jobId: string, reason: string): Promise<void> {
    await (supabaseAdmin.from('ai_retry_queue') as any)
      .update({ status: 'cancelled', last_error: reason, updated_at: new Date().toISOString() })
      .eq('id', jobId);
  }

  private static async markFailed(jobId: string, attempts: number, maxAttempts: number, error: string): Promise<void> {
    const nextAttempts = (attempts || 0) + 1;
    if (nextAttempts >= (maxAttempts || 3)) {
      await (supabaseAdmin.from('ai_retry_queue') as any)
        .update({ status: 'failed', attempts: nextAttempts, last_error: error, updated_at: new Date().toISOString() })
        .eq('id', jobId);
      return;
    }
    const backoffIdx = Math.min(nextAttempts - 1, RETRY_BACKOFF_MINUTES.length - 1);
    await (supabaseAdmin.from('ai_retry_queue') as any)
      .update({
        status: 'pending',
        attempts: nextAttempts,
        last_error: error,
        next_attempt_at: new Date(Date.now() + RETRY_BACKOFF_MINUTES[backoffIdx] * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
  }
}
