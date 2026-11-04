'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { encryptSecret, decryptSecret } from '@/lib/security/encryption';
import { ZApiService } from '@/services/zapi.service';
import { revalidatePath } from 'next/cache';

async function checkAdminAuth() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('No autorizado');
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && !profile.is_super_admin)) {
    throw new Error('Solo los administradores pueden gestionar la conexión de WhatsApp.');
  }

  const orgId = profile.organization_id;
  if (!orgId) throw new Error('Organización no encontrada.');

  return { user, profile, orgId };
}

/**
 * Guarda las credenciales de Z-API de la organización y autoconfigura los webhooks.
 */
export async function saveZapiCredentials({
  instanceId,
  token,
  clientToken,
  whatsappProvider = 'zapi',
  antiBanMode = true,
  maxOutboundPerHour = 20,
}: {
  instanceId: string;
  token?: string;
  clientToken?: string;
  whatsappProvider?: 'meta' | 'zapi';
  antiBanMode?: boolean;
  maxOutboundPerHour?: number;
}) {
  const { orgId } = await checkAdminAuth();

  const updatePayload: any = {
    whatsapp_provider: whatsappProvider,
    zapi_instance_id: instanceId.trim() || null,
    zapi_anti_ban_mode: antiBanMode,
    zapi_max_outbound_per_hour: maxOutboundPerHour,
    updated_at: new Date().toISOString(),
  };

  if (token && token.trim()) {
    updatePayload.zapi_token = encryptSecret(token.trim());
  }

  if (clientToken && clientToken.trim()) {
    updatePayload.zapi_client_token = encryptSecret(clientToken.trim());
  }

  const { error } = await (supabaseAdmin.from('organizations') as any)
    .update(updatePayload)
    .eq('id', orgId);

  if (error) {
    throw new Error(`Error guardando credenciales de Z-API: ${error.message}`);
  }

  // Intentar autoconfigurar webhooks si tenemos credenciales
  let webhookFeedback = '';
  if (instanceId && token) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://synqo.dev';
    const webhookUrl = `${appUrl}/api/webhooks/whatsapp/zapi?instanceId=${encodeURIComponent(instanceId.trim())}`;

    try {
      const configRes = await ZApiService.configureWebhooks({
        instanceId: instanceId.trim(),
        token: token.trim(),
        clientToken: clientToken?.trim(),
        webhookUrl,
      });

      if (configRes.success) {
        webhookFeedback = 'Webhooks configurados automáticamente en Z-API.';
      } else {
        webhookFeedback = `Advertencia en webhooks: ${configRes.errors.join(', ')}`;
      }
    } catch (e: any) {
      webhookFeedback = `No se pudo autoconfigurar webhooks en Z-API: ${e.message}`;
    }
  }

  revalidatePath('/settings');
  return { success: true, message: 'Configuración de Z-API guardada exitosamente.', webhookFeedback };
}

/**
 * Obtiene el código QR en tiempo real para renderizar en pantalla.
 */
export async function getZapiQrCode() {
  const { orgId } = await checkAdminAuth();

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('zapi_instance_id, zapi_token, zapi_client_token, zapi_status, zapi_phone_connected')
    .eq('id', orgId)
    .single();

  if (!org?.zapi_instance_id || !org?.zapi_token) {
    throw new Error('Primero debes guardar el Instance ID y Token de Z-API.');
  }

  const decryptedToken = decryptSecret(org.zapi_token);
  const decryptedClientToken = org.zapi_client_token
    ? decryptSecret(org.zapi_client_token)
    : undefined;

  // 1. Verificar si la instancia ya está conectada antes de solicitar QR
  try {
    const status = await ZApiService.getStatus({
      instanceId: org.zapi_instance_id,
      token: decryptedToken,
      clientToken: decryptedClientToken,
    });

    if (status.connected) {
      await (supabaseAdmin.from('organizations') as any)
        .update({
          zapi_status: 'connected',
          zapi_phone_connected: status.phone || org.zapi_phone_connected || null,
        })
        .eq('id', orgId);

      return {
        type: 'connected',
        value: '',
        connected: true,
        phone: status.phone,
        message: `Esta instancia de WhatsApp ya se encuentra vinculada exitosamente (${status.phone || ''}).`,
      };
    }
  } catch (statusErr) {
    console.warn('[Z-API STATUS CHECK BEFORE QR WARN]', statusErr);
  }

  // 2. Si no está conectada, solicitar el QR en vivo
  try {
    const qrData = await ZApiService.getQrCode({
      instanceId: org.zapi_instance_id,
      token: decryptedToken,
      clientToken: decryptedClientToken,
    });

    return qrData;
  } catch (qrErr: any) {
    const msg = qrErr?.message || '';
    if (
      msg === 'ALREADY_CONNECTED' ||
      msg.toLowerCase().includes('already connected') ||
      msg.toLowerCase().includes('conectada') ||
      msg.toLowerCase().includes('connected')
    ) {
      await (supabaseAdmin.from('organizations') as any)
        .update({ zapi_status: 'connected' })
        .eq('id', orgId);

      return {
        type: 'connected',
        value: '',
        connected: true,
        message: 'Esta instancia ya se encuentra vinculada a WhatsApp exitosamente.',
      };
    }
    throw qrErr;
  }
}

