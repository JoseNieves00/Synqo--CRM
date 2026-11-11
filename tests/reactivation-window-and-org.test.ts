import assert from 'node:assert';
import fs from 'node:fs';
import { isLeadWindowOpen, getLeadWindowAnchor } from '../services/contact.service';

function run() {
  console.log('\n🧪 Suite: Ventana 24h real, aislamiento de recordatorios y crons\n');

  const now = Date.now();
  const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3600 * 1000).toISOString();

  // 1. La ventana ignora mensajes salientes (last_interaction_at reciente no la abre)
  const contactOutboundOnly: any = { last_interaction_at: iso(1), last_lead_message_at: iso(30), custom_fields: {} };
  assert.strictEqual(isLeadWindowOpen(contactOutboundOnly), false, 'Mensaje saliente reciente no debe abrir la ventana');
  assert.strictEqual(isLeadWindowOpen({ last_lead_message_at: iso(2) }), true);
  assert.strictEqual(isLeadWindowOpen({ custom_fields: { last_lead_message_at: iso(5) } }), true, 'fallback custom_fields');
  assert.strictEqual(isLeadWindowOpen({ custom_fields: {} }), false, 'sin mensaje del cliente → cerrada');
  assert.strictEqual(getLeadWindowAnchor(null), null);
  console.log('   ✅ isLeadWindowOpen usa solo mensajes del cliente');

  // 2. Ningún servicio de envío usa last_interaction_at para la ventana
  for (const file of ['services/reactivation.service.ts', 'services/reminder.service.ts', 'app/actions/chat.ts', 'components/chat/ChatWindow.tsx']) {
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(!/isWithin24HourWindow\([^)]*last_interaction_at/.test(src), `${file} no debe anclar la ventana en last_interaction_at`);
  }
  console.log('   ✅ call-sites migrados');

  // 3. Recordatorios vencidos filtrados por organización
  const reactivationSrc = fs.readFileSync('services/reactivation.service.ts', 'utf8');
  const dueBlock = reactivationSrc.slice(reactivationSrc.indexOf("from('scheduled_reminders')"), reactivationSrc.indexOf('.limit(250)'));
  assert.ok(dueBlock.includes(".eq('organization_id', org.id)"), 'La consulta de recordatorios vencidos debe filtrar por organización');
  console.log('   ✅ recordatorios aislados por organización');

  // 4. Migraciones: crons programados y columnas nuevas
  const cronSql = fs.readFileSync('supabase/migrations/20261111100000_schedule_core_crons.sql', 'utf8');
  assert.ok(cronSql.includes("'synqo-lead-reactivation'") && cronSql.includes('/api/cron/lead-reactivation'));
  assert.ok(cronSql.includes('vault.decrypted_secrets'), 'Los secretos deben leerse de Vault');
  assert.ok(!/Bearer [A-Za-z0-9]{12,}/.test(cronSql), 'No debe haber secretos en el SQL');
  const dataSql = fs.readFileSync('supabase/migrations/20261111100100_lead_window_reminder_org_and_lead_score.sql', 'utf8');
  for (const token of ['last_lead_message_at', 'scheduled_reminders', 'lead_score', 'lead_temperature', 'trg_set_scheduled_reminder_org']) {
    assert.ok(dataSql.includes(token), `migración debe incluir ${token}`);
  }
  console.log('   ✅ migraciones presentes');

  // 5. Realtime de mensajes filtrado por organización
  const syncSrc = fs.readFileSync('lib/inbox/sync-engine.ts', 'utf8');
  assert.ok(syncSrc.includes('filter: `organization_id=eq.${organizationId}`'));
  assert.ok(!syncSrc.includes('!msg.organization_id ||'), 'No aceptar mensajes sin organization_id');
  console.log('   ✅ realtime multi-tenant seguro');

  console.log('\n🎉 reactivation-window-and-org: todas las pruebas pasaron\n');
}

run();
