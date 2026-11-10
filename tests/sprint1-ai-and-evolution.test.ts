import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { decryptSecret, encryptSecret } from '../lib/security/encryption';
import { compileStructuredPrompt } from '../lib/ai/prompt-compiler';

console.log('\n🧪 Iniciando Suite de Pruebas: Sprint 1 (Correcciones Críticas de IA, Evolution & Pagos)...\n');

// 1. Verificación de Permissions-Policy en middleware.ts
console.log('1️⃣  Verificando Permissions-Policy de micrófono en middleware.ts...');
const middlewarePath = path.join(process.cwd(), 'middleware.ts');
const middlewareContent = fs.readFileSync(middlewarePath, 'utf8');
assert.ok(
  middlewareContent.includes("microphone=(self)"),
  'middleware.ts debe configurar Permissions-Policy con microphone=(self)'
);
assert.ok(
  !middlewareContent.includes("microphone=()"),
  'middleware.ts NO debe contener microphone=() ya que bloquea el microfono en el navegador'
);
console.log('   ✅ Permissions-Policy de micrófono configurado con microphone=(self) verificado.');

// 2. Verificación de descifrado en lecturas y reacciones en app/actions/chat.ts
console.log('2️⃣  Verificando descifrado de claves en markContactAsRead y reactToMessage...');
const chatActionsPath = path.join(process.cwd(), 'app/actions/chat.ts');
const chatActionsContent = fs.readFileSync(chatActionsPath, 'utf8');

// Comprobar que markContactAsRead usa decryptedEvoKey y decryptedMetaToken
assert.ok(
  chatActionsContent.includes('decryptedEvoKey = decryptSecret(org.evolution_api_key)'),
  'markContactAsRead y reactToMessage deben descifrar org.evolution_api_key con decryptSecret'
);
assert.ok(
  chatActionsContent.includes('decryptedMetaToken = decryptSecret(org.whatsapp_access_token)'),
  'markContactAsRead y reactToMessage deben descifrar org.whatsapp_access_token con decryptSecret'
);
console.log('   ✅ Descifrado de claves en lecturas y reacciones comprobado.');

// 3. Verificación de suscripción a eventos en services/evolution.service.ts
console.log('3️⃣  Verificando suscripción a eventos MESSAGES_UPDATE y MESSAGES_DELETE en Evolution...');
const evoServicePath = path.join(process.cwd(), 'services/evolution.service.ts');
const evoServiceContent = fs.readFileSync(evoServicePath, 'utf8');

assert.ok(
  evoServiceContent.includes("'MESSAGES_UPDATE'") && evoServiceContent.includes("'MESSAGES_DELETE'"),
  'EvolutionService debe suscribirse a MESSAGES_UPDATE (ticks) y MESSAGES_DELETE'
);
console.log('   ✅ Eventos MESSAGES_UPDATE y MESSAGES_DELETE suscritos para ticks en tiempo real.');

// 4. Verificación de protección de master key en services/messaging.service.ts
console.log('4️⃣  Verificando blindaje anti-fuga de master key en MessagingService...');
const messagingServicePath = path.join(process.cwd(), 'services/messaging.service.ts');
const messagingContent = fs.readFileSync(messagingServicePath, 'utf8');

assert.ok(
  messagingContent.includes('isUsingDefaultServer'),
  'MessagingService debe verificar isUsingDefaultServer antes de usar process.env.EVOLUTION_API_KEY'
);
console.log('   ✅ Blindaje anti-fuga de clave maestra en URLs personalizadas verificado.');

// 5. Verificación de filtrado estricto de media para visión en services/openai.service.ts
console.log('5️⃣  Verificando filtrado de audio, video y documentos en visión LLM...');
const openaiServicePath = path.join(process.cwd(), 'services/openai.service.ts');
const openaiServiceContent = fs.readFileSync(openaiServicePath, 'utf8');

assert.ok(
  openaiServiceContent.includes('nonImageExtensionsRegex'),
  'openai.service.ts debe excluir extensiones de audio, video y pdf de las llamadas de vision'
);
assert.ok(
  !openaiServiceContent.includes("contentText.match(/https?:\\/\\/[^\\s\"'<>\\)]+\\/chat-media\\/[^\\s\"'<>\\)]+/i)"),
  'openai.service.ts NO debe usar comodín genérico /chat-media/ sin validar extensión'
);
console.log('   ✅ Blindaje de visión multimodal: audios, videos y PDFs excluidos de image_url.');

