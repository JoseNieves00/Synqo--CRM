import assert from 'node:assert/strict';
import { getAiChatChain, getAiUtilityChain } from '../lib/ai/config';
import { normalizeTokenPolicy } from '../lib/monitoring/token-policy';
import {
  calculateSmartOverageAndRechargeQuote,
  buildQuoteWhatsAppUrl,
} from '../services/erp.service';

// 1. Enrutamiento de motores IA
const chatChain = getAiChatChain();
assert.equal(chatChain[0]?.provider, 'openai', 'Mensajería debe usar OpenAI como motor principal');

const utilityChain = getAiUtilityChain();
assert.equal(utilityChain[0]?.provider, 'google', 'Utilidades de la página deben usar Gemini como principal');

// 2. Política de cuota base, precios editables y gracia 20%
const policy = normalizeTokenPolicy({});
assert.equal(policy.monthlyBasePriceCop, 169000);
assert.equal(policy.overagePricePer1MCop, 20000);
assert.equal(policy.gracePct, 20);
assert.equal(policy.hardStopAfterGrace, true);

// 3. Proyección inteligente cuando 1M no alcanza para terminar el mes
const now = new Date('2026-11-19T12:00:00.000Z');
const midMonthQuote = calculateSmartOverageAndRechargeQuote({
  usedTokens: 5_450_000,
  baseLimit: 5_000_000,
  billingCycleEndsAt: '2026-11-30T12:00:00.000Z', // 11 días restantes
  monthlyBasePriceCop: 169000,
  overagePricePer1MCop: 20000,
  now,
});
assert.equal(midMonthQuote.mode, 'mid_month_recharge');
assert.equal(midMonthQuote.overageTokens, 450_000);
assert.equal(midMonthQuote.overageCop, 9000);
assert.ok(
  midMonthQuote.recommendedRechargeTokens > 1_000_000,
  'Si el ritmo diario supera 1M para fin de mes, debe recomendar lo necesario'
);

// 4. Modo Fin de Mes (<= 5 días)
const endMonthQuote = calculateSmartOverageAndRechargeQuote({
  usedTokens: 5_200_000,
  baseLimit: 5_000_000,
  billingCycleEndsAt: '2026-11-22T12:00:00.000Z', // 3 días restantes
  monthlyBasePriceCop: 169000,
  overagePricePer1MCop: 20000,
  now,
});
assert.equal(endMonthQuote.mode, 'end_of_month');
assert.equal(endMonthQuote.totalToCollectCop, 169000 + 4000);

// 5. Enlace wa.me
const waUrl = buildQuoteWhatsAppUrl({
  phone: '573001234567',
  companyName: 'Tienda Nova',
  mode: 'mid_month_recharge',
  overageTokens: 450_000,
  overageCop: 9000,
  rechargeTokens: 3_000_000,
  rechargeCop: 60000,
  monthlyBaseCop: 169000,
  totalCop: 69000,
  daysRemaining: 11,
});
assert.ok(waUrl.startsWith('https://wa.me/573001234567?text='));

console.log('✅ token-billing-and-projection.test.ts passed');
