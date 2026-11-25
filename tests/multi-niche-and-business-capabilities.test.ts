import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractOrganizationCapabilities,
  extractPhysicalAddressFromPrompt,
  diagnoseCopilotTurn,
} from '../lib/ai/copilot-engine';

test('1. Multi-Nicho: Clínica dental con valoración gratis y sede física presencial', () => {
  const dentalPrompt = `
Somos Odontología Especializada Sonrisas.
Estamos ubicados en: Carrera 15 # 85-30, consultorio 402, Bogotá.
Ofrecemos valoración odontológica inicial sin costo para evaluar tu caso.
Atendemos citas presenciales de lunes a sábado de 8am a 6pm.
`;

  const caps = extractOrganizationCapabilities({ enabled_modules: { native_calendar: true, orders: false } }, dentalPrompt);

  assert.equal(caps.businessModel, 'services');
  assert.equal(caps.allowsInPerson, true);
  assert.ok(caps.physicalAddress?.includes('Carrera 15 # 85-30'), 'Debe extraer la dirección exacta de la sede');
  assert.equal(caps.hookCategory, 'free_assessment');
  assert.ok(caps.primaryHook.toLowerCase().includes('valoración o diagnóstico inicial sin costo'));

  const prescription = diagnoseCopilotTurn({
    history: [{ sender_type: 'lead', content: 'Buenas, me duelen las muelas y quiero saber cuánto cobran' }],
    organization: { system_prompt: dentalPrompt, enabled_modules: { native_calendar: true, orders: false } },
  });

  assert.ok(prescription.copilotDirective.includes('check_native_availability'), 'Debe dirigir a agendar disponibilidad');
  assert.ok(prescription.prohibitedActions.some((a) => a.toLowerCase().includes('envíos') || a.toLowerCase().includes('fletes') || a.toLowerCase().includes('paquetes')), 'Debe prohibir fletes/paquetes en servicios');
});

test('2. Multi-Nicho: Agencia de marketing 100% virtual por Google Meet / Zoom', () => {
  const virtualAgencyPrompt = `
Somos GrowthFlow, agencia de crecimiento digital para e-commerce.
Nuestras sesiones de estrategia son 100% virtuales vía Google Meet o Zoom.
No contamos con sede física abierta al público ya que operamos de forma remota.
`;

  const caps = extractOrganizationCapabilities({ enabled_modules: { native_calendar: true, orders: false } }, virtualAgencyPrompt);

  assert.equal(caps.businessModel, 'services');
  assert.equal(caps.allowsVirtual, true);
  assert.equal(caps.allowsInPerson, false);
  assert.equal(caps.physicalAddress, null, 'No debe alucinar dirección física');
  assert.equal(caps.hookCategory, 'virtual_or_inperson');
  assert.ok(caps.primaryHook.includes('100% virtual vía Google Meet o Zoom'));
});

test('3. Multi-Nicho: Tienda de productos con Plan Separe (Filippo Kids)', () => {
  const productPrompt = `
Somos Filippo Kids. Fabricamos y comercializamos casitas de madera y cocinas infantiles.
Manejamos envíos nacionales a todo el país y Plan Separe desde $50.000 para apartar el modelo favorito.
`;

  const caps = extractOrganizationCapabilities({ enabled_modules: { orders: true, native_calendar: false } }, productPrompt);

  assert.equal(caps.businessModel, 'products');
  assert.equal(caps.canOfferPlanSepare, true);
  assert.equal(caps.hookCategory, 'separe');

  // Consulta consultiva sobre estatura (1.35m)
  const prescription = diagnoseCopilotTurn({
    history: [{ sender_type: 'lead', content: 'Hola mi niña mide 1.35 metros será que le gusta?' }],
    organization: { system_prompt: productPrompt, enabled_modules: { orders: true } },
  });

  assert.equal(prescription.tacticKey, 'consultative_advice_and_card');
  assert.ok(prescription.copilotDirective.includes('responde primero su duda'), 'Debe priorizar responder la duda de estatura');
  assert.ok(prescription.prohibitedActions.some((p) => p.includes('ignorar la pregunta')), 'Debe prohibir ignorar la duda');
});

test('4. Multi-Nicho: Negocio Híbrido (Carpintería a medida + Instalación en sitio)', () => {
  const hybridPrompt = `
Fabricamos muebles modulares y cocinas integrales sobre medida.
Enviamos productos y también agendamos visitas de instalación y toma de medidas a domicilio o cita en taller en Calle 72 # 10-34.
Plan separe disponible.
`;

  const caps = extractOrganizationCapabilities({ enabled_modules: { orders: true, native_calendar: true } }, hybridPrompt);

  assert.equal(caps.businessModel, 'hybrid');
  assert.equal(caps.allowsInPerson, true);
  assert.ok(caps.physicalAddress?.includes('Calle 72 # 10-34'));
});
