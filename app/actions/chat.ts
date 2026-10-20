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

  // 5. Enviar mensaje mediante Meta Cloud API
  const metaMessageId = await WhatsAppService.sendTextMessage({
    phoneNumberId: org.whatsapp_phone_number_id,
    accessToken: decryptedToken,
    to: contact.phone,
    body: content,
  });

  // 6. Silenciar la IA automáticamente y actualizar última interacción
  await (supabaseAdmin.from('contacts') as any)
    .update({
      is_ai_active: false,
      last_interaction_at: new Date().toISOString(),
    })
    .eq('id', contactId);

  // 7. Persistir el mensaje en la base de datos con sender_type = 'agent_manual'
  await (supabaseAdmin.from('messages') as any).insert({
    contact_id: contactId,
    sender_type: 'agent_manual',
    content,
    meta_message_id: metaMessageId || null,
  });

  revalidatePath('/inbox');
  revalidatePath(`/inbox/${contactId}`);
}

/**
 * Envía una de las 3 plantillas aprobadas cuando la ventana de 24h ha vencido.
 */
export async function sendAgentTemplate(contactId: string, templateKey: MetaTemplateKey) {
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

  const templateDef = META_TEMPLATES[templateKey];
  const decryptedToken = decryptSecret(org.whatsapp_access_token);

  const metaId = await WhatsAppService.sendTemplateMessage({
    phoneNumberId: org.whatsapp_phone_number_id,
    accessToken: decryptedToken,
    to: contact.phone,
    templateName: templateDef.name,
    languageCode: 'es',
  });

  // Silenciar IA al enviar plantilla y actualizar interaction
  await (supabaseAdmin.from('contacts') as any)
    .update({
      is_ai_active: false,
      last_interaction_at: new Date().toISOString(),
    })
    .eq('id', contactId);

  await (supabaseAdmin.from('messages') as any).insert({
    contact_id: contactId,
    sender_type: 'agent_manual',
    content: `[Plantilla enviada: ${templateDef.label}]`,
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
