import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeLeadScore,
  resolveRecommendedCommercialAction,
  getLeadScoreBand,
} from '../lib/leads/lead-score';

test('1. Comprobante de pago o abono eleva el score a banda muy alta (+20 pts) y recomienda cierre inmediato', () => {
  const resultReceipt = computeLeadScore({
    pipelineStage: 'calificado',
    customFields: {
      lead_temperature: 'hot',
      has_pending_receipt: true,
    },
    lastLeadMessageAt: new Date().toISOString(),
  });

  assert.ok(resultReceipt.score! >= 85, `Score debe ser >= 85, fue: ${resultReceipt.score}`);
  assert.strictEqual(getLeadScoreBand(resultReceipt.score), 'very_high');
  assert.ok(resultReceipt.breakdown.some((f) => f.key === 'receipt_or_deposit' && f.points === 20));
  
  assert.strictEqual(resultReceipt.recommendedAction?.actionKey, 'confirm_closing_and_receipt');
  assert.ok(resultReceipt.recommendedAction?.playbookTip.includes('confirma el comprobante'));
});

test('2. Pregunta por cuentas de pago o contraentrega suma +12 pts y recomienda cierre asistido / Plan Separe', () => {
  const resultPayment = computeLeadScore({
    pipelineStage: 'nuevo',
    customFields: {
      lead_temperature: 'warm',
      requested_payment_info: true,
      product_interest: 'Cocinita Chef',
    },
    lastLeadMessageAt: new Date().toISOString(),
  });

  assert.ok(resultPayment.breakdown.some((f) => f.key === 'buying_intent' && f.points === 12));
  assert.strictEqual(resultPayment.recommendedAction?.actionKey, 'offer_payment_or_separe');
  assert.ok(resultPayment.recommendedAction?.label.includes('Plan Separe') || resultPayment.recommendedAction?.label.includes('cuentas de pago'));
});

test('3. Cotización activa con deal_value, urgencia inmediata y tomador de decisión suman puntos cumulativos', () => {
  const resultMultiSignals = computeLeadScore({
    pipelineStage: 'calificado',
    dealValue: 350000,
    customFields: {
      lead_temperature: 'qualified_doubt',
      urgency: 'inmediata (< 48h)',
      decision_maker: 'directo',
      purchasing_power: 'estandar',
      shipping_data: { destination_city: 'Medellín' },
    },
    lastLeadMessageAt: new Date().toISOString(),
  });

  assert.ok(resultMultiSignals.breakdown.some((f) => f.key === 'quoted_value' && f.points === 8));
  assert.ok(resultMultiSignals.breakdown.some((f) => f.key === 'buying_intent' && f.points === 12));
  assert.ok(resultMultiSignals.breakdown.some((f) => f.key === 'high_urgency' && f.points === 6));
  assert.ok(resultMultiSignals.breakdown.some((f) => f.key === 'decision_maker' && f.points === 4));
  assert.ok(resultMultiSignals.breakdown.some((f) => f.key === 'purchasing_power' && f.points === 4));
  
  // Score debe estar en banda alta o muy alta (por encima de 80 con estas señales)
  assert.ok(resultMultiSignals.score! >= 80, `Score esperado >= 80, fue: ${resultMultiSignals.score}`);
});

test('4. Respuesta a campaña promocional otorga +8 pts de reactivación', () => {
  const resultCampaign = computeLeadScore({
    pipelineStage: 'calificado',
    customFields: {
      lead_temperature: 'warm',
      replied_to_campaign: true,
      campaign_replied_at: new Date().toISOString(),
    },
    lastLeadMessageAt: new Date().toISOString(),
  });

  assert.ok(resultCampaign.breakdown.some((f) => f.key === 'campaign_reply' && f.points === 8));
});

test('5. Venta cerrada (ganado) recibe acción post-venta de fidelización', () => {
  const actionWon = resolveRecommendedCommercialAction({
    score: 100,
    stage: 'ganado',
    customFields: {},
  });

  assert.strictEqual(actionWon.actionKey, 'post_sale_service');
  assert.strictEqual(actionWon.urgency, 'low');
});
