'use server';

import { LeadScoreService } from '@/services/lead-score.service';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PipelineStage, Database } from '@/lib/supabase/types';
import { PIPELINE_STAGES } from '@/services/contact.service';
import { revalidatePath } from 'next/cache';
import { normalizeE164Phone, sanitizeCsvField } from '@/lib/pipeline/csv-helpers';

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

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, full_name')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    throw new Error('Perfil no encontrado');
  }

  const orgId = profile.organization_id as string;
  const { data: prevContact } = await (supabaseAdmin.from('contacts') as any)
    .select('pipeline_stage, closed_at, custom_fields')
    .eq('id', contactId)
    .eq('organization_id', orgId)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  const prevCustom = (prevContact?.custom_fields as Record<string, any>) || {};
  const nextCustom: Record<string, any> = { ...prevCustom };

  if (newStage === 'ganado') {
    nextCustom.lead_temperature = 'hot';
    delete nextCustom.temperature;
    if (nextCustom.follow_up && nextCustom.follow_up.category !== 'post_order') {
      nextCustom.follow_up = { ...nextCustom.follow_up, category: 'post_order' };
    }
  } else if (newStage === 'perdido') {
    nextCustom.lead_temperature = 'cold';
    delete nextCustom.temperature;
    if (nextCustom.follow_up) {
      nextCustom.follow_up = { ...nextCustom.follow_up, nextSendAt: null, completed: true };
    }
  }

  const updatePayload: Database['public']['Tables']['contacts']['Update'] = {
    pipeline_stage: newStage,
    custom_fields: nextCustom,
    updated_at: nowIso,
    ...(newStage === 'ganado' || newStage === 'perdido'
      ? {
          conversation_status: 'closed',
          waiting_since: null,
          is_ai_active: false,
          ...(!prevContact?.closed_at ? { closed_at: nowIso } : {}),
        }
      : {}),
  };

  const { error: updateError } = await (supabaseAdmin
    .from('contacts') as any)
    .update(updatePayload)
    .eq('id', contactId)
    .eq('organization_id', orgId);

  if (newStage === 'ganado' || newStage === 'perdido') {
    await (supabaseAdmin.from('scheduled_reminders') as any)
      .update({ status: 'cancelled', updated_at: nowIso })
      .eq('contact_id', contactId)
      .eq('reminder_type', 'reactivation')
      .eq('status', 'pending');
  }

  if (updateError) {
    throw new Error(`Error actualizando fase del lead: ${updateError.message}`);
  }

  if (prevContact && prevContact.pipeline_stage !== newStage) {
    await (supabaseAdmin.from('messages') as any).insert({
      contact_id: contactId,
      sender_type: 'system',
      content: `[📊 Etapa actualizada por Humano (${profile.full_name || 'Asesor'}): ${newStage}]`,
    });
  }

  await LeadScoreService.recompute(contactId);

  revalidatePath('/pipeline');
  revalidatePath('/inbox');
  revalidatePath('/dashboard');
}

/**
 * Actualiza los alias visuales de las 5 columnas del Pipeline Kanban
 * sin alterar los enums de PostgreSQL ni romper el Tool Calling de la IA.
 */
export async function updateCustomStageLabels(labels: Partial<Record<PipelineStage, string>>) {
  const supabase = createServerSupabaseClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('No autorizado');
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    throw new Error('Perfil no encontrado');
  }

  if (profile.role !== 'admin' && profile.role !== 'supervisor') {
    throw new Error('Permisos insuficientes. Solo administradores pueden personalizar etapas.');
  }

  const orgId = profile.organization_id;

  // Obtener appointment_settings actual
  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('appointment_settings')
    .eq('id', orgId)
    .single();

  const currentSettings = (org?.appointment_settings as any) || {};
  const currentStageLabels = currentSettings.stage_labels || {};

  // Limpiar y sanitizar etiquetas
  const cleanedLabels: Record<string, string> = { ...currentStageLabels };
  for (const stage of PIPELINE_STAGES) {
    const customVal = labels[stage.id];
    if (customVal && customVal.trim().length > 0) {
      cleanedLabels[stage.id] = customVal.trim().slice(0, 40);
    } else if (customVal === '') {
      // Revertir a default si viene vacío
      delete cleanedLabels[stage.id];
    }
  }

  const updatedSettings = {
    ...currentSettings,
    stage_labels: cleanedLabels,
  };

  const { error: updateErr } = await (supabaseAdmin.from('organizations') as any)
    .update({
      appointment_settings: updatedSettings,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId);

  if (updateErr) {
    throw new Error(`Error al guardar alias de etapas: ${updateErr.message}`);
  }

  revalidatePath('/pipeline');
  return { success: true, stageLabels: cleanedLabels };
}

