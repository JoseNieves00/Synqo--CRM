import assert from 'node:assert/strict';
import test from 'node:test';
import { interpolateFollowUpText, extractGenuineFirstName } from '../lib/ai/follow-up-types';
import {
  computeLeadScore,
  resolveRecommendedCommercialAction,
  getLeadScoreBand,
} from '../lib/leads/lead-score';
import {
  extractOrganizationCapabilities,
  detectCustomerFriction,
  diagnoseCopilotTurn,
} from '../lib/ai/copilot-engine';

// ==============================================================================
// 1. CAMPAIGN DISPATCH & VARIABLE SANITIZATION SCENARIOS
// ==============================================================================
test('1.1. Campaña: Nombre humano genuino interpola {primer_nombre} y {nombre} correctamente', () => {
  const template = '¡Hola {primer_nombre}! Vimos tu interés en nuestro catálogo para ti, {nombre}.';
  const resolved = interpolateFollowUpText(template, {
    contactName: 'Laura Marcela Rodríguez',
    companyName: 'Moda Chic',
  });
  assert.strictEqual(resolved, '¡Hola Laura! Vimos tu interés en nuestro catálogo para ti, Laura.');
});

test('1.2. Campaña: Contacto sin nombre o nulo no produce "Hola ," ni espacios dobles', () => {
  const template = '¡Hola {primer_nombre}! Tenemos una promoción para ti.';
  const resolved = interpolateFollowUpText(template, {
    contactName: null,
    companyName: 'Synqo Store',
  });
  // Debe convertir limpiamente el saludo a "¡Hola!" sin espacios ni comas colgando
  assert.strictEqual(resolved, '¡Hola! Tenemos una promoción para ti.');
});

test('1.3. Campaña: Contacto con número de teléfono como nombre no saluda con el teléfono', () => {
  const template = '¡Hola {primer_nombre}! Te escribimos con una sorpresa.';
  const resolved1 = interpolateFollowUpText(template, {
    contactName: '+57 300 123 4567',
  });
  assert.strictEqual(resolved1, '¡Hola! Te escribimos con una sorpresa.');

  const resolved2 = interpolateFollowUpText(template, {
    contactName: '573001234567',
  });
  assert.strictEqual(resolved2, '¡Hola! Te escribimos con una sorpresa.');
});

test('1.4. Campaña: Nombres no genuinos o estados de WhatsApp se sanean limpiamente', () => {
  const template = '¡Hola {primer_nombre}! Esperamos que estés muy bien.';
  const resolvedReligious = interpolateFollowUpText(template, {
    contactName: 'Dios es Amor',
  });
  assert.strictEqual(resolvedReligious, '¡Hola! Esperamos que estés muy bien.');

  const resolvedBusiness = interpolateFollowUpText(template, {
    contactName: 'Tienda Virtual Bogotá',
  });
  assert.strictEqual(resolvedBusiness, '¡Hola! Esperamos que estés muy bien.');
});

test('1.5. Campaña: Normalización de estilos decorativos unicode (fuentes especiales)', () => {
  const genuine = extractGenuineFirstName('𝕁𝕦𝕒𝕟 ℙé𝕣𝕖𝕫');
  assert.strictEqual(genuine, 'Juan');

  const stylized = extractGenuineFirstName('✨ 𝑽𝒂𝒍𝒆𝒏𝒕𝒊𝒏𝒂 ✨');
  assert.strictEqual(stylized, 'Valentina');
});

// ==============================================================================
// 2. LEAD SCORING & COMMERCIAL DIRECTIVES SCENARIOS
// ==============================================================================
test('2.1. Scoring: Comprobante o abono inicial garantiza recomendación de cierre inmediato', () => {
  const res = computeLeadScore({
    pipelineStage: 'calificado',
    customFields: {
      has_pending_receipt: true,
      lead_temperature: 'hot',
    },
    lastLeadMessageAt: new Date().toISOString(),
  });

  assert.ok(res.score! >= 85, `Score esperado >= 85, recibido: ${res.score}`);
  assert.strictEqual(getLeadScoreBand(res.score), 'very_high');
  assert.strictEqual(res.recommendedAction?.actionKey, 'confirm_closing_and_receipt');
  assert.strictEqual(res.recommendedAction?.urgency, 'immediate');
});

