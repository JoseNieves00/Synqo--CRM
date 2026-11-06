'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { encryptSecret, decryptSecret } from '@/lib/security/encryption';
import { generateEvolutionWebhookSecret, isValidEvolutionApiUrl } from '@/lib/security/verify-webhook';
import { EvolutionService } from '@/services/evolution.service';
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

  return { user, profile, orgId, isSuperAdmin: Boolean(profile.is_super_admin) };
}

/**
 * Permite a cualquier miembro de la organización consultar el estado de conexión
 * (sin exponer secretos ni permitir modificaciones destructivas).
 */
async function checkMemberAuth() {
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

  const orgId = profile?.organization_id;
  if (!orgId) throw new Error('Organización no encontrada.');

  return { user, profile, orgId, isSuperAdmin: Boolean(profile.is_super_admin), isAdmin: profile.role === 'admin' || Boolean(profile.is_super_admin) };
}

/**
 * Resuelve las credenciales de Evolution API para la organización,
 * utilizando la configuración central del VPS de la empresa (Variables de entorno)
 * con fallback inteligente para que los clientes no tengan que configurar servidores.
 */
async function resolveOrgEvolutionCredentials(orgId: string) {
  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select(
      'id, name, company_code, evolution_api_url, evolution_api_key, evolution_instance_name, evolution_status, evolution_phone_connected'
    )
    .eq('id', orgId)
    .single();

  if (!org) {
    throw new Error('Organización no encontrada.');
  }

  // 1. Resolver nombre de instancia
  let instanceName = org.evolution_instance_name?.trim();
  if (!instanceName) {
    const code = org.company_code ? org.company_code.toLowerCase().trim() : '';
    instanceName = code ? `synqo_${code}` : `org_${orgId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}`;
    // Persistir nombre de instancia auto-generado
    await (supabaseAdmin.from('organizations') as any)
      .update({ evolution_instance_name: instanceName })
      .eq('id', orgId);
  }

  // 2. Resolver URL del VPS (prioridad: organización -> variable global del VPS)
  const globalApiUrl = (
    process.env.EVOLUTION_API_URL ||
    process.env.NEXT_PUBLIC_EVOLUTION_API_URL ||
    ''
  ).trim();

  const orgApiUrl = org.evolution_api_url?.trim() || null;
  const apiUrl = orgApiUrl || globalApiUrl || null;

  if (apiUrl && !isValidEvolutionApiUrl(apiUrl)) {
    throw new Error('La URL de Evolution API configurada es inválida o apunta a un host no permitido por políticas de seguridad SSRF.');
  }

  // 3. Resolver API Key (prioridad: organización cifrada -> variable global del VPS del Super Admin)
  let apiKey = '';
  if (org.evolution_api_key) {
    try {
      apiKey = decryptSecret(org.evolution_api_key);
    } catch {}
  }

  const isCustomTenantUrl = Boolean(orgApiUrl && orgApiUrl !== globalApiUrl);

  // NUNCA enviar la variable global EVOLUTION_API_KEY a una URL definida por un tenant
  if (!apiKey && !isCustomTenantUrl && process.env.EVOLUTION_API_KEY) {
    apiKey = process.env.EVOLUTION_API_KEY.trim();
  }

  if (!apiKey) {
    if (isCustomTenantUrl) {
      throw new Error(
        'La organización tiene una URL de Evolution API personalizada pero no ha configurado una API Key propia. Por seguridad, no se puede usar la clave maestra global del VPS.'
      );
    }
    throw new Error(
      'La API Key de Evolution API no está configurada. El Super Administrador debe configurar EVOLUTION_API_KEY en el servidor o en la Consola Super Admin.'
    );
  }

  return { org, instanceName, apiUrl, apiKey };
}

/**
 * Guarda las credenciales de Evolution API de la organización y autoconfigura los webhooks.
 * Utilizado por el Super Admin o Administrador de empresa.
 */
