import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  buildSynchronizedClassification,
  normalizeFollowUpSettings,
  resolveLeadTemperature,
} from '@/lib/ai/follow-up-types';

export const DEFAULT_MOBILE_COEXISTENCE_HOURS = 2;

export interface MobileCoexistenceConfig {
  enabled: boolean;
  autoResumeHours: number;
}

export function resolveMobileCoexistenceConfig(appointmentSettings?: any): MobileCoexistenceConfig {
  const raw = appointmentSettings?.mobile_coexistence;
  if (!raw || typeof raw !== 'object') {
    return { enabled: true, autoResumeHours: DEFAULT_MOBILE_COEXISTENCE_HOURS };
  }
  const enabled = raw.enabled !== false;
  const parsedHours = Number(raw.autoResumeHours ?? DEFAULT_MOBILE_COEXISTENCE_HOURS);
  const autoResumeHours =
    Number.isFinite(parsedHours) && parsedHours >= 1 && parsedHours <= 24
      ? Math.round(parsedHours)
      : DEFAULT_MOBILE_COEXISTENCE_HOURS;
  return { enabled, autoResumeHours };
}

/**
 * Desenvuelve mensajes encapsulados de Evolution/Baileys (ephemeralMessage, viewOnceMessage, etc.)
 * y detecta mensajes de protocolo/reacciones vacías que NO deben pausar la IA.
 */
export function unwrapEvolutionOutboundMessage(rawMsgObj: any): {
  msgObj: any;
  isNonConversationalSignal: boolean;
} {
  let msg = rawMsgObj || {};
  for (let i = 0; i < 4; i++) {
    if (msg?.ephemeralMessage?.message) msg = msg.ephemeralMessage.message;
    else if (msg?.viewOnceMessage?.message) msg = msg.viewOnceMessage.message;
    else if (msg?.viewOnceMessageV2?.message) msg = msg.viewOnceMessageV2.message;
    else if (msg?.documentWithCaptionMessage?.message) msg = msg.documentWithCaptionMessage.message;
    else break;
  }

  const keys = Object.keys(msg || {});
  const onlyProtocolOrReaction =
    keys.length === 0 ||
    keys.every(
      (k) =>
        k === 'protocolMessage' ||
        k === 'reactionMessage' ||
        k === 'messageContextInfo' ||
        k === 'senderKeyDistributionMessage'
    );

  return {
    msgObj: msg,
    isNonConversationalSignal: onlyProtocolOrReaction,
  };
}