export interface ImportContactItem {
  name?: string;
  phone: string;
  stage?: string;
  notes?: string;
}

export interface ImportResult {
  totalReceived: number;
  imported: number;
  updated: number;
  errors: number;
  errorMessages: string[];
}

/**
 * Importación masiva segura de contactos (CSV / Excel).
 * - Sanitización anti-fórmulas.
 * - Normalización E.164.
 * - Deduplicación y UPSERT atómico sin errores 500.
 */
export async function importContactsBatch(
  contactsToImport: ImportContactItem[],
  defaultCountryCode = '57'
): Promise<ImportResult> {
  const supabase = createServerSupabaseClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('No autorizado');
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    throw new Error('Perfil no encontrado');
  }

  if (profile.role !== 'admin' && profile.role !== 'supervisor') {
    throw new Error('Solo administradores y supervisores pueden importar bases de datos.');
  }

  const orgId = profile.organization_id;

  if (!contactsToImport || contactsToImport.length === 0) {
    return { totalReceived: 0, imported: 0, updated: 0, errors: 0, errorMessages: [] };
  }

  // Límite de seguridad: 1,000 contactos por lote
  const batch = contactsToImport.slice(0, 1000);

  const validStages = new Set<string>(['nuevo', 'calificado', 'cita_agendada', 'ganado', 'perdido']);
  const deduplicatedByPhone = new Map<string, { name: string; phone: string; stage: PipelineStage; notes?: string }>();
  const errorMessages: string[] = [];

  for (let i = 0; i < batch.length; i++) {
    const raw = batch[i];
    const normalizedPhone = normalizeE164Phone(raw.phone, defaultCountryCode);

    if (!normalizedPhone || normalizedPhone.length < 8) {
      errorMessages.push(`Fila ${i + 1}: Teléfono inválido o incompleto ("${raw.phone}")`);
      continue;
    }

    const sanitizedName = sanitizeCsvField(raw.name) || 'Lead Importado';
    const sanitizedNotes = sanitizeCsvField(raw.notes);
    const assignedStage: PipelineStage = validStages.has(raw.stage || '')
      ? (raw.stage as PipelineStage)
      : 'nuevo';

    deduplicatedByPhone.set(normalizedPhone, {
      name: sanitizedName,
      phone: normalizedPhone,
      stage: assignedStage,
      notes: sanitizedNotes,
    });
  }

  if (deduplicatedByPhone.size === 0) {
    return {
      totalReceived: batch.length,
      imported: 0,
      updated: 0,
      errors: errorMessages.length,
      errorMessages,
    };
  }

  // Consultar contactos existentes para diferenciar importados vs actualizados
  const phonesList = Array.from(deduplicatedByPhone.keys());
  const { data: existingContacts } = await (supabaseAdmin.from('contacts') as any)
    .select('id, phone')
    .eq('organization_id', orgId)
    .in('phone', phonesList);

  const existingPhoneSet = new Set<string>((existingContacts || []).map((c: any) => c.phone));

  const upsertPayloads = Array.from(deduplicatedByPhone.values()).map((item) => ({
    organization_id: orgId,
    phone: item.phone,
    name: item.name,
    pipeline_stage: item.stage,
    is_ai_active: true,
    // 🛡️ BLINDAJE POLÍTICA 24H DE META:
    // Los contactos importados masivamente en frío se inicializan con la ventana cerrada (-48h)
    // para obligar al uso de plantillas oficiales (HSM) y evitar baneos de número en Meta por spam.
    last_interaction_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    custom_fields: item.notes ? { notes: item.notes } : {},
    updated_at: new Date().toISOString(),
  }));

  // Ejecutar UPSERT atómico en Supabase con onConflict
  const { error: upsertError } = await (supabaseAdmin.from('contacts') as any)
    .upsert(upsertPayloads, {
      onConflict: 'organization_id,phone',
      ignoreDuplicates: false,
    });

  if (upsertError) {
    throw new Error(`Error al insertar contactos en lote: ${upsertError.message}`);
  }

  let updatedCount = 0;
  let insertedCount = 0;

  for (const phone of phonesList) {
    if (existingPhoneSet.has(phone)) {
      updatedCount++;
    } else {
      insertedCount++;
    }
  }

  revalidatePath('/pipeline');
  revalidatePath('/inbox');

  return {
    totalReceived: batch.length,
    imported: insertedCount,
    updated: updatedCount,
    errors: errorMessages.length,
    errorMessages: errorMessages.slice(0, 10), // Máx 10 alertas para no saturar la UI
  };
}
