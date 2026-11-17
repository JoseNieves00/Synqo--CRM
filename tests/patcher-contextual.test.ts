/**
 * F1 — Patcher anti-contradicción:
 * - Las mejoras se insertan JUNTO al contenido relacionado (prosa con precios, pagos en prosa),
 *   no al final del prompt.
 * - Sinónimos informales reales de clientes ("MEDIOS DE PAGO:", "¿CÓMO PAGAMOS?") se detectan
 *   como sección existente y se actualizan in-place.
 * - detectSectionOverlap() expone dónde está el contenido para avisar al cliente.
 *
 * F4 — Candados de entrega de seguimientos (lib/leads/followup-gates.ts):
 * - opt-out / conversación cerrada / negocio cerrado → cancelar.
 * - Cliente esperando respuesta humana → retener.
 * - Asesor respondió manualmente (is_ai_active=false) PERO el cliente no espera nada → ENVIAR.
 * - bypassMinScore: los pasos de secuencia configurados no se filtran por lead_score.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

test('F1: patcher contextual — mejora de pagos va junto al contenido existente, no al final', async () => {
  const { patchSectionInPrompt, detectSectionOverlap } = await import('../lib/ai/prompt-assistant/versions');

  const prosePrompt = `## Empresa
Somos Cocinas del Valle, cocinas modulares a medida desde $360.000.

## Envíos
Entregamos en Cali y Popayán, envío gratis en la ciudad.`;

  const overlap = detectSectionOverlap(prosePrompt, 'pagos');
  assert.strictEqual(overlap.hasHeadingSection, false, 'No debe haber encabezado de pagos');
  assert.strictEqual(overlap.topicMentioned, false, 'La prosa no menciona pagos todavía (correcto)');

  // El tema precios sí existe en prosa → propuesta de catálogo se inserta contextualmente
  const overlapPrecios = detectSectionOverlap(prosePrompt, 'catalogo');
  assert.strictEqual(overlapPrecios.topicMentioned, true, 'Debe detectar precios en prosa');
  assert.ok(overlapPrecios.mentionExcerpt && overlapPrecios.mentionExcerpt.includes('360.000'), 'El excerpt debe apuntar al precio');

  const patched = patchSectionInPrompt(
    prosePrompt,
    'Catálogo',
    '- Cocina Modular L — $360.000\n- Cocina Modular XL — $520.000',
    'catalogo'
  );

  const idxEmpresa = patched.indexOf('## Empresa');
  const idxEnvios = patched.indexOf('## Envíos');
  const idxCatalogo = patched.indexOf('## Catálogo');
  assert.ok(idxCatalogo > 0, 'Debe existir la nueva sección Catálogo');
  // Debe quedar ENTRE Empresa y Envíos (junto a los precios de Empresa), no después de Envíos
  assert.ok(
    idxCatalogo > idxEmpresa && idxCatalogo < idxEnvios,
    'La sección nueva debe insertarse junto a su contenido relacionado, no al final'
  );
});

test('F1: patcher contextual — sin señales de tema la sección nueva va al final (comportamiento previo)', async () => {
  const { patchSectionInPrompt } = await import('../lib/ai/prompt-assistant/versions');

  const prompt = `## Empresa
Somos Cocinas del Valle.`;

  const patched = patchSectionInPrompt(prompt, 'Seguimiento', '- Recordar revisión visual.', 'seguimiento');
  assert.ok(patched.endsWith('- Recordar revisión visual.'), 'Sin señales del tema debe ir al final');
});

test('F1: sinónimos informales — "MEDIOS DE PAGO:" se actualiza in-place', async () => {
  const { patchSectionInPrompt, detectSectionOverlap, extractExistingSectionContent } = await import(
    '../lib/ai/prompt-assistant/versions'
  );

  const clientPrompt = `EMPRESA:
Vendemos fitolocos.

MEDIOS DE PAGO:
- Efectivo
- Transferencia

ENVIOS:
- Solo Bucaramanga`;

  const overlap = detectSectionOverlap(clientPrompt, 'pagos', 'Pagos');
  assert.strictEqual(overlap.hasHeadingSection, true, 'Debe reconocer MEDIOS DE PAGO como sección de pagos');
  assert.ok(
    overlap.headingTitle && overlap.headingTitle.toUpperCase().includes('PAGO'),
    'headingTitle debe reflejar el título original del cliente'
  );

  const extract = extractExistingSectionContent(clientPrompt, 'Pagos', 'pagos');
  assert.strictEqual(extract.found, true, 'extractExistingSectionContent debe encontrar la sección por sinónimo');

  const patched = patchSectionInPrompt(clientPrompt, 'Pagos', '- Efectivo\n- Transferencia\n- Nequi 3001112233', 'pagos');
  assert.ok(patched.includes('Nequi 3001112233'), 'Debe aplicar el contenido nuevo');
  assert.strictEqual(
    patched.indexOf('Nequi 3001112233') < patched.indexOf('ENVIOS:'),
    true,
    'La actualización debe quedar in-place (antes de ENVIOS), no al final'
  );
  // Solo un bloque de MEDIOS DE PAGO
  assert.strictEqual((patched.match(/MEDIOS DE PAGO/g) || []).length, 1, 'No debe duplicar la sección');
});

test('F1: patcher respeta la cola de galería al insertar contextualmente', async () => {
  const { patchSectionInPrompt } = await import('../lib/ai/prompt-assistant/versions');

  const withTail = `## Empresa
Vendemos cocinas desde $360.000.

=== CATÁLOGO VISUAL DE PRODUCTOS (DISPATCH INTERNO) ===
- Cocina Modular L: [foto: https://example.com/f1.jpg]`;

  const patched = patchSectionInPrompt(withTail, 'Catálogo', '- Cocina Modular XL — $520.000', 'catalogo');
  assert.ok(patched.includes('=== CATÁLOGO VISUAL DE PRODUCTOS (DISPATCH INTERNO) ==='), 'La cola de galería no se destruye');
  assert.ok(patched.trimEnd().endsWith('- Cocina Modular L: [foto: https://example.com/f1.jpg]'), 'La cola queda al final');
  assert.ok(patched.includes('## Catálogo'), 'La sección se inserta');
});

test('F4: resolveFollowUpHoldReason — cancelar/retener/enviar según el estado del chat', async () => {
  const { resolveFollowUpHoldReason } = await import('../lib/leads/followup-gates');

  assert.strictEqual(
    resolveFollowUpHoldReason({ custom_fields: { opted_out: true } }),
    'opted_out',
    'Opt-out debe cancelar'
  );
  assert.strictEqual(
    resolveFollowUpHoldReason({ conversation_status: 'closed', custom_fields: {} }),
    'conversation_closed',
    'Conversación cerrada debe cancelar'
  );
  assert.strictEqual(
    resolveFollowUpHoldReason({ custom_fields: { conversation_status: 'closed' } }),
    'conversation_closed',
    'Cierre dentro de custom_fields también cuenta'
  );
  assert.strictEqual(
    resolveFollowUpHoldReason({ pipeline_stage: 'ganado', custom_fields: {} }),
    'deal_closed',
    'Negocio ganado debe cancelar el seguimiento de venta'
  );
  assert.strictEqual(
    resolveFollowUpHoldReason({ pipeline_stage: 'perdido', custom_fields: {} }),
    'deal_closed',
    'Negocio perdido debe cancelar'
  );
  assert.strictEqual(
    resolveFollowUpHoldReason({ is_ai_active: false, unread_count: 2, waiting_since: '2026-01-01', custom_fields: {} }),
    'waiting_for_advisor',
    'Cliente esperando respuesta debe retener el seguimiento'
  );
  assert.strictEqual(
    resolveFollowUpHoldReason({ is_ai_active: false, custom_fields: { unattended_handoff: true } }),
    'waiting_for_advisor',
    'Relevo humano activo debe retener'
  );
  // EL CASO CLAVE: asesor respondió manualmente → is_ai_active=false, pero el cliente no espera nada
  assert.strictEqual(
    resolveFollowUpHoldReason({ is_ai_active: false, unread_count: 0, custom_fields: {} }),
    null,
    'IA apagada tras respuesta manual PERO cliente atendido → el seguimiento agendado DEBE enviarse'
  );
  assert.strictEqual(
    resolveFollowUpHoldReason({ is_ai_active: true, custom_fields: {} }),
    null,
    'Estado normal → enviar'
  );
});

test('F4: bypassMinScore — pasos de secuencia configurados nunca se filtran por lead_score', async () => {
  const { prioritizeReactivationQueue } = await import('../lib/leads/reactivation-priority');

  const lowScoreWithStep = {
    contact: { lead_score: 5 },
    category: 'hot_unclosed' as const,
    stepIndex: 0,
    step: { id: 's1', delayValue: 1, delayUnit: 'hours' as const, text: 'Hola!' },
  };
  const lowScoreAutonomous = {
    contact: { lead_score: 5 },
    category: 'warm' as const,
    stepIndex: 0,
  };
  const highScore = {
    contact: { lead_score: 80 },
    category: 'qualified_doubt' as const,
    stepIndex: 0,
    step: { id: 's2', delayValue: 2, delayUnit: 'days' as const, text: 'Retomo' },
  };

  // Sin bypass (firma anterior intacta): el score bajo se filtra
  const withoutBypass = prioritizeReactivationQueue([lowScoreWithStep, lowScoreAutonomous, highScore] as any, {
    prioritizeByScore: true,
    minLeadScore: 25,
  });
  assert.ok(
    !withoutBypass.some((i) => i.contact.lead_score === 5),
    'Sin bypass el score bajo se filtra (compatibilidad con tests previos)'
  );

  // Con bypass: el paso configurado (item.step) pasa aunque tenga score 5
  const withBypass = prioritizeReactivationQueue([lowScoreWithStep, lowScoreAutonomous, highScore] as any, {
    prioritizeByScore: true,
    minLeadScore: 25,
    bypassMinScore: (item: any) => Boolean(item.step),
  });
  const passed = withBypass.filter((i) => i.contact.lead_score === 5);
  assert.strictEqual(passed.length, 1, 'Solo el paso configurado pasa el filtro');
  assert.ok(passed[0] && 'step' in passed[0], 'El ítem que pasa es el que tiene step configurado');
  // Orden por score: el alto sigue primero
  assert.strictEqual(withBypass[0].contact.lead_score, 80, 'El score alto sigue primero en el orden');
});

test('F4: rama A usa los candados puros (no el candado eterno de is_ai_active)', () => {
  const reactivationSrc = fs.readFileSync('services/reactivation.service.ts', 'utf8');
  assert.ok(
    reactivationSrc.includes('resolveFollowUpHoldReason(contact)'),
    'reactivation.service.ts debe usar resolveFollowUpHoldReason'
  );
  assert.ok(
    !reactivationSrc.includes("contact.is_ai_active === false || contact.conversation_status === 'closed'"),
    'El candado eterno is_ai_active===false debe haberse reemplazado'
  );
});

test('F4: banner del interruptor maestro en Ajustes → Seguimientos', () => {
  const settingsSrc = fs.readFileSync('components/settings/FollowUpSequencesSettings.tsx', 'utf8');
  assert.ok(
    settingsSrc.includes('getFollowUpHealthAction'),
    'El panel debe consultar la salud de seguimientos'
  );
  assert.ok(
    settingsSrc.includes('está APAGADO') && settingsSrc.includes('Nada se está enviando'),
    'Debe existir el banner crítico cuando hay secuencias configuradas y el interruptor está apagado'
  );
});

test('F2: el prompt compilado ya no menciona herramientas técnicas', () => {
  const compilerSrc = fs.readFileSync('lib/ai/prompt-compiler.ts', 'utf8');
  const closingSection = compilerSrc.slice(compilerSrc.indexOf('const closingDirective'), compilerSrc.indexOf('const accountsList'));
  assert.ok(
    !closingSection.includes('check_native_availability') && !closingSection.includes('request_human_handoff'),
    'Las directrices de cierre/relevo del prompt del cliente no deben contener nombres de tools'
  );
});

test('F2.2: el wizard ya no incrusta la cola de galería en el prompt editable', () => {
  const wizardSrc = fs.readFileSync('components/settings/StructuredPromptWizard.tsx', 'utf8');
  assert.ok(
    !wizardSrc.includes('CATÁLOGO VISUAL DE PRODUCTOS (DISPATCH INTERNO)'),
    'El wizard no debe volver a escribir la cola de galería en el prompt compilado'
  );
  assert.ok(
    wizardSrc.includes('gallery: currentGallery'),
    'La galería debe propagarse como structured_prompt_data.gallery (fuente autoritativa)'
  );
  // El parser legacy de cola se conserva para prompts antiguos
  const versionsSrc = fs.readFileSync('lib/ai/prompt-assistant/versions.ts', 'utf8');
  assert.ok(
    versionsSrc.includes('splitGalleryTail'),
    'El parser legacy de la cola de galería debe conservarse'
  );
});