test('2.2. Scoring: Solicitud de cuentas o flete recomienda cierre asistido / Plan Separe', () => {
  const res = computeLeadScore({
    pipelineStage: 'nuevo',
    customFields: {
      requested_payment_info: true,
      requested_shipping_quote: true,
    },
    lastLeadMessageAt: new Date().toISOString(),
  });

  assert.ok(res.breakdown.some((f) => f.key === 'buying_intent' && f.points === 12));
  assert.strictEqual(res.recommendedAction?.actionKey, 'offer_payment_or_separe');
  assert.strictEqual(res.recommendedAction?.urgency, 'high');
});

test('2.3. Scoring: Contactos cerrados (ganado o perdido) devuelven score nulo y acción adecuada', () => {
  const wonRes = computeLeadScore({
    pipelineStage: 'ganado',
  });
  assert.strictEqual(wonRes.score, null);
  const actionWon = resolveRecommendedCommercialAction({ stage: 'ganado' });
  assert.strictEqual(actionWon.actionKey, 'post_sale_service');
  assert.ok(actionWon.label.includes('Post-venta'));

  const lostRes = computeLeadScore({
    pipelineStage: 'perdido',
  });
  assert.strictEqual(lostRes.score, null);
  const actionLost = resolveRecommendedCommercialAction({ stage: 'perdido' });
  assert.strictEqual(actionLost.actionKey, 'post_sale_service');
  assert.ok(actionLost.label.includes('descartado'));
});

test('2.4. Scoring: Lead que pidió no contactar (opt_out) recibe score 0', () => {
  const optOutRes = computeLeadScore({
    pipelineStage: 'calificado',
    customFields: {
      opted_out: true,
    },
  });
  assert.strictEqual(optOutRes.score, 0);
  assert.strictEqual(optOutRes.breakdown[0].key, 'opt_out');
});

test('2.5. Scoring: Resiliencia ante valores extremos, nulos o fechas indefinidas', () => {
  // Sin campos personalizados ni fechas
  const nullSafe = computeLeadScore({
    pipelineStage: null,
    customFields: null,
    dealValue: null,
    lastLeadMessageAt: null,
  });
  assert.ok(typeof nullSafe.score === 'number');
  assert.ok(nullSafe.score! >= 0 && nullSafe.score! <= 100);

  // Fecha en el futuro lejano o mensaje muy antiguo
  const pastSafe = computeLeadScore({
    lastLeadMessageAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
  });
  assert.ok(pastSafe.score! >= 0 && pastSafe.score! <= 100);
});

// ==============================================================================
// 3. COPILOT SALES ENGINE: MULTI-NICHE STRICT GROUNDING (CERO ALUCINACIONES)
// ==============================================================================
test('3.1. Copiloto E-commerce Físico: Habilitado para Contraentrega y Plan Separe', () => {
  const orgEcommerce = {
    system_prompt: 'Somos una tienda de calzado infantil. Manejamos pago contraentrega en Colombia y plan separe apartando con $20.000.',
    appointment_settings: {
      shipping_settings: { isCashOnDeliveryAllowed: true },
      payment_accounts: [{ bankName: 'Bancolombia', isActive: true }],
    },
  };

  const caps = extractOrganizationCapabilities(orgEcommerce);
  assert.strictEqual(caps.canOfferContraentrega, true);
  assert.strictEqual(caps.canOfferPlanSepare, true);
  assert.strictEqual(caps.hasPaymentAccounts, true);

  // Ante desconfianza -> Prescribe Contraentrega
  const rxDistrust = diagnoseCopilotTurn({
    history: [{ sender_type: 'lead', content: '¿Es seguro comprar con ustedes? ¿Tienen tienda física?' }],
    organization: orgEcommerce,
  });
  assert.strictEqual(rxDistrust.friction, 'distrust');
  assert.strictEqual(rxDistrust.tacticKey, 'demolish_distrust_contraentrega');
  assert.ok(rxDistrust.copilotDirective.includes('Pago Contraentrega'));

  // Ante postergación -> Prescribe Plan Separe
  const rxPostponement = diagnoseCopilotTurn({
    history: [{ sender_type: 'lead', content: 'Déjame ver y cualquier cosa te aviso luego.' }],
    organization: orgEcommerce,
  });
  assert.strictEqual(rxPostponement.friction, 'postponement');
  assert.strictEqual(rxPostponement.tacticKey, 'bridge_plan_separe_deposit');
  assert.ok(rxPostponement.copilotDirective.includes('abono inicial') || rxPostponement.copilotDirective.includes('apartado'));

  // Ante objeción de precio -> Prescribe Alivio de Presupuesto con Plan Separe
  const rxPrice = diagnoseCopilotTurn({
    history: [{ sender_type: 'lead', content: 'Está muy caro para mi presupuesto' }],
    organization: orgEcommerce,
  });
  assert.strictEqual(rxPrice.friction, 'price');
  assert.strictEqual(rxPrice.tacticKey, 'budget_relief_separe');
});

