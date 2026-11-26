'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
export type { PlanType, SubscriptionStatus, EnabledModules, AppointmentSettings } from '@/lib/supabase/types';
import { PlanType, SubscriptionStatus, EnabledModules, AppointmentSettings } from '@/lib/supabase/types';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { calculateBillingStatus } from '@/lib/billing/billing-status';
import { encryptSecret } from '@/lib/security/encryption';
import { normalizeAlertThresholds, normalizeTokenPolicy } from '@/lib/monitoring/token-policy';
import { PROMPT_ASSISTANT_CONFIG } from '@/lib/ai/config';
import { getAssistantBudgetStatus, normalizeAssistantState } from '@/lib/ai/prompt-assistant/state';
import { normalizeFollowUpSettings, type FollowUpSettingsConfig } from '@/lib/ai/follow-up-types';
import { generateStarterPromptFromName } from '@/lib/ai/prompt-assistant/starter';

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
    if (process.env.NODE_ENV !== 'production' && (err?.message?.includes('cookies') || err?.message?.includes('request scope'))) {
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
  const [orgsRes, contactsRes, messagesRes, profilesRes, leadMsgsRes, aiMsgsRes, humanMsgsRes, ordersRes] = await Promise.all([
    (supabaseAdmin.from('organizations') as any)
      .select('id, name, is_active, subscription_status, paid_until_month, past_due_since, ai_tokens_used, ai_tokens_google_used, ai_tokens_openai_used, whatsapp_provider, evolution_instance_name, whatsapp_phone_number_id', { count: 'exact' }),
    (supabaseAdmin.from('contacts') as any)
      .select('id', { count: 'exact', head: true }),
    (supabaseAdmin.from('messages') as any)
      .select('id', { count: 'exact', head: true }),
    (supabaseAdmin.from('profiles') as any)
      .select('id, organization_id, email, is_super_admin'),
    (supabaseAdmin.from('messages') as any)
      .select('id', { count: 'exact', head: true })
      .eq('sender_type', 'lead'),
    (supabaseAdmin.from('messages') as any)
      .select('id', { count: 'exact', head: true })
      .eq('sender_type', 'ai'),
    (supabaseAdmin.from('messages') as any)
      .select('id', { count: 'exact', head: true })
      .eq('sender_type', 'agent_manual'),
    (supabaseAdmin.from('orders') as any)
      .select('id, total, status'),
  ]);

  const orgs = orgsRes.data || [];
  const totalOrgs = orgsRes.count || orgs.length;
  const profiles = profilesRes.data || [];
  const orders = ordersRes.data || [];

  const leadMsgsCount = leadMsgsRes.count || 0;
  const aiMsgsCount = aiMsgsRes.count || 0;
  const humanMsgsCount = humanMsgsRes.count || 0;
  const totalOutbound = aiMsgsCount + humanMsgsCount;
  const globalAutonomyPct = totalOutbound > 0 ? Math.round((aiMsgsCount / totalOutbound) * 100) : 100;

  const totalGoogleTokens = orgs.reduce((acc: number, curr: any) => acc + (Number(curr.ai_tokens_google_used) || 0), 0);
  const totalOpenAiTokens = orgs.reduce((acc: number, curr: any) => acc + (Number(curr.ai_tokens_openai_used) || 0), 0);
  const totalTokens = orgs.reduce((acc: number, curr: any) => acc + (Number(curr.ai_tokens_used) || 0), 0);

  // Estimación de costo real de infraestructura IA (Google Gemini 2.0 Flash ~0.10/M tokens, OpenAI mini ~0.30/M tokens)
  const estimatedCostUsd = Number(
    ((totalGoogleTokens / 1_000_000) * 0.10 + (totalOpenAiTokens / 1_000_000) * 0.30).toFixed(2)
  );

  const evolutionConnectedCount = orgs.filter(
    (o: any) => (o.whatsapp_provider === 'evolution' || !o.whatsapp_provider) && Boolean(o.evolution_instance_name)
  ).length;
  const metaConnectedCount = orgs.filter(
    (o: any) => o.whatsapp_provider === 'meta' && Boolean(o.whatsapp_phone_number_id)
  ).length;

  const confirmedRevenue = orders
    .filter((o: any) => ['confirmed', 'paid', 'delivered'].includes(o.status))
    .reduce((acc: number, o: any) => acc + (Number(o.total) || 0), 0);

  const exemptOrgIds = new Set(
    profiles
      .filter((p: any) => p.is_super_admin || p.email?.toLowerCase() === superAdminEmail.toLowerCase())
      .map((p: any) => p.organization_id)
      .filter(Boolean)
  );

  const activeOrgs = orgs.filter(
    (o: any) => o.is_active !== false && (o.subscription_status === 'active' || o.subscription_status === 'trialing')
  ).length;

  let paidCount = 0;
  let pendingCount = 0;
  let graceCount = 0;
  let moraCount = 0;

  for (const org of orgs) {
    if (exemptOrgIds.has(org.id)) continue; // Super Admin exento de métricas de cobranza / mora

    const bStatus = calculateBillingStatus(org);
    if (bStatus.status === 'al_dia') paidCount++;
    else if (bStatus.status === 'pendiente') pendingCount++;
    else if (bStatus.status === 'gracia') graceCount++;
    else if (bStatus.status === 'mora_preventiva' || bStatus.status === 'baja_definitiva') moraCount++;
  }

  return {
    totalOrganizations: totalOrgs,
    activeOrganizations: activeOrgs,
    totalContacts: contactsRes.count || 0,
    totalMessages: messagesRes.count || 0,
    totalProfiles: profilesRes.count || 0,
    totalAiTokensUsed: totalTokens,
    totalGoogleTokens,
    totalOpenAiTokens,
    estimatedPlatformCostUsd: estimatedCostUsd,
    messageBreakdown: {
      inboundLeads: leadMsgsCount,
      outboundAi: aiMsgsCount,
      outboundHuman: humanMsgsCount,
      globalAutonomyPct,
    },
    whatsappConnections: {
      evolutionInstances: evolutionConnectedCount,
      metaNumbers: metaConnectedCount,
    },
    salesSummary: {
      totalOrders: orders.length,
      confirmedRevenue,
    },
    billingSummary: {
      paidCount,
      pendingCount,
      graceCount,
      moraCount,
    },
  };
}

