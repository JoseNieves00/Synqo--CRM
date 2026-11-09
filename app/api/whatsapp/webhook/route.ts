import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { verifyMetaSignature } from '@/lib/security/verify-webhook';
import { decryptSecret } from '@/lib/security/encryption';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { sanitizeLeadMessage } from '@/lib/security/sanitize';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { WhatsAppService } from '@/services/whatsapp.service';
import { OpenAIService } from '@/services/openai.service';
import { AssignmentService } from '@/services/assignment.service';
import { NotificationService } from '@/lib/notifications/resend';
import { formatImageMessageContent, formatVideoMessageContent, formatAudioMessageContent, isPaymentReceiptHint } from '@/lib/media/format';
import { uploadIncomingChatMedia } from '@/lib/media/storage';
import { InboundCoreService, InboundPayload } from '@/services/inbound-core.service';

/**
 * 1. GET: Handshake de verificación inicial de Meta WhatsApp Webhook.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!expectedToken) {
    console.error('[WHATSAPP WEBHOOK] META_WEBHOOK_VERIFY_TOKEN no está configurada.');
    return new NextResponse('Configuration error: META_WEBHOOK_VERIFY_TOKEN not set', { status: 500 });
  }

  if (mode === 'subscribe' && token === expectedToken && challenge) {
    console.log('[WHATSAPP WEBHOOK] Handshake completado exitosamente con Meta.');
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  console.warn('[WHATSAPP WEBHOOK] Falló intento de handshake. Token no coincide.');
  return new NextResponse('Forbidden', { status: 403 });
}

/**
 * 2. POST: Ingesta de eventos, mensajes y estados de WhatsApp.
 * - Validación criptográfica HMAC-SHA256 con timingSafeEqual.
 * - Blindaje de Rentabilidad (corte de IA si subscription_status no es active/trialing).
 * - Procesamiento asíncrono con waitUntil para responder HTTP 200 a Meta en < 500 ms.
 */
