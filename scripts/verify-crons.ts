import assert from 'node:assert';
import { NextRequest } from 'next/server';

// 1. Simular secreto de cron para pruebas
const TEST_CRON_SECRET = process.env.CRON_SECRET || 'synqo_test_cron_secret_validation_2026';
process.env.CRON_SECRET = TEST_CRON_SECRET;

async function runCronVerification() {
  console.log('\n🔍 ==============================================================================');
  console.log('   VERIFICACIÓN INTEGRAL DE CRON JOBS (cron-job.org / Reminders & Storage)');
  console.log('==============================================================================\n');

  // Importar dinámicamente los handlers después de definir process.env.CRON_SECRET
  const { GET: reminderGet, POST: reminderPost } = await import('../app/api/cron/appointment-reminders/route');
  const { GET: cleanupGet, POST: cleanupPost } = await import('../app/api/cron/cleanup-storage/route');
  const { GET: reactivationGet, POST: reactivationPost } = await import('../app/api/cron/lead-reactivation/route');

  // ---------------------------------------------------------------------------
  // TEST 1: Seguridad y rechazo de peticiones no autorizadas
  // ---------------------------------------------------------------------------
  console.log('1️⃣  Probando seguridad de accesos no autorizados...');

  // A) Sin ningún secreto ni cabecera
  const reqNoAuth = new NextRequest('http://localhost:3000/api/cron/appointment-reminders');
  const resNoAuth = await reminderGet(reqNoAuth);
  assert.strictEqual(resNoAuth.status, 401, 'Petición sin autorización debe responder 401');

  // B) Con x-vercel-cron falsificado
  const reqSpoofed = new NextRequest('http://localhost:3000/api/cron/appointment-reminders', {
    headers: { 'x-vercel-cron': '1' },
  });
  const resSpoofed = await reminderGet(reqSpoofed);
  assert.strictEqual(resSpoofed.status, 401, 'Petición con solo x-vercel-cron debe responder 401');

  // C) Con secret incorrecto en Header
  const reqWrongHeader = new NextRequest('http://localhost:3000/api/cron/appointment-reminders', {
    headers: { authorization: 'Bearer clave_incorrecta_123' },
  });
  const resWrongHeader = await reminderGet(reqWrongHeader);
  assert.strictEqual(resWrongHeader.status, 401, 'Petición con Bearer inválido debe responder 401');

  // D) Con secret incorrecto en URL
  const reqWrongParam = new NextRequest('http://localhost:3000/api/cron/appointment-reminders?secret=clave_incorrecta_123');
  const resWrongParam = await reminderGet(reqWrongParam);
  assert.strictEqual(resWrongParam.status, 401, 'Petición con ?secret= inválido debe responder 401');

  console.log('   ✅ Todas las peticiones no autorizadas fueron bloqueadas (HTTP 401).');

  // ---------------------------------------------------------------------------
  // TEST 2: Ejecución de Recordatorios de Citas mediante cron-job.org Header
  // ---------------------------------------------------------------------------
  console.log('\n2️⃣  Probando Cron de Citas con cabecera (cron-job.org / Header Authorization)...');
  const reqHeader = new NextRequest('http://localhost:3000/api/cron/appointment-reminders', {
    headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
  });
  const resHeader = await reminderGet(reqHeader);
  const dataHeader = await resHeader.json();
  assert.strictEqual(resHeader.status, 200, 'Debe responder 200 OK con secret en Header');
  assert.strictEqual(dataHeader.success, true);
  console.log('   ✅ Respuesta:', JSON.stringify(dataHeader));

  // ---------------------------------------------------------------------------
  // TEST 3: Ejecución de Recordatorios de Citas mediante cron-job.org URL (?secret=)
  // ---------------------------------------------------------------------------
  console.log('\n3️⃣  Probando Cron de Citas con parámetro URL (?secret=...)...');
  const reqParam = new NextRequest(`http://localhost:3000/api/cron/appointment-reminders?secret=${TEST_CRON_SECRET}`);
  const resParam = await reminderGet(reqParam);
  const dataParam = await resParam.json();
  assert.strictEqual(resParam.status, 200, 'Debe responder 200 OK con ?secret= en URL');
  assert.strictEqual(dataParam.success, true);
  console.log('   ✅ Respuesta:', JSON.stringify(dataParam));

  // ---------------------------------------------------------------------------
  // TEST 4: Ejecución con método POST (por si cron-job.org usa POST)
  // ---------------------------------------------------------------------------
  console.log('\n4️⃣  Probando Cron de Citas con método POST...');
  const reqPost = new NextRequest(`http://localhost:3000/api/cron/appointment-reminders?secret=${TEST_CRON_SECRET}`, {
    method: 'POST',
  });
  const resPost = await reminderPost(reqPost);
  const dataPost = await resPost.json();
  assert.strictEqual(resPost.status, 200, 'Debe responder 200 OK con método POST');
  assert.strictEqual(dataPost.success, true);
  console.log('   ✅ Respuesta POST:', JSON.stringify(dataPost));

  // ---------------------------------------------------------------------------
  // TEST 5: Ejecución de Limpieza de Almacenamiento (cleanup-storage)
  // ---------------------------------------------------------------------------
  console.log('\n5️⃣  Probando Cron de Limpieza de Storage (retención de videos > 45 días)...');
  const reqStorage = new NextRequest(`http://localhost:3000/api/cron/cleanup-storage?secret=${TEST_CRON_SECRET}`);
  const resStorage = await cleanupGet(reqStorage);
  const dataStorage = await resStorage.json();
  assert.strictEqual(resStorage.status, 200, 'Debe responder 200 OK en cleanup-storage');
  assert.strictEqual(dataStorage.success, true);
  console.log('   ✅ Respuesta Storage:', JSON.stringify(dataStorage));

  // ---------------------------------------------------------------------------
  // TEST 6: Ejecución del Cron de Reactivación Autónoma (recontacto IA + reintentos)
  // ---------------------------------------------------------------------------
  console.log('\n6️⃣  Probando Cron de Reactivación Autónoma de Leads (recontacto IA + score + reintentos)...');

  const reqReactivationNoAuth = new NextRequest('http://localhost:3000/api/cron/lead-reactivation');
  const resReactivationNoAuth = await reactivationGet(reqReactivationNoAuth);
  assert.strictEqual(resReactivationNoAuth.status, 401, 'lead-reactivation sin autorización debe responder 401');

  const reqReactivation = new NextRequest(`http://localhost:3000/api/cron/lead-reactivation?secret=${TEST_CRON_SECRET}`);
  const resReactivation = await reactivationGet(reqReactivation);
  const dataReactivation = await resReactivation.json();
  assert.strictEqual(resReactivation.status, 200, 'Debe responder 200 OK en lead-reactivation');
  assert.strictEqual(dataReactivation.success, true);
  assert.ok('aiRetries' in dataReactivation, 'la respuesta debe incluir el resultado de la cola de reintentos de IA');

  const resReactivationPost = await reactivationPost(
    new NextRequest(`http://localhost:3000/api/cron/lead-reactivation?secret=${TEST_CRON_SECRET}`, { method: 'POST' })
  );
  const dataReactivationPost = await resReactivationPost.json();
  assert.strictEqual(resReactivationPost.status, 200, 'Debe responder 200 OK con método POST');
  assert.strictEqual(dataReactivationPost.success, true);
  console.log('   ✅ Respuesta Reactivación:', JSON.stringify(dataReactivation).slice(0, 300));

  console.log('\n🎉 ==============================================================================');
  console.log('   ¡VERIFICACIÓN COMPLETA! LOS CRON JOBS ESTÁN FUNCIONANDO AL 100%');
  console.log('==============================================================================\n');
}

runCronVerification().catch((err) => {
  console.error('\n❌ ERROR EN VERIFICACIÓN DE CRON JOBS:', err);
  process.exit(1);
});
