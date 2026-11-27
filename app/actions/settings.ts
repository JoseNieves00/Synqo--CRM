'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { encryptSecret, decryptSecret, hashPassword } from '@/lib/security/encryption';
import {
  normalizeAlertThresholds,
  normalizeManagerSecurity,
  normalizeTokenPolicy,
} from '@/lib/monitoring/token-policy';
import { Database } from '@/lib/supabase/types';
import { revalidatePath } from 'next/cache';
import { WhatsAppService } from '@/services/whatsapp.service';
import { GalleryPhotoItem, splitIntoConsecutiveMessages } from '@/lib/media/format';
import { OpenAIService } from '@/services/openai.service';
import { pushPromptVersion, splitGalleryTail } from '@/lib/ai/prompt-assistant/versions';
import { compileStructuredPrompt, resolveOrganizationSystemPrompt } from '@/lib/ai/prompt-compiler';
import {
  type FollowUpSettingsConfig,
  normalizeFollowUpSettings,
} from '@/lib/ai/follow-up-types';
import { resolveFollowUpHoldReason } from '@/lib/leads/followup-gates';
import {
  ShippingSettings,
  createDefaultShippingSettings,
  ShippingCityRate,
} from '@/lib/types/shipping';

interface UpdateSettingsInput {
  whatsappPhoneNumberId?: string;
  whatsappAccessToken?: string;
  whatsappAppSecret?: string;
  systemPrompt?: string;
  structuredPromptData?: any;
  industryPreset?: string;
  handoffMode?: string;
  afterHoursMessage?: string;
  businessHours?: any;
  mobileCoexistence?: {
    enabled: boolean;
    autoResumeHours: number;
  };
}

type OrgUpdate = Database['public']['Tables']['organizations']['Update'];

export async function updateOrganizationSettings(input: UpdateSettingsInput) {
  const supabase = createServerSupabaseClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('No autorizado');
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, role, is_super_admin')
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

  const { data: currentOrg } = await (supabaseAdmin.from('organizations') as any)
    .select('system_prompt, structured_prompt_data, appointment_settings')
    .eq('id', orgId)
    .maybeSingle();

  const existingStructured =
    currentOrg?.structured_prompt_data && typeof currentOrg.structured_prompt_data === 'object'
      ? currentOrg.structured_prompt_data
      : {};

  if (input.systemPrompt !== undefined) {
    updatePayload.system_prompt = input.systemPrompt.trim();
  }

  if (input.structuredPromptData !== undefined || input.systemPrompt !== undefined) {
    const incomingStructured =
      input.structuredPromptData && typeof input.structuredPromptData === 'object'
        ? input.structuredPromptData
        : {};

    let nextVersions = existingStructured.prompt_versions;
    if (input.systemPrompt !== undefined && currentOrg?.system_prompt) {
      const prevBody = splitGalleryTail(currentOrg.system_prompt).body.trim();
      const nextBody = splitGalleryTail(input.systemPrompt).body.trim();
      if (prevBody && prevBody !== nextBody) {
        nextVersions = pushPromptVersion(
          existingStructured.prompt_versions,
          currentOrg.system_prompt,
          'Guardado en Configuración'
        );
      }
    }

    // Merge atómico en servidor: nunca perder estado del asistente (solo lo escriben las acciones del Asistente), versiones ni galería
    updatePayload.structured_prompt_data = {
      ...existingStructured,
      ...incomingStructured,
      ...(existingStructured.assistant
        ? { assistant: existingStructured.assistant }
        : incomingStructured.assistant
        ? { assistant: incomingStructured.assistant }
        : {}),
      ...(nextVersions ? { prompt_versions: nextVersions } : {}),
    };
  }

  // Regla de Negocio Estricta: El cliente / inquilino no debe modificar su nicho de negocio.
  // Solo el Super Administrador tiene autorización para cambiar el nicho asignado a una organización.
  if (input.industryPreset !== undefined && profile.is_super_admin) {
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

  if (input.mobileCoexistence !== undefined) {
    const existingAppSettings =
      currentOrg?.appointment_settings && typeof currentOrg.appointment_settings === 'object'
        ? currentOrg.appointment_settings
        : {};
    const parsedHours = Number(input.mobileCoexistence.autoResumeHours ?? 2);
    updatePayload.appointment_settings = {
      ...existingAppSettings,
      mobile_coexistence: {
        enabled: Boolean(input.mobileCoexistence.enabled),
        autoResumeHours:
          Number.isFinite(parsedHours) && parsedHours >= 1 && parsedHours <= 24
            ? Math.round(parsedHours)
            : 2,
      },
    };
  }

  const { error: updateError } = await supabaseAdmin
    .from('organizations')
    .update(updatePayload)
    .eq('id', orgId);

  if (updateError) {
    throw new Error(`Error actualizando ajustes: ${updateError.message}`);
  }

  revalidatePath('/settings');
  revalidatePath('/inbox');
  return { success: true };
}

/**
 * Guarda o actualiza la galería visual de fotos de productos en la organización
 * de manera atómica e instantánea sin forzar recarga de página (zero flicker).
 */
export async function saveProductGallery(
  gallery: GalleryPhotoItem[],
  compiledPrompt: string
) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'supervisor' && !profile.is_super_admin)) {
    throw new Error('Permisos insuficientes: Solo administradores o supervisores pueden modificar la galería y el prompt.');
  }

  const orgId = profile?.organization_id;
  if (!orgId) throw new Error('Organización no encontrada para el usuario.');

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('structured_prompt_data')
    .eq('id', orgId)
    .single();

  const currentStructured = org?.structured_prompt_data || {};
  const updatedStructured = {
    ...currentStructured,
    gallery,
  };

  const { error: updateError } = await (supabaseAdmin.from('organizations') as any)
    .update({
      system_prompt: compiledPrompt.trim(),
      structured_prompt_data: updatedStructured,
    })
    .eq('id', orgId);

  if (updateError) {
    throw new Error(`Error guardando catálogo de fotos: ${updateError.message}`);
  }

  return { success: true };
}

