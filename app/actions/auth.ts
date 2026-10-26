'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

/**
 * Iniciar sesión con Email y Contraseña.
 * Solo usuarios previamente aprovisionados por el Super Administrador pueden acceder.
 */
export async function signIn(formData: FormData) {
  const email = (formData.get('email') as string)?.trim();
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Por favor ingresa tu correo y contraseña.' };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: 'Correo o contraseña incorrectos. Verifica tus credenciales.' };
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

/**
 * Cerrar sesión y redirigir al login
 */
export async function signOut() {
  const supabase = createServerSupabaseClient();
  await supabase.auth.signOut();
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
        'id, name, subscription_status, plan_type, max_users, is_active, cal_com_enabled, whatsapp_phone_number_id, whatsapp_access_token, whatsapp_app_secret, cal_event_type_id, system_prompt, whatsapp_templates'
      )
      .eq('id', profile.organization_id)
      .single();

    if (orgError && (orgError.message?.includes('whatsapp_templates') || orgError.message?.includes('cal_com_enabled'))) {
      const retry = await (supabaseAdmin.from('organizations') as any)
        .select(
          'id, name, subscription_status, plan_type, max_users, is_active, whatsapp_phone_number_id, whatsapp_access_token, whatsapp_app_secret, cal_event_type_id, system_prompt'
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
