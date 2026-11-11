import { supabaseAdmin } from '@/lib/supabase/admin';
import { LeadScoreService } from '@/services/lead-score.service';
import { sanitizeLeadMessage } from '@/lib/security/sanitize';
import { formatQuoteMessageContent, formatImageMessageContent } from '@/lib/media/format';
import { AssignmentService } from './assignment.service';
import { MessagingService } from './messaging.service';
import { InstagramService } from './instagram.service';
import { OpenAIService } from './openai.service';
import { HandoffService } from './handoff.service';
import { ManagerWhatsAppService } from './manager-whatsapp.service';
import { PlatformAlertService } from './platform-alert.service';
import { NotificationService } from '@/lib/notifications/resend';
import { decryptSecret } from '@/lib/security/encryption';
import { AI_OPERATIONAL_CONFIG, AI_TEXT_TEMPLATES, getAiChatChain } from '@/lib/ai/config';
import { resolveLeadTemperature, resolveProductInterest } from '@/lib/ai/follow-up-types';

export type InboundChannel = 'whatsapp_meta' | 'whatsapp_evolution' | 'instagram';

export interface InboundMediaInfo {
  type: 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'contacts' | 'location';
  url?: string;
  caption?: string;
  fileName?: string;
  isVoiceNote?: boolean;
}

export interface InboundPayload {
  organization: {
    id: string;
    name?: string;
    is_active?: boolean | null;
    subscription_status?: string | null;
    whatsapp_provider?: 'meta' | 'evolution' | null;
    whatsapp_phone_number_id?: string | null;
    whatsapp_access_token?: string | null;
    whatsapp_app_secret?: string | null;
    evolution_api_url?: string | null;
    evolution_api_key?: string | null;
    evolution_instance_name?: string | null;
    instagram_account_id?: string | null;
    instagram_access_token?: string | null;
    system_prompt?: string | null;
    structured_prompt_data?: any;
    handoff_mode?: string | null;
    after_hours_message?: string | null;
    business_hours?: any;
    ai_provider?: string | null;
    enabled_modules?: any;
    appointment_settings?: any;
  };
  channel: InboundChannel;
  channelMessageId: string;
  senderId: string; // Número de teléfono E.164 o IGSID de Instagram
  senderName: string;
  rawContent: string;
  media?: InboundMediaInfo;
  replyToChannelMessageId?: string | null; // wamid, stanzaId o mid del mensaje citado
  quotedTextSnippet?: string | null; // Texto de la cita si el proveedor ya lo resolvió
  reactionEmoji?: string | null; // Emoji si el evento es de tipo reacción
  isPaymentReceipt?: boolean;
  remoteJid?: string | null;
}

export interface InboundResult {
  status:
    | 'success'
    | 'duplicate_ignored'
    | 'reaction_recorded'
    | 'courtesy_reaction_sent'
    | 'payment_receipt_held'
    | 'human_requested'
    | 'after_hours_sent'
    | 'ai_disabled'
    | 'subscription_inactive'
    | 'claimed_by_advisor'
    | 'sent_to_customer'
    | 'advisor_message_acknowledged'
    | 'error';
  contactId?: string;
  messageId?: string;
  error?: string;
}

// Patrones determinísticos: exigir intención explícita de hablar con humano/asesor (nunca "persona" suelta)
export const HUMAN_HANDOFF_PATTERNS = [
  /\b(asesor|agente\s+humano|persona\s+real|operador\s+humano|alguien\s+real)\b/i,
  /(?:hablar|comunicar(?:me)?|pasar(?:me)?|atender(?:me)?|que\s+me\s+atienda)\s+(?:con|a)\s+(?:un|una|alguien|persona|humano|asesor)/i,
  /(?:quiero|necesito|prefiero)\s+(?:hablar\s+con\s+(?:alguien|una?\s+persona)|(?:un|una)\s+(?:asesor|persona|humano))/i,
  /(?:atenci[oó]n|soporte)\s+human[ao]/i,
];

const OPT_OUT_PATTERNS = [
  /\b(no me escriba(?:s|n)?(?:\s+m[aá]s)?|no me vuelva(?:s|n)? a escribir|dej(?:a|en|ar) de escribir(?:me|nos)?|no me contacte(?:s|n)?|no quiero\s+(?:recibir\s+)?m[aá]s mensajes|cancelar mensajes|dejar de recibir)\b/i,
];

export function isOptOutMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  return OPT_OUT_PATTERNS.some((p) => p.test(text.trim()));
}

export function isExplicitHumanHandoffRequest(text: string | null | undefined): boolean {
  if (!text) return false;
  return HUMAN_HANDOFF_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Detecta mensajes de despedida o agradecimiento de cortesía pura (ej: "ok gracias", "muchas gracias").
 * En ventas por WhatsApp, responder texto largo a esto resulta molesto y robótico.
 * Reaccionar con emoji 👍 es la conducta humana recomendada.
 */
export function isCourtesyClosingMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  const clean = text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remover acentos
    .replace(/[^\w\s]/gi, ' ') // remover puntuación y emojis
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean || clean.length > 45) return false;
  if (text.includes('?') || text.includes('¿')) return false;

  // Palabras comerciales o de intención multi-nicho que impiden que sea un simple cierre
  const commercialKeywords = [
    'cuanto', 'precio', 'valor', 'vale', 'costo', 'foto', 'modelo', 'comprar', 'tienen',
    'envio', 'domicilio', 'pago', 'transferencia', 'tarjeta', 'cuenta', 'apartar', 'abono',
    'pedir', 'medida', 'color', 'cita', 'agenda', 'horario', 'disponibilidad', 'reserva',
    'plan', 'servicio', 'presupuesto', 'cotizacion', 'ubicacion', 'garantia',
  ];
  if (commercialKeywords.some((kw) => clean.includes(kw))) {
    return false;
  }

  // Si la palabra clave "gracias" o "grax" está presente en frases cortas de cortesía
  const isThanks = /\b(gracias|muchas gracias|mil gracias|grax|grx)\b/.test(clean);
  if (isThanks) {
    return true;
  }

  const otherCourtesyClosings = new Set([
    'ok',
    'okey',
    'oka',
    'vale',
    'listo',
    'dale',
    'perfecto',
    'bueno',
    'super',
    'excelente',
    'ok vale',
    'listo vale',
    'dale pues',
    'feliz dia',
    'buen dia',
    'igualmente',
    'feliz tarde',
    'feliz noche',
    'buena tarde',
    'buena noche',
    'muy amable',
    'muy amables',
  ]);

  return otherCourtesyClosings.has(clean);
}

export class InboundCoreService {
  /**
   * Procesa de manera uniforme cualquier mensaje entrante de Meta WhatsApp, Evolution API o Instagram Direct.
   */
  static async processInbound(payload: InboundPayload): Promise<InboundResult> {
    const result = await this.processInboundInternal(payload);
    // Score de propensión: recalcular tras cada mensaje entrante que afecte a un contacto
    // (cubre reglas de opt-out, comprobante de pago, cortesía y nuevos contactos).
    if (result?.contactId && result.status !== 'duplicate_ignored' && result.status !== 'error') {
      await LeadScoreService.recompute(result.contactId);
    }
    return result;
  }

