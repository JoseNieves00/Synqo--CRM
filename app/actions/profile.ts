'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const UpdateProfileSchema = z.object({
  fullName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres.').optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres.').optional(),
});

/**
 * Actualizar nombre de usuario y/o cambiar contraseña propia.
 * Cuando un usuario actualiza su contraseña por primera vez, limpia el flag `must_change_password`.
 */
export async function updateUserProfile(input: {
  fullName?: string;
  currentPassword?: string;
  newPassword?: string;
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
    // 1. Actualizar Nombre Completo si fue provisto
    if (validated.fullName && validated.fullName.trim()) {
      const cleanName = validated.fullName.trim();

      // Actualizar en base de datos profiles
      const { error: profileError } = await (supabaseAdmin.from('profiles') as any)
        .update({
          full_name: cleanName,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (profileError) {
        throw new Error(`Error actualizando perfil: ${profileError.message}`);
      }

      // Actualizar user_metadata en auth.users
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...(user.user_metadata || {}),
          full_name: cleanName,
        },
      });
    }

    // 2. Actualizar Contraseña si fue provista
    if (validated.newPassword && validated.newPassword.trim()) {
      const cleanPassword = validated.newPassword.trim();

      // Si el usuario ya tenía sesión pero no está forzado a cambiar, podemos validar la anterior o actualizar directamente
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

