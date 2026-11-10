'use server';

import crypto from 'node:crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PROMPT_ASSISTANT_CONFIG, getAiUtilityChain } from '@/lib/ai/config';
import type { IndustryPreset } from '@/lib/ai/prompt-compiler';
import { createChatCompletionWithFallback, OpenAIService } from '@/services/openai.service';
import { PlatformAlertService } from '@/services/platform-alert.service';
import {
  PROMPT_BLUEPRINT_SLOTS,
  PROMPT_SECTIONS,
  tryParseSlotLocally,
} from '@/lib/ai/prompt-assistant/blueprint';
import {
  getAssistantDailyUsage,
  getNextPendingSlot,
  normalizeAssistantState,
  recordAssistantUsageInState,
  type PendingSectionProposal,
  type PromptAssistantState,
} from '@/lib/ai/prompt-assistant/state';
import {
  isMetaPromptCommentary,
  patchSectionInPrompt,
  pushPromptVersion,
  renderPromptFromSlots,
  renderSectionBodyFromSlots,
  splitGalleryTail,
  type PromptVersionEntry,
} from '@/lib/ai/prompt-assistant/versions';
import { evaluatePromptHealth, type PromptHealthReport } from '@/lib/ai/prompt-assistant/health';
import { searchAssistantGuide } from '@/lib/ai/prompt-assistant/guide';
import { ConversationAuditService } from '@/lib/ai/prompt-assistant/conversation-audit';
import {
  matchImportedItemsWithGallery,
  sanitizeImportedText,
  type ImportedCatalogItem,
} from '@/lib/ai/prompt-assistant/file-import';
import { stripPhotoUrlsFromText } from '@/lib/media/format';
import { getKnowledgeGapsCount } from '@/app/actions/knowledge-gaps';

async function getAuthorizedOrgForAssistant() {
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
    throw new Error('Solo administradores o supervisores pueden usar el Asistente de Prompt.');
  }

  const { data: org, error: orgErr } = await (supabaseAdmin.from('organizations') as any)
    .select(
      'id, name, system_prompt, structured_prompt_data, industry_preset, ai_provider, whatsapp_provider, appointment_settings, enabled_modules'
    )
    .eq('id', profile.organization_id)
    .single();

  if (orgErr || !org) throw new Error('Organización no encontrada');
  return { user, profile, org };
}

/**
 * Registra consumo del asistente exclusivamente para auditoría de Synqo y tope diario anti-abuso,
 * sin descontar ni tocar la cuota comercial WhatsApp de la empresa (`ai_tokens_used`).
 */
async function trackAssistantConsumption(params: {
  orgId: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  currentState: PromptAssistantState;
}): Promise<PromptAssistantState> {
  try {
    await (supabaseAdmin.from('ai_runs') as any).insert({
      organization_id: params.orgId,
      contact_id: null,
      channel: 'prompt_assistant',
      provider: params.provider,
      model: params.model,
      prompt_tokens: params.promptTokens,
      completion_tokens: params.completionTokens,
      total_tokens: params.totalTokens,
      latency_ms: params.latencyMs,
      status: 'success',
    });
  } catch (err) {
    console.warn('[PROMPT ASSISTANT AI_RUNS AUDIT WARN]', err);
  }

  const wasLimitedBefore = getAssistantDailyUsage(
    params.currentState,
    PROMPT_ASSISTANT_CONFIG.dailyTokenCap
  ).limitReached;

  const updatedState = recordAssistantUsageInState(
    params.currentState,
    params.totalTokens,
    PROMPT_ASSISTANT_CONFIG.dailyTokenCap
  );

  const afterUsage = getAssistantDailyUsage(updatedState, PROMPT_ASSISTANT_CONFIG.dailyTokenCap);
  if (!wasLimitedBefore && afterUsage.limitReached) {
    (supabaseAdmin.from('organizations') as any)
      .select('name')
      .eq('id', params.orgId)
      .maybeSingle()
      .then(({ data }: any) => {
        PlatformAlertService.notifySuperAdminEvent({
          type: 'assistant_cap_exceeded',
          orgId: params.orgId,
          companyName: data?.name || params.orgId,
          title: 'Tope Diario de Asistente de Prompt Superado',
          details: `Alcanzó ${afterUsage.tokensToday.toLocaleString('es-CO')} / ${afterUsage.cap.toLocaleString('es-CO')} tokens hoy (${afterUsage.callsToday} llamadas).`,
          dedupeWindowMinutes: 120,
        }).catch(() => {});
      })
      .catch(() => {});
  }

  return updatedState;
}