  private static async processInboundInternal(payload: InboundPayload): Promise<InboundResult> {
    const { organization, channel, channelMessageId, senderId, senderName } = payload;
    const orgId = organization.id;

    // 1. Deduplicación global: evitar procesar o cobrar dos veces el mismo mensaje de red
    const { data: existingMessage } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('meta_message_id', channelMessageId)
      .maybeSingle();

    if (existingMessage) {
      return { status: 'duplicate_ignored', messageId: existingMessage.id };
    }

    // 2. Manejo de Reacciones de WhatsApp (0 tokens de IA, registro visual y actualización de lectura)
    if (payload.reactionEmoji && payload.replyToChannelMessageId) {
      const { data: targetMsg } = await (supabaseAdmin.from('messages') as any)
        .select('id, contact_id, reactions')
        .eq('meta_message_id', payload.replyToChannelMessageId)
        .maybeSingle();

      if (targetMsg) {
        const reactionsPayload = {
          emoji: payload.reactionEmoji,
          from: 'lead',
          reacted_at: new Date().toISOString(),
        };

        await (supabaseAdmin.from('messages') as any)
          .update({ reactions: reactionsPayload })
          .eq('id', targetMsg.id);

        if (targetMsg.contact_id) {
          await (supabaseAdmin.from('contacts') as any)
            .update({ last_interaction_at: new Date().toISOString() })
            .eq('id', targetMsg.contact_id);
        }

        return { status: 'reaction_recorded', messageId: targetMsg.id, contactId: targetMsg.contact_id };
      }
    }

    // 3. Resolución de Citas (@[Quote]): vincular con mensaje original y formatear contexto para la IA
    let replyToMessageDbId: string | null = null;
    let finalContent = payload.rawContent;

    if (payload.replyToChannelMessageId) {
      const { data: quotedMsg } = await (supabaseAdmin.from('messages') as any)
        .select('id, content, sender_type')
        .eq('meta_message_id', payload.replyToChannelMessageId)
        .maybeSingle();

      if (quotedMsg) {
        replyToMessageDbId = quotedMsg.id;
        const snippet = (payload.quotedTextSnippet || quotedMsg.content || '').slice(0, 120).trim();
        if (snippet && !finalContent.includes('[Cita:')) {
          finalContent = formatQuoteMessageContent(snippet, finalContent);
        }
      } else if (payload.quotedTextSnippet && !finalContent.includes('[Cita:')) {
        finalContent = formatQuoteMessageContent(payload.quotedTextSnippet, finalContent);
      }
    }

    const sanitizedContent = sanitizeLeadMessage(finalContent);
    const isPdfPaymentReceipt =
      /(?:📄\s*\[Documento|https?:\/\/[^\s\]]+\.pdf\b)/i.test(sanitizedContent) &&
      /(comprobante|transferencia|soporte\s*de\s*pago|nequi|daviplata|bancolombia|pse|recibo|voucher|consignaci[oó]n)/i.test(
        sanitizedContent
      );
    const isPaymentReceipt = Boolean(payload.isPaymentReceipt || isPdfPaymentReceipt);
    const isOptOut = isOptOutMessage(sanitizedContent);

    // 🛡️ INTERCEPTOR ANTI-BUCLE, COMANDOS GERENCIALES Y RELEVOS POR WHATSAPP
    // Si el remitente es un asesor o administrador de la empresa, no crearlo como lead.
    if (channel !== 'instagram') {
      const cleanSender = HandoffService.cleanE164Phone(senderId);
      const { data: orgAdvisors } = await (supabaseAdmin.from('profiles') as any)
        .select('id, full_name, role, is_super_admin, organization_id, whatsapp_phone')
        .eq('organization_id', orgId)
        .not('whatsapp_phone', 'is', null);

      const matchedAdvisor = (orgAdvisors || []).find((p: any) => {
        const cleanProfilePhone = HandoffService.cleanE164Phone(String(p.whatsapp_phone || ''));
        return Boolean(cleanSender && cleanProfilePhone && cleanProfilePhone === cleanSender);
      });

      if (matchedAdvisor) {
        console.log(`[INBOUND CORE] 👨‍💼 Mensaje de asesor interceptado: ${matchedAdvisor.full_name} (${senderId})`);

        // Si el asesor respondió citando una alerta de relevo (@[Quote])
        if (payload.replyToChannelMessageId) {
          const { data: alert } = await (supabaseAdmin.from('handoff_alerts') as any)
            .select('id, contact_id, organization_id')
            .eq('organization_id', orgId)
            .eq('channel_message_id', payload.replyToChannelMessageId)
            .maybeSingle();

          if (alert && alert.contact_id) {
            const rawTrimmed = (payload.rawContent || '').trim().toLowerCase();

            // Comando 1 o tomo: Asignárselo sin responderle al cliente
            if (rawTrimmed === '1' || rawTrimmed === 'tomo' || rawTrimmed === 'lo tomo') {
              await (supabaseAdmin.from('contacts') as any)
                .update({ assigned_to: matchedAdvisor.id, is_ai_active: false })
                .eq('id', alert.contact_id);

              await (supabaseAdmin.from('handoff_alerts') as any)
                .update({ status: 'claimed', claimed_at: new Date().toISOString() })
                .eq('id', alert.id);

              await (supabaseAdmin.from('messages') as any).insert({
                contact_id: alert.contact_id,
                sender_type: 'system',
                content: `[📱 ${matchedAdvisor.full_name} confirmó la toma del lead desde su WhatsApp]`,
              });

              return { status: 'claimed_by_advisor', contactId: alert.contact_id };
            }

            // Si el texto es una respuesta comercial para el cliente, reenviarla al cliente
            const { data: targetContact } = await (supabaseAdmin.from('contacts') as any)
              .select('id, phone, name')
              .eq('id', alert.contact_id)
              .single();

            if (targetContact && targetContact.phone) {
              await MessagingService.sendTextMessage({
                organization: payload.organization as any,
                to: targetContact.phone,
                body: payload.rawContent,
              });

              await (supabaseAdmin.from('messages') as any).insert({
                contact_id: alert.contact_id,
                sender_type: 'agent_manual',
                content: payload.rawContent,
                status: 'sent',
              });

              await (supabaseAdmin.from('contacts') as any)
                .update({
                  assigned_to: matchedAdvisor.id,
                  is_ai_active: false,
                  last_interaction_at: new Date().toISOString(),
                })
                .eq('id', alert.contact_id);

              await (supabaseAdmin.from('handoff_alerts') as any)
                .update({ status: 'claimed', claimed_at: new Date().toISOString() })
                .eq('id', alert.id);

              return { status: 'sent_to_customer', contactId: alert.contact_id };
            }
          }
        }

        // Modo Gerencial WhatsApp Pull (#tokens, #admin, PIN 4 dígitos) — 0 tokens IA, 0 leads falsos
        try {
          await ManagerWhatsAppService.handleAdvisorMessage({
            organization: payload.organization,
            advisor: matchedAdvisor,
            senderPhone: cleanSender || senderId,
            messageText: payload.rawContent,
          });
        } catch (mgrErr) {
          console.warn('[MANAGER WHATSAPP WARN]', mgrErr);
        }

        return { status: 'advisor_message_acknowledged' };
      }
    }

    // 4. Upsert de Contacto y Balanceo de Carga Multi-Agente
    let contactId: string;
    let isAiActive = true;
    let assignedAgentId: string | null = null;

    let contactQuery = (supabaseAdmin.from('contacts') as any)
      .select('id, is_ai_active, pipeline_stage, deal_value, custom_fields, unread_count, ai_snooze_until, assigned_to')
      .eq('organization_id', orgId);

    if (channel === 'instagram') {
      contactQuery = contactQuery.eq('instagram_id', senderId);
    } else {
      contactQuery = contactQuery.eq('phone', senderId);
    }

    const { data: existingContact } = await contactQuery.maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
      assignedAgentId = existingContact.assigned_to;
      isAiActive = isPaymentReceipt ? false : Boolean(existingContact.is_ai_active);

      const existingCustom = (existingContact as any).custom_fields || {};
      const nowInboundIso = new Date().toISOString();
      const updatedCustomFields: Record<string, any> = {
        ...existingCustom,
        last_lead_message_at: nowInboundIso,
        ...(payload.remoteJid ? { remote_jid: payload.remoteJid, whatsapp_jid: payload.remoteJid } : {}),
      };

      if (isOptOut) {
        updatedCustomFields.opted_out = true;
        updatedCustomFields.opted_out_at = new Date().toISOString();
        updatedCustomFields.lead_temperature = 'cold';
        delete updatedCustomFields.temperature;
      }

      // T2: Si el cliente responde, detener cualquier secuencia de seguimiento en curso y reactivar control normal
      if (updatedCustomFields.follow_up) {
        const nextFu = {
          ...updatedCustomFields.follow_up,
          paused: isOptOut ? true : false,
          lastInboundAt: new Date().toISOString(),
        };
        delete nextFu.nextSendAt;
        updatedCustomFields.follow_up = nextFu;
      }
      if (updatedCustomFields.active_reminder?.reminderType === 'reactivation') {
        delete updatedCustomFields.active_reminder;
      }

      await (supabaseAdmin.from('contacts') as any)
        .update({
          last_interaction_at: new Date().toISOString(),
          name: senderName || undefined,
          channel: channel === 'instagram' ? 'instagram' : 'whatsapp',
          custom_fields: updatedCustomFields,
          ...(isPaymentReceipt || isOptOut ? { is_ai_active: false } : {}),
          ...(isOptOut ? { pipeline_stage: 'perdido', close_reason: 'opt_out_cliente' } : {}),
        })
        .eq('id', contactId);

      // Cancelar recordatorios de reactivación pendientes ya que el cliente respondió
      try {
        await (supabaseAdmin.from('scheduled_reminders') as any)
          .update({ status: 'cancelled' })
          .eq('contact_id', contactId)
          .eq('reminder_type', 'reactivation')
          .eq('status', 'pending');
      } catch {}
    } else {
      // Asignación automática por disponibilidad (Load Balancing)
      assignedAgentId = await AssignmentService.findBestAvailableAgent(orgId);

      const newContactPayload: any = {
        organization_id: orgId,
        name: senderName || (channel === 'instagram' ? 'Lead Instagram' : 'Lead WhatsApp'),
        pipeline_stage: 'nuevo',
        is_ai_active: !isPaymentReceipt,
        assigned_to: assignedAgentId || null,
        channel: channel === 'instagram' ? 'instagram' : 'whatsapp',
        last_interaction_at: new Date().toISOString(),
        custom_fields: {
          last_lead_message_at: new Date().toISOString(),
          ...(payload.remoteJid ? { remote_jid: payload.remoteJid, whatsapp_jid: payload.remoteJid } : {}),
        },
      };

      if (channel === 'instagram') {
        newContactPayload.instagram_id = senderId;
      } else {
        newContactPayload.phone = senderId;
      }

      const { data: newContact, error: createError } = await (supabaseAdmin.from('contacts') as any)
        .insert(newContactPayload)
        .select('id, is_ai_active, assigned_to')
        .single();

      if (createError || !newContact) {
        console.error('[INBOUND CORE CREATE CONTACT ERROR]', createError);
        return { status: 'error', error: createError?.message || 'Error creating contact' };
      }

      contactId = newContact.id;
      isAiActive = Boolean(newContact.is_ai_active);

      if (assignedAgentId) {
        const { data: assignedAgent } = await (supabaseAdmin.from('profiles') as any)
          .select('full_name')
          .eq('id', assignedAgentId)
          .maybeSingle();

        await (supabaseAdmin.from('messages') as any).insert({
          contact_id: contactId,
          sender_type: 'system',
          content: `[Sistema: Lead asignado automáticamente a ${assignedAgent?.full_name || 'Agente'}]`,
        });
      }
    }

