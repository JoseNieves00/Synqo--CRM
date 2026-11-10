import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PROMPT_ASSISTANT_CONFIG, getAiUtilityChain } from '@/lib/ai/config';
import { resolveLeadTemperature, resolveProductInterest } from '@/lib/ai/follow-up-types';
import { createChatCompletionWithFallback } from '@/services/openai.service';
import { PROMPT_SECTIONS } from './blueprint';
import {
  getAssistantBudgetStatus,
  getAssistantDayKey,
  normalizeAssistantState,
  recordAssistantUsageInState,
  type DailyConversationInsights,
  type DailyConversationNeed,
  type PendingSectionProposal,
} from './state';
import { isMetaPromptCommentary, splitGalleryTail } from './versions';

export type AuditOutcomeBucket = 'converted' | 'in_doubt' | 'stalled_warm' | 'lost';

export interface AuditSampleContact {
  id: string;
  name?: string | null;
  pipeline_stage?: string | null;
  deal_value?: number | null;
  last_interaction_at?: string | null;
  updated_at?: string | null;
  custom_fields?: Record<string, any> | null;
}

export interface AuditSampleMessage {
  contact_id: string;
  sender_type: string;
  content: string;
  created_at?: string;
}

export interface StratifiedAuditSample {
  categoryStats: DailyConversationInsights['categoryStats'];
  buckets: Record<AuditOutcomeBucket, AuditSampleContact[]>;
  allSampled: Array<{ bucket: AuditOutcomeBucket; contact: AuditSampleContact }>;
}

function classifyContactOutcome(c: AuditSampleContact): AuditOutcomeBucket {
  const cf = (c.custom_fields || {}) as Record<string, any>;
  const stage = String(c.pipeline_stage || 'nuevo');
  const temp = resolveLeadTemperature(cf);

  if (stage === 'ganado' || stage === 'cita_agendada' || Boolean(cf.order) || Number(c.deal_value || 0) > 0) {
    return 'converted';
  }
  if (stage === 'perdido' || temp === 'cold' || cf.opted_out === true) {
    return 'lost';
  }
  if (stage === 'calificado' || temp === 'qualified_doubt') {
    return 'in_doubt';
  }
  return 'stalled_warm';
}

/**
 * Muestreo estratificado determinístico (0 tokens):
 * toma hasta 3 convertidos, 3 en duda, 3 tibios sin cierre y 2 perdidos (máx. 11 chats).
 */
export function buildStratifiedAuditSample(contacts: AuditSampleContact[]): StratifiedAuditSample {
  const buckets: Record<AuditOutcomeBucket, AuditSampleContact[]> = {
    converted: [],
    in_doubt: [],
    stalled_warm: [],
    lost: [],
  };

  const categoryStats: DailyConversationInsights['categoryStats'] = {
    converted: 0,
    inDoubt: 0,
    stalledWarm: 0,
    lost: 0,
    pendingHandoffs: 0,
  };

  const limits: Record<AuditOutcomeBucket, number> = {
    converted: 3,
    in_doubt: 3,
    stalled_warm: 3,
    lost: 2,
  };

  for (const c of contacts) {
    const cf = (c.custom_fields || {}) as Record<string, any>;
    if (cf.unattended_handoff === true) {
      categoryStats.pendingHandoffs += 1;
    }

    const bucket = classifyContactOutcome(c);
    if (bucket === 'converted') categoryStats.converted += 1;
    else if (bucket === 'in_doubt') categoryStats.inDoubt += 1;
    else if (bucket === 'stalled_warm') categoryStats.stalledWarm += 1;
    else categoryStats.lost += 1;

    if (buckets[bucket].length < limits[bucket]) {
      buckets[bucket].push(c);
    }
  }

  const allSampled: Array<{ bucket: AuditOutcomeBucket; contact: AuditSampleContact }> = [
    ...buckets.converted.map((contact) => ({ bucket: 'converted' as const, contact })),
    ...buckets.in_doubt.map((contact) => ({ bucket: 'in_doubt' as const, contact })),
    ...buckets.stalled_warm.map((contact) => ({ bucket: 'stalled_warm' as const, contact })),
    ...buckets.lost.map((contact) => ({ bucket: 'lost' as const, contact })),
  ];

  return { categoryStats, buckets, allSampled };
}

