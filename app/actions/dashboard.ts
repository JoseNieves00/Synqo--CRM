'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { calculateTurnCostUsd, AI_OPERATIONAL_CONFIG } from '@/lib/ai/config';
import { resolveLeadTemperature } from '@/lib/ai/follow-up-types';

export type DashboardPeriod = 'today' | '7d' | 'month';

export interface ModelCostBreakdown {
  provider: string;
  model: string;
  runs: number;
  failedRuns: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface DashboardMetrics {
  period: DashboardPeriod;
  periodLabel: string;
  timezone: string;
  sinceIso: string;

  // Negocio & Embudo
  isCalendarBusiness?: boolean;
  totalContacts: number;
  newLeadsInPeriod: number;
  wonInPeriod: number;
  salesRevenueInPeriod: number;
  avgTicketUsdOrCop: number;
  conversionRatePct: number; // ganados del periodo / leads nuevos del periodo
  bookedAppointmentsTotal: number;
  unassignedCount: number;
  needsHumanCount: number;
  needsHumanLeads: Array<{
    id: string;
    name: string | null;
    phone: string | null;
    channel: string | null;
    pipeline_stage: string | null;
    last_interaction_at: string | null;
    reason: string;
  }>;
  aiActiveCount: number;
  funnelCounts: Record<'nuevo' | 'calificado' | 'cita_agendada' | 'ganado' | 'perdido', number>;

  // Categorización IA (calificados listos vs con dudas vs tibios vs fríos)
  categories: {
    hot: number;            // Calificados · Listo (quiere comprar/agendar)
    qualifiedDoubt: number; // Calificados · Con dudas puntuales
    warm: number;           // Tibios / evaluando
    cold: number;           // Fríos / sin interés
    buyers: number;         // Cierres / Compradores (ganado o con pedido)
    unclassified: number;
    movementsInPeriod: number;
  };
  lostReasons: Array<{ reason: string; count: number }>;

  // Seguimientos
  followUp: {
    sentInPeriod: number;
    repliedAfterFollowUp: number;
    responseRatePct: number;
    recoveredSalesCount: number;
    skippedNoTemplateCount: number;
    activeScheduledCount: number;
  };

  // Desempeño de IA vs Humano & Latencia
  aiPerformance: {
    autonomyPct: number;
    autonomousConversations: number;
    totalActiveConversationsInPeriod: number;
    aiWonSalesCount: number;
    humanWonSalesCount: number;
    aiWonRevenue: number;
    humanWonRevenue: number;
    p50LatencyMs: number;
    p90LatencyMs: number;
    handoffReasons: Array<{ reason: string; count: number }>;
  };

  // Consumo de Tokens IA (y trazabilidad interna)
  costs: {
    totalCostUsd: number;
    costPerConversationUsd: number;
    costPerSaleUsd: number;
    totalTokensPeriod: number;
    tokensPerConversation: number;
    tokensPerSale: number;
    totalRunsPeriod: number;
    byModel: ModelCostBreakdown[];
  };
}

/**
 * Calcula el inicio del periodo ('today' | '7d' | 'month') en la zona horaria del tenant.
 */
function computePeriodStartIso(period: DashboardPeriod, timeZone: string): string {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);

    const year = Number(parts.find((p) => p.type === 'year')?.value || now.getUTCFullYear());
    const month = Number(parts.find((p) => p.type === 'month')?.value || now.getUTCMonth() + 1);
    const day = Number(parts.find((p) => p.type === 'day')?.value || now.getUTCDate());

    // Calcular offset aproximado entre TZ del tenant y UTC usando Intl
    const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = now.toLocaleString('en-US', { timeZone });
    const offsetMs = new Date(utcStr).getTime() - new Date(tzStr).getTime();

    let startLocalMidnightUtc: number;
    if (period === 'today') {
      startLocalMidnightUtc = Date.UTC(year, month - 1, day, 0, 0, 0) + offsetMs;
    } else if (period === '7d') {
      startLocalMidnightUtc = Date.UTC(year, month - 1, day, 0, 0, 0) + offsetMs - 6 * 24 * 3600 * 1000;
    } else {
      startLocalMidnightUtc = Date.UTC(year, month - 1, 1, 0, 0, 0) + offsetMs;
    }

    return new Date(startLocalMidnightUtc).toISOString();
  } catch {
    const fallbackMs =
      period === 'today' ? 24 * 3600 * 1000 : period === '7d' ? 7 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
    return new Date(Date.now() - fallbackMs).toISOString();
  }
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1));
  return Math.round(sortedAsc[idx]);
}

/**
 * Calcula métricas reales del Dashboard para una organización y periodo dados.
 * Acepta `organizationIdOverride` para pruebas automatizadas de auditoría vs SQL manual.
 */