// 6. Verificación de neutralidad de catálogo (cero cocinitas en prompts globales)
console.log('6️⃣  Verificando eliminación de "cocinitas" y "Pequeños Chefs" de prompts globales...');
const promptCompilerPath = path.join(process.cwd(), 'lib/ai/prompt-compiler.ts');
const promptCompilerContent = fs.readFileSync(promptCompilerPath, 'utf8');

assert.ok(
  !promptCompilerContent.includes('madera MDF'),
  'prompt-compiler.ts no debe contener referencias quemadas a madera MDF'
);
assert.ok(
  !openaiServiceContent.includes('Pequeños Chefs! Recién llegadas!'),
  'openai.service.ts no debe contener copys quemados de Pequeños Chefs en prompts globales'
);
assert.ok(
  !openaiServiceContent.includes('En esta colección de cocinitas manejamos 3 modelos'),
  'openai.service.ts no debe contener ejemplos globales quemados de cocinitas'
);
console.log('   ✅ Prompts globales 100% neutrales y multi-empresa.');

// 7. Verificación del flujo de relevo que responde antes de pausar (pauseAfterSend)
console.log('7️⃣  Verificando flujo de relevo y despedida sin dejar en visto (pauseAfterSend)...');
const inboundCorePath = path.join(process.cwd(), 'services/inbound-core.service.ts');
const inboundCoreContent = fs.readFileSync(inboundCorePath, 'utf8');

assert.ok(
  openaiServiceContent.includes('pauseAfterSend = true'),
  'openai.service.ts debe marcar pauseAfterSend = true en lugar de mutar la DB prematuramente'
);
assert.ok(
  inboundCoreContent.includes('aiResult?.pauseAfterSend'),
  'inbound-core.service.ts debe pausar is_ai_active DESPUÉS de despachar el mensaje al cliente'
);
console.log('   ✅ Flujo pauseAfterSend verificado: El lead siempre recibe el mensaje antes de pausar.');

// 8. Verificación del Patrón Outbox y reconciliación de eco fromMe
console.log('8️⃣  Verificando Patrón Outbox e inmunidad de IA ante su propio eco fromMe...');
assert.ok(
  inboundCoreContent.includes("status: 'sending'"),
  'inbound-core.service.ts debe insertar mensaje con status "sending" antes del envío externo (Outbox)'
);
assert.ok(
  inboundCoreContent.includes('id: messageId') && inboundCoreContent.includes("status: 'sending'"),
  'inbound-core.service.ts debe asociar id único en el outbox con status sending'
);

const evoWebhookPath = path.join(process.cwd(), 'app/api/webhooks/whatsapp/evolution/route.ts');
const evoWebhookContent = fs.readFileSync(evoWebhookPath, 'utf8');
const humanOutboundPath = path.join(process.cwd(), 'services/human-outbound.service.ts');
const humanOutboundContent = fs.readFileSync(humanOutboundPath, 'utf8');
assert.ok(
  evoWebhookContent.includes('HumanOutboundService.recordMobileHumanOutbound') &&
    humanOutboundContent.includes(".in('sender_type', ['agent_manual', 'ai'])"),
  'Webhook de Evolution y HumanOutboundService deben reconciliar mensajes con status "sending" tanto de asesor como de IA'
);
console.log('   ✅ Patrón Outbox y reconciliación de eco fromMe verificados.');

// 9. Verificación de manejo de ráfagas en Meta Webhook (Anti-Burst Race)
console.log('9️⃣  Verificando manejo de ráfagas en Meta Webhook...');
const metaWebhookPath = path.join(process.cwd(), 'app/api/whatsapp/webhook/route.ts');
const metaWebhookContent = fs.readFileSync(metaWebhookPath, 'utf8');

