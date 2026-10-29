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

/**
 * 1. GET: Handshake de verificación inicial de Meta WhatsApp Webhook.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'synqo_webhook_2026';

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

  // B. Descartar notificaciones de estado (sent, delivered, read) para evitar ecos y bucles
  if (value.statuses && (!value.messages || value.messages.length === 0)) {
    return NextResponse.json({ status: 'status_update_acknowledged' }, { status: 200 });
  }

  const incomingMessage = value.messages?.[0];
  if (!incomingMessage) {
    return NextResponse.json({ status: 'no_incoming_message' }, { status: 200 });
  }

  // C. Filtrar tipos de mensajes
  const msgType = incomingMessage.type;
  // Descartar reacciones silenciosamente (no requieren procesamiento ni IA)
  if (msgType === 'reaction') {
    return NextResponse.json({ status: 'reaction_acknowledged' }, { status: 200 });
  }

  const supportedTypes = ['text', 'audio', 'button', 'interactive', 'image', 'document', 'location'];
  if (!supportedTypes.includes(msgType)) {
    return NextResponse.json({ status: 'unsupported_message_type_ignored' }, { status: 200 });
  }

  const metaMessageId = incomingMessage.id;
  const leadPhone = incomingMessage.from;
  const leadName = value.contacts?.[0]?.profile?.name || 'Lead WhatsApp';
  const phoneNumberId = value.metadata?.phone_number_id;

  if (!phoneNumberId || !leadPhone) {
    return NextResponse.json({ error: 'Missing phoneNumberId or leadPhone in metadata' }, { status: 400 });
  }

  // D. Control de Tasa (Rate Limiting) y Prevención de Wallet Exhaustion
  const rateLimitResult = await checkRateLimit(`phone:${leadPhone}`);
  if (!rateLimitResult.success) {
    console.warn(`[RATE LIMIT EXCEEDED] Remitente ${leadPhone} excedió el límite de 15 msgs/min.`);
    return NextResponse.json({ status: 'rate_limited' }, { status: 200 });
  }

  try {
    // E. Identificar la Organización dueña del WABA Phone Number ID
    const { data: organization, error: orgError } = await (supabaseAdmin.from('organizations') as any)
      .select('id, name, subscription_status, is_active, whatsapp_access_token, whatsapp_app_secret, system_prompt, handoff_mode, after_hours_message, business_hours')
      .eq('whatsapp_phone_number_id', phoneNumberId)
      .single();

    if (orgError || !organization) {
      console.error(`[ORG NOT FOUND] No hay organización vinculada al phone_number_id: ${phoneNumberId}`);
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // F. Verificación Criptográfica Multi-tenant (App Secret por Organización con fallback a env global)
    let secretToVerify = process.env.META_APP_SECRET || '';
    if (organization.whatsapp_app_secret) {
      try {
        secretToVerify = decryptSecret(organization.whatsapp_app_secret);
      } catch (err) {
        console.warn(`[WEBHOOK] Error desencriptando whatsapp_app_secret para org "${organization.name}":`, err);
      }
    }

    if (secretToVerify) {
      const isValidSignature = verifyMetaSignature(rawBody, signature, secretToVerify);
      if (!isValidSignature) {
        console.error(`[SECURITY ALERT] Firma HMAC inválida rechazada para org "${organization.name}".`);
        return new NextResponse('Unauthorized: Invalid HMAC signature', { status: 401 });
      }
    } else {
      console.warn(`[SECURITY NOTE] Webhook procesado sin validación HMAC (ni la org ni el servidor tienen App Secret configurado).`);
    }

    const orgId = organization.id;

    // F2. Procesar contenido del mensaje: Texto, Botones, Interactivo, Multimedia o Notas de Voz
    let rawContent = '';
    if (msgType === 'text') {
      rawContent = incomingMessage.text?.body || '';
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
      const caption = incomingMessage.image?.caption;
      rawContent = caption ? `📷 [Foto]: ${caption}` : '📷 [Foto recibida]';
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
          const transcription = await OpenAIService.transcribeAudio(media.buffer, media.mimeType);
          rawContent = transcription ? `🎤 [Nota de voz]: "${transcription}"` : '🎤 [Nota de voz inaudible]';
        } catch (audioErr: any) {
          console.error('[WHATSAPP AUDIO TRANSCRIPTION ERROR]', audioErr);
          rawContent = '🎤 [Nota de voz no reproducible]';
        }
      } else {
        rawContent = '🎤 [Nota de voz]';
      }
    }

    const sanitizedContent = sanitizeLeadMessage(rawContent);

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
      // Asignación automática por disponibilidad (Load Balancing) con fallback a cola del Admin
      const bestAgentId = await AssignmentService.findBestAvailableAgent(orgId);

      const { data: newContact, error: createError } = await (supabaseAdmin.from('contacts') as any)
        .insert({
          organization_id: orgId,
          phone: leadPhone,
          name: leadName,
          pipeline_stage: 'nuevo',
          is_ai_active: true,
          assigned_to: bestAgentId || null,
          last_interaction_at: new Date().toISOString(),
        })
        .select('id, is_ai_active, assigned_to')
        .single();

      if (createError || !newContact) {
        throw new Error(`Error creando nuevo contacto: ${createError?.message}`);
      }
      contactId = newContact.id;
      isAiActive = newContact.is_ai_active;

      // Si se asignó a un agente disponible, registrar auditoría interna
      if (bestAgentId) {
        const { data: assignedAgent } = await (supabaseAdmin.from('profiles') as any)
          .select('full_name')
          .eq('id', bestAgentId)
          .single();

        await (supabaseAdmin.from('messages') as any).insert({
          contact_id: contactId,
          sender_type: 'system',
          content: `[Sistema: Lead asignado automáticamente a ${assignedAgent?.full_name || 'Agente'}]`,
        });
      }
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

            // 1. Marcar como leído en WhatsApp (doble tilde azul)
            if (decryptedWhatsAppToken) {
              await WhatsAppService.markAsRead(phoneNumberId, decryptedWhatsAppToken, metaMessageId);
            }

            // 🛡️ REGLA OPERATIVA ANTI-NO-SHOW: Detección Determinística de Confirmación de Cita
            const isConfirmButton = rawContent.includes('btn_confirm_appt') || rawContent.includes('Confirmar Cita');
            const confirmationPattern = /\b(s[ií]|confirmo|confirmad[ao]|confirmar|all[aá]\s+(estoy|nos\s+vemos|estar[eé])|asistir[eé]|listo\s+confirmo)\b/i;
            const isConfirmationText = confirmationPattern.test(sanitizedContent);

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
                // Actualizar estado de confirmación a confirmed
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

                // Notificar en el chat interno al especialista
                if (pendingAppt.specialist_id) {
                  try {
                    await (supabaseAdmin.from('internal_chat_messages') as any).insert({
                      organization_id: orgId,
                      specialist_id: pendingAppt.specialist_id,
                      sender_type: 'admin',
                      sender_name: 'Sistema Synqo',
                      content: `✅ Asistencia confirmada: ${leadName} confirmó su cita de las ${startFormatted} (${pendingAppt.service_name}).`,
                    });
                  } catch (chatErr) {
                    console.warn('[WEBHOOK] Error notificando confirmación a colaborador:', chatErr);
                  }
                }
              }
            }

            // Detección Determinística de Solicitud de Asesor Humano (Cero Fuga)
            const humanHandoffPatterns = [
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

            const isDirectHandoffRequest = humanHandoffPatterns.some((p) => p.test(sanitizedContent));

            let aiResponseText = '';

            if (isDirectHandoffRequest) {
              // Apagar la IA determinísticamente para activar la campana y notificaciones
              await supabaseAdmin
                .from('contacts')
                .update({
                  is_ai_active: false,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', contactId);

              // Registrar nota interna en el CRM para el asesor
              await supabaseAdmin.from('messages').insert({
                contact_id: contactId,
                sender_type: 'system',
                content: '[🚨 Relevo: Cliente solicita atención personalizada]',
              });

              if (organization.handoff_mode !== 'silent') {
                aiResponseText =
                  '¡Claro que sí! Con gusto te comunico con uno de nuestros asesores para que te atienda personalmente. Ya mismo le paso tu conversación.';
              } else {
                // Silencio total: el humano atiende directamente sin mensaje artificial
                aiResponseText = '';
              }
            } else {
              // Calcular si está fuera de horario laboral (hora Colombia)
              let isAfterHours = false;
              const bHours = organization.business_hours as any;
              if (bHours?.enabled) {
                try {
                  const nowBogota = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
                  const currentHourMin = `${String(nowBogota.getHours()).padStart(2, '0')}:${String(nowBogota.getMinutes()).padStart(2, '0')}`;
                  const currentDay = nowBogota.getDay() === 0 ? 7 : nowBogota.getDay();
                  const dayAllowed = Array.isArray(bHours.days) ? bHours.days.includes(currentDay) : true;
                  const timeAllowed = currentHourMin >= (bHours.start || '00:00') && currentHourMin <= (bHours.end || '23:59');
                  isAfterHours = !dayAllowed || !timeAllowed;
                } catch {}
              }

              // 2. Procesar con OpenAI y herramientas (Agenda Nativa + Pipeline Stage)
              aiResponseText = await OpenAIService.processLeadMessage({
                contactId,
                organizationId: orgId,
                leadPhone,
                leadName,
                systemPromptConfig: organization.system_prompt,
                handoffMode: organization.handoff_mode || 'message',
                afterHoursMessage: organization.after_hours_message || null,
                isAfterHours,
                businessHours: organization.business_hours || null,
              });
            }

            // 3. Enviar respuesta por WhatsApp (solo si hay texto para enviar; el relevo silencioso no manda nada)
            if (decryptedWhatsAppToken && aiResponseText && aiResponseText.trim() !== '') {
              try {
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
              } catch (sendError: any) {
                console.error('[WHATSAPP OUTBOUND SEND ERROR]', sendError);
                const errMessage = sendError?.message || '';
                if (errMessage.includes('190') || errMessage.includes('expired') || errMessage.includes('OAuthException')) {
                  await supabaseAdmin.from('messages').insert({
                    contact_id: contactId,
                    sender_type: 'system',
                    content: '⚠️ No se pudo enviar la respuesta de la IA porque el token de WhatsApp de Meta expiró. Reconecta la cuenta en Configuración.',
                  });
                }
              }
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