export async function saveEvolutionCredentials({
  apiUrl,
  apiKey,
  instanceName,
  whatsappProvider = 'evolution',
  antiBanMode = true,
  maxOutboundPerHour = 20,
}: {
  apiUrl?: string;
  apiKey?: string;
  instanceName: string;
  whatsappProvider?: 'meta' | 'zapi' | 'evolution';
  antiBanMode?: boolean;
  maxOutboundPerHour?: number;
}) {
  const { orgId, isSuperAdmin } = await checkAdminAuth();

  const { data: currentOrg } = await (supabaseAdmin.from('organizations') as any)
    .select('evolution_api_url, evolution_api_key')
    .eq('id', orgId)
    .single();

  const cleanInstance = EvolutionService.sanitizeInstanceName(instanceName);

  const updatePayload: any = {
    whatsapp_provider: whatsappProvider,
    evolution_instance_name: cleanInstance || null,
    evolution_anti_ban_mode: antiBanMode,
    evolution_max_outbound_per_hour: maxOutboundPerHour,
    updated_at: new Date().toISOString(),
  };

  // Solo el Super Administrador puede configurar o modificar evolution_api_url
  if (apiUrl !== undefined) {
    const trimmedUrl = apiUrl.trim();
    if (!isSuperAdmin) {
      if (trimmedUrl && trimmedUrl !== (currentOrg?.evolution_api_url || '')) {
        throw new Error('Solo el Super Administrador puede configurar o modificar la URL del servidor Evolution API.');
      }
    } else {
      if (trimmedUrl) {
        if (!isValidEvolutionApiUrl(trimmedUrl)) {
          throw new Error('URL de Evolution API inválida o insegura (debe ser HTTPS y no apuntar a direcciones privadas).');
        }
        updatePayload.evolution_api_url = trimmedUrl;
      } else {
        updatePayload.evolution_api_url = null;
      }
    }
  }

  if (apiKey && apiKey.trim()) {
    updatePayload.evolution_api_key = encryptSecret(apiKey.trim());
  }

  const { error } = await (supabaseAdmin.from('organizations') as any)
    .update(updatePayload)
    .eq('id', orgId);

  if (error) {
    throw new Error(`Error guardando credenciales de Evolution API: ${error.message}`);
  }

  // Intentar autoconfigurar webhooks si tenemos credenciales
  let webhookFeedback = '';
  const globalApiUrl = (process.env.EVOLUTION_API_URL || process.env.NEXT_PUBLIC_EVOLUTION_API_URL || '').trim();
  const effectiveApiUrl = (updatePayload.evolution_api_url !== undefined ? updatePayload.evolution_api_url : currentOrg?.evolution_api_url)?.trim() || globalApiUrl;
  const isCustomTenantUrl = Boolean(effectiveApiUrl && effectiveApiUrl !== globalApiUrl);

  // NUNCA enviar la key global a una URL personalizada de un tenant
  const finalApiKey = apiKey?.trim() || (!isCustomTenantUrl ? process.env.EVOLUTION_API_KEY?.trim() : undefined);

  if (cleanInstance && finalApiKey && effectiveApiUrl) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://synqo.dev';
    const webhookSecret = generateEvolutionWebhookSecret(cleanInstance);
    const webhookUrl = `${appUrl}/api/webhooks/whatsapp/evolution?instanceName=${encodeURIComponent(cleanInstance)}&secret=${webhookSecret}`;

    try {
      const configRes = await EvolutionService.configureWebhooks({
        apiUrl: effectiveApiUrl,
        apiKey: finalApiKey,
        instanceName: cleanInstance,
        webhookUrl,
        secret: webhookSecret,
      });

      if (configRes.success) {
        webhookFeedback = 'Webhooks configurados automáticamente en Evolution API en tu VPS.';
      } else {
        webhookFeedback = `Aviso en webhooks: ${configRes.error || 'Verifica la conectividad de red de tu VPS'}`;
      }
    } catch (e: any) {
      webhookFeedback = `No se pudo autoconfigurar webhooks: ${e.message}`;
    }
  }

  revalidatePath('/settings');
  return { success: true, message: 'Configuración de Evolution API guardada exitosamente.', webhookFeedback };
}