async function persistStructuredSafely(params: {
  orgId: string;
  state: PromptAssistantState;
  versions?: PromptVersionEntry[];
  catalog?: any[];
  nextSystemPrompt?: string;
}) {
  const { data: freshOrg } = await (supabaseAdmin.from('organizations') as any)
    .select('structured_prompt_data')
    .eq('id', params.orgId)
    .single();

  const existingStructured =
    freshOrg?.structured_prompt_data && typeof freshOrg.structured_prompt_data === 'object'
      ? freshOrg.structured_prompt_data
      : {};

  const nextStructured = {
    ...existingStructured,
    assistant: params.state,
    ...(params.versions ? { prompt_versions: params.versions } : {}),
    ...(params.catalog ? { catalog: params.catalog } : {}),
  };

  const payload: Record<string, any> = {
    structured_prompt_data: nextStructured,
    updated_at: new Date().toISOString(),
  };
  if (params.nextSystemPrompt !== undefined) {
    payload.system_prompt = params.nextSystemPrompt.trim();
  }

  await (supabaseAdmin.from('organizations') as any).update(payload).eq('id', params.orgId);
  return nextStructured;
}

function stripJsonFence(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

export async function getPromptAssistantBootstrapAction(params?: { currentPrompt?: string }) {
  const { org } = await getAuthorizedOrgForAssistant();
  const structured =
    org.structured_prompt_data && typeof org.structured_prompt_data === 'object'
      ? org.structured_prompt_data
      : {};
  const activePrompt = params?.currentPrompt ?? org.system_prompt ?? '';
  const hasExistingPrompt = splitGalleryTail(activePrompt).body.trim().length >= 35;

  const state = normalizeAssistantState(structured.assistant, hasExistingPrompt ? 'improve' : 'new');
  const versions: PromptVersionEntry[] = Array.isArray(structured.prompt_versions)
    ? structured.prompt_versions
    : [];
  const preset = (org.industry_preset || 'custom') as IndustryPreset;
  const followUpSeq = org.appointment_settings?.follow_up_sequences;
  const hasMetaTpl = Object.values(followUpSeq?.sequences || {}).some(
    (cat: any) =>
      cat?.enabled &&
      Array.isArray(cat?.steps) &&
      cat.steps.some((s: any) => Boolean(s?.metaTemplateName?.trim()))
  );
  const pendingGapsCount = await getKnowledgeGapsCount().catch(() => 0);

  const health: PromptHealthReport = evaluatePromptHealth({
    prompt: activePrompt,
    state,
    preset,
    gallery: Array.isArray(structured.gallery) ? structured.gallery : [],
    pendingGapsCount,
    followUpEnabled: Boolean(followUpSeq?.enabled),
    whatsappProvider: org.whatsapp_provider || 'meta',
    hasMetaTemplatesInFollowUp: hasMetaTpl,
  });

  const dailyUsage = getAssistantDailyUsage(state, PROMPT_ASSISTANT_CONFIG.dailyTokenCap);
  const nextSlot = getNextPendingSlot(state, preset);

  return {
    state: { ...state, usageByDay: {}, totalAssistantTokens: 0 }, // No exponer conteos de tokens al cliente
    versions,
    health,
    preset,
    whatsappProvider: (org.whatsapp_provider || 'meta') as 'meta' | 'evolution',
    nextSlotId: nextSlot?.id || null,
    dailyLimitReached: dailyUsage.limitReached,
    catalogInlineMax: PROMPT_ASSISTANT_CONFIG.catalogInlineMax,
  };
}

export async function interpretAssistantAnswerAction(input: {
  sectionId: string;
  slotId: string;
  answer: string;
  currentPrompt: string;
}) {
  const { org } = await getAuthorizedOrgForAssistant();
  const structured =
    org.structured_prompt_data && typeof org.structured_prompt_data === 'object'
      ? org.structured_prompt_data
      : {};
  const preset = (org.industry_preset || 'custom') as IndustryPreset;
  const hasExistingBody = splitGalleryTail(input.currentPrompt || '').body.trim().length >= 35;
  let state = normalizeAssistantState(structured.assistant, hasExistingBody ? 'improve' : 'new');
  let versions: PromptVersionEntry[] = Array.isArray(structured.prompt_versions)
    ? structured.prompt_versions
    : [];

  const slot = PROMPT_BLUEPRINT_SLOTS.find((s) => s.id === input.slotId);
  if (!slot) throw new Error('Sección o pregunta inválida');

  const cleanAnswer = sanitizeImportedText(input.answer);
  if (!cleanAnswer) throw new Error('Escribe o selecciona una respuesta.');

  // 1. Parseo determinístico (0 tokens)
  const localAttempt = tryParseSlotLocally(slot, cleanAnswer, preset);
  let filled: Record<string, any> = {};
  let alsoDetected: Record<string, any> = {};
  let followUpQuestion: string | null = null;
  let skippedSlot = false;

  if (localAttempt.handled) {
    if (localAttempt.skipped) {
      skippedSlot = true;
      state.sectionStatus[slot.sectionId] = 'skipped';
    } else {
      filled[slot.id] = localAttempt.value;
    }
  } else {
    // 2. Verificar tope diario anti-abuso antes de llamar al LLM utilitario (sin descontar al cliente)
    const usage = getAssistantDailyUsage(state, PROMPT_ASSISTANT_CONFIG.dailyTokenCap);
    if (usage.limitReached) {
      return {
        limitReached: true,
        assistantMessage:
          'Alcanzaste el límite de generación automática por hoy. Puedes editar el texto manualmente arriba o continuar mañana.',
        patchedPrompt: null,
        proposal: null,
        state: { ...state, usageByDay: {}, totalAssistantTokens: 0 },
        nextSlotId: getNextPendingSlot(state, preset)?.id || null,
      };
    }

    const sectionMeta = PROMPT_SECTIONS.find((s) => s.id === slot.sectionId);
    const otherSlotsHint = PROMPT_BLUEPRINT_SLOTS.filter((s) => s.id !== slot.id)
      .map((s) => `${s.id} (${s.label})`)
      .join(', ');

    const systemMsg = `Eres un extractor estructurado para configurar un asistente comercial multi-nicho.
Sección actual: "${sectionMeta?.title || slot.sectionTitle}" (slot "${slot.id}", tipo "${slot.type}").
Pregunta realizada: "${slot.question}"
Convierte la respuesta libre del usuario en datos concisos y limpios (sin inventar precios ni datos).
Si es "catalogo.items", devuelve un array de objetos: [{"name":"...","price":"...","specs":"...","variants":"...","includes":"..."}].
Si menciona información útil de otras secciones (${otherSlotsHint}), colócala en "also_detected" con el slotId exacto.
Si falta un dato esencial (ej. precio de un producto mencionado), sugiere una sola pregunta breve en "follow_up_question", de lo contrario null.
Responde ÚNICAMENTE JSON válido:
{ "filled_value": string | string[] | object[], "also_detected": Record<string, any>, "follow_up_question": string | null }`;

    const llmRes = await createChatCompletionWithFallback({
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: cleanAnswer.slice(0, 2500) },
      ],
      temperature: 0.15,
      chainOverride: getAiUtilityChain(),
      aiProvider: org.ai_provider,
      organizationId: org.id,
      skipQuotaDeduction: true,
      responseFormat: { type: 'json_object' },
    });

    state = await trackAssistantConsumption({
      orgId: org.id,
      provider: llmRes.provider,
      model: llmRes.modelUsed,
      promptTokens: llmRes.promptTokens,
      completionTokens: llmRes.completionTokens,
      totalTokens: llmRes.totalTokens,
      latencyMs: llmRes.latencyMs,
      currentState: state,
    });

    try {
      const parsed = JSON.parse(stripJsonFence(llmRes.response.choices[0]?.message?.content || '{}'));
      if (parsed.filled_value !== undefined && parsed.filled_value !== null) {
        filled[slot.id] = parsed.filled_value;
      } else {
        filled[slot.id] = cleanAnswer;
      }
      if (parsed.also_detected && typeof parsed.also_detected === 'object') {
        alsoDetected = parsed.also_detected;
      }
      if (typeof parsed.follow_up_question === 'string' && parsed.follow_up_question.trim()) {
        followUpQuestion = parsed.follow_up_question.trim();
      }
    } catch {
      filled[slot.id] = cleanAnswer;
    }
  }

  // Mezclar slots detectados sin borrar previos y recolectar todas las secciones tocadas (activa + also_detected)
  const touchedSectionIds: string[] = [];
  for (const [k, v] of Object.entries({ ...filled, ...alsoDetected })) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'string' && !v.trim()) continue;
    state.slots[k] = v;
    const ownerSlot = PROMPT_BLUEPRINT_SLOTS.find((s) => s.id === k);
    if (ownerSlot) {
      state.sectionStatus[ownerSlot.sectionId] = 'complete';
      if (!touchedSectionIds.includes(ownerSlot.sectionId)) {
        touchedSectionIds.push(ownerSlot.sectionId);
      }
    }
  }
  if (!skippedSlot && !touchedSectionIds.includes(slot.sectionId)) {
    touchedSectionIds.unshift(slot.sectionId);
  }

  let patchedPrompt: string | null = null;
  let createdProposal: PendingSectionProposal | null = null;

  if (!skippedSlot) {
    if (state.mode === 'improve' && hasExistingBody) {
      for (const secId of touchedSectionIds) {
        const secMeta = PROMPT_SECTIONS.find((s) => s.id === secId);
        const bodyForSec = renderSectionBodyFromSlots(secId, state.slots);
        if (!secMeta || !bodyForSec) continue;
        const prop: PendingSectionProposal = {
          id: `prop-${Date.now()}-${secId}`,
          sectionId: secId,
          sectionTitle: secMeta.title,
          currentText: '(Prompt actual conservado hasta que apruebes este cambio)',
          proposedText: bodyForSec,
          reason:
            secId === slot.sectionId
              ? `Actualización de ${slot.label}`
              : `Detectado en tu respuesta (${secMeta.title})`,
        };
        if (secId === slot.sectionId) createdProposal = prop;
        state.pendingProposals = [
          prop,
          ...state.pendingProposals.filter((p) => p.sectionId !== secId),
        ];
      }
    } else {
      let workingPrompt = input.currentPrompt || '';
      if (workingPrompt.trim()) {
        versions = pushPromptVersion(versions, workingPrompt, `Antes de editar ${slot.sectionTitle}`);
      }
      let anyPatched = false;
      for (const secId of touchedSectionIds) {
        const secMeta = PROMPT_SECTIONS.find((s) => s.id === secId);
        const bodyForSec = renderSectionBodyFromSlots(secId, state.slots);
        if (!secMeta || !bodyForSec) continue;
        workingPrompt = patchSectionInPrompt(workingPrompt, secMeta.title, bodyForSec);
        anyPatched = true;
      }
      if (anyPatched) {
        patchedPrompt = workingPrompt;
      }
    }
  }

  const savedStructured = await persistStructuredSafely({
    orgId: org.id,
    state,
    versions,
    ...(patchedPrompt !== null ? { nextSystemPrompt: patchedPrompt } : {}),
  });
  const nextSlot = getNextPendingSlot(state, preset);

  return {
    limitReached: false,
    assistantMessage:
      followUpQuestion ||
      (skippedSlot
        ? `Perfecto, dejamos "${slot.sectionTitle}" para después.`
        : createdProposal
        ? `Listo, preparé la propuesta para **${slot.sectionTitle}**. Revísala arriba y dale **Aceptar** para sumarla sin perder nada de tu prompt actual.`
        : touchedSectionIds.length > 1
        ? `¡Anotado en **${slot.sectionTitle}** y en ${touchedSectionIds.length - 1} sección(es) relacionada(s)!`
        : `¡Anotado en **${slot.sectionTitle}**!`),
    patchedPrompt,
    highlightedSection: patchedPrompt ? slot.sectionTitle : null,
    proposal: createdProposal,
    versions,
    state: { ...state, usageByDay: {}, totalAssistantTokens: 0 },
    structuredData: { ...savedStructured, assistant: { ...state, usageByDay: {}, totalAssistantTokens: 0 } },
    nextSlotId: nextSlot?.id || null,
  };
}

