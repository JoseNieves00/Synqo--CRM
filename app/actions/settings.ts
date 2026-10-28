'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { encryptSecret, decryptSecret } from '@/lib/security/encryption';
import { Database } from '@/lib/supabase/types';
import { revalidatePath } from 'next/cache';
import { WhatsAppService } from '@/services/whatsapp.service';

interface UpdateSettingsInput {
  whatsappPhoneNumberId?: string;
  whatsappAccessToken?: string;
  whatsappAppSecret?: string;
  calApiKey?: string;
  calEventTypeId?: string;
  systemPrompt?: string;
  structuredPromptData?: any;
  industryPreset?: string;
  handoffMode?: string;
  afterHoursMessage?: string;
  businessHours?: any;
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

  // Cifrar Meta App Secret con AES-256-GCM para verificación HMAC multi-tenant
  if (input.whatsappAppSecret !== undefined) {
    if (input.whatsappAppSecret.trim() !== '') {
      updatePayload.whatsapp_app_secret = encryptSecret(input.whatsappAppSecret.trim());
    } else {
      updatePayload.whatsapp_app_secret = null;
    }
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

  if (input.structuredPromptData !== undefined) {
    updatePayload.structured_prompt_data = input.structuredPromptData;
  }

  if (input.industryPreset !== undefined) {
    updatePayload.industry_preset = input.industryPreset as any;
  }

  if (input.handoffMode !== undefined) {
    updatePayload.handoff_mode = input.handoffMode as any;
  }

  if (input.afterHoursMessage !== undefined) {
    updatePayload.after_hours_message = input.afterHoursMessage ? input.afterHoursMessage.trim() : null;
  }

  if (input.businessHours !== undefined) {
    updatePayload.business_hours = input.businessHours;
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
 * Agrega o actualiza una plantilla de WhatsApp en la organización.
 */
export async function addCustomTemplate(input: { name: string; label?: string }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) throw new Error('Organización no encontrada');

  const cleanName = input.name.trim().toLowerCase().replace(/\s+/g, '_');
  if (!cleanName) throw new Error('El nombre de la plantilla en Meta es obligatorio.');

  const label = input.label?.trim() || cleanName;

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('whatsapp_templates')
    .eq('id', profile.organization_id)
    .single();

  let currentTemplates: Array<{ name: string; label: string }> = Array.isArray(org?.whatsapp_templates)
    ? org.whatsapp_templates
    : [];

  const existingIdx = currentTemplates.findIndex((t) => t.name === cleanName);
  let updatedTemplates: Array<{ name: string; label: string }>;
  if (existingIdx >= 0) {
    updatedTemplates = currentTemplates.map((t, idx) => (idx === existingIdx ? { name: cleanName, label } : t));
  } else {
    updatedTemplates = [...currentTemplates, { name: cleanName, label }];
  }

  const { error: updateError } = await (supabaseAdmin.from('organizations') as any)
    .update({
      whatsapp_templates: updatedTemplates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profile.organization_id);

  if (updateError) {
    if (updateError.message?.includes('whatsapp_templates')) {
      throw new Error(
        'Falta ejecutar la migración SQL en Supabase: ALTER TABLE organizations ADD COLUMN IF NOT EXISTS whatsapp_templates JSONB DEFAULT \'[]\'::jsonb;'
      );
    }
    throw new Error(`Error al guardar plantilla: ${updateError.message}`);
  }

  revalidatePath('/settings');
  revalidatePath('/inbox');
  return { success: true, templates: updatedTemplates };
}

/**
 * Actualiza el nombre o la etiqueta de una plantilla de WhatsApp existente en la organización.
 * Requiere confirmación de contraseña del usuario por seguridad.
 */
export async function updateCustomTemplate(input: {
  oldName: string;
  newName: string;
  label?: string;
  password?: string;
}) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user || !user.email) throw new Error('No autorizado');

  if (!input.password || input.password.trim().length === 0) {
    throw new Error('Debes ingresar tu contraseña para confirmar la modificación.');
  }

  // Validar contraseña contra Supabase Auth
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: input.password.trim(),
  });

  if (signInError) {
    throw new Error('Contraseña incorrecta. La modificación ha sido cancelada por seguridad.');
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) throw new Error('Organización no encontrada');

  const cleanNewName = input.newName.trim().toLowerCase().replace(/\s+/g, '_');
  if (!cleanNewName) throw new Error('El nombre de la plantilla en Meta es obligatorio.');

  const label = input.label?.trim() || cleanNewName;

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('whatsapp_templates')
    .eq('id', profile.organization_id)
    .single();

  let currentTemplates: Array<{ name: string; label: string }> = Array.isArray(org?.whatsapp_templates)
    ? org.whatsapp_templates
    : [];

  const existingIdx = currentTemplates.findIndex((t) => t.name === input.oldName);
  if (existingIdx >= 0) {
    currentTemplates[existingIdx] = { name: cleanNewName, label };
  } else {
    currentTemplates.push({ name: cleanNewName, label });
  }

  const { error: updateError } = await (supabaseAdmin.from('organizations') as any)
    .update({
      whatsapp_templates: currentTemplates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profile.organization_id);

  if (updateError) {
    if (updateError.message?.includes('whatsapp_templates')) {
      throw new Error(
        'Falta ejecutar la migración SQL en Supabase: ALTER TABLE organizations ADD COLUMN IF NOT EXISTS whatsapp_templates JSONB DEFAULT \'[]\'::jsonb;'
      );
    }
    throw new Error(`Error al actualizar plantilla: ${updateError.message}`);
  }

  revalidatePath('/settings');
  revalidatePath('/inbox');
  return { success: true, templates: currentTemplates };
}

