import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { isConversationClosed } from '../lib/crm/constants';
import { shouldAutoResumeAi } from '../services/assignment.service';

const CONSTANTS_PATH = path.join(process.cwd(), 'lib/crm/constants.ts');
const ASSIGNMENT_PATH = path.join(process.cwd(), 'services/assignment.service.ts');
const HANDOFF_PATH = path.join(process.cwd(), 'services/handoff.service.ts');
const RETRY_PATH = path.join(process.cwd(), 'services/ai-retry.service.ts');
const REMINDER_PATH = path.join(process.cwd(), 'services/reminder.service.ts');

function run() {
  console.log('\n🧪 Suite: Anti-falsos-positivos — notificaciones a clientes cerrados\n');

  // 1. Fuente única de cierre: cubre TODAS las formas en que se cierra un chat
  assert.strictEqual(isConversationClosed(null), true, 'contacto inexistente → cerrado (no notificar)');
  assert.strictEqual(isConversationClosed({}), false, 'contacto abierto → no cerrado');
  assert.strictEqual(isConversationClosed({ conversation_status: 'closed' }), true, 'columna conversation_status');
  assert.strictEqual(
    isConversationClosed({ custom_fields: { conversation_status: 'closed' } }),
    true,
    'custom_fields.conversation_status (legado)'
  );
  assert.strictEqual(isConversationClosed({ closed_at: new Date().toISOString() }), true, 'closed_at presente');
  assert.strictEqual(isConversationClosed({ pipeline_stage: 'ganado' }), true, 'pipeline ganado');
  assert.strictEqual(isConversationClosed({ pipeline_stage: 'perdido' }), true, 'pipeline perdido');
  assert.strictEqual(
    isConversationClosed({ custom_fields: { conversation_closed: true } }),
    true,
    'flag legacy conversation_closed'
  );
  assert.strictEqual(
    isConversationClosed({ conversation_status: 'open', pipeline_stage: 'calificado' }),
    false,
    'conversación abierta en stage calificado → no cerrada'
  );
  console.log('   ✅ isConversationClosed cubre las 6 formas de cierre sin falsos negativos');

  // 2. La IA NUNCA retoma conversaciones cerradas (por cualquiera de sus formas)
  const closedVariants = [
    { conversation_status: 'closed' },
    { custom_fields: { conversation_status: 'closed' } },
    { closed_at: new Date().toISOString() },
    { pipeline_stage: 'ganado' },
    { pipeline_stage: 'perdido' },
    { custom_fields: { conversation_closed: true } },
  ];
  for (const variant of closedVariants) {
    assert.strictEqual(
      shouldAutoResumeAi(variant, 30, 120),
      false,
      `IA no retoma: ${JSON.stringify(variant)}`
    );
  }
  assert.strictEqual(
    shouldAutoResumeAi({ conversation_status: 'open', custom_fields: {} }, 30, 60),
    true,
    'conversación abierta y fresca → la IA sí puede retomar'
  );
  console.log('   ✅ shouldAutoResumeAi respeta todas las formas de cierre');

  // 3. El loop de reasignación por SLA excluye cerrados en query y en JS
  const assignment = fs.readFileSync(ASSIGNMENT_PATH, 'utf8');
  assert.ok(assignment.includes(".neq('conversation_status', 'closed')"), 'query excluye conversation_status closed');
  assert.ok(assignment.includes('isConversationClosed(contact)'), 'guard JS contra cierre legado en custom_fields');
  assert.ok(assignment.includes('isConversationClosed'), 'importa la fuente única');
  console.log('   ✅ reassignStaleHandoffs no toca clientes cerrados');

  // 4. La alerta de WhatsApp al asesor se omite para cerrados
  const handoff = fs.readFileSync(HANDOFF_PATH, 'utf8');
  assert.ok(handoff.includes('isConversationClosed(contact)'), 'notifyHandoff consulta la fuente única');
  assert.ok(handoff.includes('alertSent: false'), 'devuelve alertSent:false sin enviar');
  console.log('   ✅ HandoffService no envía "Nuevo Lead Asignado" a clientes cerrados');

  // 5. Los reintentos de IA no responden ni escalan a cerrados
  const retry = fs.readFileSync(RETRY_PATH, 'utf8');
  assert.ok(retry.includes('isConversationClosed'), 'ai-retry usa la fuente única');
  assert.ok(retry.includes("skipped: 'conversation closed'"), 'resend/regenerate omiten con rastro auditado');
  assert.ok(retry.includes("'skipped: conversation closed'"), 'cola marcada como done sin escalar');
  assert.ok(retry.includes('if (!closed) await this.escalateToAdvisor'), 'la escalada al asesor se omite para cerrados');
  console.log('   ✅ AiRetryService no responde ni escala clientes cerrados');

  // 6. Los recordatorios de cita no se envían a cerrados
  const reminder = fs.readFileSync(REMINDER_PATH, 'utf8');
  assert.ok(reminder.includes('isConversationClosed(appt.contact)'), 'recordatorios y auto-cancelación consultan cierre');
  assert.ok(reminder.includes('conversation_status, closed_at, pipeline_stage'), 'la query trae el estado de cierre');
  console.log('   ✅ ReminderService no recuerda ni auto-cancela citas de clientes cerrados');

  // 7. La fuente única está definida en lib/crm/constants.ts
  const constants = fs.readFileSync(CONSTANTS_PATH, 'utf8');
  assert.ok(constants.includes('export function isConversationClosed'), 'helper exportado como fuente única');
  console.log('   ✅ Fuente única de cierre en lib/crm/constants.ts');

  console.log('\n🎉 ¡TODAS LAS PRUEBAS ANTI-FALSOS-POSITIVOS PASARON!\n');
}

run();
