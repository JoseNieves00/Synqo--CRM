import {
  PROMPT_BLUEPRINT_SLOTS,
  tryParseSlotLocally,
} from '../lib/ai/prompt-assistant/blueprint';
import {
  estimatePromptTokens,
  patchSectionInPrompt,
  renderPromptFromSlots,
} from '../lib/ai/prompt-assistant/versions';
import { PROMPT_ASSISTANT_CONFIG } from '../lib/ai/config';

const SAMPLE_ANSWERS: Record<string, string> = {
  'empresa.resumen': 'Optica Luz Clara — Medellín, exámenes visuales y montaje de lentes.',
  'catalogo.items': '- Examen visual ($60.000)\n- Montura acetato + antirreflejo ($240.000)',
  'pagos.medios': 'Transferencia Bancolombia, Nequi, Datáfono y efectivo en sede',
  'envios.cobertura': 'Atención en sede principal y domicilios en área metropolitana sin costo desde $200.000',
  'politicas.garantia': 'Garantía de 6 meses en fórmula y 1 año por defectos de fábrica.',
  'faq.lista': 'Sí, aceptamos fórmulas externas vigentes menores a 6 meses.',
  'tono.estilo': 'Tuteo amable, máximo 1 emoji por mensaje, firma como Sofía.',
  'cierre.datos': 'Nombre completo, ciudad y si ya cuenta con fórmula médica.',
  'relevo.reglas': 'Pasar a optómetra ante síntomas de urgencia ocular; L-S 9am a 6pm.',
  'seguimiento.estrategia': 'Recordar valoración visual incluida al llevar montura completa.',
  'adicional.notas': 'No prometer descuentos sin aprobación de gerencia.',
};

function runSimulation() {
  let localZeroTokenCount = 0;
  let llmNeededCount = 0;
  const slots: Record<string, any> = {};

  for (const slot of PROMPT_BLUEPRINT_SLOTS) {
    const raw = SAMPLE_ANSWERS[slot.id] || '';
    if (!raw) continue;
    const localRes = tryParseSlotLocally(slot, raw, 'health');
    if (localRes.handled && !localRes.skipped) {
      localZeroTokenCount++;
      slots[slot.id] = localRes.value;
    } else {
      llmNeededCount++;
      // Simulación de JSON estructurado devuelto por getAiUtilityChain (~650 tokens/llamada)
      slots[slot.id] = raw;
    }
  }

  const prompt = renderPromptFromSlots(slots, 'health');
  const patched = patchSectionInPrompt(prompt, 'Seguimiento', '- Recordar revisión visual incluida.');
  const estimatedPromptSize = estimatePromptTokens(patched);
  const estimatedInterviewTokens = llmNeededCount * 650;

  console.log('=== Simulación Asistente de Prompt (Synqo) ===');
  console.log(`Slots completados: ${Object.keys(slots).length}`);
  console.log(`Resueltos localmente (0 tokens): ${localZeroTokenCount}`);
  console.log(`Interpretados con modelo utilitario: ${llmNeededCount}`);
  console.log(`Consumo estimado total entrevista nueva: ~${estimatedInterviewTokens} tokens (cuenta Synqo, máx diario ${PROMPT_ASSISTANT_CONFIG.dailyTokenCap})`);
  console.log(`Tamaño resultante del prompt: ~${estimatedPromptSize} tokens/mensaje (objetivo ≤ ${PROMPT_ASSISTANT_CONFIG.targetPromptTokens})`);
}

runSimulation();
