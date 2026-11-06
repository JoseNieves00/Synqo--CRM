'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { HandoffService } from '@/services/handoff.service';
import { MessagingService } from '@/services/messaging.service';

const UpdateProfileSchema = z.object({
  fullName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres.').optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres.').optional(),
  whatsappPhone: z.string().optional().nullable(),
  whatsappAlertsEnabled: z.boolean().optional(),
  whatsappAlerts247: z.boolean().optional(),
});

/**
 * Obtener perfil completo del usuario autenticado (incluyendo preferencias de WhatsApp).
 */
export async function getUserProfileDetails() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('id, full_name, email, role, whatsapp_phone, whatsapp_alerts_enabled, whatsapp_alerts_24_7, organization_id')
    .eq('id', user.id)
    .single();

  return { success: true, profile };
}

/**
 * Enviar alerta de prueba al WhatsApp personal del usuario.
 */
export async function sendTestWhatsAppAlert(targetPhone?: string) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'No autorizado' };
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('id, full_name, organization_id, whatsapp_phone')
    .eq('id', user.id)
    .single();

  const phoneToSend = targetPhone || profile?.whatsapp_phone;
  if (!phoneToSend) {
    return { success: false, error: 'Ingresa primero un número de teléfono de WhatsApp.' };
  }

  const cleanPhone = HandoffService.cleanE164Phone(phoneToSend);
  if (!cleanPhone || cleanPhone.length < 9) {
    return { success: false, error: 'Número de WhatsApp inválido. Escribe un número móvil válido.' };
  }

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, evolution_api_url, evolution_api_key, evolution_instance_name, evolution_anti_ban_mode')
    .eq('id', profile.organization_id)
    .single();

  if (!org) {
    return { success: false, error: 'Organización no encontrada.' };
  }

  try {
    const testBody = `🔔 *Prueba de Alerta de Relevo*\n\nHola ${profile?.full_name || 'Asesor'}, tu WhatsApp personal ha sido vinculado exitosamente a ${org.name || 'tu empresa'}.\n\nCuando un prospecto calificado requiera tu atención o la IA transfiera un chat, recibirás aquí el enlace directo y los detalles del cliente para que no pierdas ninguna venta. 🚀`;

    await MessagingService.sendTextMessage({
      organization: org,
      to: cleanPhone,
      body: testBody,
      simulateTyping: false,
    });

    return { success: true, message: `Mensaje de prueba enviado exitosamente a +${cleanPhone}` };
  } catch (err: any) {
    return { success: false, error: `Error despachando prueba: ${err.message || 'Error de conexión con WhatsApp'}` };
  }
}

/**
 * Actualizar nombre de usuario, preferencias de WhatsApp y/o cambiar contraseña propia.
 * Cuando un usuario actualiza su contraseña por primera vez, limpia el flag `must_change_password`.
 */
export async function updateUserProfile(input: {
  fullName?: string;
  currentPassword?: string;
  newPassword?: string;
  whatsappPhone?: string | null;
  whatsappAlertsEnabled?: boolean;
  whatsappAlerts247?: boolean;
}) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'No autorizado: Inicia sesión para continuar.' };
  }

  const validated = UpdateProfileSchema.parse(input);

  try {
    // 1. Actualizar campos de perfil (Nombre y preferencias de WhatsApp)
    const profileUpdates: any = { updated_at: new Date().toISOString() };
    if (validated.fullName && validated.fullName.trim()) {
      profileUpdates.full_name = validated.fullName.trim();
    }
    if (validated.whatsappPhone !== undefined) {
      profileUpdates.whatsapp_phone = validated.whatsappPhone ? HandoffService.cleanE164Phone(validated.whatsappPhone) : null;
    }
    if (validated.whatsappAlertsEnabled !== undefined) {
      profileUpdates.whatsapp_alerts_enabled = validated.whatsappAlertsEnabled;
    }
    if (validated.whatsappAlerts247 !== undefined) {
      profileUpdates.whatsapp_alerts_24_7 = validated.whatsappAlerts247;
    }

    const { error: profileError } = await (supabaseAdmin.from('profiles') as any)
      .update(profileUpdates)
      .eq('id', user.id);

    if (profileError) {
      throw new Error(`Error actualizando perfil: ${profileError.message}`);
    }

    if (validated.fullName && validated.fullName.trim()) {
      // Actualizar user_metadata en auth.users
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...(user.user_metadata || {}),
          full_name: validated.fullName.trim(),
        },
      });
    }

    // 2. Actualizar Contraseña si fue provista
    if (validated.newPassword && validated.newPassword.trim()) {
      const cleanPassword = validated.newPassword.trim();
      const isForcedChange = Boolean(user.user_metadata?.must_change_password);

      // Si es Super Admin, bloquear modificación desde la interfaz web (solo terminal)
      const { data: userProfile } = await (supabaseAdmin.from('profiles') as any)
        .select('is_super_admin')
        .eq('id', user.id)
        .single();

      if (userProfile?.is_super_admin || user.email?.toLowerCase() === 'admin@synqo.dev') {
        return {
          success: false,
          error: 'Por seguridad, la contraseña de la cuenta Super Admin solo puede modificarse mediante la terminal: npm run reset-superadmin',
        };
      }

      // Si no es un cambio forzado por primer login con clave temporal, exigir y verificar la contraseña actual
      if (!isForcedChange) {
        if (!validated.currentPassword || !validated.currentPassword.trim()) {
          return {
            success: false,
            error: 'Por seguridad, debes ingresar tu contraseña actual para autorizar el cambio.',
          };
        }

        // Verificar la contraseña actual contra Supabase Auth
        const { error: verifyError } = await supabase.auth.signInWithPassword({
          email: user.email!,
          password: validated.currentPassword.trim(),
        });

        if (verifyError) {
          return {
            success: false,
            error: 'La contraseña actual ingresada es incorrecta. Si no la recuerdas, solicita el restablecimiento a tu administrador.',
          };
        }
      }

      // Proceder con la actualización de la contraseña
      const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password: cleanPassword,
        user_metadata: {
          ...(user.user_metadata || {}),
          must_change_password: false, // Limpiar flag de forzar cambio
        },
      });

      if (passwordError) {
        throw new Error(`Error actualizando contraseña: ${passwordError.message}`);
      }
    }

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error inesperado actualizando datos.' };
  }
}

