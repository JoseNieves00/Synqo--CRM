import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import {
  normalizeCustomerFilters,
  applyCustomerFilters,
  applyCustomerSort,
  describeCustomerFilters,
} from '../lib/crm/customer-filters';
import { normalizeTagName, TAG_COLORS, TagService } from '../services/tag.service';
import { ORDER_STATUSES, OrderService } from '../services/order.service';
import { MAX_CAMPAIGN_RECIPIENTS, CampaignService } from '../services/campaign.service';
import * as crmActions from '../app/actions/crm';

function makeQueryRecorder() {
  const ops: Array<{ method: string; args: any[] }> = [];
  const builder: any = new Proxy(
    {},
    {
      get(_target, prop: string) {
        return (...args: any[]) => {
          ops.push({ method: prop, args });
          return builder;
        };
      },
    }
  );
  return { builder, ops };
}

async function runTests() {
  console.log('\n🧪 Suite E2E: Módulos CRM (Base de Clientes, Etiquetas, Ficha 360, Pedidos y Campañas IA)\n');

  // 1. Normalización de filtros & prevención de inyección PostgREST
  console.log('1️⃣  Verificando normalizeCustomerFilters & describeCustomerFilters...');
  const dirty = normalizeCustomerFilters({
    search: '  Juan, (admin)%   ',
    stage: 'calificado',
    temperature: 'hot',
    scoreMin: 150,
    scoreMax: -10,
    inactiveDays: 0,
    channel: 'instagram',
    buyers: 'buyers',
  });
  assert.strictEqual(dirty.search, 'Juan admin');
  assert.strictEqual(dirty.scoreMin, 100);
  assert.strictEqual(dirty.scoreMax, 0);
  assert.strictEqual(dirty.inactiveDays, 1);
  assert.strictEqual(dirty.temperature, 'hot');
  assert.strictEqual(dirty.channel, 'instagram');
  assert.strictEqual(dirty.buyers, 'buyers');

  const invalidTemp = normalizeCustomerFilters({ temperature: 'invalid_temp', inactiveDays: 14 });
  assert.strictEqual(invalidTemp.temperature, 'all');
  assert.strictEqual(invalidTemp.inactiveDays, 14);
  assert.strictEqual(invalidTemp.tagId, null);

  const sampleUuid = '11111111-1111-4111-8111-111111111111';
  const summary = describeCustomerFilters(
    normalizeCustomerFilters({ stage: 'calificado', temperature: 'hot', scoreMin: 70, tagId: sampleUuid }),
    'vip'
  );
  assert.ok(summary.includes('Calificado') || summary.toLowerCase().includes('calificado'));
  assert.ok(summary.includes('Score ≥ 70') || summary.includes('Score >= 70') || summary.includes('70'));
  assert.ok(summary.includes('vip'));
  assert.strictEqual(describeCustomerFilters(normalizeCustomerFilters({})), 'Todos los clientes');
  console.log('   ✅ Filtros normalizados y descritos correctamente');

  // 2. Query builder filters & sorting
  console.log('2️⃣  Verificando applyCustomerFilters & applyCustomerSort...');
  const { builder, ops } = makeQueryRecorder();
  const fixedNow = new Date('2026-11-11T12:00:00Z').getTime();
  applyCustomerFilters(
    builder,
    {
      search: 'Maria',
      stage: 'nuevo',
      temperature: 'unclassified',
      scoreMin: 50,
      scoreMax: 95,
      tagId: 'tag-123',
      assignedTo: 'unassigned',
      channel: 'whatsapp',
      inactiveDays: 7,
      buyers: 'non_buyers',
    },
    fixedNow
  );
  applyCustomerSort(builder, 'score');

  assert.ok(ops.some((o) => o.method === 'or' && String(o.args[0]).includes('Maria')));
  assert.ok(ops.some((o) => o.method === 'eq' && o.args[0] === 'pipeline_stage' && o.args[1] === 'nuevo'));
  assert.ok(ops.some((o) => o.method === 'is' && o.args[0] === 'lead_temperature' && o.args[1] === null));
  assert.ok(ops.some((o) => o.method === 'gte' && o.args[0] === 'lead_score' && o.args[1] === 50));
  assert.ok(ops.some((o) => o.method === 'lte' && o.args[0] === 'lead_score' && o.args[1] === 95));
  assert.ok(ops.some((o) => o.method === 'eq' && o.args[0] === 'contact_tags.tag_id' && o.args[1] === 'tag-123'));
  assert.ok(ops.some((o) => o.method === 'is' && o.args[0] === 'assigned_to' && o.args[1] === null));
  assert.ok(ops.some((o) => o.method === 'neq' && o.args[0] === 'channel' && o.args[1] === 'instagram'));
  assert.ok(ops.some((o) => o.method === 'or' && String(o.args[0]).includes('last_lead_message_at.lt.')));
  assert.ok(ops.some((o) => o.method === 'order' && o.args[0] === 'lead_score'));
  console.log('   ✅ Constructor de consultas multi-filtro y ordenamiento correcto');

  // 3. TagService, OrderService, CampaignService contratos
  console.log('3️⃣  Verificando TagService, OrderService y CampaignService...');
  assert.strictEqual(normalizeTagName('  VIP   Contraentrega!! '), 'VIP Contraentrega!!');
  assert.ok(TAG_COLORS.includes('blue') && TAG_COLORS.includes('emerald'));
  assert.strictEqual(typeof TagService.ensureTags, 'function');
  assert.strictEqual(typeof TagService.applyAiTags, 'function');

  assert.deepStrictEqual(ORDER_STATUSES, ['pending', 'confirmed', 'paid', 'delivered', 'cancelled']);
  assert.strictEqual(typeof OrderService.recordOrder, 'function');

  assert.strictEqual(MAX_CAMPAIGN_RECIPIENTS, 500);
  assert.strictEqual(typeof CampaignService.createCampaign, 'function');
  assert.strictEqual(typeof CampaignService.processRunningCampaigns, 'function');
  assert.strictEqual(typeof CampaignService.markReplied, 'function');
  console.log('   ✅ Servicios y constantes verificados');

  // 4. Exports de Server Actions CRM
  console.log('4️⃣  Verificando exports de app/actions/crm.ts...');
  const expectedActions = [
    'listTagsAndSegmentsAction',
    'listCustomersAction',
    'exportCustomersCsvAction',
    'createTagAction',
    'deleteTagAction',
    'assignTagsToContactsAction',
    'removeTagFromContactAction',
    'saveSegmentAction',
    'deleteSegmentAction',
    'getCustomer360Action',
    'createManualOrderAction',
    'updateOrderStatusAction',
    'addContactNoteAction',
    'deleteContactNoteAction',
    'previewCampaignAudienceAction',
    'createCampaignAction',
    'listCampaignsAction',
    'updateCampaignStatusAction',
    'runCampaignTickNowAction',
  ];
  for (const fn of expectedActions) {
    assert.strictEqual(typeof (crmActions as any)[fn], 'function', `Falta Server Action: ${fn}`);
  }
  console.log('   ✅ 19 Server Actions CRM exportadas');

  // 5. Cableado de archivos UI, Dashboard, Inbox, Nav y Migración SQL
  console.log('5️⃣  Verificando cableado de UI, Dashboard Top 10, Inbox Ficha 360, Nav y Migración...');
  const mustExist = [
    'supabase/migrations/20261111120000_crm_tags_orders_notes_campaigns.sql',
    'components/crm/crm-ui-helpers.ts',
    'components/crm/Customer360Drawer.tsx',
    'components/crm/CustomersDirectoryClient.tsx',
    'components/crm/CampaignsClient.tsx',
    'components/dashboard/TopPropensityWidget.tsx',
    'app/(dashboard)/clientes/page.tsx',
    'app/(dashboard)/campanas/page.tsx',
  ];
  for (const rel of mustExist) {
    assert.ok(fs.existsSync(path.join(process.cwd(), rel)), `Archivo faltante: ${rel}`);
  }

  const dashActionSrc = fs.readFileSync(path.join(process.cwd(), 'app/actions/dashboard.ts'), 'utf8');
  assert.ok(dashActionSrc.includes('topPropensityLeads'), 'Dashboard debe calcular topPropensityLeads');

  const dashPageSrc = fs.readFileSync(path.join(process.cwd(), 'app/(dashboard)/dashboard/page.tsx'), 'utf8');
  assert.ok(dashPageSrc.includes('TopPropensityWidget'), 'Dashboard page debe renderizar TopPropensityWidget');

  const contactPanelSrc = fs.readFileSync(path.join(process.cwd(), 'components/chat/ContactPanel.tsx'), 'utf8');
  assert.ok(contactPanelSrc.includes('Customer360Drawer'), 'ContactPanel debe integrar Customer360Drawer');

  const sidebarSrc = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/SidebarNav.tsx'), 'utf8');
  assert.ok(sidebarSrc.includes('/clientes') && sidebarSrc.includes('/campanas'), 'SidebarNav debe enlazar /clientes y /campanas');

  const mobileNavSrc = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/MobileBottomNav.tsx'), 'utf8');
  assert.ok(mobileNavSrc.includes('/clientes'), 'MobileBottomNav debe enlazar /clientes');

  const crmActionSrc = fs.readFileSync(path.join(process.cwd(), 'app/actions/crm.ts'), 'utf8');
  assert.ok(crmActionSrc.includes('sanitizeCsvField'), 'exportCustomersCsvAction debe sanitizar celdas CSV');

  const sqlSrc = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20261111120000_crm_tags_orders_notes_campaigns.sql'),
    'utf8'
  );
  for (const tbl of ['tags', 'contact_tags', 'saved_segments', 'orders', 'contact_notes', 'campaigns', 'campaign_recipients']) {
    assert.ok(sqlSrc.includes(`CREATE TABLE IF NOT EXISTS ${tbl}`), `Falta tabla SQL: ${tbl}`);
  }
  console.log('   ✅ Todos los archivos y enlaces verificados');

  console.log('\n🎉 Suite E2E de módulos CRM completada con éxito.\n');
}

runTests().catch((err) => {
  console.error('❌ Error en suite CRM:', err);
  process.exit(1);
});
