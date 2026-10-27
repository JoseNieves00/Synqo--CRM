import assert from 'node:assert';
import {
  checkAccountLockout,
  recordFailedLogin,
  recordSuccessfulLogin,
  MAX_FAILED_LOGIN_ATTEMPTS,
  LOCKOUT_DURATION_MS,
  SESSION_INACTIVITY_LIMIT_MS,
  SESSION_MAX_LIFETIME_MS,
} from '../lib/security/auth-protection';

async function runAuthSecurityTests() {
  console.log('\n🔒 Iniciando Suite de Pruebas: Seguridad de Sesión, Bloqueo de Intentos y Expiración...\n');

  const testEmail = `test.security.${Date.now()}@synqo.dev`;

  // 1. Verificar estado inicial (no bloqueado)
  console.log('1️⃣  Verificando que la cuenta no esté bloqueada inicialmente...');
  const initialStatus = await checkAccountLockout(testEmail);
  assert.strictEqual(initialStatus.locked, false, 'La cuenta no debe estar bloqueada al inicio');
  console.log('   ✅ Cuenta libre de bloqueo.');

  // 2. Registrar intentos fallidos sucesivos hasta el límite (5)
  console.log('2️⃣  Registrando intentos fallidos secuenciales (Límite = 5)...');
  for (let i = 1; i <= 4; i++) {
    const res = await recordFailedLogin(testEmail);
    assert.strictEqual(res.locked, false, `Intento fallido ${i} no debe bloquear la cuenta aún`);
    assert.strictEqual(res.remainingAttempts, MAX_FAILED_LOGIN_ATTEMPTS - i, `Intentos restantes deben ser ${MAX_FAILED_LOGIN_ATTEMPTS - i}`);
  }
  console.log('   ✅ Primeros 4 intentos fallidos descontados correctamente.');

  // 3. Quinto intento: debe disparar bloqueo temporal de 15 minutos
  console.log('3️⃣  Verificando que el 5to intento active el bloqueo temporal...');
  const fifthAttempt = await recordFailedLogin(testEmail);
  assert.strictEqual(fifthAttempt.locked, true, 'El 5to intento DEBE bloquear la cuenta');
  assert.strictEqual(fifthAttempt.remainingAttempts, 0, 'No deben quedar intentos');
  assert.strictEqual(fifthAttempt.minutesRemaining, 15, 'Debe indicar 15 minutos restantes');

  const lockCheck = await checkAccountLockout(testEmail);
  assert.strictEqual(lockCheck.locked, true, 'checkAccountLockout debe confirmar el bloqueo');
  assert.ok(lockCheck.minutesRemaining && lockCheck.minutesRemaining > 0, 'Debe retornar minutos de bloqueo');
  console.log(`   ✅ Bloqueo de seguridad activado por ${lockCheck.minutesRemaining} minutos.`);

  // 4. Reinicio tras login exitoso
  console.log('4️⃣  Probando reinicio del contador tras login exitoso...');
  await recordSuccessfulLogin(testEmail);
  const resetCheck = await checkAccountLockout(testEmail);
  assert.strictEqual(resetCheck.locked, false, 'La cuenta debe desbloquearse tras login exitoso');
  console.log('   ✅ Contadores reiniciados exitosamente.');

  // 5. Constantes de ciclo de vida de sesión
  console.log('5️⃣  Verificando políticas de tiempo de sesión...');
  assert.strictEqual(SESSION_INACTIVITY_LIMIT_MS, 8 * 60 * 60 * 1000, 'Inactividad debe ser 8 horas');
  assert.strictEqual(SESSION_MAX_LIFETIME_MS, 24 * 60 * 60 * 1000, 'Duración máxima debe ser 24 horas');
  console.log('   ✅ Políticas de expiración verificadas: 8h inactividad, 24h absoluta.');

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE SEGURIDAD Y SESIÓN PASARON EXITOSAMENTE!\n');
}

runAuthSecurityTests().catch((err) => {
  console.error('❌ Error en pruebas de seguridad:', err);
  process.exit(1);
});

