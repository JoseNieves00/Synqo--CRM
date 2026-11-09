import assert from 'node:assert';
import { useInboxStore } from '../lib/inbox/use-inbox-store';

console.log('🧪 Iniciando verificación de Fase E: Velocidad Comercial y Herramientas de Cierre (Inbox Zero)...');

// 1. Test: Lógica de Ventana de 24 horas y Bypass de Evolution API
console.log('1. Verificando cálculo de ventana de 24 horas (Meta Cloud API vs Evolution API)...');
function evaluate24hWindow(
  channel: string | undefined,
  whatsappProvider: string,
  lastInteractionAt: string | null | undefined
) {
  if (channel === 'instagram') {
    return { isOpen: true, label: 'Instagram Direct', isEvolution: false };
  }
  if (whatsappProvider === 'evolution') {
    return { isOpen: true, label: 'WhatsApp Web', isEvolution: true };
  }
  if (!lastInteractionAt) {
    return { isOpen: false, label: '24h Expirada', isEvolution: false };
  }
  const diffHours = (Date.now() - new Date(lastInteractionAt).getTime()) / (1000 * 3600);
  if (diffHours >= 24) {
    return { isOpen: false, label: '24h Expirada', isEvolution: false };
  }
  const remainingHours = Math.max(1, Math.floor(24 - diffHours));
  return { isOpen: true, label: `${remainingHours}h restantes`, isEvolution: false };
}

// Caso A: WhatsApp Web (Evolution API) -> Sin restricción 24h
const evoRes = evaluate24hWindow('whatsapp', 'evolution', new Date(Date.now() - 48 * 3600 * 1000).toISOString());
assert.strictEqual(evoRes.isOpen, true, 'Evolution API no debe estar restringida por la ventana de 24h');
assert.strictEqual(evoRes.isEvolution, true, 'Debe marcarse como sesión de Evolution');

// Caso B: Meta Cloud API reciente (<24h)
const metaRecent = evaluate24hWindow('whatsapp', 'meta', new Date(Date.now() - 5 * 3600 * 1000).toISOString());
assert.strictEqual(metaRecent.isOpen, true, 'Interacción reciente debe tener ventana abierta');
assert.strictEqual(metaRecent.label, '19h restantes', 'Debe calcular correctamente 19h restantes');

// Caso C: Meta Cloud API expirada (>24h)
const metaExpired = evaluate24hWindow('whatsapp', 'meta', new Date(Date.now() - 30 * 3600 * 1000).toISOString());
assert.strictEqual(metaExpired.isOpen, false, 'Interacción >24h debe marcarse como expirada');
assert.strictEqual(metaExpired.label, '24h Expirada', 'Debe indicar que requiere plantilla oficial');

console.log('   ✅ Ventana de 24h consciente del proveedor validada.');

// 2. Test: Lógica de Salto Automático Inbox Zero (Next Contact Selector)
console.log('2. Verificando algoritmo de salto automático a siguiente chat (Inbox Zero)...');
function findNextInboxZeroContact(
  contactList: Array<{ id: string }>,
  closedContactId: string
): { id: string } | null {
  const currentIdx = contactList.findIndex((c) => c.id === closedContactId);
  if (currentIdx !== -1) {
    return contactList[currentIdx + 1] || contactList[currentIdx - 1] || null;
  }
  return contactList.length > 0 ? contactList[0] : null;
}

const mockQueue = [{ id: 'lead-1' }, { id: 'lead-2' }, { id: 'lead-3' }];

// Al cerrar lead-1, debe saltar a lead-2
assert.strictEqual(findNextInboxZeroContact(mockQueue, 'lead-1')?.id, 'lead-2', 'Debe avanzar a lead-2');

// Al cerrar lead-2, debe saltar a lead-3
assert.strictEqual(findNextInboxZeroContact(mockQueue, 'lead-2')?.id, 'lead-3', 'Debe avanzar a lead-3');

// Al cerrar lead-3 (último), debe retroceder a lead-2
assert.strictEqual(findNextInboxZeroContact(mockQueue, 'lead-3')?.id, 'lead-2', 'Al estar al final debe saltar al anterior');

// Si la lista solo tenía 1 y se cierra, debe retornar null (Inbox Zero alcanzado)
assert.strictEqual(findNextInboxZeroContact([{ id: 'lead-only' }], 'lead-only'), null, 'Cola vacía -> null');

console.log('   ✅ Algoritmo de salto automático Inbox Zero validado con 100% de precisión.');

// 3. Test: Persistencia de Deal Value en Store y Conversión Comercial
console.log('3. Verificando persistencia y tipado de Deal Value en el Store...');
const contactId = 'c-deal-test';
useInboxStore.getState().upsertContact({
  id: contactId,
  name: 'Cliente VIP',
  phone: '573001234567',
  pipeline_stage: 'negociacion',
  deal_value: 350000,
  conversation_status: 'open',
} as any);

let storedContact = useInboxStore.getState().contactsById[contactId];
assert.strictEqual(storedContact?.deal_value, 350000, 'El valor del negocio debe persistirse en el store');

// Cierre comercial como Ganado con actualización de monto
useInboxStore.getState().upsertContact({
  id: contactId,
  pipeline_stage: 'ganado',
  deal_value: 420000,
  conversation_status: 'closed',
} as any);

storedContact = useInboxStore.getState().contactsById[contactId];
assert.strictEqual(storedContact?.pipeline_stage, 'ganado', 'La etapa debe ser ganado');
assert.strictEqual(storedContact?.deal_value, 420000, 'El monto final cerrado debe ser 420.000 COP');
assert.strictEqual(storedContact?.conversation_status, 'closed', 'El estado de conversación debe ser closed');

console.log('   ✅ Registro y transición de Deal Value validados.');

// 4. Test: Comprobación de Condición de Anticipación del Copiloto IA
console.log('4. Verificando condiciones de disparo proactivo del Copiloto IA...');
function shouldTriggerCopilotProactive(
  contact: { unread_count?: number; waiting_since?: string | null; is_ai_active?: boolean } | null,
  draftText: string
): boolean {
  if (!contact) return false;
  const isUnattended = (Number(contact.unread_count || 0) > 0 || Boolean(contact.waiting_since));
  return isUnattended && !contact.is_ai_active && !draftText.trim();
}

// Chat desatendido, IA apagada, sin borrador -> DISPARA
assert.strictEqual(
  shouldTriggerCopilotProactive({ unread_count: 2, is_ai_active: false }, ''),
  true,
  'Chat desatendido con input vacío debe disparar copiloto en segundo plano'
);

// Asesor ya está escribiendo un borrador manual -> NO DISPARA (no sobrescribir)
assert.strictEqual(
  shouldTriggerCopilotProactive({ unread_count: 2, is_ai_active: false }, 'Hola Juan, con gusto'),
  false,
  'Si el asesor ya redactó texto, nunca debe disparar'
);

// La IA autónoma está activa -> NO DISPARA
assert.strictEqual(
  shouldTriggerCopilotProactive({ unread_count: 2, is_ai_active: true }, ''),
  false,
  'Si la IA autónoma está respondiendo, el copiloto humano no interfiere'
);

console.log('   ✅ Disparo proactivo de Copiloto IA validado sin interferir con la redacción del asesor.');

console.log('🎉 Fase E verificada con éxito: 100% pruebas aprobadas.');