/**
 * Solicita el código de emparejamiento telefónico (Pairing Code) para vincular WhatsApp sin cámara.
 */
export async function getZapiPhoneCode(phone: string) {
  const { orgId } = await checkAdminAuth();

  const cleanPhone = (phone || '').replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 8) {
    throw new Error('Ingresa un número telefónico válido con indicativo de país (ej. 573001234567).');
  }

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('zapi_instance_id, zapi_token, zapi_client_token, zapi_status, zapi_phone_connected')
    .eq('id', orgId)
    .single();

  if (!org?.zapi_instance_id || !org?.zapi_token) {
    throw new Error('Primero debes guardar el Instance ID y Token de Z-API.');
  }

  const decryptedToken = decryptSecret(org.zapi_token);
  const decryptedClientToken = org.zapi_client_token
    ? decryptSecret(org.zapi_client_token)
    : undefined;

  // 1. Verificar si la instancia ya está conectada antes de solicitar el código
  try {
    const status = await ZApiService.getStatus({
      instanceId: org.zapi_instance_id,
      token: decryptedToken,
      clientToken: decryptedClientToken,
    });

    if (status.connected) {
      await (supabaseAdmin.from('organizations') as any)
        .update({
          zapi_status: 'connected',
          zapi_phone_connected: status.phone || org.zapi_phone_connected || null,
        })
        .eq('id', orgId);

      return {
        success: true,
        connected: true,
        code: '',
        phone: status.phone,
        message: `Esta instancia de WhatsApp ya se encuentra vinculada exitosamente (${status.phone || ''}).`,
      };
    }
  } catch (statusErr) {
    console.warn('[Z-API STATUS CHECK BEFORE PHONE CODE WARN]', statusErr);
  }

  // 2. Solicitar el código de vinculación por teléfono
  try {
    const result = await ZApiService.getPhoneCode({
      instanceId: org.zapi_instance_id,
      token: decryptedToken,
      clientToken: decryptedClientToken,
      phone: cleanPhone,
    });

    return {
      success: true,
      connected: false,
      code: result.code,
      message: 'Código de vinculación generado. Ingrésalo en tu WhatsApp.',
    };
  } catch (err: any) {
    const msg = err?.message || '';
    if (
      msg === 'ALREADY_CONNECTED' ||
      msg.toLowerCase().includes('already connected') ||
      msg.toLowerCase().includes('conectada') ||
      msg.toLowerCase().includes('connected')
    ) {
      await (supabaseAdmin.from('organizations') as any)
        .update({ zapi_status: 'connected' })
        .eq('id', orgId);

      return {
        success: true,
        connected: true,
        code: '',
        message: 'Esta instancia ya se encuentra vinculada a WhatsApp exitosamente.',
      };
    }
    throw err;
  }
}

/**
 * Consulta el estado de conexión de la instancia de Z-API.
 */