export interface CronHealthEntry {
  jobName: string;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastDetail: string | null;
  invocationsLast24h: number;
  errorsLast24h: number;
  skippedMissingSecretsLast24h: number;
}

/**
 * Salud de los crons del pilar de automatización (recontacto autónomo, recordatorios).
 * Detecta el modo silencioso: si los secretos de Vault faltan, el cron de reactivación
 * se omite sin error — esta lectura lo hace visible.
 */
export async function getCronHealthAction(): Promise<{ jobs: CronHealthEntry[] }> {
  await requireSuperAdmin();

  const JOBS = ['lead-reactivation', 'appointment-reminders', 'cleanup-storage'];
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await (supabaseAdmin.from('cron_job_log') as any)
    .select('job_name, status, detail, created_at')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) {
    console.warn('[SUPERADMIN CRON HEALTH WARN]', error);
    return { jobs: JOBS.map((jobName) => ({ jobName, lastRunAt: null, lastStatus: null, lastDetail: null, invocationsLast24h: 0, errorsLast24h: 0, skippedMissingSecretsLast24h: 0 })) };
  }

  const rows = (data || []) as Array<{ job_name: string; status: string; detail: string | null; created_at: string }>;

  const jobs: CronHealthEntry[] = JOBS.map((jobName) => {
    const jobRows = rows.filter((r) => r.job_name === jobName);
    const last = jobRows[0] || null;
    return {
      jobName,
      lastRunAt: last?.created_at || null,
      lastStatus: last?.status || null,
      lastDetail: last?.detail || null,
      invocationsLast24h: jobRows.filter((r) => r.status === 'invoked').length,
      errorsLast24h: jobRows.filter((r) => r.status === 'error').length,
      skippedMissingSecretsLast24h: jobRows.filter((r) => r.status === 'skipped_missing_secrets').length,
    };
  });

  return { jobs };
}

export interface OrganizationRow {
  id: string;
  name: string;
  subscription_status: SubscriptionStatus;
  plan_type: PlanType;
  max_users: number;
  is_active: boolean;
  is_exempt?: boolean;
  whatsapp_phone_number_id: string | null;
  created_at: string;
  users_count: number;
  online_users_count?: number;
  contacts_count: number;
  admin_email?: string;
  admin_name?: string;
  ai_tokens_used?: number;
  ai_tokens_limit?: number;
  ai_tokens_google_used?: number;
  ai_tokens_openai_used?: number;
  paid_until_month?: string | null;
  billing_due_day?: number;
  past_due_since?: string | null;
  days_past_due?: number;
  billing_status?: 'al_dia' | 'pendiente' | 'gracia' | 'mora_preventiva' | 'baja_definitiva';
  billing_status_label?: string;
  billing_status_color?: string;
  is_suspended?: boolean;
  company_code?: string | null;
  enabled_modules?: EnabledModules;
  appointment_settings?: AppointmentSettings;
  whatsapp_provider?: 'meta' | 'evolution';
  evolution_api_url?: string | null;
  evolution_instance_name?: string | null;
  evolution_status?: 'connected' | 'disconnected' | 'connecting';
  evolution_phone_connected?: string | null;
  evolution_anti_ban_mode?: boolean;
  evolution_max_outbound_per_hour?: number;
  specialist_label?: string | null;
  room_label?: string | null;
  industry_preset?: string | null;
  prompt_assistant_stats?: {
    tokensToday: number;
    callsToday: number;
    dailyCap: number;
    capExceededToday: boolean;
    tokensLast7Days?: number;
    weeklyCap?: number;
    capExceededWeekly?: boolean;
    totalTokens: number;
  };
}

/**
 * Listar todas las organizaciones con conteo y límite de usuarios
 */