export async function analyzeExistingPromptAction(input: { currentPrompt: string }) {
  const { org } = await getAuthorizedOrgForAssistant();
  const structured =
    org.structured_prompt_data && typeof org.structured_prompt_data === 'object'
      ? org.structured_prompt_data
      : {};
  const preset = (org.industry_preset || 'custom') as IndustryPreset;
  const cleanBody = splitGalleryTail(stripPhotoUrlsFromText(input.currentPrompt || '')).body.trim();

  let state = normalizeAssistantState(structured.assistant, 'improve');
  state.mode = 'improve';

  if (cleanBody.length < 35) {
    state.mode = 'new';
    await persistStructuredSafely({ orgId: org.id, state });
    return {
      mode: 'new' as const,
      cached: true,
      limitReached: false,
      proposals: [] as PendingSectionProposal[],
      conflicts: [] as string[],
      nextSlotId: getNextPendingSlot(state, preset)?.id || null,
      state: { ...state, usageByDay: {}, totalAssistantTokens: 0 },
    };
  }

  const hash = crypto.createHash('sha256').update(`${cleanBody}::v2`).digest('hex').slice(0, 24);
  if (state.analyzedPromptHash === hash && state.pendingProposals.length > 0) {
    const cleanCached = state.pendingProposals.filter((p) => !isMetaPromptCommentary(p.proposedText));
    return {
      mode: 'improve' as const,
      cached: true,
      limitReached: false,
      proposals: cleanCached,
      conflicts: cleanCached.filter((p) => p.isConflict).map((p) => p.reason),
      nextSlotId: getNextPendingSlot(state, preset)?.id || null,
      state: { ...state, usageByDay: {}, totalAssistantTokens: 0 },
    };
  }

  const usage = getAssistantDailyUsage(state, PROMPT_ASSISTANT_CONFIG.dailyTokenCap);
  if (usage.limitReached) {
    return {
      mode: 'improve' as const,
      cached: false,
      limitReached: true,
      proposals: state.pendingProposals,
      conflicts: [],
      nextSlotId: getNextPendingSlot(state, preset)?.id || null,
      state: { ...state, usageByDay: {}, totalAssistantTokens: 0 },
    };
  }

  const slotList = PROMPT_BLUEPRINT_SLOTS.map((s) => `${s.id} [${s.sectionTitle}]: ${s.label}`).join('\n');
  const llmRes = await createChatCompletionWithFallback({
    messages: [
      {
        role: 'system',
        content: `Audita el prompt comercial actual del cliente sin modificarlo ni destruir sus reglas propias.
Slots del blueprint:
${slotList}

REGLA CRÍTICA DE SEPARACIÓN:
1. "conflicts": coloca aquí TODA observación organizativa o contradicción dirigida al dueño del negocio (ej: "Las reglas de cierre están dispersas en dos secciones; usa 'Pulir redacción' para unificarlas", o "Hay dos precios distintos para el mismo ítem").
2. "proposals": incluye ÚNICAMENTE mejoras reales que el dueño pueda pegar literalmente en su prompt (datos faltantes o una regla operativa redactada como orden directa al bot, ej: "- Cuando envíes fotos con precio y medidas, no repitas esos datos en el mensaje de texto.").
   - PROHIBIDO poner meta-consejos en "proposedText" (nunca escribas "Es recomendable...", "Conviene...", "Deberías...", "Se sugiere...", "Por ejemplo, incluir..."). Si es una recomendación de orden/estructura y no texto ejecutable por el bot, ponla en "conflicts" y NO en "proposals".

Responde ÚNICAMENTE JSON válido:
{
  "detected_slots": { "<slotId>": string | string[] },
  "conflicts": [string],
  "proposals": [
    {
      "sectionId": "empresa|catalogo|pagos|envios|politicas|faq|tono|cierre|relevo|seguimiento|adicional",
      "sectionTitle": "Título exacto de sección",
      "currentText": "Extracto actual o 'No especificado'",
      "proposedText": "Texto ejecutable listo para pegar literalmente en esa sección (NUNCA consejos ni explicaciones)",
      "reason": "Por qué mejora respuestas o cierra vacíos",
      "isConflict": boolean
    }
  ]
}`,
      },
      { role: 'user', content: cleanBody.slice(0, 7000) },
    ],
    temperature: 0.15,
    chainOverride: getAiUtilityChain(),
    aiProvider: org.ai_provider,
    organizationId: org.id,
    skipQuotaDeduction: true,
    responseFormat: { type: 'json_object' },
  });

  state = await trackAssistantConsumption({
    orgId: org.id,
    provider: llmRes.provider,
    model: llmRes.modelUsed,
    promptTokens: llmRes.promptTokens,
    completionTokens: llmRes.completionTokens,
    totalTokens: llmRes.totalTokens,
    latencyMs: llmRes.latencyMs,
    currentState: state,
  });

  let proposals: PendingSectionProposal[] = [];
  let conflicts: string[] = [];

  try {
    const parsed = JSON.parse(stripJsonFence(llmRes.response.choices[0]?.message?.content || '{}'));
    if (parsed.detected_slots && typeof parsed.detected_slots === 'object') {
      for (const [k, v] of Object.entries(parsed.detected_slots)) {
        if (!v) continue;
        state.slots[k] = v;
        const owner = PROMPT_BLUEPRINT_SLOTS.find((s) => s.id === k);
        if (owner) state.sectionStatus[owner.sectionId] = 'complete';
      }
    }
    if (Array.isArray(parsed.conflicts)) {
      conflicts = parsed.conflicts.map((c: any) => String(c)).filter(Boolean);
    }
    if (Array.isArray(parsed.proposals)) {
      const validList: PendingSectionProposal[] = [];
      for (const [i, p] of parsed.proposals.entries()) {
        if (!p?.sectionId || !p?.proposedText) continue;
        const propText = String(p.proposedText).trim();
        // Guardrail determinístico: si el modelo devolvió un consejo en lugar de texto ejecutable para el prompt, moverlo a observaciones
        if (isMetaPromptCommentary(propText)) {
          conflicts.push(propText);
          continue;
        }
        validList.push({
          id: `prop-${Date.now()}-${i}`,
          sectionId: String(p.sectionId),
          sectionTitle:
            PROMPT_SECTIONS.find((s) => s.id === p.sectionId)?.title || String(p.sectionTitle || p.sectionId),
          currentText: String(p.currentText || 'No especificado'),
          proposedText: propText,
          reason: String(p.reason || 'Completar información faltante'),
          isConflict: Boolean(p.isConflict),
          source: 'improve',
        });
        if (validList.length >= 6) break;
      }
      proposals = validList;
    }
  } catch {}

  conflicts = Array.from(new Set(conflicts));

  state.analyzedPromptHash = hash;
  state.pendingProposals = proposals;
  await persistStructuredSafely({ orgId: org.id, state });

  return {
    mode: 'improve' as const,
    cached: false,
    limitReached: false,
    proposals,
    conflicts,
    nextSlotId: getNextPendingSlot(state, preset)?.id || null,
    state: { ...state, usageByDay: {}, totalAssistantTokens: 0 },
  };
}

