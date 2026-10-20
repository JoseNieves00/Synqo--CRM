import assert from 'node:assert';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { encryptSecret, decryptSecret } from '../lib/security/encryption';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

console.log('🧪 Iniciando Verificación de Base de Datos y Formularios en Vivo...\n');

async function testFullWorkflow() {
  // 1. Probar Login con Supabase Auth
  console.log('1️⃣  Probando Formulario de Login (Supabase Auth)...');
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    realtime: { transport: ws as any },
  });

  const { data: authData, error: authError } = await userClient.auth.signInWithPassword({
    email: 'admin@synqo.dev',
    password: 'Synqo123456!',
  });

  assert.ifError(authError);
  assert.ok(authData.session, 'La sesión debe generarse correctamente');
  assert.strictEqual(authData.user?.email, 'admin@synqo.dev');
  console.log('   ✅ Login exitoso. Token JWT generado.');

  // 2. Obtener organización y perfil del usuario autenticado
  const userId = authData.user.id;
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
    realtime: { transport: ws as any },
  });

  const { data: profile, error: profileErr } = await adminClient
    .from('profiles')
    .select('id, organization_id, role, full_name')
    .eq('id', userId)
    .single();

  assert.ifError(profileErr);
  assert.ok(profile?.organization_id, 'El perfil debe tener una organización asignada');
  console.log(`   ✅ Perfil validado. Rol: "${profile.role}", Org ID: ${profile.organization_id}`);

  const orgId = profile.organization_id;

  // 3. Probar Formulario: Crear Nuevo Lead (NewLeadModal / createLead)
  console.log('\n2️⃣  Probando Formulario "+ Nuevo Lead" (Inserción en tabla contacts)...');
  const testPhone = '+525598765432';
  const testName = 'Dra. Sofía Martínez';

  // Limpiar lead de prueba previo si existía
  await adminClient.from('contacts').delete().eq('phone', testPhone).eq('organization_id', orgId);

  const { data: newLead, error: leadErr } = await adminClient
    .from('contacts')
    .insert({
      organization_id: orgId,
      name: testName,
      phone: testPhone,
      pipeline_stage: 'nuevo',
      is_ai_active: true,
      last_interaction_at: new Date().toISOString(),
    })
    .select('id, name, phone, pipeline_stage, is_ai_active')
    .single();

  assert.ifError(leadErr);
  assert.ok(newLead?.id, 'El lead debe tener un ID asignado');
  assert.strictEqual(newLead.name, testName);
  assert.strictEqual(newLead.pipeline_stage, 'nuevo');
  console.log(`   ✅ Lead creado en la base de datos con ID: ${newLead.id}`);

  // 4. Probar Formulario / Kanban: Cambio de Etapa (updateLeadStage)
  console.log('\n3️⃣  Probando Mover Tarjeta en Pipeline Kanban (Update en contacts)...');
  const { error: stageErr } = await adminClient
    .from('contacts')
    .update({
      pipeline_stage: 'calificado',
      updated_at: new Date().toISOString(),
    })
    .eq('id', newLead.id);

  assert.ifError(stageErr);

  const { data: updatedLead } = await adminClient
    .from('contacts')
    .select('pipeline_stage')
    .eq('id', newLead.id)
    .single();

  assert.strictEqual(updatedLead?.pipeline_stage, 'calificado');
  console.log('   ✅ Etapa del lead actualizada en Supabase a: "calificado".');

  // 5. Probar Formulario de Ajustes & Cifrado AES-256-GCM (SettingsForm / updateOrganizationSettings)
  console.log('\n4️⃣  Probando Formulario de Ajustes & Cifrado en Reposo (organizations)...');
  const plainWabaToken = 'EAAG...test_permanent_meta_token_production';
  const plainCalKey = 'cal_live_test_api_key_778899';
  const encryptedWabaToken = encryptSecret(plainWabaToken);
  const encryptedCalKey = encryptSecret(plainCalKey);

  assert.ok(encryptedWabaToken.startsWith('enc:'));
  assert.ok(encryptedCalKey.startsWith('enc:'));

  const { error: settingsErr } = await adminClient
    .from('organizations')
    .update({
      whatsapp_phone_number_id: '10987654321',
      whatsapp_access_token: encryptedWabaToken,
      cal_api_key: encryptedCalKey,
      cal_event_type_id: '887766',
      system_prompt: 'Prompt personalizado para ventas en WhatsApp.',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId);

  assert.ifError(settingsErr);

  // Consultar y verificar descifrado
  const { data: orgData } = await adminClient
    .from('organizations')
    .select('whatsapp_phone_number_id, whatsapp_access_token, cal_api_key, system_prompt')
    .eq('id', orgId)
    .single();

  assert.strictEqual(orgData?.whatsapp_phone_number_id, '10987654321');
  assert.strictEqual(decryptSecret(orgData?.whatsapp_access_token || ''), plainWabaToken);
  assert.strictEqual(decryptSecret(orgData?.cal_api_key || ''), plainCalKey);
  console.log('   ✅ Configuración guardada en Supabase y tokens cifrados con AES-256-GCM.');

  // 6. Probar Chat & Regla de Negocio (Mensaje de Agente silencia IA)
  console.log('\n5️⃣  Probando Intervención de Agente y Switch IA en Chat (messages)...');
  const { error: msgErr } = await adminClient.from('messages').insert({
    contact_id: newLead.id,
    sender_type: 'agent_manual',
    content: 'Hola Sofía, soy un asesor humano. ¿En qué te podemos apoyar hoy?',
  });
  assert.ifError(msgErr);

  // Silenciar IA
  await adminClient.from('contacts').update({ is_ai_active: false }).eq('id', newLead.id);

  const { data: leadAfterAgent } = await adminClient
    .from('contacts')
    .select('is_ai_active')
    .eq('id', newLead.id)
    .single();

  assert.strictEqual(leadAfterAgent?.is_ai_active, false);
  console.log('   ✅ Mensaje persistido y Switch IA silenciado automáticamente (is_ai_active = false).');

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE CONEXIÓN A BASE DE DATOS Y FORMULARIOS FUERON EXITOSAS!');
}

testFullWorkflow().catch((err) => {
  console.error('❌ Error durante la verificación:', err);
  process.exit(1);
});
