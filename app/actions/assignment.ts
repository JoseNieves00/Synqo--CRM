'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

/**
 * Reclama un lead que se encuentra sin asignar.
 * BLOQUEO ATÓMICO CONCURRENTE (Atomic Lock):
 * Utiliza la precondición estricta 'assigned_to IS NULL'.
 * Si dos agentes hacen clic en el mismo milisegundo, solo uno actualiza la fila.
 * El segundo agente recibe un rechazo inmediato sin inconsistencias ni duplicidad.
 */
export async function claimUnassignedLead(contactId: string) {
  const supabase = createServerSupabaseClient();

  // 1. Validar sesión
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('No autorizado: Inicia sesión para continuar.');
  }

  // 2. Obtener organización y perfil del agente
  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('id, full_name, organization_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    throw new Error('Perfil u organización no encontrada.');
  }

  // 3. Ejecutar UPDATE ATÓMICO con condición assigned_to IS NULL (Anti-Race Condition)
  const { data: updated, error: updateError } = await (supabaseAdmin.from('contacts') as any)
    .update({
      assigned_to: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId)
    .eq('organization_id', profile.organization_id)
    .is('assigned_to', null)
    .select('id, name, phone, assigned_to');

  if (updateError) {
    throw new Error(`Error al tomar el lead: ${updateError.message}`);
  }

  // 4. Si updated está vacío (0 filas afectadas), otro agente ya tomó el lead en ese mismo instante
  if (!updated || updated.length === 0) {
    // Consultar quién lo tomó para darle un mensaje claro y evitar frustración
    const { data: existingContact } = await (supabaseAdmin.from('contacts') as any)
      .select('assigned_to, profiles:assigned_to(full_name)')
      .eq('id', contactId)
      .single();

    const winnerName = (existingContact as any)?.profiles?.full_name || 'otro asesor';
    throw new Error(`¡Este lead acaba de ser tomado por ${winnerName} hace unos instantes!`);
  }

  // 5. Registrar mensaje de auditoría interno del CRM (sender_type = 'system', nunca enviado a WhatsApp)
  await (supabaseAdmin.from('messages') as any).insert({
    contact_id: contactId,
    sender_type: 'system',
    content: `[Sistema: Lead tomado por ${profile.full_name || 'Asesor'}]`,
  });

  revalidatePath('/inbox');
  revalidatePath(`/inbox/${contactId}`);

  return { success: true, contact: updated[0] };
}

/**
 * Permite a un Administrador o Supervisor asignar o reasignar un lead a cualquier miembro.
 */
export async function assignLeadByAdmin(contactId: string, targetAgentId: string | null) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('No autorizado.');
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('id, full_name, organization_id, role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    throw new Error('Organización no encontrada.');
  }

  const isAdmin = profile.role === 'admin' || profile.role === 'supervisor' || profile.is_super_admin;
  if (!isAdmin) {
    throw new Error('Acceso restringido: Solo administradores o supervisores pueden reasignar leads de otros agentes.');
  }

  // Si se asigna a un agente, verificar que pertenezca a la misma organización (Anti-IDOR)
  let targetAgentName = 'Sin Asignar';
  if (targetAgentId) {
    const { data: targetProfile } = await (supabaseAdmin.from('profiles') as any)
      .select('id, full_name, organization_id')
      .eq('id', targetAgentId)
      .eq('organization_id', profile.organization_id)
      .single();

    if (!targetProfile) {
      throw new Error('El agente seleccionado no pertenece a tu organización.');
    }
    targetAgentName = targetProfile.full_name || 'Asesor';
  }

  // Actualizar contacto
  const { error: updateError } = await (supabaseAdmin.from('contacts') as any)
    .update({
      assigned_to: targetAgentId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId)
    .eq('organization_id', profile.organization_id);

  if (updateError) {
    throw new Error(`Error reasignando lead: ${updateError.message}`);
  }

  // Registrar auditoría interna en el chat
  const auditContent = targetAgentId
    ? `[Sistema: Lead asignado a ${targetAgentName} por ${profile.full_name}]`
    : `[Sistema: Lead movido a cola Sin Asignar por ${profile.full_name}]`;

  await (supabaseAdmin.from('messages') as any).insert({
    contact_id: contactId,
    sender_type: 'system',
    content: auditContent,
  });

  revalidatePath('/inbox');
  revalidatePath(`/inbox/${contactId}`);

  return { success: true };
}

/**
 * Obtiene la lista de miembros de la organización para los selectores de asignación.
 */
export async function getOrganizationMembers() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) return [];

  const { data: members } = await (supabaseAdmin.from('profiles') as any)
    .select('id, full_name, email, role, availability_status, last_seen_at')
    .eq('organization_id', profile.organization_id)
    .order('full_name', { ascending: true });

  return members || [];
}