/**
 * Guarda únicamente la galería de imágenes disponibles para la IA (sin sobreescribir el system_prompt).
 */
export async function saveAiImageGallery(gallery: GalleryPhotoItem[]) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'supervisor' && !profile.is_super_admin)) {
    throw new Error('Permisos insuficientes: Solo administradores o supervisores pueden modificar la galería.');
  }

  const orgId = profile?.organization_id;
  if (!orgId) throw new Error('Organización no encontrada para el usuario.');

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('structured_prompt_data')
    .eq('id', orgId)
    .single();

  const currentStructured = org?.structured_prompt_data || {};
  const { error: updateError } = await (supabaseAdmin.from('organizations') as any)
    .update({
      structured_prompt_data: {
        ...currentStructured,
        gallery,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId);

  if (updateError) {
    throw new Error(`Error guardando galería IA: ${updateError.message}`);
  }

  revalidatePath('/settings');
  revalidatePath('/inbox');
  return { success: true };
}

/**
 * Obtiene el catálogo visual de fotos de la organización para el selector rápido de asesores humanos.
 */
export async function getOrganizationCatalogGallery(): Promise<GalleryPhotoItem[]> {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: profile } = await (supabaseAdmin.from('profiles') as any)
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) return [];

    const { data: org } = await (supabaseAdmin.from('organizations') as any)
      .select('structured_prompt_data')
      .eq('id', profile.organization_id)
      .single();

    return (org?.structured_prompt_data?.gallery as GalleryPhotoItem[]) || [];
  } catch {
    return [];
  }
}

/**
 * Guarda la galería independiente de imágenes libres (por keywords) en structured_prompt_data.media_gallery.
 */
