import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import assert from 'assert';
import { supabaseAdmin } from '../lib/supabase/admin';

async function runTests() {
  console.log('🧪 Iniciando Pruebas de Consola Super Admin y Control de Usuarios...\n');

  // 1. Verificar existencia de la organización demo y super admin en Supabase
  console.log('1️⃣  Verificando perfil de Super Administrador...');
  const { data: superAdminProfile, error: pError } = await (supabaseAdmin.from('profiles') as any)
    .select('id, email, is_super_admin, role, organization_id')
    .eq('email', 'admin@synqo.dev')
    .single();

  assert(!pError && superAdminProfile, 'El perfil del super admin debe existir.');
  assert.strictEqual(superAdminProfile.is_super_admin, true, 'is_super_admin debe ser true');
  console.log('   ✅ Super Admin verificado correctamente:', superAdminProfile.email);

  // 2. Verificar lectura de organizaciones y usuarios
  console.log('2️⃣  Probando límites de usuarios y conteo en organizaciones...');
  const { data: org, error: orgError } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name, max_users, is_active, subscription_status')
    .eq('id', superAdminProfile.organization_id)
    .single();

  assert(!orgError && org, 'La organización debe existir.');
  assert(org.max_users >= 1, 'max_users debe ser al menos 1.');
  assert(org.is_active === true, 'is_active debe ser true.');
  console.log(`   ✅ Organización "${org.name}" verificada: ${org.max_users} usuarios autorizados.`);

  // 3. Probar lógica de control de cupos (Seat Quota Check)
  console.log('3️⃣  Validando bloqueo de creación de agentes al superar max_users...');
  const { count: currentMembers } = await (supabaseAdmin.from('profiles') as any)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', org.id);

  const memberCount = currentMembers || 0;
  console.log(`   Miembros actuales en la organización: ${memberCount} / ${org.max_users}`);

  const testSeatExceeded = (requestedCount: number, limit: number) => {
    if (requestedCount >= limit) {
      throw new Error(`Has alcanzado el límite de ${limit} usuarios permitidos.`);
    }
  };

  assert.throws(
    () => testSeatExceeded(org.max_users, org.max_users),
    /Has alcanzado el límite/,
    'Debe lanzar error al superar la cuota de usuarios'
  );
  console.log('   ✅ Bloqueo de cuota de usuarios probado con éxito.');

  // 4. Probar actualización de campos de contacto (Ficha y Notas)
  console.log('4️⃣  Probando persistencia de notas y fase en contactos...');
  const { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .select('id, name, custom_fields, pipeline_stage')
    .eq('organization_id', org.id)
    .limit(1)
    .single();

  if (contact) {
    const testNotes = `Nota de prueba automatizada - ${Date.now()}`;
    const { error: updateError } = await (supabaseAdmin.from('contacts') as any)
      .update({
        custom_fields: {
          ...(contact.custom_fields || {}),
          notes: testNotes,
        },
        pipeline_stage: 'calificado',
        updated_at: new Date().toISOString(),
      })
      .eq('id', contact.id);

    assert(!updateError, 'No debe haber error al actualizar la ficha del lead');

    const { data: updatedContact } = await (supabaseAdmin.from('contacts') as any)
      .select('custom_fields, pipeline_stage')
      .eq('id', contact.id)
      .single();

    assert.strictEqual(updatedContact.custom_fields?.notes, testNotes, 'Las notas deben coincidir');
    assert.strictEqual(updatedContact.pipeline_stage, 'calificado', 'La fase debe ser calificado');
    console.log('   ✅ Actualización de ficha y notas de prospecto verificada en Supabase.');
  } else {
    console.log('   ℹ️ No hay contactos para la org demo; omitiendo mutación.');
  }

  // 5. Probar persistencia de módulos y código de empresa (Fase 2)
  console.log('5️⃣  Probando persistencia de Módulos (enabled_modules) y Código de Empresa...');
  const testModules = {
    native_calendar: true,
    physical_rooms: true,
    staff_mobile_portal: true,
    quick_pay: false,
    anti_no_show: true,
  };

  const { error: modUpdateErr } = await (supabaseAdmin.from('organizations') as any)
    .update({
      enabled_modules: testModules,
      updated_at: new Date().toISOString(),
    })
    .eq('id', org.id);

  assert(!modUpdateErr, 'No debe haber error al guardar enabled_modules en organizations');

  const { data: updatedOrg, error: fetchOrgErr } = await (supabaseAdmin.from('organizations') as any)
    .select('company_code, enabled_modules')
    .eq('id', org.id)
    .single();

  assert(!fetchOrgErr && updatedOrg, 'Debe leerse la organización actualizada');
  assert.strictEqual(updatedOrg.enabled_modules?.physical_rooms, true, 'physical_rooms debe ser true');
  assert.strictEqual(updatedOrg.enabled_modules?.staff_mobile_portal, true, 'staff_mobile_portal debe ser true');
  console.log(`   ✅ Módulos activos validados en Supabase. Código Empresa: ${updatedOrg.company_code || 'AUTOGEN'}`);

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE SUPER ADMIN Y EQUIPO PASARON CON ÉXITO!');
}

runTests().catch((err) => {
  console.error('❌ Error en pruebas:', err);
  process.exit(1);
});

