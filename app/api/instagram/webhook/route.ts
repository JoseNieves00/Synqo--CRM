import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { verifyMetaSignature } from '@/lib/security/verify-webhook';
import { decryptSecret } from '@/lib/security/encryption';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { sanitizeLeadMessage } from '@/lib/security/sanitize';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { InstagramService } from '@/services/instagram.service';
import { OpenAIService } from '@/services/openai.service';
import { AssignmentService } from '@/services/assignment.service';

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

  // Descartar mensajes tipo echo (enviados por el propio negocio)
  if (messagingEvent.message.is_echo) {
    return NextResponse.json({ status: 'echo_message_ignored' }, { status: 200 });
  }

  const senderId = messagingEvent.sender?.id; // IGSID del lead
  const recipientId = messagingEvent.recipient?.id; // ID de Instagram de la cuenta empresarial
  const metaMessageId = messagingEvent.message.mid;
  const rawContent = messagingEvent.message.text || '';

  if (!senderId || !recipientId) {
    return NextResponse.json({ error: 'Missing sender or recipient ID' }, { status: 400 });
  }

  // Rate Limiting anti-abuso
  const rateLimitResult = await checkRateLimit(`ig:${senderId}`);
  if (!rateLimitResult.success) {
    console.warn(`[RATE LIMIT EXCEEDED] Instagram sender ${senderId} excedió límite de mensajes.`);
    return NextResponse.json({ status: 'rate_limited' }, { status: 200 });
  }

  try {
    // Identificar organización dueña de la cuenta de Instagram
    const { data: organization, error: orgError } = await (supabaseAdmin.from('organizations') as any)
      .select('id, name, subscription_status, is_active, instagram_access_token, instagram_app_secret, system_prompt, handoff_mode, after_hours_message, business_hours, ai_provider')
      .eq('instagram_account_id', recipientId)
      .single();

    if (orgError || !organization) {
      console.warn(`[ORG NOT FOUND] No hay organización vinculada al instagram_account_id: ${recipientId}`);
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Verificación HMAC si tiene App Secret
    let secretToVerify = process.env.META_APP_SECRET || '';
    if (organization.instagram_app_secret) {
      try {
        secretToVerify = decryptSecret(organization.instagram_app_secret);
      } catch (err) {
        console.warn(`[INSTAGRAM WEBHOOK] Error desencriptando app secret:`, err);
      }
    }

    if (secretToVerify) {
      if (!signature) {
        console.error(`[SECURITY ALERT] Webhook de Instagram rechazado: falta cabecera x-hub-signature-256 para org "${organization.name}".`);
        return new NextResponse('Unauthorized: Missing HMAC signature', { status: 401 });
      }
      const isValidSignature = verifyMetaSignature(rawBody, signature, secretToVerify);
      if (!isValidSignature) {
        console.error(`[SECURITY ALERT] Firma HMAC inválida en Instagram webhook para org "${organization.name}".`);
        return new NextResponse('Unauthorized: Invalid HMAC signature', { status: 401 });
      }
    }

    const orgId = organization.id;
    const sanitizedContent = sanitizeLeadMessage(rawContent);

    // Deduplicación de mensaje
    const { data: existingMessage } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('meta_message_id', metaMessageId)
      .single();

    if (existingMessage) {
      return NextResponse.json({ status: 'duplicate_message_ignored' }, { status: 200 });
    }

    // Upsert de contacto por canal Instagram
    let contactId: string;
    let isAiActive = true;

    const { data: existingContact } = await (supabaseAdmin.from('contacts') as any)
      .select('id, is_ai_active')
      .eq('organization_id', orgId)
      .eq('instagram_id', senderId)
      .single();

    if (existingContact) {
      contactId = existingContact.id;
      isAiActive = existingContact.is_ai_active;

      await (supabaseAdmin.from('contacts') as any)
        .update({
          last_interaction_at: new Date().toISOString(),
          channel: 'instagram',
        })
        .eq('id', contactId);
    } else {
      const bestAgentId = await AssignmentService.findBestAvailableAgent(orgId);

      const { data: newContact, error: createError } = await (supabaseAdmin.from('contacts') as any)
        .insert({
          organization_id: orgId,
          phone: `ig_${senderId}`, // Identificador unívoco para cumplir restricción no nula
          name: `Usuario Instagram (${senderId.slice(-4)})`,
          pipeline_stage: 'nuevo',
          channel: 'instagram',
          instagram_id: senderId,
          is_ai_active: true,
          assigned_to: bestAgentId || null,
          last_interaction_at: new Date().toISOString(),
        })
        .select('id, is_ai_active')
        .single();

      if (createError || !newContact) {
        throw new Error(`Error creando contacto de Instagram: ${createError?.message}`);
      }
      contactId = newContact.id;
      isAiActive = newContact.is_ai_active;
    }

    // Guardar mensaje entrante de Instagram
    const { data: insertedMsg } = await (supabaseAdmin.from('messages') as any)
      .insert({
        contact_id: contactId,
        sender_type: 'lead',
        content: sanitizedContent,
        meta_message_id: metaMessageId,
        channel: 'instagram',
      })
      .select('id, created_at')
      .single();

    const isSubscriptionActive =
      organization.is_active !== false &&
      (organization.subscription_status === 'active' || organization.subscription_status === 'trialing');

    // Procesamiento en segundo plano con Buffer Anti-Burst (3.5s Debounce)
    if (isSubscriptionActive && isAiActive) {
      waitUntil(
        (async () => {
          try {
            await new Promise((resolve) => setTimeout(resolve, 3500));

            // Verificar si entró otro mensaje más reciente
            if (insertedMsg?.id) {
              const { data: latestMsg } = await (supabaseAdmin.from('messages') as any)
                .select('id')
                .eq('contact_id', contactId)
                .eq('sender_type', 'lead')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (latestMsg && latestMsg.id !== insertedMsg.id) {
                console.log(`[INSTAGRAM DEBOUNCE] Mensaje ${metaMessageId} omitido; worker posterior atenderá la ráfaga.`);
                return;
              }
            }

            const decryptedToken = decryptSecret(organization.instagram_access_token || '');

            // Procesar con Gemini Flash
            const aiResponseText = await OpenAIService.processLeadMessage({
              contactId,
              organizationId: orgId,
              leadPhone: `ig_${senderId}`,
              leadName: 'Usuario Instagram',
              systemPromptConfig: organization.system_prompt,
              handoffMode: organization.handoff_mode || 'message',
              afterHoursMessage: organization.after_hours_message || null,
              businessHours: organization.business_hours || null,
              aiProvider: organization.ai_provider || null,
              enabledModules: organization.enabled_modules || null,
            });

            if (decryptedToken && aiResponseText && aiResponseText.trim() !== '') {
              const outboundMid = await InstagramService.sendDirectMessage({
                instagramAccountId: recipientId,
                accessToken: decryptedToken,
                recipientId: senderId,
                text: aiResponseText,
              });

              await (supabaseAdmin.from('messages') as any).insert({
                contact_id: contactId,
                sender_type: 'ai',
                content: aiResponseText,
                meta_message_id: outboundMid || null,
                channel: 'instagram',
              });
            }
          } catch (asyncErr) {
            console.error('[INSTAGRAM ASYNC WORKER ERROR]', asyncErr);
          }
        })()
      );
    }

    return NextResponse.json({ status: 'success' }, { status: 200 });
  } catch (error: any) {
    console.error('[INSTAGRAM WEBHOOK ERROR]', error);
    return NextResponse.json({ error: error?.message || 'Internal processing error' }, { status: 500 });
  }
}

