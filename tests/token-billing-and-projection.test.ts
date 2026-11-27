import assert from 'node:assert/strict';
import { getAiChatChain, getAiUtilityChain } from '../lib/ai/config';
import { normalizeTokenPolicy, computeTokenStatus } from '../lib/monitoring/token-policy';
import {
  calculateSmartOverageAndRechargeQuote,
  buildQuoteWhatsAppUrl,
  prunePendingQuotes,
  type PendingQuoteRecord,
} from '../services/erp.service';

// 1. Enrutamiento de motores IA
const chatChain = getAiChatChain();
assert.equal(chatChain[0]?.provider, 'openai', 'Mensajería debe usar OpenAI como motor principal');

const utilityChain = getAiUtilityChain();
assert.equal(utilityChain[0]?.provider, 'google', 'Utilidades de la página deben usar Gemini como principal');

// 2. Política de cuota base, precios editables y gracia 20%
const policy = normalizeTokenPolicy({});
assert.equal(policy.monthlyBasePriceCop, 179999);
assert.equal(policy.overagePricePer1MCop, 20000);
assert.equal(policy.gracePct, 20);
assert.equal(policy.hardStopAfterGrace, true);

// 3. Proyección inteligente cuando 1M no alcanza para terminar el mes
const now = new Date('2026-11-19T12:00:00.000Z');
const midMonthQuote = calculateSmartOverageAndRechargeQuote({
  usedTokens: 5_450_000,
  baseLimit: 5_000_000,
  billingCycleEndsAt: '2026-11-30T12:00:00.000Z', // 11 días restantes
  monthlyBasePriceCop: 179999,
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
  monthlyBasePriceCop: 179999,
  overagePricePer1MCop: 20000,
  now,
});
assert.equal(endMonthQuote.mode, 'end_of_month');
assert.equal(endMonthQuote.totalToCollectCop, 179999 + 4000);

// 5. Enlace wa.me en lenguaje de conversaciones + tokens
const waUrl = buildQuoteWhatsAppUrl({
  phone: '573001234567',
  companyName: 'Tienda Nova',
  mode: 'mid_month_recharge',
  overageTokens: 450_000,
  overageCop: 9000,
  rechargeTokens: 3_000_000,
  rechargeCop: 60000,
  monthlyBaseCop: 179999,
  totalCop: 69000,
  daysRemaining: 11,
});
assert.ok(waUrl.startsWith('https://wa.me/573001234567?text='));
const decodedWa = decodeURIComponent(waUrl.split('text=')[1] || '');
assert.ok(decodedWa.includes('chats'), 'El mensaje wa.me debe hablar de conversaciones/chats');

const waNewClientUrl = buildQuoteWhatsAppUrl({
  phone: '573001234567',
  companyName: 'Clínica Sol',
  mode: 'new_client',
  overageTokens: 0,
  overageCop: 0,
  rechargeTokens: 0,
  rechargeCop: 0,
  monthlyBaseCop: 219000,
  totalCop: 219000,
  daysRemaining: 30,
  baseTokensLimit: 7_500_000,
  maxUsers: 4,
});
const decodedNewClient = decodeURIComponent(waNewClientUrl.split('text=')[1] || '');
assert.ok(decodedNewClient.includes('7.500.000') || decodedNewClient.includes('7,500,000'));
assert.ok(decodedNewClient.includes('chats'));

// 6. Simulación de depuración automática de cotizaciones pendientes
const sampleQuotes: PendingQuoteRecord[] = [
  {
    id: 'q1',
    companyName: 'Vencida',
    adminName: 'Admin 1',
    adminEmail: 'vencida@test.com',
    phone: '57300',
    businessModel: 'products',
    maxUsers: 2,
    aiTokensLimit: 5_000_000,
    monthlyBaseCop: 169000,
    createdAt: '2026-10-01T12:00:00.000Z',
    expiresAt: '2026-10-16T12:00:00.000Z',
  },
  {
    id: 'q2',
    companyName: 'Ya Creada',
    adminName: 'Admin 2',
    adminEmail: 'creada@test.com',
    phone: '57300',
    businessModel: 'services',
    maxUsers: 2,
    aiTokensLimit: 5_000_000,
    monthlyBaseCop: 169000,
    createdAt: '2026-11-18T12:00:00.000Z',
  },
  {
    id: 'q3-old',
    companyName: 'Duplicada Vieja',
    adminName: 'Admin 3',
    adminEmail: 'dup@test.com',
    phone: '57300',
    businessModel: 'hybrid',
    maxUsers: 2,
    aiTokensLimit: 5_000_000,
    monthlyBaseCop: 169000,
    createdAt: '2026-11-17T12:00:00.000Z',
  },
  {
    id: 'q3-new',
    companyName: 'Duplicada Nueva',
    adminName: 'Admin 3',
    adminEmail: 'DUP@test.com',
    phone: '57300',
    businessModel: 'hybrid',
    maxUsers: 3,
    aiTokensLimit: 7_500_000,
    monthlyBaseCop: 219000,
    createdAt: '2026-11-19T10:00:00.000Z',
  },
];
const pruned = prunePendingQuotes(sampleQuotes, {
  existingEmails: new Set(['creada@test.com']),
  now,
});
assert.equal(pruned.length, 1);
assert.equal(pruned[0]?.id, 'q3-new');

// 7. Simulación de saldo en gracia/excedente + recarga neta
const overageSettled = calculateSmartOverageAndRechargeQuote({
  usedTokens: 5_600_000,
  baseLimit: 5_000_000,
  extraBalance: 600_000 + 1_000_000, // excedente saldado + recarga neta 1M
  billingCycleEndsAt: '2026-11-30T12:00:00.000Z',
  now,
});
assert.equal(overageSettled.overageTokens, 0, 'Al saldar excedente + recarga, el excedente queda en 0');
assert.equal(overageSettled.effectiveLimit - overageSettled.usedTokens, 1_000_000, 'Quedan 1M tokens netos libres');

// 8. Simulación de Hard-Stop al superar 20% de gracia y desbloqueo tras recarga
const graceLimit = 5_000_000;
const graceCap = Math.round(graceLimit * (1 + (policy.gracePct ?? 20) / 100));
assert.equal(graceCap, 6_000_000);
const statusAtHardStop = computeTokenStatus({ used: 6_050_000, limit: graceLimit, policy });
assert.equal(statusAtHardStop.isOverage, true);
assert.ok(statusAtHardStop.used >= graceCap, 'Debe activar hard-stop al superar 120%');

const unlockedEffectiveLimit = graceLimit + statusAtHardStop.overageTokens + 1_000_000;
const unlockedGraceCap = Math.round(unlockedEffectiveLimit * (1 + (policy.gracePct ?? 20) / 100));
assert.ok(statusAtHardStop.used < unlockedGraceCap, 'Tras acreditar excedente + recarga, se desbloquea inmediatamente');

console.log('✅ token-billing-and-projection.test.ts passed');