export async function applySectionProposalAction(input: {
  proposalId: string;
  sectionId: string;
  sectionTitle: string;
  proposedText: string;
  currentPrompt: string;
}) {
  const { org } = await getAuthorizedOrgForAssistant();
  const structured =
    org.structured_prompt_data && typeof org.structured_prompt_data === 'object'
      ? org.structured_prompt_data
      : {};
  const state = normalizeAssistantState(structured.assistant, 'improve');
  const versions = pushPromptVersion(
    structured.prompt_versions,
    input.currentPrompt || org.system_prompt || '',
    `Antes de aplicar mejora en ${input.sectionTitle}`
  );

  const patchedPrompt = patchSectionInPrompt(
    input.currentPrompt || '',
    input.sectionTitle,
    input.proposedText
  );

  state.pendingProposals = state.pendingProposals.filter((p) => p.id !== input.proposalId);
  state.sectionStatus[input.sectionId] = 'complete';
  const savedStructured = await persistStructuredSafely({
    orgId: org.id,
    state,
    versions,
    nextSystemPrompt: patchedPrompt,
  });

  return {
    patchedPrompt,
    versions,
    remainingProposals: state.pendingProposals,
    highlightedSection: input.sectionTitle,
    structuredData: { ...savedStructured, assistant: { ...state, usageByDay: {}, totalAssistantTokens: 0 } },
  };
}

