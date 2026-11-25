import assert from 'node:assert/strict';
import {
  calculateOpenAiLiquidityForecast,
  estimateMarginalOpenAiCost,
  evaluateBillingCycleRollover,
} from '../services/erp.service';
import { calculateBillingStatus } from '../lib/billing/billing-status';
import { estimateChatsFromTokens, DEFAULT_AI_TOKENS_LIMIT } from '../lib/billing/plan-defaults';
import {
  getAiChatChain,
  calculateTurnCostUsd,
} from '../lib/ai/config';
import {
  createSignedGoogleOAuthState,
  verifySignedGoogleOAuthState,
} from '../lib/security/google-oauth-state';

console.log('🧪 Running ERP, Hybrid Tokens & Billing Status tests...');

// 1. Default base quota & hybrid chat estimation
assert.equal(DEFAULT_AI_TOKENS_LIMIT, 5_000_000);
assert.equal(estimateChatsFromTokens(5_000_000), '~400 a 667 chats');
assert.equal(estimateChatsFromTokens(5_000_000, 15_000), '~333 chats');

// 2. OpenAI Liquidity Forecast (paid + trial orgs)
const forecastDeficit = calculateOpenAiLiquidityForecast({
  organizations: [
    { id: '1', name: 'Filippo Kids', is_active: true, cycle_kind: 'paid', ai_tokens_used: 3_000_000, ai_tokens_limit: 5_000_000, extra_tokens_balance: 2_500_000 },
    { id: '2', name: 'Trial Co', is_active: true, cycle_kind: 'trial', ai_tokens_used: 500_000, ai_tokens_limit: 2_500_000, extra_tokens_balance: 0 },
  ],
  wallet: { balanceUsd: 0.5, trmCopPerUsd: 4200, safetyBufferPct: 15 },
});
assert.equal(forecastDeficit.activeOrgsCount, 2);
assert.equal(forecastDeficit.trialOrgsCount, 1);
assert.equal(forecastDeficit.committedRemainingTokens, 6_500_000);
assert.equal(forecastDeficit.isSufficient, false);
assert.ok(forecastDeficit.deficitUsd > 0);
assert.ok(forecastDeficit.deficitCop > 0);

const marginal = estimateMarginalOpenAiCost({ tokens: 2_500_000, trmCopPerUsd: 4200 });
assert.equal(marginal.usd, 0.39);
assert.equal(marginal.cop, 1638);

// 3. Exact-date billing_cycle_ends_at: trial vs paid
const in10Days = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
const ago2Days = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

const activeTrial = calculateBillingStatus({ is_active: true, cycle_kind: 'trial', billing_cycle_ends_at: in10Days });
assert.equal(activeTrial.status, 'al_dia');
assert.ok(activeTrial.label.includes('Prueba / Cortesía'));

const expiredTrial = calculateBillingStatus({ is_active: true, cycle_kind: 'trial', billing_cycle_ends_at: ago2Days });
assert.equal(expiredTrial.status, 'mora_preventiva');
assert.ok(expiredTrial.label.includes('Prueba vencida'));

const gracePaid = calculateBillingStatus({ is_active: true, cycle_kind: 'paid', billing_cycle_ends_at: ago2Days });
assert.equal(gracePaid.status, 'pendiente');

// 4. Gemini routing uses valid model ID
const chain = getAiChatChain('google');
assert.equal(chain[0].provider, 'google');
assert.notEqual(chain[0].model, 'gemini-3.5-flash-lite');

// 5. Sprint 1: Billing cycle rollover decision (paid reset vs trial expiry vs active no-op)
const now = new Date('2026-11-25T12:00:00.000Z');
const paidExpired = evaluateBillingCycleRollover(
  {
    is_active: true,
    cycle_kind: 'paid',
    billing_cycle_ends_at: '2026-11-24T00:00:00.000Z',
    paid_until_month: '2026-12',
  },
  now
);
assert.equal(paidExpired.action, 'reset_paid_cycle');
assert.ok(paidExpired.nextCycleEndsAt && new Date(paidExpired.nextCycleEndsAt) > now);

const trialExpired = evaluateBillingCycleRollover(
  {
    is_active: true,
    cycle_kind: 'trial',
    billing_cycle_ends_at: '2026-11-24T00:00:00.000Z',
  },
  now
);
assert.equal(trialExpired.action, 'expire_trial');

const activeNotDue = evaluateBillingCycleRollover(
  {
    is_active: true,
    cycle_kind: 'paid',
    billing_cycle_ends_at: '2026-12-15T00:00:00.000Z',
    paid_until_month: '2026-12',
  },
  now
);
assert.equal(activeNotDue.action, 'none');

// 6. Sprint 1: Whisper-1 pricing configured and calculated
const whisperCost = calculateTurnCostUsd({
  model: 'whisper-1',
  promptTokens: 1_000_000,
  cachedTokens: 0,
  completionTokens: 0,
});
assert.equal(whisperCost, 0.25);

// 7. Sprint 2: Google OAuth signed state + HTTP-only nonce verification
const testKey = 'unit-test-encryption-key-32-chars!!';
const { state, nonce } = createSignedGoogleOAuthState({
  orgId: 'org-123',
  userId: 'user-456',
  encKey: testKey,
  timestamp: now.getTime(),
});
const verified = verifySignedGoogleOAuthState({
  state,
  cookieNonce: nonce,
  encKey: testKey,
  now: now.getTime() + 1000,
});
assert.equal(verified.orgId, 'org-123');
assert.equal(verified.nonce, nonce);

assert.throws(
  () => verifySignedGoogleOAuthState({ state, cookieNonce: null, encKey: testKey, now: now.getTime() }),
  /nonce ausente/
);
assert.throws(
  () => verifySignedGoogleOAuthState({ state, cookieNonce: 'wrong-nonce', encKey: testKey, now: now.getTime() }),
  /no coincide/
);
assert.throws(
  () => verifySignedGoogleOAuthState({ state: state.slice(0, -4) + '0000', cookieNonce: nonce, encKey: testKey, now: now.getTime() }),
  /Firma de seguridad/
);
assert.throws(
  () => verifySignedGoogleOAuthState({ state, cookieNonce: nonce, encKey: testKey, now: now.getTime() + 25 * 60 * 1000 }),
  /expiró/
);

console.log('✅ All ERP, Hybrid Tokens, Billing Rollover, Whisper & OAuth Nonce tests passed!');
