import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  formatImageMessageContent,
  parseImageMessageContent,
  formatDocumentMessageContent,
  parseDocumentMessageContent,
  stripPhotoUrlsFromText,
  extractPhotoUrlsFromText,
  isPaymentReceiptHint,
} from '../lib/media/format';
import { SendWhatsAppImageToolSchema } from '../lib/validations/tool-calls.schema';

async function runMultimediaTests() {
  console.log('\n🧪 Iniciando Suite de Pruebas: Soporte Integral de Imágenes (Zero Token Waste)...');

  // 1. Formateo y Parsing Canónico de Imágenes
  console.log('\n1️⃣  Probando formateo y parseo de mensajes multimedia...');
  const testUrl = 'https://supabase.co/storage/v1/object/public/chat-media/org1/c1/foto.jpg';
  const testCaption = 'Cocinita Mediana personalizada en madera MDF';

  const formattedWithCaption = formatImageMessageContent(testUrl, testCaption);
  assert.strictEqual(
    formattedWithCaption,
    `📷 [Imagen: ${testUrl}]: ${testCaption}`,
    'El formato canónico con pie de foto debe coincidir'
  );

  const parsed1 = parseImageMessageContent(formattedWithCaption);
  assert.strictEqual(parsed1.isImage, true);
  assert.strictEqual(parsed1.url, testUrl);
  assert.strictEqual(parsed1.caption, testCaption);

  const formattedWithoutCaption = formatImageMessageContent(testUrl);
  assert.strictEqual(
    formattedWithoutCaption,
    `📷 [Imagen: ${testUrl}]`,
    'El formato canónico sin pie de foto debe coincidir'
  );

  const parsed2 = parseImageMessageContent(formattedWithoutCaption);
  assert.strictEqual(parsed2.isImage, true);
  assert.strictEqual(parsed2.url, testUrl);
  assert.strictEqual(parsed2.caption, '');

  // Parseo de Markdown Image alternativo ![alt](url)
  const mdImg = `![Mi Foto](${testUrl})`;
  const parsedMd = parseImageMessageContent(mdImg);
  assert.strictEqual(parsedMd.isImage, true);
  assert.strictEqual(parsedMd.url, testUrl);
  assert.strictEqual(parsedMd.caption, 'Mi Foto');

  console.log('   ✅ Formateo y parsing bidireccional de imágenes aprobado.');

  // 2. Heurística Zero-Cost de Comprobantes de Pago
  console.log('\n2️⃣  Probando heurística Zero-Cost de Comprobantes de Pago (isPaymentReceiptHint)...');
  const paymentTexts = [
    'Hola ya te hice la transferencia por Nequi',
    'Aqui te dejo el comprobante del pago',
    'Listo ya pagué por Bancolombia',
    'Te adjunto el pantallazo de la consignación',
    'Ya transferí los 410.000 del anticipo',
    'Mira el recibo de daviplata',
  ];

  for (const text of paymentTexts) {
    assert.strictEqual(
      isPaymentReceiptHint(text),
      true,
      `Debe detectar comprobante de pago en: "${text}"`
    );
  }

  const nonPaymentTexts = [
    'Hola buenas tardes, ¿tienen fotos de las cocinitas?',
    '¿Qué precio tiene la cocina mediana?',
    '¿Dónde están ubicados?',
    '¿Hacen envíos a Barranquilla?',
  ];

  for (const text of nonPaymentTexts) {
    assert.strictEqual(
      isPaymentReceiptHint(text),
      false,
      `NO debe marcar como pago el texto comercial: "${text}"`
    );
  }

  console.log('   ✅ Heurística de detección de pagos sin consumo de tokens de visión aprobada.');

  // 3. Validación de Schema de Herramienta send_whatsapp_image
  console.log('\n3️⃣  Probando esquema Zod de herramienta send_whatsapp_image...');
  const validArgs = {
    image_url: 'https://cdn.synqo.dev/chat-media/cocinita-mediana.jpg',
    caption: 'Cocinita Mediana Filippo Kids con accesorios',
  };
  const parsedArgs = SendWhatsAppImageToolSchema.parse(validArgs);
  assert.strictEqual(parsedArgs.image_url, validArgs.image_url);
  assert.strictEqual(parsedArgs.caption, validArgs.caption);

  // Debe rechazar URLs inválidas
  assert.throws(() => {
    SendWhatsAppImageToolSchema.parse({
      image_url: 'not-a-valid-url',
    });
  }, 'Debe rechazar URLs con formato inválido');

  console.log('   ✅ Schema de Function Calling para send_whatsapp_image aprobado.');

  // 4. Formateo y Parsing de Mensajes de Documentos / Archivos
  console.log('\n4️⃣  Probando formateo y parseo de mensajes de documentos...');
  const docUrl = 'https://supabase.co/storage/v1/object/public/chat-media/org1/c1/catalogo-2026.pdf';
  const docName = 'Catalogo-Filippo-2026.pdf';
  const docCaption = 'Aquí tienes el portafolio completo en formato PDF';

  const formattedDoc = formatDocumentMessageContent(docUrl, docName, docCaption);
  assert.strictEqual(
    formattedDoc,
    `📄 [Documento: ${docUrl} (${docName})]: ${docCaption}`,
    'El formato de documento canónico debe ser exacto'
  );

  const parsedDoc = parseDocumentMessageContent(formattedDoc);
  assert.strictEqual(parsedDoc.isDocument, true);
  assert.strictEqual(parsedDoc.url, docUrl);
  assert.strictEqual(parsedDoc.fileName, docName);
  assert.strictEqual(parsedDoc.caption, docCaption);
  console.log('   ✅ Formateo y parsing de documentos / archivos aprobado.');

  // 5. Extracción y Limpieza Invisible de Fotos de Productos
  console.log('\n5️⃣  Probando extracción y desinfección invisible de fotos de productos...');
  const rawPromptWithUrls = `# EMPRESA: Filippo Kids
Ubicación: Valledupar

# PRODUCTOS Y PRECIOS:
- Cocina mediana ($410.000): Con stickers personalizados. [foto: https://cdn.synqo.dev/cocina-med.png]
- Cocina pequeña ($360.000): Diseño compacto. [foto: https://cdn.synqo.dev/cocina-peq.png]

=== CATÁLOGO VISUAL DE FOTOS (DISPATCH INTERNO) ===
- Casita de Madera: https://cdn.synqo.dev/casita.png
- Cocina + nevera: https://cdn.synqo.dev/cocina-nevera.png`;

  const extractedPhotos = extractPhotoUrlsFromText(rawPromptWithUrls);
  assert.strictEqual(extractedPhotos.length, 4, 'Debe extraer las 4 fotos vinculadas');
  assert.ok(extractedPhotos.some((p) => p.name.includes('Cocina mediana')));
  assert.ok(extractedPhotos.some((p) => p.name.includes('Cocina pequeña')));
  assert.ok(extractedPhotos.some((p) => p.name.includes('Casita de Madera')));
  assert.ok(extractedPhotos.some((p) => p.name.includes('Cocina + nevera')));

  const cleanedText = stripPhotoUrlsFromText(rawPromptWithUrls);
  assert.strictEqual(cleanedText.includes('http'), false, 'El texto desinfectado no debe contener ninguna URL técnica');
  assert.strictEqual(cleanedText.includes('CATÁLOGO VISUAL'), false, 'No debe contener el bloque interno de fotos');
  assert.ok(cleanedText.includes('Cocina mediana ($410.000): Con stickers personalizados.'));
  console.log('   ✅ Extracción y desinfección invisible de fotos aprobada.');

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE MULTIMEDIA E IMÁGENES PASARON EXITOSAMENTE!\n');
}

runMultimediaTests().catch((err) => {
  console.error('❌ Error en pruebas de multimedia:', err);
  process.exit(1);
});
