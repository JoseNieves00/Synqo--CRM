import assert from 'node:assert/strict';
import {
  diagnoseCopilotTurn,
  resolveHybridIntentTrack,
} from '../lib/ai/copilot-engine';
import { LeadReactivationService } from '../services/reactivation.service';

async function run() {
  // 1. Modelos puros
  assert.equal(
    resolveHybridIntentTrack({
      businessModel: 'products',
      history: [{ sender_type: 'lead', content: 'Hola info' }],
    }),
    'order'
  );
  assert.equal(
    resolveHybridIntentTrack({
      businessModel: 'services',
      history: [{ sender_type: 'lead', content: 'Hola info' }],
    }),
    'appointment'
  );

  // 2. Híbrido ambiguo -> clarify
  assert.equal(
    resolveHybridIntentTrack({
      businessModel: 'hybrid',
      history: [{ sender_type: 'lead', content: 'Hola, quiero información por favor' }],
    }),
    'clarify'
  );

  // 3. Híbrido multi-intención (remodelación: precio + visita) -> integrated
  assert.equal(
    resolveHybridIntentTrack({
      businessModel: 'hybrid',
      history: [
        {
          sender_type: 'lead',
          content: 'Quiero remodelar mi cocina 3x3, ¿cuánto sale aprox y cuándo pueden venir a medir?',
        },
      ],
    }),
    'integrated'
  );

  // 4. Híbrido cita pura -> appointment + prohibición de fletes en diagnoseCopilotTurn
  const hybridOrg = {
    name: 'Remodelaciones Pro',
    enabled_modules: { orders: true, native_calendar: true },
    system_prompt:
      'Vendemos muebles modulares con envío nacional y también agendamos visitas de toma de medidas para remodelación.',
  };

  const apptPresc = diagnoseCopilotTurn({
    history: [{ sender_type: 'lead', content: 'Quiero agendar cita para toma de medidas en mi apartamento' }],
    organization: hybridOrg,
  });
  assert.equal(apptPresc.intentTrack, 'appointment');
  assert.ok(
    apptPresc.prohibitedActions.some((p) => p.includes('dirección de envío')),
    'En carril appointment debe prohibir pedir dirección de envío'
  );

  // 5. Cambio dinámico de carril sin bloqueo pegajoso (appointment -> order)
  const orderPresc = diagnoseCopilotTurn({
    history: [
      {
        sender_type: 'lead',
        content: 'Ya aprobé el presupuesto de la cocina, ¿a qué cuenta hago el anticipo por transferencia?',
      },
    ],
    contactData: { custom_fields: { active_intent_track: 'appointment' } },
    organization: hybridOrg,
  });
  assert.equal(orderPresc.intentTrack, 'order', 'Debe sobreescribir el carril anterior ante señal explícita de pago');
  assert.ok(
    orderPresc.prohibitedActions.some((p) => p.includes('Prohibido ofrecer citas')),
    'En carril order debe prohibir ofrecer citas'
  );

  // 6. Seguimiento manual_exact envía el mensaje literal (verbatim) con interpolación de nombre
  const exactRes = await LeadReactivationService.resolveAutonomousFollowUpPayload({
    org: { name: 'Remodelaciones Pro' },
    contact: { id: 'c-1', name: 'Carlos Pérez' },
    cf: {
      product_interest: 'Cocina integral',
      active_reminder: {
        dispatchMode: 'manual_exact',
        suggestedMessage: 'Hola {nombre}, confirmamos si revisaste el presupuesto de {producto}.',
      },
    },
  });
  assert.equal(
    exactRes.bodyMessage,
    'Hola Carlos, confirmamos si revisaste el presupuesto de Cocina integral.'
  );

  console.log('✅ intent-track-and-contextual-followup.test.ts passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
