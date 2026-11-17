/**
 * Candados puros de entrega de seguimientos (según si se envía, retiene o cancela).
 * Única fuente de verdad compartida entre la rama A (recordatorios agendados) y la rama B
 * (secuencias por embudo) de ReactivationService, pruebas automatizadas y el panel de salud.
 *
 * Regla de oro: un seguimiento agendado por un asesor o por la IA NO debe congelarse para
 * siempre solo porque la IA quedó apagada tras una respuesta manual. Se retiene únicamente
 * mientras el cliente está esperando una respuesta real de un humano.
 */

export type FollowUpHoldReason =
  | 'opted_out' // el cliente pidió no ser contactado
  | 'conversation_closed' // conversación cerrada por el equipo
  | 'deal_closed' // negocio ganado o perdido (no aplica seguimiento de venta)
  | 'waiting_for_advisor' // hay mensaje del cliente sin responder / relevo humano activo
  | null; // null = puede enviarse

/**
 * Detecta si la conversación está cerrada (campo plano o dentro de custom_fields).
 */
export function isFollowUpConversationClosed(contact: any): boolean {
  if (!contact) return false;
  const cf = (contact.custom_fields as Record<string, any>) || {};
  return contact.conversation_status === 'closed' || cf.conversation_status === 'closed';
}

/**
 * Resuelve por qué un seguimiento no puede enviarse HOY para este contacto.
 *
 * - `opted_out` / `conversation_closed` / `deal_closed` → el recordatorio debe CANCELARSE.
 * - `waiting_for_advisor` → RETENER (sigue pendiente, se reintenta en la próxima corrida).
 * - `null` → ENVIAR, aunque `is_ai_active` sea false (un asesor atendió manualmente y
 *   apagó la IA, pero su propio seguimiento agendado sigue siendo válido).
 */
export function resolveFollowUpHoldReason(contact: any): FollowUpHoldReason {
  if (!contact) return 'waiting_for_advisor';

  const cf = (contact.custom_fields as Record<string, any>) || {};

  if (cf.opted_out === true) return 'opted_out';
  if (isFollowUpConversationClosed(contact)) return 'conversation_closed';
  if (contact.pipeline_stage === 'ganado' || contact.pipeline_stage === 'perdido') {
    return 'deal_closed';
  }

  const waitingForAdvisor =
    (contact.unread_count || 0) > 0 ||
    Boolean(contact.waiting_since) ||
    cf.unattended_handoff === true;
  if (waitingForAdvisor) return 'waiting_for_advisor';

  return null;
}