/**
 * Elimina una plantilla de WhatsApp de la organización.
 * Requiere confirmación de contraseña del usuario por seguridad.
 */
export async function deleteCustomTemplate(input: string | { templateName: string; password?: string }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user || !user.email) throw new Error('No autorizado');

  const templateName = typeof input === 'string' ? input : input.templateName;
  const password = typeof input === 'object' ? input.password : undefined;

  if (!password || password.trim().length === 0) {
    throw new Error('Debes ingresar tu contraseña para confirmar la eliminación.');
  }

  // Validar contraseña contra Supabase Auth
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: password.trim(),
  });

  if (signInError) {
    throw new Error('Contraseña incorrecta. La eliminación ha sido cancelada por seguridad.');
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) throw new Error('Organización no encontrada');

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('whatsapp_templates')
    .eq('id', profile.organization_id)
    .single();

  let currentTemplates: Array<{ name: string; label: string }> = Array.isArray(org?.whatsapp_templates)
    ? org.whatsapp_templates
    : [];

  const updatedTemplates = currentTemplates.filter((t) => t.name !== templateName);

  const { error: updateError } = await (supabaseAdmin.from('organizations') as any)
    .update({
      whatsapp_templates: updatedTemplates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profile.organization_id);

  if (updateError) {
    if (updateError.message?.includes('whatsapp_templates')) {
      throw new Error(
        'Falta ejecutar la migración SQL en Supabase: ALTER TABLE organizations ADD COLUMN IF NOT EXISTS whatsapp_templates JSONB DEFAULT \'[]\'::jsonb;'
      );
    }
    throw new Error(`Error al eliminar plantilla: ${updateError.message}`);
  }

  revalidatePath('/settings');
  revalidatePath('/inbox');
  return { success: true, templates: updatedTemplates };
}

/**
 * Procesa el código de Embedded Signup directamente desde un Server Action.
 */
