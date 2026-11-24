import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectCustomerFriction,
  extractOrganizationCapabilities,
  diagnoseCopilotTurn,
} from '../lib/ai/copilot-engine';

test('1. Detecta fricción de postergación y aplica Plan Separe SOLO si está en el prompt', () => {
  const leadPostponing = 'Listo muchas gracias, lo voy a pensar y cualquier cosa te aviso';
  
  // Caso A: Organización con Plan Separe en su prompt
  const orgWithSepare = {
    system_prompt: 'Fábrica de cocinitas infantiles. Contamos con Plan Separe para apartar con abono inicial.',
  };
  const prescriptionWithSepare = diagnoseCopilotTurn({
    history: [{ sender_type: 'lead', content: leadPostponing }],
    organization: orgWithSepare,
  });

  assert.strictEqual(prescriptionWithSepare.friction, 'postponement');
  assert.strictEqual(prescriptionWithSepare.tacticKey, 'bridge_plan_separe_deposit');
  assert.ok(prescriptionWithSepare.copilotDirective.includes('abono inicial'));
  assert.ok(prescriptionWithSepare.prohibitedActions.some((p) => p.includes('a la orden')));

  // Caso B: Organización SIN Plan Separe (ej. clínica o consultoría)
  const orgNoSepare = {
    system_prompt: 'Clínica estética. Consultas de valoración presencial.',
  };
  const prescriptionNoSepare = diagnoseCopilotTurn({
    history: [{ sender_type: 'lead', content: leadPostponing }],
    organization: orgNoSepare,
  });

  assert.strictEqual(prescriptionNoSepare.friction, 'postponement');
  assert.strictEqual(prescriptionNoSepare.tacticKey, 'ethical_reservation_hold');
  assert.ok(!prescriptionNoSepare.copilotDirective.includes('Plan Separe'), 'No debe inventar Plan Separe si no está en el prompt');
  assert.ok(prescriptionNoSepare.copilotDirective.includes('guardar'));
});

test('2. Detecta desconfianza y ofrece Pago Contraentrega SOLO si está habilitado', () => {
  const leadDistrust = '¿Dónde están ubicados? ¿Cómo sé que sí me llega el producto y no me estafan?';

  // Caso A: Con contraentrega habilitada en shipping_settings
  const orgWithContraentrega = {
    system_prompt: 'Tienda de calzado.',
    appointment_settings: {
      shipping_settings: { isCashOnDeliveryAllowed: true },
    },
  };
  const presWithCOD = diagnoseCopilotTurn({
    history: [{ sender_type: 'lead', content: leadDistrust }],
    organization: orgWithContraentrega,
  });

  assert.strictEqual(presWithCOD.friction, 'distrust');
  assert.strictEqual(presWithCOD.tacticKey, 'demolish_distrust_contraentrega');
  assert.ok(presWithCOD.copilotDirective.includes('Pago Contraentrega'));

  // Caso B: Sin contraentrega (solo transferencias bancarias previas)
  const orgNoCOD = {
    system_prompt: 'Venta de software empresarial. Pagos por transferencia Bancolombia.',
    appointment_settings: {
      shipping_settings: { isCashOnDeliveryAllowed: false },
    },
  };
  const presNoCOD = diagnoseCopilotTurn({
    history: [{ sender_type: 'lead', content: leadDistrust }],
    organization: orgNoCOD,
  });

  assert.strictEqual(presNoCOD.friction, 'distrust');
  assert.strictEqual(presNoCOD.tacticKey, 'demolish_distrust_guarantee_and_office');
  assert.ok(!presNoCOD.copilotDirective.includes('Contraentrega'), 'No debe inventar contraentrega si no está permitida');
});

test('3. Detecta parálisis por comparación y aplica la regla del Best-Seller', () => {
  const leadComparing = '¿Qué diferencia tienen la cocinita chef y la mini? ¿Cuál me recomiendas tú?';
  const org = { system_prompt: 'Catálogo de juguetes en madera.' };

  const prescription = diagnoseCopilotTurn({
    history: [{ sender_type: 'lead', content: leadComparing }],
    organization: org,
  });

  assert.strictEqual(prescription.friction, 'comparison');
  assert.strictEqual(prescription.tacticKey, 'bestseller_recommendation');
  assert.ok(prescription.copilotDirective.includes('favorita de los clientes'));
  assert.ok(prescription.prohibitedActions.some((p) => p.includes('fichas técnicas largas')));
});

test('4. Detecta intención de pago y prescribe liquidación inmediata con apartado temporal de 2 horas', () => {
  const leadReady = 'Quiero hacer el pago, ¿a qué número de cuenta o Nequi les transfiero?';
  const org = {
    system_prompt: 'Muebles infantiles.',
    appointment_settings: {
      payment_accounts: [{ title: 'Bancolombia Ahorros', accountNumber: '123', isActive: true }],
    },
  };

  const prescription = diagnoseCopilotTurn({
    history: [{ sender_type: 'lead', content: leadReady }],
    organization: org,
  });

  assert.strictEqual(prescription.friction, 'ready_to_close');
  assert.strictEqual(prescription.tacticKey, 'immediate_liquidation_and_hold');
  assert.ok(prescription.copilotDirective.includes('por un par de horitas'));
  assert.ok(prescription.suggestedClosingQuestion.includes('registramos el despacho'));
});
