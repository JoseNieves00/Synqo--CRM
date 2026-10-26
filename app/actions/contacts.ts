'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PipelineStage } from '@/lib/supabase/types';
import { revalidatePath } from 'next/cache';

interface CreateLeadInput {
  name: string;
  phone: string;
  pipelineStage?: PipelineStage;
}

/**
 * Crea un nuevo lead manualmente desde la interfaz del CRM.
 * Asigna automáticamente la organización del usuario autenticado (Anti-IDOR).
 */
export async function createLead(input: CreateLeadInput) {
  const supabase = createServerSupabaseClient();

  // 1. Validar sesión
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('No autorizado');
  }

  // 2. Obtener la organización del usuario de forma segura
  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    throw new Error('Organización no encontrada para este usuario');
  }

  // Limpiar y validar teléfono
  let cleanedPhone = input.phone.trim().replace(/\s+/g, '');
  if (!cleanedPhone.startsWith('+')) {
    cleanedPhone = '+' + cleanedPhone;
  }

  if (cleanedPhone.length < 8) {
    throw new Error('El número telefónico no es válido.');
  }

  // 3. Insertar el contacto en la base de datos
  const { data: contact, error: insertError } = await (supabaseAdmin.from('contacts') as any)
    .insert({
      organization_id: profile.organization_id,
      name: input.name.trim() || 'Prospecto WhatsApp',
      phone: cleanedPhone,
      pipeline_stage: input.pipelineStage || 'nuevo',
      is_ai_active: true,
      // Lead manual creado sin interacción previa: ventana de 24h cerrada por defecto según políticas de Meta
      last_interaction_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    })
    .select('id')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      throw new Error('Ya existe un prospecto registrado con este número de teléfono.');
    }
    throw new Error(`Error al crear el lead: ${insertError.message}`);
  }

  revalidatePath('/pipeline');
  revalidatePath('/inbox');
  revalidatePath('/dashboard');

  return { success: true, contactId: contact?.id };
}

/**
 * Elimina un lead de la organización
 */
export async function deleteLead(contactId: string) {
  const supabase = createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) throw new Error('Organización no encontrada');

  const { error } = await (supabaseAdmin.from('contacts') as any)
    .delete()
    .eq('id', contactId)
    .eq('organization_id', profile.organization_id);

  if (error) {
    throw new Error(`Error al eliminar: ${error.message}`);
  }

  revalidatePath('/pipeline');
  revalidatePath('/inbox');
  revalidatePath('/dashboard');

  return { success: true };
}

/**
 * Actualiza la información y notas de un prospecto
 */
export async function updateContactDetails(
  contactId: string,
  updates: {
    name?: string;
    pipelineStage?: PipelineStage;
    notes?: string;
    customFields?: Record<string, any>;
  }
) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) throw new Error('Organización no encontrada');

  const payload: any = {
    updated_at: new Date().toISOString(),
  };

  if (updates.name !== undefined) {
    payload.name = updates.name.trim();
  }
  if (updates.pipelineStage !== undefined) {
    payload.pipeline_stage = updates.pipelineStage;
  }
  if (updates.notes !== undefined || updates.customFields !== undefined) {
    // Obtener campos existentes
    const { data: currentContact } = await (supabaseAdmin.from('contacts') as any)
      .select('custom_fields')
      .eq('id', contactId)
      .eq('organization_id', profile.organization_id)
      .single();

    const existingFields = currentContact?.custom_fields || {};
    payload.custom_fields = {
      ...existingFields,
      ...(updates.customFields || {}),
      ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
    };
  }

  const { error } = await (supabaseAdmin.from('contacts') as any)
    .update(payload)
    .eq('id', contactId)
    .eq('organization_id', profile.organization_id);

  if (error) {
    throw new Error(`Error actualizando prospecto: ${error.message}`);
  }

  revalidatePath('/inbox');
  revalidatePath('/pipeline');
  return { success: true };
}

/**
 * Elimina un prospecto de forma definitiva tras validar la contraseña del usuario.
 * Protege contra borrados accidentales y audita la acción.
 */
export async function deleteContactWithPassword(contactId: string, password: string) {
  const supabase = createServerSupabaseClient();

  // 1. Validar sesión del usuario
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !user.email) {
    throw new Error('No autorizado');
  }

  if (!password || password.trim().length === 0) {
    throw new Error('Debes ingresar tu contraseña para confirmar la eliminación.');
  }

  // 2. Validar contraseña contra Supabase Auth
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: password.trim(),
  });

  if (signInError) {
    throw new Error('Contraseña incorrecta. La eliminación ha sido cancelada por seguridad.');
  }

  // 3. Obtener organización del usuario
  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    throw new Error('Organización no encontrada para este usuario.');
  }

  // 4. Verificar pertenencia del contacto (Anti-IDOR)
  const { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .select('id, name, phone')
    .eq('id', contactId)
    .eq('organization_id', profile.organization_id)
    .single();

  if (!contact) {
    throw new Error('Contacto no encontrado o no tienes permisos sobre él.');
  }

  // 5. Eliminar mensajes asociados
  await (supabaseAdmin.from('messages') as any)
    .delete()
    .eq('contact_id', contactId);

  // 6. Eliminar el contacto
  const { error: deleteError } = await (supabaseAdmin.from('contacts') as any)
    .delete()
    .eq('id', contactId)
    .eq('organization_id', profile.organization_id);

  if (deleteError) {
    throw new Error(`Error al eliminar el prospecto: ${deleteError.message}`);
  }

  revalidatePath('/inbox');
  revalidatePath('/pipeline');
  revalidatePath('/dashboard');

  return { success: true, message: 'Prospecto eliminado exitosamente.' };
}
