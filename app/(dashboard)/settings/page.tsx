import React from 'react';
import { getCurrentUserAndOrg } from '@/app/actions/auth';
import { getTeamInfo } from '@/app/actions/team';
import { SettingsForm } from '@/components/settings/SettingsForm';
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

  return (
    <SettingsForm
      initialData={{
        whatsappPhoneNumberId: org?.whatsapp_phone_number_id,
        hasWhatsappToken: Boolean(org?.whatsapp_access_token),
        hasWhatsappAppSecret: Boolean(org?.whatsapp_app_secret),
        calEventTypeId: org?.cal_event_type_id,
        calComEnabled: Boolean(org?.cal_com_enabled),
        systemPrompt: org?.system_prompt,
        subscriptionStatus: org?.subscription_status,
        planType: org?.plan_type,
        orgName: org?.name,
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
    />
  );
}
