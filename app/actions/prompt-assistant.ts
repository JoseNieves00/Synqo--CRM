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
  getAssistantBudgetStatus,
  getNextPendingSlot,
  normalizeAssistantState,
  recordAssistantUsageInState,
  toClientBudgetNotice,
  type AssistantClientBudgetNotice,
  type PendingSectionProposal,
  type PromptAssistantState,
} from '@/lib/ai/prompt-assistant/state';
import {
  adaptBulletStyle,
  buildCompactPromptOutline,
  buildExactSectionHeadingsList,
  dedupePromptLinesDeterministically,
  detectPromptFormat,
  estimatePromptTokens,
  extractExistingSectionContent,
  isMetaPromptCommentary,
  patchSectionInPrompt,
  pushPromptVersion,
  renderPromptFromSlots,
  renderSectionBodyFromSlots,
  splitGalleryTail,
  tryRouteFreeInstructionLocally,
  type PromptVersionEntry,
} from '@/lib/ai/prompt-assistant/versions';
import { evaluatePromptHealth, type PromptHealthReport } from '@/lib/ai/prompt-assistant/health';
import {
  buildBehaviorContract,
  buildMissingBehaviorProposals,
  type BehaviorContract,
} from '@/lib/ai/prompt-assistant/readiness';
import { searchAssistantGuide } from '@/lib/ai/prompt-assistant/guide';
import { ConversationAuditService } from '@/lib/ai/prompt-assistant/conversation-audit';
import {
  getSmartCommercialSuggestions,
  type SmartSuggestionItem,
} from '@/lib/ai/prompt-assistant/smart-suggestions';
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
      'id, name, system_prompt, structured_prompt_data, industry_preset, ai_provider, whatsapp_provider, appointment_settings, business_hours, enabled_modules'
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

  const wasLimitedBefore = getAssistantBudgetStatus(params.currentState).limitReached;

  const updatedState = recordAssistantUsageInState(
    params.currentState,
    params.totalTokens,
    PROMPT_ASSISTANT_CONFIG.dailyTokenCap
  );

  const afterBudget = getAssistantBudgetStatus(updatedState);
  if (!wasLimitedBefore && afterBudget.limitReached) {
    const scopeLabel = afterBudget.limitScope === 'weekly' ? 'Semanal' : 'Diario';
    const currentAmount =
      afterBudget.limitScope === 'weekly' ? afterBudget.tokensLast7Days : afterBudget.tokensToday;
    const capAmount =
      afterBudget.limitScope === 'weekly' ? afterBudget.weeklyCap : afterBudget.dailyCap;
    (supabaseAdmin.from('organizations') as any)
      .select('name')
      .eq('id', params.orgId)
      .maybeSingle()
      .then(({ data }: any) => {
        PlatformAlertService.notifySuperAdminEvent({
          type: 'assistant_cap_exceeded',
          orgId: params.orgId,
          companyName: data?.name || params.orgId,
          title: `Tope ${scopeLabel} de Asistente de Prompt Superado`,
          details: `Alcanzó ${currentAmount.toLocaleString('es-CO')} / ${capAmount.toLocaleString('es-CO')} tokens (${scopeLabel.toLowerCase()}).`,
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
    paymentAccounts: Array.isArray(org.appointment_settings?.payment_accounts)
      ? org.appointment_settings.payment_accounts
      : [],
    businessHours: org.business_hours || null,
    pendingGapsCount,
    followUpEnabled: Boolean(followUpSeq?.enabled),
    whatsappProvider: org.whatsapp_provider || 'meta',
    hasMetaTemplatesInFollowUp: hasMetaTpl,
  });

  const budgetStatus = getAssistantBudgetStatus(state);
  const nextSlot = getNextPendingSlot(state, preset);

  // Contrato de comportamiento: qué hará el bot realmente con el prompt actual
  const galleryList = Array.isArray(structured.gallery) ? structured.gallery : [];
  const behaviorContract: BehaviorContract = buildBehaviorContract(activePrompt, galleryList);
  const behaviorProposals = buildMissingBehaviorProposals(activePrompt, galleryList);

  const smartSuggestions: SmartSuggestionItem[] = getSmartCommercialSuggestions({
    preset,
    currentPrompt: activePrompt,
    hasCatalog: Boolean(structured.catalog?.length || structured.gallery?.length),
  });

  return {
    state: { ...state, usageByDay: {}, totalAssistantTokens: 0 }, // No exponer conteos crudos de tokens al cliente
    versions,
    health,
    behaviorContract,
    behaviorProposals,
    preset,
    whatsappProvider: (org.whatsapp_provider || 'meta') as 'meta' | 'evolution',
    nextSlotId: nextSlot?.id || null,
    dailyLimitReached: budgetStatus.limitReached,
    budgetNotice: toClientBudgetNotice(budgetStatus),
    catalogInlineMax: PROMPT_ASSISTANT_CONFIG.catalogInlineMax,
    smartSuggestions,
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

  const isFreeMode = input.slotId === 'free';
  const slot = isFreeMode
    ? null
    : PROMPT_BLUEPRINT_SLOTS.find((s) => s.id === input.slotId);
  if (!isFreeMode && !slot) throw new Error('Sección o pregunta inválida');

  const cleanAnswer = sanitizeImportedText(input.answer);
  if (!cleanAnswer) throw new Error('Escribe o selecciona una respuesta.');

  const formatProfile = detectPromptFormat(input.currentPrompt || '');
  const existingPromptBody = splitGalleryTail(stripPhotoUrlsFromText(input.currentPrompt || '')).body.trim();

  // 1. Parseo determinístico (0 tokens) tanto en modo guiado como para reglas claras en Chat Libre
  const localAttempt = slot
    ? tryParseSlotLocally(slot, cleanAnswer, preset)
    : { handled: false as const };
  const freeLocalRoute =
    isFreeMode ? tryRouteFreeInstructionLocally(cleanAnswer, input.currentPrompt || '') : { handled: false };

  let filled: Record<string, any> = {};
  let alsoDetected: Record<string, any> = {};
  const mergedSections: Record<string, string> = {};
  let followUpQuestion: string | null = null;
  let skippedSlot = false;

  if (freeLocalRoute.handled && freeLocalRoute.sectionId && freeLocalRoute.slotId && freeLocalRoute.mergedBody) {
    alsoDetected[freeLocalRoute.slotId] = freeLocalRoute.value;
    mergedSections[freeLocalRoute.sectionId] = freeLocalRoute.mergedBody;
  } else if (localAttempt.handled && slot) {
    if (localAttempt.skipped) {
      skippedSlot = true;
      state.sectionStatus[slot.sectionId] = 'skipped';
    } else {
      filled[slot.id] = localAttempt.value;
    }
  } else {
    // 2. Verificar tope semanal/diario anti-abuso antes de llamar al LLM utilitario (sin descontar al cliente)
    const budget = getAssistantBudgetStatus(state);
    if (budget.limitReached) {
      return {
        limitReached: true,
        budgetNotice: toClientBudgetNotice(budget),
        assistantMessage:
          `Alcanzaste tu capacidad de mejoras automáticas (${budget.limitScope === 'weekly' ? 'semanal' : 'diaria'}). Se renueva ${budget.resetHint}. Mientras tanto puedes editar el texto arriba o usar respuestas rápidas.`,
        patchedPrompt: null,
        proposal: null,
        state: { ...state, usageByDay: {}, totalAssistantTokens: 0 },
        nextSlotId: isFreeMode ? 'free' : getNextPendingSlot(state, preset)?.id || null,
      };
    }

    const allSlotsHint = PROMPT_BLUEPRINT_SLOTS.map((s) => `${s.id} (${s.sectionTitle}: ${s.label})`).join('\n');
    const compactOutline = hasExistingBody ? buildCompactPromptOutline(existingPromptBody, 1300) : '';
    const exactHeadings = hasExistingBody ? buildExactSectionHeadingsList(input.currentPrompt || '') : [];
    const headingsList = exactHeadings.length
      ? `Encabezados EXACTOS del prompt del cliente:\n${exactHeadings.map((h) => `  • "${h}"`).join('\n')}\n`
      : '';
    const existingContextHint = compactOutline
      ? `\nEstilo del cliente: ${formatProfile.styleDescription}.\n${headingsList}Esquema actual:\n---\n${compactOutline}\n---`
      : '';

    const systemMsg = isFreeMode
      ? `Eres un editor quirúrgico de prompts comerciales multi-nicho.
El administrador escribió o dictó libremente una instrucción, dato, producto o regla.
Slots disponibles:
${allSlotsHint}
${existingContextHint}

REGLAS CRÍTICAS:
1. Identifica a qué slot(s) pertenece y devuelve el dato en "also_detected" (para "catalogo.items", array [{"name","price","specs","variants","includes"}]).
2. Si ya existe un prompt arriba, en "merged_sections" escribe para el sectionId tocado (ej. "adicional", "catalogo", "pagos", "envios", "politicas", "faq", "tono", "cierre", "relevo", "seguimiento", "empresa") el cuerpo ACTUALIZADO de esa sección: FUSIONA lo que ya tenía esa sección con la nueva instrucción, EVITA duplicados o redundancias, y ADÁPTATE exactamente al estilo del cliente (${formatProfile.styleDescription}) sin borrar reglas previas vigentes.
3. REGLA ANTI-DUPLICADOS DE SECCIÓN: Si el prompt del cliente ya tiene una sección compuesta que engloba el contenido (ej. la sección "${exactHeadings[0] || '## POLÍTICAS, ENVÍOS Y PAGOS:'}" ya cubre envíos Y pagos AND políticas), en "merged_sections" usa el sectionId del blueprint más relevante (ej. "envios", "pagos" o "politicas") — el sistema fusionará ese contenido en la sección compuesta existente automáticamente. NUNCA inventes una clave de sectionId que no esté en la lista de slots disponibles.
4. Redacta SIEMPRE como instrucciones directas ejecutables por el bot (PROHIBIDO meta-consejos como "Es recomendable...").
5. Si falta un dato esencial (ej. precio de un producto mencionado), sugiere una pregunta breve en "follow_up_question", si no null.
Responde ÚNICAMENTE JSON válido:
{ "also_detected": Record<string, any>, "merged_sections": Record<string, string>, "follow_up_question": string | null }`
      : `Eres un extractor estructurado para configurar un asistente comercial multi-nicho.
Sección actual: "${PROMPT_SECTIONS.find((s) => s.id === slot!.sectionId)?.title || slot!.sectionTitle}" (slot "${slot!.id}", tipo "${slot!.type}").
Pregunta realizada: "${slot!.question}"
${existingContextHint}
Convierte la respuesta libre del usuario en datos concisos y limpios (sin inventar precios ni datos y sin meta-consejos), respetando el estilo del cliente (${formatProfile.styleDescription}).
Si es "catalogo.items", devuelve un array de objetos: [{"name":"...","price":"...","specs":"...","variants":"...","includes":"..."}].
Si menciona información útil de otras secciones (${PROMPT_BLUEPRINT_SLOTS.filter((s) => s.id !== slot!.id).map((s) => `${s.id} (${s.label})`).join(', ')}), colócala en "also_detected" con el slotId exacto.
Si falta un dato esencial (ej. precio de un producto mencionado), sugiere una sola pregunta breve en "follow_up_question", de lo contrario null.
Responde ÚNICAMENTE JSON válido:
{ "filled_value": string | string[] | object[], "also_detected": Record<string, any>, "merged_sections": Record<string, string>, "follow_up_question": string | null }`;

    const llmRes = await createChatCompletionWithFallback({
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: cleanAnswer.slice(0, 2000) },
      ],
      temperature: 0.15,
      maxTokens: 450,
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
      if (!isFreeMode && slot) {
        if (parsed.filled_value !== undefined && parsed.filled_value !== null) {
          filled[slot.id] = parsed.filled_value;
        } else {
          filled[slot.id] = cleanAnswer;
        }
      }
      if (parsed.also_detected && typeof parsed.also_detected === 'object') {
        alsoDetected = parsed.also_detected;
      }
      if (parsed.merged_sections && typeof parsed.merged_sections === 'object') {
        for (const [secKey, secVal] of Object.entries(parsed.merged_sections)) {
          if (typeof secVal === 'string' && secVal.trim() && !isMetaPromptCommentary(secVal)) {
            mergedSections[secKey] = adaptBulletStyle(secVal.trim(), formatProfile.bulletStyle);
          }
        }
      }
      if (typeof parsed.follow_up_question === 'string' && parsed.follow_up_question.trim()) {
        followUpQuestion = parsed.follow_up_question.trim();
      }
    } catch {
      if (isFreeMode) {
        alsoDetected['adicional.notas'] = cleanAnswer;
      } else if (slot) {
        filled[slot.id] = cleanAnswer;
      }
    }

    if (isFreeMode && Object.keys(alsoDetected).length === 0) {
      alsoDetected['adicional.notas'] = cleanAnswer;
    }
  }

  // Mezclar slots detectados sin borrar previos y recolectar todas las secciones tocadas (activa + also_detected)
  const touchedSectionIds: string[] = [];
  for (const [k, v] of Object.entries({ ...filled, ...alsoDetected })) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'string' && (!v.trim() || isMetaPromptCommentary(v))) continue;
    state.slots[k] = v;
    const ownerSlot = PROMPT_BLUEPRINT_SLOTS.find((s) => s.id === k);
    if (ownerSlot) {
      state.sectionStatus[ownerSlot.sectionId] = 'complete';
      if (!touchedSectionIds.includes(ownerSlot.sectionId)) {
        touchedSectionIds.push(ownerSlot.sectionId);
      }
    }
  }
  for (const secKey of Object.keys(mergedSections)) {
    if (PROMPT_SECTIONS.some((s) => s.id === secKey) && !touchedSectionIds.includes(secKey)) {
      touchedSectionIds.push(secKey);
    }
  }
  if (!skippedSlot && slot && !touchedSectionIds.includes(slot.sectionId)) {
    touchedSectionIds.unshift(slot.sectionId);
  }

  // DEDUPLICACIÓN POR BLOQUE FÍSICO: si varios sectionIds del blueprint apuntan al mismo
  // encabezado existente del cliente (ej. "envios" y "politicas" ambos matchean
  // "## POLÍTICAS, ENVÍOS Y PAGOS:"), consolidar sus cuerpos en el primero que matchee
  // y eliminar los redundantes para evitar que se creen secciones duplicadas.
  if (hasExistingBody && touchedSectionIds.length > 1) {
    const resolvedBlockStartIdx: Map<number, string> = new Map(); // startIdx → winning sectionId
    const consolidatedBodies: Map<string, string[]> = new Map(); // winning sectionId → array of bodies to merge
    const toRemove = new Set<string>();

    for (const secId of touchedSectionIds) {
      const secMeta = PROMPT_SECTIONS.find((s) => s.id === secId);
      if (!secMeta) continue;
      const block = extractExistingSectionContent(input.currentPrompt || '', secMeta.title, secId);
      if (!block.found) continue;
      // Encontrar el startIdx real del bloque parseado
      const { body: promptBody } = splitGalleryTail(input.currentPrompt || '');
      const rawIdx = block.rawHeading ? promptBody.indexOf(block.rawHeading) : -1;
      if (rawIdx < 0) continue;

      const existing = resolvedBlockStartIdx.get(rawIdx);
      if (existing === undefined) {
        resolvedBlockStartIdx.set(rawIdx, secId);
        consolidatedBodies.set(secId, []);
      } else {
        // Este secId comparte el mismo bloque físico → consolidar su body en el winner
        const myBody = mergedSections[secId] || renderSectionBodyFromSlots(secId, state.slots);
        if (myBody && !isMetaPromptCommentary(myBody)) {
          consolidatedBodies.get(existing)!.push(myBody);
        }
        toRemove.add(secId);
      }
    }

    // Aplicar cuerpos consolidados al winner
    for (const [winnerId, extraBodies] of consolidatedBodies.entries()) {
      if (extraBodies.length > 0) {
        const existing = mergedSections[winnerId] || renderSectionBodyFromSlots(winnerId, state.slots) || '';
        mergedSections[winnerId] = [existing.trim(), ...extraBodies].filter(Boolean).join('\n\n');
      }
    }

    // Eliminar los sectionIds redundantes de la lista
    for (const removeId of toRemove) {
      const idx = touchedSectionIds.indexOf(removeId);
      if (idx >= 0) touchedSectionIds.splice(idx, 1);
      delete mergedSections[removeId];
    }
  }

  let patchedPrompt: string | null = null;
  let createdProposal: PendingSectionProposal | null = null;

  if (!skippedSlot) {
    if (state.mode === 'improve' && hasExistingBody) {
      for (const secId of touchedSectionIds) {
        const secMeta = PROMPT_SECTIONS.find((s) => s.id === secId);
        if (!secMeta) continue;
        const existingSec = extractExistingSectionContent(input.currentPrompt || '', secMeta.title, secId);
        const renderedSlotBody = renderSectionBodyFromSlots(secId, state.slots);
        let proposedBody = mergedSections[secId] || renderedSlotBody;
        if (!proposedBody || isMetaPromptCommentary(proposedBody)) continue;

        // Si la sección ya existe en el prompt actual, GARANTIZAR preservación acumulativa estricta:
        // Si el LLM omitió contenido previo (ej: solo devolvió el nuevo ítem en mergedSections),
        // fusionamos acumulativamente para NUNCA destruir las preguntas, productos o reglas previas.
        if (existingSec.found && existingSec.body.trim()) {
          const existingText = existingSec.body.trim();
          const existingNorm = existingText.toLowerCase();

          // Verificar si proposedBody ya contiene el contenido existente
          const proposedNorm = proposedBody.toLowerCase();
          const containsExisting =
            existingNorm.length <= 60
              ? proposedNorm.includes(existingNorm)
              : proposedNorm.includes(existingNorm.slice(0, 50)) ||
                (existingNorm.split('\n').filter((l) => l.trim().length > 15).length > 0 &&
                  existingNorm
                    .split('\n')
                    .filter((l) => l.trim().length > 15)
                    .every((l) => proposedNorm.includes(l.trim())));

          if (!containsExisting) {
            // El LLM o slot solo redactó el cambio puntual; conservar intacto lo existente y anexar lo nuevo al final
            const adaptedNew = adaptBulletStyle(proposedBody, formatProfile.bulletStyle);
            const newLines = adaptedNew
              .split('\n\n')
              .map((block) => block.trim())
              .filter((block) => block && !existingNorm.includes(block.slice(0, 30).toLowerCase()));

            if (newLines.length > 0) {
              proposedBody = `${existingText}\n\n${newLines.join('\n\n')}`;
            } else {
              proposedBody = existingText;
            }
          } else {
            proposedBody = adaptBulletStyle(proposedBody, formatProfile.bulletStyle);
          }
        } else {
          proposedBody = adaptBulletStyle(proposedBody, formatProfile.bulletStyle);
        }

        const prop: PendingSectionProposal = {
          id: `prop-${Date.now()}-${secId}`,
          sectionId: secId,
          sectionTitle: existingSec.rawHeading
            ? existingSec.rawHeading.replace(/^#+\s*|[:\s]+$/g, '').trim()
            : secMeta.title,
          currentText: existingSec.found
            ? existingSec.body
            : 'No especificado (se agregará respetando el estilo de tu prompt)',
          proposedText: proposedBody,
          reason: slot && secId === slot.sectionId
            ? `Actualización de ${slot.label}`
            : `Ubicado en ${secMeta.title} (${formatProfile.styleDescription})`,
        };
        if (!createdProposal || (slot && secId === slot.sectionId)) createdProposal = prop;
        state.pendingProposals = [
          prop,
          ...state.pendingProposals.filter((p) => p.sectionId !== secId),
        ];
      }
    } else {
      let workingPrompt = input.currentPrompt || '';
      if (workingPrompt.trim()) {
        versions = pushPromptVersion(
          versions,
          workingPrompt,
          slot ? `Antes de editar ${slot.sectionTitle}` : 'Antes de agregar instrucción libre'
        );
      }
      let anyPatched = false;
      for (const secId of touchedSectionIds) {
        const secMeta = PROMPT_SECTIONS.find((s) => s.id === secId);
        const rawBody = mergedSections[secId] || renderSectionBodyFromSlots(secId, state.slots);
        if (!secMeta || !rawBody || isMetaPromptCommentary(rawBody)) continue;
        workingPrompt = patchSectionInPrompt(workingPrompt, secMeta.title, rawBody, secId);
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
  const firstTouchedTitle =
    PROMPT_SECTIONS.find((s) => s.id === touchedSectionIds[0])?.title ||
    slot?.sectionTitle ||
    'Reglas adicionales';

  const endBudget = getAssistantBudgetStatus(state);

  return {
    limitReached: endBudget.limitReached,
    budgetNotice: toClientBudgetNotice(endBudget),
    assistantMessage:
      followUpQuestion ||
      (skippedSlot && slot
        ? `Perfecto, dejamos "${slot.sectionTitle}" para después.`
        : createdProposal
        ? `Listo, preparé la propuesta para **${firstTouchedTitle}**. Revísala arriba y dale **Aplicar en sección** para sumarla sin perder nada de tu prompt actual.`
        : touchedSectionIds.length > 1
        ? `¡Anotado en **${firstTouchedTitle}** y en ${touchedSectionIds.length - 1} sección(es) relacionada(s)!`
        : `¡Anotado en **${firstTouchedTitle}**!`),
    patchedPrompt,
    highlightedSection: patchedPrompt ? firstTouchedTitle : null,
    proposal: createdProposal,
    versions,
    state: { ...state, usageByDay: {}, totalAssistantTokens: 0 },
    structuredData: { ...savedStructured, assistant: { ...state, usageByDay: {}, totalAssistantTokens: 0 } },
    nextSlotId: isFreeMode ? 'free' : nextSlot?.id || null,
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

  const formatProfile = detectPromptFormat(cleanBody);
  const hash = crypto.createHash('sha256').update(`${cleanBody}::v3`).digest('hex').slice(0, 24);
  if (state.analyzedPromptHash === hash && state.pendingProposals.length > 0) {
    const cleanCached = state.pendingProposals.filter((p) => !isMetaPromptCommentary(p.proposedText));
    const endBudgetCached = getAssistantBudgetStatus(state);
    return {
      mode: 'improve' as const,
      cached: true,
      limitReached: false,
      budgetNotice: toClientBudgetNotice(endBudgetCached),
      proposals: cleanCached,
      conflicts: cleanCached.filter((p) => p.isConflict).map((p) => p.reason),
      nextSlotId: getNextPendingSlot(state, preset)?.id || null,
      state: { ...state, usageByDay: {}, totalAssistantTokens: 0 },
    };
  }

  const budget = getAssistantBudgetStatus(state);
  if (budget.limitReached) {
    return {
      mode: 'improve' as const,
      cached: false,
      limitReached: true,
      budgetNotice: toClientBudgetNotice(budget),
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
        content: `Audita el prompt comercial actual del cliente para transformarlo en un ASESOR COMERCIAL CONSULTIVO EXPERTO en WhatsApp (evitando que actúe como un folleto pasivo).
Estilo nativo actual del cliente: ${formatProfile.styleDescription}.
Slots del blueprint:
${slotList}

OBJETIVO DOBLE:
1. Detectar vacíos reales, contradicciones, líneas duplicadas o reglas repetidas entre secciones (y pautas genéricas redundantes como "no inventar precios" que la plataforma ya aplica).
2. Proponer mejoras o simplificaciones quirúrgicas ADAPTADAS AL FORMATO NATIVO DEL CLIENTE (${formatProfile.styleDescription}) que eleven la CONVERSIÓN COMERCIAL:
   - Técnica de Cierre con Doble Alternativa (ofrecer 2 opciones concretas en lugar de preguntas abiertas que dejan en visto).
   - Derribo proactivo de objeciones (tranquilidad en pagos, reservas con abono del 50%, garantía y tiempos de entrega).
   - Respuestas empáticas con diagnóstico breve antes de saturar al cliente con listas largas.

REGLA CRÍTICA DE SEPARACIÓN:
- "conflicts": coloca aquí TODA observación dirigida al dueño del negocio (ej: "Hay reglas duplicadas sobre pagos en dos apartados", "Hay dos precios distintos para el mismo producto").
- "proposals": incluye ÚNICAMENTE texto ejecutable listo para pegar literalmente en esa sección (para completar un vacío O reemplazar una sección simplificándola sin perder datos).
  * ADAPTA "proposedText" al mismo estilo de viñetas del cliente (${formatProfile.styleDescription}) y si esa sección ya existe, conserva sus reglas vigentes fusionando/simplificando duplicados.
  * PROHIBIDO escribir meta-consejos en "proposedText" (nunca escribas "Es recomendable...", "Conviene...", "Deberías...", "Se sugiere...", "Por ejemplo, incluir..."). Escribe siempre la directiva directa que debe obedecer el bot.

Responde ÚNICAMENTE JSON válido:
{
  "detected_slots": { "<slotId>": string | string[] },
  "conflicts": [string],
  "proposals": [
    {
      "sectionId": "empresa|catalogo|pagos|envios|politicas|faq|tono|cierre|relevo|seguimiento|adicional",
      "sectionTitle": "Título exacto de sección",
      "currentText": "Extracto actual o 'No especificado'",
      "proposedText": "Texto ejecutable listo para pegar literalmente en esa sección (respetando formato del cliente; NUNCA consejos)",
      "reason": "Por qué mejora respuestas, evita duplicados o simplifica tokens",
      "isConflict": boolean
    }
  ]
}`,
      },
      { role: 'user', content: dedupePromptLinesDeterministically(cleanBody).slice(0, 4800) },
    ],
    temperature: 0.15,
    maxTokens: 700,
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
        const secMeta = PROMPT_SECTIONS.find((s) => s.id === p.sectionId);
        const existingSec = extractExistingSectionContent(
          input.currentPrompt || '',
          secMeta?.title || String(p.sectionTitle || p.sectionId),
          String(p.sectionId)
        );
        validList.push({
          id: `prop-${Date.now()}-${i}`,
          sectionId: String(p.sectionId),
          sectionTitle: existingSec.rawHeading
            ? existingSec.rawHeading.replace(/^#+\s*|[:\s]+$/g, '').trim()
            : secMeta?.title || String(p.sectionTitle || p.sectionId),
          currentText: existingSec.found ? existingSec.body : String(p.currentText || 'No especificado'),
          proposedText: adaptBulletStyle(propText, formatProfile.bulletStyle),
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

  const endAnalyzeBudget = getAssistantBudgetStatus(state);

  return {
    mode: 'improve' as const,
    cached: false,
    limitReached: endAnalyzeBudget.limitReached,
    budgetNotice: toClientBudgetNotice(endAnalyzeBudget),
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
    input.proposedText,
    input.sectionId
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

export async function polishPromptDraftAction(input: { currentPrompt: string; previewOnly?: boolean }) {
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

  const budget = getAssistantBudgetStatus(state);
  if (budget.limitReached) {
    return {
      limitReached: true,
      budgetNotice: toClientBudgetNotice(budget),
      polishedPrompt: null,
      estimatedTokensBefore: estimatePromptTokens(body),
      estimatedTokensAfter: estimatePromptTokens(body),
      versions: structured.prompt_versions || [],
    };
  }

  const formatProfile = detectPromptFormat(body);
  const estimatedTokensBefore = estimatePromptTokens(body);

  const dedupedBody = dedupePromptLinesDeterministically(body);
  const llmRes = await createChatCompletionWithFallback({
    messages: [
      {
        role: 'system',
        content: `Simplifica y unifica este prompt comercial para lograr el MISMO comportamiento con menos tokens y cero redundancias.
REGLAS ESTRICTAS:
1. ADÁPTATE al formato actual del cliente (${formatProfile.styleDescription}): NO impongas encabezados diferentes si el cliente ya tiene su propio estilo claro.
2. FUSIONA y ELIMINA reglas repetidas, redundancias, párrafos duplicados o instrucciones genéricas obvias (como "no inventes precios") manteniendo exactamente el mismo efecto comercial.
3. REGLA SAGRADA: NO elimines ni alteres ningún precio, producto, medida, variante, ciudad, número de cuenta, tiempo de envío, garantía ni ninguna regla operativa o ruta de cierre específica del cliente.
4. Devuelve únicamente el texto final limpio sin comentarios introductorios.`,
      },
      { role: 'user', content: dedupedBody.slice(0, 5800) },
    ],
    temperature: 0.15,
    maxTokens: 1500,
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
  const estimatedTokensAfter = estimatePromptTokens(polishedBody);
  const finalPrompt = galleryTail ? `${polishedBody}\n\n${galleryTail}` : polishedBody;
  const endBudget = getAssistantBudgetStatus(state);

  if (input.previewOnly !== false) {
    await persistStructuredSafely({ orgId: org.id, state });
    return {
      limitReached: false,
      preview: true,
      budgetNotice: toClientBudgetNotice(endBudget),
      polishedPrompt: finalPrompt,
      estimatedTokensBefore,
      estimatedTokensAfter,
      versions: structured.prompt_versions || [],
      structuredData: { ...structured, assistant: { ...state, usageByDay: {}, totalAssistantTokens: 0 } },
    };
  }

  const versions = pushPromptVersion(
    structured.prompt_versions,
    input.currentPrompt,
    'Antes de pulir redacción con IA'
  );
  const savedStructured = await persistStructuredSafely({
    orgId: org.id,
    state,
    versions,
    nextSystemPrompt: finalPrompt,
  });

  return {
    limitReached: false,
    preview: false,
    budgetNotice: toClientBudgetNotice(endBudget),
    polishedPrompt: finalPrompt,
    estimatedTokensBefore,
    estimatedTokensAfter,
    versions,
    structuredData: { ...savedStructured, assistant: { ...state, usageByDay: {}, totalAssistantTokens: 0 } },
  };
}

export async function applyPolishedPromptAction(input: {
  currentPrompt: string;
  polishedPrompt: string;
}) {
  const { org } = await getAuthorizedOrgForAssistant();
  const structured =
    org.structured_prompt_data && typeof org.structured_prompt_data === 'object'
      ? org.structured_prompt_data
      : {};
  const state = normalizeAssistantState(structured.assistant, 'improve');
  const cleanPolished = (input.polishedPrompt || '').trim();
  if (cleanPolished.length < 25) {
    throw new Error('El texto optimizado es demasiado corto.');
  }

  const versions = pushPromptVersion(
    structured.prompt_versions,
    input.currentPrompt || org.system_prompt || '',
    'Antes de aplicar simplificación y orden con IA'
  );

  const savedStructured = await persistStructuredSafely({
    orgId: org.id,
    state,
    versions,
    nextSystemPrompt: cleanPolished,
  });

  return {
    appliedPrompt: cleanPolished,
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

  const patchedPrompt = patchSectionInPrompt(input.currentPrompt || '', 'Catálogo', sectionText, 'catalogo');
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
  const budget = getAssistantBudgetStatus(state);
  if (budget.limitReached) {
    return { limitReached: true, budgetNotice: toClientBudgetNotice(budget), items: [] as ImportedCatalogItem[] };
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
      maxTokens: 900,
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
  const budget = getAssistantBudgetStatus(state);
  if (budget.limitReached) {
    return {
      answer:
        `Alcanzaste tu capacidad de ayuda automática (${budget.limitScope === 'weekly' ? 'semanal' : 'diaria'}). Se renueva ${budget.resetHint}. Revisa las preguntas rápidas sugeridas arriba para respuestas inmediatas.`,
      topicTitle: 'Capacidad de mejoras alcanzada',
      usedAi: false,
      limitReached: true,
      budgetNotice: toClientBudgetNotice(budget),
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
    maxTokens: 220,
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