export async function rejectSectionProposalAction(input: { proposalId: string }) {
  const { org } = await getAuthorizedOrgForAssistant();
  const structured =
    org.structured_prompt_data && typeof org.structured_prompt_data === 'object'
      ? org.structured_prompt_data
      : {};
  const state = normalizeAssistantState(structured.assistant, 'improve');
  state.pendingProposals = state.pendingProposals.filter((p) => p.id !== input.proposalId);
  await persistStructuredSafely({ orgId: org.id, state });
  return { remainingProposals: state.pendingProposals };
}

export async function restorePromptVersionAction(input: {
  versionId: string;
  currentPrompt: string;
}) {
  const { org } = await getAuthorizedOrgForAssistant();
  const structured =
    org.structured_prompt_data && typeof org.structured_prompt_data === 'object'
      ? org.structured_prompt_data
      : {};
  const versions: PromptVersionEntry[] = Array.isArray(structured.prompt_versions)
    ? structured.prompt_versions
    : [];
  const target = versions.find((v) => v.id === input.versionId);
  if (!target) throw new Error('Versión no encontrada.');

  const updatedVersions = pushPromptVersion(
    versions,
    input.currentPrompt || '',
    `Respaldo automático previo a restaurar`
  );
  const state = normalizeAssistantState(structured.assistant, 'improve');
  const savedStructured = await persistStructuredSafely({
    orgId: org.id,
    state,
    versions: updatedVersions,
    nextSystemPrompt: target.prompt,
  });

  return {
    restoredPrompt: target.prompt,
    versions: updatedVersions,
    structuredData: { ...savedStructured, assistant: { ...state, usageByDay: {}, totalAssistantTokens: 0 } },
  };
}

