import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { sanitizeLeadMessage } from '@/lib/security/sanitize';
import { verifyZapiWebhook, isValidMediaUrl } from '@/lib/security/verify-webhook';
import { decryptSecret } from '@/lib/security/encryption';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { MessagingService } from '@/services/messaging.service';
import { OpenAIService } from '@/services/openai.service';
import { AssignmentService } from '@/services/assignment.service';
import { NotificationService } from '@/lib/notifications/resend';

/**
 * 1. GET: Health-check y prueba de conectividad de webhook para Z-API.
 */
export async function GET() {
  return new NextResponse('Z-API Webhook Receptor Activo - Synqo CRM', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

/**
 * 2. POST: Ingesta de eventos, mensajes y estados de Z-API (WhatsApp QR).
 */
export async function POST(request: NextRequest) {
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return new NextResponse('Bad Request: Invalid JSON', { status: 400 });
  }

  // 1. Obtener el instanceId del cuerpo, query string o headers
  const { searchParams } = new URL(request.url);
  const instanceId =
    payload.instanceId ||
    payload.instance_id ||
    searchParams.get('instanceId') ||
    searchParams.get('instance_id') ||
    request.headers.get('x-instance-id');

  if (!instanceId || typeof instanceId !== 'string') {
    console.warn('[Z-API WEBHOOK] Petición rechazada: falta instanceId');
    return NextResponse.json({ error: 'Missing instanceId' }, { status: 400 });
  }

  // 2. Localizar la organización en Supabase
  const { data: organization } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name, subscription_status, is_active, whatsapp_provider, zapi_instance_id, zapi_token, zapi_client_token, zapi_status, zapi_anti_ban_mode, zapi_max_outbound_per_hour, system_prompt, handoff_mode, after_hours_message, business_hours, ai_provider')
    .eq('zapi_instance_id', instanceId.trim())
    .maybeSingle();

  if (!organization) {
    console.warn(`[Z-API WEBHOOK] No se encontró organización para instanceId: ${instanceId}`);
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  // 🛡️ VERIFICACIÓN CRIPTOGRÁFICA DE WEBHOOK (Anti-Suplantación de Z-API)
  const providedSecret = searchParams.get('secret');
  const providedClientToken =
    request.headers.get('client-token') ||
    request.headers.get('x-client-token') ||
    payload.clientToken;

  const decryptedClientToken = organization.zapi_client_token
    ? decryptSecret(organization.zapi_client_token)
    : null;
  const decryptedInstanceToken = organization.zapi_token
    ? decryptSecret(organization.zapi_token)
    : null;

  const isAuthorized = verifyZapiWebhook({
    instanceId: organization.zapi_instance_id,
    providedSecret,
    providedClientToken,
    decryptedClientToken,
    decryptedInstanceToken,
  });

  if (!isAuthorized) {
    console.error(`[SECURITY ALERT] Webhook Z-API rechazado: firma HMAC o Client-Token no coinciden para org "${organization.name}".`);
    return new NextResponse('Unauthorized: Invalid Z-API webhook signature or token', { status: 401 });
  }

  const orgId = organization.id;

  // 3. Manejo de Eventos de Estado (Conexión / Desconexión)
  const isConnectionEvent =
    payload.type === 'ConnectedCallback' ||
    payload.type === 'connected' ||
    payload.connected === true;

  const isDisconnectionEvent =
    payload.type === 'DisconnectedCallback' ||
    payload.type === 'disconnected' ||
    payload.connected === false;

  if (isConnectionEvent && !payload.messageId) {
    console.log(`[Z-API STATUS] Instancia ${instanceId || organization.zapi_instance_id} CONECTADA exitosamente para org "${organization.name}".`);
    await (supabaseAdmin.from('organizations') as any)
      .update({
        zapi_status: 'connected',
        zapi_phone_connected: payload.phone || null,
        zapi_last_heartbeat: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId);

    return NextResponse.json({ status: 'connection_status_updated' }, { status: 200 });
  }

  if (isDisconnectionEvent && !payload.messageId) {
    console.warn(`[Z-API STATUS ALERTA] Instancia ${instanceId || organization.zapi_instance_id} DESCONECTADA para org "${organization.name}".`);
    await (supabaseAdmin.from('organizations') as any)
      .update({
        zapi_status: 'disconnected',
        zapi_last_heartbeat: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId);

    // 🛡️ NOTIFICACIÓN PROACTIVA AL ADMINISTRADOR (Resend)
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
          provider: 'zapi',
          reason: 'El celular comercial perdió conexión Wi-Fi, se apagó o WhatsApp cerró la sesión web de la instancia.',
        })
      );
    }

    return NextResponse.json({ status: 'disconnection_status_updated' }, { status: 200 });
  }

  // Ignorar mensajes de grupos si la configuración no los requiere
  if (payload.isGroup) {
    return NextResponse.json({ status: 'group_message_ignored' }, { status: 200 });
  }

  const messageId = payload.messageId || payload.zaapId || payload.id || payload.wamid;

  // Extraer el teléfono del remitente o chat
  let rawPhone =
    payload.phone ||
    payload.senderPhone ||
    (payload.fromMe ? (payload.phone || payload.to) : payload.from) ||
    '';

  if (!rawPhone && payload.chatId && !payload.chatId.includes('@g.us')) {
    rawPhone = payload.chatId.replace('@c.us', '').replace('@s.whatsapp.net', '');
  }

  const cleanPhone = rawPhone.replace(/[^\d]/g, '');
  if (!cleanPhone || !messageId) {
    return NextResponse.json({ status: 'ignored_unrecognized_event' }, { status: 200 });
  }

  const leadPhone = cleanPhone;

  // 4. FILTRO CRÍTICO: Detección de Mensajes Propios (fromMe: true)
  // Permite la coexistencia natural bot-humano.
  if (payload.fromMe === true) {
    // Verificar si este mensaje fue emitido por la IA o asesor desde Synqo
    const { data: existingMsg } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('meta_message_id', messageId)
      .maybeSingle();

    if (existingMsg) {
      // Es el eco del mensaje que nuestro propio CRM/bot envió. Ignorar para evitar bucles.
      return NextResponse.json({ status: 'bot_echo_ignored' }, { status: 200 });
    }

    // Si NO fue enviado por Synqo, significa que el ASESOR HUMANO escribió directamente desde el celular
    console.log(`[Z-API HUMAN TAKEOVER] Asesor intervino desde el celular en el chat con ${leadPhone}.`);

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
          last_interaction_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', contact.id);

      // 2. Extraer el texto del mensaje enviado por el humano
      const rawText =
        payload.text?.message ||
        payload.text ||
        payload.message ||
        payload.extendedTextMessage?.text ||
        payload.buttonsResponseMessage?.message ||
        '[Mensaje enviado desde WhatsApp móvil]';

      // 3. Registrar el mensaje en el CRM para que el inbox quede perfectamente sincronizado en tiempo real
      await (supabaseAdmin.from('messages') as any).insert({
        contact_id: contact.id,
        sender_type: 'agent_manual',
        content: typeof rawText === 'string' ? rawText : JSON.stringify(rawText),
        meta_message_id: messageId,
        channel: 'whatsapp',
      });

      // 4. Registrar auditoría interna en la conversación
      await (supabaseAdmin.from('messages') as any).insert({
        contact_id: contact.id,
        sender_type: 'system',
        content: '[Sistema: Asesor intervino desde el celular. IA pausada automáticamente.]',
        channel: 'whatsapp',
      });
    }

    return NextResponse.json({ status: 'human_intervention_recorded' }, { status: 200 });
  }

  // 5. Rate Limiting por Remitente (Prevención de abusos)
  const rateLimitResult = await checkRateLimit(`phone:${leadPhone}`);
  if (!rateLimitResult.success) {
    console.warn(`[RATE LIMIT EXCEEDED] Remitente ${leadPhone} excedió el límite de mensajes.`);
    return NextResponse.json({ status: 'rate_limited' }, { status: 200 });
  }

  // 6. Extracción Robusta de Contenido del Mensaje
  let rawContent = '';
  if (typeof payload.text === 'string' && payload.text.trim()) {
    rawContent = payload.text.trim();
  } else if (payload.text?.message && typeof payload.text.message === 'string') {
    rawContent = payload.text.message.trim();
  } else if (typeof payload.message === 'string' && payload.message.trim()) {
    rawContent = payload.message.trim();
  } else if (payload.extendedTextMessage?.text) {
    rawContent = payload.extendedTextMessage.text.trim();
  } else if (payload.buttonsResponseMessage?.message) {
    rawContent = payload.buttonsResponseMessage.message.trim();
  } else if (payload.buttonsResponseMessage?.buttonId) {
    rawContent = payload.buttonsResponseMessage.buttonId.trim();
  } else if (payload.listResponseMessage?.title) {
    rawContent = payload.listResponseMessage.title.trim();
  } else if (payload.listResponseMessage?.singleSelectReply?.selectedRowId) {
    rawContent = payload.listResponseMessage.singleSelectReply.selectedRowId.trim();
  } else if (typeof payload.body === 'string' && payload.body.trim()) {
    rawContent = payload.body.trim();
  } else if (payload.audio?.audioUrl || payload.audio?.url || payload.voice?.audioUrl) {
    // Nota de voz entrante vía Z-API con Whisper
    try {
      const audioUrl = payload.audio?.audioUrl || payload.audio?.url || payload.voice?.audioUrl;
      // 🛡️ BLINDAJE ANTI-SSRF: Validar que el dominio provenga exclusivamente de Z-API o Meta CDN autorizados
      if (!isValidMediaUrl(audioUrl)) {
        console.warn('[SECURITY WARNING] Host de nota de voz no autorizado o intento de SSRF bloqueado:', audioUrl);
        rawContent = '🎤 [Nota de voz recibida - audio externo bloqueado por seguridad]';
      } else {
        const audioRes = await fetch(audioUrl);
        if (audioRes.ok) {
          const arrayBuf = await audioRes.arrayBuffer();
          const transcription = await OpenAIService.transcribeAudio(
            Buffer.from(arrayBuf),
            payload.audio?.mimeType || 'audio/ogg'
          );
          rawContent = transcription ? `🎤 [Nota de voz]: "${transcription}"` : '🎤 [Nota de voz inaudible]';
        } else {
          rawContent = '🎤 [Nota de voz recibida]';
        }
      }
    } catch (audioErr) {
      console.warn('[Z-API AUDIO TRANSCRIPTION ERROR]', audioErr);
      rawContent = '🎤 [Nota de voz recibida]';
    }
  } else if (payload.image?.imageUrl || payload.image?.url) {
    const caption = payload.image?.caption || '';
    rawContent = caption ? `📷 [Foto]: ${caption}` : '📷 [Foto recibida]';
  } else if (payload.document?.documentUrl || payload.document?.url) {
    const fileName = payload.document?.fileName || 'Archivo';
    rawContent = `📄 [Documento recibido: ${fileName}]`;
  } else if (payload.location) {
    rawContent = `📍 [Ubicación compartida: lat ${payload.location.latitude}, lng ${payload.location.longitude}]`;
  } else {
    rawContent = '[Mensaje no reproducible]';
  }

  const sanitizedContent = sanitizeLeadMessage(rawContent);
  const leadName =
    payload.senderName ||
    payload.pushName ||
    payload.chatName ||
    payload.name ||
    'Lead WhatsApp';

  // 7. Blindaje de Rentabilidad (Estado de suscripción activo)
  const isSubscriptionActive =
    organization.is_active !== false &&
    (organization.subscription_status === 'active' || organization.subscription_status === 'trialing');

  // 8. Deduplicación por messageId
  const { data: existingMessage } = await supabaseAdmin
    .from('messages')
    .select('id')
    .eq('meta_message_id', messageId)
    .maybeSingle();

  if (existingMessage) {
    return NextResponse.json({ status: 'duplicate_message_ignored' }, { status: 200 });
  }

  // 9. Upsert del Contacto
  let contactId: string;
  let isAiActive = true;

  const { data: existingContact } = await supabaseAdmin
    .from('contacts')
    .select('id, name, is_ai_active')
    .eq('organization_id', orgId)
    .or(`phone.eq.${leadPhone},phone.eq.+${leadPhone}`)
    .maybeSingle();

  if (existingContact) {
    contactId = existingContact.id;
    isAiActive = existingContact.is_ai_active;

    const contactUpdate: any = {
      last_interaction_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (leadName && leadName !== 'Lead WhatsApp') {
      contactUpdate.name = leadName;
    }

    await supabaseAdmin
      .from('contacts')
      .update(contactUpdate)
      .eq('id', contactId);
  } else {
    const bestAgentId = await AssignmentService.findBestAvailableAgent(orgId);

    const { data: newContact, error: createError } = await (supabaseAdmin.from('contacts') as any)
      .insert({
        organization_id: orgId,
        phone: leadPhone,
        name: leadName,
        pipeline_stage: 'nuevo',
        is_ai_active: true,
        channel: 'whatsapp',
        assigned_to: bestAgentId || null,
        last_interaction_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id, is_ai_active, assigned_to')
      .single();

    if (createError || !newContact) {
      throw new Error(`Error creando nuevo contacto: ${createError?.message}`);
    }
    contactId = newContact.id;
    isAiActive = newContact.is_ai_active;

    if (bestAgentId) {
      const { data: assignedAgent } = await (supabaseAdmin.from('profiles') as any)
        .select('full_name')
        .eq('id', bestAgentId)
        .single();

      await (supabaseAdmin.from('messages') as any).insert({
        contact_id: contactId,
        sender_type: 'system',
        content: `[Sistema: Lead asignado automáticamente a ${assignedAgent?.full_name || 'Agente'}]`,
        channel: 'whatsapp',
      });
    }
  }

  // 10. Persistir el Mensaje Entrante
  const { data: insertedMsg } = await supabaseAdmin
    .from('messages')
    .insert({
      contact_id: contactId,
      sender_type: 'lead',
      content: sanitizedContent,
      meta_message_id: messageId,
      channel: 'whatsapp',
    })
    .select('id, created_at')
    .single();

  // 11. Procesamiento Asíncrono de IA con waitUntil
  if (isSubscriptionActive && isAiActive) {
    waitUntil(
      (async () => {
        try {
          // Anti-Burst Buffer (Debounce de 3.5 segundos)
          await new Promise((resolve) => setTimeout(resolve, 3500));

          if (insertedMsg?.id) {
            const { data: latestMsg } = await supabaseAdmin
              .from('messages')
              .select('id')
              .eq('contact_id', contactId)
              .eq('sender_type', 'lead')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (latestMsg && latestMsg.id !== insertedMsg.id) {
              console.log(`[Z-API DEBOUNCE] Mensaje ${messageId} omitido; worker posterior atenderá la ráfaga.`);
              return;
            }
          }

          // Detección Determinística de Confirmación de Cita
          const isConfirmButton = rawContent.includes('btn_confirm_appt') || rawContent.includes('Confirmar Cita');
          const confirmationPattern = /\b(s[ií]|confirmo|confirmad[ao]|confirmar|all[aá]\s+(estoy|nos\s+vemos|estar[eé])|asistir[eé]|listo\s+confirmo)\b/i;
          const isConfirmationText = confirmationPattern.test(sanitizedContent);

          if (isConfirmButton || isConfirmationText) {
            const nowIso = new Date().toISOString();
            const { data: pendingAppt } = await (supabaseAdmin.from('appointments') as any)
              .select('id, service_name, start_time, specialist_id, confirmation_status')
              .eq('contact_id', contactId)
              .eq('organization_id', orgId)
              .eq('status', 'confirmed')
              .eq('confirmation_status', 'unconfirmed')
              .gte('start_time', nowIso)
              .order('start_time', { ascending: true })
              .limit(1)
              .maybeSingle();

            if (pendingAppt) {
              await (supabaseAdmin.from('appointments') as any)
                .update({
                  confirmation_status: 'confirmed',
                  confirmed_at: nowIso,
                  updated_at: nowIso,
                })
                .eq('id', pendingAppt.id);

              const dateFormatted = new Date(pendingAppt.start_time).toLocaleTimeString('es-CO', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              });

              const confirmText = `¡Excelente! Tu cita para ${pendingAppt.service_name} a las ${dateFormatted} ha quedado formalmente confirmada. ¡Te esperamos puntualmente! ✨`;

              const outboundId = await MessagingService.sendTextMessage({
                organization,
                to: leadPhone,
                body: confirmText,
                simulateTyping: true,
              });

              await supabaseAdmin.from('messages').insert({
                contact_id: contactId,
                sender_type: 'ai',
                content: confirmText,
                meta_message_id: outboundId,
                channel: 'whatsapp',
              });
              return;
            }
          }

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

          // Procesar con motor de IA dual (Gemini Flash / OpenAI Backup) y herramientas nativas
          const aiResponseText = await OpenAIService.processLeadMessage({
            contactId,
            organizationId: orgId,
            leadPhone,
            leadName,
            systemPromptConfig: organization.system_prompt,
            handoffMode: organization.handoff_mode || 'message',
            afterHoursMessage: organization.after_hours_message || null,
            isAfterHours,
            businessHours: organization.business_hours || null,
            aiProvider: organization.ai_provider || null,
          });

          if (aiResponseText && aiResponseText.trim() !== '') {
            try {
              const outboundId = await MessagingService.sendTextMessage({
                organization,
                to: leadPhone,
                body: aiResponseText,
                simulateTyping: true,
              });

              await supabaseAdmin.from('messages').insert({
                contact_id: contactId,
                sender_type: 'ai',
                content: aiResponseText,
                meta_message_id: outboundId,
                channel: 'whatsapp',
              });

              await supabaseAdmin
                .from('contacts')
                .update({
                  last_interaction_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', contactId);
            } catch (sendErr: any) {
              console.error('[Z-API OUTBOUND SEND ERROR]', sendErr);
              const errMsg = sendErr?.message || '';
              const isDisconnected =
                errMsg.toLowerCase().includes('disconnected') ||
                errMsg.toLowerCase().includes('405') ||
                errMsg.toLowerCase().includes('desconectad');
              await supabaseAdmin.from('messages').insert({
                contact_id: contactId,
                sender_type: 'system',
                content: `⚠️ [Alerta Z-API]: No se pudo entregar la respuesta de la IA (${isDisconnected ? 'Celular o instancia desconectada de WhatsApp' : 'Error de comunicación con Z-API'}). Revisa la conexión en Configuración.`,
                channel: 'whatsapp',
              });
            }
          }
        } catch (workerErr: any) {
          console.error('[Z-API ASYNC WORKER ERROR]', workerErr);
        }
      })()
    );
  }

  return NextResponse.json({ status: 'success' }, { status: 200 });
}