export async function saveAiMediaGallery(mediaGallery: GalleryPhotoItem[]) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'supervisor' && !profile.is_super_admin)) {
    throw new Error('Permisos insuficientes: Solo administradores o supervisores pueden modificar la galería.');
  }

  const orgId = profile?.organization_id;
  if (!orgId) throw new Error('Organización no encontrada para el usuario.');

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('structured_prompt_data')
    .eq('id', orgId)
    .single();

  const currentStructured = org?.structured_prompt_data || {};
  const { error: updateError } = await (supabaseAdmin.from('organizations') as any)
    .update({
      structured_prompt_data: {
        ...currentStructured,
        media_gallery: mediaGallery,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId);

  if (updateError) {
    throw new Error(`Error guardando galería de imágenes: ${updateError.message}`);
  }

  revalidatePath('/settings');
  revalidatePath('/inbox');
  return { success: true };
}

/**
 * Obtiene la galería independiente de imágenes libres (por keywords) de la organización.
 */
export async function getOrganizationMediaGallery(): Promise<GalleryPhotoItem[]> {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: profile } = await (supabaseAdmin.from('profiles') as any)
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) return [];

    const { data: org } = await (supabaseAdmin.from('organizations') as any)
      .select('structured_prompt_data')
      .eq('id', profile.organization_id)
      .single();

    return (org?.structured_prompt_data?.media_gallery as GalleryPhotoItem[]) || [];
  } catch (err) {
    console.warn('[GET CATALOG GALLERY ERROR]', err);
    return [];
  }
}

/**
 * Agrega o actualiza una plantilla de WhatsApp en la organización.
 */
export async function addCustomTemplate(input: { name: string; label?: string }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'supervisor' && !profile.is_super_admin)) {
    throw new Error('Permisos insuficientes: Solo administradores o supervisores pueden gestionar plantillas de WhatsApp.');
  }

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
    .select('organization_id, role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'supervisor' && !profile.is_super_admin)) {
    throw new Error('Permisos insuficientes: Solo administradores o supervisores pueden gestionar plantillas de WhatsApp.');
  }

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
    .select('organization_id, role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'supervisor' && !profile.is_super_admin)) {
    throw new Error('Permisos insuficientes: Solo administradores o supervisores pueden gestionar plantillas de WhatsApp.');
  }

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
  revalidatePath('/inbox');
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

import { CustomPaymentAccount } from '@/lib/types/payments';

/**
 * Obtiene las cuentas y métodos de pago configurados en la organización
 */
export async function getOrganizationPaymentAccounts(): Promise<CustomPaymentAccount[]> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) return [];

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('appointment_settings')
    .eq('id', profile.organization_id)
    .single();

  const settings = (org?.appointment_settings as any) || {};
  return (settings.payment_accounts || []) as CustomPaymentAccount[];
}

/**
 * Guarda o actualiza la lista de cuentas de pago 100% personalizables de la organización
 */