export async function polishPromptDraftAction(input: { currentPrompt: string }) {
  const { org } = await getAuthorizedOrgForAssistant();
  const structured =
    org.structured_prompt_data && typeof org.structured_prompt_data === 'object'
      ? org.structured_prompt_data
      : {};
  let state = normalizeAssistantState(structured.assistant, 'improve');
  const { body, galleryTail } = splitGalleryTail(input.currentPrompt || '');
  if (body.trim().length < 25) {
    throw new Error('Redacta primero la información de tu negocio antes de pulir.');
  }

  const usage = getAssistantDailyUsage(state, PROMPT_ASSISTANT_CONFIG.dailyTokenCap);
  if (usage.limitReached) {
    return { limitReached: true, polishedPrompt: null, versions: structured.prompt_versions || [] };
  }

  const versions = pushPromptVersion(
    structured.prompt_versions,
    input.currentPrompt,
    'Antes de pulir redacción con IA'
  );

  const llmRes = await createChatCompletionWithFallback({
    messages: [
      {
        role: 'system',
        content: `Mejora la claridad, estructura y brevedad de este prompt empresarial en Markdown limpio (## Sección).
REGLA SAGRADA: NO elimines ni alteres ningún precio, producto, medida, ciudad, número de cuenta, tiempo de envío, garantía ni ninguna regla operativa/de cierre específica del cliente (como no repetir datos tras enviar fotos o pasos de cierre). Devuelve únicamente el texto final mejorado sin comentarios.`,
      },
      { role: 'user', content: body.slice(0, 7500) },
    ],
    temperature: 0.15,
    chainOverride: getAiUtilityChain(),
    aiProvider: org.ai_provider,
    organizationId: org.id,
    skipQuotaDeduction: true,
  });

  state = await trackAssistantConsumption({
    orgId: org.id,
    provider: llmRes.provider,
    model: llmRes.modelUsed,
    promptTokens: llmRes.promptTokens,
    completionTokens: llmRes.completionTokens,
    totalTokens: llmRes.totalTokens,
    latencyMs: llmRes.latencyMs,
    currentState: state,
  });

  const polishedBody = (llmRes.response.choices[0]?.message?.content || body).trim();
  const finalPrompt = galleryTail ? `${polishedBody}\n\n${galleryTail}` : polishedBody;
  const savedStructured = await persistStructuredSafely({
    orgId: org.id,
    state,
    versions,
    nextSystemPrompt: finalPrompt,
  });

  return {
    limitReached: false,
    polishedPrompt: finalPrompt,
    versions,
    structuredData: { ...savedStructured, assistant: { ...state, usageByDay: {}, totalAssistantTokens: 0 } },
  };
}

