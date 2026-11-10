import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { verifyMetaSignature, isValidMediaUrl } from '@/lib/security/verify-webhook';
import { decryptSecret } from '@/lib/security/encryption';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { sanitizeLeadMessage } from '@/lib/security/sanitize';
import { formatAudioMessageContent } from '@/lib/media/format';
import { uploadIncomingChatMedia } from '@/lib/media/storage';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { InstagramService } from '@/services/instagram.service';
import { OpenAIService } from '@/services/openai.service';
import { AssignmentService } from '@/services/assignment.service';
import { InboundCoreService, InboundPayload } from '@/services/inbound-core.service';
import { HumanOutboundService } from '@/services/human-outbound.service';
import { resolveInboundThumbnailMessage } from '@/lib/media/inbound-thumbnail';

export const maxDuration = 60;

/**
 * 1. GET: Handshake de verificación de Meta Instagram Webhook.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!expectedToken) {
    console.error('[INSTAGRAM WEBHOOK] META_WEBHOOK_VERIFY_TOKEN no está configurada.');
    return new NextResponse('Configuration error: META_WEBHOOK_VERIFY_TOKEN not set', { status: 500 });
  }

  if (mode === 'subscribe' && token === expectedToken && challenge) {
    console.log('[INSTAGRAM WEBHOOK] Handshake completado exitosamente con Meta.');
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  console.warn('[INSTAGRAM WEBHOOK] Falló intento de handshake. Token no coincide.');
  return new NextResponse('Forbidden', { status: 403 });
}

/**
 * 2. POST: Ingesta de mensajes de Instagram Direct.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Bad Request: Invalid JSON', { status: 400 });
  }

  // Validar si el evento proviene de Instagram Messaging
  if (payload?.object !== 'instagram') {
    return NextResponse.json({ status: 'ignored_non_instagram_object' }, { status: 200 });
  }

  const entry = payload?.entry?.[0];
  const messagingEvent = entry?.messaging?.[0];

  if (!messagingEvent || !messagingEvent.message) {
    return NextResponse.json({ status: 'no_incoming_message' }, { status: 200 });
  }

  const isEcho = Boolean(messagingEvent.message.is_echo);
  const orgAccountId = isEcho ? messagingEvent.sender?.id : messagingEvent.recipient?.id;
  const senderId = isEcho ? messagingEvent.recipient?.id : messagingEvent.sender?.id; // IGSID del lead
  const metaMessageId = messagingEvent.message.mid;
  let rawContent = (messagingEvent.message.text || '').trim();
  const attachments = messagingEvent.message.attachments;

  if (!senderId || !orgAccountId) {
    return NextResponse.json({ error: 'Missing sender or recipient ID' }, { status: 400 });
  }

  try {
    // Identificar organización dueña de la cuenta de Instagram
    const { data: organization, error: orgError } = await (supabaseAdmin.from('organizations') as any)
      .select('id, name, subscription_status, is_active, instagram_account_id, instagram_access_token, instagram_app_secret, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, evolution_api_url, evolution_api_key, evolution_instance_name, evolution_anti_ban_mode, system_prompt, structured_prompt_data, handoff_mode, after_hours_message, business_hours, ai_provider, enabled_modules, appointment_settings')
      .eq('instagram_account_id', orgAccountId)
      .single();

    if (orgError || !organization) {
      console.warn(`[ORG NOT FOUND] No hay organización vinculada al instagram_account_id: ${orgAccountId}`);
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Verificación HMAC criptográfica: Fail-closed estricto
    let secretToVerify = process.env.META_APP_SECRET || '';
    if (organization.instagram_app_secret) {
      try {
        secretToVerify = decryptSecret(organization.instagram_app_secret);
      } catch (err) {
        console.warn(`[INSTAGRAM WEBHOOK] Error desencriptando app secret:`, err);
      }
    }

    if (!secretToVerify) {
      console.error(`[SECURITY ALERT] Webhook de Instagram rechazado: ni la org "${organization.name}" ni el servidor tienen App Secret configurado.`);
      return new NextResponse('Unauthorized: App Secret not configured', { status: 401 });
    }

    if (!signature) {
      console.error(`[SECURITY ALERT] Webhook de Instagram rechazado: falta cabecera x-hub-signature-256 para org "${organization.name}".`);
      return new NextResponse('Unauthorized: Missing HMAC signature', { status: 401 });
    }

    const isValidSignature = verifyMetaSignature(rawBody, signature, secretToVerify);
    if (!isValidSignature) {
      console.error(`[SECURITY ALERT] Firma HMAC inválida en Instagram webhook para org "${organization.name}".`);
      return new NextResponse('Unauthorized: Invalid HMAC signature', { status: 401 });
    }

    // Rate Limiting anti-abuso (ejecutado SOLO tras validar firma)
    const rateLimitResult = await checkRateLimit(`ig:${senderId}`);
    if (!rateLimitResult.success) {
      console.warn(`[RATE LIMIT EXCEEDED] Instagram sender ${senderId} excedió límite de mensajes.`);
      return NextResponse.json({ status: 'rate_limited' }, { status: 200 });
    }

    // Extraer multimedia (audio transcrito o imagen/publicación) después de validar HMAC
    if (Array.isArray(attachments) && attachments.length > 0) {
      const att = attachments[0];
      const title = (att?.payload?.title || att?.title || '').trim();
      const subtitle = (att?.payload?.subtitle || att?.subtitle || '').trim();
      const attUrl = (att?.payload?.url || att?.url || '').trim();
      const thumbUrl = (att?.payload?.thumbnail_url || att?.payload?.preview_url || '').trim();
      const isDirectImage = att?.type === 'image';
      const isDirectAudio = att?.type === 'audio';

      if (isDirectAudio) {
        let audioUrl: string | null = null;
        let transcription = '';
        if (attUrl && isValidMediaUrl(attUrl)) {
          try {
            const mediaRes = await fetch(attUrl, { signal: AbortSignal.timeout(10000) });
            if (mediaRes.ok) {
              const mime = mediaRes.headers.get('content-type') || 'audio/mp4';
              const buf = Buffer.from(await mediaRes.arrayBuffer());
              try {
                audioUrl = await uploadIncomingChatMedia({
                  buffer: buf,
                  mimeType: mime,
                  organizationId: organization.id,
                  contactId: `ig_${senderId}`,
                });
              } catch {}
              try {
                transcription = await OpenAIService.transcribeAudio(buf, mime);
              } catch {}
            }
          } catch {}
        }
        rawContent = audioUrl
          ? formatAudioMessageContent(audioUrl, transcription || undefined)
          : transcription
          ? `🎤 [Nota de voz]: "${transcription}"`
          : isEcho
          ? '🎤 [Nota de voz enviada]'
          : '🎤 [Nota de voz inaudible]';
      } else {
        rawContent = await resolveInboundThumbnailMessage({
          organizationId: organization.id,
          contactKey: `ig_${senderId}`,
          text: rawContent,
          labelPrefix: isDirectImage ? 'Imagen recibida de Instagram' : 'Publicación compartida de Instagram',
          title: title || (!subtitle && !isDirectImage && att?.type ? `Tipo: ${att.type}` : ''),
          body: subtitle,
          thumbnailUrl: thumbUrl || (isDirectImage ? attUrl : ''),
          sourceUrl: !isDirectImage ? (att?.payload?.target_url || attUrl) : '',
        });
      }
    } else if (/https?:\/\//i.test(rawContent)) {
      rawContent = await resolveInboundThumbnailMessage({
        organizationId: organization.id,
        contactKey: `ig_${senderId}`,
        text: rawContent,
        labelPrefix: 'Enlace compartido de Instagram',
      });
    }

    // Coexistencia móvil en Instagram (is_echo): si lo envió el asesor desde su app Instagram, registrarlo y pausar IA temporalmente
    if (isEcho) {
      const echoRes = await HumanOutboundService.recordMobileHumanOutbound({
        organization,
        channel: 'instagram',
        externalMessageId: metaMessageId,
        senderId,
        leadName: 'Usuario Instagram (' + senderId.slice(-4) + ')',
        rawContent,
      });
      return NextResponse.json(
        { status: echoRes.status, contactId: echoRes.contactId, messageId: echoRes.messageId },
        { status: 200 }
      );
    }

    const inboundPayload: InboundPayload = {
      organization,
      channel: "instagram",
      channelMessageId: metaMessageId,
      senderId,
      senderName: "Usuario Instagram (" + senderId.slice(-4) + ")",
      rawContent,
      replyToChannelMessageId: messagingEvent.message.reply_to?.mid || null,
    };

    const result = await InboundCoreService.processInbound(inboundPayload);

    if (result.status === "duplicate_ignored") {
      return NextResponse.json({ status: "duplicate_message_ignored" }, { status: 200 });
    }

    if (result.status === "success" && result.contactId && result.messageId) {
      waitUntil(
        InboundCoreService.runAiWorker({
          payload: inboundPayload,
          contactId: result.contactId,
          insertedMessageId: result.messageId,
        })
      );
    }

    return NextResponse.json({ status: "success" }, { status: 200 });
  } catch (error: any) {
    console.error("[INSTAGRAM WEBHOOK ERROR]", error);
    return NextResponse.json({ error: error?.message || "Internal processing error" }, { status: 500 });
  }
}
