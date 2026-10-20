'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { UserRole } from '@/lib/supabase/types';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@synqo.dev').toLowerCase();

/**
 * Valida que el usuario sea Admin de su organización o Super Admin
 */
async function requireOrgAdmin() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('No autorizado: Inicia sesión para continuar.');
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('id, organization_id, email, full_name, role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile) {
    throw new Error('Perfil no encontrado.');
  }

  const isSuper = Boolean(
    profile.is_super_admin ||
    (profile.email && profile.email.toLowerCase() === superAdminEmail) ||
    user.email?.toLowerCase() === superAdminEmail
  );

  if (profile.role !== 'admin' && !isSuper) {
    throw new Error('Acceso restringido: Solo administradores pueden gestionar miembros del equipo.');
  }

  // Obtener info de la organización
  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name, max_users, is_active, subscription_status, plan_type')
    .eq('id', profile.organization_id)
    .single();

  if (!org) {
    throw new Error('Organización no encontrada.');
  }

  return { user, profile, org, isSuper };
}

/**
 * Obtener todos los miembros del equipo y métricas de cupos/asientos
 */
export async function getTeamInfo() {
  const { org } = await requireOrgAdmin();

  const { data: members, error } = await (supabaseAdmin.from('profiles') as any)
    .select('id, full_name, email, role, created_at')
    .eq('organization_id', org.id)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Error obteniendo miembros: ${error.message}`);
  }

  const maxUsers = org.max_users ?? 3;
  const usedUsers = members?.length || 0;

  return {
    organization: {
      id: org.id,
      name: org.name,
      planType: org.plan_type,
      maxUsers,
      usedUsers,
      remainingSeats: Math.max(0, maxUsers - usedUsers),
    },
    members: members || [],
  };
}

const AddMemberSchema = z.object({
  fullName: z.string().min(2, 'El nombre completo debe tener al menos 2 caracteres.'),
  email: z.string().email('Ingresa un correo electrónico válido.'),
  password: z.string().min(8, 'La contraseña temporal debe tener al menos 8 caracteres.'),
  role: z.enum(['agent', 'supervisor'] as const),
});

/**
 * Crear un nuevo miembro para el equipo con contraseña temporal.
 * Valida estrictamente el límite de asientos `max_users`.
 */
export async function addTeamMember(input: {
  fullName: string;
  email: string;
  password: string;
  role: 'agent' | 'supervisor';
}) {
  const { org } = await requireOrgAdmin();

  const validated = AddMemberSchema.parse(input);

  // 1. Contar miembros actuales de la organización
  const { count: currentCount } = await (supabaseAdmin.from('profiles') as any)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', org.id);

  const maxUsers = org.max_users ?? 3;
  if ((currentCount || 0) >= maxUsers) {
    throw new Error(
      `Has alcanzado el límite de ${maxUsers} usuarios permitidos para tu plan actual. Contacta a soporte para habilitar más asientos.`
    );
  }

  // 2. Crear usuario en Supabase Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: validated.email.trim().toLowerCase(),
    password: validated.password,
    email_confirm: true,
    user_metadata: {
      full_name: validated.fullName.trim(),
    },
  });

  let newUserId = authData?.user?.id;

  if (authError) {
    if (authError.message.includes('already registered')) {
      throw new Error('Este correo electrónico ya está registrado en la plataforma.');
    }
    throw new Error(`Error creando credenciales: ${authError.message}`);
  }

  if (!newUserId) {
    throw new Error('No se pudo generar el identificador de usuario.');
  }

  // 3. Crear perfil vinculado a la organización
  const { error: profileError } = await (supabaseAdmin.from('profiles') as any).insert({
    id: newUserId,
    organization_id: org.id,
    email: validated.email.trim().toLowerCase(),
    full_name: validated.fullName.trim(),
    role: validated.role,
    is_super_admin: false,
  });

  if (profileError) {
    // Revertir usuario auth si falló
    await supabaseAdmin.auth.admin.deleteUser(newUserId);
    throw new Error(`Error guardando perfil del agente: ${profileError.message}`);
  }

  revalidatePath('/settings');
  return {
    success: true,
    member: {
      id: newUserId,
      email: validated.email,
      fullName: validated.fullName,
      role: validated.role,
    },
  };
}

/**
 * Eliminar un miembro del equipo
 */
export async function removeTeamMember(memberId: string) {
  const { user, org } = await requireOrgAdmin();

  if (memberId === user.id) {
    throw new Error('No puedes eliminar tu propia cuenta de administrador.');
  }

  // Verificar que el miembro pertenezca a la misma organización
  const { data: targetProfile } = await (supabaseAdmin.from('profiles') as any)
    .select('id, organization_id, role')
    .eq('id', memberId)
    .single();

  if (!targetProfile || targetProfile.organization_id !== org.id) {
    throw new Error('El usuario no pertenece a tu organización.');
  }

  // Eliminar perfil y usuario auth
  await (supabaseAdmin.from('profiles') as any).delete().eq('id', memberId);
  await supabaseAdmin.auth.admin.deleteUser(memberId);

  revalidatePath('/settings');
  return { success: true };
}