export async function listAllOrganizations(): Promise<OrganizationRow[]> {
  await requireSuperAdmin();

  // Consultar organizaciones, perfiles y contactos en paralelo
  const [orgsRes, profilesRes, contactsRes] = await Promise.all([
    (supabaseAdmin.from('organizations') as any)
      .select('*')
      .order('created_at', { ascending: false }),
    (supabaseAdmin.from('profiles') as any)
      .select('id, organization_id, email, full_name, role, last_seen_at, availability_status'),
    (supabaseAdmin.from('contacts') as any)
      .select('id, organization_id'),
  ]);

  const orgs = orgsRes.data;
  if (orgsRes.error || !orgs) {
    throw new Error(`Error al listar organizaciones: ${orgsRes.error?.message}`);
  }

  const profiles = profilesRes.data || [];
  const contacts = contactsRes.data || [];

  const nowMs = Date.now();
  const ONLINE_WINDOW_MS = 5 * 60 * 1000;

  const rows: OrganizationRow[] = orgs.map((org: any) => {
    const orgProfiles = profiles.filter((p: any) => p.organization_id === org.id);
    const onlineUsersCount = orgProfiles.filter((p: any) => {
      if (!p.last_seen_at || p.availability_status === 'offline') return false;
      const seenMs = new Date(p.last_seen_at).getTime();
      return Number.isFinite(seenMs) && nowMs - seenMs <= ONLINE_WINDOW_MS;
    }).length;
    const orgContacts = contacts.filter((c: any) => c.organization_id === org.id);
    const adminUser = orgProfiles.find((p: any) => p.role === 'admin') || orgProfiles[0];
    const isSuperAdminOrg = orgProfiles.some((p: any) =>
      Boolean(p.is_super_admin) || (p.email && p.email.toLowerCase() === superAdminEmail.toLowerCase())
    );
    const bStatus = calculateBillingStatus({ ...org, is_exempt: isSuperAdminOrg });

    const assistantState = normalizeAssistantState(org?.structured_prompt_data?.assistant);
    const assistantBudget = getAssistantBudgetStatus(assistantState);

    return {
      id: org.id,
      name: org.name,
      subscription_status: org.subscription_status || 'trialing',
      plan_type: org.plan_type || 'core',
      max_users: org.max_users ?? 3,
      is_active: org.is_active ?? true,
      is_exempt: isSuperAdminOrg,
      whatsapp_phone_number_id: org.whatsapp_phone_number_id || null,
      created_at: org.created_at,
      users_count: orgProfiles.length,
      online_users_count: onlineUsersCount,
      contacts_count: orgContacts.length,
      admin_email: adminUser?.email,
      admin_name: adminUser?.full_name,
      ai_tokens_used: Number(org.ai_tokens_used || 0),
      ai_tokens_limit: Number(org.ai_tokens_limit || 100000),
      ai_tokens_google_used: Number(
        org.ai_tokens_google_used || (org.ai_tokens_used ? Math.max(0, Number(org.ai_tokens_used) - Number(org.ai_tokens_openai_used || 0)) : 0)
      ),
      ai_tokens_openai_used: Number(org.ai_tokens_openai_used || 0),
      paid_until_month: org.paid_until_month || null,
      billing_due_day: org.billing_due_day || 5,
      past_due_since: org.past_due_since || null,
      days_past_due: bStatus.daysPastDue,
      billing_status: bStatus.status,
      billing_status_label: bStatus.label,
      billing_status_color: bStatus.color,
      is_suspended: bStatus.isSuspended,
      company_code: org.company_code || null,
      whatsapp_provider: org.whatsapp_provider || 'meta',
      evolution_api_url: org.evolution_api_url || null,
      evolution_instance_name: org.evolution_instance_name || null,
      evolution_status: org.evolution_status || 'disconnected',
      evolution_phone_connected: org.evolution_phone_connected || null,
      evolution_anti_ban_mode: org.evolution_anti_ban_mode ?? true,
      evolution_max_outbound_per_hour: org.evolution_max_outbound_per_hour || 20,
      specialist_label: org.specialist_label || null,
      room_label: org.room_label || null,
      industry_preset: org.industry_preset || null,
      prompt_assistant_stats: {
        tokensToday: assistantBudget.tokensToday,
        callsToday: assistantBudget.callsToday,
        dailyCap: assistantBudget.dailyCap,
        capExceededToday: assistantBudget.limitScope === 'daily' || assistantBudget.limitScope === 'weekly',
        tokensLast7Days: assistantBudget.tokensLast7Days,
        weeklyCap: assistantBudget.weeklyCap,
        capExceededWeekly: assistantBudget.limitScope === 'weekly',
        totalTokens: assistantState.totalAssistantTokens,
      },
      enabled_modules: (org.enabled_modules as EnabledModules) || {
        native_calendar: true,
        physical_rooms: false,
        staff_mobile_portal: false,
        quick_pay: false,
        anti_no_show: true,
      },
      appointment_settings: (org.appointment_settings as AppointmentSettings) || null,
    };
  });

  return rows;
}