export async function processEmbeddedSignup(input: {
  code: string;
  phoneNumberId?: string;
  wabaId?: string;
}) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('No autorizado');
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && !profile.is_super_admin)) {
    throw new Error('Solo los administradores pueden vincular credenciales de WhatsApp.');
  }

  const orgId = profile.organization_id;
  const { code, phoneNumberId: passedPhoneId, wabaId: passedWabaId } = input;

  if (!code) {
    throw new Error('El código de autorización de Meta es obligatorio.');
  }

  // 1. Intercambiar código por Access Token
  const tokenResult = await WhatsAppService.exchangeCodeForToken(code);
  let accessToken = tokenResult.accessToken;

  // 2. Intentar obtener token de larga duración
  accessToken = await WhatsAppService.getLongLivedToken(accessToken);

  // 3. Obtener o inferir WABA ID
  let wabaId = passedWabaId;
  if (!wabaId) {
    const debugInfo = await WhatsAppService.debugToken(accessToken);
    if (debugInfo.wabaIds && debugInfo.wabaIds.length > 0) {
      wabaId = debugInfo.wabaIds[0];
    }
  }

  // 4. Suscribir WABA a webhooks
  let subscribed = false;
  if (wabaId) {
    subscribed = await WhatsAppService.subscribeWabaApp(wabaId, accessToken);
  }

  // 5. Determinar Phone Number ID
  let phoneNumberId = passedPhoneId;
  let phoneDetails: any = null;

  if (!phoneNumberId && wabaId) {
    const numbers = await WhatsAppService.getWabaPhoneNumbers(wabaId, accessToken);
    if (numbers.length > 0) {
      phoneNumberId = numbers[0].id;
      phoneDetails = numbers[0];
    }
  } else if (phoneNumberId) {
    phoneDetails = await WhatsAppService.getPhoneNumberDetails(phoneNumberId, accessToken);
  }

  if (!phoneNumberId) {
    throw new Error(
      'No se detectó ningún número de WhatsApp Business configurado en la cuenta de Meta. Completa el registro del número en Meta y vuelve a intentarlo.'
    );
  }

  const encryptedToken = encryptSecret(accessToken);
  const serverAppSecret = process.env.META_APP_SECRET;
  const encryptedAppSecret = serverAppSecret ? encryptSecret(serverAppSecret) : null;

  const updatePayload: OrgUpdate = {
    whatsapp_phone_number_id: phoneNumberId.trim().replace(/[^0-9]/g, ''),
    whatsapp_access_token: encryptedToken,
    updated_at: new Date().toISOString(),
  };

  if (encryptedAppSecret) {
    updatePayload.whatsapp_app_secret = encryptedAppSecret;
  }

  const { error: updateError } = await (supabaseAdmin.from('organizations') as any)
    .update(updatePayload)
    .eq('id', orgId);

  if (updateError) {
    throw new Error(`Error guardando credenciales: ${updateError.message}`);
  }

  revalidatePath('/settings');

  return {
    success: true,
    phoneNumberId,
    displayPhoneNumber: phoneDetails?.display_phone_number || null,
    verifiedName: phoneDetails?.verified_name || null,
    wabaId: wabaId || null,
    webhooksSubscribed: subscribed,
  };
}

/**
 * Desconecta WhatsApp Business de la organización actual eliminando sus credenciales de Meta.
 */
export async function disconnectWhatsApp() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('No autorizado');
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && !profile.is_super_admin)) {
    throw new Error('Solo los administradores pueden desconectar WhatsApp.');
  }

  const orgId = profile.organization_id;

  const { error } = await supabaseAdmin
    .from('organizations')
    .update({
      whatsapp_phone_number_id: null,
      whatsapp_access_token: null,
      whatsapp_app_secret: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId);

  if (error) {
    throw new Error(`Error desconectando WhatsApp: ${error.message}`);
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
  appSecret?: string;
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

    let secretNote = '';
    if (input.appSecret && input.appSecret.trim()) {
      const s = input.appSecret.trim();
      secretNote = s.length === 32 
        ? ' • App Secret verificado (formato HMAC 32 caracteres OK).'
        : ' • Nota: El App Secret suele tener 32 caracteres en Meta.';
    }

    return {
      success: true,
      message: `¡Conexión Exitosa con Meta! Línea verificada: ${name} (Calidad: ${quality})${secretNote}`,
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
