'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { WhatsAppService, META_TEMPLATES, MetaTemplateKey } from '@/services/whatsapp.service';
import { MessagingService } from '@/services/messaging.service';
import { InstagramService } from '@/services/instagram.service';
import { decryptSecret } from '@/lib/security/encryption';
import { formatImageMessageContent, formatDocumentMessageContent } from '@/lib/media/format';
import { revalidatePath } from 'next/cache';

/**
 * Envía un mensaje manual por un agente humano desde el CRM.
 * Regla de negocio crítica: Silencia automáticamente la IA (is_ai_active = false)
 * para otorgar el control completo al operador humano.
 */
export async function sendAgentMessage(contactId: string, content: string) {
  const supabase = createServerSupabaseClient();

  // 1. Validar sesión del usuario autenticado
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('No autorizado');
  }

  // 2. Obtener la organización del usuario
  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id;
  if (!orgId) {
    throw new Error('Perfil u organización no encontrada');
  }

  // 3. Validar que el contacto pertenece a la misma organización (Anti-IDOR)
  const { data: contact, error: contactError } = await (supabaseAdmin.from('contacts') as any)
    .select('id, phone, custom_fields, organization_id, channel, instagram_id, last_interaction_at')
    .eq('id', contactId)
    .eq('organization_id', orgId)
    .single();

  if (contactError || !contact) {
    throw new Error('Contacto no encontrado o acceso denegado');
  }

  const cleanContent = typeof content === 'string' ? content.trim() : '';
  if (!cleanContent) {
    throw new Error('El mensaje no puede estar vacío.');
  }

  const isInstagram = contact.channel === 'instagram' || Boolean(contact.instagram_id);
  let metaMessageId: string | null = null;

  if (isInstagram) {
    // 4. Obtener credenciales de Instagram Direct
    const { data: org } = await (supabaseAdmin.from('organizations') as any)
      .select('instagram_account_id, instagram_access_token')
      .eq('id', orgId)
      .single();

    if (!org?.instagram_account_id || !org?.instagram_access_token) {
      throw new Error('Credenciales de Instagram Direct no configuradas en la organización');
    }

    const decryptedToken = decryptSecret(org.instagram_access_token);
    const recipientIgId = contact.instagram_id || contact.phone.replace(/^ig_/, '');

    metaMessageId = await InstagramService.sendDirectMessage({
      instagramAccountId: org.instagram_account_id,
      accessToken: decryptedToken,
      recipientId: recipientIgId,
      text: cleanContent,
    });
  } else {
    // 4. Obtener credenciales de mensajería de la organización
    const { data: org } = await (supabaseAdmin.from('organizations') as any)
      .select('id, name, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, evolution_api_url, evolution_api_key, evolution_instance_name, evolution_anti_ban_mode, evolution_max_outbound_per_hour')
      .eq('id', orgId)
      .single();

    if (!org) {
      throw new Error('Organización no encontrada.');
    }

    if (cleanContent.length > 4096) {
      throw new Error('El mensaje supera el límite permitido por WhatsApp (4,096 caracteres).');
    }

    // Si el contacto nunca ha tenido interacción previa, se considera envío en frío (outbound)
    const isCold = !contact.last_interaction_at;

    // 5. Enviar mensaje mediante el motor configurado (Meta Cloud API o Evolution API)
    const targetRecipient = contact.custom_fields?.remote_jid || contact.phone;
    metaMessageId = await MessagingService.sendTextMessage({
      organization: org,
      to: targetRecipient,
      body: cleanContent,
      simulateTyping: false,
      isColdOutbound: isCold,
    });
  }

  // 6. Silenciar la IA automáticamente y registrar actualización
  await (supabaseAdmin.from('contacts') as any)
    .update({
      is_ai_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId);

  // 7. Persistir el mensaje en la base de datos con sender_type = 'agent_manual'
  await (supabaseAdmin.from('messages') as any).insert({
    contact_id: contactId,
    sender_type: 'agent_manual',
    content: cleanContent,
    meta_message_id: metaMessageId || null,
    channel: isInstagram ? 'instagram' : 'whatsapp',
  });

  revalidatePath('/inbox');
  revalidatePath(`/inbox/${contactId}`);
}

