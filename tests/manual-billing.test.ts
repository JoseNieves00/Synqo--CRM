import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import assert from 'assert';
import { registerCompanyPayment, toggleCompanyStatus } from '../app/actions/superadmin';
import { calculateBillingStatus } from '../lib/billing/billing-status';
import { supabaseAdmin } from '../lib/supabase/admin';

async function runBillingTests() {
  console.log('🧪 Iniciando Pruebas de Ciclo de Facturación Manual & Suspensión por Mora...\n');

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // 1. Probar cálculo de estados de cobranza (calculateBillingStatus)
  console.log('1️⃣  Probando cálculo de estados de cobranza (Opción A & Condiciones del Servicio)...');

  // Caso 1: Empresa nueva o al día con mes cubierto
  const alDiaStatus = calculateBillingStatus({
    is_active: true,
    subscription_status: 'active',
    paid_until_month: currentMonthStr,
  });
  assert.strictEqual(alDiaStatus.status, 'al_dia', 'Debe estar al día si cubre el mes actual');
  assert.strictEqual(alDiaStatus.isSuspended, false);
  console.log('   ✅ Estado "Al día" verificado:', alDiaStatus.label);

  // Caso 2: Empresa suspendida por el Super Admin
  const suspendidaStatus = calculateBillingStatus({
    is_active: false,
    subscription_status: 'past_due',
    past_due_since: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(), // 12 días en mora
  });
  assert.strictEqual(suspendidaStatus.status, 'mora_preventiva');
  assert.strictEqual(suspendidaStatus.isSuspended, true);
  assert(suspendidaStatus.daysPastDue >= 12, 'Días en mora debe ser al menos 12');
  console.log('   ✅ Estado "Suspensión Preventiva (Mora 10d+)" verificado:', suspendidaStatus.label);

  // Caso 3: Empresa dada de baja a los 30 días
  const canceladaStatus = calculateBillingStatus({
    is_active: false,
    subscription_status: 'canceled',
    past_due_since: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
  });
  assert.strictEqual(canceladaStatus.status, 'baja_definitiva');
  assert.strictEqual(canceladaStatus.isSuspended, true);
  console.log('   ✅ Estado "Baja Definitiva (30d+)" verificado:', canceladaStatus.label);

  // Caso 4: Cuenta del Super Admin exenta de mora y pagos
  const exentaStatus = calculateBillingStatus({
    is_active: true,
    is_exempt: true,
    subscription_status: 'past_due', // Aunque estuviera en past_due, la exención prima
  });
  assert.strictEqual(exentaStatus.status, 'al_dia');
  assert.strictEqual(exentaStatus.isSuspended, false);
  assert.strictEqual(exentaStatus.label, 'Exento (Super Admin)');
  console.log('   ✅ Estado "Cuenta Exenta (Super Admin)" verificado:', exentaStatus.label);

  // 2. Probar toggleCompanyStatus en base de datos real
  console.log('\n2️⃣  Probando suspensión y reactivación en Supabase...');
  const { data: demoOrg } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name, is_active, subscription_status')
    .eq('name', 'Empresa Synqo Demo')
    .single();

  if (demoOrg) {
    // Suspender preventivamente
    await toggleCompanyStatus(demoOrg.id, false);
    const { data: orgSuspended } = await (supabaseAdmin.from('organizations') as any)
      .select('id, is_active, subscription_status')
      .eq('id', demoOrg.id)
      .single();
    assert.strictEqual(orgSuspended.is_active, false, 'is_active debe ser false tras suspender');
    assert.strictEqual(orgSuspended.subscription_status, 'past_due', 'subscription_status debe ser past_due tras suspender');
    console.log('   ✅ Suspensión preventiva por mora aplicada correctamente.');

    // Reactivar registrando pago manual (reiniciando tokens a 0)
    await registerCompanyPayment({
      organizationId: demoOrg.id,
      amount: 60,
      periodMonth: currentMonthStr,
      paymentMethod: 'transferencia',
      notes: 'Test automatizado de registro de pago',
    });

    const { data: orgReactivated } = await (supabaseAdmin.from('organizations') as any)
      .select('id, is_active, subscription_status, ai_tokens_used')
      .eq('id', demoOrg.id)
      .single();
    assert.strictEqual(orgReactivated.is_active, true, 'is_active debe ser true tras registrar pago');
    assert.strictEqual(orgReactivated.subscription_status, 'active', 'subscription_status debe ser active tras registrar pago');
    assert.strictEqual(orgReactivated.ai_tokens_used, 0, 'ai_tokens_used debe reiniciar a 0 para el nuevo mes');
    console.log('   ✅ Registro de pago manual y reactivación inmediata verificado con éxito.');
  }

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE COBRANZA MANUAL Y SUSPENSIÓN PASARON CON ÉXITO!');
}

runBillingTests().catch((err) => {
  console.error('❌ Error en pruebas de facturación:', err);
  process.exit(1);
});

