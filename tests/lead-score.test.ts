import assert from 'node:assert';
import { computeLeadScore, recencyPoints, getLeadScoreBand } from '../lib/leads/lead-score';
import { prioritizeReactivationQueue } from '../lib/leads/reactivation-priority';
import { compareInboxContacts, resolveInboxSort } from '../lib/inbox/buckets';

const NOW = new Date('2026-11-11T15:00:00Z').getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3600 * 1000).toISOString();
const daysAgo = (d: number) => hoursAgo(d * 24);

function run() {
  console.log('\n🧪 Suite: Score de propensión de compra (lead-score)\n');

  // 1. Hot reciente supera a warm antiguo
  const hotRecent = computeLeadScore({
    pipelineStage: 'calificado',
    customFields: { lead_temperature: 'hot', product_interest: 'Plan Premium' },
    lastLeadMessageAt: hoursAgo(2),
    leadMessagesLast7d: 6,
    now: NOW,
  });
  const warmOld = computeLeadScore({
    pipelineStage: 'nuevo',
    customFields: { lead_temperature: 'warm' },
    lastLeadMessageAt: daysAgo(10),
    leadMessagesLast7d: 0,
    now: NOW,
  });
  assert.ok(hotRecent.score !== null && warmOld.score !== null);
  assert.ok(hotRecent.score! > warmOld.score!, `hot reciente (${hotRecent.score}) > warm antiguo (${warmOld.score})`);
  assert.ok(hotRecent.score! >= 75, 'hot reciente calificado debe estar en banda muy alta');
  assert.strictEqual(getLeadScoreBand(hotRecent.score), 'very_high');
  console.log('   ✅ hot reciente > warm antiguo');

  // 2. Opt-out = 0, ganado/perdido = null
  assert.strictEqual(computeLeadScore({ customFields: { opted_out: true, lead_temperature: 'hot' }, now: NOW }).score, 0);
  assert.strictEqual(computeLeadScore({ pipelineStage: 'ganado', customFields: { lead_temperature: 'hot' }, now: NOW }).score, null);
  assert.strictEqual(computeLeadScore({ pipelineStage: 'perdido', now: NOW }).score, null);
  console.log('   ✅ opt-out = 0, ganado/perdido fuera del ranking');

  // 3. Clamp 0..100
  const maxed = computeLeadScore({
    pipelineStage: 'cita_agendada',
    customFields: { lead_temperature: 'hot', product_interest: 'X', follow_up: { lastSentAt: hoursAgo(5) } },
    lastLeadMessageAt: hoursAgo(1),
    leadMessagesLast7d: 50,
    now: NOW,
  });
  assert.strictEqual(maxed.score, 100);
  const floored = computeLeadScore({
    customFields: { lead_temperature: 'cold', last_objection: 'caro', follow_up: { lastSentAt: daysAgo(3), currentStepIndex: 3 } },
    lastLeadMessageAt: daysAgo(30),
    now: NOW,
  });
  assert.strictEqual(floored.score, 0);
  console.log('   ✅ clamp 0..100');

  // 4. Respuesta vs. silencio frente a seguimientos
  const replied = computeLeadScore({
    customFields: { lead_temperature: 'warm', follow_up: { lastSentAt: hoursAgo(10) } },
    lastLeadMessageAt: hoursAgo(3),
    now: NOW,
  });
  const ignored = computeLeadScore({
    customFields: { lead_temperature: 'warm', follow_up: { lastSentAt: hoursAgo(3), currentStepIndex: 2 } },
    lastLeadMessageAt: hoursAgo(10),
    now: NOW,
  });
  assert.ok(replied.breakdown.some((f) => f.key === 'follow_up_reply'));
  assert.ok(ignored.breakdown.some((f) => f.key === 'follow_up_ignored' && f.points === -14));
  assert.ok(replied.score! > ignored.score!);
  console.log('   ✅ responder a seguimiento suma, ignorarlo resta');

  // 5. Recencia monótona decreciente
  assert.strictEqual(recencyPoints(hoursAgo(5), NOW), 15);
  assert.strictEqual(recencyPoints(daysAgo(20), NOW), -15);
  assert.ok(recencyPoints(daysAgo(3), NOW) > recencyPoints(daysAgo(8), NOW));
  assert.strictEqual(recencyPoints(null, NOW), -10);
  console.log('   ✅ recencia decreciente');

  // 6. Lectura de temperatura legacy
  const legacy = computeLeadScore({ customFields: { temperature: 'hot' }, lastLeadMessageAt: hoursAgo(1), now: NOW });
  assert.ok(legacy.breakdown.some((f) => f.key === 'temperature' && f.points === 70));
  console.log('   ✅ temperatura legacy soportada');

  // 7. Cola de recontacto priorizada por score con umbral
  const queue: any[] = [
    { contact: { id: 'a', lead_score: 40 }, category: 'warm' },
    { contact: { id: 'b', lead_score: 90 }, category: 'warm' },
    { contact: { id: 'c', lead_score: 10 }, category: 'hot_unclosed' },
    { contact: { id: 'd', lead_score: null }, category: 'hot_unclosed' },
    { contact: { id: 'e', lead_score: 5 }, category: 'post_order' },
  ];
  const prioritized = prioritizeReactivationQueue(queue, { prioritizeByScore: true, minLeadScore: 25 });
  assert.deepStrictEqual(prioritized.map((i) => i.contact.id), ['b', 'a', 'd', 'e']);
  const legacy2 = prioritizeReactivationQueue(queue, { prioritizeByScore: false, minLeadScore: 25 });
  assert.strictEqual(legacy2.length, 5);
  assert.strictEqual(legacy2[0].category, 'hot_unclosed');
  console.log('   ✅ recontacto: mayor score primero, umbral, post-pedido exento');

  // 8. Orden del inbox por score
  assert.strictEqual(resolveInboxSort('seguimiento', 'auto'), 'score');
  assert.strictEqual(resolveInboxSort('por_responder', 'auto'), 'recent');
  const ca = { id: '1', lead_score: 30, last_interaction_at: hoursAgo(1) };
  const cb = { id: '2', lead_score: 80, last_interaction_at: hoursAgo(5) };
  assert.ok(compareInboxContacts(ca, cb, 'mis_abiertos', 'score') > 0, 'score alto primero');
  assert.ok(compareInboxContacts(ca, cb, 'mis_abiertos', 'recent') < 0, 'reciente primero');
  console.log('   ✅ comparador del inbox respeta el modo de orden');

  console.log('\n🎉 lead-score: todas las pruebas pasaron\n');
}

run();