test('3.2. Copiloto Clínica Médica / Servicios: Contraentrega y Separe estrictamente PROHIBIDOS', () => {
  const orgClinic = {
    system_prompt: 'Somos Clínica Odontológica Especializada. Solo pagos presenciales o transferencia a cuenta de ahorros. No manejamos contraentrega ni plan separe.',
    appointment_settings: {
      shipping_settings: { isCashOnDeliveryAllowed: false },
      payment_accounts: [{ bankName: 'Bancolombia', isActive: true }],
    },
  };

  const caps = extractOrganizationCapabilities(orgClinic, 'Somos Clínica Odontológica Especializada. Solo pagos directos o transferencia previa.');
  assert.strictEqual(caps.canOfferContraentrega, false, 'Clínica médica jamás debe habilitar contraentrega');
  assert.strictEqual(caps.canOfferPlanSepare, false, 'Clínica médica jamás debe habilitar plan separe');

  // Ante desconfianza -> NUNCA prescribe Contraentrega; prescribe garantía oficial y sede
  const rxDistrustClinic = diagnoseCopilotTurn({
    history: [{ sender_type: 'lead', content: '¿Cómo sé que no me van a estafar? ¿Dónde están ubicados?' }],
    organization: { ...orgClinic, system_prompt: 'Clínica Odontológica. Pagos por transferencia.' },
  });
  assert.strictEqual(rxDistrustClinic.friction, 'distrust');
  assert.strictEqual(rxDistrustClinic.tacticKey, 'demolish_distrust_guarantee_and_office');
  assert.strictEqual(rxDistrustClinic.allowedCapabilities.canOfferContraentrega, false);
  assert.ok(!rxDistrustClinic.copilotDirective.toLowerCase().includes('contraentrega'));
  assert.ok(rxDistrustClinic.copilotDirective.includes('sede') || rxDistrustClinic.copilotDirective.includes('garantía'));

  // Ante postergación -> NUNCA prescribe Plan Separe; prescribe reserva ética de 2h
  const rxPostponementClinic = diagnoseCopilotTurn({
    history: [{ sender_type: 'lead', content: 'Voy a consultar con mi esposo a ver qué me dice.' }],
    organization: { ...orgClinic, system_prompt: 'Clínica Odontológica. Pagos por transferencia.' },
  });
  assert.strictEqual(rxPostponementClinic.friction, 'postponement');
  assert.strictEqual(rxPostponementClinic.tacticKey, 'ethical_reservation_hold');
  assert.strictEqual(rxPostponementClinic.allowedCapabilities.canOfferPlanSepare, false);
  assert.ok(!rxPostponementClinic.copilotDirective.toLowerCase().includes('separe'));
  assert.ok(
    rxPostponementClinic.copilotDirective.includes('guardarle el cupo') ||
      rxPostponementClinic.copilotDirective.includes('un par de horas')
  );

  // Ante objeción de precio -> NUNCA prescribe Plan Separe; prescribe reencuadre de valor y calidad
  const rxPriceClinic = diagnoseCopilotTurn({
    history: [{ sender_type: 'lead', content: 'Está muy costoso ese tratamiento' }],
    organization: { ...orgClinic, system_prompt: 'Clínica Odontológica. Pagos por transferencia.' },
  });
  assert.strictEqual(rxPriceClinic.friction, 'price');
  assert.strictEqual(rxPriceClinic.tacticKey, 'value_reframing_and_durability');
  assert.strictEqual(rxPriceClinic.allowedCapabilities.canOfferPlanSepare, false);
  assert.ok(!rxPriceClinic.copilotDirective.toLowerCase().includes('separe'));
});