export async function saveOrganizationPaymentAccounts(
  accounts: CustomPaymentAccount[]
): Promise<{ success: boolean; error?: string; accounts?: CustomPaymentAccount[] }> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'No autorizado' };
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'supervisor' && !profile.is_super_admin)) {
    return { success: false, error: 'Solo administradores o supervisores pueden configurar cuentas de pago de la empresa.' };
  }

  const orgId = profile.organization_id;

  // Sanitizar cuentas
  const cleanAccounts: CustomPaymentAccount[] = (accounts || [])
    .filter((a) => a.title && a.accountNumber && a.holderName)
    .map((a, idx) => ({
      id: a.id || `acc-${Date.now()}-${idx}`,
      title: a.title.trim().slice(0, 80),
      accountNumber: a.accountNumber.trim().slice(0, 100),
      holderName: a.holderName.trim().slice(0, 120),
      holderId: a.holderId?.trim().slice(0, 50) || undefined,
      instructions: a.instructions?.trim().slice(0, 300) || undefined,
      paymentLink: a.paymentLink?.trim().slice(0, 250) || undefined,
      isActive: a.isActive ?? true,
    }));

  const { data: org, error: orgReadErr } = await (supabaseAdmin.from('organizations') as any)
    .select('appointment_settings, structured_prompt_data, system_prompt')
    .eq('id', orgId)
    .single();

  if (orgReadErr || !org) {
    return { success: false, error: 'Organización no encontrada.' };
  }

  const currentSettings = (org.appointment_settings as any) || {};
  const updatedSettings = {
    ...currentSettings,
    payment_accounts: cleanAccounts,
  };

  const updatePayload: Record<string, any> = {
    appointment_settings: updatedSettings,
    updated_at: new Date().toISOString(),
  };

  // Sincronizar cuentas de pago con el prompt y conocimiento de la IA
  const nequiAcc = cleanAccounts.find((a) => a.isActive && /nequi/i.test(a.title));
  const daviAcc = cleanAccounts.find((a) => a.isActive && /daviplata/i.test(a.title));
  const bancoAcc = cleanAccounts.find((a) => a.isActive && /bancolombia/i.test(a.title));
  const otherAccs = cleanAccounts
    .filter((a) => a.isActive && a !== nequiAcc && a !== daviAcc && a !== bancoAcc)
    .map((a) => `${a.title}: ${a.accountNumber} (${a.holderName})`)
    .join(' | ');

  const paymentAccountsFormatted = [
    nequiAcc ? `• Nequi: ${nequiAcc.accountNumber} (Titular: ${nequiAcc.holderName})` : '',
    daviAcc ? `• Daviplata: ${daviAcc.accountNumber} (Titular: ${daviAcc.holderName})` : '',
    bancoAcc ? `• Bancolombia: ${bancoAcc.accountNumber} (Titular: ${bancoAcc.holderName})` : '',
    ...cleanAccounts
      .filter((a) => a.isActive && a !== nequiAcc && a !== daviAcc && a !== bancoAcc)
      .map((a) => `• ${a.title}: ${a.accountNumber} (Titular: ${a.holderName})`),
  ].filter(Boolean).join('\n');

  const updatedStructured = org.structured_prompt_data as any;
  if (updatedStructured && typeof updatedStructured === 'object') {
    if (!updatedStructured.policies) updatedStructured.policies = {};

    updatedStructured.policies.paymentDetails = {
      nequi: nequiAcc ? `${nequiAcc.accountNumber} (${nequiAcc.holderName})` : '',
      daviplata: daviAcc ? `${daviAcc.accountNumber} (${daviAcc.holderName})` : '',
      bancolombia: bancoAcc ? `${bancoAcc.accountNumber} (${bancoAcc.holderName})` : '',
      other: otherAccs,
    };

    updatePayload.structured_prompt_data = updatedStructured;
  }

  // Si la organización ya tiene system_prompt personalizado, preservar el prompt original y solo inyectar/actualizar las cuentas
  if (org.system_prompt && paymentAccountsFormatted) {
    const paymentAccountsSection = `\n\n[CUENTAS DE TRANSFERENCIA BANCARIA AUTORIZADAS PARA EL CLIENTE:\n${paymentAccountsFormatted}\nINSTRUCCIÓN: Proporciona estos datos de cuenta inmediatamente y con total exactitud cuando el cliente pregunte por métodos de pago, transferencias o números de cuenta para pagar. Nunca alteres los números ni inventes titulares.]`;

    let updatedPrompt = org.system_prompt;
    if (updatedPrompt.includes('[CUENTAS DE TRANSFERENCIA BANCARIA AUTORIZADAS')) {
      updatedPrompt = updatedPrompt.replace(
        /\[CUENTAS DE TRANSFERENCIA BANCARIA AUTORIZADAS[\s\S]*?Nunca alteres los números ni inventes titulares\.\]/i,
        paymentAccountsSection.trim()
      );
    } else {
      updatedPrompt = updatedPrompt.trim() + paymentAccountsSection;
    }
    updatePayload.system_prompt = updatedPrompt;
  }

  const { error: updateErr } = await (supabaseAdmin.from('organizations') as any)
    .update(updatePayload)
    .eq('id', orgId);

  if (updateErr) {
    return { success: false, error: `Error guardando cuentas en base de datos: ${updateErr.message}` };
  }

  revalidatePath('/settings');
  revalidatePath('/inbox');
  return { success: true, accounts: cleanAccounts };
}

/**
 * Obtiene la configuración de envíos y tarifas por ciudad/municipio de la organización
 */
