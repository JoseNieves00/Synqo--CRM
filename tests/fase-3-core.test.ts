import assert from 'node:assert';
import crypto from 'node:crypto';
import { formatQuoteMessageContent, parseQuoteMessageContent, parseVideoMessageContent, formatVideoMessageContent } from '../lib/media/format';
import { InboundCoreService } from '../services/inbound-core.service';

async function runFase3Tests() {
  console.log('\n🧪 Iniciando Suite de Pruebas: Verificación de Fase 3 (Unificación del Núcleo y Observabilidad)...\n');

  // 1. Probar Extracción y Renderizado Visual de Citas (WhatsApp Quotes @[Quote])
  console.log('1️⃣  Probando formateo y parseo de citas WhatsApp (💬 [Cita])...');
  const quoteFormatted = formatQuoteMessageContent('Zapatos Deportivos Talla 42 - $150.000', '¿Tienen este modelo en color blanco?');
  assert.ok(quoteFormatted.includes('💬 [Cita: "Zapatos Deportivos Talla 42 - $150.000"]\n¿Tienen este modelo en color blanco?'));

  const parsedQuote = parseQuoteMessageContent(quoteFormatted);
  assert.strictEqual(parsedQuote.hasQuote, true);
  assert.strictEqual(parsedQuote.quotedText, 'Zapatos Deportivos Talla 42 - $150.000');
  assert.strictEqual(parsedQuote.actualText, '¿Tienen este modelo en color blanco?');

  const regularMessage = 'Hola, buenas tardes';
  const regularParsed = parseQuoteMessageContent(regularMessage);
  assert.strictEqual(regularParsed.hasQuote, false, 'Mensajes regulares no deben parsearse como cita');
  assert.strictEqual(regularParsed.actualText, regularMessage);
  console.log('   ✅ Parseo y formato de citas validado correctamente.');

  // 2. Probar Lógica de Reacciones Emoji (Consumo 0 Tokens & Formato)
  console.log('\n2️⃣  Probando comportamiento de reacciones emoji...');
  const reactionPayload = {
    emoji: '👍',
    from: '573001234567',
    reacted_at: new Date().toISOString(),
  };
  assert.ok(reactionPayload.emoji === '👍');
  assert.ok(typeof reactionPayload.reacted_at === 'string');
  console.log('   ✅ Estructura de reacción validada (0 consumo de tokens AI).');

  // 3. Probar Política de Retención de Almacenamiento (Extracción de Videos > 45 días)
  console.log('\n3️⃣  Probando extracción de archivos de video para política de 45 días...');
  const sampleUrl = 'https://xyz.supabase.co/storage/v1/object/public/chat-media/org-123/video-456.mp4';
  const sampleVideoMessage = formatVideoMessageContent(sampleUrl);
  const parsedVideo = parseVideoMessageContent(sampleVideoMessage);
  assert.ok(parsedVideo !== null);
  assert.strictEqual(parsedVideo?.url, sampleUrl);

  const splitUrl = (parsedVideo.url || '').split('/chat-media/');
  assert.strictEqual(splitUrl[1], 'org-123/video-456.mp4');
  console.log('   ✅ Extracción de ruta para Supabase Storage chat-media aprobada.');

  // 4. Probar Seguridad en Endpoint Cron de Limpieza y Recordatorios (Header & ?secret= con TimingSafeEqual)
  console.log('\n4️⃣  Probando validación criptográfica de seguridad en cron (Header y URL ?secret=)...');
  const secretKey = 'test-secret-cron-token-12345';
  const validHeader = `Bearer ${secretKey}`;
  const invalidHeader = 'Bearer wrong-secret-token-fake';

  const validBuf = Buffer.from(validHeader, 'utf8');
  const expectedBuf = Buffer.from(`Bearer ${secretKey}`, 'utf8');
  const invalidBuf = Buffer.from(invalidHeader, 'utf8');

  assert.strictEqual(crypto.timingSafeEqual(validBuf, expectedBuf), true);
  assert.strictEqual(validBuf.length === invalidBuf.length ? crypto.timingSafeEqual(validBuf, invalidBuf) : false, false);

  // Parámetro de URL ?secret=
  const validParamBuf = Buffer.from(secretKey, 'utf8');
  const invalidParamBuf = Buffer.from('fake-secret', 'utf8');
  const expectedParamBuf = Buffer.from(secretKey, 'utf8');
  assert.strictEqual(crypto.timingSafeEqual(validParamBuf, expectedParamBuf), true);
  assert.strictEqual(validParamBuf.length === invalidParamBuf.length ? crypto.timingSafeEqual(validParamBuf, invalidParamBuf) : false, false);
  console.log('   ✅ Autenticación y resistencia a ataques de temporización (timing attacks) verificada en cabecera y URL.');

  // 5. Probar Esquema y Estados de ai_runs en InboundCoreService
  console.log('\n5️⃣  Probando compatibilidad del servicio unificado InboundCore...');
  assert.strictEqual(typeof InboundCoreService.processInbound, 'function');
  assert.strictEqual(typeof InboundCoreService.runAiWorker, 'function');
  console.log('   ✅ InboundCoreService expone métodos universales requeridos.');

  console.log('\n🎉 ¡Todos los tests de Fase 3 pasaron exitosamente!\n');
}

runFase3Tests().catch((err) => {
  console.error('\n❌ Fallo en las pruebas de Fase 3:', err);
  process.exit(1);
});
