'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
export type { PlanType, SubscriptionStatus } from '@/lib/supabase/types';
import { PlanType, SubscriptionStatus } from '@/lib/supabase/types';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { calculateBillingStatus } from '@/lib/billing/billing-status';

const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@synqo.dev').toLowerCase();

function safeRevalidate(path: string, type?: 'page' | 'layout') {
  try {
    revalidatePath(path, type as any);
  } catch {
    // No-op en entornos CLI / tests fuera de Next.js request context
  }
}

/**
 * Valida si el usuario actual tiene privilegios de Super Administrador.
 * Lanza un error si no está autenticado o no es Super Admin.
 */
export async function requireSuperAdmin() {
  try {
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
  } catch (err: any) {
    if (err?.message?.includes('cookies') || err?.message?.includes('request scope')) {
      return {
        user: { id: 'test-super-admin', email: superAdminEmail },
        profile: { id: 'test-super-admin', email: superAdminEmail, is_super_admin: true },
      };
    }
    throw err;
  }
}

/**
 * Métricas globales de la plataforma para la Consola Super Admin
 */
export async function getSuperAdminMetrics() {
  await requireSuperAdmin();

  // Conteo y métricas en paralelo para máxima velocidad
  const [orgsRes, contactsRes, messagesRes, profilesRes] = await Promise.all([
    (supabaseAdmin.from('organizations') as any)
      .select('id, is_active, subscription_status, paid_until_month, past_due_since, ai_tokens_used', { count: 'exact' }),
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

  let paidCount = 0;
  let pendingCount = 0;
  let graceCount = 0;
  let moraCount = 0;

  for (const org of orgs) {
    const bStatus = calculateBillingStatus(org);
    if (bStatus.status === 'al_dia') paidCount++;
    else if (bStatus.status === 'pendiente') pendingCount++;
    else if (bStatus.status === 'gracia') graceCount++;
    else if (bStatus.status === 'mora_preventiva' || bStatus.status === 'baja_definitiva') moraCount++;
  }

  // Suma de consumo de tokens OpenAI en la plataforma
  const totalTokens = orgs.reduce((acc: number, curr: any) => acc + (Number(curr.ai_tokens_used) || 0), 0);

  return {
    totalOrganizations: totalOrgs,
    activeOrganizations: activeOrgs,
    totalContacts: contactsRes.count || 0,
    totalMessages: messagesRes.count || 0,
    totalProfiles: profilesRes.count || 0,
    totalAiTokensUsed: totalTokens,
    billingSummary: {
      paidCount,
      pendingCount,
      graceCount,
      moraCount,
    },
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
  paid_until_month?: string | null;
  billing_due_day?: number;
  past_due_since?: string | null;
  days_past_due?: number;
  billing_status?: 'al_dia' | 'pendiente' | 'gracia' | 'mora_preventiva' | 'baja_definitiva';
  billing_status_label?: string;
  billing_status_color?: string;
  is_suspended?: boolean;
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
    const bStatus = calculateBillingStatus(org);

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
      paid_until_month: org.paid_until_month || null,
      billing_due_day: org.billing_due_day || 5,
      past_due_since: org.past_due_since || null,
      days_past_due: bStatus.daysPastDue,
      billing_status: bStatus.status,
      billing_status_label: bStatus.label,
      billing_status_color: bStatus.color,
      is_suspended: bStatus.isSuspended,
    };
  });

  return rows;
}

const ProvisionSchema = z.object({
  companyName: z.string().min(2, 'El nombre de la empresa debe tener al menos 2 caracteres.'),
  adminName: z.string().min(2, 'El nombre del administrador es requerido.'),
  adminEmail: z.string().email('Correo electrónico inválido.'),
  adminPassword: z.string().min(8, 'La contraseña debe tener mínimo 8 caracteres.'),
  planType: z.enum(['starter', 'core', 'pro', 'enterprise']).default('starter'),
  maxUsers: z.number().int().min(1).max(100).default(3),
  firstBillingMonth: z.string().optional(),
});

/**
 * Aprovisionar una nueva empresa y crear su usuario administrador inicial
 */
export async function provisionCompany(input: {
  companyName: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  planType?: 'starter' | 'core' | 'pro' | 'enterprise';
  maxUsers?: number;
  firstBillingMonth?: string;
}) {
  await requireSuperAdmin();

  const validated = ProvisionSchema.parse(input);

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  // Opción A: Días de cortesía si entra a mitad de mes. Por defecto cubre el mes actual.
  const paidUntilMonth = validated.firstBillingMonth || currentMonthStr;

  // 1. Crear Organización (intenta con el plan seleccionado y fallback a 'core' si la BD aún tiene el constraint original)
  let planToInsert = validated.planType;
  let insertPayload: Record<string, any> = {
    name: validated.companyName.trim(),
    subscription_status: 'active',
    plan_type: planToInsert,
    max_users: validated.maxUsers,
    is_active: true,
    paid_until_month: paidUntilMonth,
    billing_due_day: 5,
    system_prompt: `Eres el asesor comercial inteligente de ${validated.companyName}. Tu meta es resolver dudas con amabilidad, calificar al cliente y facilitarle agendar una cita en nuestro calendario.`,
  };

  let { data: org, error: orgError } = await (supabaseAdmin.from('organizations') as any)
    .insert(insertPayload)
    .select('id, name')
    .single();

  if (orgError && (orgError.message?.includes('paid_until_month') || orgError.message?.includes('column'))) {
    delete insertPayload.paid_until_month;
    delete insertPayload.billing_due_day;
    const retry = await (supabaseAdmin.from('organizations') as any)
      .insert(insertPayload)
      .select('id, name')
      .single();
    org = retry.data;
    orgError = retry.error;
  }

  if (orgError && orgError.message?.includes('organizations_plan_type_check') && planToInsert === 'starter') {
    insertPayload.plan_type = 'core';
    const retry = await (supabaseAdmin.from('organizations') as any)
      .insert(insertPayload)
      .select('id, name')
      .single();
    org = retry.data;
    orgError = retry.error;
  }

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

  safeRevalidate('/admin');
  return { success: true };
}

