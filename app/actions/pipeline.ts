'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PipelineStage, Database } from '@/lib/supabase/types';
import { revalidatePath } from 'next/cache';

/**
 * Actualiza la fase de un lead en el tablero Kanban.
 * Valida sesión y pertenencia a la organización (Anti-IDOR).
 */
export async function updateLeadStage(contactId: string, newStage: PipelineStage) {
  const supabase = createServerSupabaseClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('No autorizado');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile) {
    throw new Error('Perfil no encontrado');
  }

  const orgId = (profile as any).organization_id as string;
  const updatePayload: Database['public']['Tables']['contacts']['Update'] = {
    pipeline_stage: newStage,
    updated_at: new Date().toISOString(),
  };

  const { error: updateError } = await (supabase
    .from('contacts') as any)
    .update(updatePayload)
    .eq('id', contactId)
    .eq('organization_id', orgId);

  if (updateError) {
    throw new Error(`Error actualizando fase del lead: ${updateError.message}`);
  }

  revalidatePath('/pipeline');
  revalidatePath('/inbox');
}