export async function saveImportedCatalogToPromptAction(input: {
  items: ImportedCatalogItem[];
  currentPrompt: string;
}) {
  const { org } = await getAuthorizedOrgForAssistant();
  const structured =
    org.structured_prompt_data && typeof org.structured_prompt_data === 'object'
      ? org.structured_prompt_data
      : {};
  const state = normalizeAssistantState(structured.assistant, 'improve');
  const gallery = Array.isArray(structured.gallery) ? structured.gallery : [];

  const matched = matchImportedItemsWithGallery(input.items.slice(0, 200), gallery);
  state.slots['catalogo.items'] = matched;
  state.sectionStatus.catalogo = 'complete';

  const versions = input.currentPrompt?.trim()
    ? pushPromptVersion(structured.prompt_versions, input.currentPrompt, 'Antes de importar catálogo')
    : structured.prompt_versions || [];

  const inlineItems = matched.slice(0, PROMPT_ASSISTANT_CONFIG.catalogInlineMax);
  const sectionText = inlineItems
    .map((it) => {
      const price = it.price ? ` — ${it.price}` : '';
      const details = [it.specs, it.variants, it.includes ? `Incluye: ${it.includes}` : '']
        .filter(Boolean)
        .join(' · ');
      return `- **${it.name}**${price}${details ? ` (${details})` : ''}`;
    })
    .join('\n');

  const catalogForDb = matched.map((it) => ({
    name: it.name,
    price: it.price || '',
    description: [it.specs, it.variants, it.includes ? `Incluye: ${it.includes}` : '']
      .filter(Boolean)
      .join(' · '),
    keywords: [it.name, it.variants].filter(Boolean),
  }));

  const patchedPrompt = patchSectionInPrompt(input.currentPrompt || '', 'Catálogo', sectionText);
  const savedStructured = await persistStructuredSafely({
    orgId: org.id,
    state,
    versions,
    catalog: catalogForDb,
    nextSystemPrompt: patchedPrompt,
  });

  return {
    patchedPrompt,
    versions,
    importedCount: matched.length,
    missingPhotoItems: matched.filter((i) => !i.matchedPhotoUrl).slice(0, 20),
    exceededInlineLimit: matched.length > PROMPT_ASSISTANT_CONFIG.catalogInlineMax,
    structuredData: { ...savedStructured, assistant: { ...state, usageByDay: {}, totalAssistantTokens: 0 } },
  };
}

export async function extractPdfCatalogBlocksAction(input: { blocks: string[] }) {
  const { org } = await getAuthorizedOrgForAssistant();
  const structured =
    org.structured_prompt_data && typeof org.structured_prompt_data === 'object'
      ? org.structured_prompt_data
      : {};
  let state = normalizeAssistantState(structured.assistant, 'improve');
  const usage = getAssistantDailyUsage(state, PROMPT_ASSISTANT_CONFIG.dailyTokenCap);
  if (usage.limitReached) {
    return { limitReached: true, items: [] as ImportedCatalogItem[] };
  }

  const gallery = Array.isArray(structured.gallery) ? structured.gallery : [];
  const extracted: ImportedCatalogItem[] = [];

  for (const block of input.blocks.slice(0, 6)) {
    const cleanBlock = sanitizeImportedText(block).slice(0, 12000);
    if (!cleanBlock) continue;

    const llmRes = await createChatCompletionWithFallback({
      messages: [
        {
          role: 'system',
          content:
            'Extrae únicamente los productos o servicios con su precio, medidas, variantes y qué incluye desde este catálogo. Responde JSON válido: { "items": [{ "name": string, "price": string|null, "specs": string|null, "variants": string|null, "includes": string|null }] }.',
        },
        { role: 'user', content: cleanBlock },
      ],
      temperature: 0.1,
      chainOverride: getAiUtilityChain(),
      aiProvider: org.ai_provider,
      organizationId: org.id,
      skipQuotaDeduction: true,
      responseFormat: { type: 'json_object' },
    });

    state = await trackAssistantConsumption({
      orgId: org.id,
      provider: llmRes.provider,
      model: llmRes.modelUsed,
      promptTokens: llmRes.promptTokens,
      completionTokens: llmRes.completionTokens,
      totalTokens: llmRes.totalTokens,
      latencyMs: llmRes.latencyMs,
      currentState: state,
    });

    try {
      const parsed = JSON.parse(stripJsonFence(llmRes.response.choices[0]?.message?.content || '{}'));
      if (Array.isArray(parsed.items)) {
        for (const it of parsed.items) {
          if (it?.name) {
            extracted.push({
              name: String(it.name).trim().slice(0, 120),
              price: it.price ? String(it.price).trim().slice(0, 60) : undefined,
              specs: it.specs ? String(it.specs).trim().slice(0, 180) : undefined,
              variants: it.variants ? String(it.variants).trim().slice(0, 140) : undefined,
              includes: it.includes ? String(it.includes).trim().slice(0, 180) : undefined,
            });
          }
        }
      }
    } catch {}
  }

  await persistStructuredSafely({ orgId: org.id, state });
  return {
    limitReached: false,
    items: matchImportedItemsWithGallery(extracted, gallery),
  };
}