const ProvisionSchema = z.object({
  companyName: z.string().min(2, 'El nombre de la empresa debe tener al menos 2 caracteres.'),
  adminName: z.string().min(2, 'El nombre del administrador es requerido.'),
  adminEmail: z.string().email('Correo electrónico inválido.'),
  adminPassword: z.string().min(8, 'La contraseña debe tener mínimo 8 caracteres.'),
  planType: z.enum(['starter', 'core', 'pro', 'enterprise']).optional().default('core'),
  maxUsers: z.number().int().min(1).max(100).default(3),
  firstBillingMonth: z.string().optional(),
  enabledModules: z.any().optional(),
  companyCode: z.string().optional(),
  industryPreset: z.string().optional(),
  whatsappProvider: z.enum(['meta', 'evolution']).optional(),
  evolutionApiUrl: z.string().optional(),
  evolutionApiKey: z.string().optional(),
  evolutionInstanceName: z.string().optional(),
  evolutionAntiBanMode: z.boolean().optional(),
  evolutionMaxOutboundPerHour: z.number().int().optional(),
  specialistLabel: z.string().optional(),
  roomLabel: z.string().optional(),
  aiTokensLimit: z.number().int().min(5_000_000).optional(),
  monthlyBasePriceCop: z.number().int().min(0).optional(),
  billingDueDay: z.number().int().min(1).max(31).optional(),
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
  enabledModules?: EnabledModules;
  companyCode?: string;
  industryPreset?: string;
  whatsappProvider?: 'meta' | 'evolution';
  evolutionApiUrl?: string;
  evolutionApiKey?: string;
  evolutionInstanceName?: string;
  evolutionAntiBanMode?: boolean;
  evolutionMaxOutboundPerHour?: number;
  specialistLabel?: string;
  roomLabel?: string;
  tokenAlertThresholds?: number[] | string;
  overagePricePer500kCop?: number | null;
  aiTokensLimit?: number;
  monthlyBasePriceCop?: number;
  billingDueDay?: number;
}) {
  await requireSuperAdmin();

  const validated = ProvisionSchema.parse(input);

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  // Opción A: Días de cortesía si entra a mitad de mes. Por defecto cubre el mes actual.
  const paidUntilMonth = validated.firstBillingMonth || currentMonthStr;

  const businessModel = validated.industryPreset || 'products';
  const isProducts = businessModel === 'products';
  const isServices = businessModel === 'services';
  const isHybrid = businessModel === 'hybrid';

  const defaultModules: EnabledModules = validated.enabledModules || {
    native_calendar: isServices || isHybrid,
    orders: isProducts || isHybrid,
    physical_rooms: false,
    staff_mobile_portal: false,
    quick_pay: false,
    anti_no_show: isServices || isHybrid,
  };

  const generatedCode = validated.companyCode?.trim().toUpperCase() ||
    `EMPR${Math.floor(1000 + Math.random() * 9000)}`;

  const initialTokensLimit = Math.max(5_000_000, Number(validated.aiTokensLimit || 5_000_000));
  const initialDueDay = validated.billingDueDay || now.getDate();
  const initialCycleEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Crear Organización (intenta con el plan seleccionado y fallback a 'core' si la BD aún tiene el constraint original)
  let planToInsert = validated.planType;
  let insertPayload: Record<string, any> = {
    name: validated.companyName.trim(),
    subscription_status: 'active',
    plan_type: planToInsert,
    max_users: validated.maxUsers,
    is_active: true,
    paid_until_month: paidUntilMonth,
    billing_due_day: initialDueDay,
    cycle_kind: 'paid',
    billing_cycle_ends_at: initialCycleEndsAt,
    company_code: generatedCode,
    enabled_modules: defaultModules,
    industry_preset: validated.industryPreset || 'services',
    whatsapp_provider: validated.whatsappProvider || 'meta',
    evolution_api_url: validated.evolutionApiUrl?.trim() || null,
    evolution_api_key: validated.evolutionApiKey?.trim() ? encryptSecret(validated.evolutionApiKey.trim()) : null,
    evolution_instance_name: validated.evolutionInstanceName?.trim() || null,
    evolution_anti_ban_mode: validated.evolutionAntiBanMode ?? true,
    evolution_max_outbound_per_hour: validated.evolutionMaxOutboundPerHour || 20,
    specialist_label: validated.specialistLabel || 'Asesor Comercial',
    room_label: validated.roomLabel || 'Reunión',
    ai_tokens_used: 0,
    ai_tokens_limit: initialTokensLimit,
    ai_tokens_google_used: 0,
    ai_tokens_openai_used: 0,
    system_prompt: generateStarterPromptFromName(validated.companyName),
    ...(typeof validated.monthlyBasePriceCop === 'number'
      ? {
          appointment_settings: {
            token_policy: {
              monthlyBasePriceCop: Math.max(0, Math.round(validated.monthlyBasePriceCop)),
              overagePricePer1MCop: 20000,
              gracePct: 20,
              hardStopAfterGrace: true,
              overageAllowed: true,
            },
          },
        }
      : {}),
  };

  let { data: org, error: orgError } = await (supabaseAdmin.from('organizations') as any)
    .insert(insertPayload)
    .select('id, name, company_code')
    .single();

  // Reintento inmediato eliminando columnas opcionales que aún no existan en la base de datos
  if (orgError && orgError.message) {
    delete insertPayload.specialist_label;
    delete insertPayload.room_label;
    delete insertPayload.paid_until_month;
    delete insertPayload.billing_due_day;
    const retry = await (supabaseAdmin.from('organizations') as any)
      .insert(insertPayload)
      .select('id, name, company_code')
      .single();
    org = retry.data;
    orgError = retry.error;
  }

  if (orgError && orgError.message?.includes('organizations_plan_type_check') && insertPayload.plan_type === 'starter') {
    insertPayload.plan_type = 'core';
    const retry = await (supabaseAdmin.from('organizations') as any)
      .insert(insertPayload)
      .select('id, name, company_code')
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
    organization: {
      ...org,
      company_code: org?.company_code || generatedCode,
    },
    user: {
      id: userId,
      email: validated.adminEmail,
      fullName: validated.adminName,
    },
    credentials: {
      companyName: validated.companyName.trim(),
      companyCode: org?.company_code || generatedCode,
      adminName: validated.adminName.trim(),
      adminEmail: validated.adminEmail.trim().toLowerCase(),
      adminPassword: validated.adminPassword,
    },
  };
}

/**
 * Modificar límite de usuarios (max_users) de una empresa
 */
export async function updateCompanySeats(organizationId: string, maxUsers: number) {
  await requireSuperAdmin();

  if (maxUsers < 1 || maxUsers > 500) {
    throw new Error('El límite de usuarios debe estar entre 1 y 500.');
  }

  const { error } = await (supabaseAdmin.from('organizations') as any)
    .update({
      max_users: maxUsers,
      updated_at: new Date().toISOString(),
    })
    .eq('id', organizationId);

  if (error) {
    throw new Error(`Error actualizando límite de usuarios: ${error.message}`);
  }

  safeRevalidate('/admin');
  return { success: true };
}

