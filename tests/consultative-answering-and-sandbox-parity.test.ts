import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnoseCopilotTurn } from '../lib/ai/copilot-engine';
import { buildSalesPlaybook } from '../lib/ai/sales-playbook';
import { stripRedundantCatalogListAfterCards } from '../lib/media/format';

test('1. Copilot Engine: Prescribe asesoría consultiva prioritaria ante preguntas de adecuación (estatura, edad, medidas)', () => {
  const diagnosis = diagnoseCopilotTurn({
    history: [
      {
        sender_type: 'lead',
        content: 'Hola buenas, ví sus productos y quiero comprar uno para mi niña ella es un poco alta mide 1.35 metros será que le gustan?',
      },
    ],
    organization: {
      system_prompt: 'Fábrica de cocinitas infantiles. Plan Separe disponible.',
    },
  });

  assert.equal(diagnosis.tacticKey, 'consultative_advice_and_card');
  assert.ok(
    diagnosis.copilotDirective.includes('Responde PRIMERO a su inquietud') ||
    diagnosis.copilotDirective.includes('estatura'),
    'La directriz debe obligar a responder primero la inquietud del cliente'
  );
  assert.ok(
    diagnosis.prohibitedActions.some((a) => a.toLowerCase().includes('ignorar')),
    'Debe prohibir expresamente ignorar la pregunta del cliente'
  );
});

test('2. Playbook: Instruye responder primero a dudas y prohíbe ignorar consultas del cliente', () => {
  const playbook = buildSalesPlaybook();

  assert.ok(playbook.includes('ASESORÍA CONSULTIVA PRIORITARIA'), 'Debe incluir la regla de asesoría consultiva');
  assert.ok(playbook.includes('CERO IGNORAR PREGUNTAS DEL CLIENTE'), 'Debe prohibir ignorar preguntas');
});

test('3. Anti-Repetición: Conserva oraciones explicativas de asesoría y poda fichas técnicas en bloque', () => {
  const naturalAdvice = `¡Hola! Con 1.35 m de estatura le va a encantar y le queda perfecta para jugar de pie.
Medidas: 1.20 m alto x 60 cm ancho x 26 cm prof.
¿Te gustaría apartarla desde hoy con Plan Separe?`;

  const cleaned = stripRedundantCatalogListAfterCards(naturalAdvice);

  // La ficha técnica aislada puede podarse pero la asesoría natural DEBE preservarse
  assert.ok(cleaned.includes('Con 1.35 m de estatura le va a encantar'), 'Debe conservar la asesoría sobre la estatura');
  assert.ok(cleaned.includes('¿Te gustaría apartarla desde hoy con Plan Separe?'), 'Debe conservar el avance');
});