export async function POST(request: NextRequest) {
  // A. Obtener el cuerpo crudo de la petición para verificación HMAC intacta
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Bad Request: Invalid JSON', { status: 400 });
  }

  const entry = payload?.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  if (!value) {
    return NextResponse.json({ status: 'ignored_empty_value' }, { status: 200 });
  }

  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId) {
    return NextResponse.json({ error: 'Missing phoneNumberId in metadata' }, { status: 400 });
  }

  // B. Identificar la Organización dueña del WABA Phone Number ID
  const { data: organization, error: orgError } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name, subscription_status, is_active, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, whatsapp_app_secret, evolution_api_url, evolution_api_key, evolution_instance_name, evolution_anti_ban_mode, system_prompt, handoff_mode, after_hours_message, business_hours, ai_provider, enabled_modules, appointment_settings')
    .eq('whatsapp_phone_number_id', phoneNumberId)
    .single();

  if (orgError || !organization) {
    console.error(`[ORG NOT FOUND] No hay organización vinculada al phone_number_id: ${phoneNumberId}`);
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  // C. Verificación Criptográfica Multi-tenant (App Secret por Organización con fallback a env global)
  // 🛡️ Fail-closed estricto: responder 401 si no hay secreto configurado o si la firma es inválida
  let secretToVerify = process.env.META_APP_SECRET || '';
  if (organization.whatsapp_app_secret) {
    try {
      secretToVerify = decryptSecret(organization.whatsapp_app_secret);
    } catch (err) {
      console.warn(`[WEBHOOK] Error desencriptando whatsapp_app_secret para org "${organization.name}":`, err);
    }
  }

  if (!secretToVerify) {
    console.error(`[SECURITY ALERT] Webhook de WhatsApp rechazado: ni la organización "${organization.name}" ni el servidor tienen META_APP_SECRET configurado.`);
    return new NextResponse('Unauthorized: App Secret not configured', { status: 401 });
  }

  if (!signature) {
    console.error(`[SECURITY ALERT] Webhook de WhatsApp rechazado: falta cabecera x-hub-signature-256 para org "${organization.name}".`);
    return new NextResponse('Unauthorized: Missing HMAC signature', { status: 401 });
  }

  const isValidSignature = verifyMetaSignature(rawBody, signature, secretToVerify);
  if (!isValidSignature) {
    console.error(`[SECURITY ALERT] Firma HMAC inválida rechazada para org "${organization.name}".`);
    return new NextResponse('Unauthorized: Invalid HMAC signature', { status: 401 });
  }

  // D. Capturar y persistir notificaciones de estado (sent, delivered, read) para ticks de entrega en vivo
  // 🛡️ Monotónico: se ejecuta SOLO tras validar HMAC y no permite retroceder (ej. read -> delivered)
  if (value.statuses && (!value.messages || value.messages.length === 0)) {
    const STATUS_RANK: Record<string, number> = {
      sending: 1,
      sent: 2,
      delivered: 3,
      read: 4,
      failed: 5,
    };

    try {
      for (const st of value.statuses) {
        const metaId = st.id;
        const newStatus = st.status; // 'sent' | 'delivered' | 'read' | 'failed'
        if (metaId && newStatus) {
          const { data: existingMsg } = await (supabaseAdmin.from('messages') as any)
            .select('id, status')
            .eq('meta_message_id', metaId)
            .maybeSingle();

          if (existingMsg) {
            const currentRank = STATUS_RANK[existingMsg.status] || 0;
            const newRank = STATUS_RANK[newStatus] || 0;
            if (newRank > currentRank || newStatus === 'failed') {
              await (supabaseAdmin.from('messages') as any)
                .update({ status: newStatus })
                .eq('id', existingMsg.id);
            }
          }
        }
      }
    } catch (statusErr: any) {
      console.warn('[WHATSAPP STATUS UPDATE WARN]', statusErr);
    }
    return NextResponse.json({ status: 'status_update_acknowledged' }, { status: 200 });
  }

  const incomingMessage = value.messages?.[0];
  if (!incomingMessage) {
    return NextResponse.json({ status: 'no_incoming_message' }, { status: 200 });
  }

  // E. Filtrar tipos de mensajes
  const msgType = incomingMessage.type;
  const supportedTypes = ['text', 'audio', 'button', 'interactive', 'image', 'document', 'location', 'video', 'sticker', 'contacts', 'reaction'];
  if (!supportedTypes.includes(msgType)) {
    return NextResponse.json({ status: 'unsupported_message_type_ignored' }, { status: 200 });
  }

  const metaMessageId = incomingMessage.id;
  const leadPhone = incomingMessage.from;
  const leadName = value.contacts?.[0]?.profile?.name || 'Lead WhatsApp';

  if (!leadPhone) {
    return NextResponse.json({ error: 'Missing leadPhone' }, { status: 400 });
  }

  try {
    // F. Control de Tasa (Rate Limiting) y Prevención de Wallet Exhaustion (ejecutado SOLO tras validar firma)
    const rateLimitResult = await checkRateLimit(`phone:${leadPhone}`);
    const isRateLimited = !rateLimitResult.success;
    if (isRateLimited) {
      console.warn(`[RATE LIMIT EXCEEDED] Remitente ${leadPhone} excedió el límite de 15 msgs/min. Se guardará sin invocar a la IA.`);
    }

    const orgId = organization.id;

    if (msgType === 'reaction') {
      const reactionEmoji = incomingMessage.reaction?.emoji;
      const targetMsgId = incomingMessage.reaction?.message_id;
      if (reactionEmoji && targetMsgId) {
        await InboundCoreService.processInbound({
          organization,
          channel: 'whatsapp_meta',
          channelMessageId: metaMessageId,
          senderId: leadPhone,
          senderName: leadName,
          rawContent: reactionEmoji,
          reactionEmoji,
          replyToChannelMessageId: targetMsgId,
        });
      }
      return NextResponse.json({ status: 'reaction_acknowledged' }, { status: 200 });
    }

    // F2. Procesar contenido del mensaje: Texto, Botones, Interactivo, Multimedia o Notas de Voz
    let rawContent = '';
    const referral = incomingMessage.referral;
    const refTitle = (referral?.headline || referral?.body || '').trim();
    const referralPrefix = refTitle ? `[Anuncio/Publicación de Instagram: "${refTitle}"] ` : '';

    if (msgType === 'text') {
      rawContent = `${referralPrefix}${incomingMessage.text?.body || ''}`.trim();
    } else if (msgType === 'button') {
      // Clic en botón de plantilla rápida de Meta
      rawContent = incomingMessage.button?.text || incomingMessage.button?.payload || '[Botón presionado]';
    } else if (msgType === 'interactive') {
      // Clic en lista o botón interactivo
      const interactive = incomingMessage.interactive;
      if (interactive?.type === 'button_reply') {
        rawContent = interactive.button_reply?.title || '[Botón seleccionado]';
      } else if (interactive?.type === 'list_reply') {
        rawContent = interactive.list_reply?.title || '[Opción de lista seleccionada]';
      } else {
        rawContent = '[Respuesta interactiva]';
      }
    } else if (msgType === 'image') {
      const imageId = incomingMessage.image?.id;
      const caption = (incomingMessage.image?.caption || '').trim();
      let imageUrl: string | null = null;

      if (imageId && organization.whatsapp_access_token) {
        try {
          const decryptedToken = decryptSecret(organization.whatsapp_access_token);
          const media = await WhatsAppService.downloadMedia(imageId, decryptedToken);
          imageUrl = await uploadIncomingChatMedia({
            buffer: media.buffer,
            mimeType: media.mimeType || 'image/jpeg',
            organizationId: orgId,
            contactId: leadPhone || 'incoming',
          });
        } catch (imgErr: any) {
          console.error('[WHATSAPP IMAGE DOWNLOAD ERROR]', imgErr);
        }
      }

      if (imageUrl) {
        rawContent = formatImageMessageContent(imageUrl, caption);
      } else {
        rawContent = caption ? `📷 [Foto]: ${caption}` : '📷 [Foto recibida]';
      }
    } else if (msgType === 'document') {
      const filename = incomingMessage.document?.filename || 'Archivo';
      const caption = incomingMessage.document?.caption;
      rawContent = caption ? `📄 [Documento: ${filename}]: ${caption}` : `📄 [Documento recibido: ${filename}]`;
    } else if (msgType === 'location') {
      const loc = incomingMessage.location;
      rawContent = loc
        ? `📍 [Ubicación compartida: lat ${loc.latitude}, lng ${loc.longitude}${loc.name ? ` (${loc.name})` : ''}]`
        : '📍 [Ubicación compartida]';
    } else if (msgType === 'audio') {
      const audioId = incomingMessage.audio?.id;
      if (audioId && organization.whatsapp_access_token) {
        try {
          const decryptedToken = decryptSecret(organization.whatsapp_access_token);
          const media = await WhatsAppService.downloadMedia(audioId, decryptedToken);

          let audioUrl: string | null = null;
          try {
            audioUrl = await uploadIncomingChatMedia({
              buffer: media.buffer,
              mimeType: media.mimeType || 'audio/ogg; codecs=opus',
              organizationId: organization.id,
              contactId: leadPhone || 'incoming',
            });
          } catch (uploadErr) {
            console.warn('[WHATSAPP AUDIO UPLOAD WARN]', uploadErr);
          }

          let transcription = '';
          try {
            transcription = await OpenAIService.transcribeAudio(media.buffer, media.mimeType);
          } catch (transcribeErr) {
            console.warn('[WHATSAPP AUDIO TRANSCRIBE WARN]', transcribeErr);
          }

          if (audioUrl) {
            rawContent = formatAudioMessageContent(audioUrl, transcription || undefined);
          } else if (transcription) {
            rawContent = `🎤 [Nota de voz]: "${transcription}"`;
          } else {
            rawContent = '🎤 [Nota de voz inaudible]';
          }
        } catch (audioErr: any) {
          console.error('[WHATSAPP AUDIO TRANSCRIPTION ERROR]', audioErr);
          rawContent = '🎤 [Nota de voz no reproducible]';
        }
      } else {
        rawContent = '🎤 [Nota de voz inaudible]';
      }
    } else if (msgType === 'video') {
      const videoId = incomingMessage.video?.id;
      const caption = incomingMessage.video?.caption;
      let videoUrl: string | null = null;
      if (videoId && organization.whatsapp_access_token) {
        try {
          const decryptedToken = decryptSecret(organization.whatsapp_access_token);
          const media = await WhatsAppService.downloadMedia(videoId, decryptedToken);
          videoUrl = await uploadIncomingChatMedia({
            buffer: media.buffer,
            mimeType: media.mimeType || 'video/mp4',
            organizationId: organization.id,
            contactId: leadPhone || 'incoming',
          });
        } catch (vidErr: any) {
          console.error('[WHATSAPP VIDEO DOWNLOAD ERROR]', vidErr);
        }
      }
      rawContent = videoUrl
        ? formatVideoMessageContent(videoUrl, caption)
        : (caption ? `📹 [Video]: ${caption}` : '📹 [Video recibido]');
    } else if (msgType === 'sticker') {
      rawContent = '🏷️ [Sticker recibido]';
    } else if (msgType === 'contacts') {
      const cName = incomingMessage.contacts?.[0]?.name?.formatted_name || 'Contacto';
      const cPhone = incomingMessage.contacts?.[0]?.phones?.[0]?.phone || '';
      rawContent = `👤 [Tarjeta de contacto: ${cName}${cPhone ? ` (${cPhone})` : ''}]`;
    }

    const isPaymentReceipt = msgType === 'image' && isPaymentReceiptHint(incomingMessage.image?.caption || '');

    const inboundPayload: InboundPayload = {
      organization,
      channel: 'whatsapp_meta',
      channelMessageId: metaMessageId,
      senderId: leadPhone,
      senderName: leadName,
      rawContent,
      replyToChannelMessageId: incomingMessage.context?.id || null,
      isPaymentReceipt,
    };

    const result = await InboundCoreService.processInbound(inboundPayload);

    if (result.status === 'duplicate_ignored') {
      return NextResponse.json({ status: 'duplicate_message_ignored' }, { status: 200 });
    }

    // Persistir mensajes adicionales si Meta los envió en el mismo webhook
    if (value.messages && value.messages.length > 1) {
      for (let mIdx = 1; mIdx < value.messages.length; mIdx++) {
        const extraMsg = value.messages[mIdx];
        if (extraMsg && extraMsg.id !== metaMessageId) {
          let extraContent = '';
          if (extraMsg.type === 'text') extraContent = extraMsg.text?.body || '';
          else if (extraMsg.type === 'image') extraContent = extraMsg.image?.caption ? `📷 [Foto]: ${extraMsg.image.caption}` : '📷 [Foto recibida]';
          else if (extraMsg.type === 'document') extraContent = `📄 [Documento: ${extraMsg.document?.filename || 'Archivo'}]`;
          else if (extraMsg.type === 'video') extraContent = '📹 [Video recibido]';
          else if (extraMsg.type === 'sticker') extraContent = '🏷️ [Sticker recibido]';
          else if (extraMsg.type === 'location') extraContent = '📍 [Ubicación compartida]';
          else extraContent = `[Mensaje ${extraMsg.type}]`;

          if (extraContent.trim()) {
            await InboundCoreService.processInbound({
              organization,
              channel: 'whatsapp_meta',
              channelMessageId: extraMsg.id,
              senderId: leadPhone,
              senderName: leadName,
              rawContent: extraContent,
            });
          }
        }
      }
    }

    // Ejecución asíncrona de IA en segundo plano
    if (result.status === 'success' && result.contactId && result.messageId && !isRateLimited) {
      // Marcar como leído en WhatsApp oficial (doble tilde azul)
      try {
        const decryptedWhatsAppToken = decryptSecret(organization.whatsapp_access_token || '');
        if (decryptedWhatsAppToken) {
          WhatsAppService.markAsRead(phoneNumberId, decryptedWhatsAppToken, metaMessageId).catch(() => {});
        }
      } catch {}

      waitUntil(
        InboundCoreService.runAiWorker({
          payload: inboundPayload,
          contactId: result.contactId,
          insertedMessageId: result.messageId,
        })
      );
    }

    return NextResponse.json({ status: 'success' }, { status: 200 });
  } catch (error: any) {
    console.error('[WEBHOOK ROUTE ERROR]', error);
    return NextResponse.json({ error: error?.message || 'Internal processing error' }, { status: 500 });
  }
}
