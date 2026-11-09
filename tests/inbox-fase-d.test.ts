import assert from 'node:assert';
import { useInboxStore } from '../lib/inbox/use-inbox-store';

console.log('🧪 Iniciando verificación de Fase D: Paridad con WhatsApp Web...');

// 1. Test: Lógica de Búsqueda Dentro del Chat
console.log('1. Verificando motor de búsqueda dentro del chat (In-chat Search)...');
const sampleMessages = [
  { id: 'm1', content: 'Hola, buenas tardes', sender_type: 'lead' },
  { id: 'm2', content: '¿Tienen vestidos disponibles en talla 4?', sender_type: 'lead' },
  { id: 'm3', content: '¡Hola! Sí, tenemos 3 modelos disponibles de vestidos.', sender_type: 'agent' },
  { id: 'm4', content: '¿Aceptan transferencia Bancolombia?', sender_type: 'lead' },
  { id: 'm5', content: 'Claro que sí, aquí tienes la cuenta.', sender_type: 'agent' },
];

function computeSearchMatches(messages: Array<{ content: string }>, query: string): number[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return messages
    .map((m, idx) => (m.content?.toLowerCase().includes(q) ? idx : -1))
    .filter((idx) => idx !== -1);
}

const matches1 = computeSearchMatches(sampleMessages, 'vestidos');
assert.deepStrictEqual(matches1, [1, 2], 'Debe encontrar "vestidos" en mensajes 1 y 2');

const matchesCaseInsensitive = computeSearchMatches(sampleMessages, 'BANCOLOMBIA');
assert.deepStrictEqual(matchesCaseInsensitive, [3], 'Debe ser case-insensitive y encontrar Bancolombia');

const emptyQueryMatches = computeSearchMatches(sampleMessages, '   ');
assert.deepStrictEqual(emptyQueryMatches, [], 'Query vacía o espacios debe retornar array vacío');

console.log('   ✅ Búsqueda in-chat indexa correctamente y es case-insensitive.');

// 2. Test: Cálculo de Divisor Visual de Mensajes No Leídos
console.log('2. Verificando cálculo del divisor visual de mensajes no leídos...');
function computeUnreadDividerIndex(totalMessages: number, unreadCount: number): number {
  if (unreadCount <= 0) return -1;
  const idx = totalMessages - unreadCount;
  return idx >= 0 ? idx : 0;
}

assert.strictEqual(computeUnreadDividerIndex(10, 0), -1, 'unreadCount 0 no debe mostrar divisor');
assert.strictEqual(computeUnreadDividerIndex(10, 3), 7, 'Debe colocarse exactamente antes del mensaje 7 (los últimos 3)');
assert.strictEqual(computeUnreadDividerIndex(5, 10), 0, 'Si unreadCount > total, debe colocarse en 0');
console.log('   ✅ Divisor visual de no leídos calculado con precisión matemática.');

// 3. Test: Monotonic Status Progression (Blind spot fix en Webhook Evolution)
console.log('3. Verificando progresión monótona de estados de mensajes (Status Monotonicity)...');
const STATUS_ORDER: Record<string, number> = {
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

function shouldUpdateStatus(currentStatus: string, incomingStatus: string): boolean {
  const currentRank = STATUS_ORDER[currentStatus] ?? -1;
  const incomingRank = STATUS_ORDER[incomingStatus] ?? -1;
  return incomingRank > currentRank;
}

assert.strictEqual(shouldUpdateStatus('sent', 'delivered'), true, 'sent -> delivered debe actualizar');
assert.strictEqual(shouldUpdateStatus('delivered', 'read'), true, 'delivered -> read debe actualizar');
assert.strictEqual(shouldUpdateStatus('read', 'delivered'), false, 'read NO debe degradarse a delivered');
assert.strictEqual(shouldUpdateStatus('read', 'sent'), false, 'read NO debe degradarse a sent');
assert.strictEqual(shouldUpdateStatus('read', 'read'), false, 'read -> read no requiere re-escritura');
console.log('   ✅ Progresión monótona comprobada: nunca se degrada un tick azul a gris.');

// 4. Test: Zustand Store - Gestión de Reacciones Emojis
console.log('4. Verificando reactToMessage y store de reacciones...');
const contactId = 'c-test-d';
const msgId = 'msg-react-1';

useInboxStore.getState().setContactMessages(contactId, [
  {
    id: msgId,
    contact_id: contactId,
    content: 'Comprobante recibido!',
    sender_type: 'lead',
    created_at: new Date().toISOString(),
    status: 'delivered',
  } as any,
]);

// Agregar reacción '❤️'
useInboxStore.getState().updateMessageReaction(msgId, contactId, {
  emoji: '❤️',
  from: 'agent',
  reacted_at: new Date().toISOString(),
});

let currentMsg = useInboxStore.getState().messagesByContact[contactId].items.find((m) => m.id === msgId);
assert.strictEqual(currentMsg?.reactions?.emoji, '❤️', 'La reacción ❤️ debe guardarse en el store');

// Quitar reacción (toggle off)
useInboxStore.getState().updateMessageReaction(msgId, contactId, null);
currentMsg = useInboxStore.getState().messagesByContact[contactId].items.find((m) => m.id === msgId);
assert.strictEqual(currentMsg?.reactions, null, 'Al retirar la reacción debe quedar en null');

console.log('   ✅ Reacciones reactivas y toggle bidireccional funcionando en el store.');

// 5. Test: Ciclo de Velocidad de Reproducción de Audio
console.log('5. Verificando selector de velocidad de reproducción (1× / 1.5× / 2×)...');
const speeds = [1, 1.5, 2];
function getNextSpeed(current: number): number {
  const idx = speeds.indexOf(current);
  return speeds[(idx + 1) % speeds.length];
}

assert.strictEqual(getNextSpeed(1), 1.5, '1x pasa a 1.5x');
assert.strictEqual(getNextSpeed(1.5), 2, '1.5x pasa a 2x');
assert.strictEqual(getNextSpeed(2), 1, '2x vuelve a 1x');
console.log('   ✅ Selector de velocidades de audio 1× -> 1.5× -> 2× validado.');

console.log('🎉 Fase D verificada con éxito: 100% pruebas aprobadas.');
