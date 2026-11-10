import type { IndustryPreset } from '@/lib/ai/prompt-compiler';
import { PROMPT_ASSISTANT_CONFIG } from '@/lib/ai/config';
import { PROMPT_BLUEPRINT_SLOTS, type BlueprintSlot } from './blueprint';

export type AssistantMode = 'new' | 'improve';
export type SectionCompletionStatus = 'pending' | 'partial' | 'complete' | 'skipped';

export interface PendingSectionProposal {
  id: string;
  sectionId: string;
  sectionTitle: string;
  currentText: string;
  proposedText: string;
  reason: string;
  isConflict?: boolean;
  source?: 'improve' | 'daily_audit';
  evidence?: string;
}

export interface DailyConversationNeed {
  topic: string;
  evidence: string;
  impact: 'high' | 'medium';
}

export interface DailyConversationInsights {
  lastAuditDay: string;
  lastAuditAt: string;
  sampleFingerprint: string;
  analyzedCount: number;
  categoryStats: {
    converted: number;
    inDoubt: number;
    stalledWarm: number;
    lost: number;
    pendingHandoffs: number;
  };
  summaryHeadline: string;
  dailyTips: string[];
  detectedNeeds: DailyConversationNeed[];
}

export interface AssistantDailyUsageBucket {
  tokens: number;
  calls: number;
  capExceeded?: boolean;
  lastUpdatedAt?: string;
}

export interface PromptAssistantState {
  mode: AssistantMode;
  slots: Record<string, any>;
  sectionStatus: Record<string, SectionCompletionStatus>;
  analyzedPromptHash: string | null;
  pendingProposals: PendingSectionProposal[];
  usageByDay: Record<string, AssistantDailyUsageBucket>;
  totalAssistantTokens: number;
  lastActiveSlotId?: string | null;
  sandboxTestedAt?: string | null;
  dailyInsights?: DailyConversationInsights | null;
}

export function createEmptyAssistantState(mode: AssistantMode = 'new'): PromptAssistantState {
  return {
    mode,
    slots: {},
    sectionStatus: {},
    analyzedPromptHash: null,
    pendingProposals: [],
    usageByDay: {},
    totalAssistantTokens: 0,
    lastActiveSlotId: null,
    sandboxTestedAt: null,
    dailyInsights: null,
  };
}

export function normalizeAssistantState(raw: any, fallbackMode: AssistantMode = 'new'): PromptAssistantState {
  if (!raw || typeof raw !== 'object') {
    return createEmptyAssistantState(fallbackMode);
  }
  return {
    mode: raw.mode === 'improve' || raw.mode === 'new' ? raw.mode : fallbackMode,
    slots: raw.slots && typeof raw.slots === 'object' ? { ...raw.slots } : {},
    sectionStatus:
      raw.sectionStatus && typeof raw.sectionStatus === 'object' ? { ...raw.sectionStatus } : {},
    analyzedPromptHash: typeof raw.analyzedPromptHash === 'string' ? raw.analyzedPromptHash : null,
    pendingProposals: Array.isArray(raw.pendingProposals) ? raw.pendingProposals : [],
    usageByDay: raw.usageByDay && typeof raw.usageByDay === 'object' ? { ...raw.usageByDay } : {},
    totalAssistantTokens: Number(raw.totalAssistantTokens || 0),
    lastActiveSlotId: typeof raw.lastActiveSlotId === 'string' ? raw.lastActiveSlotId : null,
    sandboxTestedAt: typeof raw.sandboxTestedAt === 'string' ? raw.sandboxTestedAt : null,
    dailyInsights:
      raw.dailyInsights && typeof raw.dailyInsights === 'object' ? raw.dailyInsights : null,
  };
}

export function getAssistantDayKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(now);
}

export interface AssistantClientBudgetNotice {
  usagePct: number;
  showNotice: boolean;
  limitReached: boolean;
  limitScope: 'none' | 'daily' | 'weekly';
  resetHint: string;
}

export interface AssistantBudgetStatus extends AssistantClientBudgetNotice {
  dayKey: string;
  tokensToday: number;
  callsToday: number;
  dailyCap: number;
  tokensLast7Days: number;
  callsLast7Days: number;
  weeklyCap: number;
  auditLimitReached: boolean;
}

