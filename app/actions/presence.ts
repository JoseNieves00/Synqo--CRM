'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { AvailabilityStatus } from '@/lib/supabase/types';

/**
 * Registra el latido (heartbeat) de presencia del usuario autenticado.
 * Actualiza last_seen_at para confirmar que el agente está activo y conectado.
 */
export async function recordUserHeartbeat(status?: AvailabilityStatus) {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return { success: false, error: 'No autenticado' };
    }

    const payload: { last_seen_at: string; availability_status?: AvailabilityStatus } = {
      last_seen_at: new Date().toISOString(),
    };

    if (status) {
      payload.availability_status = status;
    }

    await (supabaseAdmin.from('profiles') as any)
      .update(payload)
      .eq('id', user.id);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Permite al usuario conmutar su estado manual (ej: Disponible vs Ausente).
 */
export async function setAvailabilityStatus(status: AvailabilityStatus) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('No autorizado');
  }

  const { error: updateError } = await (supabaseAdmin.from('profiles') as any)
    .update({
      availability_status: status,
      last_seen_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (updateError) {
    throw new Error(`Error actualizando estado: ${updateError.message}`);
  }

  return { success: true, status };
}

