/**
 * Reglas canónicas y compartidas para ubicar conversaciones en las 5 bandejas del Inbox:
 * `por_responder`, `mis_abiertos`, `ia_atendiendo`, `seguimiento` y `cerrados`.
 *
 * Única fuente de verdad usada por el Store en tiempo real (`use-inbox-store.ts`),
 * pruebas automatizadas y alineada 1:1 con las consultas de `app/actions/chat.ts`.
 */

export const INBOX_STALE_AI_MS = 3 * 60 * 1000;

export type CanonicalInboxView =
  | 'por_responder'
  | 'mis_abiertos'
  | 'ia_atendiendo'
  | 'seguimiento'
  | 'cerrados';

function resolveLastSender(c: any): string | null {
  return (
    c?.last_message_sender ||
    c?.last_message?.sender_type ||
    c?.custom_fields?.last_message?.sender_type ||
    null
  );
}

/**
 * Un chat va a "Por responder" cuando NO está cerrado y requiere atención humana real:
 * 1) Tiene relevo humano explícito (`unattended_handoff === true`), O
 * 2) La IA está pausada (`is_ai_active === false`) y el cliente espera respuesta, O
 * 3) La IA está activa pero el último mensaje del lead lleva >3 min en espera sin respuesta.
 */
export function contactNeedsHumanResponse(c: any, nowMs: number = Date.now()): boolean {
  if (!c) return false;
  const status = c.conversation_status || c.custom_fields?.conversation_status || 'open';
  if (status === 'closed') return false;

  if (c.custom_fields?.unattended_handoff === true) return true;

  const sender = resolveLastSender(c);
  const hasWaiting = Boolean(c.waiting_since);
  const hasUnread = Number(c.unread_count || 0) > 0;
  const waitingCustomer = sender === 'lead' || sender === null || hasWaiting || hasUnread;

  if (!c.is_ai_active) {
    return waitingCustomer;
  }

  // Si la IA está activa, NO debe contaminar "Por responder" durante los segundos normales de respuesta,
  // pero SÍ aparecer si lleva >3 min atascado esperando.
  if (sender === 'lead' && c.waiting_since) {
    const waitingMs = new Date(c.waiting_since).getTime();
    if (Number.isFinite(waitingMs) && nowMs - waitingMs >= INBOX_STALE_AI_MS) {
      return true;
    }
  }

  return false;
}

export function contactIsAiAttending(c: any): boolean {
  if (!c) return false;
  const status = c.conversation_status || c.custom_fields?.conversation_status || 'open';
  if (status === 'closed') return false;
  if (c.custom_fields?.unattended_handoff === true) return false;
  return c.is_ai_active === true;
}

export function contactIsAssignedOpen(c: any, currentUserId?: string | null): boolean {
  if (!c || !currentUserId) return false;
  const status = c.conversation_status || c.custom_fields?.conversation_status || 'open';
  if (status === 'closed') return false;
  return c.assigned_to === currentUserId;
}

export function contactHasActiveReminder(c: any): boolean {
  const rem = c?.custom_fields?.active_reminder;
  if (!rem || typeof rem !== 'object') return false;
  return Boolean(rem.id || rem.scheduledFor || rem.reminderType);
}

export function contactHasPendingFollowUp(c: any): boolean {
  const fu = c?.custom_fields?.follow_up;
  if (!fu || typeof fu !== 'object' || fu.completed === true || fu.paused === true) return false;
  return Boolean(fu.nextSendAt);
}

export function contactNeedsFollowUp(c: any, nowMs: number = Date.now()): boolean {
  if (!c) return false;
  const status = c.conversation_status || c.custom_fields?.conversation_status || 'open';
  if (status === 'closed') return false;
  if (c.waiting_since) return false;
  if (['ganado', 'perdido', 'cita_agendada'].includes(c.pipeline_stage)) return false;

  if (c.ai_snooze_until || contactHasActiveReminder(c) || contactHasPendingFollowUp(c)) {
    return true;
  }

  const sender = resolveLastSender(c);
  if (sender === 'lead' || Number(c.unread_count || 0) > 0) return false;
  if (c.custom_fields?.reactivation_attempted) return false;

  if (!c.last_interaction_at) return false;
  const elapsedMs = nowMs - new Date(c.last_interaction_at).getTime();
  const hours = elapsedMs / (1000 * 3600);
  return Number.isFinite(hours) && hours >= 24 && hours <= 240;
}

export function contactIsClosed(c: any): boolean {
  if (!c) return false;
  const status = c.conversation_status || c.custom_fields?.conversation_status || 'open';
  return status === 'closed';
}

export function contactMatchesInboxView(
  c: any,
  view: CanonicalInboxView,
  currentUserId?: string | null,
  nowMs: number = Date.now()
): boolean {
  switch (view) {
    case 'por_responder':
      return contactNeedsHumanResponse(c, nowMs);
    case 'mis_abiertos':
      return contactIsAssignedOpen(c, currentUserId);
    case 'ia_atendiendo':
      return contactIsAiAttending(c);
    case 'seguimiento':
      return contactNeedsFollowUp(c, nowMs);
    case 'cerrados':
      return contactIsClosed(c);
    default:
      return false;
  }
}