export async function getDashboardMetrics(
  period: DashboardPeriod = 'month',
  organizationIdOverride?: string
): Promise<DashboardMetrics | null> {
  let orgId = organizationIdOverride;
  let tz = AI_OPERATIONAL_CONFIG.defaultTimezone;

  if (!orgId) {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) return null;

    const { data: profile } = await (supabaseAdmin.from('profiles') as any)
      .select('organization_id')
      .eq('id', user.id)
      .single();
    if (!profile?.organization_id) return null;
    orgId = profile.organization_id;
  }

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('id, appointment_settings, business_hours, enabled_modules')
    .eq('id', orgId)
    .single();

  const isCalendarBusiness = Boolean(org?.enabled_modules?.native_calendar);

  if (org) {
    tz =
      org.appointment_settings?.timezone ||
      org.business_hours?.timezone ||
      AI_OPERATIONAL_CONFIG.defaultTimezone;
  }

  const sinceIso = computePeriodStartIso(period, tz);
  const periodLabel = period === 'today' ? 'Hoy' : period === '7d' ? 'Últimos 7 días' : 'Este mes';

  // Consultar todos los contactos activos de la organización y las ejecuciones de ai_runs del periodo
  const [contactsRes, runsRes] = await Promise.all([
    (supabaseAdmin.from('contacts') as any)
      .select(
        'id, name, phone, channel, pipeline_stage, is_ai_active, assigned_to, conversation_status, waiting_since, last_message_sender, deal_value, closed_at, close_reason, created_at, updated_at, last_interaction_at, custom_fields'
      )
      .eq('organization_id', orgId)
      .is('deleted_at', null),
    (supabaseAdmin.from('ai_runs') as any)
      .select('id, contact_id, channel, provider, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, status, created_at')
      .eq('organization_id', orgId)
      .neq('channel', 'prompt_assistant')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(5000),
  ]);

  const contacts: any[] = contactsRes.data || [];
  const runs: any[] = runsRes.data || [];

  const funnelCounts: Record<'nuevo' | 'calificado' | 'cita_agendada' | 'ganado' | 'perdido', number> = {
    nuevo: 0,
    calificado: 0,
    cita_agendada: 0,
    ganado: 0,
    perdido: 0,
  };

  let unassignedCount = 0;
  let aiActiveCount = 0;
  let newLeadsInPeriod = 0;
  let wonInPeriod = 0;
  let salesRevenueInPeriod = 0;
  const needsHumanLeads: DashboardMetrics['needsHumanLeads'] = [];
  const staleWaitingCutoffMs = Date.now() - 5 * 60 * 1000;

  let hot = 0;
  let qualifiedDoubt = 0;
  let warm = 0;
  let cold = 0;
  let buyers = 0;
  let unclassified = 0;
  let skippedNoTemplateCount = 0;
  let activeScheduledCount = 0;
  let aiWonSalesCount = 0;
  let humanWonSalesCount = 0;
  let aiWonRevenue = 0;
  let humanWonRevenue = 0;

  const lostReasonMap = new Map<string, number>();
  const contactIdsActiveInPeriod = new Set<string>();
  const contactMap = new Map<string, any>();

  for (const c of contacts) {
    contactMap.set(c.id, c);
    const stage = (c.pipeline_stage || 'nuevo') as keyof typeof funnelCounts;
    if (stage in funnelCounts) funnelCounts[stage]++;
    if (!c.assigned_to) unassignedCount++;
    if (c.is_ai_active) aiActiveCount++;

    const cf = (c.custom_fields as Record<string, any>) || {};
    const temp = resolveLeadTemperature(cf);

    // Detectar únicamente conversaciones que realmente esperan intervención humana (nunca chats ya respondidos por la IA)
    const isClosed = c.conversation_status === 'closed' || stage === 'ganado' || stage === 'perdido';
    if (!isClosed) {
      let humanReason: string | null = null;
      if (cf.unattended_handoff === true) {
        humanReason = 'Relevo IA / Validación humana';
      } else if (!c.is_ai_active && (c.last_message_sender === 'lead' || Boolean(c.waiting_since))) {
        humanReason = 'IA pausada · esperando respuesta';
      } else if (
        c.is_ai_active &&
        c.last_message_sender === 'lead' &&
        c.waiting_since &&
        new Date(c.waiting_since).getTime() <= staleWaitingCutoffMs
      ) {
        humanReason = 'Cliente esperando respuesta (>5 min)';
      }

      if (humanReason) {
        needsHumanLeads.push({
          id: c.id,
          name: c.name || null,
          phone: c.phone || null,
          channel: c.channel || null,
          pipeline_stage: stage,
          last_interaction_at: c.last_interaction_at || null,
          reason: humanReason,
        });
      }
    }

    const isBuyer = stage === 'ganado' || Boolean(cf.order);
    if (isBuyer) buyers++;

    if (temp === 'hot') hot++;
    else if (temp === 'qualified_doubt') qualifiedDoubt++;
    else if (temp === 'warm') warm++;
    else if (temp === 'cold') cold++;
    else unclassified++;

    if (cf.follow_up_last_skipped === 'meta_outside_24h_no_template') {
      skippedNoTemplateCount++;
    }
    if (cf.active_reminder?.scheduledFor || (cf.follow_up?.nextSendAt && !cf.follow_up?.paused && !cf.follow_up?.completed)) {
      activeScheduledCount++;
    }

    if (c.created_at && c.created_at >= sinceIso) {
      newLeadsInPeriod++;
    }
    if (c.last_interaction_at && c.last_interaction_at >= sinceIso) {
      contactIdsActiveInPeriod.add(c.id);
    }

    const dealVal = Number(c.deal_value ?? cf.deal_value ?? cf.order?.total ?? 0) || 0;
    const closedTime = c.closed_at || cf.closed_at || c.updated_at;

    if (stage === 'ganado' && closedTime && closedTime >= sinceIso) {
      wonInPeriod++;
      salesRevenueInPeriod += dealVal;

      const isAiSale = c.close_reason === 'venta_ia' || cf.order?.created_by === 'ai';
      if (isAiSale) {
        aiWonSalesCount++;
        aiWonRevenue += dealVal;
      } else {
        humanWonSalesCount++;
        humanWonRevenue += dealVal;
      }
    }

    if (stage === 'perdido' && (!closedTime || closedTime >= sinceIso)) {
      const reason = String(cf.lost_reason || c.close_reason || 'Sin especificar').trim();
      lostReasonMap.set(reason, (lostReasonMap.get(reason) || 0) + 1);
    }
  }

  // Consultar mensajes del periodo solo para los contactos de esta org (en bloques para cubrir chats con o sin organization_id en messages)
  const allContactIds = contacts.map((c) => c.id);
  const periodMessages: any[] = [];
  const CHUNK_SIZE = 150;
  for (let i = 0; i < allContactIds.length; i += CHUNK_SIZE) {
    const chunk = allContactIds.slice(i, i + CHUNK_SIZE);
    const { data: msgs } = await (supabaseAdmin.from('messages') as any)
      .select('contact_id, sender_type, content, created_at')
      .in('contact_id', chunk)
      .gte('created_at', sinceIso)
      .in('sender_type', ['lead', 'ai', 'agent_manual', 'system'])
      .limit(4000);
    if (msgs) periodMessages.push(...msgs);
  }

  let categoryMovementsInPeriod = 0;
  let followUpSentInPeriod = 0;
  const followUpContactTimes = new Map<string, number>();
  const followUpRepliedContacts = new Set<string>();
  const humanIntervenedContacts = new Set<string>();
  const handoffReasonMap = new Map<string, number>();

  // Ordenar cronológicamente para detectar respuestas posteriores a seguimientos
  periodMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  for (const m of periodMessages) {
    contactIdsActiveInPeriod.add(m.contact_id);
    const content = String(m.content || '');
    const ts = new Date(m.created_at).getTime();

    if (m.sender_type === 'agent_manual') {
      humanIntervenedContacts.add(m.contact_id);
    } else if (m.sender_type === 'ai') {
      if (
        content.includes('[Seguimiento ') ||
        content.includes('[Reactivación Autónoma')
      ) {
        followUpSentInPeriod++;
        if (!followUpContactTimes.has(m.contact_id)) {
          followUpContactTimes.set(m.contact_id, ts);
        }
      }
    } else if (m.sender_type === 'lead') {
      const firstFollowUpTs = followUpContactTimes.get(m.contact_id);
      if (firstFollowUpTs && ts > firstFollowUpTs) {
        followUpRepliedContacts.add(m.contact_id);
      }
    } else if (m.sender_type === 'system') {
      if (content.includes('Categoría actualizada')) {
        categoryMovementsInPeriod++;
      }
      if (content.includes('Relevo') || content.includes('Comprobante de pago')) {
        humanIntervenedContacts.add(m.contact_id);
        const match = content.match(/Motivo:\s*"([^"]+)"/i);
        const reason = match?.[1]?.trim() || (content.includes('Comprobante') ? 'Comprobante de pago' : 'Solicitud comercial / asesor');
        handoffReasonMap.set(reason, (handoffReasonMap.get(reason) || 0) + 1);
      }
    }
  }

  let recoveredSalesCount = 0;
  for (const cId of Array.from(followUpContactTimes.keys())) {
    const c = contactMap.get(cId);
    if (c?.pipeline_stage === 'ganado') recoveredSalesCount++;
  }

  // Costos y Latencias desde ai_runs
  const modelMap = new Map<string, ModelCostBreakdown>();
  const latencies: number[] = [];
  let totalCostUsd = 0;
  let totalTokensPeriod = 0;
  const runContacts = new Set<string>();

  for (const r of runs) {
    if (r.contact_id) runContacts.add(r.contact_id);
    const key = `${r.provider || 'unknown'}:${r.model || 'unknown'}`;
    if (!modelMap.has(key)) {
      modelMap.set(key, {
        provider: r.provider || 'unknown',
        model: r.model || 'unknown',
        runs: 0,
        failedRuns: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costUsd: 0,
      });
    }
    const bucket = modelMap.get(key)!;
    bucket.runs++;
    if (r.status === 'failed' || r.status === 'error') {
      bucket.failedRuns++;
    } else {
      const pt = Number(r.prompt_tokens || 0);
      const ct = Number(r.completion_tokens || 0);
      const tt = Number(r.total_tokens || pt + ct);
      const cost = calculateTurnCostUsd({
        model: r.model,
        promptTokens: pt,
        completionTokens: ct,
      });
      bucket.promptTokens += pt;
      bucket.completionTokens += ct;
      bucket.totalTokens += tt;
      bucket.costUsd += cost;
      totalCostUsd += cost;
      totalTokensPeriod += tt;
      if (typeof r.latency_ms === 'number' && r.latency_ms > 0) {
        latencies.push(r.latency_ms);
      }
    }
  }

  latencies.sort((a, b) => a - b);

  const totalConversationsPeriod = Math.max(contactIdsActiveInPeriod.size, runContacts.size);
  const autonomousConversations = Array.from(contactIdsActiveInPeriod).filter(
    (id) => !humanIntervenedContacts.has(id)
  ).length;
  const autonomyPct =
    contactIdsActiveInPeriod.size > 0
      ? Math.round((autonomousConversations / contactIdsActiveInPeriod.size) * 100)
      : 100;

  const conversionRatePct =
    newLeadsInPeriod > 0 ? Number(((wonInPeriod / newLeadsInPeriod) * 100).toFixed(1)) : 0;

  const avgTicket = wonInPeriod > 0 ? Math.round(salesRevenueInPeriod / wonInPeriod) : 0;
  const uniqueFollowUpContacts = followUpContactTimes.size;
  const responseRatePct =
    uniqueFollowUpContacts > 0
      ? Math.round((followUpRepliedContacts.size / uniqueFollowUpContacts) * 100)
      : 0;

  needsHumanLeads.sort(
    (a, b) =>
      new Date(b.last_interaction_at || 0).getTime() -
      new Date(a.last_interaction_at || 0).getTime()
  );

  return {
    period,
    periodLabel,
    timezone: tz,
    sinceIso,
    isCalendarBusiness,
    totalContacts: contacts.length,
    newLeadsInPeriod,
    wonInPeriod,
    salesRevenueInPeriod,
    avgTicketUsdOrCop: avgTicket,
    conversionRatePct,
    bookedAppointmentsTotal: funnelCounts.cita_agendada,
    unassignedCount,
    needsHumanCount: needsHumanLeads.length,
    needsHumanLeads: needsHumanLeads.slice(0, 6),
    aiActiveCount,
    funnelCounts,
    categories: {
      hot,
      qualifiedDoubt,
      warm,
      cold,
      buyers,
      unclassified,
      movementsInPeriod: categoryMovementsInPeriod,
    },
    lostReasons: Array.from(lostReasonMap.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    followUp: {
      sentInPeriod: followUpSentInPeriod,
      repliedAfterFollowUp: followUpRepliedContacts.size,
      responseRatePct,
      recoveredSalesCount,
      skippedNoTemplateCount,
      activeScheduledCount,
    },
    aiPerformance: {
      autonomyPct,
      autonomousConversations,
      totalActiveConversationsInPeriod: contactIdsActiveInPeriod.size,
      aiWonSalesCount,
      humanWonSalesCount,
      aiWonRevenue,
      humanWonRevenue,
      p50LatencyMs: percentile(latencies, 50),
      p90LatencyMs: percentile(latencies, 90),
      handoffReasons: Array.from(handoffReasonMap.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    },
    costs: {
      totalCostUsd,
      costPerConversationUsd: totalConversationsPeriod > 0 ? totalCostUsd / totalConversationsPeriod : 0,
      costPerSaleUsd: wonInPeriod > 0 ? totalCostUsd / wonInPeriod : 0,
      totalTokensPeriod,
      tokensPerConversation: totalConversationsPeriod > 0 ? Math.round(totalTokensPeriod / totalConversationsPeriod) : 0,
      tokensPerSale: wonInPeriod > 0 ? Math.round(totalTokensPeriod / wonInPeriod) : 0,
      totalRunsPeriod: runs.length,
      byModel: Array.from(modelMap.values()).sort((a, b) => b.totalTokens - a.totalTokens),
    },
  };
}
