'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PlanType, SubscriptionStatus } from '@/lib/supabase/types';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@synqo.dev').toLowerCase();

/**
 * Valida si el usuario actual tiene privilegios de Super Administrador.
 * Lanza un error si no está autenticado o no es Super Admin.
 */
export async function requireSuperAdmin() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('No autorizado: Inicia sesión para continuar.');
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('id, email, is_super_admin')
    .eq('id', user.id)
    .single();

  const isSuper = Boolean(
    profile?.is_super_admin ||
    (profile?.email && profile.email.toLowerCase() === superAdminEmail) ||
    user.email?.toLowerCase() === superAdminEmail
  );

  if (!isSuper) {
    throw new Error('Acceso denegado: Se requieren privilegios de Super Administrador.');
  }

  return { user, profile };
}

/**
 * Métricas globales de la plataforma para la Consola Super Admin
 */
export async function getSuperAdminMetrics() {
  await requireSuperAdmin();

  // Conteo y métricas en paralelo para máxima velocidad
  const [orgsRes, contactsRes, messagesRes, profilesRes] = await Promise.all([
    (supabaseAdmin.from('organizations') as any)
      .select('id, is_active, subscription_status, ai_tokens_used', { count: 'exact' }),
    (supabaseAdmin.from('contacts') as any)
      .select('id', { count: 'exact', head: true }),
    (supabaseAdmin.from('messages') as any)
      .select('id', { count: 'exact', head: true }),
    (supabaseAdmin.from('profiles') as any)
      .select('id', { count: 'exact', head: true }),
  ]);

  const orgs = orgsRes.data || [];
  const totalOrgs = orgsRes.count || orgs.length;

  const activeOrgs = orgs.filter(
    (o: any) => o.is_active !== false && (o.subscription_status === 'active' || o.subscription_status === 'trialing')
  ).length;

  // Suma de consumo de tokens OpenAI en la plataforma
  const totalTokens = orgs.reduce((acc: number, curr: any) => acc + (Number(curr.ai_tokens_used) || 0), 0);

  return {
    totalOrganizations: totalOrgs,
    activeOrganizations: activeOrgs,
    totalContacts: contactsRes.count || 0,
    totalMessages: messagesRes.count || 0,
    totalProfiles: profilesRes.count || 0,
    totalAiTokensUsed: totalTokens,
  };
}

export interface OrganizationRow {
  id: string;
  name: string;
  subscription_status: SubscriptionStatus;
  plan_type: PlanType;
  max_users: number;
  is_active: boolean;
  whatsapp_phone_number_id: string | null;
  created_at: string;
  users_count: number;
  contacts_count: number;
  admin_email?: string;
  admin_name?: string;
  ai_tokens_used?: number;
  ai_tokens_limit?: number;
}

/**
 * Listar todas las organizaciones con conteo de usuarios y estado de asientos
 */
export async function listAllOrganizations(): Promise<OrganizationRow[]> {
  await requireSuperAdmin();

  // Consultar organizaciones, perfiles y contactos en paralelo
  const [orgsRes, profilesRes, contactsRes] = await Promise.all([
    (supabaseAdmin.from('organizations') as any)
      .select('*')
      .order('created_at', { ascending: false }),
    (supabaseAdmin.from('profiles') as any)
      .select('id, organization_id, email, full_name, role'),
    (supabaseAdmin.from('contacts') as any)
      .select('id, organization_id'),
  ]);

  const orgs = orgsRes.data;
  if (orgsRes.error || !orgs) {
    throw new Error(`Error al listar organizaciones: ${orgsRes.error?.message}`);
  }

  const profiles = profilesRes.data || [];
  const contacts = contactsRes.data || [];

  const rows: OrganizationRow[] = orgs.map((org: any) => {
    const orgProfiles = profiles.filter((p: any) => p.organization_id === org.id);
    const orgContacts = contacts.filter((c: any) => c.organization_id === org.id);
    const adminUser = orgProfiles.find((p: any) => p.role === 'admin') || orgProfiles[0];

    return {
      id: org.id,
      name: org.name,
      subscription_status: org.subscription_status || 'trialing',
      plan_type: org.plan_type || 'core',
      max_users: org.max_users ?? 3,
      is_active: org.is_active ?? true,
      whatsapp_phone_number_id: org.whatsapp_phone_number_id || null,
      created_at: org.created_at,
      users_count: orgProfiles.length,
      contacts_count: orgContacts.length,
      admin_email: adminUser?.email,
      admin_name: adminUser?.full_name,
      ai_tokens_used: Number(org.ai_tokens_used || 0),
      ai_tokens_limit: Number(org.ai_tokens_limit || 100000),
    };
  });

  return rows;
}