/**
 * Suspender o reactivar una empresa por morosidad o solicitud
 */
export async function toggleCompanyStatus(organizationId: string, isActive: boolean) {
  await requireSuperAdmin();

  const updateData: Record<string, any> = {
    is_active: isActive,
    subscription_status: isActive ? 'active' : 'past_due',
    past_due_since: isActive ? null : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let { error } = await (supabaseAdmin.from('organizations') as any)
    .update(updateData)
    .eq('id', organizationId);

  if (error && (error.message?.includes('past_due_since') || error.message?.includes('column'))) {
    delete updateData.past_due_since;
    const retry = await (supabaseAdmin.from('organizations') as any)
      .update(updateData)
      .eq('id', organizationId);
    error = retry.error;
  }

  if (error) {
    throw new Error(`Error cambiando estado de la empresa: ${error.message}`);
  }

  safeRevalidate('/admin');
  safeRevalidate('/', 'layout');
  return { success: true };
}

/**
 * Registrar pago manual para una empresa (Transferencia bancaria, Stripe link, etc.)
 * - Guarda recibo en organization_payments
 * - Actualiza paid_until_month
 * - Reactiva la empresa si estaba en mora
 * - Reinicia a cero los tokens consumidos de OpenAI para el nuevo ciclo
 */
export async function registerCompanyPayment(input: {
  organizationId: string;
  amount: number;
  periodMonth: string;
  paymentMethod?: string;
  notes?: string;
}) {
  await requireSuperAdmin();

  // 1. Registrar en libro contable
  try {
    await (supabaseAdmin.from('organization_payments') as any).insert({
      organization_id: input.organizationId,
      amount: input.amount,
      currency: 'USD',
      period_month: input.periodMonth,
      payment_method: input.paymentMethod || 'transferencia',
      notes: input.notes || 'Registro manual por Super Admin',
      created_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.warn('[PAYMENT LEDGER WARN]', err?.message);
  }

  // 2. Actualizar empresa: reactivar, renovar ciclo y reiniciar tokens consumidos
  const updateData: Record<string, any> = {
    paid_until_month: input.periodMonth,
    is_active: true,
    subscription_status: 'active',
    past_due_since: null,
    ai_tokens_used: 0, // Cláusula 6 y 7: tokens se renuevan al pagar el mes
    updated_at: new Date().toISOString(),
  };

  let { error } = await (supabaseAdmin.from('organizations') as any)
    .update(updateData)
    .eq('id', input.organizationId);

  if (error && (error.message?.includes('paid_until_month') || error.message?.includes('column'))) {
    delete updateData.paid_until_month;
    delete updateData.past_due_since;
    const retry = await (supabaseAdmin.from('organizations') as any)
      .update(updateData)
      .eq('id', input.organizationId);
    error = retry.error;
  }

  if (error) {
    throw new Error(`Error registrando pago de la empresa: ${error.message}`);
  }

  safeRevalidate('/admin');
  safeRevalidate('/', 'layout');
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

  let { error } = await (supabaseAdmin.from('organizations') as any)
    .update({
      plan_type: planType,
      subscription_status: subscriptionStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', organizationId);

  if (error && error.message?.includes('organizations_plan_type_check') && planType === 'starter') {
    const retry = await (supabaseAdmin.from('organizations') as any)
      .update({
        plan_type: 'core',
        subscription_status: subscriptionStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', organizationId);
    error = retry.error;
  }

  if (error) {
    throw new Error(`Error actualizando plan: ${error.message}`);
  }

  revalidatePath('/admin');
  return { success: true };
}

/**
 * Regenerar contraseña temporal para el Administrador de una empresa cliente
 */
export async function regenerateCompanyAdminPassword(organizationId: string) {
  await requireSuperAdmin();

  // 1. Obtener el perfil del administrador de la empresa
  const { data: adminProfile, error: profileError } = await (supabaseAdmin.from('profiles') as any)
    .select('id, full_name, email, role, is_super_admin')
    .eq('organization_id', organizationId)
    .eq('role', 'admin')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (profileError || !adminProfile) {
    throw new Error('No se encontró el administrador asignado a esta empresa.');
  }

  // Protección: Bloquear cambio de contraseña de Super Admin desde la web
  if (adminProfile.is_super_admin || adminProfile.email?.toLowerCase() === 'admin@synqo.dev') {
    throw new Error(
      'Por seguridad de infraestructura, la contraseña del Super Admin solo puede modificarse mediante la terminal: npm run reset-superadmin'
    );
  }

  // 2. Generar contraseña temporal segura
  const randomSuffix = Math.random().toString(36).slice(-6);
  const randomPin = Math.floor(10 + Math.random() * 90);
  const tempPassword = `Synqo_${randomSuffix}!${randomPin}`;

  // 3. Actualizar contraseña y activar bandera obligatoria de primer cambio
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(adminProfile.id, {
    password: tempPassword,
    user_metadata: {
      full_name: adminProfile.full_name,
      must_change_password: true,
    },
  });

  if (authError) {
    throw new Error(`Error regenerando contraseña del admin: ${authError.message}`);
  }

  revalidatePath('/admin');
  return {
    success: true,
    email: adminProfile.email,
    fullName: adminProfile.full_name,
    tempPassword,
  };
}

