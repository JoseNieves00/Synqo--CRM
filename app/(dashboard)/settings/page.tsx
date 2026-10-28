import React from 'react';
import { getCurrentUserAndOrg } from '@/app/actions/auth';
import { getTeamInfo } from '@/app/actions/team';
import { getPendingKnowledgeGaps } from '@/app/actions/knowledge-gaps';
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

  // Cargar información de equipo y usuarios
  let teamData = null;
  try {
    teamData = await getTeamInfo();
  } catch (err) {
    console.warn('[SETTINGS] Could not load team info:', err);
  }

  // Cargar preguntas no respondidas (Knowledge Gaps)
  let knowledgeGaps: any[] = [];
  try {
    knowledgeGaps = await getPendingKnowledgeGaps();
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
        calEventTypeId: org?.cal_event_type_id,
        calComEnabled: Boolean(org?.cal_com_enabled),
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
      }}
      teamData={teamData || undefined}
      specialistsData={specialists}
      roomsData={rooms}
    />
  );
}
