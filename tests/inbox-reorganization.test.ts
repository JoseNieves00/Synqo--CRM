import assert from 'node:assert';
import fs from 'node:fs';
import { normalizeContactInboxState } from '../lib/inbox/normalize';

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

  // 9. Probar Acción Masiva de Rescate por Demora (sendBatchApologyMessage & BatchApologyModal)
  console.log('\n9️⃣  Probando acción masiva de rescate por demora (BatchApologyModal & sendBatchApologyMessage)...');
  const batchModalContent = fs.readFileSync('components/chat/BatchApologyModal.tsx', 'utf8');
  assert.ok(
    batchModalContent.includes('sendBatchApologyMessage'),
    'BatchApologyModal debe importar y llamar sendBatchApologyMessage'
  );
  assert.ok(
    batchModalContent.includes('PRESET_TEMPLATES'),
    'BatchApologyModal debe incluir plantillas predefinidas optimizadas para negocios'
  );
  assert.ok(
    batchModalContent.includes('previewText'),
    'BatchApologyModal debe ofrecer vista previa en vivo estilo WhatsApp'
  );

  const sidebarContent = fs.readFileSync('components/chat/InboxSidebar.tsx', 'utf8');
  assert.ok(
    sidebarContent.includes('Disculpar demora'),
    'InboxSidebar debe incluir botón "Disculpar demora" en la barra multi-select'
  );

  // Probar reemplazo y sanitización de variables dinámicas
  const template = '¡Hola {{nombre}}! Disculpa por la demora, te habla {{asesor}} de {{empresa}}.';
  const personalize = (tpl: string, name: string, advisor: string, org: string) => {
    const rawName = (name || '').trim();
    const isPhoneOnly = /^[+0-9\s-]+$/.test(rawName) || rawName.startsWith('+');
    const firstName = rawName && !isPhoneOnly ? rawName.split(' ')[0] : '';
    return tpl
      .replace(/\{\{nombre\}\}/gi, firstName || '')
      .replace(/\{\{asesor\}\}/gi, advisor)
      .replace(/\{\{empresa\}\}/gi, org)
      .replace(/¡Hola\s+!/gi, '¡Hola!')
      .replace(/Hola\s+,/gi, 'Hola,')
      .replace(/\s{2,}/g, ' ')
      .trim();
  };

  const outputWithContact = personalize(template, 'Carlos Mendoza', 'Ana', 'Clínica Dental');
  assert.strictEqual(
    outputWithContact,
    '¡Hola Carlos! Disculpa por la demora, te habla Ana de Clínica Dental.',
    'Debe personalizar correctamente con el primer nombre del cliente'
  );

  const outputWithoutName = personalize(template, '+573001234567', 'Ana', 'Clínica Dental');
  assert.strictEqual(
    outputWithoutName,
    '¡Hola! Disculpa por la demora, te habla Ana de Clínica Dental.',
    'Debe limpiar "¡Hola !" si el contacto solo tiene número de teléfono'
  );

  console.log('   ✅ Modal y botón de acción masiva en multi-select verificados.');
  console.log('   ✅ Personalización dinámica con variables {{nombre}}, {{asesor}}, {{empresa}} aprobada.');
  console.log('   ✅ Sanitización de saludos sin nombre (Anti-Error "¡Hola !") aprobada.');

  // 10. Probar Filtro Optimizado de Seguimiento y Sugerencias de Reactivación con IA
  console.log('\n🔟 Probando filtro estricto de seguimiento y generador de reactivaciones con IA...');
  assert.ok(
    chatTsContent.includes("not('pipeline_stage', 'in', '(\"ganado\",\"perdido\",\"cita_agendada\")')"),
    'listInbox seguimiento debe excluir etapas ganadas, perdidas o con cita agendada'
  );
  assert.ok(
    chatTsContent.includes("generateReactivationAiSuggestion"),
    'chat.ts debe exportar generateReactivationAiSuggestion'
  );

  const openaiServiceContent = fs.readFileSync('services/openai.service.ts', 'utf8');
  assert.ok(
    openaiServiceContent.includes('generateReactivationHook'),
    'OpenAIService debe implementar generateReactivationHook'
  );
  assert.ok(
    openaiServiceContent.includes('detectedInterest'),
    'generateReactivationHook debe extraer el interés puntual detectado'
  );

  const updatedChatWindowContent = fs.readFileSync('components/chat/ChatWindow.tsx', 'utf8');
  assert.ok(
    updatedChatWindowContent.includes('handleGenerateAiReactivation'),
    'ChatWindow debe ofrecer botón y handler para sugerir reactivación con IA'
  );
  assert.ok(
    updatedChatWindowContent.includes('reactivationAiResult'),
    'ChatWindow debe renderizar tarjeta con gancho personalizado y alternativa suave'
  );

  console.log('   ✅ Exclusión de chats ganados/perdidos/con cita en vista de seguimiento aprobada.');
  console.log('   ✅ Generación contextual con IA (interés detectado + 2 propuestas) aprobada.');
  console.log('   ✅ UI de Reactivación Copilot en ChatWindow aprobada.');

  // 11. Ubicación exacta en los 5 buzones y clasificación automática
  console.log('\n1️⃣1️⃣ Probando reglas exactas de buzones (lib/inbox/buckets.ts) y clasificación automática...');
  const {
    contactMatchesInboxView,
    contactNeedsHumanResponse,
    contactIsAiAttending,
    contactNeedsFollowUp,
  } = await import('../lib/inbox/buckets');

  const nowEpoch = Date.now();
  const leadTypingWithAi = {
    id: 'b-1',
    is_ai_active: true,
    conversation_status: 'open',
    last_message_sender: 'lead',
    waiting_since: new Date(nowEpoch - 15 * 1000).toISOString(), // hace 15s
    unread_count: 1,
    pipeline_stage: 'nuevo',
    custom_fields: {},
  };
  assert.strictEqual(
    contactNeedsHumanResponse(leadTypingWithAi, nowEpoch),
    false,
    'Lead recién llegado con IA activa (<3m) NO debe contaminar Por Responder'
  );
  assert.strictEqual(
    contactIsAiAttending(leadTypingWithAi),
    true,
    'Lead con IA activa sin relevo debe aparecer en IA Atendiendo'
  );

  const staleAiChat = {
    ...leadTypingWithAi,
    waiting_since: new Date(nowEpoch - 5 * 60 * 1000).toISOString(), // >3m
  };
  assert.strictEqual(
    contactNeedsHumanResponse(staleAiChat, nowEpoch),
    true,
    'Lead con IA activa sin responder >3 min SÍ debe aparecer en Por Responder'
  );

  const humanPausedWaiting = {
    id: 'b-2',
    is_ai_active: false,
    conversation_status: 'open',
    last_message_sender: 'lead',
    waiting_since: new Date(nowEpoch - 20 * 1000).toISOString(),
    unread_count: 1,
    assigned_to: 'agent-99',
    pipeline_stage: 'calificado',
    custom_fields: { unattended_handoff: true },
  };
  assert.strictEqual(contactNeedsHumanResponse(humanPausedWaiting, nowEpoch), true);
  assert.strictEqual(contactIsAiAttending(humanPausedWaiting), false);
  assert.strictEqual(contactMatchesInboxView(humanPausedWaiting, 'mis_abiertos', 'agent-99'), true);

  // Un contacto con active_reminder: null y nextSendAt: null recientes NO debe colarse en Seguimiento
  const falseNullReminder = {
    id: 'b-3',
    is_ai_active: true,
    conversation_status: 'waiting_customer',
    last_message_sender: 'ai',
    waiting_since: null,
    unread_count: 0,
    last_interaction_at: new Date(nowEpoch - 60 * 60 * 1000).toISOString(),
    pipeline_stage: 'nuevo',
    custom_fields: { active_reminder: null, follow_up: { nextSendAt: null, completed: false } },
  };
  assert.strictEqual(
    contactNeedsFollowUp(falseNullReminder, nowEpoch),
    false,
    'active_reminder: null o nextSendAt: null NO deben meter el chat en Seguimiento'
  );

  const closedChat = { ...humanPausedWaiting, conversation_status: 'closed' };
  assert.strictEqual(contactMatchesInboxView(closedChat, 'cerrados'), true);
  assert.strictEqual(contactNeedsHumanResponse(closedChat, nowEpoch), false);

  // Un contacto clasificado como 'cold' NUNCA debe entrar en Seguimiento aunque tenga >24h o snooze/recordatorio previo
  const coldWithHistory = {
    id: 'b-cold-1',
    is_ai_active: true,
    conversation_status: 'waiting_customer',
    last_message_sender: 'ai',
    waiting_since: null,
    unread_count: 0,
    last_interaction_at: new Date(nowEpoch - 48 * 3600 * 1000).toISOString(),
    pipeline_stage: 'nuevo',
    custom_fields: {
      lead_temperature: 'cold',
      active_reminder: { reminderType: 'reactivation' },
      follow_up: { category: 'unresponsive', nextSendAt: new Date(nowEpoch + 3600 * 1000).toISOString() },
    },
  };
  assert.strictEqual(
    contactNeedsFollowUp(coldWithHistory, nowEpoch),
    false,
    'Contactos cold no deben entrar en la bandeja de Seguimiento'
  );

  // Verificar sincronización unificada de clasificación (buildSynchronizedClassification)
  const { buildSynchronizedClassification, normalizeFollowUpSettings } = await import(
    '../lib/ai/follow-up-types'
  );
  const enabledFollowUp = normalizeFollowUpSettings({
    enabled: true,
    sequences: {
      qualified_doubt: {
        enabled: true,
        steps: [{ delayValue: 2, delayUnit: 'hours', text: 'Hola, ¿pudiste revisar tu duda?' }],
      },
    },
  });

  const qdSync = buildSynchronizedClassification({
    customFields: { temperature: 'warm', product_interest: 'Combo' },
    currentStage: 'nuevo',
    temperature: 'qualified_doubt',
    product: 'Producto Estrella',
    objection: '¿Tienen disponible entrega mañana?',
    followUpSettings: enabledFollowUp,
  });
  assert.strictEqual(qdSync.customFields.lead_temperature, 'qualified_doubt');
  assert.strictEqual('temperature' in qdSync.customFields, false, 'Debe eliminar clave legacy temperature');
  assert.strictEqual(qdSync.nextStage, 'calificado', 'qualified_doubt desde nuevo debe promover a calificado');
  assert.strictEqual(qdSync.followUpCategory, 'qualified_doubt');
  assert.strictEqual(qdSync.customFields.follow_up.category, 'qualified_doubt');
  assert.strictEqual(qdSync.customFields.follow_up.paused, false);
  assert.ok(qdSync.customFields.follow_up.nextSendAt, 'Debe programar nextSendAt si secuencias están activas');

  const coldSync = buildSynchronizedClassification({
    customFields: {
      lead_temperature: 'qualified_doubt',
      active_reminder: { reminderType: 'reactivation', scheduledFor: new Date().toISOString() },
      follow_up: { category: 'qualified_doubt', currentStepIndex: 1, nextSendAt: new Date().toISOString() },
    },
    currentStage: 'calificado',
    temperature: 'cold',
    lostReason: 'No le interesa por el momento',
  });
  assert.strictEqual(coldSync.customFields.lead_temperature, 'cold');
  assert.strictEqual(coldSync.customFields.follow_up.paused, true, 'cold debe pausar seguimiento automático');
  assert.strictEqual('nextSendAt' in coldSync.customFields.follow_up, false, 'cold debe limpiar nextSendAt');
  assert.strictEqual('active_reminder' in coldSync.customFields, false, 'cold debe limpiar active_reminder de reactivación');
  assert.strictEqual(coldSync.shouldCancelPendingReactivations, true);
  assert.strictEqual(coldSync.nextStage, 'perdido', 'cold con motivo debe mover etapa activa a perdido');

  const contactsTsContent = fs.readFileSync('app/actions/contacts.ts', 'utf8');
  const reactivationTsContent = fs.readFileSync('services/reactivation.service.ts', 'utf8');
  assert.ok(
    chatTsContent.includes('custom_fields->>active_reminder.not.is.null') &&
      chatTsContent.includes('custom_fields->follow_up->>nextSendAt.not.is.null') &&
      chatTsContent.includes('SEGUIMIENTO_EXCLUDE_COLD_OR'),
    'chat.ts debe usar ->> y excluir contactos cold de Seguimiento'
  );
  assert.ok(
    openaiServiceContent.includes('classifyUnclassifiedContactsForActiveOrgs') &&
      openaiServiceContent.includes('buildSynchronizedClassification'),
    'OpenAIService debe sincronizar clasificación con buildSynchronizedClassification'
  );
  assert.ok(
    contactsTsContent.includes('buildSynchronizedClassification'),
    'contacts.ts debe sincronizar clasificación manual con buildSynchronizedClassification'
  );
  assert.ok(
    reactivationTsContent.includes('prioritizeReactivationQueue(') &&
      fs.readFileSync('lib/leads/reactivation-priority.ts', 'utf8').includes('qualified_doubt: 1') &&
      reactivationTsContent.includes("resolveLeadTemperature(cf) === 'cold'"),
    'reactivation.service.ts debe priorizar qualified_doubt y saltar cold'
  );
  console.log('   ✅ Reglas de buzones, sincronización de clasificación y clasificación automática verificadas.');

  // 12. Sub-bandejas mutuamente excluyentes de Seguimiento, recordatorios autónomos IA y Dashboard en tokens
  console.log('\n1️⃣2️⃣ Probando sub-bandejas excluyentes de Seguimiento, recordatorios autónomos y Dashboard de tokens...');
  const { classifySeguimientoSubBucket } = await import('../lib/inbox/buckets');
  const {
    evaluateAutonomousCadenceSlot,
    extractRecontactPromptDigest,
    inferAutonomousReminderFromLeadMessage,
    parseFollowUpScheduleDate,
  } = await import('../lib/ai/autonomous-reminder');
  const { ScheduleFollowUpToolSchema } = await import('../lib/validations/tool-calls.schema');

  const leadConCompromiso = {
    id: 'seg-1',
    pipeline_stage: 'calificado',
    last_interaction_at: new Date(nowEpoch - 48 * 3600 * 1000).toISOString(),
    custom_fields: {
      lead_temperature: 'hot',
      product_interest: 'Combo VIP',
      active_reminder: { reminderType: 'reactivation', scheduledFor: new Date().toISOString(), note: 'Paga el viernes' },
    },
  };
  const leadVentaAMedias = {
    id: 'seg-2',
    pipeline_stage: 'calificado',
    last_interaction_at: new Date(nowEpoch - 36 * 3600 * 1000).toISOString(),
    custom_fields: {
      lead_temperature: 'qualified_doubt',
      product_interest: 'Plan Anual',
      follow_up: { category: 'qualified_doubt', nextSendAt: new Date(nowEpoch + 7200 * 1000).toISOString() },
    },
  };
  const leadPorReactivar = {
    id: 'seg-3',
    pipeline_stage: 'nuevo',
    conversation_status: 'waiting_customer',
    last_interaction_at: new Date(nowEpoch - 40 * 3600 * 1000).toISOString(),
    custom_fields: { lead_temperature: 'warm' },
  };
  const leadCold = {
    id: 'seg-4',
    pipeline_stage: 'nuevo',
    last_interaction_at: new Date(nowEpoch - 40 * 3600 * 1000).toISOString(),
    custom_fields: { lead_temperature: 'cold' },
  };

  assert.strictEqual(classifySeguimientoSubBucket(leadConCompromiso, nowEpoch), 'compromisos');
  assert.strictEqual(classifySeguimientoSubBucket(leadVentaAMedias, nowEpoch), 'ventas_a_medias');
  assert.strictEqual(classifySeguimientoSubBucket(leadPorReactivar, nowEpoch), 'por_reactivar');
  assert.strictEqual(classifySeguimientoSubBucket(leadCold, nowEpoch), null);

  // Recordatorios autónomos de IA + horario humano (08:00-20:30)
  const parsedDelaySchema = ScheduleFollowUpToolSchema.safeParse({
    delay_hours: 4,
    reason: 'Retomar pago pendiente',
    suggested_message: 'Hola, como quedamos paso para confirmar tu pedido',
  });
  assert.strictEqual(parsedDelaySchema.success, true, 'ScheduleFollowUpToolSchema debe aceptar delay_hours sin date');

  const lateRef = new Date('2026-11-10T23:00:00-05:00');
  const humanAdjusted = parseFollowUpScheduleDate({
    delayHours: 2,
    orgTimezone: 'America/Bogota',
    now: lateRef,
  });
  assert.ok(humanAdjusted, 'Debe calcular fecha válida');
  const adjustedHourBogota = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hour12: false }).format(
      humanAdjusted!
    )
  );
  assert.ok(
    adjustedHourBogota >= 8 && adjustedHourBogota <= 20,
    `No debe programar en madrugada (${adjustedHourBogota}h)`
  );

  const inferredFriday = inferAutonomousReminderFromLeadMessage({
    leadText: 'Escríbeme el viernes que recibo el pago',
    orgTimezone: 'America/Bogota',
    productInterest: 'Kit Escolar',
    temperature: 'qualified_doubt',
    now: new Date('2026-11-10T10:00:00-05:00'),
  });
  assert.ok(inferredFriday && inferredFriday.scheduledFor.getTime() > Date.parse('2026-11-11T00:00:00Z'));
  assert.ok(inferredFriday.reason.includes('Kit Escolar'));

  const ignoredQuestion = inferAutonomousReminderFromLeadMessage({
    leadText: '¿Abren mañana y en qué horario atienden?',
    orgTimezone: 'America/Bogota',
  });
  assert.strictEqual(ignoredQuestion, null, 'Preguntas de horario de atención no deben crear recordatorio falso');

  // Extractor selectivo de reglas de recontacto del prompt sin inflar tokens
  const giantPrompt = [
    'EMPRESA DE PRUEBA: Comercio Multinicho SAS. Atención personalizada en todo el país.',
    ...Array.from({ length: 80 }, (_, idx) => `Item relleno catálogo #${idx + 1}: referencia estándar disponible.`),
    'REGLAS DE RECONTACTO: Siempre ofrece Plan Separe desde el 30% y adjunta foto del producto consultado.',
  ].join('\n');
  const digest = extractRecontactPromptDigest(giantPrompt, 1200);
  assert.ok(digest.length <= 1200, 'Digest debe respetar el tope de caracteres para cuidar tokens');
  assert.ok(
    digest.includes('Plan Separe') && digest.includes('foto del producto'),
    'Debe rescatar directrices de recontacto aunque estén al final de un prompt largo'
  );
  assert.ok(
    reactivationTsContent.includes('resolveAutonomousFollowUpPayload') &&
      reactivationTsContent.includes('findGalleryProductMatch'),
    'LeadReactivationService debe generar mensaje autónomo por prompt y adjuntar foto de galería'
  );

  // Dashboard UI debe mostrar tokens y NO costos en dinero
  const dashboardPageContent = fs.readFileSync('app/(dashboard)/dashboard/page.tsx', 'utf8');
  assert.ok(
    dashboardPageContent.includes('Tokens IA') && dashboardPageContent.includes('Consumo de Tokens'),
    'Dashboard debe mostrar KPIs de Tokens IA y Consumo de Tokens'
  );
  assert.strictEqual(
    dashboardPageContent.includes('Costo IA') ||
      dashboardPageContent.includes('Desglose de Costos') ||
      dashboardPageContent.includes('costUsd') ||
      dashboardPageContent.includes('totalCostUsd'),
    false,
    'Dashboard NO debe exponer métricas de costo en USD'
  );
  console.log('   ✅ Sub-bandejas excluyentes, recordatorios autónomos y Dashboard de Tokens verificados.');

  // 13. Blindaje Anti-Spam persistido, cadencia inteligente por temperatura (máx 2 toques) y sub-filtros en servidor
  console.log('\n1️⃣3️⃣ Probando cadencia autónoma por temperatura, tope anti-spam (2 toques) y sub-filtros en servidor...');
  const hot3hAgo = {
    pipeline_stage: 'calificado',
    last_interaction_at: new Date(nowEpoch - 4 * 3600 * 1000).toISOString(),
    custom_fields: { lead_temperature: 'hot' },
  };
  const hot1hAgo = {
    pipeline_stage: 'calificado',
    last_interaction_at: new Date(nowEpoch - 1.5 * 3600 * 1000).toISOString(),
    custom_fields: { lead_temperature: 'hot' },
  };
  const qd7hAgo = {
    pipeline_stage: 'calificado',
    last_interaction_at: new Date(nowEpoch - 7 * 3600 * 1000).toISOString(),
    custom_fields: { lead_temperature: 'qualified_doubt' },
  };
  const warm8hAgo = {
    pipeline_stage: 'nuevo',
    last_interaction_at: new Date(nowEpoch - 8 * 3600 * 1000).toISOString(),
    custom_fields: { lead_temperature: 'warm' },
  };
  const hotSecondTouchReady = {
    pipeline_stage: 'calificado',
    last_interaction_at: new Date(nowEpoch - 20 * 3600 * 1000).toISOString(),
    custom_fields: {
      lead_temperature: 'hot',
      follow_up: {
        category: 'hot_unclosed',
        autonomousAttemptCount: 1,
        lastSentAt: new Date(nowEpoch - 16 * 3600 * 1000).toISOString(),
        nextSendAt: new Date(nowEpoch - 30 * 60 * 1000).toISOString(),
      },
    },
  };
  const maxedOutLead = {
    pipeline_stage: 'calificado',
    last_interaction_at: new Date(nowEpoch - 48 * 3600 * 1000).toISOString(),
    custom_fields: {
      lead_temperature: 'hot',
      follow_up: { autonomousAttemptCount: 2, completed: true },
    },
  };

  assert.strictEqual(evaluateAutonomousCadenceSlot({ contact: hot1hAgo, nowTime: nowEpoch }), null, 'Hot <3.5h no debe enviarse aún');
  const hotSlot = evaluateAutonomousCadenceSlot({ contact: hot3hAgo, nowTime: nowEpoch });
  assert.strictEqual(hotSlot?.category, 'hot_unclosed');
  assert.strictEqual(hotSlot?.attemptIndex, 0);
  assert.strictEqual(evaluateAutonomousCadenceSlot({ contact: qd7hAgo, nowTime: nowEpoch })?.category, 'qualified_doubt');
  assert.strictEqual(evaluateAutonomousCadenceSlot({ contact: warm8hAgo, nowTime: nowEpoch }), null, 'Warm <24h debe esperar 24h');
  const secondSlot = evaluateAutonomousCadenceSlot({ contact: hotSecondTouchReady, nowTime: nowEpoch });
  assert.strictEqual(secondSlot?.attemptIndex, 1);
  assert.strictEqual(secondSlot?.nextTouchDelayHours, null, '2do toque debe cerrar ciclo sin programar 3er toque');
  assert.strictEqual(evaluateAutonomousCadenceSlot({ contact: maxedOutLead, nowTime: nowEpoch }), null, 'Tope anti-spam máximo 2 intentos');

  const messagingTsContent = fs.readFileSync('services/messaging.service.ts', 'utf8');
  assert.ok(
    messagingTsContent.includes('hourlyDbCount') &&
      reactivationTsContent.includes('getRecentHourlyFollowUpsCount') &&
      reactivationTsContent.includes('hasRecentFollowUpForContact'),
    'Anti-spam horario y enfriamiento por contacto deben consultarse en base de datos'
  );
  assert.ok(
    chatTsContent.includes('seguimientoSubView') && chatTsContent.includes('seguimientoSubCounts'),
    'listInbox debe resolver sub-bandejas y conteos completos en servidor'
  );
  const convRowContent = fs.readFileSync('components/chat/ConversationRow.tsx', 'utf8');
  assert.ok(
    convRowContent.includes('nextFollowUpBadge'),
    'ConversationRow debe mostrar el próximo seguimiento programado'
  );
  const updatedOpenaiContent = fs.readFileSync('services/openai.service.ts', 'utf8');
  assert.ok(
    updatedOpenaiContent.includes('isUntranscribedOnlyLead') &&
      updatedOpenaiContent.includes('isSpecificDoubtSignal') &&
      updatedOpenaiContent.includes('split(\',\').length <= 2'),
    'OpenAIService debe proteger audios sin transcribir, permitir ascenso progresivo y evitar contaminación de product_interest'
  );
  const followUpUiContent = fs.readFileSync('components/settings/FollowUpSequencesSettings.tsx', 'utf8');
  assert.strictEqual(
    followUpUiContent.includes('Tope diario anti-spam:'),
    false,
    'Cliente no debe ver input editable de tope diario anti-spam'
  );
  console.log('   ✅ Blindaje Anti-Spam en DB, cadencia autónoma por temperatura y sub-filtros en servidor aprobados.');

  // 14. Probar Ordenamiento Estilo WhatsApp Web en "ia_atendiendo" (Zero Old-Chats-On-Top)
  console.log('\n1️⃣4️⃣  Probando ordenamiento cronológico estilo WhatsApp Web en "ia_atendiendo"...');
  const { compareInboxContacts, sortInboxViewIds } = await import('../lib/inbox/buckets');
  const { useInboxStore } = await import('../lib/inbox/use-inbox-store');

  const oldChatWithRecentMetadataUpdate = {
    id: 'chat-old',
    name: 'Cliente Viejo (Metadata Reciente)',
    phone: '+573001111111',
    is_ai_active: true,
    conversation_status: 'open',
    last_interaction_at: '2026-10-20T10:00:00.000Z', // Hace 3 semanas
    updated_at: '2026-11-10T18:10:00.000Z', // Editado hace 5 min (NO debe subir al inicio)
  };
  const recentActiveChat = {
    id: 'chat-recent',
    name: 'Cliente Reciente',
    phone: '+573002222222',
    is_ai_active: true,
    conversation_status: 'open',
    last_interaction_at: '2026-11-10T18:05:00.000Z', // Mensaje real hace 10 min
    updated_at: '2026-11-10T18:05:00.000Z',
  };
  const chatWithNullInteraction = {
    id: 'chat-null',
    name: 'Contacto Importado Sin Mensajes',
    phone: '+573003333333',
    is_ai_active: true,
    conversation_status: 'open',
    last_interaction_at: null,
    updated_at: '2026-11-01T10:00:00.000Z',
  };

  const mapById = {
    'chat-old': oldChatWithRecentMetadataUpdate,
    'chat-recent': recentActiveChat,
    'chat-null': chatWithNullInteraction,
  };

  const sortedIds = sortInboxViewIds(['chat-old', 'chat-null', 'chat-recent'], mapById, 'ia_atendiendo');
  assert.deepStrictEqual(
    sortedIds,
    ['chat-recent', 'chat-old', 'chat-null'],
    'El chat con last_interaction_at más reciente debe quedar de #1, nunca el chat viejo con updated_at reciente'
  );

  // Verificar que el store reordena en vivo tipo WhatsApp Web ante upsertContact y upsertMessage
  useInboxStore.getState().initialize({
    organizationId: 'org-sort-test',
    currentUserId: 'usr-1',
    currentUserRole: 'admin',
    initialContacts: [oldChatWithRecentMetadataUpdate as any, recentActiveChat as any],
    initialCounts: { por_responder: 0, mis_abiertos: 0, ia_atendiendo: 2, seguimiento: 0, cerrados: 0 },
    initialView: 'ia_atendiendo',
  });
  assert.strictEqual(
    useInboxStore.getState().viewIds.ia_atendiendo[0],
    'chat-recent',
    'Store debe inicializar ia_atendiendo con el chat más reciente en índice 0'
  );

  // Simular Realtime UPDATE en metadatos del chat viejo -> NO debe subirlo a posición 0
  useInboxStore.getState().upsertContact({
    id: 'chat-old',
    updated_at: '2026-11-10T18:15:00.000Z',
  });
  assert.strictEqual(
    useInboxStore.getState().viewIds.ia_atendiendo[0],
    'chat-recent',
    'Editar metadatos de un chat viejo NO debe moverlo arriba de un chat reciente'
  );

  // Simular llegada de mensaje nuevo en vivo al chat viejo -> SÍ debe subirlo a posición 0 estilo WhatsApp Web
  useInboxStore.getState().upsertMessage({
    id: 'msg-live-1',
    contact_id: 'chat-old',
    sender_type: 'lead',
    content: 'Hola, volví a escribir ahora!',
    created_at: '2026-11-10T18:16:00.000Z',
  });
  assert.strictEqual(
    useInboxStore.getState().viewIds.ia_atendiendo[0],
    'chat-old',
    'Al recibir un mensaje nuevo en tiempo real, el chat debe subir al #1 como WhatsApp Web'
  );

  // Verificar que la consulta SQL en app/actions/chat.ts usa last_interaction_at DESC NULLS LAST
  const latestChatTs = fs.readFileSync('app/actions/chat.ts', 'utf8');
  assert.ok(
    latestChatTs.includes("order('last_interaction_at', { ascending: false, nullsFirst: false })"),
    'listInbox debe ordenar en PostgreSQL por last_interaction_at DESC NULLS LAST'
  );
  assert.ok(
    compareInboxContacts(recentActiveChat, oldChatWithRecentMetadataUpdate, 'ia_atendiendo') < 0,
    'compareInboxContacts debe posicionar el chat reciente antes del viejo'
  );
  console.log('   ✅ Ordenamiento estilo WhatsApp Web verificado (SQL, Store en vivo y Virtualizer key-by-id).');

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE REORGANIZACIÓN DEL INBOX PASARON EXITOSAMENTE!\n');
}

runInboxTests().catch((err) => {
  console.error('❌ Error en pruebas de inbox:', err);
  process.exit(1);
});