export function getAssistantBudgetStatus(
  state: PromptAssistantState,
  options?: {
    dailyCap?: number;
    weeklyCap?: number;
    auditReserveTokens?: number;
    warningPct?: number;
  },
  now: Date = new Date()
): AssistantBudgetStatus {
  const dailyCap = options?.dailyCap ?? PROMPT_ASSISTANT_CONFIG.dailyTokenCap;
  const weeklyCap = options?.weeklyCap ?? PROMPT_ASSISTANT_CONFIG.weeklyTokenCap;
  const auditReserve = options?.auditReserveTokens ?? PROMPT_ASSISTANT_CONFIG.weeklyAuditReserveTokens;
  const warningPct = options?.warningPct ?? PROMPT_ASSISTANT_CONFIG.clientWarningPct;

  const dayKey = getAssistantDayKey(now);
  const bucket = state.usageByDay?.[dayKey];
  const tokensToday = Number(bucket?.tokens || 0);
  const callsToday = Number(bucket?.calls || 0);

  // Ventana móvil de los últimos 7 días (hoy + 6 días previos) en America/Bogota
  const validDayKeys: string[] = [];
  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(now.getTime() - offset * 24 * 3600 * 1000);
    validDayKeys.push(getAssistantDayKey(d));
  }

  let tokensLast7Days = 0;
  let callsLast7Days = 0;
  let oldestUsedOffset: number | null = null;

  for (let idx = 0; idx < validDayKeys.length; idx++) {
    const k = validDayKeys[idx];
    const b = state.usageByDay?.[k];
    if (!b) continue;
    const t = Number(b.tokens || 0);
    tokensLast7Days += t;
    callsLast7Days += Number(b.calls || 0);
    if (t > 0 && oldestUsedOffset === null) {
      oldestUsedOffset = 6 - idx; // cuántos días atrás ocurrió el consumo más antiguo de la ventana
    }
  }

  const dailyExceeded = tokensToday >= dailyCap;
  const weeklyExceeded = tokensLast7Days >= weeklyCap;
  const limitReached = dailyExceeded || weeklyExceeded;
  const limitScope: 'none' | 'daily' | 'weekly' = weeklyExceeded
    ? 'weekly'
    : dailyExceeded
    ? 'daily'
    : 'none';

  const usagePct = Math.min(100, Math.round((tokensLast7Days / Math.max(1, weeklyCap)) * 100));
  const showNotice = usagePct >= warningPct || limitReached;

  const daysUntilRollover = oldestUsedOffset !== null ? Math.max(1, 7 - oldestUsedOffset) : 7;
  const resetHint =
    limitScope === 'daily'
      ? 'mañana'
      : daysUntilRollover === 1
      ? 'en 1 día'
      : `en ${daysUntilRollover} días`;

  return {
    dayKey,
    tokensToday,
    callsToday,
    dailyCap,
    tokensLast7Days,
    callsLast7Days,
    weeklyCap,
    usagePct,
    showNotice,
    limitReached,
    auditLimitReached: tokensLast7Days >= weeklyCap + auditReserve,
    limitScope,
    resetHint,
  };
}

export function toClientBudgetNotice(status: AssistantBudgetStatus): AssistantClientBudgetNotice {
  return {
    usagePct: status.usagePct,
    showNotice: status.showNotice,
    limitReached: status.limitReached,
    limitScope: status.limitScope,
    resetHint: status.resetHint,
  };
}

export function getAssistantDailyUsage(
  state: PromptAssistantState,
  dailyCap: number = PROMPT_ASSISTANT_CONFIG.dailyTokenCap,
  now: Date = new Date()
): { dayKey: string; tokensToday: number; callsToday: number; cap: number; limitReached: boolean } {
  const dayKey = getAssistantDayKey(now);
  const bucket = state.usageByDay?.[dayKey];
  const tokensToday = Number(bucket?.tokens || 0);
  const callsToday = Number(bucket?.calls || 0);
  return {
    dayKey,
    tokensToday,
    callsToday,
    cap: dailyCap,
    limitReached: tokensToday >= dailyCap,
  };
}

export function recordAssistantUsageInState(
  state: PromptAssistantState,
  tokensAdded: number,
  dailyCap: number = PROMPT_ASSISTANT_CONFIG.dailyTokenCap,
  now: Date = new Date()
): PromptAssistantState {
  const dayKey = getAssistantDayKey(now);
  const prev = state.usageByDay?.[dayKey] || { tokens: 0, calls: 0 };
  const nextTokens = Number(prev.tokens || 0) + Math.max(0, Math.round(tokensAdded));
  const nextCalls = Number(prev.calls || 0) + 1;

  // Mantener únicamente los últimos 35 días en JSONB
  const cutoff = new Date(now.getTime() - 35 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const prunedUsage: Record<string, AssistantDailyUsageBucket> = {};
  for (const [k, v] of Object.entries(state.usageByDay || {})) {
    if (k >= cutoff) prunedUsage[k] = v;
  }

  prunedUsage[dayKey] = {
    tokens: nextTokens,
    calls: nextCalls,
    capExceeded: nextTokens >= dailyCap,
    lastUpdatedAt: now.toISOString(),
  };

  return {
    ...state,
    usageByDay: prunedUsage,
    totalAssistantTokens: Number(state.totalAssistantTokens || 0) + Math.max(0, Math.round(tokensAdded)),
  };
}

export function isSlotApplicable(slot: BlueprintSlot, slots: Record<string, any>, preset?: IndustryPreset): boolean {
  if (!slot.condition) return true;
  return slot.condition(slots, preset);
}

export function getNextPendingSlot(
  state: PromptAssistantState,
  preset?: IndustryPreset
): BlueprintSlot | null {
  for (const slot of PROMPT_BLUEPRINT_SLOTS) {
    if (!isSlotApplicable(slot, state.slots, preset)) continue;
    const status = state.sectionStatus[slot.sectionId];
    if (status === 'complete' || status === 'skipped') continue;
    const val = state.slots[slot.id];
    const hasVal = Array.isArray(val) ? val.length > 0 : Boolean(val && String(val).trim());
    if (!hasVal) {
      return slot;
    }
  }
  return null;
}