export async function getOrganizationShippingSettings(): Promise<ShippingSettings> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return createDefaultShippingSettings();

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) return createDefaultShippingSettings();

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('appointment_settings')
    .eq('id', profile.organization_id)
    .single();

  const settings = (org?.appointment_settings as any) || {};
  if (settings.shipping_settings && typeof settings.shipping_settings === 'object') {
    return {
      ...createDefaultShippingSettings(),
      ...settings.shipping_settings,
      cityRates: Array.isArray(settings.shipping_settings.cityRates) ? settings.shipping_settings.cityRates : [],
    };
  }
  return createDefaultShippingSettings();
}

/**
 * Guarda o actualiza las políticas y tarifas de envío por ciudad/municipio de la organización
 */
export async function saveOrganizationShippingSettings(
  settings: Partial<ShippingSettings>
): Promise<{ success: boolean; error?: string; settings?: ShippingSettings }> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autorizado' };

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'supervisor' && !profile.is_super_admin)) {
    return { success: false, error: 'Solo administradores o supervisores pueden configurar políticas de envío.' };
  }

  const orgId = profile.organization_id;

  const cleanCityRates: ShippingCityRate[] = Array.isArray(settings.cityRates)
    ? settings.cityRates
        .filter((c) => c && c.city && c.city.trim())
        .map((c, idx) => ({
          id: c.id || `city-${Date.now()}-${idx}`,
          city: c.city.trim().slice(0, 100),
          department: c.department?.trim().slice(0, 80) || undefined,
          cost: Math.max(0, Number(c.cost) || 0),
          isCashOnDelivery: Boolean(c.isCashOnDelivery),
          deliveryTime: c.deliveryTime?.trim().slice(0, 100) || undefined,
          notes: c.notes?.trim().slice(0, 200) || undefined,
        }))
    : [];

  const cleanSettings: ShippingSettings = {
    enabled: settings.enabled ?? true,
    baseRate: Math.max(0, Number(settings.baseRate) || 0),
    allowCashOnDelivery: Boolean(settings.allowCashOnDelivery),
    codFreeShipping: Boolean(settings.codFreeShipping),
    freeShippingMinAmount: settings.freeShippingMinAmount ? Math.max(0, Number(settings.freeShippingMinAmount)) : null,
    carrierNames: settings.carrierNames?.trim().slice(0, 160) || 'Coordinadora, Envía, Interrapidísimo',
    generalPolicy: settings.generalPolicy?.trim().slice(0, 500) || undefined,
    cityRates: cleanCityRates,
  };

  const { data: org, error: orgReadErr } = await (supabaseAdmin.from('organizations') as any)
    .select('appointment_settings')
    .eq('id', orgId)
    .single();

  if (orgReadErr || !org) {
    return { success: false, error: 'Organización no encontrada.' };
  }

  const currentSettings = (org.appointment_settings as any) || {};
  const updatedSettings = {
    ...currentSettings,
    shipping_settings: cleanSettings,
  };

  const { error: updateErr } = await (supabaseAdmin.from('organizations') as any)
    .update({
      appointment_settings: updatedSettings,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId);

  if (updateErr) {
    return { success: false, error: `Error guardando configuración de envíos: ${updateErr.message}` };
  }

  revalidatePath('/settings');
  revalidatePath('/inbox');
  return { success: true, settings: cleanSettings };
}

/**
 * Guarda o actualiza la modalidad de atención (Presencial / Virtual / Ambas),
 * dirección física de sede y enlace predeterminado de videollamada.
 * Configurable por cualquier tipo de negocio (productos, servicios o híbridos).
 */