    // 5. Inserción Inmediata del Mensaje Entrante
    const { data: insertedMsg, error: insertError } = await (supabaseAdmin.from('messages') as any)
      .insert({
        contact_id: contactId,
        sender_type: 'lead',
        content: sanitizedContent,
        meta_message_id: channelMessageId,
        status: 'delivered',
        reply_to_message_id: replyToMessageDbId,
        channel: channel === 'instagram' ? 'instagram' : 'whatsapp',
        created_at: new Date().toISOString(),
      })
      .select('id, created_at')
      .single();

    if (insertError) {
      if ((insertError as any).code === '23505') {
        return { status: 'duplicate_ignored' };
      }
      console.warn('[INBOUND CORE INSERT MSG ERROR]', insertError);
    }

    const messageId = insertedMsg?.id;

    if (isOptOut) {
      await (supabaseAdmin.from('messages') as any).insert({
        contact_id: contactId,
        sender_type: 'system',
        content: '[🚫 Opt-Out registrado: El cliente pidió no recibir más mensajes. Secuencias e IA detenidas.]',
      });
      return { status: 'ai_disabled', contactId, messageId };
    }

    // 6. Verificación de Snooze y Actualización del Contacto (unread_count lo maneja exclusivamente el trigger de messages)
    const currentCustom = ((existingContact as any)?.custom_fields as Record<string, any>) || {};
    const lastMsgPayload = {
      text: sanitizedContent,
      sender_type: 'lead',
      created_at: new Date().toISOString(),
    };

    const aiSnoozeUntil = (existingContact as any)?.ai_snooze_until || currentCustom.ai_snooze_until;
    let effectiveAiActive = isAiActive;
    let clearSnooze = false;
    const updatedSnoozeCustom: Record<string, any> = {
      ...currentCustom,
      last_lead_message_at: new Date().toISOString(),
    };
    if (aiSnoozeUntil) {
      if (new Date(aiSnoozeUntil).getTime() <= Date.now()) {
        if (currentCustom.manual_ai_paused !== true && !isPaymentReceipt && !isOptOut) {
          effectiveAiActive = true;
        }
        clearSnooze = true;
        delete updatedSnoozeCustom.ai_snooze_until;
        delete updatedSnoozeCustom.mobile_takeover_at;
        delete updatedSnoozeCustom.mobile_takeover_source;
      } else {
        effectiveAiActive = false;
      }
    }

