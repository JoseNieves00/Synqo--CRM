import assert from 'node:assert/strict';
import { useInboxStore } from '../lib/inbox/use-inbox-store';

console.log('🧪 Iniciando Simulación de Estrés & Sincronización del Inbox...');

const baseOrg = 'org-inbox-stress';
const userId = 'agent-1';

// 1. Inicialización limpia con 2 chats en 'por_responder'
useInboxStore.getState().initialize({
  organizationId: baseOrg,
  currentUserId: userId,
  currentUserRole: 'agent',
  initialView: 'por_responder',
  initialContacts: [
    {
      id: 'c1',
      name: 'Lead Uno',
      phone: '573001112233',
      is_ai_active: false,
      conversation_status: 'open',
      unread_count: 1,
      last_message_sender: 'lead',
      last_interaction_at: '2026-11-27T10:00:00.000Z',
      updated_at: '2026-11-27T10:00:00.000Z',
    },
    {
      id: 'c2',
      name: 'Lead Dos',
      phone: '573001112244',
      is_ai_active: false,
      conversation_status: 'open',
      unread_count: 2,
      last_message_sender: 'lead',
      last_interaction_at: '2026-11-27T10:05:00.000Z',
      updated_at: '2026-11-27T10:05:00.000Z',
    },
  ],
  initialCounts: {
    por_responder: 2,
    mis_abiertos: 0,
    ia_atendiendo: 0,
    seguimiento: 0,
    cerrados: 0,
    todos: 2,
  },
});

assert.equal(useInboxStore.getState().viewIds.por_responder.length, 2);
assert.equal(useInboxStore.getState().counts.por_responder, 2);

// 2. Responder desde IA / asesor a c1 -> debe salir de por_responder y bajar count a 1 en 0ms
useInboxStore.getState().upsertMessage({
  id: 'm-reply-1',
  contact_id: 'c1',
  sender_type: 'ai',
  content: '¡Hola! Claro, con mucho gusto te ayudo.',
  created_at: '2026-11-27T10:06:00.000Z',
});
assert.equal(useInboxStore.getState().viewIds.por_responder.includes('c1'), false);
assert.equal(useInboxStore.getState().counts.por_responder, 1);

// 3. Cerrar c2 -> debe salir de por_responder y bajar count a 0
useInboxStore.getState().upsertContact({
  id: 'c2',
  conversation_status: 'closed',
  is_ai_active: false,
  unread_count: 0,
});
assert.equal(useInboxStore.getState().viewIds.por_responder.length, 0);
assert.equal(useInboxStore.getState().counts.por_responder, 0);

// 4. Llega nuevo mensaje de lead en c3 (en modo manual) -> entra a por_responder y sube count a 1
useInboxStore.getState().upsertContact({
  id: 'c3',
  name: 'Lead Tres',
  phone: '573001112255',
  is_ai_active: false,
  conversation_status: 'open',
  unread_count: 1,
  last_message_sender: 'lead',
  last_interaction_at: '2026-11-27T10:07:00.000Z',
});
assert.equal(useInboxStore.getState().viewIds.por_responder.includes('c3'), true);
assert.equal(useInboxStore.getState().counts.por_responder, 1);

// 5. Eliminar c3 -> limpia contactsById, viewIds y decrementa counts.por_responder a 0
useInboxStore.getState().removeContact('c3');
assert.equal(useInboxStore.getState().contactsById['c3'], undefined);
assert.equal(useInboxStore.getState().viewIds.por_responder.length, 0);
assert.equal(useInboxStore.getState().counts.por_responder, 0);

// 6. Ráfaga de 120 mensajes desordenados y duplicados -> orden cronológico exacto y sin duplicados
const burst: any[] = [];
for (let i = 119; i >= 0; i--) {
  const sec = String(i % 60).padStart(2, '0');
  const min = String(Math.floor(i / 60)).padStart(2, '0');
  burst.push({
    id: `burst-${i}`,
    contact_id: 'c1',
    sender_type: i % 2 === 0 ? 'lead' : 'ai',
    content: `Mensaje ${i}`,
    created_at: `2026-11-27T11:${min}:${sec}.000Z`,
  });
}
// Incluir duplicado explícito
burst.push({ ...burst[0] });
useInboxStore.getState().setContactMessages('c1', burst);

const storedMsgs = useInboxStore.getState().messagesByContact['c1']?.items || [];
assert.equal(storedMsgs.length, 121, 'Debe deduplicar burst y conservar m-reply-1 + 120 mensajes');
for (let i = 1; i < storedMsgs.length; i++) {
  assert.ok(
    new Date(storedMsgs[i].created_at).getTime() >= new Date(storedMsgs[i - 1].created_at).getTime(),
    'Los mensajes deben quedar estrictamente ordenados cronológicamente'
  );
}

console.log('✅ inbox-stress-and-sync.test.ts: 6/6 escenarios de estrés y sincronización del Inbox pasaron');
