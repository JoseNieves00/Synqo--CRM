'use server';

import crypto from 'node:crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { encryptSecret, decryptSecret } from '@/lib/security/encryption';
import { GoogleCalendarService } from '@/services/google-calendar.service';
import { revalidatePath } from 'next/cache';

async function requireAdminUser() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('No autorizado.');
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('id, organization_id, role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile || (!profile.is_super_admin && profile.role !== 'admin')) {
    throw new Error('Acceso restringido a administradores.');
  }

  return { user, profile, organizationId: profile.organization_id };
}

/**
 * Guarda la configuración de Google Calendar
 */
export async function saveGoogleCalendarSettings(input: {
  calendarId: string;
  accessToken?: string;
  syncEnabled: boolean;
  blockBusy: boolean;
}) {
  const { organizationId } = await requireAdminUser();

  const updatePayload: any = {
    google_calendar_id: input.calendarId.trim() || 'primary',
    google_calendar_sync_enabled: input.syncEnabled,
    google_calendar_block_busy: input.blockBusy,
    updated_at: new Date().toISOString(),
  };

  if (input.accessToken && input.accessToken.trim()) {
    updatePayload.google_calendar_token = encryptSecret(input.accessToken.trim());
  }

  const { error } = await (supabaseAdmin.from('organizations') as any)
    .update(updatePayload)
    .eq('id', organizationId);

  if (error) {
    throw new Error(`Error al guardar configuración de Google Calendar: ${error.message}`);
  }

  revalidatePath('/settings');
  return { success: true };
}

/**
 * Desconecta Google Calendar
 */
export async function disconnectGoogleCalendar() {
  const { organizationId } = await requireAdminUser();

  const { error } = await (supabaseAdmin.from('organizations') as any)
    .update({
      google_calendar_token: null,
      google_calendar_id: null,
      google_calendar_sync_enabled: false,
      google_calendar_block_busy: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', organizationId);

  if (error) {
    throw new Error(`Error al desconectar Google Calendar: ${error.message}`);
  }

  revalidatePath('/settings');
  return { success: true };
}

/**
 * Genera la URL oficial de Google OAuth 2.0 para vincular con 1 clic Google Calendar & Meet
 */
export async function getGoogleOAuthUrl() {
  const { organizationId, user } = await requireAdminUser();

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    return {
      success: false,
      configured: false,
      error: 'GOOGLE_CLIENT_ID no está configurado en las variables de entorno del servidor. Configúralo en .env.local para habilitar la vinculación automática en 1 clic.',
    };
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const redirectUri = `${appUrl}/api/auth/google/callback`;

  // Crear estado HMAC firmado para vincular de forma segura a la organización
  const statePayload = {
    orgId: organizationId,
    userId: user.id,
    timestamp: Date.now(),
  };
  const stateStr = Buffer.from(JSON.stringify(statePayload)).toString('base64url');
  const encKey = process.env.ENCRYPTION_KEY;
  if (!encKey) {
    throw new Error('ENCRYPTION_KEY obligatoria no configurada en el servidor.');
  }
  const signature = crypto
    .createHmac('sha256', encKey)
    .update(stateStr)
    .digest('hex');

  const state = `${stateStr}.${signature}`;

  const scopes = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly',
    'openid',
    'email',
    'profile',
  ].join(' ');

  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline',
      prompt: 'consent',
      state,
    }).toString();

  return {
    success: true,
    configured: true,
    url: authUrl,
  };
}

/**
 * Prueba la conexión con Google Calendar API
 */
export async function testGoogleCalendarConnection(calendarId: string, accessToken?: string) {
  const { organizationId } = await requireAdminUser();

  let tokenToUse = accessToken?.trim();
  if (!tokenToUse) {
    tokenToUse = (await GoogleCalendarService.getValidAccessToken(organizationId)) || undefined;
  }

  if (!tokenToUse) {
    return { success: false, error: 'No hay token o credencial de acceso para probar.' };
  }

  try {
    const cId = encodeURIComponent(calendarId.trim() || 'primary');
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${cId}`, {
      headers: {
        Authorization: `Bearer ${tokenToUse}`,
      },
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        success: false,
        error: `Google API Error (${res.status}): ${errBody?.error?.message || res.statusText}`,
      };
    }

    const data = await res.json();
    return {
      success: true,
      message: `¡Conexión exitosa con Google Calendar! Calendario verificado: "${data.summary || data.id}"`,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error de red conectando a Google' };
  }
}

/**
 * Guarda la configuración de Instagram Direct
 */
export async function saveInstagramSettings(input: {
  instagramAccountId: string;
  accessToken?: string;
  appSecret?: string;
}) {
  const { organizationId } = await requireAdminUser();

  const updatePayload: any = {
    instagram_account_id: input.instagramAccountId.trim(),
    updated_at: new Date().toISOString(),
  };

  if (input.accessToken && input.accessToken.trim()) {
    updatePayload.instagram_access_token = encryptSecret(input.accessToken.trim());
  }

  if (input.appSecret && input.appSecret.trim()) {
    updatePayload.instagram_app_secret = encryptSecret(input.appSecret.trim());
  }

  const { error } = await (supabaseAdmin.from('organizations') as any)
    .update(updatePayload)
    .eq('id', organizationId);

  if (error) {
    throw new Error(`Error al guardar configuración de Instagram: ${error.message}`);
  }

  revalidatePath('/settings');
  return { success: true };
}

/**
 * Desconecta Instagram Direct
 */
export async function disconnectInstagram() {
  const { organizationId } = await requireAdminUser();

  const { error } = await (supabaseAdmin.from('organizations') as any)
    .update({
      instagram_account_id: null,
      instagram_access_token: null,
      instagram_app_secret: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', organizationId);

  if (error) {
    throw new Error(`Error al desconectar Instagram: ${error.message}`);
  }

  revalidatePath('/settings');
  return { success: true };
}

/**
 * Prueba la conexión con Instagram Graph API
 */
export async function testInstagramConnection(accountId: string, accessToken?: string) {
  const { organizationId } = await requireAdminUser();

  let tokenToUse = accessToken?.trim();
  if (!tokenToUse) {
    const { data: org } = await (supabaseAdmin.from('organizations') as any)
      .select('instagram_access_token')
      .eq('id', organizationId)
      .single();

    if (org?.instagram_access_token) {
      tokenToUse = decryptSecret(org.instagram_access_token);
    }
  }

  if (!tokenToUse) {
    return { success: false, error: 'No hay token de acceso para probar.' };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${accountId.trim()}?fields=name,username`, {
      headers: {
        Authorization: `Bearer ${tokenToUse}`,
      },
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        success: false,
        error: `Meta Graph API Error (${res.status}): ${errBody?.error?.message || res.statusText}`,
      };
    }

    const data = await res.json();
    return {
      success: true,
      message: `¡Conexión exitosa con Instagram Direct! Cuenta verificada: @${data.username || data.name || accountId}`,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error de red conectando con Meta' };
  }
}