export async function saveAttendanceModalitySettings(input: {
  modality: 'in_person' | 'virtual' | 'both';
  physicalAddress?: string | null;
  virtualMeetingUrl?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autorizado' };

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'supervisor' && !profile.is_super_admin)) {
    return { success: false, error: 'Solo administradores pueden configurar la modalidad de atención.' };
  }

  const orgId = profile.organization_id;
  const { data: org, error: orgErr } = await (supabaseAdmin.from('organizations') as any)
    .select('appointment_settings')
    .eq('id', orgId)
    .single();

  if (orgErr || !org) return { success: false, error: 'Organización no encontrada.' };

  const currentSettings = (org.appointment_settings as any) || {};
  const updatedSettings = {
    ...currentSettings,
    attendance_modality: input.modality,
    physical_address: input.physicalAddress ? input.physicalAddress.trim().slice(0, 200) : null,
    virtual_meeting_url: input.virtualMeetingUrl ? input.virtualMeetingUrl.trim().slice(0, 300) : null,
  };

  const { error: updateErr } = await (supabaseAdmin.from('organizations') as any)
    .update({
      appointment_settings: updatedSettings,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId);

  if (updateErr) {
    return { success: false, error: `Error guardando modalidad: ${updateErr.message}` };
  }

  revalidatePath('/settings');
  revalidatePath('/inbox');
  return { success: true };
}

/**
 * Simulador Sandbox del Bot: Permite a los administradores interactuar con el bot
 * de su empresa en tiempo real para validar el comportamiento del prompt
 * sin enviar mensajes reales a WhatsApp ni crear leads ficticios en la base de datos.
 */
export async function simulateBotMessage(params: {
  userMessage: string;
  history: Array<{ role: 'user' | 'assistant'; content: string; productCards?: any[] }>;
  temporaryPrompt?: string;
  targetOrganizationId?: string;
}): Promise<{
  reply: string;
  replyParts?: string[];
  latencyMs: number;
  model: string;
  provider: string;
  productCards?: Array<{ name: string; price?: string | number; caption: string; url: string }>;
  toolCalls?: Array<{ name: string; args: any; status: string }>;
  leadProfileUpdate?: any;
  handoffRequested?: any;
}> {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && !profile.is_super_admin)) {
    throw new Error('Solo administradores pueden usar el simulador de IA.');
  }

  const orgId = (profile.is_super_admin && params.targetOrganizationId)
    ? params.targetOrganizationId
    : profile.organization_id;
  const startTime = Date.now();

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name, structured_prompt_data, system_prompt, ai_provider, appointment_settings, business_hours, enabled_modules')
    .eq('id', orgId)
    .single();

  if (!org) throw new Error('Organización no encontrada');

  const activePrompt =
    params.temporaryPrompt ||
    resolveOrganizationSystemPrompt(org, 'Eres el asesor comercial inteligente de Synqo CRM.');

  const result = await OpenAIService.simulateSandboxMessage({
    systemPrompt: activePrompt,
    userMessage: params.userMessage,
    history: params.history,
    aiProvider: org.ai_provider,
    organizationId: orgId,
    organization: org,
    enableDryRunTools: true,
    enabledModules: org.enabled_modules,
  });

  const replyParts = splitIntoConsecutiveMessages(result.reply, 2);

  return {
    reply: result.reply,
    replyParts,
    latencyMs: result.latencyMs,
    model: result.modelUsed,
    provider: result.provider,
    productCards: result.dryRunTrace?.productCardsSent || [],
    toolCalls: result.dryRunTrace?.toolCallsExecuted || [],
    leadProfileUpdate: result.dryRunTrace?.leadProfileUpdate,
    handoffRequested: result.dryRunTrace?.handoffRequested,
  };
}

/**
 * T2: Guarda las secuencias automáticas de seguimiento por embudo dentro de `appointment_settings.follow_up_sequences`.
 */
