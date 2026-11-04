import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  formatImageMessageContent,
  parseImageMessageContent,
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

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE MULTIMEDIA E IMÁGENES PASARON EXITOSAMENTE!\n');
}

runMultimediaTests().catch((err) => {
  console.error('❌ Error en pruebas de multimedia:', err);
  process.exit(1);
});
