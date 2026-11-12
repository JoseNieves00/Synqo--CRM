export const TAG_COLORS = [
  'slate',
  'blue',
  'emerald',
  'amber',
  'rose',
  'violet',
  'cyan',
  'orange',
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

export type OrderStatus = 'pending' | 'confirmed' | 'paid' | 'delivered' | 'cancelled';

export const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'paid',
  'delivered',
  'cancelled',
];

/**
 * Fuente única para decidir si una conversación está cerrada.
 * Cubre las 3 formas en que el sistema cierra un chat:
 *  - columna `conversation_status = 'closed'`
 *  - `custom_fields.conversation_status = 'closed'` (legado)
 *  - `closed_at` presente o pipeline_stage ganado/perdido
 *
 * TODA notificación a asesores (handoff, reasignación, escalada de reintentos)
 * debe consultarla antes de enviar para no molestar con clientes ya cerrados.
 */
export function isConversationClosed(contact: {
  custom_fields?: Record<string, any> | null;
  conversation_status?: string | null;
  closed_at?: string | null;
  pipeline_stage?: string | null;
} | null | undefined): boolean {
  if (!contact) return true; // contacto inexistente: no notificar
  const cf = (contact.custom_fields || {}) as Record<string, any>;
  if (String(contact.conversation_status || '') === 'closed') return true;
  if (String(cf.conversation_status || '') === 'closed') return true;
  if (cf.conversation_closed === true) return true;
  if (Boolean(contact.closed_at)) return true;
  const stage = String(contact.pipeline_stage || '');
  if (stage === 'ganado' || stage === 'perdido') return true;
  return false;
}