function compactMessageContent(raw: string): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (text.startsWith('[IMAGEN') || /^https?:\/\/\S+\.(?:jpg|jpeg|png|webp|gif)/i.test(text)) {
    const captionLine = text.split('\n').slice(1).join(' ').trim();
    return captionLine ? `[Imagen+caption: ${captionLine.slice(0, 90)}]` : '[Imagen enviada]';
  }
  return text.replace(/\s+/g, ' ').slice(0, 140);
}

/**
 * Compacta un chat muestreado a <= ~650 caracteres para minimizar tokens enviados al LLM.
 */
export function compactConversationForAudit(
  bucket: AuditOutcomeBucket,
  contact: AuditSampleContact,
  messages: AuditSampleMessage[]
): string {
  const cf = (contact.custom_fields || {}) as Record<string, any>;
  const interest = resolveProductInterest(cf, contact.deal_value) || 'general';
  const obj = cf.objection ? ` | Objeción: ${String(cf.objection).slice(0, 60)}` : '';
  const lost = cf.lost_reason ? ` | Motivo pérdida: ${String(cf.lost_reason).slice(0, 60)}` : '';
  const summary = cf.ai_summary?.summary_text
    ? ` | Resumen: ${String(cf.ai_summary.summary_text).replace(/\s+/g, ' ').slice(0, 120)}`
    : '';

  const recentTurns = messages
    .slice(-6)
    .map((m) => {
      const role = m.sender_type === 'lead' ? 'Cliente' : m.sender_type === 'ai' ? 'IA' : 'Asesor';
      const compact = compactMessageContent(m.content);
      return compact ? `${role}: ${compact}` : '';
    })
    .filter(Boolean)
    .join(' || ');

  return `[${bucket.toUpperCase()}] Interés: ${interest}${obj}${lost}${summary}\nTurns: ${recentTurns || 'sin turnos'}`.slice(
    0,
    680
  );
}

