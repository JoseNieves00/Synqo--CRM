import React from 'react';
import { getCurrentUserAndOrg } from '@/app/actions/auth';
import { getTeamInfo } from '@/app/actions/team';
import { getOrganizationKnowledgeGaps } from '@/app/actions/knowledge-gaps';
import { SettingsForm } from '@/components/settings/SettingsForm';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface SettingsPageProps {
  searchParams?: { [key: string]: string | undefined };
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const current = await getCurrentUserAndOrg();

  if (!current) {
    redirect('/login');
  }

  const role = current.profile.role;
  const isSuper = current.profile.is_super_admin;

  // Acceso restringido: Solo admin de la organización o Super Admin
  if (role !== 'admin' && !isSuper) {
    redirect('/dashboard');
  }

  const org = current.organization;
  const paymentAccounts = (org?.appointment_settings as any)?.payment_accounts || [];

  // Cargar información de equipo y usuarios
  let teamData = null;
  try {
    teamData = await getTeamInfo();
  } catch (err) {
    console.warn('[SETTINGS] Could not load team info:', err);
  }

  // Cargar preguntas frecuentes y vacíos de conocimiento (Pendientes y Resueltas)
  let knowledgeGaps: any[] = [];
  try {
    knowledgeGaps = await getOrganizationKnowledgeGaps();
  } catch (err) {
    console.warn('[SETTINGS] Could not load knowledge gaps:', err);
  }

  // Cargar colaboradores y salones físicos
  let specialists: any[] = [];
  let rooms: any[] = [];
  if (org?.id) {
    try {
      const [specRes, roomsRes] = await Promise.all([
        (supabaseAdmin.from('specialists') as any)
          .select('id, name, phone, specialty, access_pin, approval_status, is_active, created_at')
          .eq('organization_id', org.id)
          .order('created_at', { ascending: false }),
        (supabaseAdmin.from('physical_rooms') as any)
          .select('id, name, capacity, description, is_active')
          .eq('organization_id', org.id)
          .order('name', { ascending: true }),
      ]);
      specialists = specRes.data || [];
      rooms = roomsRes.data || [];
    } catch (err) {
      console.warn('[SETTINGS] Could not load specialists or rooms:', err);
    }
  }

  return (
    <SettingsForm
      initialData={{
        whatsappPhoneNumberId: org?.whatsapp_phone_number_id,
        hasWhatsappToken: Boolean(org?.whatsapp_access_token),
        hasWhatsappAppSecret: Boolean(org?.whatsapp_app_secret),
        systemPrompt: org?.system_prompt,
        structuredPromptData: (org as any)?.structured_prompt_data || null,
        initialKnowledgeGaps: knowledgeGaps,
        subscriptionStatus: org?.subscription_status,
        planType: org?.plan_type,
        orgName: org?.name,
        companyCode: (org as any)?.company_code || '',
        whatsappTemplates: (org as any)?.whatsapp_templates || [],
        metaAppId: process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || '1628755725455108',
        metaConfigId: process.env.META_CONFIG_ID || process.env.NEXT_PUBLIC_META_CONFIG_ID || '1897459618280453',
        initialOauthCode: searchParams?.code,
        initialOauthError: searchParams?.error || searchParams?.error_description,
        aiTokensUsed: Number(org?.ai_tokens_used || 0),
        aiTokensLimit: Number(org?.ai_tokens_limit || 0),
        maxUsers: Number(org?.max_users || 2),
        industryPreset: (org as any)?.industry_preset || 'services',
        hasGoogleCalendarToken: Boolean(org?.google_calendar_token),
        googleCalendarId: org?.google_calendar_id || '',
        googleCalendarSyncEnabled: Boolean(org?.google_calendar_sync_enabled),
        googleCalendarBlockBusy: Boolean(org?.google_calendar_block_busy),
        instagramAccountId: org?.instagram_account_id || '',
        hasInstagramToken: Boolean(org?.instagram_access_token),
        whatsappProvider: (org as any)?.whatsapp_provider || 'meta',
        evolutionApiUrl: (org as any)?.evolution_api_url || '',
        evolutionInstanceName: (org as any)?.evolution_instance_name || '',
        hasEvolutionApiKey: Boolean((org as any)?.evolution_api_key),
        evolutionStatus: (org as any)?.evolution_status || 'disconnected',
        evolutionPhoneConnected: (org as any)?.evolution_phone_connected || '',
        evolutionAntiBanMode: (org as any)?.evolution_anti_ban_mode ?? true,
        evolutionMaxOutboundPerHour: Number((org as any)?.evolution_max_outbound_per_hour || 20),
        specialistLabel: (org as any)?.specialist_label || 'Colaborador',
        roomLabel: (org as any)?.room_label || 'Espacio',
        enabledModules: (org as any)?.enabled_modules || {
          native_calendar: true,
          physical_rooms: false,
          staff_mobile_portal: false,
          quick_pay: false,
          anti_no_show: true,
        },
      }}
      teamData={teamData || undefined}
      specialistsData={specialists}
      roomsData={rooms}
      paymentAccountsData={paymentAccounts}
      isSuperAdmin={Boolean(current.profile.is_super_admin)}
    />
  );
}