/**
 * Obtiene el código QR en tiempo real para renderizar en pantalla.
 * Funciona de manera transparente para el cliente sin necesidad de ingresar claves técnicas.
 */
export async function getEvolutionQrCode() {
  const { orgId } = await checkAdminAuth();
  const { org, instanceName, apiUrl, apiKey } = await resolveOrgEvolutionCredentials(orgId);

  // 1. Verificar si la instancia ya está conectada antes de solicitar QR
  try {
    const status = await EvolutionService.getStatus({
      apiUrl,
      apiKey,
      instanceName,
    });

    if (status.connected) {
      await (supabaseAdmin.from('organizations') as any)
        .update({
          evolution_status: 'connected',
          evolution_phone_connected: status.phone || org.evolution_phone_connected || null,
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
    console.warn('[EVOLUTION STATUS CHECK BEFORE QR WARN]', statusErr);
  }

  // 2. Si no está conectada, solicitar el QR en vivo
  try {
    const appUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://synqo.dev');
    const webhookSecret = generateEvolutionWebhookSecret(instanceName);
    const webhookUrl = `${appUrl}/api/webhooks/whatsapp/evolution?instanceName=${encodeURIComponent(instanceName)}&secret=${webhookSecret}`;

    const qrData = await EvolutionService.getQrCode({
      apiUrl,
      apiKey,
      instanceName,
      webhookUrl,
    });

    return qrData;
  } catch (qrErr: any) {
    const msg = qrErr?.message || '';
    if (
      msg === 'ALREADY_CONNECTED' ||
      msg.toLowerCase().includes('already connected') ||
      msg.toLowerCase().includes('open')
    ) {
      await (supabaseAdmin.from('organizations') as any)
        .update({ evolution_status: 'connected' })
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
export async function getEvolutionPhoneCode(phone: string) {
  const { orgId } = await checkAdminAuth();

  const cleanPhone = (phone || '').replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 8) {
    throw new Error('Ingresa un número telefónico válido con indicativo de país (ej. 573001234567).');
  }

  const { org, instanceName, apiUrl, apiKey } = await resolveOrgEvolutionCredentials(orgId);

  // 1. Verificar si la instancia ya está conectada antes de solicitar el código
  try {
    const status = await EvolutionService.getStatus({
      apiUrl,
      apiKey,
      instanceName,
    });

    if (status.connected) {
      await (supabaseAdmin.from('organizations') as any)
        .update({
          evolution_status: 'connected',
          evolution_phone_connected: status.phone || org.evolution_phone_connected || null,
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
    console.warn('[EVOLUTION STATUS CHECK BEFORE PHONE CODE WARN]', statusErr);
  }

  // 2. Solicitar el código de vinculación por teléfono
  try {
    const appUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://synqo.dev');
    const webhookSecret = generateEvolutionWebhookSecret(instanceName);
    const webhookUrl = `${appUrl}/api/webhooks/whatsapp/evolution?instanceName=${encodeURIComponent(instanceName)}&secret=${webhookSecret}`;

    const result = await EvolutionService.getPhoneCode({
      apiUrl,
      apiKey,
      instanceName,
      phone: cleanPhone,
      webhookUrl,
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
      msg.toLowerCase().includes('open')
    ) {
      await (supabaseAdmin.from('organizations') as any)
        .update({ evolution_status: 'connected' })
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
 * Consulta el estado de conexión de la instancia de Evolution API en el VPS.
 */
export async function getEvolutionConnectionStatus() {
  const { orgId } = await checkMemberAuth();
  const { org, instanceName, apiUrl, apiKey } = await resolveOrgEvolutionCredentials(orgId);

  const status = await EvolutionService.getStatus({
    apiUrl,
    apiKey,
    instanceName,
  });

  // Si cambió el estado, sincronizar en la base de datos
  const newStatus = status.connected ? 'connected' : 'disconnected';
  if (newStatus !== org.evolution_status || (status.phone && status.phone !== org.evolution_phone_connected)) {
    await (supabaseAdmin.from('organizations') as any)
      .update({
        evolution_status: newStatus,
        evolution_phone_connected: status.phone || org.evolution_phone_connected,
        evolution_last_heartbeat: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId);
  }

  return status;
}

/**
 * Desconecta la sesión activa de WhatsApp Web en Evolution API (VPS).
 */
export async function disconnectEvolutionSession() {
  const { orgId } = await checkAdminAuth();
  const { instanceName, apiUrl, apiKey } = await resolveOrgEvolutionCredentials(orgId);

  await EvolutionService.disconnect({
    apiUrl,
    apiKey,
    instanceName,
  });

  await (supabaseAdmin.from('organizations') as any)
    .update({
      evolution_status: 'disconnected',
      evolution_phone_connected: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId);

  revalidatePath('/settings');
  return { success: true };
}

/**
 * Importa de manera controlada los últimos chats de la instancia de WhatsApp conectada en Evolution API.
 * Máximo 50 chats, sin grupos, con IA apagada (is_ai_active: false) para máxima seguridad y cumplimiento.
 */
export async function importRecentEvolutionChats() {
  const { orgId } = await checkAdminAuth();
  const { org, instanceName, apiUrl, apiKey } = await resolveOrgEvolutionCredentials(orgId);

  if (org.evolution_status !== 'connected') {
    throw new Error('WhatsApp debe estar vinculado y conectado para importar conversaciones.');
  }

  const rawChats = await EvolutionService.getRecentChats({
    apiUrl,
    apiKey,
    instanceName,
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
    const remoteJid = chat.remoteJid || chat.id || chat.chatId || '';
    const isGroup =
      chat.isGroup === true ||
      (typeof remoteJid === 'string' && remoteJid.includes('@g.us')) ||
      (typeof chat.phone === 'string' && chat.phone.includes('@g.us'));

    if (isGroup) continue;

    // 2. Normalizar número de teléfono (excluyendo sufijos y no dígitos)
    const rawPhone = chat.phone || remoteJid;
    const cleanPhone = String(rawPhone)
      .replace(/@c\.us|@s\.whatsapp\.net|@lid/g, '')
      .replace(/[^\d]/g, '');

    if (!cleanPhone || cleanPhone.length < 7) continue;

    // 3. Extraer nombre
    const contactName = String(
      chat.pushName ||
      chat.name ||
      chat.contactName ||
      chat.verifiedName ||
      'Contacto WhatsApp'
    ).trim();

    // 4. Verificar si ya existe en la base de datos
    const { data: existingContact } = await (supabaseAdmin.from('contacts') as any)
      .select('id, name, deleted_at')
      .eq('organization_id', orgId)
      .or(`phone.eq.${cleanPhone},phone.eq.+${cleanPhone}`)
      .maybeSingle();

    if (existingContact?.deleted_at) {
      // Si el contacto fue eliminado previamente por el administrador, no re-importarlo
      continue;
    }

    let contactId: string | undefined = existingContact?.id;

    const timestamp = chat.lastMessage?.messageTimestamp
      ? new Date(Number(chat.lastMessage.messageTimestamp) * 1000).toISOString()
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
      typeof chat.lastMessage?.message?.conversation === 'string'
        ? chat.lastMessage.message.conversation
        : typeof chat.lastMessage?.message?.extendedTextMessage?.text === 'string'
        ? chat.lastMessage.message.extendedTextMessage.text
        : typeof chat.lastMessage?.text === 'string'
        ? chat.lastMessage.text
        : typeof chat.lastMessage?.message === 'string'
        ? chat.lastMessage.message
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
          sender_type: chat.lastMessage?.key?.fromMe ? 'agent_manual' : 'lead',
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
    message:
      importedCount > 0
        ? `¡Se importaron ${importedCount} conversaciones recientes al CRM! (La IA se mantuvo apagada en estos contactos por seguridad).`
        : `Todos los chats recientes (${existingCount}) ya se encontraban registrados en el CRM.`,
  };
}
