import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnoseCopilotTurn } from '../lib/ai/copilot-engine';
import { buildSalesPlaybook } from '../lib/ai/sales-playbook';
import { stripRedundantCatalogListAfterCards, splitIntoConsecutiveMessages } from '../lib/media/format';

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
    diagnosis.copilotDirective.includes('Responde PRIMERO') ||
    diagnosis.copilotDirective.includes('responde primero') ||
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
  assert.ok(playbook.includes('MÁXIMO 2 MENSAJES'), 'Debe incluir la regla de ritmo de máximo 2 mensajes');
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

test('4. División de Mensajes: Divide respuesta larga con párrafos en exactamente 2 mensajes consecutivos coherentes', () => {
  const sampleWithParagraphs = `¡Hola! Con 1.35 m de estatura, le van a encantar y se sentirá súper cómoda jugando de pie.

Para su altura te recomiendo la Cocina Mediana. ✨ Puedes apartarla desde hoy con Plan Separe dando un abono inicial. ¿Te gustaría apartarla o conocer algún detalle adicional?`;

  const parts = splitIntoConsecutiveMessages(sampleWithParagraphs, 2);

  assert.equal(parts.length, 2, 'Debe dividir en exactamente 2 mensajes');
  assert.ok(parts[0].includes('Con 1.35 m de estatura'), 'El mensaje 1 debe responder a la duda');
  assert.ok(parts[1].includes('Cocina Mediana') && parts[1].includes('Plan Separe'), 'El mensaje 2 debe contener la recomendación y el cierre');
});

test('5. División de Mensajes: Divide párrafo continuo largo (>170 chars) en frontera natural de oración sin cortar palabras', () => {
  const continuousLongText = `¡Hola! Qué hermosa edad tiene tu pequeña. Con 1.35 m de estatura le van a encantar y se sentirá súper cómoda jugando de pie. Para una niña de esa estatura te recomiendo la Cocina Mediana que puedes apartar desde hoy con Plan Separe. ¿Te gustaría apartarla hoy o prefieres conocer algún detalle adicional?`;

  const parts = splitIntoConsecutiveMessages(continuousLongText, 2);

  assert.equal(parts.length, 2, 'Debe dividir en máximo 2 mensajes');
  assert.ok(parts[0].endsWith('.') || parts[0].endsWith('!') || parts[0].endsWith('?'), 'Mensaje 1 debe terminar limpiamente en signo de puntuación');
  assert.ok(parts[1].endsWith('?'), 'Mensaje 2 debe conservar la pregunta de cierre');
});

test('6. División de Mensajes: Mensaje breve (<= 160 chars) se mantiene como 1 solo mensaje', () => {
  const shortText = `¡Hola! Estamos ubicados en Valledupar y despachamos a todo el país. ¿Para qué ciudad sería tu envío?`;
  const parts = splitIntoConsecutiveMessages(shortText, 2);
  assert.equal(parts.length, 1, 'Un mensaje breve debe mantenerse como 1 solo mensaje');
  assert.equal(parts[0], shortText);
});
