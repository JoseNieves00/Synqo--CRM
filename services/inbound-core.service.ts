import { supabaseAdmin } from '@/lib/supabase/admin';
import { sanitizeLeadMessage } from '@/lib/security/sanitize';
import { formatQuoteMessageContent, formatImageMessageContent } from '@/lib/media/format';
import { AssignmentService } from './assignment.service';
import { MessagingService } from './messaging.service';
import { InstagramService } from './instagram.service';
import { OpenAIService } from './openai.service';
import { HandoffService } from './handoff.service';
import { NotificationService } from '@/lib/notifications/resend';
import { decryptSecret } from '@/lib/security/encryption';

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
}

export interface InboundResult {
  status:
    | 'success'
    | 'duplicate_ignored'
    | 'reaction_recorded'
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

// Patrones determinísticos para detectar solicitud de atención humana
const HUMAN_HANDOFF_PATTERNS = [
  /\b(asesor|humano|persona\s+real|agente\s+humano|operador)\b/i,
  /hablar\s+con\s+(un|una|alguien)/i,
  /atenci[oó]n\s+human[ao]/i,
  /soporte\s+human[ao]/i,
  /quiero\s+(un|una)\s+asesor/i,
  /comunicar(me)?\s+con\s+(un|una)/i,
  /p[aá]same\s+(con|a)\s+(un|alguien)/i,
  /necesito\s+(un|una)\s+asesor/i,
  /necesito\s+hablar\s+con\s+/i,
];

export class InboundCoreService {
  /**
   * Procesa de manera uniforme cualquier mensaje entrante de Meta WhatsApp, Evolution API o Instagram Direct.
   */
  static async processInbound(payload: InboundPayload): Promise<InboundResult> {
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
    const isPaymentReceipt = Boolean(payload.isPaymentReceipt);

    // 🛡️ INTERCEPTOR ANTI-BUCLE Y COMANDOS DE ASESOR POR WHATSAPP
    // Si el remitente es un asesor o administrador de la empresa, no crearlo como lead.
    if (channel !== 'instagram') {
      const cleanSender = HandoffService.cleanE164Phone(senderId);
      const { data: matchedAdvisor } = await (supabaseAdmin.from('profiles') as any)
        .select('id, full_name, role, organization_id')
        .eq('organization_id', orgId)
        .or(`whatsapp_phone.eq.${cleanSender},whatsapp_phone.eq.${senderId}`)
        .maybeSingle();

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

        // Si fue un mensaje general sin citar alerta, no crear lead para el asesor
        return { status: 'advisor_message_acknowledged' };
      }
    }

    // 4. Upsert de Contacto y Balanceo de Carga Multi-Agente
    let contactId: string;
    let isAiActive = true;
    let assignedAgentId: string | null = null;

    let contactQuery = (supabaseAdmin.from('contacts') as any)
      .select('id, is_ai_active, custom_fields, unread_count, ai_snooze_until, assigned_to')
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

      await (supabaseAdmin.from('contacts') as any)
        .update({
          last_interaction_at: new Date().toISOString(),
          name: senderName || undefined,
          channel: channel === 'instagram' ? 'instagram' : 'whatsapp',
          ...(isPaymentReceipt ? { is_ai_active: false } : {}),
        })
        .eq('id', contactId);
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

    // 6. Actualización de Contador de No Leídos, Último Mensaje y Verificación de Snooze
    const currentCustom = ((existingContact as any)?.custom_fields as Record<string, any>) || {};
    const unreadCount = ((existingContact as any)?.unread_count || currentCustom.unread_count || 0) + 1;
    const lastMsgPayload = {
      text: sanitizedContent,
      sender_type: 'lead',
      created_at: new Date().toISOString(),
    };

    const aiSnoozeUntil = (existingContact as any)?.ai_snooze_until || currentCustom.ai_snooze_until;
    let effectiveAiActive = isAiActive;
    let clearSnooze = false;
    if (aiSnoozeUntil) {
      if (new Date(aiSnoozeUntil).getTime() <= Date.now()) {
        effectiveAiActive = true;
        clearSnooze = true;
      } else {
        effectiveAiActive = false;
      }
    }

