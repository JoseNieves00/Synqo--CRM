import assert from 'node:assert/strict';
import test from 'node:test';
import { pushPromptVersion } from '../lib/ai/prompt-assistant/versions';
import { generateStarterPromptFromName } from '../lib/ai/prompt-assistant/starter';

test('pushPromptVersion solo conserva las 3 versiones más recientes', () => {
  let versions: any[] = [];
  versions = pushPromptVersion(versions, 'Versión inicial', 'V1');
  assert.equal(versions.length, 1);

  versions = pushPromptVersion(versions, 'Segunda versión de prueba', 'V2');
  assert.equal(versions.length, 2);

  versions = pushPromptVersion(versions, 'Tercera versión con ajustes', 'V3');
  assert.equal(versions.length, 3);

  // Cuarta versión: debe descartar la más antigua y mantener exactamente 3
  versions = pushPromptVersion(versions, 'Cuarta versión con catálogo nuevo', 'V4');
  assert.equal(versions.length, 3);
  assert.equal(versions[0].reason, 'V4');
  assert.equal(versions[1].reason, 'V3');
  assert.equal(versions[2].reason, 'V2');
});

test('generateStarterPromptFromName infiere correctamente según el nombre comercial', () => {
  const kidsPrompt = generateStarterPromptFromName('Filippo Kids Moda Infantil');
  assert.ok(kidsPrompt.includes('Empresa & Identidad'));
  assert.ok(kidsPrompt.includes('infantil'));
  assert.ok(kidsPrompt.includes('Medios de Pago'));
  assert.ok(kidsPrompt.includes('Relevo Humano'));

  const dentalPrompt = generateStarterPromptFromName('Clínica Dental Sonrisas');
  assert.ok(dentalPrompt.includes('salud'));
  assert.ok(dentalPrompt.includes('Catálogo & Servicios'));

  const foodPrompt = generateStarterPromptFromName('Burger & Bistro Gastro');
  assert.ok(foodPrompt.includes('Restaurante') || foodPrompt.includes('gastronómica'));

  const defaultPrompt = generateStarterPromptFromName('Consultoría Integral SAS');
  assert.ok(defaultPrompt.includes('Empresa & Identidad'));
  assert.ok(defaultPrompt.includes('Catálogo & Oferta'));
});
