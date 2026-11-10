'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { WhatsAppService, META_TEMPLATES, MetaTemplateKey } from '@/services/whatsapp.service';
import { EvolutionService } from '@/services/evolution.service';
import { normalizeContactInboxState as normalizeContactPure } from '@/lib/inbox/normalize';
import { classifySeguimientoSubBucket } from '@/lib/inbox/buckets';
import { MessagingService } from '@/services/messaging.service';
import { InstagramService } from '@/services/instagram.service';
import { decryptSecret } from '@/lib/security/encryption';
import { formatImageMessageContent, formatDocumentMessageContent, formatAudioMessageContent, formatVideoMessageContent } from '@/lib/media/format';
import { OpenAIService } from '@/services/openai.service';
import { InboundCoreService } from '@/services/inbound-core.service';
import { isWithin24HourWindow } from '@/services/contact.service';
import { revalidatePath } from 'next/cache';

/**
 * Envía un mensaje manual por un agente humano desde el CRM.
 * Regla de negocio crítica: Silencia automáticamente la IA (is_ai_active = false)
 * para otorgar el control completo al operador humano.
 * Soporta citar/responder mensajes anteriores mediante replyToMessageId.
 */
export async function sendAgentMessage(
  contactId: string,
  content: string,
  replyToMessageId?: string,
  clientMessageId?: string
) {
  const supabase = createServerSupabaseClient();

  // 1. Validar sesión del usuario autenticado
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('No autorizado');
  }

  // 2. Obtener la organización del usuario
  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id;
  if (!orgId) {
    throw new Error('Perfil u organización no encontrada');
  }

  // 3. Validar que el contacto pertenece a la misma organización (Anti-IDOR)
  const { data: contact, error: contactError } = await (supabaseAdmin.from('contacts') as any)
    .select('id, phone, custom_fields, organization_id, channel, instagram_id, last_interaction_at')
    .eq('id', contactId)
    .eq('organization_id', orgId)
    .single();

  if (contactError || !contact) {
    throw new Error('Contacto no encontrado o acceso denegado');
  }

  const cleanContent = typeof content === 'string' ? content.trim() : '';
  if (!cleanContent) {
    throw new Error('El mensaje no puede estar vacío.');
  }

  const isInstagram = contact.channel === 'instagram' || Boolean(contact.instagram_id);
  const messageId = clientMessageId || crypto.randomUUID();

  // 4. Persistir inmediatamente con estado 'sending' e ID idempotente (cero duplicados)
  await (supabaseAdmin.from('messages') as any).upsert(
    {
      id: messageId,
      contact_id: contactId,
      sender_type: 'agent_manual',
      content: cleanContent,
      meta_message_id: null,
      channel: isInstagram ? 'instagram' : 'whatsapp',
      status: 'sending',
      reply_to_message_id: replyToMessageId || null,
    },
    { onConflict: 'id' }
  );

  // 5. Inmediato Human Takeover: silenciar la IA ANTES del despacho de red
  await (supabaseAdmin.from('contacts') as any)
    .update({
      is_ai_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId);

  let metaMessageId: string | null = null;

  try {
    if (isInstagram) {
      // Obtener credenciales de Instagram Direct
      const { data: org } = await (supabaseAdmin.from('organizations') as any)
        .select('instagram_account_id, instagram_access_token')
        .eq('id', orgId)
        .single();

      if (!org?.instagram_account_id || !org?.instagram_access_token) {
        throw new Error('Credenciales de Instagram Direct no configuradas en la organización');
      }

      const decryptedToken = decryptSecret(org.instagram_access_token);
      const recipientIgId = contact.instagram_id || contact.phone.replace(/^ig_/, '');

      metaMessageId = await InstagramService.sendDirectMessage({
        instagramAccountId: org.instagram_account_id,
        accessToken: decryptedToken,
        recipientId: recipientIgId,
        text: cleanContent,
      });
    } else {
      // Obtener credenciales de mensajería de la organización
      const { data: org } = await (supabaseAdmin.from('organizations') as any)
        .select('id, name, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, evolution_api_url, evolution_api_key, evolution_instance_name, evolution_status, evolution_anti_ban_mode, evolution_max_outbound_per_hour')
        .eq('id', orgId)
        .single();

      if (!org) {
        throw new Error('Organización no encontrada.');
      }

      if (cleanContent.length > 4096) {
        throw new Error('El mensaje supera el límite permitido por WhatsApp (4,096 caracteres).');
      }

      const isCold = !contact.last_interaction_at;
      const targetRecipient = contact.custom_fields?.remote_jid || contact.phone;

      metaMessageId = await MessagingService.sendTextMessage({
        organization: org,
        to: targetRecipient,
        body: cleanContent,
        simulateTyping: false,
        isColdOutbound: isCold,
      });
    }

    // 6. Actualizar mensaje a 'sent' y meta_message_id
    await (supabaseAdmin.from('messages') as any)
      .update({
        status: 'sent',
        meta_message_id: metaMessageId || null,
      })
      .eq('id', messageId);

    const nowIso = new Date().toISOString();
    const lastMessagePayload = {
      text: cleanContent,
      sender_type: 'agent_manual',
      created_at: nowIso,
    };

    const currentCustom = contact.custom_fields || {};
    const updatedCustom: Record<string, any> = {
      ...currentCustom,
      unattended_handoff: false,
    };

    if (updatedCustom.active_reminder?.reminderType === 'reactivation') {
      delete updatedCustom.active_reminder;
    }

    await (supabaseAdmin.from('contacts') as any)
      .update({
        last_message: lastMessagePayload,
        custom_fields: updatedCustom,
        last_interaction_at: nowIso,
        updated_at: nowIso,
        waiting_since: null,
        unread_count: 0,
        conversation_status: 'waiting_customer',
        last_message_sender: 'agent_manual',
        last_message_preview: cleanContent.slice(0, 160),
      })
      .eq('id', contactId);

    // Cancelar recordatorios de reactivación pendientes en tabla scheduled_reminders
    try {
      await (supabaseAdmin.from('scheduled_reminders') as any)
        .update({ status: 'cancelled' })
        .eq('contact_id', contactId)
        .eq('reminder_type', 'reactivation')
        .eq('status', 'pending');
    } catch {}

    return { success: true, messageId, metaMessageId };
  } catch (err: any) {
    // Marcar como fallido en la base de datos para mostrar botón de reintentar
    await (supabaseAdmin.from('messages') as any)
      .update({ status: 'failed' })
      .eq('id', messageId);
    throw err;
  }
}

/**
 * Envía una plantilla oficial de Meta cuando la ventana de 24h ha vencido o para iniciar un lead nuevo.
 */