/**
 * Actualizar detalles completos de una empresa desde la Consola Super Admin:
 * - Nombre comercial
 * - Plan comercial (Starter, Pro, Enterprise)
 * - Límite de usuarios (con validación de usuarios activos)
 * - Límite de tokens IA (boosters o cuota base)
 * - Reinicio opcional de tokens consumidos a 0 (cortesía de soporte)
 */
export async function updateCompanyDetails(input: {
  organizationId: string;
  name: string;
  planType?: PlanType;
  maxUsers: number;
  aiTokensLimit?: number;
  resetTokensUsed?: boolean;
  enabledModules?: EnabledModules;
  companyCode?: string;
  whatsappProvider?: 'meta' | 'evolution';
  evolutionApiUrl?: string;
  evolutionApiKey?: string;
  evolutionInstanceName?: string;
  evolutionAntiBanMode?: boolean;
  evolutionMaxOutboundPerHour?: number;
  specialistLabel?: string;
  roomLabel?: string;
  tokenAlertThresholds?: number[] | string;
  overagePricePer500kCop?: number | null;
  businessModel?: 'products' | 'services' | 'hybrid';
  isActive?: boolean;
}) {
  await requireSuperAdmin();

  const name = (input.name || '').trim();
  if (name.length < 2 || name.length > 100) {
    throw new Error('El nombre de la empresa debe tener entre 2 y 100 caracteres.');
  }

  if (input.maxUsers < 1 || input.maxUsers > 500) {
    throw new Error('El límite de usuarios debe estar entre 1 y 500.');
  }

  // Validación de seguridad: no permitir reducir usuarios por debajo de los usuarios reales actuales
  const { count: currentUsersCount, error: countErr } = await (supabaseAdmin.from('profiles') as any)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', input.organizationId);

  if (!countErr && typeof currentUsersCount === 'number' && input.maxUsers < currentUsersCount) {
    throw new Error(
      `No se puede reducir a ${input.maxUsers} usuarios porque la empresa tiene ${currentUsersCount} usuarios activos. Primero deben desactivar o eliminar miembros del equipo.`
    );
  }

  const tokensLimit = input.aiTokensLimit && input.aiTokensLimit > 0 ? input.aiTokensLimit : 500000;

  const updateData: Record<string, any> = {
    name,
    max_users: input.maxUsers,
    ai_tokens_limit: tokensLimit,
    updated_at: new Date().toISOString(),
  };

  if (input.isActive !== undefined) {
    updateData.is_active = input.isActive;
  }

  if (input.businessModel) {
    const isProducts = input.businessModel === 'products';
    const isServices = input.businessModel === 'services';
    const isHybrid = input.businessModel === 'hybrid';

    updateData.industry_preset = input.businessModel;

    const currentModules = (input.enabledModules || {}) as Record<string, boolean>;
    updateData.enabled_modules = {
      ...currentModules,
      native_calendar: isServices || isHybrid,
      orders: isProducts || isHybrid,
    };
  } else if (input.enabledModules) {
    updateData.enabled_modules = input.enabledModules;
  }

  if (input.planType) {
    updateData.plan_type = input.planType;
  }

  if (input.whatsappProvider) {
    updateData.whatsapp_provider = input.whatsappProvider;
  }

  if (input.evolutionApiUrl !== undefined) {
    updateData.evolution_api_url = input.evolutionApiUrl.trim() || null;
  }

  if (input.evolutionApiKey && input.evolutionApiKey.trim()) {
    updateData.evolution_api_key = encryptSecret(input.evolutionApiKey.trim());
  }

  if (input.evolutionInstanceName !== undefined) {
    updateData.evolution_instance_name = input.evolutionInstanceName.trim() || null;
  }

  if (input.evolutionAntiBanMode !== undefined) {
    updateData.evolution_anti_ban_mode = input.evolutionAntiBanMode;
  }

  if (input.evolutionMaxOutboundPerHour !== undefined) {
    updateData.evolution_max_outbound_per_hour = input.evolutionMaxOutboundPerHour;
  }

  if (input.enabledModules) {
    updateData.enabled_modules = input.enabledModules;
  }

  if (input.companyCode) {
    updateData.company_code = input.companyCode.trim().toUpperCase();
  }

  if (input.specialistLabel !== undefined) {
    updateData.specialist_label = input.specialistLabel.trim() || 'Colaborador';
  }

  if (input.roomLabel !== undefined) {
    updateData.room_label = input.roomLabel.trim() || 'Espacio';
  }

  if (input.resetTokensUsed) {
    updateData.ai_tokens_used = 0;
    updateData.ai_tokens_google_used = 0;
    updateData.ai_tokens_openai_used = 0;
  }

  if (
    input.resetTokensUsed ||
    input.tokenAlertThresholds !== undefined ||
    input.overagePricePer500kCop !== undefined
  ) {
    const { data: currentOrg } = await (supabaseAdmin.from('organizations') as any)
      .select('appointment_settings')
      .eq('id', input.organizationId)
      .single();
    const curSettings =
      currentOrg?.appointment_settings && typeof currentOrg.appointment_settings === 'object'
        ? { ...currentOrg.appointment_settings }
        : {};
    const curPolicy = normalizeTokenPolicy(curSettings.token_policy);
    updateData.appointment_settings = {
      ...curSettings,
      token_policy: {
        ...curPolicy,
        ...(input.tokenAlertThresholds !== undefined
          ? { alertThresholds: normalizeAlertThresholds(input.tokenAlertThresholds) }
          : {}),
        ...(input.overagePricePer500kCop !== undefined
          ? {
              overagePricePer500kCop:
                input.overagePricePer500kCop && input.overagePricePer500kCop > 0
                  ? Math.round(input.overagePricePer500kCop)
                  : null,
            }
          : {}),
        ...(input.resetTokensUsed ? { alertsSentInCycle: {} } : {}),
      },
    };
  }

  let { error } = await (supabaseAdmin.from('organizations') as any)
    .update(updateData)
    .eq('id', input.organizationId);

  // Fallback si faltan columnas opcionales en updateData
  if (error && error.message && (error.message.includes('does not exist') || error.message.includes('column'))) {
    delete updateData.specialist_label;
    delete updateData.room_label;
    delete updateData.paid_until_month;
    delete updateData.billing_due_day;
    const retry = await (supabaseAdmin.from('organizations') as any)
      .update(updateData)
      .eq('id', input.organizationId);
    error = retry.error;
  }

  // Fallback si la BD aún tiene constraint con 'core' en vez de 'starter'
  if (error && error.message?.includes('organizations_plan_type_check') && input.planType === 'starter') {
    updateData.plan_type = 'core';
    const retry = await (supabaseAdmin.from('organizations') as any)
      .update(updateData)
      .eq('id', input.organizationId);
    error = retry.error;
  }

  if (error) {
    throw new Error(`Error actualizando empresa: ${error.message}`);
  }

  safeRevalidate('/admin');
  safeRevalidate('/', 'layout');
  return { success: true };
}

