'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { encryptSecret } from '@/lib/security/encryption';
import { Database } from '@/lib/supabase/types';
import { revalidatePath } from 'next/cache';

interface UpdateSettingsInput {
  whatsappPhoneNumberId?: string;
  whatsappAccessToken?: string;
  calApiKey?: string;
  calEventTypeId?: string;
  systemPrompt?: string;
}

type OrgUpdate = Database['public']['Tables']['organizations']['Update'];

export async function updateOrganizationSettings(input: UpdateSettingsInput) {
  const supabase = createServerSupabaseClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('No autorizado');
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    throw new Error('Solo los administradores pueden modificar las credenciales de la organización.');
  }

  const orgId = profile.organization_id as string;

  const updatePayload: OrgUpdate = {
    updated_at: new Date().toISOString(),
  };

  if (input.whatsappPhoneNumberId !== undefined) {
    updatePayload.whatsapp_phone_number_id = input.whatsappPhoneNumberId.trim();
  }

  // Cifrar secreto de WhatsApp con AES-256-GCM antes de persistir
  if (input.whatsappAccessToken && input.whatsappAccessToken.trim() !== '') {
    updatePayload.whatsapp_access_token = encryptSecret(input.whatsappAccessToken.trim());
  }

  // Cifrar secreto de Cal.com con AES-256-GCM antes de persistir
  if (input.calApiKey && input.calApiKey.trim() !== '') {
    updatePayload.cal_api_key = encryptSecret(input.calApiKey.trim());
  }

  if (input.calEventTypeId !== undefined) {
    updatePayload.cal_event_type_id = input.calEventTypeId.trim();
  }

  if (input.systemPrompt !== undefined) {
    updatePayload.system_prompt = input.systemPrompt.trim();
  }

  const { error: updateError } = await supabaseAdmin
    .from('organizations')
    .update(updatePayload)
    .eq('id', orgId);

  if (updateError) {
    throw new Error(`Error actualizando ajustes: ${updateError.message}`);
  }

  revalidatePath('/settings');
  return { success: true };
}
