import assert from 'node:assert/strict';
import test from 'node:test';
import { stripRedundantCatalogListAfterCards, extractSentInformationSummary } from '../lib/media/format';
import { isExplicitRejectionSignal } from '../lib/ai/follow-up-types';

test('1. Anti-Repetición: stripRedundantCatalogListAfterCards elimina marcadores internos de tarjeta y especificaciones repetidas', () => {
  const rawAssistantOutput = `[Foto oficial enviada]: Casita de ensueños · $630.000
Hermosa casita de madera para niñas. Medidas: 1,10 m alto x 72 cm ancho x 26 cm prof.
¿Te gustaría apartarla con Plan Separe o necesitas más información?`;

  const cleaned = stripRedundantCatalogListAfterCards(rawAssistantOutput);

  // No debe contener el marcador interno ni el texto repetido de la foto
  assert.ok(!cleaned.includes('[Foto oficial enviada]'), 'Debe eliminar el marcador [Foto oficial enviada]');
  assert.ok(cleaned.includes('¿Te gustaría apartarla con Plan Separe o necesitas más información?'), 'Debe conservar la pregunta limpia de cierre');
});

test('2. Anti-Repetición: Poda determinística elimina ecos de prefijo "[Imagen enviada]" y "[Tarjeta visual]"', () => {
  const sampleWithCard = `[Tarjeta visual enviada]: Cocina Chef · $350.000
- Incluye 12 accesorios de madera
¿Te gustaría apartarla hoy?`;

  const cleaned = stripRedundantCatalogListAfterCards(sampleWithCard);
  assert.ok(!cleaned.includes('[Tarjeta visual enviada]'), 'Debe podar el marcador');
  assert.ok(!cleaned.includes('- Incluye 12 accesorios'), 'Debe podar las viñetas repetitivas');
  assert.ok(cleaned.includes('¿Te gustaría apartarla hoy?'), 'Debe conservar el mensaje de cierre');
});

test('3. Anti-Repetición: Limpieza de frases meta-anunciando el envío de fotos', () => {
  const metaText = `He enviado la foto de la casita de ensueños. ¿Para qué ciudad sería la entrega?`;
  const cleaned = stripRedundantCatalogListAfterCards(metaText);

  assert.ok(!cleaned.toLowerCase().includes('he enviado la foto'), 'Debe podar frases meta-referenciales');
  assert.ok(cleaned.includes('¿Para qué ciudad sería la entrega?'), 'Debe conservar la pregunta de avance');
});

test('4. Anti-Repetición: stripCardSpecs poda "Aquí tienes la tarjeta..." y precio/medidas en prosa sin borrar abono ni personalización', () => {
  const sample = `Aquí tienes la tarjeta de la Casita de los sueños. 🏡✨ Su precio es de $630.000 COP y mide 110 cm de alto x 72 cm de ancho x 26 cm de profundidad.

Recuerda que puedes personalizarla con el tema de Barbie. El abono inicial para apartarla es de $63.000 COP. ¿Te gustaría proceder con el abono?`;

  const cleaned = stripRedundantCatalogListAfterCards(sample, { stripCardSpecs: true });

  assert.ok(!cleaned.includes('Aquí tienes la tarjeta'), 'Debe eliminar la frase meta-referencial');
  assert.ok(!cleaned.includes('$630.000 COP'), 'Debe eliminar el precio repetido de la tarjeta');
  assert.ok(!cleaned.includes('110 cm de alto'), 'Debe eliminar las medidas repetidas de la tarjeta');
  assert.ok(cleaned.includes('personalizarla con el tema de Barbie'), 'Debe conservar la personalización');
  assert.ok(cleaned.includes('$63.000 COP'), 'Debe conservar el valor del abono inicial');
});

test('5. Memoria del agente: extractSentInformationSummary registra abono inicial, personalización y precios ya enviados', () => {
  const history = [
    {
      sender_type: 'ai',
      content: 'Recuerda que puedes personalizarla con el tema de Barbie. El abono inicial para apartarla es de $63.000 COP.',
    },
    {
      sender_type: 'ai',
      content: 'Su precio es de $630.000 COP y mide 110 cm de alto.',
    },
  ];

  const summary = extractSentInformationSummary(history);
  assert.ok(summary.some((s) => s.includes('Abono inicial') && s.includes('$63.000 COP')));
  assert.ok(summary.some((s) => s.includes('personalización')));
  assert.ok(summary.some((s) => s.includes('Precios y medidas')));
});

test('6. Rechazo explícito: isExplicitRejectionSignal detecta despedidas/rechazos claros y respeta aplazamientos', () => {
  assert.equal(isExplicitRejectionSignal('Bueno chao no me inporta'), true);
  assert.equal(isExplicitRejectionSignal('No me interesa gracias'), true);
  assert.equal(isExplicitRejectionSignal('No quiero continuar, dejemos así'), true);
  assert.equal(isExplicitRejectionSignal('Lo pienso y luego te aviso'), false);
  assert.equal(isExplicitRejectionSignal('Muchas gracias, buen día'), false);
});
