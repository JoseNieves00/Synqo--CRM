'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { WhatsAppService, META_TEMPLATES, MetaTemplateKey } from '@/services/whatsapp.service';
import { decryptSecret } from '@/lib/security/encryption';
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
    .select('id, phone, organization_id')
    .eq('id', contactId)
    .eq('organization_id', orgId)
    .single();

  if (contactError || !contact) {
    throw new Error('Contacto no encontrado o acceso denegado');
  }

  // 4. Obtener credenciales WABA de la organización
  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('whatsapp_phone_number_id, whatsapp_access_token')
    .eq('id', orgId)
    .single();

  if (!org?.whatsapp_phone_number_id || !org?.whatsapp_access_token) {
    throw new Error('Credenciales de WhatsApp no configuradas en la organización');
  }

  const decryptedToken = decryptSecret(org.whatsapp_access_token);

  const cleanContent = typeof content === 'string' ? content.trim() : '';
  if (!cleanContent) {
    throw new Error('El mensaje no puede estar vacío.');
  }
  if (cleanContent.length > 4096) {
    throw new Error('El mensaje supera el límite permitido por WhatsApp (4,096 caracteres).');
  }

  // 5. Enviar mensaje mediante Meta Cloud API
  const metaMessageId = await WhatsAppService.sendTextMessage({
    phoneNumberId: org.whatsapp_phone_number_id,
    accessToken: decryptedToken,
    to: contact.phone,
    body: cleanContent,
  });

  // 6. Silenciar la IA automáticamente y registrar actualización
  // NOTA CRÍTICA: NO sobreescribir last_interaction_at aquí, ya que Meta mide la ventana de 24h
  // exclusivamente desde el último mensaje enviado por el CLIENTE.
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
    .select('id, phone, organization_id')
    .eq('id', contactId)
    .eq('organization_id', orgId)
    .single();

  if (!contact) throw new Error('Contacto no encontrado');

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('whatsapp_phone_number_id, whatsapp_access_token')
    .eq('id', orgId)
    .single();

  if (!org?.whatsapp_phone_number_id || !org?.whatsapp_access_token) {
    throw new Error('WhatsApp no configurado');
  }

  const templateDef = (META_TEMPLATES as any)[templateKey];
  const templateName = templateDef?.name || templateKey;
  const templateLabel = templateDef?.label || templateKey;
  const decryptedToken = decryptSecret(org.whatsapp_access_token);

  const metaId = await WhatsAppService.sendTemplateMessage({
    phoneNumberId: org.whatsapp_phone_number_id,
    accessToken: decryptedToken,
    to: contact.phone,
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

