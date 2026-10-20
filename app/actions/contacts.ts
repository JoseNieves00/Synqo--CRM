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
  const { data: contact, error: insertError } = await (supabase.from('contacts') as any)
    .insert({
      organization_id: profile.organization_id,
      name: input.name.trim() || 'Prospecto WhatsApp',
      phone: cleanedPhone,
      pipeline_stage: input.pipelineStage || 'nuevo',
      is_ai_active: true,
      last_interaction_at: new Date().toISOString(),
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

  const { error } = await (supabase.from('contacts') as any)
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
    const { data: currentContact } = await (supabase.from('contacts') as any)
      .select('custom_fields')
      .eq('id', contactId)
      .single();

    const existingFields = currentContact?.custom_fields || {};
    payload.custom_fields = {
      ...existingFields,
      ...(updates.customFields || {}),
      ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
    };
  }

  const { error } = await (supabase.from('contacts') as any)
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
