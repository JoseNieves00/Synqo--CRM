import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { sanitizeLeadMessage } from '@/lib/security/sanitize';
import { verifyEvolutionWebhook } from '@/lib/security/verify-webhook';
import { decryptSecret } from '@/lib/security/encryption';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { MessagingService } from '@/services/messaging.service';
import { EvolutionService } from '@/services/evolution.service';
import { OpenAIService } from '@/services/openai.service';
import { AssignmentService } from '@/services/assignment.service';
import { NotificationService } from '@/lib/notifications/resend';
import { formatImageMessageContent, formatVideoMessageContent, formatAudioMessageContent, isPaymentReceiptHint } from '@/lib/media/format';
import { uploadIncomingChatMedia } from '@/lib/media/storage';
import { resolveInboundThumbnailMessage } from '@/lib/media/inbound-thumbnail';
import { InboundCoreService, InboundPayload } from '@/services/inbound-core.service';
import {
  HumanOutboundService,
  unwrapEvolutionOutboundMessage,
} from '@/services/human-outbound.service';
import { PlatformAlertService } from '@/services/platform-alert.service';

export const maxDuration = 60;

/**
 * 1. GET: Health-check y prueba de conectividad de webhook para Evolution API.
 */
export async function GET() {
  return new NextResponse('Evolution API Webhook Receptor Activo - Synqo CRM', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

/**
 * 2. POST: Ingesta de eventos, mensajes y estados de Evolution API v2 (WhatsApp VPS).
 */
export async function POST(request: NextRequest) {
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return new NextResponse('Bad Request: Invalid JSON', { status: 400 });
  }

  // 1. Obtener el instanceName del cuerpo, query string o headers
  const { searchParams } = new URL(request.url);
  const rawInstance =
    payload.instance ||
    payload.instanceName ||
    payload.instance_name ||
    searchParams.get('instance') ||
    searchParams.get('instanceName') ||
    searchParams.get('instance_name') ||
    request.headers.get('x-instance-name') ||
    request.headers.get('x-instance');

  if (!rawInstance || typeof rawInstance !== 'string') {
    console.warn('[EVOLUTION WEBHOOK] Petición rechazada: falta instanceName');
    return NextResponse.json({ error: 'Missing instanceName' }, { status: 400 });
  }

  const cleanInstance = EvolutionService.sanitizeInstanceName(rawInstance);

  // 2. Localizar la organización en Supabase
  const { data: organization } = await (supabaseAdmin.from('organizations') as any)
    .select(
      'id, name, subscription_status, is_active, whatsapp_provider, evolution_api_url, evolution_api_key, evolution_instance_name, evolution_status, evolution_anti_ban_mode, evolution_max_outbound_per_hour, system_prompt, structured_prompt_data, handoff_mode, after_hours_message, business_hours, ai_provider, enabled_modules, appointment_settings'
    )
    .eq('evolution_instance_name', cleanInstance)
    .maybeSingle();

  if (!organization) {
    console.warn(`[EVOLUTION WEBHOOK] No se encontró organización para instanceName: ${cleanInstance}`);
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  // 🛡️ VERIFICACIÓN CRIPTOGRÁFICA DE WEBHOOK (Anti-Suplantación de Evolution API)
  const providedSecret =
    searchParams.get('secret') ||
    request.headers.get('authorization') ||
    request.headers.get('x-webhook-secret');

  const providedApiKey =
    request.headers.get('apikey') ||
    request.headers.get('x-api-key') ||
    payload.apikey;

  const decryptedApiKey = organization.evolution_api_key
    ? decryptSecret(organization.evolution_api_key)
    : null;

  const isAuthorized = verifyEvolutionWebhook({
    instanceName: organization.evolution_instance_name,
    providedSecret,
    providedApiKey,
    decryptedApiKey,
  });

  if (!isAuthorized) {
    console.error(`[SECURITY ALERT] Webhook Evolution API rechazado: firma HMAC o API Key no coinciden para org "${organization.name}".`);
    return new NextResponse('Unauthorized: Invalid Evolution webhook signature or key', { status: 401 });
  }

  const orgId = organization.id;
  const event = String(payload.event || '').toLowerCase();

  // 3. Manejo de Eventos de Estado (Conexión / Desconexión)
  // Evolution API v2 envía 'connection.update'
  const isConnectionEvent =
    event === 'connection.update' ||
    event === 'connection_update' ||
    payload.type === 'connected';

  if (isConnectionEvent) {
    const connData = payload.data || {};
    const state = String(connData.state || '').toLowerCase();
    const phone = connData.phone || connData.wuid?.replace(/[^0-9]/g, '') || null;

    if (state === 'open') {
      console.log(`[EVOLUTION STATUS] Instancia "${cleanInstance}" CONECTADA exitosamente para org "${organization.name}".`);
      await (supabaseAdmin.from('organizations') as any)
        .update({
          evolution_status: 'connected',
          evolution_phone_connected: phone,
          evolution_last_heartbeat: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', orgId);

      return NextResponse.json({ status: 'connection_status_updated_open' }, { status: 200 });
    }

    if (state === 'close') {
      console.warn(`[EVOLUTION STATUS ALERTA] Instancia "${cleanInstance}" DESCONECTADA para org "${organization.name}".`);
      await (supabaseAdmin.from('organizations') as any)
        .update({
          evolution_status: 'disconnected',
          evolution_last_heartbeat: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', orgId);

      // Notificación inmediata al administrador por correo (Resend)
      const { data: adminProfile } = await (supabaseAdmin.from('profiles') as any)
        .select('email')
        .eq('organization_id', orgId)
        .eq('role', 'admin')
        .maybeSingle();

      if (adminProfile?.email) {
        waitUntil(
          NotificationService.sendChannelDisconnectedAlert({
            adminEmail: adminProfile.email,
            companyName: organization.name || 'Empresa Synqo',
            provider: 'evolution',
            reason: 'El celular comercial perdió conexión en el VPS, se apagó o WhatsApp cerró la sesión de la instancia.',
          })
        );
      }

      waitUntil(
        PlatformAlertService.notifySuperAdminEvent({
          type: 'channel_disconnected',
          orgId,
          companyName: organization.name || 'Empresa Synqo',
          title: 'WhatsApp Evolution Desconectado',
          details: `Instancia "${cleanInstance}" pasó a estado close (sesión cerrada o sin conexión).`,
          dedupeWindowMinutes: 30,
        })
      );

      return NextResponse.json({ status: 'disconnection_status_updated_close' }, { status: 200 });
    }

    return NextResponse.json({ status: 'connection_event_processed' }, { status: 200 });
  }

  // 3.5 Manejo de Eventos de Actualización de Estados de Entrega (messages.update)
  const isMessageUpdate = event === 'messages.update' || event === 'messages_update';
  if (isMessageUpdate) {
    try {
      const updates = Array.isArray(payload.data) ? payload.data : [payload.data];
      for (const item of updates) {
        const metaId = item?.key?.id || item?.id;
        const rawStatus = item?.update?.status ?? item?.status;
        let mappedStatus: string | null = null;
        if (rawStatus === 3 || rawStatus === 'DELIVERY_ACK' || rawStatus === 'delivered') {
          mappedStatus = 'delivered';
        } else if (rawStatus === 4 || rawStatus === 5 || rawStatus === 'READ' || rawStatus === 'read') {
          mappedStatus = 'read';
        }
        if (metaId && mappedStatus) {
          let query = (supabaseAdmin.from('messages') as any)
            .update({ status: mappedStatus })
            .eq('meta_message_id', metaId);

          // Progresión monotónica: 'delivered' nunca sobreescribe 'read'
          if (mappedStatus === 'delivered') {
            query = query.neq('status', 'read');
          }

          await query;
        }
      }
    } catch (err: any) {
      console.warn('[EVOLUTION STATUS UPDATE WARN]', err);
    }
    return NextResponse.json({ status: 'message_update_processed' }, { status: 200 });
  }

  // 4. Manejo de Eventos de Mensajes (messages.upsert)
  const isMessageUpsert =
    event === 'messages.upsert' ||
    event === 'messages_upsert' ||
    (!event && Boolean(payload.data?.message && payload.data?.key?.id));

  if (!isMessageUpsert) {
    return NextResponse.json({ status: 'ignored_unhandled_event' }, { status: 200 });
  }

  const messageData = payload.data || {};
  const messageKey = messageData.key || {};
  const remoteJid = String(messageKey.remoteJid || '');

  // Ignorar estados de WhatsApp y mensajes de grupos
  if (
    remoteJid.includes('status@broadcast') ||
    remoteJid.endsWith('@g.us') ||
    messageKey.participant
  ) {
    return NextResponse.json({ status: 'group_or_status_ignored' }, { status: 200 });
  }

  const messageId = messageKey.id;
  const rawRemoteJid = remoteJid || '';
  const isLid = rawRemoteJid.endsWith('@lid');

  // Baileys y Evolution a veces proveen el número telefónico real en senderPn, participantPn o remoteJidAlt
  const realPhoneJid = (
    messageData.senderPn ||
    messageData.remoteJidAlt ||
    messageKey.participantPn ||
    messageData.key?.participantPn ||
    ''
  ).replace(/@s\.whatsapp\.net|@c\.us|@lid/g, '').replace(/[^\d]/g, '');

  const cleanPhone = realPhoneJid || rawRemoteJid.replace(/@s\.whatsapp\.net|@c\.us|@lid/g, '').replace(/[^\d]/g, '');

  if (!cleanPhone || !messageId) {
    return NextResponse.json({ status: 'ignored_invalid_phone_or_id' }, { status: 200 });
  }

  const leadPhone = cleanPhone;
  const targetRecipient = rawRemoteJid;

  // 5. FILTRO CRÍTICO: Detección de Mensajes Propios (fromMe: true)
  // Permite coexistencia natural entre WhatsApp móvil del asesor y la IA de Synqo.
  if (messageKey.fromMe === true) {
    const { msgObj, isNonConversationalSignal } = unwrapEvolutionOutboundMessage(messageData.message || {});
    if (isNonConversationalSignal) {
      return NextResponse.json({ status: 'ignored_non_conversational_from_me' }, { status: 200 });
    }

    let rawText =
      msgObj.conversation ||
      msgObj.extendedTextMessage?.text ||
      msgObj.buttonsResponseMessage?.selectedDisplayText ||
      '';

    let pendingMediaJob: (() => Promise<string | null>) | null = null;
    if (!rawText) {
      const finalApiKey = decryptedApiKey || process.env.EVOLUTION_API_KEY?.trim() || '';
      if (msgObj.imageMessage) {
        const caption = (msgObj.imageMessage.caption || '').trim();
        rawText = caption ? `📷 [Foto]: ${caption}` : '📷 [Foto enviada]';
        pendingMediaJob = async () => {
          try {
            const media = await EvolutionService.getBase64Media({
              apiUrl: organization.evolution_api_url,
              apiKey: finalApiKey,
              instanceName: cleanInstance,
              messageId,
            });
            if (media?.base64) {
              const imageUrl = await uploadIncomingChatMedia({
                buffer: Buffer.from(media.base64, 'base64'),
                mimeType: media.mimetype || 'image/jpeg',
                organizationId: orgId,
                contactId: leadPhone || 'mobile-outbound',
              });
              if (imageUrl) return formatImageMessageContent(imageUrl, caption);
            }
          } catch {}
          return null;
        };
      } else if (msgObj.audioMessage) {
        rawText = '🎤 [Nota de voz enviada]';
        pendingMediaJob = async () => {
          let audioBuffer: Buffer | null = null;
          let audioMime = msgObj.audioMessage.mimetype || 'audio/ogg; codecs=opus';
          try {
            if (messageData.base64) audioBuffer = Buffer.from(messageData.base64, 'base64');
            else if (msgObj.audioMessage.base64) audioBuffer = Buffer.from(msgObj.audioMessage.base64, 'base64');
            else {
              const media = await EvolutionService.getBase64Audio({
                apiUrl: organization.evolution_api_url,
                apiKey: finalApiKey,
                instanceName: cleanInstance,
                messageId,
                messagePayload: messageData,
              });
              if (media?.base64) {
                audioBuffer = Buffer.from(media.base64, 'base64');
                audioMime = media.mimetype || audioMime;
              }
            }
          } catch {}
          if (!audioBuffer) return null;
          const [audioUrl, transcription] = await Promise.all([
            uploadIncomingChatMedia({
              buffer: audioBuffer,
              mimeType: audioMime,
              organizationId: orgId,
              contactId: leadPhone || 'mobile-outbound',
            }).catch(() => null),
            OpenAIService.transcribeAudio(audioBuffer, audioMime, {
              organizationId: orgId,
              contactId: leadPhone || undefined,
            }).catch(() => ''),
          ]);
          if (audioUrl) return formatAudioMessageContent(audioUrl, transcription || undefined);
          if (transcription) return `🎤 [Nota de voz]: "${transcription}"`;
          return null;
        };
      } else if (msgObj.videoMessage) {
        rawText = msgObj.videoMessage.caption ? `📹 [Video]: ${msgObj.videoMessage.caption}` : '📹 [Video enviado]';
      } else if (msgObj.documentMessage) {
        rawText = `📄 [Documento: ${msgObj.documentMessage.fileName || 'Archivo'}]`;
      } else if (msgObj.stickerMessage) {
        rawText = '🏷️ [Sticker enviado]';
      } else if (msgObj.contactMessage || msgObj.contactsArrayMessage) {
        rawText = '👤 [Tarjeta de contacto enviada]';
      } else if (msgObj.locationMessage) {
        rawText = '📍 [Ubicación compartida]';
      } else {
        rawText = '[Mensaje enviado desde WhatsApp móvil]';
      }
    }

    const res = await HumanOutboundService.recordMobileHumanOutbound({
      organization,
      channel: 'whatsapp',
      externalMessageId: messageId,
      senderId: leadPhone,
      remoteJid: targetRecipient,
      leadName: messageData.pushName || undefined,
      rawContent: typeof rawText === 'string' ? rawText : JSON.stringify(rawText),
    });

    if (pendingMediaJob && res.messageId) {
      const msgRowId = res.messageId;
      waitUntil(
        pendingMediaJob().then(async (resolvedContent) => {
          if (!resolvedContent) return;
          await (supabaseAdmin.from('messages') as any)
            .update({ content: resolvedContent })
            .eq('id', msgRowId);
        })
      );
    }

    return NextResponse.json({ status: res.status, contactId: res.contactId, messageId: res.messageId }, { status: 200 });
  }

  // 6. Rate Limiting por Remitente (Prevención de abusos o ataques DoS)
  const rateLimitResult = await checkRateLimit(`phone:${leadPhone}`);
  const isRateLimited = !rateLimitResult.success;
  if (isRateLimited) {
    console.warn(`[RATE LIMIT EXCEEDED] Remitente ${leadPhone} excedió el límite de mensajes. Se guardará sin invocar a la IA.`);
  }

  // 7. Extracción Rápida de Contenido (Instant-Insert; media/thumbnails pesados se hidratan en waitUntil)
  const msgObj = messageData.message || {};
  const sharedContextInfo =
    msgObj.extendedTextMessage?.contextInfo ||
    msgObj.imageMessage?.contextInfo ||
    msgObj.videoMessage?.contextInfo ||
    msgObj.documentMessage?.contextInfo ||
    (msgObj as any).messageContextInfo ||
    (msgObj as any).contextInfo ||
    (messageData as any).messageContextInfo ||
    messageData.contextInfo ||
    null;
  const sharedAdReply =
    sharedContextInfo?.externalAdReply ||
    (messageData as any).referral ||
    (msgObj as any).referral ||
    null;

  let rawContent = '';
  let pendingInboundMediaJob: (() => Promise<string | null>) | null = null;
  const finalApiKey = decryptedApiKey || process.env.EVOLUTION_API_KEY?.trim() || '';

  if (typeof msgObj.conversation === 'string' && msgObj.conversation.trim()) {
    const convText = msgObj.conversation.trim();
    const adTitle = (sharedAdReply?.title || sharedAdReply?.headline || '').trim();
    const adBody = (sharedAdReply?.body || '').trim();
    const adThumbnail = (sharedAdReply?.thumbnailUrl || sharedAdReply?.mediaUrl || sharedAdReply?.image_url || '').trim();
    const rawThumbB64 = sharedAdReply?.jpegThumbnail || '';
    const adThumbnailB64 =
      typeof rawThumbB64 === 'string'
        ? rawThumbB64
        : Buffer.isBuffer(rawThumbB64)
        ? rawThumbB64.toString('base64')
        : '';
    const sourceUrl = (sharedAdReply?.sourceUrl || sharedAdReply?.source_url || '').trim();

    const immediateAdMeta = [adTitle ? `"${adTitle}"` : '', adBody ? `"${adBody}"` : ''].filter(Boolean).join(' - ');
    rawContent = immediateAdMeta ? `[Publicación/Anuncio compartido: ${immediateAdMeta}] ${convText}` : convText;
    if (adTitle || adBody || adThumbnail || adThumbnailB64 || sourceUrl || /https?:\/\//i.test(convText)) {
      pendingInboundMediaJob = async () =>
        resolveInboundThumbnailMessage({
          organizationId: orgId,
          contactKey: leadPhone || 'incoming',
          text: convText,
          labelPrefix: adTitle || adBody ? 'Publicación/Anuncio compartido' : 'Enlace compartido',
          title: adTitle,
          body: adBody,
          thumbnailUrl: adThumbnail,
          thumbnailBase64: adThumbnailB64,
          sourceUrl,
        }).catch(() => null);
    }
  } else if (msgObj.extendedTextMessage) {
    const text = (msgObj.extendedTextMessage.text || '').trim();
    const adReply = sharedAdReply;
    const adTitle = (adReply?.title || adReply?.headline || msgObj.extendedTextMessage.title || '').trim();
    const adBody = (adReply?.body || msgObj.extendedTextMessage.description || '').trim();
    const adThumbnail = (adReply?.thumbnailUrl || adReply?.mediaUrl || adReply?.image_url || '').trim();
    const rawThumbB64 =
      adReply?.jpegThumbnail ||
      msgObj.extendedTextMessage.jpegThumbnail ||
      '';
    const adThumbnailB64 =
      typeof rawThumbB64 === 'string'
        ? rawThumbB64
        : Buffer.isBuffer(rawThumbB64)
        ? rawThumbB64.toString('base64')
        : '';
    const sourceUrl = (adReply?.sourceUrl || adReply?.source_url || msgObj.extendedTextMessage.matchedText || '').trim();

    const immediateAdMeta = [adTitle ? `"${adTitle}"` : '', adBody ? `"${adBody}"` : ''].filter(Boolean).join(' - ');
    const baseTxt = text || (adTitle ? `📌 ${adTitle}` : 'Enlace compartido');
    rawContent = immediateAdMeta && text ? `[Publicación/Anuncio compartido: ${immediateAdMeta}] ${baseTxt}` : baseTxt;
    if (adTitle || adBody || adThumbnail || adThumbnailB64 || sourceUrl || /https?:\/\//i.test(text)) {
      pendingInboundMediaJob = async () =>
        resolveInboundThumbnailMessage({
          organizationId: orgId,
          contactKey: leadPhone || 'incoming',
          text,
          labelPrefix: 'Publicación/Anuncio compartido',
          title: adTitle,
          body: adBody,
          thumbnailUrl: adThumbnail,
          thumbnailBase64: adThumbnailB64,
          sourceUrl,
        }).catch(() => null);
    }
  } else if (msgObj.productMessage) {
    const prod = msgObj.productMessage.product || {};
    const prodTitle = String(prod.title || 'Producto de catálogo').trim();
    const prodDesc = String(prod.description || '').trim();
    const prodPrice = prod.priceAmount1000 ? `$${Math.round(Number(prod.priceAmount1000) / 1000).toLocaleString('es-CO')}` : '';
    const rawThumbB64 = prod.productImage?.jpegThumbnail || '';
    const prodThumbB64 = typeof rawThumbB64 === 'string' ? rawThumbB64 : '';
    const summaryText = [prodTitle, prodPrice, prodDesc].filter(Boolean).join(' · ');
    rawContent = `🛍️ [Consulta de catálogo]: ${summaryText}`;
    if (prodThumbB64) {
      pendingInboundMediaJob = async () =>
        resolveInboundThumbnailMessage({
          organizationId: orgId,
          contactKey: leadPhone || 'incoming',
          text: prodTitle,
          labelPrefix: 'Producto de catálogo WhatsApp',
          title: prodTitle,
          body: [prodPrice, prodDesc].filter(Boolean).join(' — '),
          thumbnailBase64: prodThumbB64,
        }).catch(() => null);
    }
  } else if (msgObj.orderMessage) {
    const ord = msgObj.orderMessage;
    const itemCount = Number(ord.itemCount || 1);
    const ordText = String(ord.message || '').trim();
    rawContent = `🛒 [Carrito WhatsApp (${itemCount} ítem${itemCount === 1 ? '' : 's'})]${ordText ? `: ${ordText}` : ''}`;
  } else if (msgObj.buttonsResponseMessage?.selectedButtonId) {
    rawContent = msgObj.buttonsResponseMessage.selectedButtonId.trim();
  } else if (msgObj.listResponseMessage?.singleSelectReply?.selectedRowId) {
    rawContent = msgObj.listResponseMessage.singleSelectReply.selectedRowId.trim();
  } else if (msgObj.audioMessage) {
    rawContent = '🎤 [Procesando nota de voz...]';
    pendingInboundMediaJob = async () => {
      try {
        let audioBuffer: Buffer | null = null;
        let audioMime = msgObj.audioMessage.mimetype || 'audio/ogg; codecs=opus';

        if (messageData.base64) {
          audioBuffer = Buffer.from(messageData.base64, 'base64');
        } else if (msgObj.audioMessage.base64) {
          audioBuffer = Buffer.from(msgObj.audioMessage.base64, 'base64');
        } else {
          const media = await EvolutionService.getBase64Audio({
            apiUrl: organization.evolution_api_url,
            apiKey: finalApiKey,
            instanceName: cleanInstance,
            messageId,
            messagePayload: messageData,
          });
          if (media?.base64) {
            audioBuffer = Buffer.from(media.base64, 'base64');
            audioMime = media.mimetype || audioMime;
          }
        }

        if (!audioBuffer) return '🎤 [Nota de voz inaudible]';

        const [audioUrl, transcription] = await Promise.all([
          uploadIncomingChatMedia({
            buffer: audioBuffer,
            mimeType: audioMime,
            organizationId: orgId,
            contactId: leadPhone || 'incoming',
          }).catch(() => null),
          OpenAIService.transcribeAudio(audioBuffer, audioMime, {
            organizationId: orgId,
            contactId: leadPhone || undefined,
          }).catch(() => ''),
        ]);

        if (audioUrl) return formatAudioMessageContent(audioUrl, transcription || undefined);
        if (transcription) return `🎤 [Nota de voz]: "${transcription}"`;
        return '🎤 [Nota de voz inaudible]';
      } catch (audioErr) {
        console.warn('[EVOLUTION AUDIO HANDLING ERROR]', audioErr);
        return '🎤 [Nota de voz inaudible]';
      }
    };
  } else if (msgObj.imageMessage) {
    const caption = (msgObj.imageMessage.caption || '').trim();
    rawContent = caption ? `📷 [Foto]: ${caption}` : '📷 [Cargando foto...]';
    pendingInboundMediaJob = async () => {
      try {
        const media = await EvolutionService.getBase64Media({
          apiUrl: organization.evolution_api_url,
          apiKey: finalApiKey,
          instanceName: cleanInstance,
          messageId,
        });
        if (media?.base64) {
          const imageUrl = await uploadIncomingChatMedia({
            buffer: Buffer.from(media.base64, 'base64'),
            mimeType: media.mimetype || 'image/jpeg',
            organizationId: orgId,
            contactId: leadPhone || 'incoming',
          });
          if (imageUrl) return formatImageMessageContent(imageUrl, caption);
        }
      } catch (imgErr) {
        console.warn('[EVOLUTION IMAGE DOWNLOAD WARN]', imgErr);
      }
      return caption ? `📷 [Foto]: ${caption}` : '📷 [Foto recibida]';
    };
  } else if (msgObj.videoMessage) {
    const caption = (msgObj.videoMessage.caption || '').trim();
    rawContent = caption ? `📹 [Video]: ${caption}` : '📹 [Cargando video...]';
    pendingInboundMediaJob = async () => {
      try {
        const media = await EvolutionService.getBase64Media({
          apiUrl: organization.evolution_api_url,
          apiKey: finalApiKey,
          instanceName: cleanInstance,
          messageId,
        });
        if (media?.base64) {
          const videoUrl = await uploadIncomingChatMedia({
            buffer: Buffer.from(media.base64, 'base64'),
            mimeType: media.mimetype || 'video/mp4',
            organizationId: orgId,
            contactId: leadPhone || 'incoming',
          });
          if (videoUrl) return formatVideoMessageContent(videoUrl, caption);
        }
      } catch (vidErr) {
        console.warn('[EVOLUTION VIDEO DOWNLOAD WARN]', vidErr);
      }
      return caption ? `📹 [Video]: ${caption}` : '📹 [Video recibido]';
    };
  } else if (msgObj.stickerMessage) {
    rawContent = '🏷️ [Sticker recibido]';
  } else if (msgObj.contactMessage || msgObj.contactsArrayMessage) {
    const cName = msgObj.contactMessage?.displayName || msgObj.contactsArrayMessage?.contacts?.[0]?.displayName || 'Contacto';
    rawContent = `👤 [Tarjeta de contacto: ${cName}]`;
  } else if (msgObj.reactionMessage) {
    const reactionEmoji = msgObj.reactionMessage.text;
    const targetMsgId = msgObj.reactionMessage.key?.id;
    if (reactionEmoji && targetMsgId) {
      await InboundCoreService.processInbound({
        organization,
        channel: 'whatsapp_evolution',
        channelMessageId: messageId,
        senderId: leadPhone,
        senderName: messageData.pushName || 'Lead WhatsApp',
        rawContent: reactionEmoji,
        reactionEmoji,
        replyToChannelMessageId: targetMsgId,
      });
    }
    return NextResponse.json({ status: 'reaction_acknowledged' }, { status: 200 });
  } else if (msgObj.documentMessage) {
    const fileName = msgObj.documentMessage.fileName || 'Archivo';
    rawContent = `📄 [Documento recibido: ${fileName}]`;
  } else if (msgObj.locationMessage) {
    rawContent = `📍 [Ubicación compartida: lat ${msgObj.locationMessage.degreesLatitude}, lng ${msgObj.locationMessage.degreesLongitude}]`;
  } else {
    rawContent = '[Mensaje no reproducible]';
  }

  const leadName = messageData.pushName || "Lead WhatsApp";
  const isPaymentReceipt = Boolean(msgObj.imageMessage && isPaymentReceiptHint(msgObj.imageMessage.caption || ""));

  const quotedMsg = sharedContextInfo?.quotedMessage;
  const quotedSnippet =
    quotedMsg?.conversation ||
    quotedMsg?.extendedTextMessage?.text ||
    (quotedMsg?.productMessage?.product?.title
      ? `Producto: ${quotedMsg.productMessage.product.title}`
      : '') ||
    (quotedMsg?.imageMessage
      ? quotedMsg.imageMessage.caption
        ? `Foto: ${quotedMsg.imageMessage.caption}`
        : 'Foto'
      : '') ||
    (quotedMsg?.videoMessage ? 'Video' : '');

  const replyToId = sharedContextInfo?.stanzaId || null;

  const inboundPayload: InboundPayload = {
    organization,
    channel: "whatsapp_evolution",
    channelMessageId: messageId,
    senderId: leadPhone,
    senderName: leadName,
    rawContent,
    replyToChannelMessageId: replyToId,
    quotedTextSnippet: quotedSnippet || null,
    isPaymentReceipt,
    remoteJid: targetRecipient,
  };

  const result = await InboundCoreService.processInbound(inboundPayload);

  if (result.status === "duplicate_ignored") {
    return NextResponse.json({ status: "duplicate_message_ignored" }, { status: 200 });
  }

  // Ejecución asíncrona de hidratación de media + IA en segundo plano
  if (result.status === "success" && result.contactId && result.messageId && !isRateLimited) {
    const targetContactId = result.contactId;
    const targetMsgId = result.messageId;
    waitUntil(
      (async () => {
        if (pendingInboundMediaJob) {
          const resolvedMediaContent = await pendingInboundMediaJob();
          if (resolvedMediaContent && resolvedMediaContent !== rawContent) {
            inboundPayload.rawContent = resolvedMediaContent;
            await Promise.all([
              (supabaseAdmin.from('messages') as any)
                .update({ content: resolvedMediaContent })
                .eq('id', targetMsgId),
              (supabaseAdmin.from('contacts') as any)
                .update({
                  last_message: resolvedMediaContent.slice(0, 240),
                  last_message_preview: resolvedMediaContent.slice(0, 120),
                })
                .eq('id', targetContactId),
            ]);
          }
        }
        await InboundCoreService.runAiWorker({
          payload: inboundPayload,
          contactId: targetContactId,
          insertedMessageId: targetMsgId,
        });
      })()
    );
  } else if (pendingInboundMediaJob && result.messageId) {
    const targetMsgId = result.messageId;
    waitUntil(
      pendingInboundMediaJob().then(async (resolvedMediaContent) => {
        if (resolvedMediaContent && resolvedMediaContent !== rawContent) {
          await (supabaseAdmin.from('messages') as any)
            .update({ content: resolvedMediaContent })
            .eq('id', targetMsgId);
        }
      })
    );
  }

  return NextResponse.json({ status: "success" }, { status: 200 });
}
