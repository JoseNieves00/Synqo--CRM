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
import { formatImageMessageContent, isPaymentReceiptHint } from '@/lib/media/format';
import { uploadIncomingChatMedia } from '@/lib/media/storage';

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

  // 4. Manejo de Eventos de Mensajes (messages.upsert)
  const isMessageUpsert =
    event === 'messages.upsert' ||
    event === 'messages_upsert' ||
    payload.data?.key?.id;

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

      // 2. Extraer el texto del mensaje enviado por el humano
      const msgObj = messageData.message || {};
      const rawText =
        msgObj.conversation ||
        msgObj.extendedTextMessage?.text ||
        msgObj.buttonsResponseMessage?.selectedDisplayText ||
        '[Mensaje enviado desde WhatsApp móvil]';

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
    // 🎙️ Nota de voz entrante vía Evolution API -> Transcripción con OpenAI Whisper
    try {
      const finalApiKey = decryptedApiKey || process.env.EVOLUTION_API_KEY?.trim() || '';
      const media = await EvolutionService.getBase64Audio({
        apiUrl: organization.evolution_api_url,
        apiKey: finalApiKey,
        instanceName: cleanInstance,
        messageId,
      });

      if (media?.base64) {
        const audioBuffer = Buffer.from(media.base64, 'base64');
        const transcription = await OpenAIService.transcribeAudio(
          audioBuffer,
          media.mimetype || 'audio/mp4'
        );
        rawContent = transcription ? `🎤 [Nota de voz]: "${transcription}"` : '🎤 [Nota de voz inaudible]';
      } else {
        rawContent = '🎤 [Nota de voz recibida]';
      }
    } catch (audioErr) {
      console.warn('[EVOLUTION AUDIO TRANSCRIPTION ERROR]', audioErr);
      rawContent = '🎤 [Nota de voz recibida]';
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
  } else if (msgObj.documentMessage) {
    const fileName = msgObj.documentMessage.fileName || 'Archivo';
    rawContent = `📄 [Documento recibido: ${fileName}]`;
  } else if (msgObj.locationMessage) {
    rawContent = `📍 [Ubicación compartida: lat ${msgObj.locationMessage.degreesLatitude}, lng ${msgObj.locationMessage.degreesLongitude}]`;
  } else {
    rawContent = '[Mensaje no reproducible]';
  }

  const sanitizedContent = sanitizeLeadMessage(rawContent);
  const leadName = messageData.pushName || 'Lead WhatsApp';
  const isPaymentReceipt = Boolean(msgObj.imageMessage && isPaymentReceiptHint(msgObj.imageMessage.caption || ''));

  // 8. Blindaje de Rentabilidad (Estado de suscripción activo)
  const isSubscriptionActive =
    organization.is_active !== false &&
    (organization.subscription_status === 'active' || organization.subscription_status === 'trialing');

  // 9. Deduplicación por messageId
  const { data: existingMessage } = await supabaseAdmin
    .from('messages')
    .select('id')
    .eq('meta_message_id', messageId)
    .maybeSingle();

  if (existingMessage) {
    return NextResponse.json({ status: 'duplicate_message_ignored' }, { status: 200 });
  }

  // 10. Upsert del Contacto
  let contactId: string;
  let isAiActive = true;

  const { data: existingContact } = await supabaseAdmin
    .from('contacts')
    .select('id, name, is_ai_active, custom_fields')
    .eq('organization_id', orgId)
    .or(`phone.eq.${leadPhone},phone.eq.+${leadPhone}`)
    .maybeSingle();

  if (existingContact) {
    contactId = existingContact.id;
    isAiActive = existingContact.is_ai_active;

    const contactUpdate: any = {
      last_interaction_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      custom_fields: {
        ...((existingContact.custom_fields as Record<string, any>) || {}),
        remote_jid: remoteJid,
      },
    };
    if (leadName && leadName !== 'Lead WhatsApp') {
      contactUpdate.name = leadName;
    }
    if (isPaymentReceipt) {
      contactUpdate.is_ai_active = false;
      isAiActive = false;
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
        is_ai_active: !isPaymentReceipt,
        channel: 'whatsapp',
        assigned_to: bestAgentId || null,
        custom_fields: { remote_jid: remoteJid },
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

  // 11. Persistir el Mensaje Entrante
  const { data: insertedMsg, error: insertMsgError } = await supabaseAdmin
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

  if (insertMsgError) {
    if ((insertMsgError as any).code === '23505') {
      return NextResponse.json({ status: 'duplicate_message_ignored' }, { status: 200 });
    }
    console.warn('[EVOLUTION WEBHOOK INSERT MSG ERROR]', insertMsgError);
  }

  if (isPaymentReceipt) {
    await supabaseAdmin.from('messages').insert({
      contact_id: contactId,
      sender_type: 'system',
      content: '[🚨 Comprobante de pago recibido en imagen: Asesor humano requerido para verificar extracto bancario. IA pausada.]',
      channel: 'whatsapp',
    });
  }

  // 12. Procesamiento Asíncrono de IA con waitUntil
  if (isSubscriptionActive && isAiActive && !isRateLimited) {
    waitUntil(
      (async () => {
        try {
          // Anti-Burst Buffer (Debounce de 3.5 segundos para agrupar mensajes continuos)
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
              console.log(`[EVOLUTION DEBOUNCE] Mensaje ${messageId} omitido; worker posterior atenderá la ráfaga.`);
              return;
            }
          }

          // Detección Determinística de Confirmación de Cita
          const isConfirmButton = rawContent.includes('btn_confirm_appt') || rawContent.includes('Confirmar Cita');
          const confirmationPattern =
            /\b(s[ií]|confirmo|confirmad[ao]|confirmar|all[aá]\s+(estoy|nos\s+vemos|estar[eé])|asistir[eé]|listo\s+confirmo)\b/i;
          const negationOrChangePattern =
            /\b(pero|cambiar|cambio|cancelar|cancela|otra fecha|otro d[ií]a|otra hora|no puedo|no voy|no llego|reprogramar|posponer)\b/i;
          const hasNegationOrChange = negationOrChangePattern.test(sanitizedContent);
          const isConfirmationText = confirmationPattern.test(sanitizedContent) && !hasNegationOrChange;

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
                to: targetRecipient || leadPhone,
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
              const timeAllowed =
                currentHourMin >= (bHours.start || '00:00') && currentHourMin <= (bHours.end || '23:59');
              isAfterHours = !dayAllowed || !timeAllowed;
            } catch {}
          }

          // Procesar con motor de IA dual (Gemini Flash / OpenAI Backup)
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
            enabledModules: organization.enabled_modules || null,
            timezone: organization.appointment_settings?.timezone || organization.business_hours?.timezone || 'America/Bogota',
          });

          // Re-verificar si un asesor humano intervino o pausó la IA durante la inferencia
          const { data: latestContactState } = await supabaseAdmin
            .from('contacts')
            .select('is_ai_active')
            .eq('id', contactId)
            .single();

          if (latestContactState && !latestContactState.is_ai_active) {
            console.log(`[EVOLUTION AI ABORT] Asesor tomó el chat con ${leadPhone} durante inferencia. Respuesta cancelada.`);
            return;
          }

          if (aiResponseText && aiResponseText.trim() !== '') {
            try {
              const outboundId = await MessagingService.sendTextMessage({
                organization,
                to: targetRecipient || leadPhone,
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
            } catch (sendErr: any) {
              console.error('[EVOLUTION AI REPLY DISPATCH FAILED]', sendErr);
            }
          }
        } catch (workerErr: any) {
          console.error('[EVOLUTION ASYNC WORKER FAILED]', workerErr);
        }
      })()
    );
  }

  return NextResponse.json({ status: 'success' }, { status: 200 });
}

