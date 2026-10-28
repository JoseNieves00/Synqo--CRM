'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUserAndOrg } from '@/app/actions/auth';
import { revalidatePath } from 'next/cache';
import {
  StructuredPromptData,
  compileStructuredPrompt,
  appendKnowledgeToPrompt,
} from '@/lib/ai/prompt-compiler';

export interface KnowledgeGapRow {
  id: string;
  organization_id: string;
  contact_id: string | null;
  question_text: string;
  ai_category: string | null;
  reason: string | null;
  occurrences: number;
  status: 'pending' | 'resolved' | 'dismissed';
  suggested_answer: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Obtiene las preguntas sin resolver (vacíos de conocimiento) de la organización actual.
 */
export async function getPendingKnowledgeGaps(): Promise<KnowledgeGapRow[]> {
  const current = await getCurrentUserAndOrg();
  if (!current) return [];

  const { data, error } = await (supabaseAdmin.from('ai_knowledge_gaps') as any)
    .select('*')
    .eq('organization_id', current.organization.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[GET PENDING KNOWLEDGE GAPS ERROR]', error);
    return [];
  }

  return (data || []) as KnowledgeGapRow[];
}

/**
 * Obtiene el conteo rápido de vacíos pendientes para insignias y banners en el Inbox.
 */
export async function getKnowledgeGapsCount(): Promise<number> {
  const current = await getCurrentUserAndOrg();
  if (!current) return 0;

  const { count, error } = await (supabaseAdmin.from('ai_knowledge_gaps') as any)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', current.organization.id)
    .eq('status', 'pending');

  if (error) {
    return 0;
  }

  return count || 0;
}

/**
 * Entrena a la IA en 1 Clic con la respuesta proporcionada por el asesor/admin:
 * 1. Anexa la respuesta en la sección <politicas_y_faq> del System Prompt de la empresa.
 * 2. Marca el vacío de conocimiento como 'resolved'.
 */
export async function resolveKnowledgeGapAndTrainAI(
  gapId: string,
  answer: string
): Promise<{ success: boolean; error?: string; updatedPrompt?: string }> {
  const current = await getCurrentUserAndOrg();
  if (!current) {
    return { success: false, error: 'Sesión no autorizada' };
  }

  if (!answer || answer.trim().length < 3) {
    return { success: false, error: 'Por favor ingresa una respuesta clara de al menos 3 caracteres.' };
  }

  try {
    // 1. Obtener el vacío de conocimiento
    const { data: gap, error: gapErr } = await (supabaseAdmin.from('ai_knowledge_gaps') as any)
      .select('*')
      .eq('id', gapId)
      .eq('organization_id', current.organization.id)
      .single();

    if (gapErr || !gap) {
      return { success: false, error: 'Registro de pregunta no encontrado.' };
    }

    // 2. Obtener prompt actual de la organización
    const { data: org, error: orgErr } = await (supabaseAdmin.from('organizations') as any)
      .select('system_prompt, structured_prompt_data')
      .eq('id', current.organization.id)
      .single();

    if (orgErr || !org) {
      return { success: false, error: 'Organización no encontrada.' };
    }

    // 3. Anexar conocimiento al prompt
    const newSystemPrompt = appendKnowledgeToPrompt(
      org.system_prompt,
      gap.question_text,
      answer.trim()
    );

    // 4. Si existen datos estructurados, agregar también a customFaqs
    let updatedStructuredData = org.structured_prompt_data as any;
    if (updatedStructuredData && typeof updatedStructuredData === 'object') {
      if (!updatedStructuredData.policies) updatedStructuredData.policies = {};
      if (!Array.isArray(updatedStructuredData.policies.customFaqs)) {
        updatedStructuredData.policies.customFaqs = [];
      }
      updatedStructuredData.policies.customFaqs.push({
        question: gap.question_text,
        answer: answer.trim(),
      });
    }

    // 5. Guardar en organizations
    await (supabaseAdmin.from('organizations') as any)
      .update({
        system_prompt: newSystemPrompt,
        structured_prompt_data: updatedStructuredData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', current.organization.id);

    // 6. Actualizar estado del vacío en ai_knowledge_gaps
    await (supabaseAdmin.from('ai_knowledge_gaps') as any)
      .update({
        status: 'resolved',
        suggested_answer: answer.trim(),
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', gapId);

    revalidatePath('/settings');
    revalidatePath('/inbox');
    revalidatePath('/dashboard');

    return { success: true, updatedPrompt: newSystemPrompt };
  } catch (err: any) {
    console.error('[RESOLVE KNOWLEDGE GAP ERROR]', err);
    return { success: false, error: err.message || 'Error al entrenar la IA.' };
  }
}

/**
 * Descarta una pregunta no respondida (ej. spam o consulta irrelevante).
 */
export async function dismissKnowledgeGap(gapId: string): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentUserAndOrg();
  if (!current) {
    return { success: false, error: 'Sesión no autorizada' };
  }

  try {
    const { error } = await (supabaseAdmin.from('ai_knowledge_gaps') as any)
      .update({
        status: 'dismissed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', gapId)
      .eq('organization_id', current.organization.id);

    if (error) throw error;

    revalidatePath('/settings');
    revalidatePath('/inbox');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error al descartar la duda.' };
  }
}

/**
 * Guarda la configuración visual estructurada del wizard de negocio y compila el System Prompt.
 */
export async function saveStructuredPrompt(
  structuredData: StructuredPromptData,
  manualPromptOverride?: string
): Promise<{ success: boolean; error?: string; compiledPrompt?: string }> {
  const current = await getCurrentUserAndOrg();
  if (!current) {
    return { success: false, error: 'Sesión no autorizada' };
  }

  try {
    const finalPrompt = manualPromptOverride && manualPromptOverride.trim() !== ''
      ? manualPromptOverride.trim()
      : compileStructuredPrompt(structuredData);

    const updatePayload: Record<string, any> = {
      system_prompt: finalPrompt,
      structured_prompt_data: structuredData,
      industry_preset: structuredData.preset || 'services',
      handoff_mode: structuredData.handoff?.mode || 'silent',
      after_hours_message: structuredData.handoff?.afterHoursMessage || null,
      business_hours: {
        enabled: Boolean(structuredData.handoff?.afterHoursEnabled),
        start: structuredData.handoff?.businessHours?.start || '08:00',
        end: structuredData.handoff?.businessHours?.end || '18:00',
        days: structuredData.handoff?.businessHours?.days || [1, 2, 3, 4, 5],
      },
      updated_at: new Date().toISOString(),
    };

    const { error } = await (supabaseAdmin.from('organizations') as any)
      .update(updatePayload)
      .eq('id', current.organization.id);

    if (error) throw error;

    revalidatePath('/settings');
    revalidatePath('/inbox');
    return { success: true, compiledPrompt: finalPrompt };
  } catch (err: any) {
    console.error('[SAVE STRUCTURED PROMPT ERROR]', err);
    return { success: false, error: err.message || 'Error al guardar la configuración de IA.' };
  }
}

