'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import {
  checkAccountLockout,
  recordFailedLogin,
  recordSuccessfulLogin,
  COOKIE_SESSION_CREATED_AT,
  COOKIE_SESSION_LAST_ACTIVE,
} from '@/lib/security/auth-protection';

/**
 * Iniciar sesión con Email y Contraseña.
 * Incluye sanitización de entrada, validación estricta, bloqueo por intentos fallidos
 * y gestión de ciclo de vida de la sesión (expiración e inactividad).
 */
export async function signIn(formData: FormData) {
  const rawEmail = formData.get('email');
  const rawPassword = formData.get('password');

  if (typeof rawEmail !== 'string' || typeof rawPassword !== 'string') {
    return { error: 'Entrada inválida. Por favor ingresa tu correo y contraseña.' };
  }

  const email = rawEmail.toLowerCase().trim();
  const password = rawPassword;

  // Validación de formato de correo RFC 5322 simplificado
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!email || !emailRegex.test(email) || email.length > 100) {
    return { error: 'Por favor ingresa un correo electrónico válido.' };
  }

  if (!password || password.length < 6 || password.length > 128) {
    return { error: 'La contraseña debe contener al menos 6 caracteres.' };
  }

  // 1. Verificación de Bloqueo por Intentos Fallidos Excedidos (5 intentos = 15 min bloqueo)
  const lockout = await checkAccountLockout(email);
  if (lockout.locked) {
    return {
      error: `🚨 Tu cuenta ha sido bloqueada temporalmente por seguridad tras 5 intentos fallidos. Intenta nuevamente en ${lockout.minutesRemaining || 15} minutos o solicita el restablecimiento a tu administrador.`,
    };
  }

  // 2. Protección Anti-Fuerza Bruta inmediata (máx 5 peticiones por minuto por IP/email)
  const rateLimitKey = `login_${email}`;
  const rateCheck = await checkRateLimit(rateLimitKey, 5);
  if (!rateCheck.success) {
    return {
      error: 'Demasiados intentos de inicio de sesión. Por seguridad de tu cuenta, espera 1 minuto antes de volver a intentar.',
    };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Registrar intento fallido y calcular advertencia o bloqueo
    const failedStatus = await recordFailedLogin(email);
    if (failedStatus.locked) {
      return {
        error:
          '🚨 Has alcanzado el límite de 5 intentos fallidos de contraseña. Por seguridad, la cuenta ha sido bloqueada temporalmente por 15 minutos.',
      };
    }

    return {
      error: `Contraseña o correo incorrectos. Te quedan ${failedStatus.remainingAttempts} ${
        failedStatus.remainingAttempts === 1 ? 'intento' : 'intentos'
      } antes del bloqueo temporal de seguridad.`,
    };
  }

  // 3. Inicio de sesión exitoso: reiniciar contador de fallos y registrar ciclo de vida de sesión
  await recordSuccessfulLogin(email);

  const cookieStore = cookies();
  const nowStr = Date.now().toString();

  // Registrar fecha de creación de la sesión y última actividad
  cookieStore.set(COOKIE_SESSION_CREATED_AT, nowStr, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 3600, // Duración máxima absoluta: 24 horas
  });

  cookieStore.set(COOKIE_SESSION_LAST_ACTIVE, nowStr, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 3600,
  });

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

/**
 * Cerrar sesión y limpiar cookies de sesión y seguridad
 */
export async function signOut() {
  const supabase = createServerSupabaseClient();
  await supabase.auth.signOut();

  try {
    const cookieStore = cookies();
    cookieStore.delete(COOKIE_SESSION_CREATED_AT);
    cookieStore.delete(COOKIE_SESSION_LAST_ACTIVE);
  } catch {}

  revalidatePath('/', 'layout');
  redirect('/login');
}

/**
 * Obtener usuario autenticado, perfil y datos de la organización.
 * Usa supabaseAdmin para leer el perfil del usuario verificado de forma segura y sin recursión RLS.
 */
export async function getCurrentUserAndOrg() {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) return null;

    // Leer perfil con supabaseAdmin usando el UID validado por Supabase Auth
    const { data: profile, error: profileError } = await (supabaseAdmin.from('profiles') as any)
      .select('id, email, full_name, role, organization_id, is_super_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.warn('[AUTH WARN] Perfil no encontrado para UID:', user.id);
      return null;
    }

    const isSuperAdmin = Boolean(
      profile.is_super_admin ||
      (profile.email && process.env.SUPER_ADMIN_EMAIL && profile.email.toLowerCase() === process.env.SUPER_ADMIN_EMAIL.toLowerCase()) ||
      profile.email === 'admin@synqo.dev'
    );

    // Leer organización con supabaseAdmin (con fallback si falta alguna columna opcional)
    let { data: org, error: orgError } = await (supabaseAdmin.from('organizations') as any)
      .select(
        'id, name, subscription_status, plan_type, max_users, is_active, cal_com_enabled, whatsapp_phone_number_id, whatsapp_access_token, whatsapp_app_secret, cal_event_type_id, system_prompt, whatsapp_templates, ai_tokens_used, ai_tokens_limit'
      )
      .eq('id', profile.organization_id)
      .single();

    if (orgError && (orgError.message?.includes('whatsapp_templates') || orgError.message?.includes('cal_com_enabled') || orgError.message?.includes('ai_tokens'))) {
      const retry = await (supabaseAdmin.from('organizations') as any)
        .select(
          'id, name, subscription_status, plan_type, max_users, is_active, whatsapp_phone_number_id, whatsapp_access_token, whatsapp_app_secret, cal_event_type_id, system_prompt, ai_tokens_used, ai_tokens_limit'
        )
        .eq('id', profile.organization_id)
        .single();
      org = retry.data;
      orgError = retry.error;
    }

    if (orgError || !org) {
      console.warn('[AUTH WARN] Organización no encontrada para ID:', profile.organization_id);
      return null;
    }

    return {
      user,
      profile: {
        ...profile,
        is_super_admin: isSuperAdmin,
      },
      organization: org,
      mustChangePassword: Boolean(user?.user_metadata?.must_change_password),
    };
  } catch (err: any) {
    // Si Next.js necesita señalar Dynamic Server Usage, relanzar la excepción
    if (err?.digest === 'DYNAMIC_SERVER_USAGE' || err?.message?.includes('Dynamic server usage')) {
      throw err;
    }
    console.error('[AUTH EXCEPTION in getCurrentUserAndOrg]', err);
    return null;
  }
}
