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
import { InboundCoreService, InboundPayload } from '@/services/inbound-core.service';

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
      'id, name, subscription_status, is_active, whatsapp_provider, evolution_api_url, evolution_api_key, evolution_instance_name, evolution_status, evolution_anti_ban_mode, evolution_max_outbound_per_hour, system_prompt, handoff_mode, after_hours_message, business_hours, ai_provider, enabled_modules, appointment_settings'
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
          await (supabaseAdmin.from('messages') as any)
            .update({ status: mappedStatus })
            .eq('meta_message_id', metaId);
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
  const isLid = remoteJid.endsWith('@lid');
  const cleanPhone = remoteJid.replace(/@s\.whatsapp\.net|@c\.us|@lid/g, '').replace(/[^\d]/g, '');

  if (!cleanPhone || !messageId) {
    return NextResponse.json({ status: 'ignored_invalid_phone_or_id' }, { status: 200 });
  }

  const leadPhone = cleanPhone;
  const targetRecipient = isLid ? remoteJid : cleanPhone;

  // 5. FILTRO CRÍTICO: Detección de Mensajes Propios (fromMe: true)
  // Permite la coexistencia natural bot-humano.
  if (messageKey.fromMe === true) {
    // 1. Verificar si este mensaje fue emitido por la IA o asesor desde Synqo
    let { data: existingMsg } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('meta_message_id', messageId)
      .maybeSingle();

    if (!existingMsg) {
      // Breve margen (800ms) para tolerar la latencia de persistencia del worker emisor de Synqo
      await new Promise((resolve) => setTimeout(resolve, 800));
      const { data: retryMsg } = await supabaseAdmin
        .from('messages')
        .select('id')
        .eq('meta_message_id', messageId)
        .maybeSingle();
      existingMsg = retryMsg;
    }

    if (existingMsg) {
      // Es el eco del mensaje que nuestro propio CRM/bot envió. Ignorar para evitar bucles.
      return NextResponse.json({ status: 'bot_echo_ignored' }, { status: 200 });
    }

    // Si NO fue enviado por Synqo, significa que el ASESOR HUMANO escribió directamente desde el celular físico
    console.log(`[EVOLUTION HUMAN TAKEOVER] Asesor intervino desde el celular en el chat con ${leadPhone}.`);

    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('id, name, is_ai_active')
      .eq('organization_id', orgId)
      .or(`phone.eq.${leadPhone},phone.eq.+${leadPhone}`)
      .maybeSingle();

    if (contact) {
      // 1. Pausar la IA en este contacto para no competir con el humano
      await (supabaseAdmin.from('contacts') as any)
        .update({
          is_ai_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contact.id);

      // 2. Extraer el texto o descripción del mensaje enviado por el humano
      const msgObj = messageData.message || {};
      let rawText =
        msgObj.conversation ||
        msgObj.extendedTextMessage?.text ||
        msgObj.buttonsResponseMessage?.selectedDisplayText ||
        '';

      if (!rawText) {
        if (msgObj.imageMessage) rawText = msgObj.imageMessage.caption ? `📷 [Foto]: ${msgObj.imageMessage.caption}` : '📷 [Foto enviada]';
        else if (msgObj.videoMessage) rawText = msgObj.videoMessage.caption ? `📹 [Video]: ${msgObj.videoMessage.caption}` : '📹 [Video enviado]';
        else if (msgObj.audioMessage) rawText = '🎤 [Nota de voz enviada]';
        else if (msgObj.documentMessage) rawText = `📄 [Documento: ${msgObj.documentMessage.fileName || 'Archivo'}]`;
        else if (msgObj.stickerMessage) rawText = '🏷️ [Sticker enviado]';
        else if (msgObj.contactMessage || msgObj.contactsArrayMessage) rawText = '👤 [Tarjeta de contacto enviada]';
        else if (msgObj.locationMessage) rawText = '📍 [Ubicación compartida]';
        else rawText = '[Mensaje enviado desde WhatsApp móvil]';
      }

      // 3. Registrar el mensaje en el CRM para que el inbox quede perfectamente sincronizado en tiempo real
      await (supabaseAdmin.from('messages') as any).insert({
        contact_id: contact.id,
        sender_type: 'agent_manual',
        content: typeof rawText === 'string' ? rawText : JSON.stringify(rawText),
        meta_message_id: messageId,
        channel: 'whatsapp',
      });
    }

    return NextResponse.json({ status: 'human_intervention_recorded' }, { status: 200 });
  }

  // 6. Rate Limiting por Remitente (Prevención de abusos o ataques DoS)
  const rateLimitResult = await checkRateLimit(`phone:${leadPhone}`);
  const isRateLimited = !rateLimitResult.success;
  if (isRateLimited) {
    console.warn(`[RATE LIMIT EXCEEDED] Remitente ${leadPhone} excedió el límite de mensajes. Se guardará sin invocar a la IA.`);
  }

  // 7. Extracción Robusta de Contenido del Mensaje
  const msgObj = messageData.message || {};
  let rawContent = '';

  if (typeof msgObj.conversation === 'string' && msgObj.conversation.trim()) {
    rawContent = msgObj.conversation.trim();
  } else if (msgObj.extendedTextMessage) {
    const text = (msgObj.extendedTextMessage.text || '').trim();
    const adReply = msgObj.extendedTextMessage.contextInfo?.externalAdReply;
    const adTitle = (adReply?.title || msgObj.extendedTextMessage.title || '').trim();
    const adBody = (adReply?.body || msgObj.extendedTextMessage.description || '').trim();
    const adThumbnail = adReply?.thumbnailUrl || '';

    if (adTitle || adBody || adThumbnail) {
      const adParts: string[] = [];
      if (adTitle) adParts.push(`"${adTitle}"`);
      if (adBody) adParts.push(`"${adBody}"`);
      if (adThumbnail) adParts.push(`[Foto: ${adThumbnail}]`);
      rawContent = `[Publicación/Anuncio compartido de Instagram: ${adParts.join(' - ')}] ${text}`.trim();
    } else {
      rawContent = text;
    }
  } else if (msgObj.buttonsResponseMessage?.selectedButtonId) {
    rawContent = msgObj.buttonsResponseMessage.selectedButtonId.trim();
  } else if (msgObj.listResponseMessage?.singleSelectReply?.selectedRowId) {
    rawContent = msgObj.listResponseMessage.singleSelectReply.selectedRowId.trim();
  } else if (msgObj.audioMessage) {
    // 🎙️ Nota de voz entrante vía Evolution API -> Transcripción con OpenAI Whisper y almacenamiento de audio
    try {
      let audioBuffer: Buffer | null = null;
      let audioMime = msgObj.audioMessage.mimetype || 'audio/ogg; codecs=opus';

      // 1. Detección directa de base64 en el webhook si Evolution lo incluye
      if (messageData.base64) {
        audioBuffer = Buffer.from(messageData.base64, 'base64');
      } else if (msgObj.audioMessage.base64) {
        audioBuffer = Buffer.from(msgObj.audioMessage.base64, 'base64');
      }

      // 2. Si no venía en el webhook, solicitarlo a Evolution API pasando el payload del mensaje
      if (!audioBuffer) {
        const finalApiKey = decryptedApiKey || process.env.EVOLUTION_API_KEY?.trim() || '';
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

      let audioUrl: string | null = null;
      let transcription = '';

      if (audioBuffer) {
        // Subir nota de voz a Supabase Storage para que los asesores puedan escuchar el audio directamente en el CRM
        try {
          audioUrl = await uploadIncomingChatMedia({
            buffer: audioBuffer,
            mimeType: audioMime,
            organizationId: orgId,
            contactId: leadPhone || 'incoming',
          });
        } catch (uploadErr) {
          console.warn('[EVOLUTION AUDIO UPLOAD WARN]', uploadErr);
        }

        // Transcripción de alta fidelidad con OpenAI Whisper
        try {
          transcription = await OpenAIService.transcribeAudio(audioBuffer, audioMime);
        } catch (transcribeErr) {
          console.warn('[EVOLUTION AUDIO TRANSCRIPTION WARN]', transcribeErr);
        }
      }

      if (audioUrl) {
        rawContent = formatAudioMessageContent(audioUrl, transcription || undefined);
      } else if (transcription) {
        rawContent = `🎤 [Nota de voz]: "${transcription}"`;
      } else {
        rawContent = '🎤 [Nota de voz inaudible]';
      }
    } catch (audioErr) {
      console.warn('[EVOLUTION AUDIO HANDLING ERROR]', audioErr);
      rawContent = '🎤 [Nota de voz inaudible]';
    }
  } else if (msgObj.imageMessage) {
    const caption = (msgObj.imageMessage.caption || '').trim();
    let imageUrl: string | null = null;

    try {
      const finalApiKey = decryptedApiKey || process.env.EVOLUTION_API_KEY?.trim() || '';
      const media = await EvolutionService.getBase64Media({
        apiUrl: organization.evolution_api_url,
        apiKey: finalApiKey,
        instanceName: cleanInstance,
        messageId,
      });

      if (media?.base64) {
        const imageBuffer = Buffer.from(media.base64, 'base64');
        imageUrl = await uploadIncomingChatMedia({
          buffer: imageBuffer,
          mimeType: media.mimetype || 'image/jpeg',
          organizationId: orgId,
          contactId: leadPhone || 'incoming',
        });
      }
    } catch (imgErr) {
      console.warn('[EVOLUTION IMAGE DOWNLOAD WARN]', imgErr);
    }

    if (imageUrl) {
      rawContent = formatImageMessageContent(imageUrl, caption);
    } else {
      rawContent = caption ? `📷 [Foto]: ${caption}` : '📷 [Foto recibida]';
    }
  } else if (msgObj.videoMessage) {
    const caption = (msgObj.videoMessage.caption || '').trim();
    let videoUrl: string | null = null;
    try {
      const media = await EvolutionService.getBase64Media({
        apiUrl: organization.evolution_api_url,
        apiKey: decryptedApiKey || '',
        instanceName: cleanInstance,
        messageId,
      });

      if (media?.base64) {
        const videoBuffer = Buffer.from(media.base64, 'base64');
        videoUrl = await uploadIncomingChatMedia({
          buffer: videoBuffer,
          mimeType: media.mimetype || 'video/mp4',
          organizationId: orgId,
          contactId: leadPhone || 'incoming',
        });
      }
    } catch (vidErr) {
      console.warn('[EVOLUTION VIDEO DOWNLOAD WARN]', vidErr);
    }

    if (videoUrl) {
      rawContent = formatVideoMessageContent(videoUrl, caption);
    } else {
      rawContent = caption ? `📹 [Video]: ${caption}` : '📹 [Video recibido]';
    }
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

  const quotedSnippet =
    msgObj.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
    msgObj.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text ||
    (msgObj.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage ? "Foto" : "") ||
    (msgObj.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage ? "Video" : "");

  const replyToId = msgObj.extendedTextMessage?.contextInfo?.stanzaId || null;

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
  };

  const result = await InboundCoreService.processInbound(inboundPayload);

  if (result.status === "duplicate_ignored") {
    return NextResponse.json({ status: "duplicate_message_ignored" }, { status: 200 });
  }

  // Ejecución asíncrona de IA en segundo plano
  if (result.status === "success" && result.contactId && result.messageId && !isRateLimited) {
    waitUntil(
      InboundCoreService.runAiWorker({
        payload: inboundPayload,
        contactId: result.contactId,
        insertedMessageId: result.messageId,
      })
    );
  }

  return NextResponse.json({ status: "success" }, { status: 200 });
}