export async function saveFollowUpSequences(
  config: FollowUpSettingsConfig
): Promise<{ success: boolean; config: FollowUpSettingsConfig }> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) throw new Error('Perfil no encontrado');
  if (profile.role !== 'admin' && profile.role !== 'supervisor' && !profile.is_super_admin) {
    throw new Error('Solo administradores o supervisores pueden configurar secuencias de seguimiento.');
  }

  const orgId = profile.organization_id;
  const cleanConfig = normalizeFollowUpSettings(config);

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('appointment_settings')
    .eq('id', orgId)
    .single();

  const existingDailyCap = Number((org?.appointment_settings as any)?.follow_up_sequences?.dailyCap);
  // El tope diario anti-spam lo controla Synqo/SuperAdmin para evitar bloqueos de WhatsApp
  if (!profile.is_super_admin) {
    cleanConfig.dailyCap =
      Number.isFinite(existingDailyCap) && existingDailyCap > 0 ? existingDailyCap : 40;
  }

  const updatedSettings = {
    ...((org?.appointment_settings as Record<string, any>) || {}),
    follow_up_sequences: cleanConfig,
  };

  const { error: updateErr } = await (supabaseAdmin.from('organizations') as any)
    .update({
      appointment_settings: updatedSettings,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId);

  if (updateErr) {
    throw new Error(`Error guardando secuencias de seguimiento: ${updateErr.message}`);
  }

  revalidatePath('/settings');
  revalidatePath('/inbox');
  return { success: true, config: cleanConfig };
}

/**
 * T2: Salud de Seguimientos de la organización — por qué cosas se están enviando y por
 * qué otras no (candados visibles en vez de `continue` silenciosos).
 */
export async function getFollowUpHealthAction(): Promise<{
  masterEnabled: boolean;
  hasConfiguredSequences: boolean;
  minLeadScore: number;
  dailyCap: number;
  sentToday: number;
  pendingReminders: number;
  heldReminders: number;
  pausedFollowUps: number;
}> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();
  if (!profile?.organization_id) throw new Error('Organización no encontrada');
  const orgId = profile.organization_id;

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('appointment_settings, whatsapp_provider')
    .eq('id', orgId)
    .single();

  const seqConfig = normalizeFollowUpSettings((org?.appointment_settings as any)?.follow_up_sequences);
  const hasConfiguredSequences = Object.values(seqConfig.sequences).some(
    (s) => s.enabled && s.steps.length > 0
  );

  const nowIso = new Date().toISOString();

  // Recordatorios programados pendientes (todos, no solo vencidos)
  const { count: pendingReminders } = await (supabaseAdmin.from('scheduled_reminders') as any)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('reminder_type', 'reactivation')
    .eq('status', 'pending');

  // Recordatorios pendientes que hoy NO se enviarían porque el chat espera respuesta humana
  // (unread sin responder, waiting_since o relevo activo) — aplicando los candados puros.
  const { data: heldCandidates } = await (supabaseAdmin.from('scheduled_reminders') as any)
    .select('id, contact_id')
    .eq('organization_id', orgId)
    .eq('reminder_type', 'reactivation')
    .eq('status', 'pending')
    .limit(500);

  let heldReminders = 0;
  if (heldCandidates && heldCandidates.length > 0) {
    const contactIds = Array.from(new Set(heldCandidates.map((r: any) => r.contact_id)));
    const { data: heldContacts } = await (supabaseAdmin.from('contacts') as any)
      .select('id, custom_fields, unread_count, waiting_since, conversation_status, pipeline_stage')
      .eq('organization_id', orgId)
      .in('id', contactIds)
      .is('deleted_at', null);
    const cMap = new Map<string, any>((heldContacts || []).map((c: any) => [c.id, c]));
    for (const rem of heldCandidates) {
      const contact = cMap.get(rem.contact_id);
      if (!contact) continue;
      const hold = resolveFollowUpHoldReason(contact);
      if (hold === 'waiting_for_advisor') heldReminders++;
    }
  }

  // Contactos con seguimiento pausado (p.ej. ventana Meta 24h sin plantilla)
  const { count: pausedFollowUps } = await (supabaseAdmin.from('contacts') as any)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .contains('custom_fields', { follow_up: { paused: true } });

  // Enviados hoy (follow-ups de IA marcados en los últimos 24h del mismo día local simplificado)
  const { count: sentToday } = await (supabaseAdmin.from('messages') as any)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('sender_type', 'ai')
    .or(
      `content.ilike.%[Seguimiento %,content.ilike.%[Reactivación Autónoma%,content.ilike.%[Campaña%`
    )
    .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString());

  return {
    masterEnabled: seqConfig.enabled,
    hasConfiguredSequences,
    minLeadScore: seqConfig.minLeadScore ?? 25,
    dailyCap: seqConfig.dailyCap || 40,
    sentToday: sentToday || 0,
    pendingReminders: pendingReminders || 0,
    heldReminders,
    pausedFollowUps: pausedFollowUps || 0,
  };
}