export async function getZapiConnectionStatus() {
  const { orgId } = await checkAdminAuth();

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('zapi_instance_id, zapi_token, zapi_client_token, zapi_status, zapi_phone_connected')
    .eq('id', orgId)
    .single();

  if (!org?.zapi_instance_id || !org?.zapi_token) {
    return { connected: false, error: 'Credenciales incompletas' };
  }

  const decryptedToken = decryptSecret(org.zapi_token);
  const decryptedClientToken = org.zapi_client_token
    ? decryptSecret(org.zapi_client_token)
    : undefined;

  const status = await ZApiService.getStatus({
    instanceId: org.zapi_instance_id,
    token: decryptedToken,
    clientToken: decryptedClientToken,
  });

  // Si cambió el estado, sincronizar en la base de datos
  const newStatus = status.connected ? 'connected' : 'disconnected';
  if (newStatus !== org.zapi_status || (status.phone && status.phone !== org.zapi_phone_connected)) {
    await (supabaseAdmin.from('organizations') as any)
      .update({
        zapi_status: newStatus,
        zapi_phone_connected: status.phone || org.zapi_phone_connected,
        zapi_last_heartbeat: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId);
  }

  return status;
}

/**
 * Desconecta la sesión activa de WhatsApp Web en Z-API.
 */
export async function disconnectZapiSession() {
  const { orgId } = await checkAdminAuth();

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('zapi_instance_id, zapi_token, zapi_client_token')
    .eq('id', orgId)
    .single();

  if (!org?.zapi_instance_id || !org?.zapi_token) {
    throw new Error('Instancia no configurada');
  }

  const decryptedToken = decryptSecret(org.zapi_token);
  const decryptedClientToken = org.zapi_client_token
    ? decryptSecret(org.zapi_client_token)
    : undefined;

  await ZApiService.disconnect({
    instanceId: org.zapi_instance_id,
    token: decryptedToken,
    clientToken: decryptedClientToken,
  });

  await (supabaseAdmin.from('organizations') as any)
    .update({
      zapi_status: 'disconnected',
      zapi_phone_connected: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId);

  revalidatePath('/settings');
  return { success: true };
}

/**
 * Importa de manera controlada los últimos chats de la instancia de WhatsApp conectada.
 * Modelo C: Máximo 50 chats, sin grupos, con IA apagada (is_ai_active: false) para máxima seguridad.
 */
export async function importRecentZapiChats() {
  const { orgId } = await checkAdminAuth();

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('zapi_instance_id, zapi_token, zapi_client_token, zapi_status')
    .eq('id', orgId)
    .single();

  if (!org?.zapi_instance_id || !org?.zapi_token) {
    throw new Error('Instancia de Z-API no configurada.');
  }

  if (org.zapi_status !== 'connected') {
    throw new Error('WhatsApp debe estar vinculado y conectado para importar conversaciones.');
  }

  const decryptedToken = decryptSecret(org.zapi_token);
  const decryptedClientToken = org.zapi_client_token
    ? decryptSecret(org.zapi_client_token)
    : undefined;

  const rawChats = await ZApiService.getRecentChats({
    instanceId: org.zapi_instance_id,
    token: decryptedToken,
    clientToken: decryptedClientToken,
    pageSize: 50,
  });

  if (!rawChats || rawChats.length === 0) {
    return {
      success: true,
      importedCount: 0,
      message: 'No se encontraron chats recientes en la línea o la instancia aún está sincronizando mensajes.',
    };
  }

  let importedCount = 0;
  let existingCount = 0;

  for (const chat of rawChats) {
    // 1. Filtrar grupos (@g.us o isGroup)
    const isGroup =
      chat.isGroup === true ||
      (typeof chat.phone === 'string' && chat.phone.includes('@g.us')) ||
      (typeof chat.chatId === 'string' && chat.chatId.includes('@g.us')) ||
      (typeof chat.id === 'string' && chat.id.includes('@g.us'));

    if (isGroup) continue;

    // 2. Normalizar número de teléfono
    const rawPhone = chat.phone || chat.chatId || chat.id || '';
    const cleanPhone = String(rawPhone).replace(/@c\.us|@s\.whatsapp\.net/g, '').replace(/[^\d]/g, '');

    if (!cleanPhone || cleanPhone.length < 7) continue;

    // 3. Extraer nombre
    const contactName = String(
      chat.name ||
      chat.contactName ||
      chat.pushName ||
      chat.verifiedName ||
      'Contacto WhatsApp'
    ).trim();

    // 4. Verificar si ya existe en la base de datos
    const { data: existingContact } = await (supabaseAdmin.from('contacts') as any)
      .select('id, name')
      .eq('organization_id', orgId)
      .or(`phone.eq.${cleanPhone},phone.eq.+${cleanPhone}`)
      .maybeSingle();

    let contactId: string | undefined = existingContact?.id;

    const timestamp = chat.lastMessage?.momment
      ? new Date(Number(chat.lastMessage.momment)).toISOString()
      : new Date().toISOString();

    if (!existingContact) {
      // 5. Crear contacto nuevo con IA apagada (is_ai_active: false)
      const { data: newContact, error: insErr } = await (supabaseAdmin.from('contacts') as any)
        .insert({
          organization_id: orgId,
          phone: cleanPhone,
          name: contactName,
          pipeline_stage: 'nuevo',
          is_ai_active: false, // 🛡️ REGLA FUNDAMENTAL DE SEGURIDAD: IA NUNCA ESCRIBE SOLA A CHATS IMPORTADOS
          channel: 'whatsapp',
          last_interaction_at: timestamp,
          updated_at: timestamp,
        })
        .select('id')
        .single();

      if (!insErr && newContact) {
        contactId = newContact.id;
        importedCount++;
      }
    } else {
      existingCount++;
    }

    // 6. Si hay último mensaje y el chat no tenía mensajes previos, guardar preview histórico
    const lastMsgContent =
      typeof chat.lastMessage?.message === 'string'
        ? chat.lastMessage.message
        : typeof chat.lastMessage?.text === 'string'
        ? chat.lastMessage.text
        : typeof chat.message === 'string'
        ? chat.message
        : '';

    if (contactId && lastMsgContent && lastMsgContent.trim() !== '') {
      const { data: hasMessages } = await supabaseAdmin
        .from('messages')
        .select('id')
        .eq('contact_id', contactId)
        .limit(1)
        .maybeSingle();

      if (!hasMessages) {
        await (supabaseAdmin.from('messages') as any).insert({
          contact_id: contactId,
          sender_type: chat.lastMessage?.fromMe ? 'agent_manual' : 'lead',
          content: lastMsgContent.trim().slice(0, 2000),
          channel: 'whatsapp',
          created_at: timestamp,
        });
      }
    }
  }

  revalidatePath('/inbox');
  revalidatePath('/pipeline');
  revalidatePath('/settings');

  return {
    success: true,
    importedCount,
    existingCount,
    totalProcessed: rawChats.length,
    message: importedCount > 0
      ? `¡Se importaron ${importedCount} conversaciones recientes al CRM! (La IA se mantuvo apagada en estos contactos por seguridad).`
      : `Todos los chats recientes (${existingCount}) ya se encontraban registrados en el CRM.`,
  };
}