export function computeAuditSampleFingerprint(params: {
  contacts: AuditSampleContact[];
  gaps: Array<{ id?: string; question_text?: string; occurrences?: number }>;
  promptBody: string;
}): string {
  const payload = JSON.stringify({
    contacts: params.contacts.slice(0, 30).map((c) => ({
      id: c.id,
      stage: c.pipeline_stage,
      ts: c.last_interaction_at || c.updated_at,
    })),
    gaps: params.gaps.slice(0, 8).map((g) => `${g.question_text || ''}:${g.occurrences || 1}`),
    promptHash: crypto.createHash('sha256').update(params.promptBody || '').digest('hex').slice(0, 12),
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 20);
}

function stripJsonFence(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

export class ConversationAuditService {
  /**
   * Ejecuta un análisis estratificado y compacto de las conversaciones recientes de una empresa.
   * Diseñado para correr de forma pasiva 1 vez por día (0 tokens si no hubo cambios relevantes).
   */
  static async runAuditForOrganization(params: {
    org: {
      id: string;
      name?: string | null;
      system_prompt?: string | null;
      structured_prompt_data?: any;
      ai_provider?: string | null;
    };
    force?: boolean;
  }): Promise<{
    ranAi: boolean;
    skippedReason?: string;
    insights?: DailyConversationInsights | null;
    newProposalsCount?: number;
  }> {
    const { org, force = false } = params;
    const structured =
      org.structured_prompt_data && typeof org.structured_prompt_data === 'object'
        ? { ...org.structured_prompt_data }
        : {};
    const promptBody = splitGalleryTail(org.system_prompt || '').body.trim();
    if (promptBody.length < 25) {
      return { ranAi: false, skippedReason: 'prompt_empty' };
    }

    let state = normalizeAssistantState(structured.assistant, 'improve');
    const todayBogota = getAssistantDayKey();

    if (!force && state.dailyInsights?.lastAuditDay === todayBogota) {
      return {
        ranAi: false,
        skippedReason: 'already_audited_today',
        insights: state.dailyInsights,
      };
    }

    const budget = getAssistantBudgetStatus(state);
    if (budget.auditLimitReached) {
      return { ranAi: false, skippedReason: 'weekly_audit_cap_reached', insights: state.dailyInsights || null };
    }

    const cutoffIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: recentContacts }, { data: pendingGaps }] = await Promise.all([
      (supabaseAdmin.from('contacts') as any)
        .select('id, name, pipeline_stage, deal_value, last_interaction_at, updated_at, custom_fields')
        .eq('organization_id', org.id)
        .gte('updated_at', cutoffIso)
        .order('updated_at', { ascending: false })
        .limit(60),
      (supabaseAdmin.from('ai_knowledge_gaps') as any)
        .select('id, question_text, occurrences, ai_category')
        .eq('organization_id', org.id)
        .eq('status', 'pending')
        .order('occurrences', { ascending: false })
        .limit(8),
    ]);

    const contactsList: AuditSampleContact[] = Array.isArray(recentContacts) ? recentContacts : [];
    const gapsList: any[] = Array.isArray(pendingGaps) ? pendingGaps : [];

    if (contactsList.length < 3) {
      return { ranAi: false, skippedReason: 'insufficient_conversations', insights: state.dailyInsights || null };
    }

    const sample = buildStratifiedAuditSample(contactsList);
    if (sample.allSampled.length < 3) {
      return { ranAi: false, skippedReason: 'insufficient_sample', insights: state.dailyInsights || null };
    }

    const fingerprint = computeAuditSampleFingerprint({
      contacts: contactsList,
      gaps: gapsList,
      promptBody,
    });

    if (!force && state.dailyInsights?.sampleFingerprint === fingerprint) {
      // Actualizar la fecha del día sin gastar tokens si no hay actividad nueva
      const refreshed: DailyConversationInsights = {
        ...state.dailyInsights,
        lastAuditDay: todayBogota,
        categoryStats: sample.categoryStats,
      };
      state.dailyInsights = refreshed;
      await (supabaseAdmin.from('organizations') as any)
        .update({
          structured_prompt_data: { ...structured, assistant: state },
          updated_at: new Date().toISOString(),
        })
        .eq('id', org.id);
      return { ranAi: false, skippedReason: 'no_new_activity', insights: refreshed };
    }

    const sampledIds = sample.allSampled.map((s) => s.contact.id);
    const { data: rawMsgs } = await (supabaseAdmin.from('messages') as any)
      .select('contact_id, sender_type, content, created_at')
      .in('contact_id', sampledIds)
      .in('sender_type', ['lead', 'ai', 'agent_manual'])
      .order('created_at', { ascending: false })
      .limit(sampledIds.length * 8);

    const msgsByContact = new Map<string, AuditSampleMessage[]>();
    for (const m of Array.isArray(rawMsgs) ? rawMsgs : []) {
      const list = msgsByContact.get(m.contact_id) || [];
      list.push(m);
      msgsByContact.set(m.contact_id, list);
    }

    const compactedThreads = sample.allSampled
      .map(({ bucket, contact }) => {
        const msgs = [...(msgsByContact.get(contact.id) || [])].reverse();
        return compactConversationForAudit(bucket, contact, msgs);
      })
      .join('\n---\n');

    const gapsSummary =
      gapsList.length > 0
        ? gapsList.map((g) => `- "${g.question_text}" (${g.occurrences || 1}x)`).join('\n')
        : 'Ningún vacío pendiente registrado.';

    const llmRes = await createChatCompletionWithFallback({
      messages: [
        {
          role: 'system',
          content: `Eres un auditor de conversión comercial multi-nicho para CRM Synqo.
Analiza una muestra real de conversaciones de la empresa "${org.name || 'Negocio'}" comparando las que SÍ convirtieron frente a las que quedaron en duda, tibias o perdidas, junto con los vacíos reales preguntados por clientes y el prompt actual del negocio.

REGLAS ESTRICTAS:
1. Sé 100% específico al rubro real de esta empresa (sin asumir otros nichos).
2. Basa cada tip y cada mejora únicamente en evidencia real de las conversaciones y vacíos (lo que realmente se necesita, no suposiciones genéricas).
3. Detecta también si la IA desobedeció o duplicó algo respecto a las reglas del prompt actual, o si falta una regla operativa/de cierre que ayude a convertir mejor.
4. En "proposals", sugiere máximo 3 ajustes quirúrgicos y no destructivos (nunca inventes precios ni borres catálogo existente).
5. Responde ÚNICAMENTE JSON válido con esta estructura exacta:
{
  "summaryHeadline": "Resumen en 1 frase clara de lo observado hoy",
  "dailyTips": ["Tip concreto 1...", "Tip concreto 2..."],
  "detectedNeeds": [
    { "topic": "Tema real faltante o fricción", "evidence": "Evidencia breve vista en chats", "impact": "high" | "medium" }
  ],
  "proposals": [
    {
      "sectionId": "empresa|catalogo|pagos|envios|politicas|faq|tono|cierre|relevo|seguimiento|adicional",
      "sectionTitle": "Título exacto de sección",
      "currentText": "Texto actual o 'No especificado'",
      "proposedText": "Texto ejecutable listo para pegar en esa sección dirigido al bot (PROHIBIDO escribir consejos como 'Es recomendable...' o 'Deberías...'; esos van en dailyTips)",
      "reason": "Por qué mejora ventas según las conversaciones analizadas",
      "evidence": "Ejemplo breve de lo observado"
    }
  ]
}`,
        },
        {
          role: 'user',
          content: [
            `MÉTRICAS DEL EMBUDO (últimos 14d): convertidos=${sample.categoryStats.converted}, en_duda=${sample.categoryStats.inDoubt}, tibios=${sample.categoryStats.stalledWarm}, perdidos=${sample.categoryStats.lost}, relevos=${sample.categoryStats.pendingHandoffs}`,
            `\nVACÍOS REALES DETECTADOS:\n${gapsSummary}`,
            `\nEXTRACTOS DE PROMPT ACTUAL:\n${promptBody.slice(0, 1800)}`,
            `\nMUESTRA COMPACTA DE CONVERSACIONES:\n${compactedThreads}`,
          ].join('\n'),
        },
      ],
      temperature: 0.2,
      maxTokens: 650,
      chainOverride: getAiUtilityChain(),
      aiProvider: org.ai_provider || undefined,
      organizationId: org.id,
      skipQuotaDeduction: true,
      responseFormat: { type: 'json_object' },
    });

    try {
      await (supabaseAdmin.from('ai_runs') as any).insert({
        organization_id: org.id,
        contact_id: null,
        channel: 'prompt_assistant',
        provider: llmRes.provider,
        model: llmRes.modelUsed,
        prompt_tokens: llmRes.promptTokens,
        completion_tokens: llmRes.completionTokens,
        total_tokens: llmRes.totalTokens,
        latency_ms: llmRes.latencyMs,
        status: 'success',
      });
    } catch {}

    state = recordAssistantUsageInState(
      state,
      llmRes.totalTokens,
      PROMPT_ASSISTANT_CONFIG.dailyTokenCap
    );

    let summaryHeadline = 'Análisis diario completado sobre conversaciones recientes.';
    let dailyTips: string[] = [];
    let detectedNeeds: DailyConversationNeed[] = [];
    let auditProposals: PendingSectionProposal[] = [];

    try {
      const parsed = JSON.parse(stripJsonFence(llmRes.response.choices[0]?.message?.content || '{}'));
      if (typeof parsed.summaryHeadline === 'string' && parsed.summaryHeadline.trim()) {
        summaryHeadline = parsed.summaryHeadline.trim().slice(0, 220);
      }
      if (Array.isArray(parsed.dailyTips)) {
        dailyTips = parsed.dailyTips
          .map((t: any) => String(t || '').trim())
          .filter(Boolean)
          .slice(0, 4);
      }
      if (Array.isArray(parsed.detectedNeeds)) {
        detectedNeeds = parsed.detectedNeeds
          .filter((n: any) => n?.topic && n?.evidence)
          .slice(0, 4)
          .map((n: any) => ({
            topic: String(n.topic).trim().slice(0, 100),
            evidence: String(n.evidence).trim().slice(0, 180),
            impact: n.impact === 'high' ? 'high' : 'medium',
          }));
      }
      if (Array.isArray(parsed.proposals)) {
        const cleanProps: PendingSectionProposal[] = [];
        for (const [idx, p] of parsed.proposals.entries()) {
          if (!p?.sectionId || !p?.proposedText) continue;
          const propText = String(p.proposedText).trim();
          if (isMetaPromptCommentary(propText)) {
            if (dailyTips.length < 4) dailyTips.push(propText);
            continue;
          }
          cleanProps.push({
            id: `audit-${Date.now()}-${idx}`,
            sectionId: String(p.sectionId),
            sectionTitle:
              PROMPT_SECTIONS.find((s) => s.id === p.sectionId)?.title ||
              String(p.sectionTitle || p.sectionId),
            currentText: String(p.currentText || 'No especificado').slice(0, 300),
            proposedText: propText,
            reason: String(p.reason || 'Mejora detectada en conversaciones reales').slice(0, 160),
            source: 'daily_audit' as const,
            evidence: p.evidence ? String(p.evidence).trim().slice(0, 160) : undefined,
          });
          if (cleanProps.length >= 3) break;
        }
        auditProposals = cleanProps;
      }
    } catch {}

    const insights: DailyConversationInsights = {
      lastAuditDay: todayBogota,
      lastAuditAt: new Date().toISOString(),
      sampleFingerprint: fingerprint,
      analyzedCount: sample.allSampled.length,
      categoryStats: sample.categoryStats,
      summaryHeadline,
      dailyTips,
      detectedNeeds,
    };

    state.dailyInsights = insights;
    // Conservar propuestas manuales/improve previas y reemplazar únicamente las anteriores de daily_audit
    const existingManualProposals = (state.pendingProposals || []).filter(
      (p) => p.source !== 'daily_audit'
    );
    state.pendingProposals = [...auditProposals, ...existingManualProposals].slice(0, 8);

    const { data: freshOrg } = await (supabaseAdmin.from('organizations') as any)
      .select('structured_prompt_data')
      .eq('id', org.id)
      .single();

    const mergedStructured =
      freshOrg?.structured_prompt_data && typeof freshOrg.structured_prompt_data === 'object'
        ? { ...freshOrg.structured_prompt_data, assistant: state }
        : { ...structured, assistant: state };

    await (supabaseAdmin.from('organizations') as any)
      .update({
        structured_prompt_data: mergedStructured,
        updated_at: new Date().toISOString(),
      })
      .eq('id', org.id);

    return {
      ranAi: true,
      insights,
      newProposalsCount: auditProposals.length,
    };
  }

  /**
   * Procesamiento pasivo y autónomo desde el Cron diario para organizaciones activas.
   * Limitado por lote (maxOrgs) y con deduplicación diaria + fingerprint para minimizar consumo.
   */
  static async runPassiveDailyAuditsForActiveOrgs(
    targetOrgId?: string,
    maxOrgs = 8
  ): Promise<{ auditedOrgs: number; skippedOrgs: number }> {
    let query = (supabaseAdmin.from('organizations') as any)
      .select('id, name, system_prompt, structured_prompt_data, ai_provider')
      .neq('is_active', false)
      .not('system_prompt', 'is', null);

    if (targetOrgId) {
      query = query.eq('id', targetOrgId);
    }

    const { data: orgs } = await query.limit(40);
    const list: any[] = Array.isArray(orgs) ? orgs : [];
    const todayBogota = getAssistantDayKey();

    let auditedOrgs = 0;
    let skippedOrgs = 0;

    for (const org of list) {
      if (auditedOrgs >= maxOrgs) break;
      const state = normalizeAssistantState(org?.structured_prompt_data?.assistant, 'improve');
      if (state.dailyInsights?.lastAuditDay === todayBogota) {
        skippedOrgs++;
        continue;
      }

      try {
        const res = await this.runAuditForOrganization({ org, force: false });
        if (res.ranAi) auditedOrgs++;
        else skippedOrgs++;
      } catch (err: any) {
        skippedOrgs++;
        console.warn(`[PASSIVE CONVERSATION AUDIT WARN] org=${org.id}:`, err?.message || err);
      }
    }

    return { auditedOrgs, skippedOrgs };
  }
}