/**
 * T2: Genera borradores sugeridos de seguimiento desde el prompt de la empresa (1 llamada utilitaria).
 */
export async function suggestFollowUpSequences(hints?: {
  argumentsHint?: string;
  toneHint?: string;
  frequencyHint?: string;
}) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) throw new Error('Organización no encontrada');
  if (profile.role !== 'admin' && profile.role !== 'supervisor' && !profile.is_super_admin) {
    throw new Error('Permisos insuficientes.');
  }

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name, system_prompt, structured_prompt_data, ai_provider, enabled_modules')
    .eq('id', profile.organization_id)
    .single();

  if (!org) throw new Error('Organización no encontrada');

  const suggestions = await OpenAIService.generateFollowUpSuggestions(org, hints);
  return { success: true, suggestions };
}

/**
 * Guarda la política de alertas Push de tokens (x% configurables) y el PIN gerencial de 4 dígitos
 * para consultas seguras por WhatsApp (`#tokens`, `#admin`).
 */
export async function saveTokenAndManagerSettings(input: {
  alertThresholds: number[] | string;
  overagePricePer500kCop?: number | null;
  newPin?: string | null;
}) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) throw new Error('Organización no encontrada');
  if (profile.role !== 'admin' && !profile.is_super_admin) {
    throw new Error('Solo el administrador de la cuenta puede configurar alertas de tokens y PIN gerencial.');
  }

  const trimmedPin = (input.newPin || '').trim();
  if (trimmedPin && !/^\d{4}$/.test(trimmedPin)) {
    throw new Error('El PIN gerencial debe tener exactamente 4 dígitos numéricos.');
  }

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('id, appointment_settings')
    .eq('id', profile.organization_id)
    .single();

  if (!org) throw new Error('Organización no encontrada');

  const currentSettings =
    org.appointment_settings && typeof org.appointment_settings === 'object'
      ? { ...org.appointment_settings }
      : {};

  const prevPolicy = normalizeTokenPolicy(currentSettings.token_policy);
  const nextThresholds = normalizeAlertThresholds(input.alertThresholds);

  // Conservar marcas ya enviadas solo para los umbrales que sigan vigentes
  const keptAlertsSent: Record<string, string> = {};
  for (const t of nextThresholds) {
    if (prevPolicy.alertsSentInCycle[String(t)]) {
      keptAlertsSent[String(t)] = prevPolicy.alertsSentInCycle[String(t)];
    }
  }

  const priceNum = Number(input.overagePricePer500kCop);
  const nextPolicy = {
    ...prevPolicy,
    alertThresholds: nextThresholds,
    alertsSentInCycle: keptAlertsSent,
    // Solo Super Admin puede ajustar tarifas comerciales de excedente; el cliente solo configura alertas y PIN
    overagePricePer500kCop:
      profile.is_super_admin && input.overagePricePer500kCop !== undefined
        ? Number.isFinite(priceNum) && priceNum > 0
          ? Math.round(priceNum)
          : null
        : prevPolicy.overagePricePer500kCop,
    overageAllowed: true,
  };

  const prevSec = normalizeManagerSecurity(currentSettings.manager_security);
  const nextSec = trimmedPin
    ? {
        ...prevSec,
        pinHash: hashPassword(trimmedPin),
        sessions: {}, // Limpiar bloqueos/sesiones previas al rotar el PIN
      }
    : prevSec;

  const { error: updateErr } = await (supabaseAdmin.from('organizations') as any)
    .update({
      appointment_settings: {
        ...currentSettings,
        token_policy: nextPolicy,
        manager_security: nextSec,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', org.id);

  if (updateErr) {
    throw new Error(`Error guardando configuración de tokens: ${updateErr.message}`);
  }

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  revalidatePath('/', 'layout');

  return {
    success: true,
    alertThresholds: nextThresholds,
    hasManagerPin: Boolean(nextSec.pinHash),
  };
}