export async function sendAgentTemplate(
  contactId: string,
  templateKey: string,
  clientMessageId?: string
) {
  const supabase = createServerSupabaseClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('No autorizado');
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id;
  if (!orgId) throw new Error('Perfil no encontrado');

  const { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .select('id, phone, custom_fields, organization_id')
    .eq('id', contactId)
    .eq('organization_id', orgId)
    .single();

  if (!contact) throw new Error('Contacto no encontrado');

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, evolution_api_url, evolution_api_key, evolution_instance_name, evolution_status, evolution_anti_ban_mode, evolution_max_outbound_per_hour')
    .eq('id', orgId)
    .single();

  if (!org) {
    throw new Error('Organización no encontrada.');
  }

  const templateDef = (META_TEMPLATES as any)[templateKey];
  const templateName = templateDef?.name || templateKey;
  const templateLabel = templateDef?.label || templateKey;

  const targetRecipient = contact.custom_fields?.remote_jid || contact.phone;
  const messageId = clientMessageId || crypto.randomUUID();

  // 1. Persistir inmediatamente con 'sending' e ID idempotente
  await (supabaseAdmin.from('messages') as any).upsert(
    {
      id: messageId,
      contact_id: contactId,
      sender_type: 'agent_manual',
      content: `[Plantilla oficial: ${templateLabel}]`,
      meta_message_id: null,
      channel: 'whatsapp',
      status: 'sending',
    },
    { onConflict: 'id' }
  );

  try {
    const metaId = await MessagingService.sendTemplateMessage({
      organization: org,
      to: targetRecipient,
      templateKey,
      templateName,
      languageCode: 'es',
    });

    // 2. Actualizar a 'sent'
    await (supabaseAdmin.from('messages') as any)
      .update({
        status: 'sent',
        meta_message_id: metaId || null,
      })
      .eq('id', messageId);

    const nowIso = new Date().toISOString();
    const templateMsgPayload = {
      text: `[Plantilla oficial: ${templateLabel}]`,
      sender_type: 'agent_manual',
      created_at: nowIso,
    };

    const currentCustom = (contact.custom_fields as Record<string, any>) || {};
    const updatedCustom: Record<string, any> = {
      ...currentCustom,
      last_message: templateMsgPayload,
      unattended_handoff: false,
    };

    // Si es plantilla de reactivación, registrar blindaje anti-spam de 1 solo intento
    if (templateKey.includes('reactiva')) {
      updatedCustom.reactivation_attempted = true;
      updatedCustom.reactivation_sent_at = nowIso;
      updatedCustom.reactivation_type = 'template_manual';
    }

    if (updatedCustom.active_reminder?.reminderType === 'reactivation') {
      delete updatedCustom.active_reminder;
    }

    await (supabaseAdmin.from('contacts') as any)
      .update({
        last_message: templateMsgPayload,
        last_interaction_at: nowIso,
        updated_at: nowIso,
        waiting_since: null,
        unread_count: 0,
        conversation_status: 'waiting_customer',
        last_message_sender: 'agent_manual',
        last_message_preview: `[Plantilla oficial: ${templateLabel}]`,
        custom_fields: updatedCustom,
      })
      .eq('id', contactId);

    // Cancelar recordatorios pendientes con status 'cancelled'
    try {
      await (supabaseAdmin.from('scheduled_reminders') as any)
        .update({ status: 'cancelled' })
        .eq('contact_id', contactId)
        .eq('reminder_type', 'reactivation')
        .eq('status', 'pending');
    } catch {}

    return { success: true, messageId, metaId };
  } catch (err: any) {
    await (supabaseAdmin.from('messages') as any)
      .update({ status: 'failed' })
      .eq('id', messageId);
    throw err;
  }
}

/**
 * Sube un archivo multimedia o documento a Supabase Storage (bucket 'chat-media')
 * con validación de tipo MIME y tamaño máximo de 15 MB.
 */
export async function uploadChatMedia(formData: FormData): Promise<{
  url: string;
  fileName: string;
  isDocument: boolean;
  isAudio?: boolean;
  isVideo?: boolean;
  fileType: string;
}> {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const file = formData.get('file') as File;
  if (!file) throw new Error('No se recibió ningún archivo.');

  if (file.size > 25 * 1024 * 1024) {
    throw new Error('El archivo supera el tamaño máximo permitido de 25 MB.');
  }

  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/3gpp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/x-m4a',
  ];

  const isAudioFile = file.type.startsWith('audio/') || file.name.match(/\.(ogg|webm|mp3|wav|m4a|aac)$/i);
  const isVideoFile = file.type.startsWith('video/') || file.name.match(/\.(mp4|mov|webm|3gp)$/i);

  if (!allowedTypes.includes(file.type) && !isAudioFile && !isVideoFile && !file.name.match(/\.(pdf|docx?|xlsx?|txt|png|jpe?g|webp|gif|mp4|mov|webm)$/i)) {
    throw new Error('Formato de archivo no admitido. Se permiten imágenes, videos, documentos y notas de voz.');
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id || 'general';
  const fileExt = file.name.split('.').pop() || (isAudioFile ? 'ogg' : file.type.startsWith('image/') ? 'jpg' : 'pdf');
  const safeBaseName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = `${orgId}/${Date.now()}_${safeBaseName}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabaseAdmin.storage
    .from('chat-media')
    .upload(fileName, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    });

  if (uploadError) {
    console.error('[STORAGE UPLOAD ERROR]', uploadError);
    throw new Error(`Error al subir archivo: ${uploadError.message}`);
  }

  const { data: publicData } = supabaseAdmin.storage
    .from('chat-media')
    .getPublicUrl(fileName);

  const isVideo = Boolean(isVideoFile);
  const isDocument = !file.type.startsWith('image/') && !isAudioFile && !isVideo;

  return {
    url: publicData.publicUrl,
    fileName: file.name,
    isDocument,
    isAudio: Boolean(isAudioFile),
    isVideo,
    fileType: file.type,
  };
}

/**
 * Envía una imagen o documento manual por un agente humano desde el CRM a WhatsApp.
 * Silencia la IA automáticamente (Human Takeover).
 */
export async function sendAgentMediaMessage(
  contactId: string,
  mediaUrl: string,
  caption?: string,
  fileName?: string,
  isDocument?: boolean,
  isAudio?: boolean,
  isVideo?: boolean,
  clientMessageId?: string
) {
  const supabase = createServerSupabaseClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id;
  if (!orgId) throw new Error('Perfil u organización no encontrada');

  const { data: contact, error: contactError } = await (supabaseAdmin.from('contacts') as any)
    .select('id, phone, custom_fields, organization_id, channel, last_interaction_at')
    .eq('id', contactId)
    .eq('organization_id', orgId)
    .single();

  if (contactError || !contact) throw new Error('Contacto no encontrado o acceso denegado');

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, evolution_api_url, evolution_api_key, evolution_instance_name, evolution_status, evolution_anti_ban_mode, evolution_max_outbound_per_hour')
    .eq('id', orgId)
    .single();

  if (!org) throw new Error('Organización no encontrada.');

  const targetRecipient = contact.custom_fields?.remote_jid || contact.phone;
  const mediaType = isVideo ? 'video' : isAudio ? 'audio' : isDocument ? 'document' : 'image';
  const msgId = clientMessageId || crypto.randomUUID();

  const formattedContent = isVideo
    ? formatVideoMessageContent(mediaUrl, caption)
    : isAudio
    ? formatAudioMessageContent(mediaUrl, caption)
    : isDocument
    ? formatDocumentMessageContent(mediaUrl, fileName, caption)
    : formatImageMessageContent(mediaUrl, caption);

  // 1. Persistir inmediatamente con 'sending' e ID idempotente
  await (supabaseAdmin.from('messages') as any).upsert(
    {
      id: msgId,
      contact_id: contactId,
      sender_type: 'agent_manual',
      content: formattedContent,
      meta_message_id: null,
      channel: 'whatsapp',
      status: 'sending',
    },
    { onConflict: 'id' }
  );

  // 2. Silenciar IA de inmediato (Human Takeover) antes del despacho de red
  await (supabaseAdmin.from('contacts') as any)
    .update({
      is_ai_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId);

  try {
    // 3. Despachar video, imagen, documento o nota de voz a WhatsApp
    const metaMessageId = await MessagingService.sendMediaMessage({
      organization: org,
      to: targetRecipient,
      mediaUrl,
      caption: caption || undefined,
      mediaType,
      fileName: fileName || (isVideo ? 'video.mp4' : isAudio ? 'nota_de_voz.ogg' : isDocument ? 'documento.pdf' : 'imagen.jpg'),
    });

    const previewText = isVideo
      ? (caption ? `📹 ${caption}` : '📹 [Video]')
      : isAudio
      ? '🎙️ [Nota de voz]'
      : isDocument
      ? `📄 [Documento: ${fileName || 'Archivo'}]`
      : (caption ? `📷 ${caption}` : '📷 [Foto]');

    const nowIso = new Date().toISOString();
    const lastMsgPayload = {
      text: previewText,
      sender_type: 'agent_manual',
      created_at: nowIso,
    };

    const currentCustom = contact.custom_fields || {};
    await (supabaseAdmin.from('contacts') as any)
      .update({
        last_message: lastMsgPayload,
        custom_fields: {
          ...currentCustom,
          last_message: lastMsgPayload,
          unattended_handoff: false,
        },
        last_interaction_at: nowIso,
        updated_at: nowIso,
        waiting_since: null,
        unread_count: 0,
        conversation_status: 'waiting_customer',
        last_message_sender: 'agent_manual',
        last_message_preview: previewText.slice(0, 160),
      })
      .eq('id', contactId);

    await (supabaseAdmin.from('messages') as any)
      .update({
        status: 'sent',
        meta_message_id: metaMessageId || null,
      })
      .eq('id', msgId);

    return { success: true, messageId: msgId, metaMessageId };
  } catch (err: any) {
    await (supabaseAdmin.from('messages') as any)
      .update({ status: 'failed' })
      .eq('id', msgId);
    throw err;
  }
}

/**
 * Marca la conversación de un contacto como leída despejando el contador de no leídos.
 */
export async function markContactAsRead(contactId: string) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return;

    const { data: profile } = await (supabaseAdmin.from('profiles') as any)
      .select('organization_id')
      .eq('id', user.id)
      .single();

    const orgId = profile?.organization_id;
    if (!orgId) return;

    const { data: contact } = await (supabaseAdmin.from('contacts') as any)
      .select('id, phone, custom_fields')
      .eq('id', contactId)
      .eq('organization_id', orgId)
      .single();

    if (!contact) return;

    // 1. Despejar unread_count en la base de datos
    await (supabaseAdmin.from('contacts') as any)
      .update({
        unread_count: 0,
      })
      .eq('id', contactId);

    // 2. Notificar recibo de lectura real a WhatsApp (doble tilde azul en el celular del cliente)
    const { data: latestLeadMsgs } = await (supabaseAdmin.from('messages') as any)
      .select('id, meta_message_id')
      .eq('contact_id', contactId)
      .eq('sender_type', 'lead')
      .not('meta_message_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(3);

    if (latestLeadMsgs && latestLeadMsgs.length > 0) {
      const { data: org } = await (supabaseAdmin.from('organizations') as any)
        .select('whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, evolution_api_url, evolution_api_key, evolution_instance_name')
        .eq('id', orgId)
        .single();

      if (org) {
        const isEvolution = org.whatsapp_provider === 'evolution' || Boolean(org.evolution_instance_name);
        let decryptedEvoKey = '';
        if (org.evolution_api_key) {
          try {
            decryptedEvoKey = decryptSecret(org.evolution_api_key);
          } catch {
            decryptedEvoKey = org.evolution_api_key;
          }
        }
        let decryptedMetaToken = '';
        if (org.whatsapp_access_token) {
          try {
            decryptedMetaToken = decryptSecret(org.whatsapp_access_token);
          } catch {
            decryptedMetaToken = org.whatsapp_access_token;
          }
        }

        for (const msg of latestLeadMsgs) {
          if (!msg.meta_message_id) continue;
          if (isEvolution && decryptedEvoKey && org.evolution_instance_name) {
            EvolutionService.markMessageAsRead({
              apiUrl: org.evolution_api_url,
              apiKey: decryptedEvoKey,
              instanceName: org.evolution_instance_name,
              remoteJid: contact.phone,
              messageId: msg.meta_message_id,
            }).catch(() => {});
          } else if (org.whatsapp_phone_number_id && decryptedMetaToken) {
            WhatsAppService.markAsRead(
              org.whatsapp_phone_number_id,
              decryptedMetaToken,
              msg.meta_message_id
            ).catch(() => {});
          }
        }
      }
    }
  } catch (err: any) {
    console.warn('[markContactAsRead] Error marcando chat como leído:', err?.message || err);
  }
}

/**
 * Envía o retira una reacción con emoji a un mensaje tanto en la base de datos
 * como en WhatsApp (Meta Cloud API o Evolution API).
 */
export async function reactToMessage(messageId: string, emoji: string) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id;
  if (!orgId) throw new Error('Organización no encontrada');

  const { data: msg } = await (supabaseAdmin.from('messages') as any)
    .select('id, contact_id, meta_message_id, reactions')
    .eq('id', messageId)
    .single();

  if (!msg) throw new Error('Mensaje no encontrado');

  const { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .select('id, phone, organization_id')
    .eq('id', msg.contact_id)
    .eq('organization_id', orgId)
    .single();

  if (!contact) throw new Error('Acceso denegado a este contacto');

  const currentEmoji = msg.reactions?.emoji;
  const isRemoving = currentEmoji === emoji || !emoji;
  const nextReactions = isRemoving
    ? null
    : { emoji, from: 'agent', reacted_at: new Date().toISOString() };

  await (supabaseAdmin.from('messages') as any)
    .update({ reactions: nextReactions })
    .eq('id', messageId);

  // Despacho a WhatsApp si el mensaje tiene ID externo
  if (msg.meta_message_id) {
    const { data: org } = await (supabaseAdmin.from('organizations') as any)
      .select('whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, evolution_api_url, evolution_api_key, evolution_instance_name')
      .eq('id', orgId)
      .single();

    if (org) {
      const isEvolution = org.whatsapp_provider === 'evolution' || Boolean(org.evolution_instance_name);
      const emojiToSend = isRemoving ? '' : emoji;
      let decryptedEvoKey = '';
      if (org.evolution_api_key) {
        try {
          decryptedEvoKey = decryptSecret(org.evolution_api_key);
        } catch {
          decryptedEvoKey = org.evolution_api_key;
        }
      }
      let decryptedMetaToken = '';
      if (org.whatsapp_access_token) {
        try {
          decryptedMetaToken = decryptSecret(org.whatsapp_access_token);
        } catch {
          decryptedMetaToken = org.whatsapp_access_token;
        }
      }

      if (isEvolution && decryptedEvoKey && org.evolution_instance_name) {
        EvolutionService.sendReaction({
          apiUrl: org.evolution_api_url,
          apiKey: decryptedEvoKey,
          instanceName: org.evolution_instance_name,
          remoteJid: contact.phone,
          messageId: msg.meta_message_id,
          emoji: emojiToSend,
        }).catch((err: any) => console.warn('[reactToMessage Evolution warning]', err));
      } else if (org.whatsapp_phone_number_id && decryptedMetaToken) {
        WhatsAppService.sendReaction({
          phoneNumberId: org.whatsapp_phone_number_id,
          accessToken: decryptedMetaToken,
          to: contact.phone,
          messageId: msg.meta_message_id,
          emoji: emojiToSend,
        }).catch((err) => console.warn('[reactToMessage Meta warning]', err));
      }
    }
  }

  return { success: true, reactions: nextReactions };
}

/**
 * Pausa la IA temporalmente para un contacto (30 minutos, 2 horas o hasta mañana a las 8:00 AM).
 * Reactiva automáticamente la IA al expirar la ventana.
 */
export async function snoozeContactAi(contactId: string, duration: 30 | 120 | 'tomorrow') {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id;
  if (!orgId) throw new Error('Organización no encontrada');

  let resumeDate: Date;
  let labelText = '';

  if (duration === 30) {
    resumeDate = new Date(Date.now() + 30 * 60 * 1000);
    labelText = '30 minutos';
  } else if (duration === 120) {
    resumeDate = new Date(Date.now() + 120 * 60 * 1000);
    labelText = '2 horas';
  } else {
    // Hasta mañana a las 8:00 AM
    resumeDate = new Date();
    resumeDate.setDate(resumeDate.getDate() + 1);
    resumeDate.setHours(8, 0, 0, 0);
    labelText = 'mañana a las 8:00 AM';
  }

  const snoozeIso = resumeDate.toISOString();

  const { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .select('custom_fields')
    .eq('id', contactId)
    .eq('organization_id', orgId)
    .single();

  if (!contact) {
    throw new Error('Contacto no encontrado o acceso denegado');
  }

  const currentCustom = contact.custom_fields || {};

  await (supabaseAdmin.from('contacts') as any)
    .update({
      is_ai_active: false,
      ai_snooze_until: snoozeIso,
      custom_fields: {
        ...currentCustom,
        ai_snooze_until: snoozeIso,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId)
    .eq('organization_id', orgId);

  await (supabaseAdmin.from('messages') as any).insert({
    contact_id: contactId,
    sender_type: 'system',
    content: `[Sistema: IA pausada por el asesor por ${labelText} (se reanudará automáticamente el ${resumeDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })})]`,
  });
}

/**
 * Conmuta manualmente el switch de IA para un contacto específico.
 * Si se activa (newState === true), revisa si el último mensaje fue del lead y lo responde de inmediato.
 */
export async function toggleContactAi(contactId: string, newState: boolean) {
  const supabase = createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id;
  if (!orgId) throw new Error('Perfil no encontrado');

  await (supabaseAdmin.from('contacts') as any)
    .update({
      is_ai_active: newState,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId)
    .eq('organization_id', orgId);

  // Si se acaba de activar la IA, verificar si hay un mensaje pendiente del lead y responderlo
  if (newState) {
    // Se ejecuta de fondo sin bloquear la respuesta del switch en la interfaz
    InboundCoreService.triggerPendingAiForContact(contactId).catch((err) => {
      console.warn('[TOGGLE AI AUTO TRIGGER WARN]', err);
    });
  }

  // Notificar al cliente con revalidate local
  revalidatePath(`/inbox/${contactId}`);
}

/**
 * Despacha en lote de a 10 contactos las respuestas de IA para prospectos rezagados.
 */
export async function triggerPendingAiBatchAction(limit = 10) {
  const supabase = createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id;
  if (!orgId) throw new Error('Perfil no encontrado');

  const result = await InboundCoreService.triggerPendingAiBatch(orgId, limit);
  revalidatePath('/inbox');
  return result;
}


/**
 * Consulta cuántos prospectos tienen mensajes pendientes de responder con IA.
 */
export async function getPendingAiStatsAction() {
  const supabase = createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { count: 0 };

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id;
  if (!orgId) return { count: 0 };

  const count = await InboundCoreService.getPendingAiCountForOrg(orgId);
  return { count };
}

/**
 * Fuerza el despacho inmediato de IA para un contacto puntual en el chat.
 */
export async function triggerSinglePendingAiAction(contactId: string) {
  const supabase = createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id;
  if (!orgId) throw new Error('Perfil no encontrado');

  const { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .select('id')
    .eq('id', contactId)
    .eq('organization_id', orgId)
    .single();

  if (!contact) throw new Error('Contacto no encontrado o acceso denegado');

  const success = await InboundCoreService.triggerPendingAiForContact(contactId);
  return { success };
}

/**
 * Consulta de relevos humanos pendientes (Anti-Visto).
 * Retorna prospectos con IA silenciada que están esperando respuesta humana.
 */
export async function getUnattendedHandoffs(): Promise<Array<{
  id: string;
  name: string;
  phone: string;
  lastMessage: string;
  waitingSince: string;
  assignedTo?: string | null;
}>> {
  try {
    const supabase = createServerSupabaseClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return [];

    const { data: profile } = await (supabaseAdmin.from('profiles') as any)
      .select('organization_id, role, is_super_admin')
      .eq('id', user.id)
      .single();

    const orgId = profile?.organization_id;
    if (!orgId) return [];

    // Obtener prospectos con IA apagada activos (no archivados ni ganados/perdidos)
    const { data: contacts } = await (supabaseAdmin.from('contacts') as any)
      .select('id, name, phone, updated_at, last_interaction_at, assigned_to, custom_fields')
      .eq('organization_id', orgId)
      .eq('is_ai_active', false)
      .not('pipeline_stage', 'in', '("ganado","perdido")')
      .order('updated_at', { ascending: false })
      .limit(25);

    if (!contacts || contacts.length === 0) return [];

    const contactIds = contacts.map((c: any) => c.id);

    // ⚡ Optimización Anti N+1: Consulta UNIFICADA de los mensajes recientes en un solo roundtrip
    const { data: recentMsgs } = await (supabaseAdmin.from('messages') as any)
      .select('id, contact_id, sender_type, content, created_at')
      .in('contact_id', contactIds)
      .order('created_at', { ascending: false });

    // Mapear el último mensaje del cliente, asesor y alertas de relevo para cada contacto
    const latestLeadMsgMap = new Map<string, any>();
    const latestAgentMsgMap = new Map<string, any>();
    const latestHandoffAlertMap = new Map<string, any>();

    if (recentMsgs && recentMsgs.length > 0) {
      for (const m of recentMsgs) {
        if (m.sender_type === 'lead' && !latestLeadMsgMap.has(m.contact_id)) {
          latestLeadMsgMap.set(m.contact_id, m);
        } else if ((m.sender_type === 'agent' || m.sender_type === 'agent_manual') && !latestAgentMsgMap.has(m.contact_id)) {
          latestAgentMsgMap.set(m.contact_id, m);
        } else if (
          m.sender_type === 'system' &&
          (m.content?.includes('🚨') || m.content?.includes('Relevo') || m.content?.includes('requerido') || m.content?.includes('Comprobante')) &&
          !latestHandoffAlertMap.has(m.contact_id)
        ) {
          latestHandoffAlertMap.set(m.contact_id, m);
        }
      }
    }

    const unattended: Array<{
      id: string;
      name: string;
      phone: string;
      lastMessage: string;
      waitingSince: string;
      assignedTo?: string | null;
    }> = [];

    for (const c of contacts) {
      // Ignorar conversaciones finalizadas formalmente
      if (c.custom_fields?.conversation_status === 'closed') continue;
      const leadMsg = latestLeadMsgMap.get(c.id);
      const agentMsg = latestAgentMsgMap.get(c.id);
      const handoffAlert = latestHandoffAlertMap.get(c.id);

      // Si no hay mensaje de lead ni alerta de relevo, no requiere atención
      if (!leadMsg && !handoffAlert) continue;

      const leadTime = leadMsg ? new Date(leadMsg.created_at).getTime() : 0;
      const alertTime = handoffAlert ? new Date(handoffAlert.created_at).getTime() : 0;
      const latestPendingTime = Math.max(leadTime, alertTime);

      const agentTime = agentMsg ? new Date(agentMsg.created_at).getTime() : 0;

      // El contacto REQUIERE ATENCIÓN solo si el requerimiento es posterior a la última respuesta del asesor
      if (latestPendingTime > agentTime) {
        const waitingMsg = leadTime >= alertTime ? (leadMsg?.content || '') : (handoffAlert?.content || '');
        const waitingDate = leadTime >= alertTime ? leadMsg?.created_at : handoffAlert?.created_at;

        unattended.push({
          id: c.id,
          name: c.name || 'Prospecto WhatsApp',
          phone: c.phone || '',
          lastMessage: waitingMsg,
          waitingSince: waitingDate || c.updated_at,
          assignedTo: c.assigned_to,
        });
      }
    }

    return unattended;
  } catch (err: any) {
    console.warn('[getUnattendedHandoffs] Red o conexión temporal con Supabase:', err?.message || err);
    return [];
  }
}

/**
 * Obtiene los mensajes históricos de un contacto para la transición fluida en cliente del Inbox.
 * Por defecto recupera los 50 mensajes más recientes ordenados cronológicamente.
 * Soporta paginación ascendente ("cargar mensajes anteriores") pasando `beforeCreatedAt`.
 */
export async function getContactMessages(contactId: string, beforeCreatedAt?: string, limit = 50) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id;
  if (!orgId) throw new Error('Organización no encontrada');

  let query = (supabaseAdmin.from('messages') as any)
    .select('id, sender_type, content, created_at, status, reply_to_message_id, reactions')
    .eq('contact_id', contactId);

  if (beforeCreatedAt) {
    query = query.lt('created_at', beforeCreatedAt);
  }

  // Validar pertenencia del contacto y consultar mensajes en paralelo (Reducción de latencia)
  const [{ data: contact }, { data: messages, error }] = await Promise.all([
    (supabaseAdmin.from('contacts') as any)
      .select('id')
      .eq('id', contactId)
      .eq('organization_id', orgId)
      .single(),
    query
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  if (!contact) throw new Error('Contacto no encontrado o acceso denegado');

  if (error) {
    console.error('[GET CONTACT MESSAGES ERROR]', error);
    throw new Error('Error al cargar mensajes del contacto');
  }

  // Retornar en orden cronológico ascendente para el renderizado natural del chat
  return (messages || []).reverse();
}

import {
  type QuickSnippet,
  BASE_DEFAULT_SNIPPETS,
  generateSuggestedSnippetsFromPrompt,
} from '@/lib/chat/snippets';

export type { QuickSnippet };

/**
 * Obtiene los atajos activos y las sugerencias de la IA para la organización actual
 */
export async function getOrganizationQuickReplies(): Promise<{
  activeSnippets: QuickSnippet[];
  aiSuggestions: QuickSnippet[];
}> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { activeSnippets: BASE_DEFAULT_SNIPPETS, aiSuggestions: [] };
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    return { activeSnippets: BASE_DEFAULT_SNIPPETS, aiSuggestions: [] };
  }

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('appointment_settings, structured_prompt_data, system_prompt')
    .eq('id', profile.organization_id)
    .single();

  const currentSettings = (org?.appointment_settings as any) || {};
  const savedSnippets = Array.isArray(currentSettings.quick_replies) && currentSettings.quick_replies.length > 0
    ? currentSettings.quick_replies
    : BASE_DEFAULT_SNIPPETS;

  const aiSuggestions = generateSuggestedSnippetsFromPrompt(
    org?.structured_prompt_data,
    org?.system_prompt
  );

  return {
    activeSnippets: savedSnippets,
    aiSuggestions,
  };
}

/**
 * Guarda la lista de atajos personalizados de la organización
 */
export async function saveOrganizationQuickReplies(
  snippets: QuickSnippet[]
): Promise<{ success: boolean; snippets: QuickSnippet[] }> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('No autorizado');
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    throw new Error('Perfil no encontrado');
  }

  if (profile.role !== 'admin' && profile.role !== 'supervisor' && !profile.is_super_admin) {
    throw new Error('Permisos insuficientes: Solo administradores o supervisores pueden configurar los atajos rápidos de la organización.');
  }

  // Limpiar y sanitizar atajos
  const cleanSnippets: QuickSnippet[] = (snippets || [])
    .filter((s) => s.shortcut && s.text)
    .slice(0, 30) // Máximo 30 atajos por empresa
    .map((s, idx) => {
      let code = s.shortcut.trim();
      if (!code.startsWith('/')) code = '/' + code;
      // Solo letras minúsculas, números y guiones
      code = '/' + code.slice(1).toLowerCase().replace(/[^a-z0-9_-]/g, '');

      return {
        id: s.id || `custom-${Date.now()}-${idx}`,
        shortcut: code || `/atajo${idx + 1}`,
        label: s.label?.trim().slice(0, 35) || code,
        text: s.text.trim().slice(0, 1000),
      };
    });

  const orgId = profile.organization_id;

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('appointment_settings')
    .eq('id', orgId)
    .single();

  const currentSettings = (org?.appointment_settings as any) || {};
  const updatedSettings = {
    ...currentSettings,
    quick_replies: cleanSnippets,
  };

  const { error: updateErr } = await (supabaseAdmin.from('organizations') as any)
    .update({
      appointment_settings: updatedSettings,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId);

  if (updateErr) {
    throw new Error(`Error guardando atajos: ${updateErr.message}`);
  }

  revalidatePath('/inbox');
  return { success: true, snippets: cleanSnippets };
}

/**
 * Finaliza la atención activa de un contacto ('Dar Fin').
 * Registra auditoría interna en el chat y actualiza el estado comercial si se indica.
 */
export async function endContactConversation(
  contactId: string,
  resolution: 'completed' | 'won' | 'lost' | 'dismissed' = 'completed',
  note?: string,
  dealValue?: number | null
) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, full_name')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) throw new Error('Organización no encontrada');

  const { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .select('id, name, organization_id, pipeline_stage, custom_fields')
    .eq('id', contactId)
    .eq('organization_id', profile.organization_id)
    .single();

  if (!contact) throw new Error('Contacto no encontrado');

  const currentCustom = (contact.custom_fields as Record<string, any>) || {};
  const nowIso = new Date().toISOString();
  const updatedCustom: Record<string, any> = {
    ...currentCustom,
    conversation_status: 'closed',
    closed_at: nowIso,
    closed_by: profile.full_name || 'Asesor',
    close_resolution: resolution,
    close_note: note?.trim() || null,
    unattended_handoff: false,
    ...(dealValue !== undefined && dealValue !== null ? { deal_value: dealValue } : {}),
  };

  if (resolution === 'won') {
    updatedCustom.lead_temperature = 'hot';
    delete updatedCustom.temperature;
    if (updatedCustom.follow_up && updatedCustom.follow_up.category !== 'post_order') {
      updatedCustom.follow_up = { ...updatedCustom.follow_up, category: 'post_order' };
    }
  } else if (resolution === 'lost') {
    updatedCustom.lead_temperature = 'cold';
    delete updatedCustom.temperature;
    if (note?.trim()) updatedCustom.lost_reason = note.trim().slice(0, 140);
    if (updatedCustom.follow_up) {
      updatedCustom.follow_up = { ...updatedCustom.follow_up, nextSendAt: null, completed: true };
    }
  }

  const updatePayload: Record<string, any> = {
    custom_fields: updatedCustom,
    conversation_status: 'closed',
    waiting_since: null,
    unread_count: 0,
    closed_at: nowIso,
    close_reason: resolution,
    updated_at: nowIso,
  };

  if (dealValue !== undefined && dealValue !== null) {
    updatePayload.deal_value = dealValue;
  }

  if (resolution === 'won') {
    updatePayload.pipeline_stage = 'ganado';
  } else if (resolution === 'lost') {
    updatePayload.pipeline_stage = 'perdido';
  }

  await (supabaseAdmin.from('contacts') as any)
    .update(updatePayload)
    .eq('id', contactId);

  try {
    await (supabaseAdmin.from('scheduled_reminders') as any)
      .update({ status: 'cancelled' })
      .eq('contact_id', contactId)
      .eq('reminder_type', 'reactivation')
      .eq('status', 'pending');
  } catch {}

  // Inserción de mensaje de auditoría en la conversación
  const dealStr = dealValue !== undefined && dealValue !== null ? ` por $${dealValue.toLocaleString('es-CO')}` : '';
  const auditLabel = resolution === 'won'
    ? `Cierre Ganado${dealStr}`
    : resolution === 'lost'
    ? 'No concretado / Perdido'
    : 'Atención completada';

  const auditNote = note?.trim() ? ` - Nota: "${note.trim()}"` : '';

  await (supabaseAdmin.from('messages') as any).insert({
    contact_id: contactId,
    sender_type: 'system',
    content: `[✓ Conversación finalizada por ${profile.full_name || 'Asesor'} (${auditLabel})${auditNote}]`,
  });

  revalidatePath('/inbox');
  revalidatePath(`/inbox/${contactId}`);
  return { success: true };
}

export type InboxViewType = 'por_responder' | 'mis_abiertos' | 'ia_atendiendo' | 'seguimiento' | 'cerrados';
export type SeguimientoFilterType = 'all' | 'ventas_a_medias' | 'compromisos' | 'por_reactivar';

export interface SeguimientoSubCounts {
  ventas_a_medias: number;
  compromisos: number;
  por_reactivar: number;
}

export interface ListInboxParams {
  view?: InboxViewType;
  seguimientoSubView?: SeguimientoFilterType;
  channel?: 'all' | 'whatsapp' | 'instagram';
  agentId?: string; // 'all' | 'unassigned' | profile_id
  stage?: string; // 'all' | pipeline_stage
  temperature?: string; // 'all' | 'cold' | 'warm' | 'hot'
  search?: string;
  offset?: number;
  limit?: number;
}

export interface InboxCounts {
  por_responder: number;
  mis_abiertos: number;
  ia_atendiendo: number;
  seguimiento: number;
  cerrados: number;
}

/**
 * Normaliza cualquier contacto al formato uniforme del nuevo Inbox por estado
 */
export async function normalizeContactInboxState(c: any) {
  return normalizeContactPure(c);
}

function buildPorResponderOrFilter(staleAiIso: string): string {
  return [
    'custom_fields->>unattended_handoff.eq.true',
    'and(is_ai_active.eq.false,last_message_sender.eq.lead)',
    'and(is_ai_active.eq.false,waiting_since.not.is.null)',
    'and(is_ai_active.eq.false,unread_count.gt.0)',
    'and(is_ai_active.eq.false,last_message_sender.is.null)',
    `and(is_ai_active.eq.true,last_message_sender.eq.lead,waiting_since.lte.${staleAiIso})`,
  ].join(',');
}

function buildSeguimientoOrFilter(d24h: string, d10d: string): string {
  return `ai_snooze_until.not.is.null,custom_fields->>active_reminder.not.is.null,custom_fields->follow_up->>nextSendAt.not.is.null,and(last_interaction_at.lte.${d24h},last_interaction_at.gte.${d10d},unread_count.eq.0,custom_fields->>reactivation_attempted.is.null,last_message_sender.neq.lead)`;
}

const SEGUIMIENTO_EXCLUDE_COLD_OR =
  'custom_fields->>lead_temperature.is.null,custom_fields->>lead_temperature.neq.cold';
const SEGUIMIENTO_EXCLUDE_LEGACY_COLD_OR =
  'custom_fields->>temperature.is.null,custom_fields->>temperature.neq.cold';

/**
 * Consulta de Inbox escalable en servidor con filtros por bandeja, canal, asesor y búsqueda global.
 */
export async function listInbox({
  view = 'por_responder',
  seguimientoSubView = 'all',
  channel = 'all',
  agentId = 'all',
  stage = 'all',
  temperature = 'all',
  search = '',
  offset = 0,
  limit = 30,
}: ListInboxParams) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id;
  if (!orgId) throw new Error('Organización no encontrada');

  const safeLimit = Math.min(Math.max(1, limit), 60);
  const safeOffset = Math.max(0, offset);

  // Consulta base
  let query = (supabaseAdmin.from('contacts') as any)
    .select(
      'id, name, phone, pipeline_stage, is_ai_active, last_interaction_at, updated_at, custom_fields, assigned_to, channel, instagram_username, instagram_id, unread_count, last_message, last_message_sender, last_message_preview, waiting_since, conversation_status, ai_snooze_until',
      { count: 'exact' }
    )
    .eq('organization_id', orgId)
    .is('deleted_at', null);

  const staleAiIso = new Date(Date.now() - 3 * 60 * 1000).toISOString();

  // 1. Filtros por Vista / Bandeja Principal (alineados 1:1 con getInboxCounts y lib/inbox/buckets.ts)
  if (view === 'por_responder') {
    // Solo chats abiertos que requieren atención humana real (nunca chats recién respondidos o atendidos normalmente por IA)
    query = query
      .neq('conversation_status', 'closed')
      .or(buildPorResponderOrFilter(staleAiIso))
      .order('last_interaction_at', { ascending: true });
  } else if (view === 'mis_abiertos') {
    // Chats asignados a mí que no están cerrados
    query = query
      .eq('assigned_to', user.id)
      .neq('conversation_status', 'closed')
      .order('updated_at', { ascending: false });
  } else if (view === 'ia_atendiendo') {
    // Chats activos donde la IA tiene el control (excluyendo relevos humanos)
    query = query
      .eq('is_ai_active', true)
      .neq('conversation_status', 'closed')
      .or('custom_fields->>unattended_handoff.is.null,custom_fields->>unattended_handoff.neq.true')
      .order('updated_at', { ascending: false });
  } else if (view === 'seguimiento') {
    // Chats con pausa de IA (snooze), recordatorio activo, o prospectos en silencio (>24h y <10d) para reactivar
    const d24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const d10d = new Date(Date.now() - 240 * 3600 * 1000).toISOString();
    query = query
      .neq('conversation_status', 'closed')
      .is('waiting_since', null)
      .not('pipeline_stage', 'in', '("ganado","perdido","cita_agendada")')
      .or(SEGUIMIENTO_EXCLUDE_COLD_OR)
      .or(SEGUIMIENTO_EXCLUDE_LEGACY_COLD_OR)
      .or(buildSeguimientoOrFilter(d24h, d10d))
      .order('updated_at', { ascending: false });
  } else if (view === 'cerrados') {
    // Historial archivado de chats finalizados
    query = query
      .eq('conversation_status', 'closed')
      .order('updated_at', { ascending: false });
  } else {
    query = query.order('updated_at', { ascending: false });
  }

  // 2. Filtro de Canal (WhatsApp vs Instagram)
  if (channel === 'whatsapp') {
    query = query.neq('channel', 'instagram');
  } else if (channel === 'instagram') {
    query = query.eq('channel', 'instagram');
  }

  // 3. Filtro de Asesor
  if (agentId === 'unassigned') {
    query = query.is('assigned_to', null);
  } else if (agentId && agentId !== 'all') {
    query = query.eq('assigned_to', agentId);
  }

  // 4. Filtro de Etapa del Pipeline
  if (stage && stage !== 'all') {
    query = query.eq('pipeline_stage', stage);
  }

  // 5. Filtro de Temperatura del Lead (compatible con lead_temperature, clave legada temperature y sin clasificar)
  if (temperature === 'unclassified') {
    query = query.is('custom_fields->>lead_temperature', null).is('custom_fields->>temperature', null);
  } else if (temperature && temperature !== 'all') {
    query = query.or(`custom_fields->>lead_temperature.eq.${temperature},custom_fields->>temperature.eq.${temperature}`);
  }

  // 6. Búsqueda por texto (nombre, teléfono, instagram)
  const cleanSearch = (search || '').trim().replace(/[%_]/g, '');
  if (cleanSearch) {
    query = query.or(`name.ilike.%${cleanSearch}%,phone.ilike.%${cleanSearch}%,instagram_username.ilike.%${cleanSearch}%`);
  }

  // Para Seguimiento, evaluamos el universo filtrado completo (excluyente entre sub-bandejas) para evitar pérdida por paginación
  if (view === 'seguimiento') {
    const { data: segContacts, error: segErr } = await query.range(0, 999);
    if (segErr) {
      console.error('[LIST INBOX SEGUIMIENTO ERROR]', segErr);
      throw new Error('Error al listar contactos de seguimiento');
    }

    const nowMs = Date.now();
    const normalizedAll = (segContacts || []).map(normalizeContactPure);
    const subCounts: SeguimientoSubCounts = {
      ventas_a_medias: 0,
      compromisos: 0,
      por_reactivar: 0,
    };
    const filteredAll: any[] = [];

    for (const c of normalizedAll) {
      const sb = classifySeguimientoSubBucket(c, nowMs);
      if (sb) {
        subCounts[sb]++;
      }
      if (seguimientoSubView === 'all' || sb === seguimientoSubView) {
        filteredAll.push(c);
      }
    }

    return {
      contacts: filteredAll.slice(safeOffset, safeOffset + safeLimit),
      totalCount: filteredAll.length,
      seguimientoSubCounts: subCounts,
    };
  }

  // Paginación por rango
  const { data: contacts, error, count } = await query.range(safeOffset, safeOffset + safeLimit - 1);

  if (error) {
    console.error('[LIST INBOX ERROR]', error);
    throw new Error('Error al listar contactos de la bandeja');
  }

  const normalized = (contacts || []).map(normalizeContactPure);
  return { contacts: normalized, totalCount: count ?? null, seguimientoSubCounts: null };
}

/**
 * Obtiene los contadores exactos y alineados de las 5 bandejas en paralelo desde Postgres.
 */
export async function getInboxCounts(): Promise<InboxCounts> {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id;
  if (!orgId) throw new Error('Organización no encontrada');

  const staleAiIso = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const d24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const d10d = new Date(Date.now() - 240 * 3600 * 1000).toISOString();

  const [resPorResponder, resMisAbiertos, resIa, resSeguimiento, resCerrados] = await Promise.all([
    (supabaseAdmin.from('contacts') as any)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .neq('conversation_status', 'closed')
      .or(buildPorResponderOrFilter(staleAiIso)),
    (supabaseAdmin.from('contacts') as any)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .eq('assigned_to', user.id)
      .neq('conversation_status', 'closed'),
    (supabaseAdmin.from('contacts') as any)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .eq('is_ai_active', true)
      .neq('conversation_status', 'closed')
      .or('custom_fields->>unattended_handoff.is.null,custom_fields->>unattended_handoff.neq.true'),
    (supabaseAdmin.from('contacts') as any)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .neq('conversation_status', 'closed')
      .is('waiting_since', null)
      .not('pipeline_stage', 'in', '("ganado","perdido","cita_agendada")')
      .or(SEGUIMIENTO_EXCLUDE_COLD_OR)
      .or(SEGUIMIENTO_EXCLUDE_LEGACY_COLD_OR)
      .or(buildSeguimientoOrFilter(d24h, d10d)),
    (supabaseAdmin.from('contacts') as any)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .eq('conversation_status', 'closed'),
  ]);

  return {
    por_responder: resPorResponder.count || 0,
    mis_abiertos: resMisAbiertos.count || 0,
    ia_atendiendo: resIa.count || 0,
    seguimiento: resSeguimiento.count || 0,
    cerrados: resCerrados.count || 0,
  };
}

/**
 * Reabre una conversación archivada o cerrada
 */
export async function reopenContactConversation(contactId: string) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, full_name')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) throw new Error('Organización no encontrada');

  const { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .select('id, custom_fields')
    .eq('id', contactId)
    .eq('organization_id', profile.organization_id)
    .single();

  if (!contact) throw new Error('Contacto no encontrado');

  const currentCustom = (contact.custom_fields as Record<string, any>) || {};
  const updatedCustom = {
    ...currentCustom,
    conversation_status: 'open',
    closed_at: null,
    close_resolution: null,
  };

  await (supabaseAdmin.from('contacts') as any)
    .update({
      custom_fields: updatedCustom,
      conversation_status: 'open',
      closed_at: null,
      close_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId);

  await (supabaseAdmin.from('messages') as any).insert({
    contact_id: contactId,
    sender_type: 'system',
    content: `[✓ Conversación reabierta por ${profile.full_name || 'Asesor'}]`,
  });

  return { success: true };
}


/**
 * Genera o actualiza el resumen ejecutivo del chat con IA (3 puntos clave).
 * Se persiste en contacts.custom_fields.ai_summary para consulta instantánea.
 */
export async function generateContactAiSummary(contactId: string) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) throw new Error('Organización no encontrada');

  const { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .select('id, organization_id, custom_fields')
    .eq('id', contactId)
    .eq('organization_id', profile.organization_id)
    .single();

  if (!contact) throw new Error('Contacto no encontrado');

  // Obtener los últimos 30 mensajes para contexto exhaustivo
  const { data: rawMessages } = await (supabaseAdmin.from('messages') as any)
    .select('sender_type, content, created_at')
    .eq('contact_id', contactId)
    .in('sender_type', ['lead', 'ai', 'agent_manual'])
    .order('created_at', { ascending: false })
    .limit(30);

  const chronological = rawMessages ? [...rawMessages].reverse() : [];
  const summary = await OpenAIService.generateDealSummary(chronological);

  const summaryData = {
    ...summary,
    generated_at: new Date().toISOString(),
  };

  const currentCustom = (contact.custom_fields as Record<string, any>) || {};
  await (supabaseAdmin.from('contacts') as any)
    .update({
      custom_fields: {
        ...currentCustom,
        ai_summary: summaryData,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId);

  revalidatePath(`/inbox/${contactId}`);
  return summaryData;
}

/**
 * Marca un contacto como ya intentado para reactivación o descartado.
 * Blindaje Anti-Spam estricto: evita que se envíe más de 1 recordatorio comercial al mismo cliente.
 */
export async function markContactReactivationDismissed(contactId: string) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) throw new Error('Organización no encontrada');

  const { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .select('id, custom_fields')
    .eq('id', contactId)
    .eq('organization_id', profile.organization_id)
    .maybeSingle();

  if (!contact) throw new Error('Contacto no encontrado en la organización');

  const currentCustom = (contact.custom_fields as Record<string, any>) || {};
  await (supabaseAdmin.from('contacts') as any)
    .update({
      custom_fields: {
        ...currentCustom,
        reactivation_attempted: true,
        reactivation_attempted_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId)
    .eq('organization_id', profile.organization_id);

  revalidatePath(`/inbox/${contactId}`);
  return { success: true };
}

/**
 * Copiloto IA para Asesores: genera un borrador inteligente para responder al cliente.
 */
export async function generateDraftAiReply(contactId: string): Promise<{ draft: string }> {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id;
  if (!orgId) throw new Error('Organización no encontrada');

  const { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .select('id, name, phone')
    .eq('id', contactId)
    .eq('organization_id', orgId)
    .single();

  if (!contact) throw new Error('Contacto no encontrado');

  const { data: organization } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name, structured_prompt_data, system_prompt, ai_provider')
    .eq('id', orgId)
    .single();

  const { data: rawMessages } = await (supabaseAdmin.from('messages') as any)
    .select('id, sender_type, content, created_at')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(8);

  const history = (rawMessages || []).reverse();
  if (history.length === 0) {
    return { draft: `¡Hola ${contact.name || ''}! ¿Cómo podemos apoyarte el día de hoy?` };
  }

  const draft = await OpenAIService.generateDraftCopilotReply({
    organizationId: orgId,
    contactId,
    leadName: contact.name,
    history,
    organization,
  });

  return { draft };
}

/**
 * Genera sugerencias de reactivación inteligentes con IA personalizadas
 * según el interés del prospecto y lo que consultó en el chat.
 */
export async function generateReactivationAiSuggestion(contactId: string): Promise<{
  success: boolean;
  detectedInterest?: string;
  suggestedMessage?: string;
  alternativeHook?: string;
  error?: string;
}> {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id;
  if (!orgId) throw new Error('Organización no encontrada');

  const { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .select('id, name, phone, pipeline_stage, custom_fields')
    .eq('id', contactId)
    .eq('organization_id', orgId)
    .single();

  if (!contact) throw new Error('Contacto no encontrado');

  const { data: organization } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name, structured_prompt_data, system_prompt, ai_provider')
    .eq('id', orgId)
    .single();

  const { data: rawMessages } = await (supabaseAdmin.from('messages') as any)
    .select('id, sender_type, content, created_at')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(12);

  const history = (rawMessages || []).reverse();

  try {
    const result = await OpenAIService.generateReactivationHook({
      organizationId: orgId,
      contactId,
      leadName: contact.name,
      history,
      organization,
      contactCustomFields: contact.custom_fields,
    });

    return {
      success: true,
      detectedInterest: result.detectedInterest,
      suggestedMessage: result.suggestedMessage,
      alternativeHook: result.alternativeHook,
    };
  } catch (err: any) {
    console.error('[GENERATE REACTIVATION AI ERROR]', err);
    return {
      success: false,
      error: err?.message || 'Error al generar sugerencia de reactivación',
    };
  }
}

/**
 * Registra feedback (👍 / 👎) o una corrección sobre una respuesta de la IA.
 * Si es negativo o incluye respuesta correcta, crea una duda detectada en ai_knowledge_gaps.
 */
export async function submitAiFeedback(params: {
  messageId: string;
  contactId: string;
  feedback: 'helpful' | 'needs_improvement';
  feedbackText?: string;
  correctAnswer?: string;
}): Promise<{ success: boolean }> {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, full_name')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id;
  if (!orgId) throw new Error('Organización no encontrada');

  const { messageId, contactId, feedback, feedbackText, correctAnswer } = params;

  // 1. Validar pertenencia del contacto a la organización (Anti-IDOR)
  const { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .select('id')
    .eq('id', contactId)
    .eq('organization_id', orgId)
    .single();

  if (!contact) throw new Error('Contacto no encontrado o acceso denegado');

  // 2. Obtener el mensaje evaluado
  const { data: msg } = await (supabaseAdmin.from('messages') as any)
    .select('id, content, reactions')
    .eq('id', messageId)
    .eq('contact_id', contactId)
    .single();

  if (!msg) throw new Error('Mensaje no encontrado');

  // 2. Guardar feedback en reactions del mensaje
  const currentReactions = (msg.reactions as Record<string, any>) || {};
  await (supabaseAdmin.from('messages') as any)
    .update({
      reactions: {
        ...currentReactions,
        ai_feedback: feedback,
        feedback_by: profile.full_name || user.email,
        feedback_at: new Date().toISOString(),
      },
    })
    .eq('id', messageId);

  // 3. Si necesita mejora o incluye corrección, crear entrada en ai_knowledge_gaps
  if (feedback === 'needs_improvement' || correctAnswer) {
    const { data: previousLeadMsgs } = await (supabaseAdmin.from('messages') as any)
      .select('content')
      .eq('contact_id', contactId)
      .eq('sender_type', 'lead')
      .order('created_at', { ascending: false })
      .limit(1);

    const questionText = previousLeadMsgs?.[0]?.content || 'Duda detectada en conversación';

    await (supabaseAdmin.from('ai_knowledge_gaps') as any).insert({
      organization_id: orgId,
      contact_id: contactId,
      question_text: questionText.slice(0, 500),
      reason: feedbackText ? `[Corrección de ${profile.full_name || 'Asesor'}]: ${feedbackText}` : 'Marcado por asesor como respuesta errada de la IA',
      suggested_answer: correctAnswer || null,
      status: 'pending',
      ai_category: 'correccion_chat',
      occurrences: 1,
    });
  }

  return { success: true };
}

export interface BatchApologyOptions {
  contactIds: string[];
  messageTemplate: string;
  leaveAiActive?: boolean;
  assignToMe?: boolean;
}

export interface BatchApologyResult {
  total: number;
  successful: number;
  failed: number;
  errors: string[];
}

/**
 * ⚡ Acción Masiva de Rescate por Demora:
 * Envía automáticamente un mensaje de disculpa y reactivación personalizada a múltiples clientes,
 * respetando las políticas de WhatsApp (Meta 24h / Evolution), límites anti-ban y actualizando
 * el estado de la bandeja en tiempo real a 'waiting_customer' (despejando el SLA timer).
 */
export async function sendBatchApologyMessage(options: BatchApologyOptions): Promise<BatchApologyResult> {
  const { contactIds, messageTemplate, leaveAiActive = false, assignToMe = true } = options;
  if (!contactIds || contactIds.length === 0) {
    throw new Error('No se seleccionó ningún contacto.');
  }
  if (!messageTemplate || !messageTemplate.trim()) {
    throw new Error('El mensaje de disculpa no puede estar vacío.');
  }

  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, full_name')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id;
  if (!orgId) throw new Error('Perfil u organización no encontrada');

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, evolution_api_url, evolution_api_key, evolution_instance_name, evolution_anti_ban_mode, evolution_max_outbound_per_hour, instagram_account_id, instagram_access_token')
    .eq('id', orgId)
    .single();

  if (!org) throw new Error('Organización no encontrada.');

  // Obtener contactos seleccionados validados por organización (Anti-IDOR)
  const { data: contacts, error: contactsError } = await (supabaseAdmin.from('contacts') as any)
    .select('id, name, phone, channel, instagram_id, last_interaction_at, custom_fields')
    .eq('organization_id', orgId)
    .in('id', contactIds.slice(0, 50)); // Tope de 50 por lote seguro

  if (contactsError || !contacts || contacts.length === 0) {
    throw new Error('No se encontraron contactos válidos para procesar.');
  }

  const advisorFirstName = (profile.full_name || 'Asesor').trim().split(' ')[0];
  const orgName = (org.name || 'nuestro equipo').trim();

  const result: BatchApologyResult = {
    total: contacts.length,
    successful: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    try {
      // 1. Personalizar mensaje con variables dinámicas
      const rawName = (contact.name || '').trim();
      const isPhoneOnly = /^[+0-9\s-]+$/.test(rawName) || rawName.startsWith('+');
      const contactFirstName = rawName && !isPhoneOnly ? rawName.split(' ')[0] : '';
      const fallbackGreeting = contactFirstName || 'estimado cliente';

      let personalizedMessage = messageTemplate
        .replace(/\{\{nombre\}\}/gi, contactFirstName || '')
        .replace(/\{\{nombre_completo\}\}/gi, rawName || fallbackGreeting)
        .replace(/\{\{asesor\}\}/gi, advisorFirstName)
        .replace(/\{\{empresa\}\}/gi, orgName)
        .replace(/¡Hola\s+!/gi, '¡Hola!')
        .replace(/Hola\s+,/gi, 'Hola,')
        .replace(/\s{2,}/g, ' ')
        .trim();

      const isInstagram = contact.channel === 'instagram' || Boolean(contact.instagram_id);
      let metaMessageId: string | null = null;

      if (isInstagram) {
        if (!org.instagram_account_id || !org.instagram_access_token) {
          throw new Error('Credenciales de Instagram no configuradas.');
        }
        const decryptedToken = decryptSecret(org.instagram_access_token);
        const recipientIgId = contact.instagram_id || contact.phone.replace(/^ig_/, '');
        metaMessageId = await InstagramService.sendDirectMessage({
          instagramAccountId: org.instagram_account_id,
          accessToken: decryptedToken,
          recipientId: recipientIgId,
          text: personalizedMessage,
        });
      } else {
        const is24hOpen = isWithin24HourWindow(contact.last_interaction_at);
        const provider = org.whatsapp_provider || 'meta';
        const targetRecipient = contact.custom_fields?.remote_jid || contact.phone;

        if (provider === 'meta' && !is24hOpen) {
          // Ventana de 24h cerrada en Meta Cloud API -> Despachar plantilla oficial
          metaMessageId = await MessagingService.sendTemplateMessage({
            organization: org,
            to: targetRecipient,
            templateKey: 'reactivacion_lead',
            templateName: 'reactivacion_lead',
            languageCode: 'es',
          });
          personalizedMessage = `[Plantilla oficial de rescate por demora: Reactivación]`;
        } else {
          // Evolution API o ventana de Meta abierta
          metaMessageId = await MessagingService.sendTextMessage({
            organization: org,
            to: targetRecipient,
            body: personalizedMessage,
            simulateTyping: false,
            isColdOutbound: false,
          });
        }
      }

      // 2. Persistir mensaje en messages con auditoría
      await (supabaseAdmin.from('messages') as any).insert({
        contact_id: contact.id,
        sender_type: 'agent_manual',
        content: personalizedMessage,
        meta_message_id: metaMessageId || null,
        channel: isInstagram ? 'instagram' : 'whatsapp',
        status: 'sent',
      });

      // 3. Actualizar estado en contacts: limpia espera, reactiva/pausa IA y asigna
      const nowIso = new Date().toISOString();
      const lastMessagePayload = {
        text: personalizedMessage,
        sender_type: 'agent_manual',
        created_at: nowIso,
      };

      const currentCustom = (contact.custom_fields as Record<string, any>) || {};
      const updatedCustom: Record<string, any> = {
        ...currentCustom,
        last_message: lastMessagePayload,
      };
      if (updatedCustom.active_reminder?.reminderType === 'reactivation') {
        delete updatedCustom.active_reminder;
      }

      const updatePayload: Record<string, any> = {
        last_message: lastMessagePayload,
        custom_fields: updatedCustom,
        last_message_sender: 'agent_manual',
        last_message_preview: personalizedMessage.slice(0, 160),
        waiting_since: null,
        conversation_status: 'waiting_customer',
        unread_count: 0,
        last_interaction_at: nowIso,
        updated_at: nowIso,
        is_ai_active: leaveAiActive ? true : false,
      };

      if (assignToMe) {
        updatePayload.assigned_to = user.id;
      }

      await (supabaseAdmin.from('contacts') as any)
        .update(updatePayload)
        .eq('id', contact.id);

      result.successful++;

      // 🛡️ Blindaje Anti-Ban: Pausa segura de 500ms entre envíos
      if (i < contacts.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (err: any) {
      result.failed++;
      result.errors.push(`Error con ${contact.name || contact.phone}: ${err?.message || 'Fallo desconocido'}`);
    }
  }

  revalidatePath('/inbox');
  return result;
}

/**
 * Reintenta el envío de un mensaje que quedó en estado 'failed'.
 */
export async function retryFailedMessage(messageId: string) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const { data: msg, error: msgError } = await (supabaseAdmin.from('messages') as any)
    .select('id, contact_id, content, sender_type, channel')
    .eq('id', messageId)
    .single();

  if (msgError || !msg) throw new Error('Mensaje no encontrado');

  return await sendAgentMessage(msg.contact_id, msg.content, undefined, msg.id);
}