const ProvisionSchema = z.object({
  companyName: z.string().min(2, 'El nombre de la empresa debe tener al menos 2 caracteres.'),
  adminName: z.string().min(2, 'El nombre del administrador es requerido.'),
  adminEmail: z.string().email('Correo electrónico inválido.'),
  adminPassword: z.string().min(8, 'La contraseña debe tener mínimo 8 caracteres.'),
  planType: z.enum(['core', 'pro', 'enterprise']).default('core'),
  maxUsers: z.number().int().min(1).max(100).default(3),
});

/**
 * Aprovisionar una nueva empresa y crear su usuario administrador inicial
 */
export async function provisionCompany(input: {
  companyName: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  planType?: 'core' | 'pro' | 'enterprise';
  maxUsers?: number;
}) {
  await requireSuperAdmin();

  const validated = ProvisionSchema.parse(input);

  // 1. Crear Organización
  const { data: org, error: orgError } = await (supabaseAdmin.from('organizations') as any)
    .insert({
      name: validated.companyName.trim(),
      subscription_status: 'active',
      plan_type: validated.planType,
      max_users: validated.maxUsers,
      is_active: true,
      system_prompt: `Eres el asesor comercial inteligente de ${validated.companyName}. Tu meta es resolver dudas con amabilidad, calificar al cliente y facilitarle agendar una cita en nuestro calendario.`,
    })
    .select('id, name')
    .single();

  if (orgError || !org) {
    throw new Error(`Error creando organización: ${orgError?.message}`);
  }

  // 2. Crear Usuario en Supabase Auth
  const { data: authData, error: authCreateError } = await supabaseAdmin.auth.admin.createUser({
    email: validated.adminEmail.trim().toLowerCase(),
    password: validated.adminPassword,
    email_confirm: true,
    user_metadata: {
      full_name: validated.adminName.trim(),
    },
  });

  let userId = authData?.user?.id;

  if (authCreateError) {
    // Si ya existe el usuario con este correo, verificar si podemos asignarle el perfil
    if (authCreateError.message.includes('already registered')) {
      // Buscar usuario existente
      const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = userList?.users?.find(
        (u) => u.email?.toLowerCase() === validated.adminEmail.trim().toLowerCase()
      );
      if (existingUser) {
        userId = existingUser.id;
      } else {
        // Rollback org creada
        await supabaseAdmin.from('organizations').delete().eq('id', org.id);
        throw new Error(`El correo ya está registrado en Auth y no se pudo vincular.`);
      }
    } else {
      // Rollback org creada
      await supabaseAdmin.from('organizations').delete().eq('id', org.id);
      throw new Error(`Error creando credenciales en Auth: ${authCreateError.message}`);
    }
  }

  // 3. Crear o actualizar Perfil vinculado a la nueva Organización
  const { error: profileError } = await (supabaseAdmin.from('profiles') as any).upsert({
    id: userId,
    organization_id: org.id,
    email: validated.adminEmail.trim().toLowerCase(),
    full_name: validated.adminName.trim(),
    role: 'admin',
    is_super_admin: false,
    updated_at: new Date().toISOString(),
  });

  if (profileError) {
    console.error('[SUPER ADMIN] Error creando perfil:', profileError);
    throw new Error(`Organización creada pero falló el perfil: ${profileError.message}`);
  }

  revalidatePath('/admin');
  return {
    success: true,
    organization: org,
    user: {
      id: userId,
      email: validated.adminEmail,
      fullName: validated.adminName,
    },
  };
}

/**
 * Modificar límite de asientos (max_users) de una empresa
 */
export async function updateCompanySeats(organizationId: string, maxUsers: number) {
  await requireSuperAdmin();

  if (maxUsers < 1 || maxUsers > 500) {
    throw new Error('El límite de asientos debe estar entre 1 y 500.');
  }

  const { error } = await (supabaseAdmin.from('organizations') as any)
    .update({
      max_users: maxUsers,
      updated_at: new Date().toISOString(),
    })
    .eq('id', organizationId);

  if (error) {
    throw new Error(`Error actualizando asientos: ${error.message}`);
  }

  revalidatePath('/admin');
  return { success: true };
}

/**
 * Suspender o reactivar una empresa
 */
export async function toggleCompanyStatus(organizationId: string, isActive: boolean) {
  await requireSuperAdmin();

  const { error } = await (supabaseAdmin.from('organizations') as any)
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', organizationId);

  if (error) {
    throw new Error(`Error cambiando estado de la empresa: ${error.message}`);
  }

  revalidatePath('/admin');
  return { success: true };
}

/**
 * Actualizar plan y suscripción de una empresa
 */
export async function updateCompanyPlan(
  organizationId: string,
  planType: PlanType,
  subscriptionStatus: SubscriptionStatus
) {
  await requireSuperAdmin();

  const { error } = await (supabaseAdmin.from('organizations') as any)
    .update({
      plan_type: planType,
      subscription_status: subscriptionStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', organizationId);

  if (error) {
    throw new Error(`Error actualizando plan: ${error.message}`);
  }

  revalidatePath('/admin');
  return { success: true };
}

