import assert from 'node:assert/strict';
import test from 'node:test';
import { stripRedundantCatalogListAfterCards } from '../lib/media/format';

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
