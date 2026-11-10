/**
 * Reglas canónicas y compartidas para ubicar conversaciones en las 5 bandejas del Inbox:
 * `por_responder`, `mis_abiertos`, `ia_atendiendo`, `seguimiento` y `cerrados`.
 *
 * Única fuente de verdad usada por el Store en tiempo real (`use-inbox-store.ts`),
 * pruebas automatizadas y alineada 1:1 con las consultas de `app/actions/chat.ts`.
 */

import { resolveLeadTemperature, resolveProductInterest } from '@/lib/ai/follow-up-types';

export const INBOX_STALE_AI_MS = 3 * 60 * 1000;

export type SeguimientoSubBucket = 'ventas_a_medias' | 'compromisos' | 'por_reactivar';

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

  const temp = c.custom_fields?.lead_temperature || c.custom_fields?.temperature;
  if (temp === 'cold') return false;

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

/**
 * Clasifica un contacto de la bandeja `seguimiento` en una sub-bandeja **mutuamente excluyente**:
 * 1) `compromisos`: tiene recordatorio explícito o snooze activo (`active_reminder` o `ai_snooze_until`).
 * 2) `ventas_a_medias`: intención comercial/cotización sin cerrar (`hot`, `qualified_doubt`, `calificado` o producto/monto cotizado).
 * 3) `compromisos` (secundario): secuencia programada `follow_up.nextSendAt` pendiente en leads sin cotización abierta.
 * 4) `por_reactivar`: chat en silencio >= 24h sin intento previo de reactivación.
 */
export function classifySeguimientoSubBucket(
  c: any,
  nowMs: number = Date.now()
): SeguimientoSubBucket | null {
  if (!c) return null;
  const temp = resolveLeadTemperature(c.custom_fields);
  if (temp === 'cold') return null;

  // 1. Recordatorios explícitos (IA o humano) y chats pospuestos (snooze)
  if (Boolean(c.ai_snooze_until) || contactHasActiveReminder(c)) {
    return 'compromisos';
  }

  // 2. Ventas a medias reales (calientes, calificados con dudas, etapa calificado o producto cotizado)
  const hasQuotedProduct = Boolean(resolveProductInterest(c.custom_fields, c.deal_value));
  if (
    temp === 'hot' ||
    temp === 'qualified_doubt' ||
    c.pipeline_stage === 'calificado' ||
    hasQuotedProduct
  ) {
    return 'ventas_a_medias';
  }

  // 3. Secuencia automática pendiente en prospectos sin venta a medias activa
  if (contactHasPendingFollowUp(c)) {
    return 'compromisos';
  }

  // 4. Chats generales en silencio >= 24h listos para reactivar
  const status = c.conversation_status || c.custom_fields?.conversation_status || 'open';
  const lastMs = c.last_interaction_at ? new Date(c.last_interaction_at).getTime() : NaN;
  if (
    !c.custom_fields?.reactivation_attempted &&
    status !== 'closed' &&
    Number.isFinite(lastMs) &&
    nowMs - lastMs >= 24 * 3600 * 1000
  ) {
    return 'por_reactivar';
  }

  return null;
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

/**
 * Extrae el timestamp en ms de la última interacción real del chat (estilo WhatsApp Web).
 * Si `last_interaction_at` es nulo (contacto sin mensajes reales), devuelve 0 para ubicarlo al final
 * igual que PostgreSQL `ORDER BY last_interaction_at DESC NULLS LAST`.
 */
export function getContactInteractionTimestamp(c: any): number {
  if (!c || !c.last_interaction_at) return 0;
  const ms = new Date(c.last_interaction_at).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Comparador canónico estilo WhatsApp Web para ordenar conversaciones de una bandeja:
 * - `por_responder`: Prioridad SLA (el cliente que más tiempo lleva esperando arriba, ascendente).
 * - `ia_atendiendo`, `mis_abiertos`, `seguimiento`, `cerrados`: Orden cronológico estricto por
 *   última interacción real (`last_interaction_at` DESC), de más reciente a más antiguo.
 */
export function compareInboxContacts(a: any, b: any, view: CanonicalInboxView): number {
  const aTime = getContactInteractionTimestamp(a);
  const bTime = getContactInteractionTimestamp(b);

  if (view === 'por_responder') {
    const aWait = a?.waiting_since ? new Date(a.waiting_since).getTime() : aTime;
    const bWait = b?.waiting_since ? new Date(b.waiting_since).getTime() : bTime;
    const safeAW = Number.isFinite(aWait) ? aWait : aTime;
    const safeBW = Number.isFinite(bWait) ? bWait : bTime;
    if (safeAW !== safeBW) return safeAW - safeBW;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  }

  // WhatsApp Web standard: mensaje/interacción más reciente arriba (DESC)
  if (bTime !== aTime) return bTime - aTime;

  const aUpd = a?.updated_at ? new Date(a.updated_at).getTime() : 0;
  const bUpd = b?.updated_at ? new Date(b.updated_at).getTime() : 0;
  if (bUpd !== aUpd) return bUpd - aUpd;

  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

/**
 * Deduplica y ordena una lista de IDs usando el comparador canónico de la bandeja.
 */
export function sortInboxViewIds(
  ids: string[],
  contactsById: Record<string, any>,
  view: CanonicalInboxView
): string[] {
  const seen = new Set<string>();
  const uniqueIds: string[] = [];
  for (const id of ids) {
    if (id && !seen.has(id) && contactsById[id]) {
      seen.add(id);
      uniqueIds.push(id);
    }
  }
  uniqueIds.sort((idA, idB) => compareInboxContacts(contactsById[idA], contactsById[idB], view));
  return uniqueIds;
}