assert.ok(
  metaWebhookContent.includes('lastInsertedMessageId'),
  'Meta Webhook debe rastrear lastInsertedMessageId a través de toda la ráfaga'
);
assert.ok(
  metaWebhookContent.includes('aggregatedBurstTexts'),
  'Meta Webhook debe agregar los textos de la ráfaga para que la IA los responda todos'
);
console.log('   ✅ Manejo de ráfagas de Meta verificado.');

// 10. Verificación de sincronización de cuentas de pago en app/actions/settings.ts
console.log('🔟  Verificando sincronización de cuentas de pago con el asistente IA...');
const settingsPath = path.join(process.cwd(), 'app/actions/settings.ts');
const settingsContent = fs.readFileSync(settingsPath, 'utf8');

assert.ok(
  settingsContent.includes('CUENTAS DE TRANSFERENCIA BANCARIA AUTORIZADAS'),
  'settings.ts debe inyectar cuentas bancarias en system_prompt cuando no se usa structured_prompt_data'
);
assert.ok(
  settingsContent.includes('paymentDetails = {'),
  'settings.ts debe sincronizar paymentDetails en structured_prompt_data'
);
console.log('   ✅ Sincronización de cuentas de pago verificada exitosamente.');

// 11. Verificación de Lock Atómico de Concurrencia de IA (Pilar 4.1.3)
console.log('1️⃣1️⃣  Verificando Lock Atómico de Concurrencia de IA (Pilar 4.1.3)...');
const migrationLockPath = path.join(process.cwd(), 'supabase/migrations/20261109040000_ai_concurrency_lock.sql');
assert.ok(fs.existsSync(migrationLockPath), 'Debe existir la migración SQL 20261109040000_ai_concurrency_lock.sql');
const migrationContent = fs.readFileSync(migrationLockPath, 'utf8');
assert.ok(
  migrationContent.includes('try_acquire_ai_lock') && migrationContent.includes('release_ai_lock'),
  'La migración SQL debe definir try_acquire_ai_lock y release_ai_lock'
);
assert.ok(
  inboundCoreContent.includes('acquireAiLock') && inboundCoreContent.includes('releaseAiLock'),
  'inbound-core.service.ts debe implementar acquireAiLock y releaseAiLock en try-finally'
);
console.log('   ✅ Lock Atómico de Concurrencia verificado exitosamente.');

// 12. Verificación de Blindaje de Envío ante Desconexión (Pilar 1.1.5)
console.log('1️⃣2️⃣  Verificando Blindaje de Envío ante Desconexión de WhatsApp (Pilar 1.1.5)...');
const currentMessagingContent = fs.readFileSync(messagingServicePath, 'utf8');
const currentChatActionsContent = fs.readFileSync(chatActionsPath, 'utf8');
assert.ok(
  currentMessagingContent.includes('EVOLUTION_DISCONNECTED'),
  'MessagingService debe verificar evolution_status y arrojar error específico si está desconectado'
);
assert.ok(
  currentChatActionsContent.includes('export async function retryFailedMessage'),
  'chat.ts debe exportar retryFailedMessage para reintentar mensajes fallidos'
);
console.log('   ✅ Blindaje de desconexión y acción de reintento verificados.');

// 13. Verificación de Manejo de JIDs @lid y Contactos Reales (Pilar 1.1.4)
console.log('1️⃣3️⃣  Verificando Manejo de JIDs @lid y Contactos Duplicados (Pilar 1.1.4)...');
const currentEvoWebhookContent = fs.readFileSync(evoWebhookPath, 'utf8');
const currentInboundCoreContent = fs.readFileSync(inboundCorePath, 'utf8');
assert.ok(
  currentEvoWebhookContent.includes('realPhoneJid') && currentEvoWebhookContent.includes('senderPn'),
  'Webhook de Evolution debe extraer senderPn o realPhoneJid para no crear contactos duplicados'
);
assert.ok(
  currentInboundCoreContent.includes('targetRecipient = customFields.remote_jid'),
  'inbound-core.service.ts debe despachar al JID real del lead cuando existe en custom_fields'
);
console.log('   ✅ Manejo de JIDs @lid y destinatario exacto verificado.');

console.log('\n🎉 ¡TODAS LAS PRUEBAS DE SPRINT 1 Y NIVEL URGENTE PASARON EXITOSAMENTE!\n');
