import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { evaluatePromptReadiness, buildBehaviorContract, buildMissingBehaviorProposals } from '../lib/ai/prompt-assistant/readiness';
import { composePlaybookAndBusinessPrompt } from '../lib/ai/sales-playbook';

const OPENAI_PATH = path.join(process.cwd(), 'services/openai.service.ts');
const HEALTH_PATH = path.join(process.cwd(), 'lib/ai/prompt-assistant/health.ts');
const PLAYBOOK_PATH = path.join(process.cwd(), 'lib/ai/sales-playbook.ts');
const PANEL_PATH = path.join(process.cwd(), 'components/settings/prompt-assistant/PromptAssistantPanel.tsx');

const FULL_PROMPT = `Somos Cocinas del Valle: cocinas modulares a medida para hogares.
=== PAGOS ===
Aceptamos transferencia Bancolombia y pago contraentrega.
=== HORARIO ===
Atendemos de 8:00 a 19:00 de lunes a sábado.
=== RELEVO ===
Pasa el chat a un asesor ante reclamos o comprobantes de pago.
=== CATÁLOGO VISUAL DE PRODUCTOS ===
[FOTO: https://x.com/cocina1.jpg | Cocina Modular L | $360.000]
[FOTO: https://x.com/cocina2.jpg | Isla Central | $550.000]`;

const FULL_GALLERY = [
  { name: 'Cocina Modular L', price: '$360.000' },
  { name: 'Isla Central', price: '$550.000' },
];

