import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import assert from 'assert';
import { WhatsAppService } from '../services/whatsapp.service';
import { supabaseAdmin } from '../lib/supabase/admin';
import { encryptSecret, decryptSecret } from '../lib/security/encryption';

async function runEmbeddedSignupTests() {
  console.log('🧪 Iniciando Pruebas de Meta WhatsApp Embedded Signup...\n');

  // 1. Probar que WhatsAppService maneja rechazo de código falso ante Meta OAuth
  console.log('1️⃣  Probando intercambio de código falso con Meta Graph API...');
  try {
    await WhatsAppService.exchangeCodeForToken('fake_authorization_code_12345');
    assert.fail('Debería haber lanzado un error con código falso.');
  } catch (err: any) {
    assert(
      err.message.includes('Meta OAuth Error') || err.message.includes('Invalid') || err.message.includes('code'),
      `El mensaje de error debería ser de Meta OAuth: ${err.message}`
    );
    console.log('   ✅ Rechazo seguro de código falso en Meta OAuth verificado:', err.message.slice(0, 60) + '...');
  }

  // 2. Probar debugToken con token simulado
  console.log('2️⃣  Probando debugToken con token simulado...');
  const debugResult = await WhatsAppService.debugToken('fake_user_access_token_abc');
  assert.strictEqual(debugResult.isValid, false, 'Token falso debe ser marcado como inválido');
  assert(Array.isArray(debugResult.wabaIds), 'wabaIds debe ser un array');
  console.log('   ✅ debugToken evaluado correctamente con token simulado.');

  // 3. Probar persistencia y cifrado AES-256 de credenciales en Supabase
  console.log('3️⃣  Probando persistencia y cifrado AES-256 de credenciales en organizaciones...');
  const { data: orgs, error: fetchErr } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name, whatsapp_phone_number_id, whatsapp_access_token')
    .limit(1);

  assert(!fetchErr && orgs && orgs.length > 0, 'Debe existir al menos una organización para pruebas');
  const testOrg = orgs[0];
  const originalPhone = testOrg.whatsapp_phone_number_id;
  const originalToken = testOrg.whatsapp_access_token;

  // Simular guardado de credenciales automáticas de Embedded Signup
  const mockPhoneId = '109998887776655';
  const mockToken = 'EAAG_mock_token_for_embedded_signup_test';
  const encryptedMockToken = encryptSecret(mockToken);

  const { error: updateErr } = await (supabaseAdmin.from('organizations') as any)
    .update({
      whatsapp_phone_number_id: mockPhoneId,
      whatsapp_access_token: encryptedMockToken,
      updated_at: new Date().toISOString(),
    })
    .eq('id', testOrg.id);

  assert(!updateErr, `Error actualizando org: ${updateErr?.message}`);

  // Verificar que en la base de datos se guardó el número y el token cifrado
  const { data: updatedOrg } = await (supabaseAdmin.from('organizations') as any)
    .select('whatsapp_phone_number_id, whatsapp_access_token')
    .eq('id', testOrg.id)
    .single();

  assert.strictEqual(updatedOrg.whatsapp_phone_number_id, mockPhoneId);
  assert.notStrictEqual(updatedOrg.whatsapp_access_token, mockToken, 'El token debe estar cifrado en BD');
  const decrypted = decryptSecret(updatedOrg.whatsapp_access_token);
  assert.strictEqual(decrypted, mockToken, 'El token desencriptado debe coincidir');
  console.log('   ✅ Cifrado AES-256 y persistencia en organizations verificados.');

  // 4. Restaurar el estado original de la organización de prueba
  console.log('4️⃣  Restaurando estado original de la organización de prueba...');
  await (supabaseAdmin.from('organizations') as any)
    .update({
      whatsapp_phone_number_id: originalPhone,
      whatsapp_access_token: originalToken,
      updated_at: new Date().toISOString(),
    })
    .eq('id', testOrg.id);
  console.log('   ✅ Estado original restaurado con éxito.');

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE META WHATSAPP EMBEDDED SIGNUP PASARON EXITOSAMENTE!\n');
}

runEmbeddedSignupTests().catch((err) => {
  console.error('❌ Error en pruebas de Embedded Signup:', err);
  process.exit(1);
});

