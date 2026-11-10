/**
 * Normaliza cualquier contacto al formato uniforme del nuevo Inbox por estado.
 * Función pura síncrona utilizable en cliente y servidor.
 */
export function normalizeContactInboxState(c: any) {
  const isClosed = c.conversation_status === 'closed' || c.custom_fields?.conversation_status === 'closed';
  const status = isClosed ? 'closed' : (c.conversation_status || 'open');
  const lastMsg = c.last_message || c.custom_fields?.last_message;
  const lastMsgText = c.last_message_preview || (typeof lastMsg === 'string' ? lastMsg : lastMsg?.text || '');
  const lastMsgSender = c.last_message_sender || (typeof lastMsg === 'object' ? lastMsg?.sender_type : null);
  const alreadyAnsweredBySystem = lastMsgSender === 'ai' || lastMsgSender === 'agent_manual' || lastMsgSender === 'agent';
  const waitingSince =
    c.waiting_since ||
    (!alreadyAnsweredBySystem && (c.unread_count || 0) > 0 ? c.last_interaction_at : null);

  return {
    ...c,
    conversation_status: status,
    waiting_since: waitingSince,
    last_message_preview: lastMsgText,
    last_message_sender: lastMsgSender,
  };
}
