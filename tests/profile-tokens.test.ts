import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import assert from 'assert';
import { checkTokenQuota } from '../lib/monitoring/token-tracker';
import { testWhatsAppConnection, testCalConnection } from '../app/actions/settings';
import { supabaseAdmin } from '../lib/supabase/admin';

async function runTests() {
  console.log('🧪 Iniciando Pruebas de Perfil, Monitoreo de Tokens y Conexiones...\n');

  // 1. Probar cálculo de cuota de tokens y límites
  console.log('1️⃣  Probando límites y cálculo de cuota de tokens (Token Tracker)...');
  const orgResult = await checkTokenQuota('non-existent-org-id');
  assert.strictEqual(orgResult.allowed, true, 'Por defecto debe permitir');
  assert(orgResult.limit >= 100000, 'Límite base debe ser al menos 100,000 tokens');
  assert.strictEqual(orgResult.percentage, 0, 'Porcentaje debe ser 0 para empresa sin consumo previo');
  console.log('   ✅ Cuotas por defecto y límites de tokens validados.');

  // 2. Probar validación de parámetros en Test de Conexión de WhatsApp
  console.log('2️⃣  Probando Test de Conexión de WhatsApp Cloud API...');
  const waInvalidTest = await testWhatsAppConnection({
    phoneNumberId: 'invalid_id_99999',
    accessToken: 'invalid_token_xyz',
  });
  assert.strictEqual(waInvalidTest.success, false, 'Credenciales falsas deben retornar success: false');
  assert(waInvalidTest.error, 'Debe devolver un mensaje de error explicativo');
  console.log('   ✅ Rechazo seguro de credenciales falsas en WhatsApp verificado:', waInvalidTest.error?.slice(0, 40) + '...');

  // 3. Probar validación de parámetros en Test de Conexión de Cal.com
  console.log('3️⃣  Probando Test de Conexión de Cal.com...');
  const calInvalidTest = await testCalConnection({
    apiKey: 'cal_live_invalid_key_123',
    eventTypeId: '99999',
  });
  assert.strictEqual(calInvalidTest.success, false, 'API key falsa de Cal.com debe retornar success: false');
  console.log('   ✅ Rechazo seguro de API Key falsa en Cal.com verificado.');

  // 4. Verificar perfil de usuario y flags de contraseña
  console.log('4️⃣  Verificando perfil de usuario y metadatos de Supabase Auth...');
  const { data: superAdminUser } = await supabaseAdmin.auth.admin.listUsers();
  const admin = superAdminUser?.users.find((u) => u.email === 'admin@synqo.dev');
  assert(admin, 'Usuario admin@synqo.dev debe existir en Supabase Auth');
  console.log('   ✅ Usuario superadmin verificado en Supabase Auth UID:', admin.id);

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE PERFIL, TOKENS Y CONEXIONES PASARON EXITOSAMENTE!');
}

runTests().catch((err) => {
  console.error('❌ Error en pruebas:', err);
  process.exit(1);
});