    await (supabaseAdmin.from('contacts') as any)
      .update({
        last_message: lastMsgPayload,
        is_ai_active: effectiveAiActive,
        ai_snooze_until: clearSnooze ? null : ((existingContact as any)?.ai_snooze_until || null),
        custom_fields: updatedSnoozeCustom,
        last_interaction_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId);

    isAiActive = effectiveAiActive;

    // 7. Regla Operativa Anti-No-Show: Detección Determinística de Confirmación de Cita (Unificada)
    try {
      await this.handleAppointmentAutoConfirmation(orgId, contactId, senderName, sanitizedContent);
    } catch (confErr) {
      console.warn('[INBOUND CORE CONFIRMATION CHECK WARN]', confErr);
    }

    // 7.5. Manejo Elegante de Cortesía ("Ok gracias") -> Reacción 👍 solo si NO hay venta abierta ni producto de interés
    const hasOpenSaleOrInterest = Boolean(
      existingContact &&
        (existingContact.pipeline_stage === 'calificado' ||
          existingContact.deal_value ||
          resolveProductInterest(existingContact.custom_fields, existingContact.deal_value) ||
          existingContact.custom_fields?.order)
    );

    if (channel !== 'instagram' && !hasOpenSaleOrInterest && isCourtesyClosingMessage(sanitizedContent)) {
      try {
        await MessagingService.sendReactionMessage({
          organization,
          to: senderId,
          messageId: channelMessageId,
          emoji: '👍',
        });

        const reactionPayload = {
          emoji: '👍',
          from: 'agent',
          reacted_at: new Date().toISOString(),
        };

        if (messageId) {
          await (supabaseAdmin.from('messages') as any)
            .update({ reactions: reactionPayload })
            .eq('id', messageId);
        }

        // Despejar espera/unread y asegurar clasificación inicial para no dejar el chat atascado en "Por responder"
        const { data: latestCourtesyContact } = await (supabaseAdmin.from('contacts') as any)
          .select('custom_fields')
          .eq('id', contactId)
          .maybeSingle();
        const courtesyCf = { ...(latestCourtesyContact?.custom_fields || {}) };
        if (!resolveLeadTemperature(courtesyCf)) {
          courtesyCf.lead_temperature = 'warm';
          delete courtesyCf.temperature;
          if (!courtesyCf.follow_up) {
            courtesyCf.follow_up = { category: 'warm', currentStepIndex: 0 };
          }
        }
        await (supabaseAdmin.from('contacts') as any)
          .update({
            waiting_since: null,
            unread_count: 0,
            conversation_status: 'waiting_customer',
            last_message_sender: 'ai',
            last_message_preview: '👍',
            custom_fields: courtesyCf,
            updated_at: new Date().toISOString(),
          })
          .eq('id', contactId);

        return { status: 'courtesy_reaction_sent', contactId, messageId };
      } catch (reactErr) {
        console.warn('[COURTESY REACTION WARN]', reactErr);
      }
    }

    // 8. Evaluación Uniforme de Guardrails y Solicitud Humana
    if (isPaymentReceipt) {
      const receiptCf: Record<string, any> = {
        ...updatedSnoozeCustom,
        unattended_handoff: true,
        lead_temperature: 'hot',
      };
      delete receiptCf.temperature;
      const shouldPromoteReceipt = existingContact?.pipeline_stage === 'nuevo';

      await (supabaseAdmin.from('messages') as any).insert({
        contact_id: contactId,
        organization_id: orgId,
        sender_type: 'system',
        content: '[🚨 Comprobante de pago recibido: Asesor humano requerido para verificar pago. IA pausada.]',
      });

      if (organization.handoff_mode !== 'silent') {
        try {
          const ackText = AI_TEXT_TEMPLATES.paymentReceiptAck(organization.name);
          await this.dispatchOutboundMessage({
            organization,
            channel,
            recipientId: updatedSnoozeCustom.remote_jid || updatedSnoozeCustom.whatsapp_jid || senderId,
            text: ackText,
            contactId,
          });
          await (supabaseAdmin.from('messages') as any).insert({
            contact_id: contactId,
            organization_id: orgId,
            sender_type: 'ai',
            content: ackText,
            status: 'sent',
            channel: channel === 'instagram' ? 'instagram' : 'whatsapp',
          });
        } catch (ackErr) {
          console.warn('[PAYMENT RECEIPT ACK WARN]', ackErr);
        }
      }

      // Mantener abierto en "Por responder" DESPUÉS de insertar acuse para contrarrestar trigger SQL
      await (supabaseAdmin.from('contacts') as any)
        .update({
          is_ai_active: false,
          conversation_status: 'open',
          waiting_since: (existingContact as any)?.waiting_since || new Date().toISOString(),
          ...(shouldPromoteReceipt ? { pipeline_stage: 'calificado' } : {}),
          custom_fields: receiptCf,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactId);

      // Despacho autónomo e inmediato de alerta al WhatsApp personal del asesor
      HandoffService.notifyHandoff({
        organizationId: orgId,
        contactId,
        reason: isPdfPaymentReceipt ? 'Comprobante de pago recibido en PDF' : 'Comprobante de pago recibido en imagen',
        channel: channel === 'instagram' ? 'instagram' : 'whatsapp',
      }).catch((err) => console.warn('[HANDOFF NOTIFY WARN]', err));

      return { status: 'payment_receipt_held', contactId, messageId };
    }

    const isHumanRequest = isExplicitHumanHandoffRequest(sanitizedContent);
    if (isHumanRequest) {
      await (supabaseAdmin.from('messages') as any).insert({
        contact_id: contactId,
        sender_type: 'system',
        content: '[🚨 Relevo: Cliente solicita atención personalizada]',
      });

      // Despacho autónomo e inmediato de alerta al WhatsApp personal del asesor
      HandoffService.notifyHandoff({
        organizationId: orgId,
        contactId,
        reason: 'Cliente solicita asesor humano de manera explícita',
        channel: channel === 'instagram' ? 'instagram' : 'whatsapp',
      }).catch((err) => console.warn('[HANDOFF NOTIFY WARN]', err));

      if (organization.handoff_mode !== 'silent') {
        const handoffNotice = AI_TEXT_TEMPLATES.explicitHandoff(organization.name, contactId);
        await this.dispatchOutboundMessage({
          organization,
          channel,
          recipientId: senderId,
          text: handoffNotice,
          contactId,
        });

        await (supabaseAdmin.from('messages') as any).insert({
          contact_id: contactId,
          sender_type: 'ai',
          content: handoffNotice,
          status: 'sent',
        });
      }

      // Mantener el chat abierto y marcado como relevo pendiente DESPUÉS de insertar notice (evita que trigger SQL lo marque waiting_customer)
      await (supabaseAdmin.from('contacts') as any)
        .update({
          is_ai_active: false,
          conversation_status: 'open',
          waiting_since: new Date().toISOString(),
          custom_fields: {
            ...currentCustom,
            unattended_handoff: true,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactId);

      return { status: 'human_requested', contactId, messageId };
    }

    // 8. Control de Suscripción de la Organización
    const isSubscriptionActive =
      organization.is_active !== false &&
      (organization.subscription_status === 'active' || organization.subscription_status === 'trialing');

    if (!isSubscriptionActive) {
      return { status: 'subscription_inactive', contactId, messageId };
    }

    if (!isAiActive) {
      return { status: 'ai_disabled', contactId, messageId };
    }

    return { status: 'success', contactId, messageId };
  }

  /**
   * Worker Asíncrono de Inteligencia Artificial con Anti-Burst Buffer y Auditoría en ai_runs.
   */
  static async runAiWorker(params: {
    payload: InboundPayload;
    contactId: string;
    insertedMessageId: string;
  }): Promise<void> {
    try {
      await this.runAiWorkerInternal(params);
    } finally {
      // La IA pudo cambiar temperatura, etapa, pedido o cita durante el turno → refrescar score
      await LeadScoreService.recompute(params.contactId);
    }
  }

  private static async runAiWorkerInternal(params: {
    payload: InboundPayload;
    contactId: string;
    insertedMessageId: string;
  }): Promise<void> {
    const { payload, contactId, insertedMessageId } = params;
    const { organization, channel, senderId } = payload;
    const startTime = Date.now();
    let workerId: string | null = null;

    try {
      // Anti-Burst Debounce Adaptativo (espera base AI_DEBOUNCE_MS, se extiende si siguen llegando ráfagas con tope AI_DEBOUNCE_MAX_MS)
      const baseDebounce = AI_OPERATIONAL_CONFIG.debounceMs;
      const maxDebounce = AI_OPERATIONAL_CONFIG.debounceMaxMs;
      const debounceStart = Date.now();
      await new Promise((resolve) => setTimeout(resolve, baseDebounce));

      let { data: latestMsg } = await (supabaseAdmin.from('messages') as any)
        .select('id, created_at')
        .eq('contact_id', contactId)
        .eq('sender_type', 'lead')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestMsg && latestMsg.id !== insertedMessageId) {
        console.log(`[INBOUND CORE ANTI-BURST] Mensaje ${insertedMessageId} descartado; se responderá con el más reciente (${latestMsg.id}).`);
        return;
      }

      // Si el cliente escribió muy rápido hace <1.5s, esperar un micro-pulso adicional (respetando tope AI_DEBOUNCE_MAX_MS)
      while (latestMsg?.created_at && Date.now() - debounceStart < maxDebounce) {
        const msSinceLastLead = Date.now() - new Date(latestMsg.created_at).getTime();
        if (msSinceLastLead >= 1500) break;
        const waitSlice = Math.min(1500, maxDebounce - (Date.now() - debounceStart));
        if (waitSlice <= 0) break;
        await new Promise((resolve) => setTimeout(resolve, waitSlice));

        const { data: recheckMsg } = await (supabaseAdmin.from('messages') as any)
          .select('id, created_at')
          .eq('contact_id', contactId)
          .eq('sender_type', 'lead')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (recheckMsg && recheckMsg.id !== insertedMessageId) {
          return;
        }
        latestMsg = recheckMsg;
      }

      // 🛡️ ANTI-DUPLICADOS: Si ya existe un mensaje saliente (IA o asesor) posterior a este mensaje del lead, abortar
      if (latestMsg) {
        const { data: laterOutbound } = await (supabaseAdmin.from('messages') as any)
          .select('id, created_at')
          .eq('contact_id', contactId)
          .in('sender_type', ['ai', 'agent_manual'])
          .gte('created_at', latestMsg.created_at)
          .limit(1)
          .maybeSingle();

        if (laterOutbound) {
          console.log(`[INBOUND CORE ANTI-DUPLICATE] Ya existe una respuesta (${laterOutbound.id}) para el turno del lead ${insertedMessageId}. Omitiendo duplicado.`);
          return;
        }
      }

      // 🛡️ LOCK ATÓMICO POR CONTACTO (Pilar 4.1.3): Evitar concurrencia y no descartar mensajes que llegan en paralelo
      workerId = crypto.randomUUID();
      let hasLock = await this.acquireAiLock(contactId, workerId, 60);
      for (let retry = 0; !hasLock && retry < 2; retry++) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        if (latestMsg) {
          const { data: respondedInMeantime } = await (supabaseAdmin.from('messages') as any)
            .select('id')
            .eq('contact_id', contactId)
            .in('sender_type', ['ai', 'agent_manual'])
            .gte('created_at', latestMsg.created_at)
            .limit(1)
            .maybeSingle();
          if (respondedInMeantime) {
            return;
          }
        }
        hasLock = await this.acquireAiLock(contactId, workerId, 60);
      }
      if (!hasLock) {
        console.log(`[INBOUND CORE LOCK] Contacto ${contactId} ocupado; se preserva espera abierta para el mensaje.`);
        return;
      }

      // Re-verificar si un asesor humano intervino o pausó la IA durante la espera
      const { data: latestContact } = await (supabaseAdmin.from('contacts') as any)
        .select('is_ai_active')
        .eq('id', contactId)
        .single();

      if (latestContact && !latestContact.is_ai_active) {
        console.log(`[INBOUND CORE AI ABORT] Asesor tomó el chat con ${senderId}. Respuesta cancelada.`);
        return;
      }

      // Verificación de horario de atención (soporta { start, end, days } y formato legado schedule)
      let isAfterHours = false;
      const bHours = organization.business_hours as any;
      if (bHours?.enabled) {
        try {
          const tz =
            organization.appointment_settings?.timezone ||
            bHours?.timezone ||
            AI_OPERATIONAL_CONFIG.defaultTimezone;

          const now = new Date();
          const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).formatToParts(now);

          const weekdayStr = parts.find((p) => p.type === 'weekday')?.value || 'Mon';
          const hh = parts.find((p) => p.type === 'hour')?.value || '09';
          const mm = parts.find((p) => p.type === 'minute')?.value || '00';
          const currentHourMin = `${hh === '24' ? '00' : hh}:${mm}`;

          const weekdayToIsoNum: Record<string, number> = {
            Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
          };
          const weekdayToKey: Record<string, string> = {
            Sun: 'sunday', Mon: 'monday', Tue: 'tuesday', Wed: 'wednesday', Thu: 'thursday', Fri: 'friday', Sat: 'saturday',
          };

          if (bHours.schedule && bHours.schedule[weekdayToKey[weekdayStr]]) {
            const dayConfig = bHours.schedule[weekdayToKey[weekdayStr]];
            if (dayConfig?.active === false) {
              isAfterHours = true;
            } else if (dayConfig?.start && dayConfig?.end) {
              if (currentHourMin < dayConfig.start || currentHourMin > dayConfig.end) {
                isAfterHours = true;
              }
            }
          } else {
            const isoDay = weekdayToIsoNum[weekdayStr] || 1;
            const daysAllowed: number[] = Array.isArray(bHours.days) ? bHours.days : [1, 2, 3, 4, 5, 6];
            const startStr = bHours.start || '08:00';
            const endStr = bHours.end || '19:00';
            if (!daysAllowed.includes(isoDay) || currentHourMin < startStr || currentHourMin > endStr) {
              isAfterHours = true;
            }
          }
        } catch (e) {
          console.warn('[INBOUND CORE BUSINESS HOURS WARN]', e);
        }
      }

      const defaultEntry = getAiChatChain(organization.ai_provider)[0];
      const aiTurnStartIso = new Date().toISOString();

      // Generación de Respuesta con Router Dual configurable
      const aiResult = await OpenAIService.processLeadMessage({
        organizationId: organization.id,
        contactId,
        leadPhone: senderId,
        leadName: payload.senderName,
        systemPromptConfig: organization.system_prompt || '',
        handoffMode: (organization.handoff_mode as any) || 'message',
        afterHoursMessage: organization.after_hours_message || null,
        isAfterHours,
        businessHours: organization.business_hours || null,
        aiProvider: organization.ai_provider || null,
        enabledModules: organization.enabled_modules || null,
        timezone:
          organization.appointment_settings?.timezone ||
          organization.business_hours?.timezone ||
          AI_OPERATIONAL_CONFIG.defaultTimezone,
        channel: channel === 'instagram' ? 'instagram' : 'whatsapp',
        organization,
      });

      const aiResponseText = (typeof aiResult === 'string' ? aiResult : aiResult.text || '').trim();
      const metaModel = typeof aiResult === 'object' ? aiResult.modelUsed : defaultEntry?.model || 'default';
      const metaProvider = typeof aiResult === 'object' ? aiResult.provider : defaultEntry?.provider || 'google';
      const isFallback = typeof aiResult === 'object' ? aiResult.isFallback : false;
      const promptTokens = typeof aiResult === 'object' ? aiResult.promptTokens : 0;
      const completionTokens = typeof aiResult === 'object' ? aiResult.completionTokens : 0;
      const latencyMs = Date.now() - startTime;

      // M1: Registrar intentos de modelos fallidos en ai_runs para trazabilidad exacta de failovers
      if (typeof aiResult === 'object' && Array.isArray(aiResult.failedAttempts) && aiResult.failedAttempts.length > 0) {
        for (const failed of aiResult.failedAttempts) {
          await this.recordAiRun({
            organizationId: organization.id,
            contactId,
            channel,
            provider: failed.provider,
            model: failed.model,
            latencyMs: failed.latencyMs,
            status: 'failed',
            errorMessage: failed.error,
          });
        }
      }

      if (!aiResponseText) {
        if (typeof aiResult === 'object' && aiResult?.pauseAfterSend) {
          const { data: silentContact } = await (supabaseAdmin.from('contacts') as any)
            .select('custom_fields')
            .eq('id', contactId)
            .maybeSingle();
          const silentCf = {
            ...((silentContact?.custom_fields as Record<string, any>) || {}),
            unattended_handoff: true,
            ...(aiResult?.handoffReason ? { handoff_reason: aiResult.handoffReason } : {}),
          };
          await (supabaseAdmin.from('contacts') as any)
            .update({
              is_ai_active: false,
              conversation_status: 'open',
              waiting_since: new Date().toISOString(),
              custom_fields: silentCf,
              updated_at: new Date().toISOString(),
            })
            .eq('id', contactId);
        }

        // Registro de run omitido o relevo silencioso
        await this.recordAiRun({
          organizationId: organization.id,
          contactId,
          channel,
          provider: metaProvider,
          model: metaModel,
          latencyMs,
          status: 'skipped',
        });
        return;
      }

      // Re-verificar estado de IA inmediatamente antes de despachar a la red
      const { data: finalContactCheck } = await (supabaseAdmin.from('contacts') as any)
        .select('is_ai_active')
        .eq('id', contactId)
        .single();

      if (finalContactCheck && !finalContactCheck.is_ai_active) {
        console.log(`[INBOUND CORE AI ABORT] Asesor tomó el chat con ${senderId} justo antes del envío.`);
        return;
      }

      // Despacho de salida al canal correspondiente con Interceptor Anti-Fugas
      let outboundMessageId: string | null = null;
      try {
        // --- INTERCEPTOR ANTI-FUGA DE ENLACES E IMÁGENES ---
        // Detecta si la IA incluyó sintaxis markdown ![alt](url), [alt](url), etiquetas [foto: url] o URLs directas en el texto
        const mdImgRegex = /!\[([\s\S]*?)\]\(\s*(https?:\/\/[^\s\)]+)\s*\)/gi;
        const mdLinkMediaRegex = /\[([\s\S]*?)\]\(\s*(https?:\/\/[^\s\)]*(?:chat-media|[^\s\)]+\.(?:jpe?g|png|webp|gif|pdf))[^\s\)]*)\s*\)/gi;
        const tagImgRegex = /\[(?:foto|imagen):\s*(https?:\/\/[^\s\]]+)\]/gi;
        const rawSupabaseImgRegex = /(https:\/\/[^\s\)]+\.supabase\.co\/storage\/v1\/object\/public\/[^\s\)]+(?:\.jpe?g|\.png|\.webp|\.gif|\b))/gi;

        const leakedMedia: Array<{ url: string; caption?: string }> = [];

        let match: RegExpExecArray | null;
        while ((match = mdImgRegex.exec(aiResponseText)) !== null) {
          leakedMedia.push({ caption: match[1]?.trim() || '', url: match[2].trim() });
        }
        while ((match = mdLinkMediaRegex.exec(aiResponseText)) !== null) {
          const url = match[2].trim();
          if (!leakedMedia.some((m) => m.url === url)) {
            leakedMedia.push({ caption: match[1]?.trim() || '', url });
          }
        }
        while ((match = tagImgRegex.exec(aiResponseText)) !== null) {
          const url = match[1].trim();
          if (!leakedMedia.some((m) => m.url === url)) {
            leakedMedia.push({ url });
          }
        }
        while ((match = rawSupabaseImgRegex.exec(aiResponseText)) !== null) {
          const url = match[1].trim();
          if (!leakedMedia.some((m) => m.url === url)) {
            leakedMedia.push({ url });
          }
        }

        const { data: contactData } = await (supabaseAdmin.from('contacts') as any)
          .select('custom_fields')
          .eq('id', contactId)
          .single();

        const customFields = (contactData?.custom_fields as Record<string, any>) || {};
        const targetRecipient = customFields.remote_jid || customFields.whatsapp_jid || senderId;

        // Si se detectaron imágenes fugadas en el texto, despacharlas como mensajes multimedia nativos
        for (const media of leakedMedia) {
          try {
            let mediaMsgId: string | null = null;
            if (channel === 'instagram') {
              const igToken = organization.instagram_access_token
                ? decryptSecret(organization.instagram_access_token)
                : '';
              mediaMsgId = await InstagramService.sendMediaMessage({
                instagramAccountId: organization.instagram_account_id || '',
                accessToken: igToken,
                recipientId: senderId,
                mediaUrl: media.url,
              });
            } else {
              mediaMsgId = await MessagingService.sendMediaMessage({
                organization: {
                  id: organization.id,
                  name: organization.name,
                  whatsapp_provider: organization.whatsapp_provider,
                  whatsapp_phone_number_id: organization.whatsapp_phone_number_id,
                  whatsapp_access_token: organization.whatsapp_access_token,
                  evolution_api_url: organization.evolution_api_url,
                  evolution_api_key: organization.evolution_api_key,
                  evolution_instance_name: organization.evolution_instance_name,
                  evolution_anti_ban_mode: true,
                },
                to: targetRecipient,
                mediaUrl: media.url,
                caption: media.caption || undefined,
                mediaType: 'image',
              });
            }

            await (supabaseAdmin.from('messages') as any).insert({
              contact_id: contactId,
              organization_id: organization.id,
              sender_type: 'ai',
              content: formatImageMessageContent(media.url, media.caption || ''),
              meta_message_id: mediaMsgId || null,
              status: 'sent',
              channel: channel === 'instagram' ? 'instagram' : 'whatsapp',
            });
          } catch (mediaErr) {
            console.warn('[INBOUND CORE MEDIA LEAK RESCUE WARN]', mediaErr);
          }
        }

        // Limpiar el texto removiendo markdown y URLs
        let cleanedAiText = aiResponseText
          .replace(/!\[[\s\S]*?\]\(\s*https?:\/\/[^\s\)]+\s*\)/gi, '')
          .replace(/\[[\s\S]*?\]\(\s*https?:\/\/[^\s\)]*(?:chat-media|[^\s\)]+\.(?:jpe?g|png|webp|gif|pdf))[^\s\)]*\s*\)/gi, '')
          .replace(/\[(?:foto|imagen):\s*https?:\/\/[^\s\]]+\]/gi, '')
          .replace(/https:\/\/[^\s\)]+\.supabase\.co\/storage\/v1\/object\/public\/[^\s\)]+(?:\.jpe?g|\.png|\.webp|\.gif|\b)/gi, '')
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line && line !== '•' && line !== '*' && line !== '-' && !/^[•\-\*]?\s*\*?[^:\n]+\*?:\s*$/.test(line))
          .join('\n')
          .trim();

        if (cleanedAiText) {
          const messageId = crypto.randomUUID();

          // 🛡️ PATRÓN OUTBOX: Insertar mensaje con status 'sending' e ID primario ANTES de llamar a Evolution / Meta.
          // Esto elimina la carrera donde el eco fromMe de Evolution llega antes de que el mensaje exista en DB.
          const { error: outboxInsertErr } = await (supabaseAdmin.from('messages') as any).insert({
            id: messageId,
            contact_id: contactId,
            organization_id: organization.id,
            sender_type: 'ai',
            content: cleanedAiText,
            status: 'sending',
            channel: channel === 'instagram' ? 'instagram' : 'whatsapp',
          });

          if (outboxInsertErr) {
            console.error('[INBOUND CORE OUTBOX INSERT ERROR]', outboxInsertErr);
          }

          try {
            outboundMessageId = await this.dispatchOutboundMessage({
              organization,
              channel,
              recipientId: targetRecipient,
              text: cleanedAiText,
              contactId,
            });

            // Reconciliar mensaje a 'sent' con el ID del proveedor
            await (supabaseAdmin.from('messages') as any)
              .update({
                status: 'sent',
                meta_message_id: outboundMessageId || null,
                updated_at: new Date().toISOString(),
              })
              .eq('id', messageId);
          } catch (dispatchErr: any) {
            console.error('[INBOUND CORE OUTBOUND DISPATCH FAILED]', dispatchErr);
            await (supabaseAdmin.from('messages') as any)
              .update({
                status: 'failed',
                error_message: dispatchErr?.message || 'Error de envío',
                updated_at: new Date().toISOString(),
              })
              .eq('id', messageId);
            throw dispatchErr;
          }
        }

        const effectiveLastText = cleanedAiText || (leakedMedia.length > 0 ? formatImageMessageContent(leakedMedia[0].url, leakedMedia[0].caption || '') : aiResponseText);

        const nowIso = new Date().toISOString();
        const aiLastMsg = {
          text: effectiveLastText,
          sender_type: 'ai',
          created_at: nowIso,
        };
        const updatedCustom: Record<string, any> = {
          ...customFields,
          last_message: aiLastMsg,
          unattended_handoff:
            typeof aiResult === 'object' && aiResult?.pauseAfterSend
              ? Boolean(customFields.unattended_handoff || aiResult?.handoffReason)
              : false,
        };

        // Si tenía un recordatorio de reactivación pendiente PREVIO a este turno, limpiarlo porque la IA ya respondió al lead
        // (No borrar un recordatorio recién agendado por schedule_follow_up dentro de este mismo turno)
        const scheduledThisTurn =
          typeof aiResult === 'object' ? aiResult?.followUpScheduled : null;
        const reminderCreatedThisTurn =
          Boolean(scheduledThisTurn) ||
          (Boolean(updatedCustom.active_reminder?.createdAt) &&
            String(updatedCustom.active_reminder.createdAt) >= aiTurnStartIso);

        if (scheduledThisTurn) {
          updatedCustom.active_reminder = scheduledThisTurn.activeReminder;
          updatedCustom.follow_up = {
            ...(updatedCustom.follow_up || { category: 'warm', currentStepIndex: 0 }),
            nextSendAt: scheduledThisTurn.scheduledForIso,
            scheduledReminderId: scheduledThisTurn.reminderId || null,
            completed: false,
            paused: false,
          };
        } else if (updatedCustom.active_reminder?.reminderType === 'reactivation' && !reminderCreatedThisTurn) {
          delete updatedCustom.active_reminder;
        }

        const hasPauseHandoff = Boolean(typeof aiResult === 'object' && aiResult?.pauseAfterSend);
        // Verificar si llegó un mensaje nuevo del lead mientras la IA infería la respuesta
        const { data: newerLeadWhileThinking } = await (supabaseAdmin.from('messages') as any)
          .select('id, created_at')
          .eq('contact_id', contactId)
          .eq('sender_type', 'lead')
          .gt('created_at', aiTurnStartIso)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const contactUpdatePayload: Record<string, any> = {
          last_message: aiLastMsg,
          last_interaction_at: nowIso,
          updated_at: nowIso,
          waiting_since: hasPauseHandoff
            ? nowIso
            : newerLeadWhileThinking
            ? newerLeadWhileThinking.created_at
            : null,
          unread_count: newerLeadWhileThinking ? 1 : 0,
          conversation_status:
            hasPauseHandoff || newerLeadWhileThinking ? 'open' : 'waiting_customer',
          last_message_sender: 'ai',
          last_message_preview: effectiveLastText.slice(0, 160),
          custom_fields: updatedCustom,
        };

        // Si la IA solicitó relevo o se agotó la cuota, pausar la IA DESPUÉS de que el mensaje de transición fue despachado al cliente
        if (hasPauseHandoff) {
          contactUpdatePayload.is_ai_active = false;
        }

        await (supabaseAdmin.from('contacts') as any)
          .update(contactUpdatePayload)
          .eq('id', contactId);

        // Desactivar solo recordatorios de reactivación anteriores al turno actual y blindar el recién creado
        // frente al trigger SQL trg_sync_contact_inbox_state sobre messages INSERT
        try {
          await (supabaseAdmin.from('scheduled_reminders') as any)
            .update({ status: 'cancelled' })
            .eq('contact_id', contactId)
            .eq('reminder_type', 'reactivation')
            .eq('status', 'pending')
            .lt('created_at', aiTurnStartIso);

          if (scheduledThisTurn?.reminderId) {
            await (supabaseAdmin.from('scheduled_reminders') as any)
              .update({ status: 'pending', scheduled_for: scheduledThisTurn.scheduledForIso })
              .eq('id', scheduledThisTurn.reminderId);
          } else if (scheduledThisTurn?.scheduledForIso) {
            await (supabaseAdmin.from('scheduled_reminders') as any)
              .insert({
                contact_id: contactId,
                scheduled_for: scheduledThisTurn.scheduledForIso,
                reminder_type: 'reactivation',
                status: 'pending',
              });
          }
        } catch {}

        // Registro de Auditoría de Observabilidad en ai_runs con métricas reales
        await this.recordAiRun({
          organizationId: organization.id,
          contactId,
          channel,
          provider: metaProvider,
          model: metaModel,
          promptTokens,
          completionTokens,
          latencyMs,
          status: isFallback ? 'fallback' : 'success',
        });
      } catch (dispatchError: any) {
        console.error('[INBOUND CORE OUTBOUND DISPATCH ERROR]', dispatchError);

        // Dead-Letter: Registro del fallo en ai_runs y alerta en el chat
        await this.recordAiRun({
          organizationId: organization.id,
          contactId,
          channel,
          provider: metaProvider,
          model: metaModel,
          latencyMs,
          status: 'failed',
          errorMessage: dispatchError?.message || 'Error al despachar mensaje al canal',
        });

        const errMessage = dispatchError?.message || '';
        if (errMessage.includes('190') || errMessage.includes('expired') || errMessage.includes('OAuthException')) {
          await (supabaseAdmin.from('messages') as any).insert({
            contact_id: contactId,
            sender_type: 'system',
            content: '⚠️ No se pudo enviar la respuesta de la IA porque las credenciales del canal expiraron o fueron revocadas. Reconecta la cuenta en Configuración.',
          });

          // Notificar al administrador por correo (Resend)
          try {
            const { data: adminProfile } = await (supabaseAdmin.from('profiles') as any)
              .select('email')
              .eq('organization_id', organization.id)
              .eq('role', 'admin')
              .maybeSingle();

            if (adminProfile?.email) {
              NotificationService.sendChannelDisconnectedAlert({
                adminEmail: adminProfile.email,
                companyName: organization.name || 'Empresa Synqo',
                provider: channel === 'instagram' ? 'instagram' : 'meta',
                reason: 'El token de acceso expiró o fue revocado por Meta.',
              }).catch((e) => console.warn('[CHANNEL DISCONNECTED ALERT WARN]', e));
            }

            PlatformAlertService.notifySuperAdminEvent({
              type: 'token_expired',
              orgId: organization.id,
              companyName: organization.name || 'Empresa Synqo',
              title: channel === 'instagram' ? 'Token Instagram Expirado' : 'Token Meta WhatsApp Expirado',
              details: `Falló envío al cliente (${errMessage.slice(0, 120)}).`,
              dedupeWindowMinutes: 60,
            }).catch(() => {});
          } catch (alertErr) {
            console.warn('[ADMIN NOTIFICATION ERROR]', alertErr);
          }
        }
      }
    } catch (workerError: any) {
      console.error('[INBOUND CORE WORKER FATAL ERROR]', workerError);
      const fallbackEntry = getAiChatChain(organization.ai_provider)[0];
      await this.recordAiRun({
        organizationId: organization.id,
        contactId,
        channel,
        provider: fallbackEntry?.provider || 'google',
        model: fallbackEntry?.model || 'default',
        latencyMs: Date.now() - startTime,
        status: 'failed',
        errorMessage: workerError?.message || 'Excepción no controlada en el worker de IA',
      });
    } finally {
      // Liberar el bloqueo atómico del contacto de inmediato si se adquirió
      if (workerId) {
        await this.releaseAiLock(contactId, workerId);
      }
    }
  }

  /**
   * Adquiere un lock de concurrencia atómico para el contacto usando la función RPC en Postgres
   * o fallback condicional seguro en memoria / base de datos.
   */
  private static async acquireAiLock(contactId: string, workerId: string, ttlSeconds = 60): Promise<boolean> {
    try {
      const { data, error } = await (supabaseAdmin.rpc as any)('try_acquire_ai_lock', {
        p_contact_id: contactId,
        p_worker_id: workerId,
        p_ttl_seconds: ttlSeconds,
      });

      if (!error && typeof data === 'boolean') {
        return data;
      }
    } catch {
      // Fallback a actualización condicional si la función RPC aún no está creada
    }

    try {
      const now = Date.now();
      const lockUntil = now + (ttlSeconds * 1000);

      const { data: contact } = await (supabaseAdmin.from('contacts') as any)
        .select('custom_fields')
        .eq('id', contactId)
        .single();

      const existingLock = contact?.custom_fields?.ai_lock;
      if (
        existingLock &&
        existingLock.lock_until &&
        Number(existingLock.lock_until) > now &&
        existingLock.worker_id !== workerId
      ) {
        return false;
      }

      const updatedCustom = {
        ...(contact?.custom_fields || {}),
        ai_lock: {
          worker_id: workerId,
          lock_until: lockUntil,
        },
      };

      const { error: updateError } = await (supabaseAdmin.from('contacts') as any)
        .update({ custom_fields: updatedCustom })
        .eq('id', contactId);

      return !updateError;
    } catch (err) {
      console.warn('[ACQUIRE AI LOCK WARN]', err);
      return false;
    }
  }

  /**
   * Libera el lock de concurrencia del contacto una vez finalizado el procesamiento.
   */
  private static async releaseAiLock(contactId: string, workerId: string): Promise<void> {
    try {
      await (supabaseAdmin.rpc as any)('release_ai_lock', {
        p_contact_id: contactId,
        p_worker_id: workerId,
      });
      return;
    } catch {}

    try {
      const { data: curContact } = await (supabaseAdmin.from('contacts') as any)
        .select('custom_fields')
        .eq('id', contactId)
        .maybeSingle();

      if (curContact?.custom_fields?.ai_lock?.worker_id === workerId) {
        const updatedCustom = { ...curContact.custom_fields };
        delete updatedCustom.ai_lock;
        delete updatedCustom.ai_lock_until;
        await (supabaseAdmin.from('contacts') as any)
          .update({ custom_fields: updatedCustom })
          .eq('id', contactId);
      }
    } catch (unlockErr) {
      console.warn('[RELEASE AI LOCK WARN]', unlockErr);
    }
  }

  /**
   * Detección Determinística de Confirmación de Cita (Anti-No-Show unificada para todos los canales).
   */
  private static async handleAppointmentAutoConfirmation(
    orgId: string,
    contactId: string,
    senderName: string,
    content: string
  ): Promise<void> {
    const isConfirmButton = content.includes('btn_confirm_appt') || content.includes('Confirmar Cita');
    const normalizedContent = content.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const confirmationPattern = /\b(si|confirmo|confirmado|confirmada|confirmar|alla\s+(estoy|nos\s+vemos|estare)|asistire|listo\s+confirmo)\b/i;
    const negationOrChangePattern = /\b(pero|cambiar|cambio|cancelar|cancela|otra fecha|otro dia|otra hora|no puedo|no voy|no llego|reprogramar|posponer)\b/i;
    const hasNegationOrChange = negationOrChangePattern.test(normalizedContent);
    const isConfirmationText = confirmationPattern.test(normalizedContent) && !hasNegationOrChange;

    if (isConfirmButton || isConfirmationText) {
      const nowIso = new Date().toISOString();
      const twoDaysFromNow = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

      const { data: pendingAppt } = await (supabaseAdmin.from('appointments') as any)
        .select('id, service_name, start_time, specialist_id, confirmation_status')
        .eq('contact_id', contactId)
        .eq('organization_id', orgId)
        .eq('status', 'confirmed')
        .eq('confirmation_status', 'unconfirmed')
        .gte('start_time', nowIso)
        .lte('start_time', twoDaysFromNow)
        .order('start_time', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (pendingAppt) {
        await (supabaseAdmin.from('appointments') as any)
          .update({
            confirmation_status: 'confirmed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', pendingAppt.id);

        const startFormatted = new Date(pendingAppt.start_time).toLocaleTimeString('es-CO', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });

        if (pendingAppt.specialist_id) {
          try {
            await (supabaseAdmin.from('internal_chat_messages') as any).insert({
              organization_id: orgId,
              specialist_id: pendingAppt.specialist_id,
              sender_type: 'admin',
              sender_name: 'Sistema Synqo',
              content: `✅ Asistencia confirmada: ${senderName} confirmó su cita de las ${startFormatted} (${pendingAppt.service_name}).`,
            });
          } catch (chatErr) {
            console.warn('[INBOUND CORE] Error notificando confirmación a colaborador:', chatErr);
          }
        }
      }
    }
  }

  /**
   * Enruta el despacho saliente al proveedor correspondiente usando MessagingService o InstagramService.
   */
  private static async dispatchOutboundMessage(params: {
    organization: InboundPayload['organization'];
    channel: InboundChannel;
    recipientId: string;
    text: string;
    contactId: string;
  }): Promise<string | null> {
    const { organization, channel, recipientId, text } = params;

    if (channel === 'instagram') {
      let accessToken = organization.instagram_access_token || '';
      try {
        accessToken = decryptSecret(accessToken);
      } catch {}

      if (!organization.instagram_account_id || !accessToken) {
        throw new Error('Cuenta de Instagram no configurada correctamente.');
      }

      return await InstagramService.sendDirectMessage({
        instagramAccountId: organization.instagram_account_id,
        accessToken,
        recipientId,
        text,
      });
    }

    // Canal WhatsApp (Meta o Evolution API)
    return await MessagingService.sendTextMessage({
      organization: {
        id: organization.id,
        name: organization.name,
        whatsapp_provider: organization.whatsapp_provider,
        whatsapp_phone_number_id: organization.whatsapp_phone_number_id,
        whatsapp_access_token: organization.whatsapp_access_token,
        evolution_api_url: organization.evolution_api_url,
        evolution_api_key: organization.evolution_api_key,
        evolution_instance_name: organization.evolution_instance_name,
        evolution_anti_ban_mode: true,
      },
      to: recipientId,
      body: text,
      simulateTyping: true,
    });
  }

  /**
   * Registra una métrica de ejecución en la tabla ai_runs.
   */
  private static async recordAiRun(data: {
    organizationId: string;
    contactId?: string | null;
    channel: string;
    provider: string;
    model: string;
    promptTokens?: number;
    completionTokens?: number;
    latencyMs: number;
    status: 'success' | 'failed' | 'fallback' | 'skipped';
    errorMessage?: string;
  }): Promise<void> {
    try {
      const promptTokens = data.promptTokens || 0;
      const completionTokens = data.completionTokens || 0;
      await (supabaseAdmin.from('ai_runs') as any).insert({
        organization_id: data.organizationId,
        contact_id: data.contactId || null,
        channel: data.channel,
        provider: data.provider,
        model: data.model,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
        latency_ms: data.latencyMs,
        status: data.status,
        error_message: data.errorMessage || null,
      });
    } catch (err) {
      console.warn('[INBOUND CORE RECORD AI RUN WARN]', err);
    }
  }

  /**
   * Despacha la respuesta de IA para un contacto cuyo último mensaje del cliente quedó sin responder.
   * Utilizado cuando se reactiva el switch de IA o se hace un re-intento de cola pendiente.
   */
  static async triggerPendingAiForContact(contactId: string): Promise<boolean> {
    try {
      const { data: contact } = await (supabaseAdmin.from('contacts') as any)
        .select('id, name, phone, channel, is_ai_active, organization_id')
        .eq('id', contactId)
        .single();

      if (!contact || !contact.is_ai_active) return false;

      const { data: lastMessage } = await (supabaseAdmin.from('messages') as any)
        .select('id, sender_type, content, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lastMessage || lastMessage.sender_type !== 'lead') {
        return false;
      }

      const { data: org } = await (supabaseAdmin.from('organizations') as any)
        .select('*')
        .eq('id', contact.organization_id)
        .single();

      if (!org) return false;

      const payload: InboundPayload = {
        organization: org,
        channel: (contact.channel as any) || 'whatsapp',
        channelMessageId: `pending_${lastMessage.id}`,
        senderId: contact.phone,
        senderName: contact.name,
        rawContent: lastMessage.content || '',
      };

      await this.runAiWorker({
        payload,
        contactId: contact.id,
        insertedMessageId: lastMessage.id,
      });

      return true;
    } catch (err) {
      console.error('[INBOUND CORE TRIGGER PENDING ERROR]', err);
      return false;
    }
  }

  /**
   * Consulta cuántos contactos con IA activa tienen su último mensaje esperando respuesta humana o de IA.
   */
  static async getPendingAiCountForOrg(organizationId: string): Promise<number> {
    try {
      const { data: contacts } = await (supabaseAdmin.from('contacts') as any)
        .select('id, last_message')
        .eq('organization_id', organizationId)
        .eq('is_ai_active', true)
        .is('deleted_at', null);

      if (!contacts || contacts.length === 0) return 0;

      let pendingCount = 0;
      for (const c of contacts) {
        const { data: lastMsg } = await (supabaseAdmin.from('messages') as any)
          .select('sender_type')
          .eq('contact_id', c.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastMsg && lastMsg.sender_type === 'lead') {
          pendingCount++;
        }
      }
      return pendingCount;
    } catch {
      return 0;
    }
  }

  /**
   * Despacha en lote de forma segura y escalonada (cadencia anti-ban de 3.5s)
   * los contactos con IA activa que tengan un mensaje del lead sin responder.
   */
  static async triggerPendingAiBatch(organizationId: string, limit = 10): Promise<{ processed: number; answered: number; remaining: number }> {
    try {
      const { data: contacts } = await (supabaseAdmin.from('contacts') as any)
        .select('id, last_interaction_at')
        .eq('organization_id', organizationId)
        .eq('is_ai_active', true)
        .is('deleted_at', null)
        .order('last_interaction_at', { ascending: true }); // Más antiguos esperando primero

      if (!contacts || contacts.length === 0) return { processed: 0, answered: 0, remaining: 0 };

      // Identificar cuáles realmente tienen el último mensaje de tipo 'lead'
      const targetContactIds: string[] = [];
      for (const c of contacts) {
        const { data: lastMsg } = await (supabaseAdmin.from('messages') as any)
          .select('sender_type')
          .eq('contact_id', c.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastMsg && lastMsg.sender_type === 'lead') {
          targetContactIds.push(c.id);
        }
      }

      const totalPending = targetContactIds.length;
      const batchToProcess = targetContactIds.slice(0, limit);

      let answered = 0;
      for (let i = 0; i < batchToProcess.length; i++) {
        const cId = batchToProcess[i];
        const sent = await this.triggerPendingAiForContact(cId);
        if (sent) answered++;

        // Cadencia protectora anti-ban entre mensajes (3.5 segundos)
        if (i < batchToProcess.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 3500));
        }
      }

      return {
        processed: batchToProcess.length,
        answered,
        remaining: Math.max(0, totalPending - answered),
      };
    } catch (err) {
      console.error('[INBOUND CORE TRIGGER BATCH ERROR]', err);
      return { processed: 0, answered: 0, remaining: 0 };
    }
  }
}
