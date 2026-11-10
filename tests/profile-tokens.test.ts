import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import assert from 'assert';
import { checkTokenQuota, checkBackupTokenQuota } from '../lib/monitoring/token-tracker';
import {
  computeTokenStatus,
  formatPushTokenAlertMessage,
  normalizeAlertThresholds,
} from '../lib/monitoring/token-policy';
import { evaluateManagerCommand } from '../services/manager-whatsapp.service';
import { hashPassword } from '../lib/security/encryption';
import { testWhatsAppConnection } from '../app/actions/settings';
import { supabaseAdmin } from '../lib/supabase/admin';

async function runTests() {
  console.log('🧪 Iniciando Pruebas de Perfil, Monitoreo de Tokens y Conexiones...\n');

  // 1. Probar cálculo de cuota de tokens y límites
  console.log('1️⃣  Probando límites y cálculo de cuota de tokens (Token Tracker)...');
  const orgResult = await checkTokenQuota('non-existent-org-id');
  assert.strictEqual(orgResult.allowed, true, 'Por defecto debe permitir');
  assert(orgResult.limit >= 100000, 'Límite base debe ser al menos 100,000 tokens');
  assert.strictEqual(orgResult.percentage, 0, 'Porcentaje debe ser 0 para empresa sin consumo previo');

  const backupResult = await checkBackupTokenQuota('non-existent-org-id');
  assert.strictEqual(backupResult.allowed, true, 'Por defecto backup debe permitir');
  assert(backupResult.limit >= 25000, 'Límite base backup debe ser al menos 25,000 tokens de OpenAI');
  assert.strictEqual(backupResult.percentage, 0, 'Porcentaje backup debe ser 0 para empresa sin consumo previo');
  console.log('   ✅ Cuotas por defecto y límites de tokens validados (Google Primario + OpenAI Backup).');

  // 2. Probar validación de parámetros en Test de Conexión de WhatsApp
  console.log('2️⃣  Probando Test de Conexión de WhatsApp Cloud API...');
  const waInvalidTest = await testWhatsAppConnection({
    phoneNumberId: 'invalid_id_99999',
    accessToken: 'invalid_token_xyz',
  });
  assert.strictEqual(waInvalidTest.success, false, 'Credenciales falsas deben retornar success: false');
  assert(waInvalidTest.error, 'Debe devolver un mensaje de error explicativo');
  console.log('   ✅ Rechazo seguro de credenciales falsas en WhatsApp verificado:', waInvalidTest.error?.slice(0, 40) + '...');

  // 3. Verificar perfil de usuario y flags de contraseña
  console.log('3️⃣  Verificando perfil de usuario y metadatos de Supabase Auth...');
  const { data: superAdminUser } = await supabaseAdmin.auth.admin.listUsers();
  const admin = superAdminUser?.users.find((u) => u.email === 'admin@synqo.dev');
  assert(admin, 'Usuario admin@synqo.dev debe existir en Supabase Auth');
  console.log('   ✅ Usuario superadmin verificado en Supabase Auth UID:', admin.id);

  // 4. Umbrales Push configurables (x%), Modo Excedente al 100% y Mensajería Gerencial (#tokens + PIN)
  console.log('4️⃣  Probando umbrales Push x%, Modo Excedente y flujo WhatsApp #tokens con PIN...');
  assert.deepStrictEqual(normalizeAlertThresholds('95, 65, 95, 5, 110'), [65, 95]);
  assert.deepStrictEqual(normalizeAlertThresholds('invalid'), [80, 90, 100]);

  const policyCustom = {
    alertThresholds: [65, 90, 100],
    alertsSentInCycle: {},
    overagePricePer500kCop: 35000,
    overageAllowed: true,
  };

  const stBelow = computeTokenStatus({ used: 300000, limit: 500000, policy: policyCustom });
  assert.strictEqual(stBelow.rawPercentage, 60);
  assert.strictEqual(stBelow.highestUnnotifiedThreshold, null);
  assert.strictEqual(stBelow.isOverage, false);

  const st65 = computeTokenStatus({ used: 330000, limit: 500000, policy: policyCustom });
  assert.strictEqual(st65.rawPercentage, 66);
  assert.strictEqual(st65.highestUnnotifiedThreshold, 65);
  assert.strictEqual(st65.isWarning, true);

  // Al marcar 65 como enviado, no debe volver a disparar hasta llegar a 90%
  const st65Notified = computeTokenStatus({
    used: 390000,
    limit: 500000,
    policy: { ...policyCustom, alertsSentInCycle: { '65': '2026-11-10T10:00:00Z' } },
  });
  assert.strictEqual(st65Notified.highestUnnotifiedThreshold, null);

  // Al superar 100% (Modo Excedente), calcula excedente real sin detener bot
  const stOverage = computeTokenStatus({
    used: 620000,
    limit: 500000,
    policy: { ...policyCustom, alertsSentInCycle: { '65': '2026-11-10T10:00:00Z' } },
  });
  assert.strictEqual(stOverage.isOverage, true);
  assert.strictEqual(stOverage.overageTokens, 120000);
  assert.strictEqual(stOverage.rawPercentage, 124);
  assert.strictEqual(stOverage.highestUnnotifiedThreshold, 100);

  const pushMsg = formatPushTokenAlertMessage({
    orgName: 'Empresa Demo',
    adminName: 'Jose',
    threshold: 100,
    used: stOverage.used,
    limit: stOverage.limit,
    rawPercentage: stOverage.rawPercentage,
    overageTokens: stOverage.overageTokens,
    overagePricePer500kCop: 35000,
  });
  assert(pushMsg.includes('Modo Excedente'), 'Aviso al 100% debe confirmar Modo Excedente');
  assert(pushMsg.includes('120.000'), 'Aviso debe mostrar tokens excedentes');

  // Probar seguridad tipo Bancolombia (#tokens + PIN 4 dígitos + bloqueo 3 intentos)
  const pinHash = hashPassword('4829');
  const mockOrg = {
    id: 'org-mgr-test',
    name: 'Empresa Demo',
    ai_tokens_used: 620000,
    ai_tokens_limit: 500000,
    ai_tokens_google_used: 600000,
    ai_tokens_openai_used: 20000,
    appointment_settings: {
      token_policy: policyCustom,
      manager_security: { pinHash, sessionTtlMinutes: 15, sessions: {} },
    },
  };
  const adminActor = { id: 'usr-admin-1', full_name: 'Jose Nieves', role: 'admin' };
  const agentActor = { id: 'usr-agent-1', full_name: 'Ana', role: 'agent' };

  // Agente sin permisos no puede acceder
  const resAgent = evaluateManagerCommand({ org: mockOrg, advisor: agentActor, messageText: '#tokens' });
  assert.strictEqual(resAgent.handled, true);
  assert(resAgent.replyText?.includes('reservado'), 'Agente raso debe ser rechazado');

  // Mensaje normal del admin no se intercepta
  const resNormal = evaluateManagerCommand({ org: mockOrg, advisor: adminActor, messageText: 'Hola equipo' });
  assert.strictEqual(resNormal.handled, false);

  // Admin escribe #tokens -> solicita PIN de 4 dígitos
  const resAskPin = evaluateManagerCommand({
    org: mockOrg,
    advisor: adminActor,
    messageText: '#tokens',
    nowMs: 1_700_000_000_000,
  });
  assert.strictEqual(resAskPin.handled, true);
  assert(resAskPin.replyText?.includes('PIN de 4 dígitos'), 'Debe pedir PIN antes de mostrar datos');

  // 3 intentos fallidos -> bloqueo de 1 hora
  let curSettings = resAskPin.updatedAppointmentSettings!;
  for (let i = 1; i <= 3; i++) {
    const resWrong = evaluateManagerCommand({
      org: { ...mockOrg, appointment_settings: curSettings },
      advisor: adminActor,
      messageText: '0000',
      nowMs: 1_700_000_001_000 + i * 1000,
    });
    curSettings = resWrong.updatedAppointmentSettings!;
    if (i === 3) {
      assert(resWrong.replyText?.includes('bloqueado por 1 hora'), '3er fallo debe bloquear 1h');
    }
  }

  // Verificar rechazo mientras está bloqueado
  const resLocked = evaluateManagerCommand({
    org: { ...mockOrg, appointment_settings: curSettings },
    advisor: adminActor,
    messageText: '#tokens',
    nowMs: 1_700_000_050_000,
  });
  assert(resLocked.replyText?.includes('bloqueado temporalmente'));

  // Desbloqueo con PIN correcto en flujo normal -> entrega reporte de tokens + excedente
  const resAsk2 = evaluateManagerCommand({
    org: mockOrg,
    advisor: adminActor,
    messageText: '#tokens',
    nowMs: 1_700_000_000_000,
  });
  const resValid = evaluateManagerCommand({
    org: { ...mockOrg, appointment_settings: resAsk2.updatedAppointmentSettings },
    advisor: adminActor,
    messageText: '4829',
    nowMs: 1_700_000_005_000,
  });
  assert(resValid.replyText?.includes('ESTADO DE TOKENS'), 'PIN válido debe entregar reporte de tokens');
  assert(resValid.replyText?.includes('120.000'), 'Reporte debe incluir excedente acumulado');

  // Dentro de sesión activa (15 min), #admin abre menú y salir cierra sesión
  const resMenu = evaluateManagerCommand({
    org: { ...mockOrg, appointment_settings: resValid.updatedAppointmentSettings },
    advisor: adminActor,
    messageText: '#admin',
    nowMs: 1_700_000_010_000,
  });
  assert(resMenu.replyText?.includes('PANEL GERENCIAL'));

  const resExit = evaluateManagerCommand({
    org: { ...mockOrg, appointment_settings: resMenu.updatedAppointmentSettings },
    advisor: adminActor,
    messageText: 'salir',
    nowMs: 1_700_000_015_000,
  });
  assert(resExit.replyText?.includes('cerrada'));
  console.log('   ✅ Umbrales Push x%, Modo Excedente y Seguridad Gerencial WhatsApp (#tokens + PIN) verificados.');

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE PERFIL, TOKENS Y CONEXIONES PASARON EXITOSAMENTE!');
}

runTests().catch((err) => {
  console.error('❌ Error en pruebas:', err);
  process.exit(1);
});

