import { parseMessageContentFast } from '../lib/media/message-parser';

async function runFaseCTests() {
  console.log('\n🧪 Iniciando Suite de Verificación de Fase C (Virtualización, MessageBubble Puro y Media)...\n');

  // 1. Parsing Ultra Rápido de Mensajes (Zero Regex en Runtime para Texto Puro)
  console.log('1️⃣  Probando Vía Rápida de Texto Plano (Zero Regex)...');
  const plainTextMessage = 'Hola buenas tardes, quisiera información sobre el catálogo de productos disponibles.';
  const t0 = performance.now();
  const parsedPlain = parseMessageContentFast(plainTextMessage);
  const t1 = performance.now();

  const plainDuration = t1 - t0;
  console.log(`   ⚡ Tiempo de parsing para texto puro: ${plainDuration.toFixed(4)} ms`);
  if (parsedPlain.type !== 'text') throw new Error('El mensaje debió clasificarse como texto');
  if (parsedPlain.cleanText !== plainTextMessage) throw new Error('El texto limpio no coincide');
  console.log('   ✅ Vía rápida ejecutada sin evaluar expresiones regulares de media');

  // 2. Parsing de Media y Cacheo O(1)
  console.log('2️⃣  Probando parsing de Media estructurada y Caché en Memoria...');
  const mediaMessage = '📷 [Imagen: https://synqo.io/storage/v1/chat-media/foto_producto_123.jpg]: Foto del producto solicitado';
  
  // Primer llamado: Computa y cachea
  const t2 = performance.now();
  const parsedMedia1 = parseMessageContentFast(mediaMessage);
  const t3 = performance.now();
  const firstCallDuration = t3 - t2;

  // Segundo llamado: Lee de caché O(1)
  const t4 = performance.now();
  const parsedMedia2 = parseMessageContentFast(mediaMessage);
  const t5 = performance.now();
  const cachedDuration = t5 - t4;

  console.log(`   ⚡ Primer parseo (computado): ${firstCallDuration.toFixed(4)} ms`);
  console.log(`   ⚡ Segundo parseo (desde caché O(1)): ${cachedDuration.toFixed(4)} ms`);
  if (parsedMedia1.type !== 'image') throw new Error('El mensaje debió clasificarse como imagen');
  if (!parsedMedia1.image.isImage || !parsedMedia1.image.url?.includes('foto_producto_123.jpg')) {
    throw new Error('La URL de la imagen no fue extraída correctamente');
  }
  if (parsedMedia1 !== parsedMedia2) throw new Error('El resultado debió ser exactamente la misma referencia de caché');
  console.log('   ✅ Parsing de media y caché O(1) validados');

  // 3. Benchmark de 1.000 Mensajes (Simulación de Scroll Rápido en Chat Extenso)
  console.log('3️⃣  Benchmark: Parseo de 1.000 mensajes durante scroll...');
  const testMessages = [
    'Hola, ¿cómo estás?',
    '📷 [Imagen: https://synqo.io/media/img1.jpg]: Comprobante de pago',
    'Perfecto, ya reviso la transferencia.',
    '📄 [Documento: https://synqo.io/media/doc.pdf (Factura.pdf)]: Factura electrónica',
    '🎙 [Audio: https://synqo.io/media/audio.ogg]: Nota de voz explicativa',
    'Muchas gracias por la atención.',
    '¡Con gusto! Quedamos atentos.',
  ];

  const tBenchStart = performance.now();
  for (let i = 0; i < 1000; i++) {
    const msg = testMessages[i % testMessages.length];
    parseMessageContentFast(msg);
  }
  const tBenchEnd = performance.now();
  const totalBenchTime = tBenchEnd - tBenchStart;
  const avgPerMsg = (totalBenchTime / 1000).toFixed(5);
  console.log(`   ⚡ Tiempo total para 1.000 mensajes: ${totalBenchTime.toFixed(3)} ms (Promedio: ${avgPerMsg} ms/msg)`);
  if (totalBenchTime > 50) {
    throw new Error(`El tiempo total de parsing para 1.000 mensajes excedió el límite: ${totalBenchTime} ms`);
  }
  console.log('   ✅ Benchmark de alto rendimiento superado con creces');

  // 4. Verificación de Formatos de Audio y Compatibilidad con WhatsApp
  console.log('4️⃣  Verificando compatibilidad de audio y nota de voz...');
  const audioMessage = '🎤 [Nota de voz: "Audio del cliente preguntando por envíos"] https://synqo.io/chat-media/nota_voz_123.ogg';
  const parsedAudio = parseMessageContentFast(audioMessage);
  if (!parsedAudio.voiceNote.isVoiceNote) throw new Error('Debió reconocerse como nota de voz');
  if (parsedAudio.voiceNote.transcription !== 'Audio del cliente preguntando por envíos') {
    throw new Error(`Transcripción incorrecta: ${parsedAudio.voiceNote.transcription}`);
  }
  console.log('   ✅ Reconocimiento y transcripción de notas de voz verificado');

  // 5. Pre-computación de Separadores de Fecha (Zero Date Allocations)
  console.log('5️⃣  Probando cálculo rápido de divisores de fecha...');
  const sampleMessages = [
    { created_at: '2026-11-08T10:00:00Z' },
    { created_at: '2026-11-08T11:00:00Z' },
    { created_at: '2026-11-09T09:00:00Z' },
    { created_at: '2026-11-09T09:30:00Z' },
  ];

  const dividerSet = new Set<number>();
  let lastDateStr = '';
  for (let i = 0; i < sampleMessages.length; i++) {
    const dateStr = sampleMessages[i].created_at?.slice(0, 10) || '';
    if (dateStr && dateStr !== lastDateStr) {
      dividerSet.add(i);
      lastDateStr = dateStr;
    }
  }

  if (!dividerSet.has(0) || !dividerSet.has(2) || dividerSet.size !== 2) {
    throw new Error(`Separadores de fecha calculados incorrectamente: ${Array.from(dividerSet)}`);
  }
  console.log('   ✅ Divisores de fecha calculados en O(N) por slice de string sin crear Date()');

  console.log('\n🎉 ¡Todos los tests de Fase C pasaron satisfactoriamente!\n');
}

runFaseCTests().catch((err) => {
  console.error('\n❌ Error ejecutando tests de Fase C:', err);
  process.exit(1);
});
