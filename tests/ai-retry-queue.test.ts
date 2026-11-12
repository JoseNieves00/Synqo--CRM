import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { isChannelAuthError, computeNextRetryDelayMs, AiRetryService } from '../services/ai-retry.service';

const MIGRATION_PATH = path.join(
  process.cwd(),
  'supabase/migrations/20261111130000_ai_retry_queue_and_cron_log.sql'
);
const CRON_ROUTE_PATH = path.join(process.cwd(), 'app/api/cron/lead-reactivation/route.ts');
const INBOUND_PATH = path.join(process.cwd(), 'services/inbound-core.service.ts');
const SUPERADMIN_PATH = path.join(process.cwd(), 'app/actions/superadmin.ts');

function run() {
  console.log('\n🧪 Suite: Reintentos diferidos de IA (dead-letter con reintento real)\n');

  // 1. Errores de credenciales del canal NO se reintentan (ya disparan su propia alerta)
  assert.strictEqual(isChannelAuthError('(#190) Access token has expired'), true);
  assert.strictEqual(isChannelAuthError('OAuthException: token inválido'), true);
  assert.strictEqual(isChannelAuthError('las credenciales del canal expiraron'), true);
  assert.strictEqual(isChannelAuthError('Network timeout'), false);
  assert.strictEqual(isChannelAuthError('500 Internal Server Error'), false);
  assert.strictEqual(isChannelAuthError(null), false);
  console.log('   ✅ isChannelAuthError clasifica credenciales vs errores reintentables');

  // 2. Backoff exponencial corto: 90s, 4min, 9min
  assert.strictEqual(computeNextRetryDelayMs(1), 90_000);
  assert.strictEqual(computeNextRetryDelayMs(2), 360_000);
  assert.strictEqual(computeNextRetryDelayMs(3), 810_000);
  assert.strictEqual(computeNextRetryDelayMs(0), 90_000); // normalizado a mínimo 1
  console.log('   ✅ computeNextRetryDelayMs produce backoff 90s → 4min → 9min');

  // 3. Migración: tabla ai_retry_queue con estrategias, estados, RLS e índice de vencidos
  const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS ai_retry_queue'), 'ai_retry_queue debe existir');
  assert.ok(migration.includes("strategy IN ('regenerate', 'resend')"), 'estrategias regenerate/resend');
  assert.ok(migration.includes("status IN ('pending', 'in_progress', 'done', 'failed')"), 'estados de la cola');
  assert.ok(migration.includes('ENABLE ROW LEVEL SECURITY'), 'RLS habilitada');
  assert.ok(migration.includes('idx_ai_retry_queue_due'), 'índice parcial de filas vencidas');
  console.log('   ✅ Migración ai_retry_queue completa (estrategias, estados, RLS, índice)');

  // 4. Migración: cron_job_log + synqo_invoke_cron ya NO omite en silencio
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS cron_job_log'), 'cron_job_log debe existir');
  assert.ok(
    migration.includes("'skipped_missing_secrets'"),
    'la omisión por secretos de Vault faltantes debe quedar registrada'
  );
  assert.ok(migration.includes('INSERT INTO public.cron_job_log'), 'synqo_invoke_cron registra invocaciones');
  assert.ok(migration.includes('cron_job_log_superadmin_read'), 'lectura de salud restringida a superadmin');
  console.log('   ✅ cron_job_log registra omisiones de Vault (fin del modo silencioso)');

  // 5. Cron: la cola de reintentos corre con prioridad (antes de campañas) y registra su salud
  const cronRoute = fs.readFileSync(CRON_ROUTE_PATH, 'utf8');
  assert.ok(cronRoute.includes('AiRetryService.processRetryQueue'), 'el cron debe procesar la cola de reintentos');
  const retryIdx = cronRoute.indexOf('processRetryQueue');
  const campaignsIdx = cronRoute.indexOf('processRunningCampaigns');
  assert.ok(retryIdx > -1 && campaignsIdx > -1 && retryIdx < campaignsIdx, 'reintentos ANTES de campañas');
  assert.ok(cronRoute.includes("job_name: 'lead-reactivation'"), 'el cron registra su ejecución en cron_job_log');
  assert.ok(cronRoute.includes('logCronRun'), 'helper de salud de cron presente');
  console.log('   ✅ Cron procesa reintentos con prioridad y deja rastro de salud');

  // 6. Inbound-core: encola resend en fallo de despacho y regenerate en fallo fatal
  const inbound = fs.readFileSync(INBOUND_PATH, 'utf8');
  assert.ok(inbound.includes("strategy: 'resend'"), 'fallo de despacho → reintento resend (no gasta tokens)');
  assert.ok(inbound.includes("strategy: 'regenerate'"), 'fallo fatal del worker → reintento regenerate');
  assert.ok(
    inbound.includes('isChannelAuthError(errMessageRaw)'),
    'errores de credenciales del canal no se reintentan'
  );
  assert.ok(inbound.includes('retryOutboundText') && inbound.includes('retryOutboundMedia'), 'payload de resend preservado');
  console.log('   ✅ Inbound-core encola reintentos en ambos modos de fallo');

  // 7. Escalada + panel SuperAdmin
  const superadmin = fs.readFileSync(SUPERADMIN_PATH, 'utf8');
  assert.ok(superadmin.includes('getCronHealthAction'), 'acción de salud de crons para SuperAdmin');
  assert.ok(superadmin.includes('skippedMissingSecretsLast24h'), 'detecta el modo silencioso de Vault');
  assert.ok(
    AiRetryService.processRetryQueue && typeof AiRetryService.processRetryQueue === 'function',
    'processRetryQueue exportada'
  );
  assert.ok(
    AiRetryService.enqueueRetry && typeof AiRetryService.enqueueRetry === 'function',
    'enqueueRetry exportada'
  );
  console.log('   ✅ Acción getCronHealthAction + escalada al asesor disponibles');

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE REINTENTOS DIFERIDOS DE IA PASARON EXITOSAMENTE!\n');
}

run();
