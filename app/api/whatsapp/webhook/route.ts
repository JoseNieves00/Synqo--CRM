import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { verifyMetaSignature } from '@/lib/security/verify-webhook';
import { decryptSecret } from '@/lib/security/encryption';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { sanitizeLeadMessage } from '@/lib/security/sanitize';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { WhatsAppService } from '@/services/whatsapp.service';
import { OpenAIService } from '@/services/openai.service';

/**
 * 1. GET: Handshake de verificación inicial de Meta WhatsApp Webhook.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

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
  const appSecret = process.env.META_APP_SECRET || '';

  // B. Verificación Criptográfica Estricta (Security-by-Design)
  const isValidSignature = verifyMetaSignature(rawBody, signature, appSecret);
  if (!isValidSignature) {
    console.error('[SECURITY ALERT] Firma inválida rechazada en WhatsApp Webhook.');
    return new NextResponse('Unauthorized: Invalid HMAC signature', { status: 401 });
  }

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

  // C. Descartar notificaciones de estado (sent, delivered, read) para evitar ecos y bucles
  if (value.statuses && (!value.messages || value.messages.length === 0)) {
    return NextResponse.json({ status: 'status_update_acknowledged' }, { status: 200 });
  }

  const incomingMessage = value.messages?.[0];
  if (!incomingMessage) {
    return NextResponse.json({ status: 'no_incoming_message' }, { status: 200 });
  }

  // D. Filtrar solo mensajes de texto
  if (incomingMessage.type !== 'text') {
    return NextResponse.json({ status: 'non_text_message_ignored' }, { status: 200 });
  }

  const metaMessageId = incomingMessage.id;
  const leadPhone = incomingMessage.from;
  const rawContent = incomingMessage.text?.body || '';
  const sanitizedContent = sanitizeLeadMessage(rawContent);
  const leadName = value.contacts?.[0]?.profile?.name || 'Lead WhatsApp';
  const phoneNumberId = value.metadata?.phone_number_id;

  if (!phoneNumberId || !leadPhone) {
    return NextResponse.json({ error: 'Missing phoneNumberId or leadPhone in metadata' }, { status: 400 });
  }

  // E. Control de Tasa (Rate Limiting) y Prevención de Wallet Exhaustion
  const rateLimitResult = await checkRateLimit(`phone:${leadPhone}`);
  if (!rateLimitResult.success) {
    console.warn(`[RATE LIMIT EXCEEDED] Remitente ${leadPhone} excedió el límite de 15 msgs/min.`);
    return NextResponse.json({ status: 'rate_limited' }, { status: 200 });
  }

  try {
    // F. Identificar la Organización dueña del WABA Phone Number ID
    const { data: organization, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('id, name, subscription_status, is_active, whatsapp_access_token, cal_api_key, cal_event_type_id, system_prompt')
      .eq('whatsapp_phone_number_id', phoneNumberId)
      .single();

    if (orgError || !organization) {
      console.error(`[ORG NOT FOUND] No hay organización vinculada al phone_number_id: ${phoneNumberId}`);
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const orgId = organization.id;

    // G. Parche 1: Blindaje de Rentabilidad (Esquema de Suscripción & Estado Activo)
    const isSubscriptionActive =
      organization.is_active !== false &&
      (organization.subscription_status === 'active' || organization.subscription_status === 'trialing');

    // H. Deduplicación de Mensaje (Evitar reprocesar el mismo meta_message_id)
    const { data: existingMessage } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('meta_message_id', metaMessageId)
      .single();

    if (existingMessage) {
      return NextResponse.json({ status: 'duplicate_message_ignored' }, { status: 200 });
    }

    // I. Upsert del Contacto
    let contactId: string;
    let isAiActive = true;

    const { data: existingContact } = await supabaseAdmin
      .from('contacts')
      .select('id, is_ai_active')
      .eq('organization_id', orgId)
      .eq('phone', leadPhone)
      .single();

    if (existingContact) {
      contactId = existingContact.id;
      isAiActive = existingContact.is_ai_active;

      // Actualizar timestamp de última interacción y nombre si viene provisto
      await supabaseAdmin
        .from('contacts')
        .update({
          last_interaction_at: new Date().toISOString(),
          name: leadName,
        })
        .eq('id', contactId);
    } else {
      const { data: newContact, error: createError } = await supabaseAdmin
        .from('contacts')
        .insert({
          organization_id: orgId,
          phone: leadPhone,
          name: leadName,
          pipeline_stage: 'nuevo',
          is_ai_active: true,
          last_interaction_at: new Date().toISOString(),
        })
        .select('id, is_ai_active')
        .single();

      if (createError || !newContact) {
        throw new Error(`Error creando nuevo contacto: ${createError?.message}`);
      }
      contactId = newContact.id;
      isAiActive = newContact.is_ai_active;
    }

    // J. Persistir el Mensaje Entrante en Supabase de Inmediato
    await supabaseAdmin.from('messages').insert({
      contact_id: contactId,
      sender_type: 'lead',
      content: sanitizedContent,
      meta_message_id: metaMessageId,
    });

    // K. Parche 2: Resolución de Timeout con waitUntil (Ejecución Asíncrona en Segundo Plano)
    if (isSubscriptionActive && isAiActive) {
      waitUntil(
        (async () => {
          try {
            const decryptedWhatsAppToken = decryptSecret(organization.whatsapp_access_token || '');
            const decryptedCalApiKey = decryptSecret(organization.cal_api_key || '');

            // 1. Marcar como leído en WhatsApp (doble tilde azul)
            if (decryptedWhatsAppToken) {
              await WhatsAppService.markAsRead(phoneNumberId, decryptedWhatsAppToken, metaMessageId);
            }

            // 2. Procesar con OpenAI y herramientas (Cal.com + Pipeline Stage)
            const aiResponseText = await OpenAIService.processLeadMessage({
              contactId,
              organizationId: orgId,
              leadPhone,
              leadName,
              systemPromptConfig: organization.system_prompt,
              calApiKey: decryptedCalApiKey,
              calEventTypeId: organization.cal_event_type_id,
            });

            // 3. Enviar respuesta por WhatsApp
            if (decryptedWhatsAppToken && aiResponseText) {
              const outboundMetaId = await WhatsAppService.sendTextMessage({
                phoneNumberId,
                accessToken: decryptedWhatsAppToken,
                to: leadPhone,
                body: aiResponseText,
              });

              // 4. Guardar la respuesta de la IA en la base de datos
              await supabaseAdmin.from('messages').insert({
                contact_id: contactId,
                sender_type: 'ai',
                content: aiResponseText,
                meta_message_id: outboundMetaId || null,
              });
            }
          } catch (asyncErr) {
            console.error('[ASYNC AI WORKER ERROR]', asyncErr);
          }
        })()
      );
    } else if (!isSubscriptionActive) {
      console.warn(
        `[BILLING SUSPENDED] Organización ${orgId} tiene estado de suscripción: ${organization.subscription_status}. OpenAI no se ejecutará.`
      );
    } else {
      console.log(`[AI SILENCED] El lead ${leadPhone} está bajo atención humana. No se genera respuesta IA.`);
    }

    // L. Responder a Meta INMEDIATAMENTE (< 500 ms) para prevenir reintentos duplicados
    return NextResponse.json({ status: 'success' }, { status: 200 });
  } catch (error: any) {
    console.error('[WEBHOOK ROUTE ERROR]', error);
    return NextResponse.json({ error: error?.message || 'Internal processing error' }, { status: 500 });
  }
}

