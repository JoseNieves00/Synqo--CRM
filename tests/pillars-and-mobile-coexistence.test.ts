import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { resolveOrganizationSystemPrompt } from '../lib/ai/prompt-compiler';
import {
  buildMetaTemplateBodyComponents,
  normalizeFollowUpSettings,
} from '../lib/ai/follow-up-types';
import { CreateOrderToolSchema } from '../lib/validations/tool-calls.schema';
import {
  resolveMobileCoexistenceConfig,
  unwrapEvolutionOutboundMessage,
} from '../services/human-outbound.service';
import { buildSuperAdminDigestText } from '../services/platform-alert.service';

async function runPillarsAndMobileTests() {
  console.log('\n🛡️  Iniciando Suite: Estabilidad Pilares 1 & 2 + Coexistencia Móvil...\n');

  // 1. resolveOrganizationSystemPrompt no falla cuando structured_prompt_data solo tiene assistant/gallery
  const resolvedMd = resolveOrganizationSystemPrompt({
    system_prompt: '## Empresa\nConsultorio Dental Aurora\n\n## Catálogo\n- Valoración ($80.000)',
    structured_prompt_data: {
      gallery: [{ id: '1', name: 'Valoración', url: 'https://cdn.example.com/v.jpg', price: '80000' }],
      assistant: { mode: 'new', slots: {} },
      prompt_versions: [],
    },
  });
  assert.ok(resolvedMd.includes('Consultorio Dental Aurora'), 'Debe priorizar system_prompt Markdown sin lanzar TypeError');

  const resolvedSafeEmpty = resolveOrganizationSystemPrompt({
    system_prompt: '',
    structured_prompt_data: { assistant: { mode: 'new' } },
  }, 'Fallback Seguro');
  assert.strictEqual(resolvedSafeEmpty, 'Fallback Seguro');
  console.log('   ✅ resolveOrganizationSystemPrompt inmune a structured_prompt_data parcial.');

  // 2. CreateOrderToolSchema multi-nicho (servicios digitales/sede sin dirección/ciudad obligatoria)
  const digitalOrder = CreateOrderToolSchema.parse({
    items: [{ product_name: 'Consultoría 1:1', quantity: 1 }],
    total: 250000,
    nombre: 'Carlos Pérez',
    telefono: '573001112233',
  });
  assert.strictEqual(digitalOrder.direccion, '');
  assert.strictEqual(digitalOrder.ciudad, '');
  console.log('   ✅ CreateOrderToolSchema soporta servicios sin envío físico.');

  // 3. Coexistencia móvil y unwrapping Evolution
  const protoSignal = unwrapEvolutionOutboundMessage({
    protocolMessage: { type: 'REVOKE' },
  });
  assert.strictEqual(protoSignal.isNonConversationalSignal, true);

  const reactionSignal = unwrapEvolutionOutboundMessage({
    reactionMessage: { text: '👍' },
  });
  assert.strictEqual(reactionSignal.isNonConversationalSignal, true);

  const ephemeralText = unwrapEvolutionOutboundMessage({
    ephemeralMessage: {
      message: {
        extendedTextMessage: { text: 'Claro, ya te envío la cotización' },
      },
    },
  });
  assert.strictEqual(ephemeralText.isNonConversationalSignal, false);
  assert.strictEqual(
    ephemeralText.msgObj.extendedTextMessage?.text,
    'Claro, ya te envío la cotización'
  );

  const defaultCoex = resolveMobileCoexistenceConfig({});
  assert.deepStrictEqual(defaultCoex, { enabled: true, autoResumeHours: 2 });
  const customCoex = resolveMobileCoexistenceConfig({
    mobile_coexistence: { enabled: true, autoResumeHours: 4 },
  });
  assert.deepStrictEqual(customCoex, { enabled: true, autoResumeHours: 4 });
  console.log('   ✅ Unwrap de mensajes Evolution y configuración de coexistencia Opción A verificados.');

  // 4. Invariantes críticas en archivos fuente
  const root = path.resolve(__dirname, '..');
  const openaiSrc = fs.readFileSync(path.join(root, 'services/openai.service.ts'), 'utf8');
  const inboundSrc = fs.readFileSync(path.join(root, 'services/inbound-core.service.ts'), 'utf8');
  const reactivationSrc = fs.readFileSync(path.join(root, 'services/reactivation.service.ts'), 'utf8');
  const evolutionSrc = fs.readFileSync(path.join(root, 'app/api/webhooks/whatsapp/evolution/route.ts'), 'utf8');
  const igSrc = fs.readFileSync(path.join(root, 'app/api/instagram/webhook/route.ts'), 'utf8');
  const pipelineSrc = fs.readFileSync(path.join(root, 'app/actions/pipeline.ts'), 'utf8');
  const compilerSrc = fs.readFileSync(path.join(root, 'lib/ai/prompt-compiler.ts'), 'utf8');

  assert.ok(!compilerSrc.includes('cocinita') && !compilerSrc.includes('nevera') && !compilerSrc.includes('stickers temáticos'), 'prompt-compiler debe mantenerse neutral multi-nicho en <reglas_estrictas>');
  assert.ok(openaiSrc.includes("pauseAfterSend: true") && openaiSrc.includes("handoffReason: detectedHandoffReason"), 'SILENT_HANDOFF debe retornar pauseAfterSend');
  assert.ok(openaiSrc.includes('decryptSecret(orgData.instagram_access_token)'), 'send_product_card / send_whatsapp_image deben descifrar token de Instagram');
  assert.ok(openaiSrc.includes("isNonColdDowngrade"), 'update_lead_profile debe evitar degradación silenciosa desde hot');
  assert.ok(inboundSrc.includes("last_lead_message_at"), 'Inbound debe registrar timestamp real del cliente para ventana 24h');
  assert.ok(inboundSrc.includes("hasPauseHandoff || newerLeadWhileThinking ? 'open' : 'waiting_customer'"), 'Relevos desde IA deben quedar abiertos en Por responder');
  assert.ok(reactivationSrc.includes("custom.last_lead_message_at || contact.last_interaction_at"), 'Meta 24h debe medirse desde el último mensaje del lead');
  assert.ok(evolutionSrc.includes("HumanOutboundService.recordMobileHumanOutbound"), 'Evolution fromMe debe usar HumanOutboundService');
  assert.ok(igSrc.includes("HumanOutboundService.recordMobileHumanOutbound"), 'Instagram is_echo debe sincronizarse con HumanOutboundService');
  assert.ok(pipelineSrc.includes("conversation_status: 'closed'"), 'updateLeadStage en ganado/perdido debe cerrar conversation_status');

  // 5. Variables {{1}} en plantillas Meta + normalizeFollowUpSettings + Digest SuperAdmin
  const comps = buildMetaTemplateBodyComponents({
    templateParams: ['{nombre}', '{producto}', '{empresa}'],
    contactName: 'María López',
    productName: 'Plan Mensual Pro',
    companyName: 'Clínica Aurora',
  });
  assert.strictEqual(comps.length, 1);
  assert.deepStrictEqual(comps[0].parameters, [
    { type: 'text', text: 'María' },
    { type: 'text', text: 'Plan Mensual Pro' },
    { type: 'text', text: 'Clínica Aurora' },
  ]);

  const normalizedFu = normalizeFollowUpSettings({
    enabled: true,
    sequences: {
      hot_unclosed: {
        enabled: true,
        steps: [
          {
            id: 's1',
            delayValue: 2,
            delayUnit: 'hours',
            text: 'Hola',
            metaTemplateName: 'seguimiento_promo',
            metaTemplateParams: ['{nombre}', '{producto}'],
            metaTemplateLanguage: 'es_CO',
          },
        ],
      },
    },
  });
  assert.deepStrictEqual(
    normalizedFu.sequences.hot_unclosed.steps[0].metaTemplateParams,
    ['{nombre}', '{producto}']
  );
  assert.strictEqual(normalizedFu.sequences.hot_unclosed.steps[0].metaTemplateLanguage, 'es_CO');

  const digest = buildSuperAdminDigestText({
    activeOrgs: 12,
    disconnectedOrgs: [{ name: 'Tienda Norte' }],
    openTicketsCount: 2,
    highUsageOrgs: [{ name: 'Clínica Sol', pct: 86, used: 430000, limit: 500000 }],
  });
  assert.ok(digest.includes('Tienda Norte'));
  assert.ok(digest.includes('Clínica Sol: 86%'));

  const supportSrc = fs.readFileSync(path.join(root, 'app/actions/support.ts'), 'utf8');
  const trackerSrc = fs.readFileSync(path.join(root, 'lib/monitoring/token-tracker.ts'), 'utf8');
  const managerSrc = fs.readFileSync(path.join(root, 'services/manager-whatsapp.service.ts'), 'utf8');
  const settingsFormSrc = fs.readFileSync(path.join(root, 'components/settings/SettingsForm.tsx'), 'utf8');
  assert.ok(supportSrc.includes('PlatformAlertService.notifySuperAdminEvent'), 'Tickets nuevos deben notificar al SuperAdmin');
  assert.ok(trackerSrc.includes('PlatformAlertService.notifySuperAdminEvent'), 'Umbrales >= 80% deben notificar al SuperAdmin');
  assert.ok(managerSrc.includes('#(plataforma|resumen)'), 'SuperAdmin debe poder pedir #plataforma/#resumen por WhatsApp');
  assert.ok(settingsFormSrc.includes('mobileCoexistence'), 'SettingsForm debe exponer UI de coexistencia móvil');

  console.log('   ✅ Invariantes de producción (handoff, 24h Meta, Instagram, Pipeline, Móvil, Plantillas y SuperAdmin Alerts) verificadas.\n');
}

runPillarsAndMobileTests().catch((err) => {
  console.error('❌ Error en tests/pillars-and-mobile-coexistence.test.ts:', err);
  process.exit(1);
});
