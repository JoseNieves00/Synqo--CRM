'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { encryptSecret, decryptSecret } from '@/lib/security/encryption';
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
    updatePayload.whatsapp_phone_number_id = input.whatsappPhoneNumberId.trim().replace(/[^0-9]/g, '');
  }

  // Cifrar secreto de WhatsApp con AES-256-GCM antes de persistir (limpiando prefijo Bearer si fue copiado)
  if (input.whatsappAccessToken && input.whatsappAccessToken.trim() !== '') {
    const cleanToken = input.whatsappAccessToken.trim().replace(/^Bearer\s+/i, '');
    updatePayload.whatsapp_access_token = encryptSecret(cleanToken);
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

/**
 * Prueba en tiempo real la conexión con la API de WhatsApp Cloud de Meta.
 * Valida que el Phone Number ID exista y que el Access Token tenga permisos válidos.
 */
export async function testWhatsAppConnection(input: {
  phoneNumberId?: string;
  accessToken?: string;
}) {
  let phoneId = input.phoneNumberId?.trim();
  let token = input.accessToken?.trim();

  if (!phoneId || !token) {
    try {
      const supabase = createServerSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await (supabaseAdmin.from('profiles') as any)
          .select('organization_id')
          .eq('id', user.id)
          .single();

        if (profile) {
          const { data: org } = await (supabaseAdmin.from('organizations') as any)
            .select('whatsapp_phone_number_id, whatsapp_access_token')
            .eq('id', profile.organization_id)
            .single();

          phoneId = phoneId || org?.whatsapp_phone_number_id;
          if (!token && org?.whatsapp_access_token) {
            token = decryptSecret(org.whatsapp_access_token);
          }
        }
      }
    } catch {
      // Contexto de prueba o fuera de petición HTTP
    }
  }

  if (!phoneId || !token) {
    return {
      success: false,
      error: 'Debes ingresar tanto el Phone Number ID como el Access Token para probar la conexión.',
    };
  }

  const cleanPhoneId = phoneId.replace(/[^0-9]/g, '');
  const cleanToken = token.replace(/^Bearer\s+/i, '');

  try {
    const metaUrl = `https://graph.facebook.com/v20.0/${cleanPhoneId}?fields=verified_name,display_phone_number,code_verification_status,quality_rating`;
    const res = await fetch(metaUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cleanToken}`,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        error: data.error?.message || 'Meta Cloud API rechazó las credenciales ingresadas.',
      };
    }

    const name = data.verified_name || data.display_phone_number || phoneId;
    const quality = data.quality_rating || 'UNKNOWN';
    return {
      success: true,
      message: `¡Conexión Exitosa con Meta! Línea verificada: ${name} (Calidad: ${quality}).`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Error de red al conectar con Meta Graph API: ${err.message}`,
    };
  }
}

/**
 * Prueba en tiempo real la conexión con Cal.com (Migrado a API v2).
 * Valida que la API Key sea válida y enumera los tipos de evento disponibles.
 */
export async function testCalConnection(input: {
  apiKey?: string;
  eventTypeId?: string;
}) {
  let key = input.apiKey?.trim();

  if (!key) {
    try {
      const supabase = createServerSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await (supabaseAdmin.from('profiles') as any)
          .select('organization_id')
          .eq('id', user.id)
          .single();

        if (profile) {
          const { data: org } = await (supabaseAdmin.from('organizations') as any)
            .select('cal_api_key, cal_event_type_id')
            .eq('id', profile.organization_id)
            .single();

          if (org?.cal_api_key) {
            key = decryptSecret(org.cal_api_key);
          }
        }
      }
    } catch {
      // Contexto de prueba o fuera de petición HTTP
    }
  }

  if (!key) {
    return {
      success: false,
      error: 'Debes ingresar tu API Key de Cal.com para realizar la prueba.',
    };
  }

  const cleanKey = key.trim().replace(/^Bearer\s+/i, '');

  try {
    const res = await fetch('https://api.cal.com/v2/event-types', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cleanKey}`,
        'cal-api-version': '2026-06-12',
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || data?.status === 'error') {
      const errMsg =
        data?.error?.message ||
        data?.message ||
        (res.status === 401
          ? 'API Key de Cal.com inválida o no autorizada.'
          : `Error HTTP ${res.status} al consultar Cal.com`);
      return {
        success: false,
        error: errMsg,
      };
    }

    const eventTypes = Array.isArray(data?.data)
      ? data.data
      : (data?.event_types || []);
    const count = eventTypes.length;

    let targetEvent: any = null;
    const searchTarget = (input.eventTypeId || '').trim().toLowerCase();

    if (searchTarget) {
      targetEvent = eventTypes.find((et: any) =>
        String(et.id) === searchTarget ||
        String(et.slug).toLowerCase() === searchTarget ||
        searchTarget.includes(String(et.slug).toLowerCase()) ||
        String(et.title).toLowerCase() === searchTarget
      );
    } else if (count === 1) {
      targetEvent = eventTypes[0];
    }

    let summary = '';
    if (targetEvent) {
      summary = ` Evento verificado: "${targetEvent.title || targetEvent.slug}" (ID: ${targetEvent.id}).`;
    } else if (count > 0) {
      const list = eventTypes.map((et: any) => `"${et.title || et.slug}" [ID: ${et.id}]`).join(', ');
      summary = ` Se encontraron ${count} tipos de eventos: ${list}.`;
    }

    return {
      success: true,
      message: `¡Conexión Exitosa con Cal.com (API v2)!${summary}`,
      detectedEventId: targetEvent?.id || (count === 1 ? eventTypes[0]?.id : undefined),
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Error de red al consultar Cal.com: ${err.message}`,
    };
  }
}
