import { describe, it } from 'node:test';
import assert from 'node:assert';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import {
  formatImageMessageContent,
  parseImageMessageContent,
  formatDocumentMessageContent,
  parseDocumentMessageContent,
  stripPhotoUrlsFromText,
  extractPhotoUrlsFromText,
  isPaymentReceiptHint,
} from '../lib/media/format';
import { isCourtesyClosingMessage } from '../services/inbound-core.service';
import { MessagingService } from '../services/messaging.service';
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

  // 6. Ciclo Completo de Adición, Eliminación y Persistencia en Base de Datos
  console.log('\n6️⃣  Probando ciclo de Adición, Guardado, Visualización y Eliminación en Base de Datos...');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceKey) {
    // Buscar una organización de prueba (Empresa Synqo o PRUEBA EVOLUTION, NUNCA clientes en producción)
    const orgsRes = await fetch(`${supabaseUrl}/rest/v1/organizations?name=eq.Empresa%20Synqo&select=id,name,system_prompt,structured_prompt_data`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    const [testOrg] = await orgsRes.json();
    assert.ok(testOrg, 'La organización de prueba Empresa Synqo debe existir en Supabase');
    const testOrgId = testOrg.id;

    // A. Consultar estado actual exacto
    const originalPrompt = testOrg.system_prompt || '';
    const originalStructuredData = testOrg.structured_prompt_data || {};
    const originalGallery = Array.isArray(originalStructuredData.gallery) ? originalStructuredData.gallery : [];

    // B. Simular Adición de Nueva Foto
    const newTestPhoto = {
      id: `photo-test-${Date.now()}`,
      name: 'Producto Test de Prueba Automatizada',
      url: 'https://eqsvpwpjalrjcfxecddi.supabase.co/storage/v1/object/public/chat-media/test-item.png',
    };

    const galleryWithAddition = [...originalGallery, newTestPhoto];
    const cleanText = stripPhotoUrlsFromText(originalPrompt).trim();
    const galleryBlock =
      '\n\n=== CATÁLOGO VISUAL DE FOTOS (DISPATCH INTERNO) ===\n' +
      galleryWithAddition.map((g: any) => `- ${g.name}: ${g.url}`).join('\n');
    const compiledWithAddition = cleanText + galleryBlock;

    // C. Guardar en Base de Datos
    const patchRes = await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${testOrgId}`, {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        system_prompt: compiledWithAddition,
        structured_prompt_data: {
          ...originalStructuredData,
          gallery: galleryWithAddition,
        },
      }),
    });
    assert.strictEqual(patchRes.status, 200, 'El guardado en base de datos debe responder 200');

    // D. Verificar que se guardó correctamente en BD
    const verifyAddRes = await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${testOrgId}&select=id,system_prompt,structured_prompt_data`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    const [savedOrg] = await verifyAddRes.json();
    const savedGallery = savedOrg.structured_prompt_data?.gallery || [];
    assert.ok(
      savedGallery.some((g: any) => g.id === newTestPhoto.id && g.name === newTestPhoto.name),
      'La nueva foto debe persistir en structured_prompt_data.gallery en Supabase'
    );
    assert.ok(
      savedOrg.system_prompt.includes(newTestPhoto.name),
      'El system_prompt compilado debe contener el nombre del producto en el catálogo visual'
    );

    // E. Restaurar el estado original 100% exacto en Base de Datos
    await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${testOrgId}`, {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        system_prompt: originalPrompt,
        structured_prompt_data: originalStructuredData,
      }),
    });

    // F. Verificar eliminación en BD
    const verifyDeleteRes = await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${testOrgId}&select=id,structured_prompt_data`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    const [restoredOrg] = await verifyDeleteRes.json();
    assert.strictEqual(
      (restoredOrg.structured_prompt_data?.gallery || []).some((g: any) => g.id === newTestPhoto.id),
      false,
      'La foto eliminada ya no debe existir en la base de datos'
    );
    console.log('   ✅ Ciclo completo de Adición, Guardado, Visualización y Eliminación verificado en Supabase.');
  } else {
    console.log('   ⚠️ Supabase URL o Service Key no disponibles en entorno local de pruebas.');
  }

  // 7. Prueba de Detección de Cortesía y Cierre Elegante (👍 Reaction en vez de texto)
  console.log('\n7️⃣  Probando Detección de Mensajes de Cortesía ("Ok gracias") para Reacción con 👍...');
  assert.strictEqual(isCourtesyClosingMessage('Ok gracias'), true, 'Ok gracias debe detectarse como cortesía');
  assert.strictEqual(isCourtesyClosingMessage('Muchas gracias!'), true, 'Muchas gracias debe detectarse como cortesía');
  assert.strictEqual(isCourtesyClosingMessage('listo gracias'), true, 'listo gracias debe detectarse como cortesía');
  assert.strictEqual(isCourtesyClosingMessage('dale muchas gracias feliz día'), true, 'despedida cortés debe detectarse');
  assert.strictEqual(isCourtesyClosingMessage('Quiero una cocina pequeña'), false, 'Pregunta de venta no debe detectarse como cortesía');
  assert.strictEqual(isCourtesyClosingMessage('gracias, cuanto vale?'), false, 'Pregunta con gracias no debe cerrarse prematuramente');
  assert.strictEqual(typeof MessagingService.sendReactionMessage, 'function', 'sendReactionMessage debe estar expuesto');
  console.log('   ✅ Detección de cortesía y despacho de reacciones 👍 aprobado con 0 tokens de IA.');

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE MULTIMEDIA E IMÁGENES PASARON EXITOSAMENTE!\n');
}

runMultimediaTests().catch((err) => {
  console.error('❌ Error en pruebas de multimedia:', err);
  process.exit(1);
});