test('3.3. Copiloto Cierre Directo (ready_to_close): Cliente listo para pagar o con comprobante', () => {
  const rxClosing = diagnoseCopilotTurn({
    history: [{ sender_type: 'lead', content: 'Listo me interesa, pásame el Nequi para transferirte ya' }],
    organization: { system_prompt: 'Tienda oficial' },
  });
  assert.strictEqual(rxClosing.friction, 'ready_to_close');
  assert.strictEqual(rxClosing.tacticKey, 'immediate_liquidation_and_hold');
  assert.ok(rxClosing.copilotDirective.includes('cuentas bancarias'));
  assert.ok(rxClosing.prohibitedActions.some((p) => p.includes('abiertas de exploración')));

  // Comprobante ya enviado
  const rxReceipt = diagnoseCopilotTurn({
    history: [{ sender_type: 'lead', content: 'Aquí te adjunto el comprobante' }],
    contactData: { custom_fields: { has_pending_receipt: true } },
  });
  assert.strictEqual(rxReceipt.friction, 'ready_to_close');
  assert.strictEqual(rxReceipt.tacticKey, 'validate_receipt_and_dispatch');
  assert.ok(rxReceipt.copilotDirective.includes('Valídalo cordialmente y solicita'));
});

// ==============================================================================
// 4. RADAR DE ENFRIAMIENTO (15 MINUTOS) & CONTACT PANEL ALERTS
// ==============================================================================
test('4.1. Radar 15m: Evalúa riesgo de enfriamiento con precisión en bordes temporales', () => {
  const evaluateRadarRisk = (params: {
    requestedPayment: boolean;
    hasPendingReceipt: boolean;
    pipelineStage?: string;
    conversationStatus?: string;
    elapsedMinutes: number;
  }) => {
    const isAwaitingPaymentProof = Boolean(
      params.requestedPayment &&
      !params.hasPendingReceipt &&
      params.pipelineStage !== 'ganado' &&
      params.pipelineStage !== 'perdido' &&
      params.conversationStatus !== 'closed'
    );
    return isAwaitingPaymentProof && params.elapsedMinutes >= 15;
  };

  // 14 minutos -> No debe alertar aún
  assert.strictEqual(
    evaluateRadarRisk({
      requestedPayment: true,
      hasPendingReceipt: false,
      elapsedMinutes: 14,
    }),
    false
  );

  // 15 minutos exactos -> Debe alertar
  assert.strictEqual(
    evaluateRadarRisk({
      requestedPayment: true,
      hasPendingReceipt: false,
      elapsedMinutes: 15,
    }),
    true
  );

  // 30 minutos pero cliente ya envió comprobante -> No debe alertar
  assert.strictEqual(
    evaluateRadarRisk({
      requestedPayment: true,
      hasPendingReceipt: true,
      elapsedMinutes: 30,
    }),
    false
  );

  // 45 minutos pero venta ya cerrada (ganado) -> No debe alertar
  assert.strictEqual(
    evaluateRadarRisk({
      requestedPayment: true,
      hasPendingReceipt: false,
      pipelineStage: 'ganado',
      elapsedMinutes: 45,
    }),
    false
  );

  // 20 minutos pero contacto descartado (perdido) -> No debe alertar
  assert.strictEqual(
    evaluateRadarRisk({
      requestedPayment: true,
      hasPendingReceipt: false,
      pipelineStage: 'perdido',
      elapsedMinutes: 20,
    }),
    false
  );

  // 20 minutos pero conversación cerrada -> No debe alertar
  assert.strictEqual(
    evaluateRadarRisk({
      requestedPayment: true,
      hasPendingReceipt: false,
      conversationStatus: 'closed',
      elapsedMinutes: 20,
    }),
    false
  );
});
