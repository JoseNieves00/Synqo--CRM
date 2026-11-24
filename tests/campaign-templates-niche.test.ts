import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCampaignTemplates } from '../lib/crm/campaign-templates';

test('1. Negocio de productos artesanales (Filippo Kids) genera plantillas de producto y NUNCA de citas/médicas', () => {
  const templates = resolveCampaignTemplates({
    systemPrompt: 'Filippo Kids - Fábrica de cocinitas infantiles en madera MDF artesanal en Valledupar. Plan Separe con abono inicial. Envíos nacionales con pago contraentrega.',
    enabledModules: { native_calendar: false },
    orgName: 'Filippo Kids',
  });

  assert.strictEqual(templates.length, 5);

  // Ninguna plantilla debe ser de citas médicas o diagnóstico
  const hasMedical = templates.some((t) => t.id === 'appointment_free_eval' || t.title.includes('Cita Gratis'));
  assert.strictEqual(hasMedical, false, 'No debe mostrar plantillas de citas para un negocio de cocinitas');

  // Debe incluir Plan Separe
  const hasPlanSepare = templates.some((t) => t.id === 'plan_separe_hook');
  assert.strictEqual(hasPlanSepare, true, 'Debe incluir plantilla de Plan Separe');

  // Debe incluir Contraentrega
  const hasContraentrega = templates.some((t) => t.id === 'contraentrega_national_hook');
  assert.strictEqual(hasContraentrega, true, 'Debe incluir plantilla de Pago Contraentrega Nacional');

  // Debe incluir Mini-Closet / Artesanal
  const hasCloset = templates.some((t) => t.id === 'pedagogical_benefits_closet');
  assert.strictEqual(hasCloset, true, 'Debe incluir plantilla de Mini-Closet y beneficios pedagógicos');

  // Debe incluir Flete
  const hasFlete = templates.some((t) => t.id === 'flete_shipping_preference');
  assert.strictEqual(hasFlete, true, 'Debe incluir plantilla de flete');
});

test('2. Negocio de servicios con agenda médica genera plantillas de citas y diagnóstico', () => {
  const templates = resolveCampaignTemplates({
    systemPrompt: 'Clínica Odontológica - Citas y valoración con especialista.',
    enabledModules: { native_calendar: true },
    orgName: 'Clínica Dental',
  });

  assert.strictEqual(templates.length, 4);

  const hasEval = templates.some((t) => t.id === 'appointment_free_eval');
  assert.strictEqual(hasEval, true, 'Debe incluir valoración / cita gratis para clínicas');
});
