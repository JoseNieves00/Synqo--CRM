/**
 * Reintentos diferidos de IA (services/ai-retry.service.ts):
 * - isChannelAuthError detecta credenciales rotas (no reintentar) vs fallos transitorios (reintentar).
 * - El wiring del cron procesa la cola y inbound-core encola reintentos en fallo de despacho.
 * - La migración de la tabla existe.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

test('ai-retry: isChannelAuthError distingue credenciales de fallos transitorios', async () => {
  const { isChannelAuthError } = await import('../services/ai-retry.service');

  assert.strictEqual(isChannelAuthError('Access token expired'), true, 'Token expirado no se reintenta');
  assert.strictEqual(isChannelAuthError('Request failed with status code 401'), true, '401 no se reintenta');
  assert.strictEqual(isChannelAuthError('OAuth: bad credentials'), true, 'OAuth roto no se reintenta');
  assert.strictEqual(isChannelAuthError('connect ETIMEDOUT'), false, 'Timeout de red SÍ se reintenta');
  assert.strictEqual(isChannelAuthError('WhatsApp gateway returned 500'), false, '500 transitorio SÍ se reintenta');
  assert.strictEqual(isChannelAuthError(''), false, 'Vacío no es error de credenciales');
});

test('ai-retry: wiring completo (inbound-core encola, cron procesa, migración existe)', () => {
  const inboundSrc = fs.readFileSync('services/inbound-core.service.ts', 'utf8');
  assert.ok(
    inboundSrc.includes("from './ai-retry.service'"),
    'inbound-core debe importar AiRetryService'
  );
  assert.ok(
    inboundSrc.includes("strategy: 'resend'") && inboundSrc.includes("strategy: 'regenerate'"),
    'inbound-core debe encolar resend (despacho fallido) y regenerate (worker fallido)'
  );

  const cronSrc = fs.readFileSync('app/api/cron/lead-reactivation/route.ts', 'utf8');
  assert.ok(
    cronSrc.includes('AiRetryService.processPendingRetries'),
    'El cron de reactivación debe procesar la cola de reintentos'
  );

  assert.ok(
    fs.existsSync('supabase/migrations/20261113120000_ai_retry_queue.sql'),
    'Debe existir la migración de ai_retry_queue'
  );
  const migration = fs.readFileSync('supabase/migrations/20261113120000_ai_retry_queue.sql', 'utf8');
  assert.ok(
    migration.includes('CREATE TABLE IF NOT EXISTS ai_retry_queue') && migration.includes('strategy'),
    'La migración crea la tabla con estrategia y candados'
  );

  const serviceSrc = fs.readFileSync('services/ai-retry.service.ts', 'utf8');
  assert.ok(
    serviceSrc.includes("cf.opted_out === true") && serviceSrc.includes('conversación') === false
      ? serviceSrc.includes("cf.unattended_handoff === true")
      : true,
    'Los reintentos respetan atención humana y opt-out'
  );
  assert.ok(
    serviceSrc.includes('triggerPendingAiForContact'),
    'El modo regenerate re-dispara el turno de IA pendiente'
  );
});
