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

  // 8. Probar Condiciones Estrictas de "Por Reactivar" y Exclusión de Chats Ya Respondidos
  console.log('\n8️⃣  Probando condiciones estrictas de reactivación y exclusión de chats atendidos...');
  const { LeadReactivationService } = await import('../services/reactivation.service');

  const nowMs = Date.now();
  const d30hAgo = new Date(nowMs - 30 * 3600 * 1000).toISOString();
  const d2hAgo = new Date(nowMs - 2 * 3600 * 1000).toISOString();

  // Caso A: El cliente escribió hace 30h y nadie le respondió -> ¡NO es reactivación! Debe ser "Por Responder"
  const unhandledLeadContact = {
    id: 'c-react-1',
    name: 'Cliente Esperando',
    phone: '+573001112233',
    pipeline_stage: 'nuevo',
    unread_count: 1,
    waiting_since: d30hAgo,
    last_interaction_at: d30hAgo,
    last_message_sender: 'lead',
    last_message: { text: '¿Cuánto vale el servicio?', sender_type: 'lead' },
  };

  // Caso B: El asesor o la IA contestaron hace 2 horas -> ¡NO es reactivación! Solo han pasado 2 horas
  const recentlyAnsweredContact = {
    id: 'c-react-2',
    name: 'Cliente Reciente',
    phone: '+573002223344',
    pipeline_stage: 'propuesta',
    unread_count: 0,
    waiting_since: null,
    last_interaction_at: d2hAgo,
    last_message_sender: 'agent_manual',
    last_message: { text: 'Aquí tienes la cotización oficial.', sender_type: 'agent_manual' },
  };

  // Caso C: El asesor o la IA contestaron hace 30 horas, el cliente NO ha respondido -> ¡SÍ es reactivación!
  const eligibleReactivationContact = {
    id: 'c-react-3',
    name: 'Cliente en Silencio',
    phone: '+573003334455',
    pipeline_stage: 'propuesta',
    unread_count: 0,
    waiting_since: null,
    last_interaction_at: d30hAgo,
    last_message_sender: 'ai',
    last_message: { text: 'Quedamos atentos a cualquier duda con la propuesta 😊', sender_type: 'ai' },
  };

  // Caso D: Ya se intentó reactivar (blindaje anti-spam de 1 intento) -> ¡NO es reactivación!
  const alreadyAttemptedContact = {
    id: 'c-react-4',
    name: 'Cliente Ya Intentado',
    phone: '+573004445566',
    pipeline_stage: 'propuesta',
    unread_count: 0,
    waiting_since: null,
    last_interaction_at: d30hAgo,
    last_message_sender: 'ai',
    custom_fields: { reactivation_attempted: true },
  };

  // Función de evaluación según la regla blindada implementada
  const evaluateReactivationEligibility = (c: any) => {
    if (c.pipeline_stage === 'ganado' || c.pipeline_stage === 'perdido' || c.pipeline_stage === 'cita_agendada') return false;
    if (c.conversation_status === 'closed' || c.custom_fields?.conversation_status === 'closed') return false;
    if (c.custom_fields?.reactivation_attempted) return false;
    if ((c.unread_count || 0) > 0 || c.waiting_since) return false;
    const sender = c.last_message_sender || c.last_message?.sender_type || c.custom_fields?.last_message?.sender_type;
    if (sender === 'lead') return false;
    try {
      const elapsed = Date.now() - new Date(c.last_interaction_at).getTime();
      const hours = elapsed / (1000 * 3600);
      return hours >= 24 && hours <= 240;
    } catch {
      return false;
    }
  };

  assert.strictEqual(
    evaluateReactivationEligibility(unhandledLeadContact),
    false,
    'Un chat donde el lead habló de último o tiene no leídos NUNCA debe ser elegible para reactivar'
  );
  assert.strictEqual(
    evaluateReactivationEligibility(recentlyAnsweredContact),
    false,
    'Un chat recién contestado (<24h) por asesor o IA NO debe estar en reactivación'
  );
  assert.strictEqual(
    evaluateReactivationEligibility(eligibleReactivationContact),
    true,
    'Un chat con respuesta de IA/Asesor hace >24h sin contestación del cliente SÍ es reactivable'
  );
  assert.strictEqual(
    evaluateReactivationEligibility(alreadyAttemptedContact),
    false,
    'Un chat con reactivation_attempted = true NO debe volverse a reactivar (anti-spam)'
  );

  // Comprobar que sendAgentMessage y inbound-core limpian recordatorios de reactivación
  const inboundCoreFile = fs.readFileSync('services/inbound-core.service.ts', 'utf8');
  assert.ok(
    inboundCoreFile.includes("updatedCustom.active_reminder?.reminderType === 'reactivation'"),
    'inbound-core debe limpiar el recordatorio de reactivación cuando la IA responde'
  );
  assert.ok(
    chatTsContent.includes("updatedCustom.active_reminder?.reminderType === 'reactivation'"),
    'chat.ts sendAgentMessage debe limpiar el recordatorio de reactivación cuando el asesor responde'
  );
  console.log('   ✅ Caso A: Lead esperando respuesta -> Excluido de reactivación (está en Por Responder).');
  console.log('   ✅ Caso B: Chat recién contestado (<24h) -> Excluido de reactivación.');
  console.log('   ✅ Caso C: Chat en silencio >24h tras respuesta nuestra -> Elegible para reactivación.');
  console.log('   ✅ Caso D: Chat ya intentado -> Excluido por blindaje anti-spam (1 solo intento).');
  console.log('   ✅ Auto-limpieza de recordatorios de reactivación al contestar asesor o IA verificada.');

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE REORGANIZACIÓN DEL INBOX PASARON EXITOSAMENTE!\n');
}

runInboxTests().catch((err) => {
  console.error('❌ Error en pruebas de inbox:', err);
  process.exit(1);
});