export async function askAssistantHelpAction(input: { question: string }) {
  const { org } = await getAuthorizedOrgForAssistant();
  const cleanQ = sanitizeImportedText(input.question).slice(0, 400);
  if (!cleanQ) throw new Error('Escribe tu pregunta.');

  const { matched, closest } = searchAssistantGuide(cleanQ);
  if (matched) {
    return {
      answer: matched.answer,
      topicTitle: matched.title,
      usedAi: false,
      limitReached: false,
    };
  }

  const structured =
    org.structured_prompt_data && typeof org.structured_prompt_data === 'object'
      ? org.structured_prompt_data
      : {};
  let state = normalizeAssistantState(structured.assistant, 'improve');
  const usage = getAssistantDailyUsage(state, PROMPT_ASSISTANT_CONFIG.dailyTokenCap);
  if (usage.limitReached) {
    return {
      answer:
        'Alcanzaste el límite de ayuda automática por hoy. Revisa las preguntas rápidas sugeridas arriba para respuestas inmediatas.',
      topicTitle: 'Límite diario alcanzado',
      usedAi: false,
      limitReached: true,
    };
  }

  const guideContext = closest.map((t) => `### ${t.title}\n${t.answer}`).join('\n\n');
  const llmRes = await createChatCompletionWithFallback({
    messages: [
      {
        role: 'system',
        content: `Eres el asistente de ayuda de Synqo CRM. Responde brevemente (máx 4 líneas) basándote únicamente en la guía oficial de Synqo:\n\n${guideContext}`,
      },
      { role: 'user', content: cleanQ },
    ],
    temperature: 0.2,
    chainOverride: getAiUtilityChain(),
    aiProvider: org.ai_provider,
    organizationId: org.id,
    skipQuotaDeduction: true,
  });

  state = await trackAssistantConsumption({
    orgId: org.id,
    provider: llmRes.provider,
    model: llmRes.modelUsed,
    promptTokens: llmRes.promptTokens,
    completionTokens: llmRes.completionTokens,
    totalTokens: llmRes.totalTokens,
    latencyMs: llmRes.latencyMs,
    currentState: state,
  });
  await persistStructuredSafely({ orgId: org.id, state });

  return {
    answer: (llmRes.response.choices[0]?.message?.content || closest[0]?.answer || '').trim(),
    topicTitle: closest[0]?.title || 'Guía de Synqo',
    usedAi: true,
    limitReached: false,
  };
}

export async function generateFollowUpsFromAssistantAction(input: {
  argumentsHint?: string;
  toneHint?: string;
  frequencyHint?: string;
}) {
  const { org } = await getAuthorizedOrgForAssistant();
  const suggestions = await OpenAIService.generateFollowUpSuggestions(org, input);
  return {
    success: true,
    suggestions,
    whatsappProvider: (org.whatsapp_provider || 'meta') as 'meta' | 'evolution',
  };
}

export async function markAssistantSandboxTestedAction() {
  const { org } = await getAuthorizedOrgForAssistant();
  const structured =
    org.structured_prompt_data && typeof org.structured_prompt_data === 'object'
      ? org.structured_prompt_data
      : {};
  const state = normalizeAssistantState(structured.assistant, 'improve');
  state.sandboxTestedAt = new Date().toISOString();
  await persistStructuredSafely({ orgId: org.id, state });
  return { ok: true };
}

export async function buildDeterministicSandboxQuestionsAction(input: { currentPrompt: string }) {
  const { org } = await getAuthorizedOrgForAssistant();
  const structured =
    org.structured_prompt_data && typeof org.structured_prompt_data === 'object'
      ? org.structured_prompt_data
      : {};
  const state = normalizeAssistantState(structured.assistant, 'improve');
  const gallery = Array.isArray(structured.gallery) ? structured.gallery : [];

  const firstProduct =
    (Array.isArray(state.slots['catalogo.items']) && state.slots['catalogo.items'][0]?.name) ||
    gallery[0]?.name ||
    null;

  const q1 = firstProduct
    ? `Hola, ¿qué precio y detalles tiene ${firstProduct}?`
    : 'Hola, ¿qué productos o servicios manejan y cuáles son sus precios?';

  const cityText = String(state.slots['envios.cobertura'] || state.slots['empresa.resumen'] || '');
  const q2 = cityText
    ? '¿Cómo manejan la entrega, tiempos o atención presencial?'
    : '¿Cuál es su horario y cobertura de atención o entrega?';

  const q3 = '¿Qué medios de pago aceptan y qué datos necesitan para confirmar hoy?';

  return { questions: [q1, q2, q3] };
}

/**
 * Ejecuta o actualiza el diagnóstico diario de conversaciones (comparando conversiones vs no conversiones)
 * respetando caché por huella digital y límite diario interno.
 */
export async function refreshDailyConversationAuditAction(params?: { force?: boolean }) {
  const { org } = await getAuthorizedOrgForAssistant();
  const auditRes = await ConversationAuditService.runAuditForOrganization({
    org,
    force: Boolean(params?.force),
  });

  const { data: freshOrg } = await (supabaseAdmin.from('organizations') as any)
    .select('structured_prompt_data')
    .eq('id', org.id)
    .maybeSingle();

  const state = normalizeAssistantState(freshOrg?.structured_prompt_data?.assistant, 'improve');
  return {
    ranAi: auditRes.ranAi,
    skippedReason: auditRes.skippedReason,
    dailyInsights: state.dailyInsights || null,
    pendingProposals: state.pendingProposals || [],
    state: { ...state, usageByDay: {}, totalAssistantTokens: 0 },
  };
}