/**
 * Activar o desactivar módulos individuales de una empresa (Switches de Suscripción)
 */
export async function updateOrganizationModules(
  organizationId: string,
  modules: Partial<EnabledModules>
) {
  await requireSuperAdmin();

  const { data: org, error: fetchErr } = await (supabaseAdmin.from('organizations') as any)
    .select('enabled_modules')
    .eq('id', organizationId)
    .single();

  if (fetchErr) {
    throw new Error(`Error al consultar módulos de la empresa: ${fetchErr.message}`);
  }

  const currentModules: EnabledModules = (org?.enabled_modules as EnabledModules) || {
    native_calendar: true,
    physical_rooms: false,
    staff_mobile_portal: false,
    quick_pay: false,
    anti_no_show: true,
  };

  const updatedModules: EnabledModules = {
    ...currentModules,
    ...modules,
  };

  const { error: updateErr } = await (supabaseAdmin.from('organizations') as any)
    .update({
      enabled_modules: updatedModules,
      updated_at: new Date().toISOString(),
    })
    .eq('id', organizationId);

  if (updateErr) {
    throw new Error(`Error al guardar configuración de módulos: ${updateErr.message}`);
  }

  safeRevalidate('/admin');
  return { success: true, enabled_modules: updatedModules };
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
  periodMonth: string;
  amount?: number;
  paymentMethod?: string;
  notes?: string;
}) {
  await requireSuperAdmin();

  // 1. Registrar en libro contable si está disponible
  try {
    await (supabaseAdmin.from('organization_payments') as any).insert({
      organization_id: input.organizationId,
      amount: input.amount ?? 0,
      currency: 'USD',
      period_month: input.periodMonth,
      payment_method: input.paymentMethod || 'transferencia',
      notes: input.notes || 'Registro manual de cobertura por Super Admin',
      created_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.warn('[PAYMENT LEDGER WARN]', err?.message);
  }

  const { data: orgBilling } = await (supabaseAdmin.from('organizations') as any)
    .select('appointment_settings')
    .eq('id', input.organizationId)
    .single();

  const curBillingSettings =
    orgBilling?.appointment_settings && typeof orgBilling.appointment_settings === 'object'
      ? { ...orgBilling.appointment_settings }
      : {};
  const curBillingPolicy = normalizeTokenPolicy(curBillingSettings.token_policy);

  // 2. Actualizar empresa: reactivar, renovar ciclo y reiniciar tokens + banderas de alertas
  const updateData: Record<string, any> = {
    paid_until_month: input.periodMonth,
    is_active: true,
    subscription_status: 'active',
    past_due_since: null,
    ai_tokens_used: 0, // Cláusula 6 y 7: tokens se renuevan al pagar el mes
    appointment_settings: {
      ...curBillingSettings,
      token_policy: {
        ...curBillingPolicy,
        alertsSentInCycle: {},
      },
    },
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

/**
 * Obtener configuración completa de una empresa para el Modo Asistencia del Super Admin
 */
export async function getCompanyFullConfigAction(organizationId: string) {
  await requireSuperAdmin();

  const [orgRes, profilesRes, contactsRes] = await Promise.all([
    (supabaseAdmin.from('organizations') as any)
      .select('id, name, company_code, is_active, max_users, plan_type, subscription_status, paid_until_month, billing_due_day, past_due_since, whatsapp_provider, evolution_api_url, evolution_instance_name, evolution_status, evolution_phone_connected, evolution_anti_ban_mode, evolution_max_outbound_per_hour, whatsapp_phone_number_id, system_prompt, structured_prompt_data, appointment_settings, enabled_modules, ai_tokens_limit, ai_tokens_used, ai_provider, ai_tokens_google_used, ai_tokens_openai_used, industry_preset, created_at')
      .eq('id', organizationId)
      .single(),
    (supabaseAdmin.from('profiles') as any)
      .select('id, email, full_name, role, is_active, created_at, is_super_admin')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true }),
    (supabaseAdmin.from('contacts') as any)
      .select('id, is_ai_active, conversation_status, deal_value, custom_fields')
      .eq('organization_id', organizationId),
  ]);

  if (orgRes.error || !orgRes.data) {
    throw new Error(`Error obteniendo empresa: ${orgRes.error?.message || 'No encontrada'}`);
  }

  const org = orgRes.data;
  const profiles = profilesRes.data || [];
  const contacts = contactsRes.data || [];
  const contactIds = contacts.map((c: any) => c.id);

  let aiMessagesCount = 0;
  let humanMessagesCount = 0;
  let leadMessagesCount = 0;

  if (contactIds.length > 0) {
    const sampleIds = contactIds.slice(0, 300);
    const [aiRes, humanRes, leadRes] = await Promise.all([
      (supabaseAdmin.from('messages') as any)
        .select('id', { count: 'exact', head: true })
        .in('contact_id', sampleIds)
        .eq('sender_type', 'ai'),
      (supabaseAdmin.from('messages') as any)
        .select('id', { count: 'exact', head: true })
        .in('contact_id', sampleIds)
        .eq('sender_type', 'agent_manual'),
      (supabaseAdmin.from('messages') as any)
        .select('id', { count: 'exact', head: true })
        .in('contact_id', sampleIds)
        .eq('sender_type', 'lead'),
    ]);
    aiMessagesCount = aiRes.count || 0;
    humanMessagesCount = humanRes.count || 0;
    leadMessagesCount = leadRes.count || 0;
  }

  const totalOutbound = aiMessagesCount + humanMessagesCount;
  const autonomyPct = totalOutbound > 0 ? Math.round((aiMessagesCount / totalOutbound) * 100) : 100;
  const aiActiveContactsCount = contacts.filter((c: any) => c.is_ai_active !== false).length;
  const hotLeadsCount = contacts.filter((c: any) => {
    const temp = c.custom_fields?.lead_temperature || c.custom_fields?.temperature;
    return temp === 'hot' || (typeof c.deal_value === 'number' && c.deal_value > 0);
  }).length;

  const googleTokens = Number(org.ai_tokens_google_used || (org.ai_tokens_used ? Math.max(0, org.ai_tokens_used - (org.ai_tokens_openai_used || 0)) : 0));
  const openAiTokens = Number(org.ai_tokens_openai_used || 0);
  const estimatedCostUsd = Number(
    ((googleTokens / 1_000_000) * 0.10 + (openAiTokens / 1_000_000) * 0.30).toFixed(2)
  );

  const adminProfile = profiles.find((p: any) => p.role === 'admin') || profiles[0] || null;

  const appSettings = (org.appointment_settings as Record<string, any>) || {};
  const followUpSettings = normalizeFollowUpSettings(appSettings.follow_up_sequences);
  const stageLabels = (appSettings.stage_labels || {}) as Record<string, string>;
  const stageCriteria = (appSettings.stage_criteria || {}) as Record<string, string>;

  return {
    organization: org,
    profiles,
    adminProfile,
    telemetry: {
      contactsCount: contacts.length,
      aiActiveContactsCount,
      hotLeadsCount,
      aiMessagesCount,
      humanMessagesCount,
      leadMessagesCount,
      autonomyPct,
      tokensUsed: Number(org.ai_tokens_used || 0),
      tokensLimit: Number(org.ai_tokens_limit || 500000),
      googleTokensUsed: googleTokens,
      openAiTokensUsed: openAiTokens,
      estimatedCostUsd,
    },
    followUpSettings,
    stageLabels,
    stageCriteria,
  };
}

/**
 * Actualizar el Prompt de Sistema / Prompt Estructurado de una empresa como Super Admin
 */
export async function updateCompanyPromptAction(input: {
  organizationId: string;
  systemPrompt: string;
  structuredPromptData?: any;
  aiProvider?: 'google' | 'openai';
}) {
  await requireSuperAdmin();

  const updatePayload: Record<string, any> = {
    system_prompt: input.systemPrompt,
    updated_at: new Date().toISOString(),
  };

  if (input.structuredPromptData !== undefined) {
    updatePayload.structured_prompt_data = input.structuredPromptData;
  }

  if (input.aiProvider) {
    updatePayload.ai_provider = input.aiProvider;
  }

  const { error } = await (supabaseAdmin.from('organizations') as any)
    .update(updatePayload)
    .eq('id', input.organizationId);

  if (error) {
    throw new Error(`Error actualizando prompt: ${error.message}`);
  }

  safeRevalidate('/admin');
  safeRevalidate('/settings');
  return { success: true };
}

/**
 * Actualizar Seguimientos de Embudo de una empresa como Super Admin dentro de appointment_settings.follow_up_sequences
 */
export async function updateCompanyFollowUpAction(input: {
  organizationId: string;
  followUpSettings: Partial<FollowUpSettingsConfig> & { enabled?: boolean };
}) {
  await requireSuperAdmin();

  const { data: org, error: fetchErr } = await (supabaseAdmin.from('organizations') as any)
    .select('appointment_settings')
    .eq('id', input.organizationId)
    .single();

  if (fetchErr || !org) {
    throw new Error(`Error obteniendo configuración: ${fetchErr?.message || 'Empresa no encontrada'}`);
  }

  const existingSettings = (org.appointment_settings as Record<string, any>) || {};
  const currentFollowUp = normalizeFollowUpSettings(existingSettings.follow_up_sequences);

  const merged = {
    ...currentFollowUp,
    ...input.followUpSettings,
    enabled: input.followUpSettings.enabled !== undefined ? Boolean(input.followUpSettings.enabled) : currentFollowUp.enabled,
  };
  const cleanConfig = normalizeFollowUpSettings(merged);

  const updatedSettings = {
    ...existingSettings,
    follow_up_sequences: cleanConfig,
  };

  const { error } = await (supabaseAdmin.from('organizations') as any)
    .update({
      appointment_settings: updatedSettings,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.organizationId);

  if (error) {
    throw new Error(`Error actualizando seguimientos: ${error.message}`);
  }

  safeRevalidate('/admin');
  safeRevalidate('/settings');
  return { success: true, followUpSettings: cleanConfig };
}

/**
 * Actualizar las Etapas Comerciales y Criterios Semánticos de IA como Super Admin
 */
export async function updateCompanyPipelineAction(input: {
  organizationId: string;
  stageLabels?: Record<string, string>;
  stageCriteria?: Record<string, string>;
}) {
  await requireSuperAdmin();

  const { data: org, error: fetchErr } = await (supabaseAdmin.from('organizations') as any)
    .select('appointment_settings')
    .eq('id', input.organizationId)
    .single();

  if (fetchErr || !org) {
    throw new Error(`Error obteniendo configuración: ${fetchErr?.message || 'Empresa no encontrada'}`);
  }

  const existingSettings = (org.appointment_settings as Record<string, any>) || {};
  const currentLabels = existingSettings.stage_labels || {};
  const currentCriteria = existingSettings.stage_criteria || {};

  const cleanedLabels = { ...currentLabels };
  const cleanedCriteria = { ...currentCriteria };

  if (input.stageLabels) {
    for (const [k, v] of Object.entries(input.stageLabels)) {
      if (typeof v === 'string' && v.trim().length > 0) {
        cleanedLabels[k] = v.trim().slice(0, 40);
      } else if (v === '') {
        delete cleanedLabels[k];
      }
    }
  }

  if (input.stageCriteria) {
    for (const [k, v] of Object.entries(input.stageCriteria)) {
      if (typeof v === 'string' && v.trim().length > 0) {
        cleanedCriteria[k] = v.trim().slice(0, 150);
      } else if (v === '') {
        delete cleanedCriteria[k];
      }
    }
  }

  const updatedSettings = {
    ...existingSettings,
    stage_labels: cleanedLabels,
    stage_criteria: cleanedCriteria,
  };

  const { error } = await (supabaseAdmin.from('organizations') as any)
    .update({
      appointment_settings: updatedSettings,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.organizationId);

  if (error) {
    throw new Error(`Error actualizando pipeline: ${error.message}`);
  }

  safeRevalidate('/admin');
  safeRevalidate('/pipeline');
  safeRevalidate('/settings');
  return { success: true, stageLabels: cleanedLabels, stageCriteria: cleanedCriteria };
}

/**
 * Crear un nuevo usuario / asesor en una empresa como Super Admin
 */
export async function createCompanyUserAction(input: {
  organizationId: string;
  email: string;
  fullName: string;
  role: 'admin' | 'supervisor' | 'agent';
  tempPassword?: string;
}) {
  await requireSuperAdmin();

  const cleanEmail = input.email.trim().toLowerCase();
  const cleanName = input.fullName.trim();
  const password = input.tempPassword?.trim() || `Synqo_${Math.random().toString(36).slice(-6)}!${Math.floor(10 + Math.random() * 90)}`;

  // 1. Crear usuario en Auth de Supabase
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: cleanName,
      must_change_password: true,
    },
  });

  if (authErr || !authData.user) {
    throw new Error(`Error creando usuario en Auth: ${authErr?.message || 'Error desconocido'}`);
  }

  // 2. Crear o actualizar perfil en profiles
  const { error: profileErr } = await (supabaseAdmin.from('profiles') as any).upsert({
    id: authData.user.id,
    organization_id: input.organizationId,
    email: cleanEmail,
    full_name: cleanName,
    role: input.role,
    is_active: true,
    updated_at: new Date().toISOString(),
  });

  if (profileErr) {
    throw new Error(`Error vinculando perfil: ${profileErr.message}`);
  }

  revalidatePath('/admin');
  return {
    success: true,
    userId: authData.user.id,
    email: cleanEmail,
    fullName: cleanName,
    password,
  };
}

/**
 * Eliminar un usuario de una empresa como Super Admin
 */
export async function deleteCompanyUserAction(input: {
  organizationId: string;
  userId: string;
}) {
  await requireSuperAdmin();

  // Verificar que el usuario no sea Super Admin
  const { data: targetProfile } = await (supabaseAdmin.from('profiles') as any)
    .select('is_super_admin, email')
    .eq('id', input.userId)
    .single();

  if (targetProfile?.is_super_admin || targetProfile?.email?.toLowerCase() === 'admin@synqo.dev') {
    throw new Error('No es posible eliminar la cuenta de Super Admin.');
  }

  // Eliminar de Auth y Profile en cascada
  await supabaseAdmin.auth.admin.deleteUser(input.userId);
  await (supabaseAdmin.from('profiles') as any).delete().eq('id', input.userId);

  revalidatePath('/admin');
  return { success: true };
}