    await (supabaseAdmin.from('contacts') as any)
      .update({
        unread_count: unreadCount,
        last_message: lastMsgPayload,
        is_ai_active: effectiveAiActive,
        ai_snooze_until: clearSnooze ? null : ((existingContact as any)?.ai_snooze_until || null),
        custom_fields: {
          ...currentCustom,
          unread_count: unreadCount,
          last_message: lastMsgPayload,
          ai_snooze_until: clearSnooze ? null : currentCustom.ai_snooze_until,
        },
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

    // 8. Evaluación Uniforme de Guardrails y Solicitud Humana
    if (isPaymentReceipt) {
      await (supabaseAdmin.from('messages') as any).insert({
        contact_id: contactId,
        sender_type: 'system',
        content: '[🚨 Comprobante de pago recibido en imagen: Asesor humano requerido para verificar extracto bancario. IA pausada.]',
      });

      // Despacho autónomo e inmediato de alerta al WhatsApp personal del asesor
      HandoffService.notifyHandoff({
        organizationId: orgId,
        contactId,
        reason: 'Comprobante de pago recibido en imagen',
        channel: channel === 'instagram' ? 'instagram' : 'whatsapp',
      }).catch((err) => console.warn('[HANDOFF NOTIFY WARN]', err));

      return { status: 'payment_receipt_held', contactId, messageId };
    }

    const isHumanRequest = HUMAN_HANDOFF_PATTERNS.some((pattern) => pattern.test(sanitizedContent));
    if (isHumanRequest) {
      await (supabaseAdmin.from('contacts') as any)
        .update({ is_ai_active: false })
        .eq('id', contactId);

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
        const handoffNotice =
          '¡Claro que sí! Con gusto te comunico con uno de nuestros asesores para que te atienda personalmente. Ya mismo le paso tu conversación.';
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
    const { payload, contactId, insertedMessageId } = params;
    const { organization, channel, senderId } = payload;
    const startTime = Date.now();

    try {
      // Anti-Burst Buffer (Debounce de 3.5 segundos para mensajes consecutivos)
      await new Promise((resolve) => setTimeout(resolve, 3500));

      // Verificar si llegó un mensaje del lead más reciente
      const { data: latestMsg } = await (supabaseAdmin.from('messages') as any)
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

      // Re-verificar si un asesor humano intervino o pausó la IA durante la espera
      const { data: latestContact } = await (supabaseAdmin.from('contacts') as any)
        .select('is_ai_active')
        .eq('id', contactId)
        .single();

      if (latestContact && !latestContact.is_ai_active) {
        console.log(`[INBOUND CORE AI ABORT] Asesor tomó el chat con ${senderId}. Respuesta cancelada.`);
        return;
      }

      // Verificación de horario de atención
      let isAfterHours = false;
      const bHours = organization.business_hours as any;
      if (bHours?.enabled) {
        try {
          const tz = organization.appointment_settings?.timezone || bHours?.timezone || 'America/Bogota';
          const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
          const currentHourMin = `${String(nowInTz.getHours()).padStart(2, '0')}:${String(nowInTz.getMinutes()).padStart(2, '0')}`;
          const currentDayIndex = nowInTz.getDay();
          const dayMap: Record<number, string> = {
            0: 'sunday',
            1: 'monday',
            2: 'tuesday',
            3: 'wednesday',
            4: 'thursday',
            5: 'friday',
            6: 'saturday',
          };
          const dayConfig = bHours?.schedule?.[dayMap[currentDayIndex]];
          if (dayConfig?.active === false) {
            isAfterHours = true;
          } else if (dayConfig?.start && dayConfig?.end) {
            if (currentHourMin < dayConfig.start || currentHourMin > dayConfig.end) {
              isAfterHours = true;
            }
          }
        } catch (e) {
          console.warn('[INBOUND CORE BUSINESS HOURS WARN]', e);
        }
      }

      // Generación de Respuesta con OpenAIService (Soporta Google Gemini primario con failover)
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
        timezone: organization.appointment_settings?.timezone || organization.business_hours?.timezone || 'America/Bogota',
        channel: channel === 'instagram' ? 'instagram' : 'whatsapp',
        organization,
      });

      const aiResponseText = (typeof aiResult === 'string' ? aiResult : aiResult.text || '').trim();
      const metaModel = typeof aiResult === 'object' ? aiResult.modelUsed : (process.env.GEMINI_MODEL || 'gemini-flash-latest');
      const metaProvider = typeof aiResult === 'object' ? aiResult.provider : (organization.ai_provider || 'google');
      const isFallback = typeof aiResult === 'object' ? aiResult.isFallback : false;
      const promptTokens = typeof aiResult === 'object' ? aiResult.promptTokens : 0;
      const completionTokens = typeof aiResult === 'object' ? aiResult.completionTokens : 0;
      const latencyMs = Date.now() - startTime;

      if (!aiResponseText) {
        // Registro de run omitido o vacío
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

        // Si se detectaron imágenes fugadas en el texto, despacharlas como mensajes multimedia nativos de WhatsApp
        for (const media of leakedMedia) {
          try {
            const mediaMsgId = await MessagingService.sendMediaMessage({
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
              to: senderId,
              mediaUrl: media.url,
              caption: media.caption || undefined,
              mediaType: 'image',
            });

            await (supabaseAdmin.from('messages') as any).insert({
              contact_id: contactId,
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
          outboundMessageId = await this.dispatchOutboundMessage({
            organization,
            channel,
            recipientId: senderId,
            text: cleanedAiText,
            contactId,
          });

          // Persistir mensaje de la IA en base de datos
          await (supabaseAdmin.from('messages') as any).insert({
            contact_id: contactId,
            sender_type: 'ai',
            content: cleanedAiText,
            meta_message_id: outboundMessageId || null,
            status: 'sent',
            channel: channel === 'instagram' ? 'instagram' : 'whatsapp',
          });
        }

        const effectiveLastText = cleanedAiText || (leakedMedia.length > 0 ? formatImageMessageContent(leakedMedia[0].url, leakedMedia[0].caption || '') : aiResponseText);

        const aiLastMsg = {
          text: effectiveLastText,
          sender_type: 'ai',
          created_at: new Date().toISOString(),
        };

        const { data: contactData } = await (supabaseAdmin.from('contacts') as any)
          .select('custom_fields')
          .eq('id', contactId)
          .single();

        const customFields = (contactData?.custom_fields as Record<string, any>) || {};

        await (supabaseAdmin.from('contacts') as any)
          .update({
            last_message: aiLastMsg,
            custom_fields: {
              ...customFields,
              last_message: aiLastMsg,
            },
          })
          .eq('id', contactId);

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
          } catch (alertErr) {
            console.warn('[ADMIN NOTIFICATION ERROR]', alertErr);
          }
        }
      }
    } catch (workerError: any) {
      console.error('[INBOUND CORE WORKER FATAL ERROR]', workerError);
      await this.recordAiRun({
        organizationId: organization.id,
        contactId,
        channel,
        provider: organization.ai_provider || 'google',
        model: 'gemini-1.5-flash',
        latencyMs: Date.now() - startTime,
        status: 'failed',
        errorMessage: workerError?.message || 'Excepción no controlada en el worker de IA',
      });
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
}