function run() {
  console.log('\n🧪 Suite: Readiness del prompt + Contrato de comportamiento del bot\n');

  // 1. Readiness: empty / weak / ready
  const empty = evaluatePromptReadiness('');
  assert.strictEqual(empty.level, 'empty', 'prompt vacío → empty');
  assert.strictEqual(empty.defensiveBlock, null, 'empty no inyecta bloque');

  const weak = evaluatePromptReadiness('Vendemos cocinas modulares bonitas para tu hogar.');
  assert.strictEqual(weak.level, 'weak', 'sin precios/pagos/relevo → weak');
  assert.ok(weak.missingCritical.length >= 2, `missingCritical detecta lo crítico (${weak.missingCritical.join(', ')})`);
  assert.ok(weak.defensiveBlock && weak.defensiveBlock.includes('NUNCA inventes precios'), 'bloque defensivo prohíbe inventar precios');
  assert.ok(weak.defensiveBlock && weak.defensiveBlock.includes('relevo'), 'bloque defensivo exige ofrecer relevo');

  const ready = evaluatePromptReadiness(FULL_PROMPT);
  assert.strictEqual(ready.level, 'ready', 'prompt completo → ready');
  assert.strictEqual(ready.defensiveBlock, null, 'ready no inyecta bloque');
  console.log('   ✅ evaluatePromptReadiness clasifica empty / weak / ready con bloque defensivo');

  // 2. Contrato de comportamiento (0 tokens, determinístico)
  const fullContract = buildBehaviorContract(FULL_PROMPT, FULL_GALLERY);
  const fullMissing = fullContract.items.filter((i) => !i.detected);
  assert.ok(fullContract.items.length >= 11, `contrato con ≥11 conductas (${fullContract.items.length})`);
  for (const critical of ['catalogo', 'pagos', 'horarios', 'relevo']) {
    assert.ok(fullContract.items.find((i) => i.id === critical)?.detected, `conducta crítica detectada: ${critical}`);
  }
  assert.ok(fullMissing.length <= 8, `faltantes razonables para prompt real (${fullMissing.map((i) => i.id).join(', ')})`);
  const catalogo = fullContract.items.find((i) => i.id === 'catalogo');
  assert.ok(catalogo?.detected, 'catálogo detectado por precios en el texto');
  assert.ok(catalogo?.evidence && catalogo.evidence.includes('Cocina Modular L'), 'evidencia con línea real del prompt');

  const sparseContract = buildBehaviorContract('Vendemos cocinas modulares bonitas.', []);
  const sparseMissing = sparseContract.items.filter((i) => !i.detected);
  assert.ok(sparseMissing.length >= 8, `prompt pobre expone lo faltante (${sparseMissing.length})`);
  console.log('   ✅ buildBehaviorContract traduce el prompt a conductas concretas con evidencia');

  // 3. Propuestas ejecutables de lo faltante (compatibles con applySectionProposalAction)
  const proposals = buildMissingBehaviorProposals('Vendemos cocinas modulares bonitas.', []);
  assert.ok(proposals.length >= 8, `una propuesta por faltante (${proposals.length})`);
  const validSectionIds = new Set(['empresa', 'catalogo', 'pagos', 'envios', 'politicas', 'faq', 'tono', 'cierre', 'relevo', 'seguimiento', 'adicional']);
  for (const p of proposals) {
    assert.ok(validSectionIds.has(p.sectionId), `sectionId válido para el patcher (${p.sectionId})`);
    assert.ok(p.proposedText.length > 40, 'texto propuesto ejecutable');
    assert.ok(!/es recomendable|deberías|te sugiero/i.test(p.proposedText), 'sin comentarios meta (directrices ejecutables)');
    if (['catalogo', 'pagos', 'envios', 'politicas', 'seguimiento'].includes(p.sectionId)) {
      assert.match(p.proposedText, /\[[^\]]+\]/, 'placeholders rellenables donde el negocio debe aportar datos');
    }
  }
  const withPlaceholders = proposals.filter((p) => /\[[^\]]+\]/.test(p.proposedText));
  assert.ok(withPlaceholders.length >= 5, `mayoría de propuestas con placeholders (${withPlaceholders.length})`);
  assert.ok(proposals.some((p) => p.sectionId === 'catalogo'), 'incluye catálogo con precios');
  console.log('   ✅ buildMissingBehaviorProposals genera propuestas con 1 clic por sección válida');

  // 4. Blindaje en runtime: composePlaybookAndBusinessPrompt inyecta el bloque en weak
  const composedWeak = composePlaybookAndBusinessPrompt({
    businessPrompt: 'Vendemos cocinas modulares bonitas para tu hogar.',
    hasCalendar: false,
  });
  assert.ok(composedWeak.includes('modo_seguro_onboarding'), 'prompt débil → bloque defensivo inyectado');
  assert.ok(composedWeak.includes('instrucciones_del_negocio'), 'respetando jerarquía de prompt');

  const composedReady = composePlaybookAndBusinessPrompt({ businessPrompt: FULL_PROMPT, hasCalendar: true });
  assert.ok(!composedReady.includes('modo_seguro_onboarding'), 'prompt listo → sin bloque defensivo (prompt caching intacto)');
  console.log('   ✅ composePlaybookAndBusinessPrompt blinda prompts débiles sin tocar los listos');

  // 5. Compuerta en el worker: prompt vacío no llama al LLM
  const openaiSrc = fs.readFileSync(OPENAI_PATH, 'utf8');
  assert.ok(openaiSrc.includes('evaluatePromptReadiness(gatePromptSource)'), 'compuerta de readiness en processLeadMessage');
  assert.ok(openaiSrc.includes('notifyPromptGateOnce'), 'nota de sistema única para el asesor');
  assert.ok(openaiSrc.includes('prompt_gate_notified'), 'dedupe de la nota de compuerta');
  console.log('   ✅ Compuerta runtime: prompt vacío no improvisa con el playbook genérico');

  // 6. Fuente única de señales compartida health ↔ readiness
  const healthSrc = fs.readFileSync(HEALTH_PATH, 'utf8');
  assert.ok(healthSrc.includes("SECTION_SIGNALS[slotId]"), 'health.ts usa la fuente única de regex');
  const playbookSrc = fs.readFileSync(PLAYBOOK_PATH, 'utf8');
  assert.ok(playbookSrc.includes('evaluatePromptReadiness'), 'playbook compone con readiness');
  console.log('   ✅ SECTION_SIGNALS: una sola fuente de señales (health + contrato)');

  // 7. UI del panel: tarjeta del contrato con aceptación de 1 clic
  const panelSrc = fs.readFileSync(PANEL_PATH, 'utf8');
  assert.ok(panelSrc.includes('BehaviorContractCard'), 'tarjeta ¿Qué hará tu bot realmente? en el panel');
  assert.ok(panelSrc.includes('handleAcceptBehaviorProposal'), 'aplicación de propuestas del contrato');
  assert.ok(fs.existsSync(path.join(process.cwd(), 'components/settings/prompt-assistant/BehaviorContractCard.tsx')), 'componente existe');
  console.log('   ✅ Panel: contrato visible con propuestas aplicables en 1 clic');

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE READINESS Y CONTRATO DE COMPORTAMIENTO PASARON!\n');
}

run();