/**
 * Envía una plantilla oficial de Meta cuando la ventana de 24h ha vencido o para iniciar un lead nuevo.
 */
export async function sendAgentTemplate(contactId: string, templateKey: string) {
  const supabase = createServerSupabaseClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('No autorizado');
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id;
  if (!orgId) throw new Error('Perfil no encontrado');

  const { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .select('id, phone, custom_fields, organization_id')
    .eq('id', contactId)
    .eq('organization_id', orgId)
    .single();

  if (!contact) throw new Error('Contacto no encontrado');

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, evolution_api_url, evolution_api_key, evolution_instance_name, evolution_anti_ban_mode, evolution_max_outbound_per_hour')
    .eq('id', orgId)
    .single();

  if (!org) {
    throw new Error('Organización no encontrada.');
  }

  const templateDef = (META_TEMPLATES as any)[templateKey];
  const templateName = templateDef?.name || templateKey;
  const templateLabel = templateDef?.label || templateKey;

  const targetRecipient = contact.custom_fields?.remote_jid || contact.phone;

  const metaId = await MessagingService.sendTemplateMessage({
    organization: org,
    to: targetRecipient,
    templateKey,
    templateName,
    languageCode: 'es',
  });

  // Registrar actualización en el contacto (sin desactivar la IA si el lead está configurado con IA)
  await (supabaseAdmin.from('contacts') as any)
    .update({
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId);

  await (supabaseAdmin.from('messages') as any).insert({
    contact_id: contactId,
    sender_type: 'agent_manual',
    content: `[Plantilla enviada: ${templateLabel}]`,
    meta_message_id: metaId || null,
  });

  revalidatePath('/inbox');
  revalidatePath(`/inbox/${contactId}`);
}

/**
 * Sube un archivo multimedia o documento a Supabase Storage (bucket 'chat-media')
 * con validación de tipo MIME y tamaño máximo de 15 MB.
 */
export async function uploadChatMedia(formData: FormData): Promise<{
  url: string;
  fileName: string;
  isDocument: boolean;
  fileType: string;
}> {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const file = formData.get('file') as File;
  if (!file) throw new Error('No se recibió ningún archivo.');

  if (file.size > 15 * 1024 * 1024) {
    throw new Error('El archivo supera el tamaño máximo permitido de 15 MB.');
  }

  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
  ];

  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|docx?|xlsx?|txt|png|jpe?g|webp|gif)$/i)) {
    throw new Error('Formato de archivo no admitido. Se permiten imágenes (JPG, PNG, WEBP) y documentos (PDF, Word, Excel, TXT).');
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id || 'general';
  const fileExt = file.name.split('.').pop() || (file.type.startsWith('image/') ? 'jpg' : 'pdf');
  const safeBaseName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = `${orgId}/${Date.now()}_${safeBaseName}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabaseAdmin.storage
    .from('chat-media')
    .upload(fileName, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    });

  if (uploadError) {
    console.error('[STORAGE UPLOAD ERROR]', uploadError);
    throw new Error(`Error al subir archivo: ${uploadError.message}`);
  }

  const { data: publicData } = supabaseAdmin.storage
    .from('chat-media')
    .getPublicUrl(fileName);

  const isDocument = !file.type.startsWith('image/');

  return {
    url: publicData.publicUrl,
    fileName: file.name,
    isDocument,
    fileType: file.type,
  };
}

/**
 * Envía una imagen o documento manual por un agente humano desde el CRM a WhatsApp.
 * Silencia la IA automáticamente (Human Takeover).
 */
export async function sendAgentMediaMessage(
  contactId: string,
  mediaUrl: string,
  caption?: string,
  fileName?: string,
  isDocument?: boolean
) {
  const supabase = createServerSupabaseClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id;
  if (!orgId) throw new Error('Perfil u organización no encontrada');

  const { data: contact, error: contactError } = await (supabaseAdmin.from('contacts') as any)
    .select('id, phone, custom_fields, organization_id, channel, last_interaction_at')
    .eq('id', contactId)
    .eq('organization_id', orgId)
    .single();

  if (contactError || !contact) throw new Error('Contacto no encontrado o acceso denegado');

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, evolution_api_url, evolution_api_key, evolution_instance_name, evolution_anti_ban_mode, evolution_max_outbound_per_hour')
    .eq('id', orgId)
    .single();

  if (!org) throw new Error('Organización no encontrada.');

  const targetRecipient = contact.custom_fields?.remote_jid || contact.phone;

  // 1. Despachar imagen o documento a WhatsApp
  const messageId = await MessagingService.sendMediaMessage({
    organization: org,
    to: targetRecipient,
    mediaUrl,
    caption: caption || undefined,
    mediaType: isDocument ? 'document' : 'image',
    fileName: fileName || (isDocument ? 'documento.pdf' : 'imagen.jpg'),
  });

  // 2. Silenciar IA (Human Takeover) y actualizar última interacción
  await (supabaseAdmin.from('contacts') as any)
    .update({
      is_ai_active: false,
      last_interaction_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId);

  // 3. Persistir en la tabla messages con formato correspondiente
  const formattedContent = isDocument
    ? formatDocumentMessageContent(mediaUrl, fileName, caption)
    : formatImageMessageContent(mediaUrl, caption);

  await (supabaseAdmin.from('messages') as any).insert({
    contact_id: contactId,
    sender_type: 'agent_manual',
    content: formattedContent,
    meta_message_id: messageId || null,
  });

  revalidatePath('/inbox');
  revalidatePath(`/inbox/${contactId}`);
}

/**
 * Conmuta manualmente el switch de IA para un contacto específico.
 */
export async function toggleContactAi(contactId: string, newState: boolean) {
  const supabase = createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id;
  if (!orgId) throw new Error('Perfil no encontrado');

  await (supabaseAdmin.from('contacts') as any)
    .update({
      is_ai_active: newState,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId)
    .eq('organization_id', orgId);

  revalidatePath('/inbox');
  revalidatePath(`/inbox/${contactId}`);
}

/**
 * Consulta de relevos humanos pendientes (Anti-Visto).
 * Retorna prospectos con IA silenciada que están esperando respuesta humana.
 */
export async function getUnattendedHandoffs(): Promise<Array<{
  id: string;
  name: string;
  phone: string;
  lastMessage: string;
  waitingSince: string;
  assignedTo?: string | null;
}>> {
  try {
    const supabase = createServerSupabaseClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return [];

    const { data: profile } = await (supabaseAdmin.from('profiles') as any)
      .select('organization_id, role, is_super_admin')
      .eq('id', user.id)
      .single();

    const orgId = profile?.organization_id;
    if (!orgId) return [];

    // Obtener prospectos con IA apagada activos (no archivados ni ganados/perdidos)
    const { data: contacts } = await (supabaseAdmin.from('contacts') as any)
      .select('id, name, phone, updated_at, last_interaction_at, assigned_to')
      .eq('organization_id', orgId)
      .eq('is_ai_active', false)
      .not('pipeline_stage', 'in', '("ganado","perdido")')
      .order('updated_at', { ascending: false })
      .limit(20);

    if (!contacts || contacts.length === 0) return [];

    const unattended: Array<{
      id: string;
      name: string;
      phone: string;
      lastMessage: string;
      waitingSince: string;
      assignedTo?: string | null;
    }> = [];

    for (const c of contacts) {
      const { data: lastMsg } = await (supabaseAdmin.from('messages') as any)
        .select('id, sender_type, content, created_at')
        .eq('contact_id', c.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Si el último mensaje es del cliente o del sistema de relevo, el asesor aún no ha contestado
      if (lastMsg && (lastMsg.sender_type === 'lead' || lastMsg.sender_type === 'system')) {
        unattended.push({
          id: c.id,
          name: c.name || 'Prospecto WhatsApp',
          phone: c.phone || '',
          lastMessage: lastMsg.content || '',
          waitingSince: lastMsg.created_at || c.updated_at,
          assignedTo: c.assigned_to,
        });
      }
    }

    return unattended;
  } catch (err: any) {
    console.warn('[getUnattendedHandoffs] Red o conexión temporal con Supabase:', err?.message || err);
    return [];
  }
}

/**
 * Obtiene los mensajes históricos de un contacto para la transición fluida en cliente del Inbox
 */
export async function getContactMessages(contactId: string) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.organization_id;
  if (!orgId) throw new Error('Organización no encontrada');

  // Validar pertenencia del contacto a la organización del usuario
  const { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .select('id')
    .eq('id', contactId)
    .eq('organization_id', orgId)
    .single();

  if (!contact) throw new Error('Contacto no encontrado o acceso denegado');

  const { data: messages, error } = await (supabaseAdmin.from('messages') as any)
    .select('id, sender_type, content, created_at')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    console.error('[GET CONTACT MESSAGES ERROR]', error);
    throw new Error('Error al cargar mensajes del contacto');
  }

  return messages || [];
}

import {
  type QuickSnippet,
  BASE_DEFAULT_SNIPPETS,
  generateSuggestedSnippetsFromPrompt,
} from '@/lib/chat/snippets';

export type { QuickSnippet };

/**
 * Obtiene los atajos activos y las sugerencias de la IA para la organización actual
 */
export async function getOrganizationQuickReplies(): Promise<{
  activeSnippets: QuickSnippet[];
  aiSuggestions: QuickSnippet[];
}> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { activeSnippets: BASE_DEFAULT_SNIPPETS, aiSuggestions: [] };
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    return { activeSnippets: BASE_DEFAULT_SNIPPETS, aiSuggestions: [] };
  }

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('appointment_settings, structured_prompt_data, system_prompt')
    .eq('id', profile.organization_id)
    .single();

  const currentSettings = (org?.appointment_settings as any) || {};
  const savedSnippets = Array.isArray(currentSettings.quick_replies) && currentSettings.quick_replies.length > 0
    ? currentSettings.quick_replies
    : BASE_DEFAULT_SNIPPETS;

  const aiSuggestions = generateSuggestedSnippetsFromPrompt(
    org?.structured_prompt_data,
    org?.system_prompt
  );

  return {
    activeSnippets: savedSnippets,
    aiSuggestions,
  };
}

/**
 * Guarda la lista de atajos personalizados de la organización
 */
export async function saveOrganizationQuickReplies(
  snippets: QuickSnippet[]
): Promise<{ success: boolean; snippets: QuickSnippet[] }> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('No autorizado');
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    throw new Error('Perfil no encontrado');
  }

  // Limpiar y sanitizar atajos
  const cleanSnippets: QuickSnippet[] = (snippets || [])
    .filter((s) => s.shortcut && s.text)
    .slice(0, 30) // Máximo 30 atajos por empresa
    .map((s, idx) => {
      let code = s.shortcut.trim();
      if (!code.startsWith('/')) code = '/' + code;
      // Solo letras minúsculas, números y guiones
      code = '/' + code.slice(1).toLowerCase().replace(/[^a-z0-9_-]/g, '');

      return {
        id: s.id || `custom-${Date.now()}-${idx}`,
        shortcut: code || `/atajo${idx + 1}`,
        label: s.label?.trim().slice(0, 35) || code,
        text: s.text.trim().slice(0, 1000),
      };
    });

  const orgId = profile.organization_id;

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('appointment_settings')
    .eq('id', orgId)
    .single();

  const currentSettings = (org?.appointment_settings as any) || {};
  const updatedSettings = {
    ...currentSettings,
    quick_replies: cleanSnippets,
  };

  const { error: updateErr } = await (supabaseAdmin.from('organizations') as any)
    .update({
      appointment_settings: updatedSettings,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId);

  if (updateErr) {
    throw new Error(`Error guardando atajos: ${updateErr.message}`);
  }

  revalidatePath('/inbox');
  return { success: true, snippets: cleanSnippets };
}

