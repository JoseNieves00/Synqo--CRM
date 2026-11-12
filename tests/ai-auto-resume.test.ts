import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { shouldAutoResumeAi } from '../services/assignment.service';

const MIGRATION_PATH = path.join(
  process.cwd(),
  'supabase/migrations/20261111140000_ai_auto_resume_after_sla.sql'
);
const ASSIGNMENT_PATH = path.join(process.cwd(), 'services/assignment.service.ts');
const REMINDERS_ROUTE_PATH = path.join(process.cwd(), 'app/api/cron/appointment-reminders/route.ts');
const INBOUND_PATH = path.join(process.cwd(), 'services/inbound-core.service.ts');

function run() {
  console.log('\n🧪 Suite: Auto-recuperación de la IA tras SLA de relevo vencido\n');

  // 1. Decisión pura: la IA retoma cuando el retraso supera el umbral configurado
  assert.strictEqual(shouldAutoResumeAi({}, 30, 35), true, '35 min > umbral 30 → la IA retoma');
  assert.strictEqual(shouldAutoResumeAi({}, 30, 30), true, 'exactamente en el umbral → retoma');
  assert.strictEqual(shouldAutoResumeAi({}, 30, 29), false, '29 min < umbral 30 → aún margen para reasignación');
  console.log('   ✅ Umbral de retomo de la IA respeta ai_auto_resume_minutes');

  // 2. Desactivación por organización (0 = off)
  assert.strictEqual(shouldAutoResumeAi({}, 0, 600), false, '0 = desactivado');
  assert.strictEqual(shouldAutoResumeAi({}, -5, 600), false, 'valores negativos = desactivado');
  assert.strictEqual(shouldAutoResumeAi({}, NaN, 600), false, 'NaN = desactivado');
  console.log('   ✅ ai_auto_resume_minutes = 0 desactiva la recuperación');

  // 3. Guardas: opt-out, comprobante de pago y conversación cerrada
  assert.strictEqual(shouldAutoResumeAi({ custom_fields: { opted_out: true } }, 30, 60), false);
  assert.strictEqual(
    shouldAutoResumeAi({ custom_fields: { handoff_reason: 'payment_receipt' } }, 30, 60),
    false,
    'comprobante de pago requiere verificación humana: la IA NO retoma'
  );
  assert.strictEqual(shouldAutoResumeAi({ custom_fields: { conversation_closed: true } }, 30, 60), false);
  assert.strictEqual(shouldAutoResumeAi({ custom_fields: { handoff_reason: 'audio' } }, 30, 60), true);
  console.log('   ✅ Guardas: opt-out, comprobante de pago y cerrados NO se retoman');

  // 4. Migración: columna con default 30 y guard against negative values
  const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');
  assert.ok(migration.includes('ai_auto_resume_minutes'), 'columna ai_auto_resume_minutes');
  assert.ok(migration.includes('DEFAULT 30'), 'default 30 minutos');
  assert.ok(migration.includes('org_ai_auto_resume_check'), 'constraint >= 0');
  console.log('   ✅ Migración ai_auto_resume_after_sla completa');

  // 5. Assignment service: retomo con nota de auditoría + cola de reintentos
  const assignment = fs.readFileSync(ASSIGNMENT_PATH, 'utf8');
  assert.ok(assignment.includes('shouldAutoResumeAi'), 'helper de decisión integrado en el loop');
  assert.ok(assignment.includes('autoResumeAiAttention'), 'método de retomo de atención');
  assert.ok(
    assignment.includes("strategy: 'regenerate'") && assignment.includes('AiRetryService'),
    'la IA responde vía la cola de reintentos (ventana 24h + lock atómico)'
  );
  assert.ok(assignment.includes('ai_auto_resumed_at'), 'marca de auditoría en custom_fields');
  assert.ok(assignment.includes('Math.max(Number(org.ai_auto_resume_minutes ?? 30), slaMinutes)'), 'nunca retoma antes que el SLA de reasignación');
  assert.ok(assignment.includes('autoResumedCount'), 'contador de retomos expuesto');
  console.log('   ✅ AssignmentService retoma la IA y encola la respuesta');

  // 6. Cron de reminders: expone el contador y registra salud
  const remindersRoute = fs.readFileSync(REMINDERS_ROUTE_PATH, 'utf8');
  assert.ok(remindersRoute.includes('aiAutoResumedHandoffs'), 'respuesta del cron expone retomos');
  assert.ok(remindersRoute.includes("job_name: 'appointment-reminders'"), 'el cron registra salud en cron_job_log');
  console.log('   ✅ Cron de reminders expone aiAutoResumedHandoffs y deja rastro de salud');

  // 7. Comprobantes de pago quedan marcados para exclusión
  const inbound = fs.readFileSync(INBOUND_PATH, 'utf8');
  assert.ok(
    inbound.includes("handoff_reason: 'payment_receipt'"),
    'handoffs por comprobante marcan handoff_reason para exclusión'
  );
  console.log('   ✅ Comprobantes de pago marcados (excluidos del retomo automático)');

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE AUTO-RECUPERACIÓN DE IA PASARON EXITOSAMENTE!\n');
}

run();