function normalizeEchoComparison(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export class HumanOutboundService {
  /**
   * Registra de forma natural una respuesta enviada por el asesor desde WhatsApp móvil (Evolution `fromMe`)
   * o Instagram móvil (`is_echo`), aplicando Coexistencia Opción A (pausa temporal con auto-retorno),
   * limpiando "Por responder" y soportando contactos @lid o chats iniciados desde el celular.
   */
  static async recordMobileHumanOutbound(params: {
    organization: any;
    channel: 'whatsapp' | 'instagram';
    externalMessageId: string;
    senderId: string;
    remoteJid?: string;
    leadName?: string;
    rawContent: string;
  }): Promise<{
    status:
      | 'bot_echo_ignored'
      | 'bot_echo_reconciled'
      | 'human_intervention_recorded';
    contactId?: string;
    messageId?: string;
  }> {
    const { organization, channel, externalMessageId, senderId, remoteJid, leadName, rawContent } = params;
    const orgId = organization.id;
    const nowIso = new Date().toISOString();

    // 1. Deduplicación directa por ID del proveedor
    let { data: existingMsg } = await (supabaseAdmin.from('messages') as any)
      .select('id')
      .eq('meta_message_id', externalMessageId)
      .maybeSingle();

    if (!existingMsg) {
      await new Promise((resolve) => setTimeout(resolve, 650));
      const { data: retryMsg } = await (supabaseAdmin.from('messages') as any)
        .select('id')
        .eq('meta_message_id', externalMessageId)
        .maybeSingle();
      existingMsg = retryMsg;
    }

    if (existingMsg) {
      return { status: 'bot_echo_ignored', messageId: existingMsg.id };
    }

    // 2. Buscar contacto por channel / phone / remote_jid (@lid) o crear uno nuevo si el asesor inició el chat
    let contact: any = null;
    if (channel === 'instagram') {
      const { data } = await (supabaseAdmin.from('contacts') as any)
        .select('id, name, is_ai_active, pipeline_stage, custom_fields, ai_snooze_until')
        .eq('organization_id', orgId)
        .eq('instagram_id', senderId)
        .maybeSingle();
      contact = data;
    } else {
      const { data: byPhone } = await (supabaseAdmin.from('contacts') as any)
        .select('id, name, is_ai_active, pipeline_stage, custom_fields, ai_snooze_until')
        .eq('organization_id', orgId)
        .or(`phone.eq.${senderId},phone.eq.+${senderId}`)
        .maybeSingle();
      contact = byPhone;

      if (!contact && remoteJid) {
        const { data: byJid } = await (supabaseAdmin.from('contacts') as any)
          .select('id, name, is_ai_active, pipeline_stage, custom_fields, ai_snooze_until')
          .eq('organization_id', orgId)
          .or(`custom_fields->>remote_jid.eq.${remoteJid},custom_fields->>whatsapp_jid.eq.${remoteJid}`)
          .limit(1)
          .maybeSingle();
        contact = byJid;
      }
    }

    // 3. Reconciliación anti-eco verificando que el contenido coincida con el mensaje 'sending' reciente
    if (contact) {
      const thirtySecAgo = new Date(Date.now() - 30 * 1000).toISOString();
      const { data: pendingSending } = await (supabaseAdmin.from('messages') as any)
        .select('id, sender_type, content')
        .eq('contact_id', contact.id)
        .in('sender_type', ['agent_manual', 'ai'])
        .eq('status', 'sending')
        .gte('created_at', thirtySecAgo)
        .order('created_at', { ascending: false })
        .limit(5);

      const normIncoming = normalizeEchoComparison(rawContent);
      const matchedPending = (pendingSending || []).find((m: any) => {
        const normPending = normalizeEchoComparison(m.content || '');
        if (!normPending || !normIncoming) return false;
        return (
          normIncoming === normPending ||
          normPending.startsWith(normIncoming.slice(0, 40)) ||
          normIncoming.startsWith(normPending.slice(0, 40))
        );
      });

      if (matchedPending) {
        await (supabaseAdmin.from('messages') as any)
          .update({
            status: 'sent',
            meta_message_id: externalMessageId,
            updated_at: nowIso,
          })
          .eq('id', matchedPending.id);

        return { status: 'bot_echo_reconciled', contactId: contact.id, messageId: matchedPending.id };
      }
    } else {
      const insertContact: Record<string, any> = {
        organization_id: orgId,
        name: leadName || (channel === 'instagram' ? 'Lead Instagram' : senderId),
        pipeline_stage: 'nuevo',
        is_ai_active: false,
        channel,
        conversation_status: 'waiting_customer',
        last_interaction_at: nowIso,
        custom_fields: remoteJid ? { remote_jid: remoteJid, whatsapp_jid: remoteJid } : {},
      };
      if (channel === 'instagram') insertContact.instagram_id = senderId;
      else insertContact.phone = senderId;

      const { data: created } = await (supabaseAdmin.from('contacts') as any)
        .insert(insertContact)
        .select('id, name, is_ai_active, pipeline_stage, custom_fields, ai_snooze_until')
        .single();
      contact = created;
    }

    if (!contact) {
      return { status: 'human_intervention_recorded' };
    }

    const cleanContent = typeof rawContent === 'string' && rawContent.trim()
      ? rawContent.trim()
      : `[Mensaje enviado desde ${channel === 'instagram' ? 'Instagram móvil' : 'WhatsApp móvil'}]`;

    // 4. Registrar mensaje del asesor con organization_id y metadata móvil
    const { data: insertedMsg } = await (supabaseAdmin.from('messages') as any)
      .insert({
        contact_id: contact.id,
        organization_id: orgId,
        sender_type: 'agent_manual',
        content: cleanContent,
        meta_message_id: externalMessageId,
        channel,
        status: 'sent',
      })
      .select('id')
      .single();

    // 5. Coexistencia Opción A + limpieza total de "Por responder" + clasificación pasiva
    const existingCustom = { ...((contact.custom_fields as Record<string, any>) || {}) };
    if (remoteJid) {
      existingCustom.remote_jid = remoteJid;
      existingCustom.whatsapp_jid = remoteJid;
    }
    existingCustom.unattended_handoff = false;
    existingCustom.mobile_takeover_at = nowIso;
    existingCustom.mobile_takeover_source = channel === 'instagram' ? 'mobile_instagram' : 'mobile_whatsapp';
    existingCustom.last_message = {
      text: cleanContent,
      sender_type: 'agent_manual',
      created_at: nowIso,
    };

    const coex = resolveMobileCoexistenceConfig(organization.appointment_settings);
    const shouldAutoResume = coex.enabled && existingCustom.manual_ai_paused !== true;
    const resumeAtIso = shouldAutoResume
      ? new Date(Date.now() + coex.autoResumeHours * 3600 * 1000).toISOString()
      : contact.ai_snooze_until || null;

    if (shouldAutoResume && resumeAtIso) {
      existingCustom.ai_snooze_until = resumeAtIso;
    }

    // Clasificación pasiva si el asesor envió datos de pago o cierre desde el móvil
    let nextStage: string | undefined;
    const prevTemp = resolveLeadTemperature(existingCustom);
    const hasClosingCue =
      /(nequi|bancolombia|daviplata|pse|link de pago|cuenta|transferencia|confirmad[oa]|agendad[oa]|env[ií]o tu pedido)/i.test(
        cleanContent
      );
    let finalCustom = existingCustom;
    if (hasClosingCue && prevTemp !== 'cold' && prevTemp !== 'hot') {
      const syncRes = buildSynchronizedClassification({
        customFields: existingCustom,
        currentStage: contact.pipeline_stage,
        temperature: 'hot',
        followUpSettings: organization?.appointment_settings?.follow_up_sequences
          ? normalizeFollowUpSettings(organization.appointment_settings.follow_up_sequences)
          : null,
      });
      finalCustom = syncRes.customFields;
      if (syncRes.nextStage) nextStage = syncRes.nextStage;
    }

    await (supabaseAdmin.from('contacts') as any)
      .update({
        is_ai_active: false,
        ai_snooze_until: resumeAtIso,
        conversation_status: 'waiting_customer',
        waiting_since: null,
        unread_count: 0,
        last_message: existingCustom.last_message,
        last_interaction_at: nowIso,
        last_message_sender: 'agent_manual',
        last_message_preview: cleanContent.slice(0, 160),
        custom_fields: finalCustom,
        ...(nextStage ? { pipeline_stage: nextStage } : {}),
        updated_at: nowIso,
      })
      .eq('id', contact.id);

    // 6. Marcar alertas de relevo previas como atendidas y cancelar reactivaciones pendientes
    try {
      await (supabaseAdmin.from('handoff_alerts') as any)
        .update({ status: 'claimed', claimed_at: nowIso })
        .eq('contact_id', contact.id)
        .eq('status', 'pending');

      await (supabaseAdmin.from('scheduled_reminders') as any)
        .update({ status: 'cancelled', updated_at: nowIso })
        .eq('contact_id', contact.id)
        .eq('reminder_type', 'reactivation')
        .eq('status', 'pending');
    } catch {}

    return {
      status: 'human_intervention_recorded',
      contactId: contact.id,
      messageId: insertedMsg?.id,
    };
  }
}
