import assert from 'node:assert';
import fs from 'node:fs';
import { normalizeContactInboxState } from '../app/actions/chat';

async function runInboxTests() {
  console.log('\n🧪 Iniciando Suite de Pruebas: Reorganización del Inbox (Fase 1.5 & Bugs Clave)...\n');

  // 1. Probar Permiso de Micrófono para Notas de Voz en next.config.mjs
  console.log('1️⃣  Verificando política de permisos del micrófono en next.config.mjs...');
  const nextConfigContent = fs.readFileSync('next.config.mjs', 'utf8');
  assert.ok(
    nextConfigContent.includes('microphone=(self)'),
    'Permissions-Policy debe permitir microphone=(self) para grabar notas de voz del asesor'
  );
  console.log('   ✅ Permissions-Policy configurado con microphone=(self) aprobado.');

  // 2. Probar Normalización de Contactos para Bandejas por Estado
  console.log('\n2️⃣  Probando normalización de estado de conversación (normalizeContactInboxState)...');
  const sampleOpenContact = {
    id: 'c-1',
    name: 'Juan Pérez',
    unread_count: 2,
    last_interaction_at: '2026-11-09T10:00:00Z',
    last_message: { text: '¿Cuánto cuesta el envío?', sender_type: 'lead' },
  };

  const normalizedOpen = normalizeContactInboxState(sampleOpenContact);
  assert.strictEqual(normalizedOpen.conversation_status, 'open', 'Debe estar en estado open');
  assert.strictEqual(normalizedOpen.waiting_since, '2026-11-09T10:00:00Z', 'waiting_since debe calcularse cuando hay no leídos');
  assert.strictEqual(normalizedOpen.last_message_preview, '¿Cuánto cuesta el envío?', 'Debe extraer preview correctamente');
  assert.strictEqual(normalizedOpen.last_message_sender, 'lead', 'Debe identificar sender_type');
  console.log('   ✅ Normalización de chat abierto con espera activa verificada.');

  const sampleClosedContact = {
    id: 'c-2',
    name: 'Cliente Cerrado',
    custom_fields: { conversation_status: 'closed', close_resolution: 'won' },
  };
  const normalizedClosed = normalizeContactInboxState(sampleClosedContact);
  assert.strictEqual(normalizedClosed.conversation_status, 'closed', 'Debe reconocer conversación cerrada');
  console.log('   ✅ Normalización de chat cerrado verificada.');

  // 3. Probar Formato Unificado de Mensajes de Plantilla Oficial
  console.log('\n3️⃣  Probando alineación anti-duplicados de plantillas oficiales en chat.ts y ChatWindow.tsx...');
  const chatTsContent = fs.readFileSync('app/actions/chat.ts', 'utf8');
  const chatWindowContent = fs.readFileSync('components/chat/ChatWindow.tsx', 'utf8');

  assert.ok(
    chatTsContent.includes('[Plantilla oficial: ${templateLabel}]'),
    'chat.ts debe insertar el prefijo "[Plantilla oficial: " para evitar duplicados en UI'
  );
  assert.ok(
    chatWindowContent.includes('[Plantilla oficial: ${tplLabel}]'),
    'ChatWindow.tsx debe coincidir con el formato optimista exacto'
  );
  console.log('   ✅ Alineación exacta anti-duplicados de plantillas oficiales aprobada.');

  // 4. Probar Soporte de Reintento de Mensajes Fallidos en MessageBubble
  console.log('\n4️⃣  Verificando soporte de estado "failed" y botón de reintento en MessageBubble.tsx...');
  const messageBubbleContent = fs.readFileSync('components/chat/MessageBubble.tsx', 'utf8');
  assert.ok(
    messageBubbleContent.includes("isFailed = status === 'failed'"),
    'MessageBubble debe reconocer status failed'
  );
  assert.ok(
    messageBubbleContent.includes('onRetry'),
    'MessageBubble debe admitir callback onRetry'
  );
  assert.ok(
    messageBubbleContent.includes('Reintentar'),
    'MessageBubble debe renderizar botón de reintento'
  );
  console.log('   ✅ Estado "failed" y botón Reintentar aprobados.');

  // 5. Probar Migración SQL de Reorganización del Inbox
  console.log('\n5️⃣  Verificando migración SQL 20261109010000_inbox_reorganization_and_conversation_status.sql...');
  const migrationContent = fs.readFileSync(
    'supabase/migrations/20261109010000_inbox_reorganization_and_conversation_status.sql',
    'utf8'
  );
  assert.ok(
    migrationContent.includes('conversation_status TEXT DEFAULT \'open\''),
    'La migración debe agregar conversation_status'
  );
  assert.ok(
    migrationContent.includes('waiting_since TIMESTAMPTZ DEFAULT NULL'),
    'La migración debe agregar waiting_since'
  );
  assert.ok(
    migrationContent.includes('CREATE OR REPLACE FUNCTION sync_contact_inbox_state()'),
    'La migración debe crear la función trigger de sincronización de espera y previews'
  );
  assert.ok(
    migrationContent.includes('CREATE OR REPLACE FUNCTION inbox_counts('),
    'La migración debe exponer la RPC inbox_counts'
  );
  console.log('   ✅ Migración SQL de estado de conversación y triggers aprobada.');

  // 6. Probar Atajos de Teclado J / K / E / A
  console.log('\n6️⃣  Verificando atajos de teclado J/K en InboxView y E/A en ChatWindow...');
  const inboxViewContent = fs.readFileSync('components/chat/InboxView.tsx', 'utf8');
  assert.ok(
    inboxViewContent.includes("e.key === 'j'") && inboxViewContent.includes("e.key === 'k'"),
    'InboxView debe soportar atajos J y K para navegación fluida'
  );
  assert.ok(
    chatWindowContent.includes("e.key === 'e'") && chatWindowContent.includes("e.key === 'a'"),
    'ChatWindow debe soportar atajos E (cerrar) y A (alternar IA)'
  );
  console.log('   ✅ Atajos de teclado J / K / E / A aprobados.');

  // 7. Probar Formateo Inteligente de Fechas ("Hoy", "Ayer", días de la semana y separadores)
  console.log('\n7️⃣  Probando formateo inteligente de fechas y separadores de chat (inbox-date.ts)...');
  const { formatInboxConversationDate, formatMessageDateDivider } = await import('../lib/utils/inbox-date');

  const now = new Date();
  const todayStr = now.toISOString();

  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString();

  const pastDate = new Date(now);
  pastDate.setDate(now.getDate() - 4);
  const pastStr = pastDate.toISOString();

  const todayFmt = formatInboxConversationDate(todayStr);
  assert.ok(todayFmt.isToday === true, 'Debe identificar que fue hoy');
  assert.ok(todayFmt.label.startsWith('Hoy '), 'Debe comenzar con "Hoy "');

  const yesterdayFmt = formatInboxConversationDate(yesterdayStr);
  assert.ok(yesterdayFmt.isToday === false, 'Ayer no es hoy');
  assert.ok(yesterdayFmt.label.startsWith('Ayer '), 'Debe comenzar con "Ayer "');

  const pastFmt = formatInboxConversationDate(pastStr);
  assert.ok(pastFmt.isToday === false);
  assert.ok(pastFmt.label.length > 5, 'Debe incluir día y hora');

  // Separadores de chat
  assert.strictEqual(formatMessageDateDivider(todayStr), 'Hoy', 'Separador de hoy debe ser "Hoy"');
  assert.strictEqual(formatMessageDateDivider(yesterdayStr), 'Ayer', 'Separador de ayer debe ser "Ayer"');

  console.log('   ✅ Formateo de fechas:');
  console.log('      - Hoy:', todayFmt.label);
  console.log('      - Ayer:', yesterdayFmt.label);
  console.log('      - Días anteriores:', pastFmt.label);
  console.log('      - Separadores de mensajes: "Hoy", "Ayer" verificados.');

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE REORGANIZACIÓN DEL INBOX PASARON EXITOSAMENTE!\n');
}

runInboxTests().catch((err) => {
  console.error('❌ Error en pruebas de inbox:', err);
  process.exit(1);
});
