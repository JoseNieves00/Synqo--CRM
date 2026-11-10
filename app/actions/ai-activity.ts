'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUserAndOrg } from '@/app/actions/auth';

export interface AiActivityItem {
  id: string;
  contactId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  channel: string;
  provider: string;
  model: string;
  status: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  errorMessage: string | null;
  createdAt: string;
}

export interface AiActivityStats {
  totalRunsToday: number;
  successRate: number;
  avgLatencyMs: number;
  totalTokensToday: number;
  fallbackCount: number;
}

export async function getRecentAiActivity(limit = 20): Promise<{
  items: AiActivityItem[];
  stats: AiActivityStats;
}> {
  const current = await getCurrentUserAndOrg();
  if (!current) return { items: [], stats: { totalRunsToday: 0, successRate: 100, avgLatencyMs: 0, totalTokensToday: 0, fallbackCount: 0 } };

  const orgId = current.organization.id;

  // Últimas N ejecuciones con nombre del contacto (JOIN)
  const { data: runs } = await (supabaseAdmin.from('ai_runs') as any)
    .select(`
      id, contact_id, channel, provider, model, status,
      prompt_tokens, completion_tokens, total_tokens,
      latency_ms, error_message, created_at
    `)
    .eq('organization_id', orgId)
    .neq('channel', 'prompt_assistant')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!runs || runs.length === 0) {
    return { items: [], stats: { totalRunsToday: 0, successRate: 100, avgLatencyMs: 0, totalTokensToday: 0, fallbackCount: 0 } };
  }

  // Obtener nombres de contactos únicos
  const contactIds = Array.from(new Set(runs.map((r: any) => r.contact_id).filter(Boolean))) as string[];
  const contactMap: Record<string, { name: string; phone: string }> = {};

  if (contactIds.length > 0) {
    const { data: contacts } = await (supabaseAdmin.from('contacts') as any)
      .select('id, name, phone')
      .in('id', contactIds);
    if (contacts) {
      for (const c of contacts) {
        contactMap[c.id] = { name: c.name, phone: c.phone };
      }
    }
  }

  // Stats del día de hoy
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: todayRuns } = await (supabaseAdmin.from('ai_runs') as any)
    .select('status, total_tokens, latency_ms')
    .eq('organization_id', orgId)
    .neq('channel', 'prompt_assistant')
    .gte('created_at', startOfDay.toISOString());

  const stats: AiActivityStats = {
    totalRunsToday: todayRuns?.length ?? 0,
    successRate: 100,
    avgLatencyMs: 0,
    totalTokensToday: 0,
    fallbackCount: 0,
  };

  if (todayRuns && todayRuns.length > 0) {
    const successful = todayRuns.filter((r: any) => r.status === 'success' || r.status === 'fallback').length;
    const fallbacks = todayRuns.filter((r: any) => r.status === 'fallback').length;
    const totalTokens = todayRuns.reduce((acc: number, r: any) => acc + (r.total_tokens ?? 0), 0);
    const avgLatency = todayRuns.reduce((acc: number, r: any) => acc + (r.latency_ms ?? 0), 0) / todayRuns.length;

    stats.successRate = Math.round((successful / todayRuns.length) * 100);
    stats.avgLatencyMs = Math.round(avgLatency);
    stats.totalTokensToday = totalTokens;
    stats.fallbackCount = fallbacks;
  }

  const items: AiActivityItem[] = (runs || []).map((r: any) => ({
    id: r.id,
    contactId: r.contact_id,
    contactName: r.contact_id ? (contactMap[r.contact_id]?.name ?? null) : null,
    contactPhone: r.contact_id ? (contactMap[r.contact_id]?.phone ?? null) : null,
    channel: r.channel,
    provider: r.provider,
    model: r.model,
    status: r.status,
    promptTokens: r.prompt_tokens ?? 0,
    completionTokens: r.completion_tokens ?? 0,
    totalTokens: r.total_tokens ?? 0,
    latencyMs: r.latency_ms ?? 0,
    errorMessage: r.error_message,
    createdAt: r.created_at,
  }));

  return { items, stats };
}

