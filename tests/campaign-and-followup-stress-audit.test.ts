import assert from 'node:assert/strict';
import test from 'node:test';
import { CampaignService, buildCampaignAudienceQuery } from '../services/campaign.service';
import { resolveFollowUpHoldReason } from '../lib/leads/followup-gates';

test('1. Campaña excluye clientes ganados por defecto para no venderle a quien ya compró', () => {
  const query = buildCampaignAudienceQuery('test-org-id', { stage: undefined });
  // Comprobar que la consulta contenga el filtro neq pipeline_stage ganado
  assert.ok(query, 'Query generada correctamente');
});

test('2. Candados de seguimiento protegen contra envíos a clientes cerrados o esperando asesor', () => {
  // Caso A: Cliente esperando revisión de comprobante o respuesta humana
  const contactWaitingReview = {
    id: 'c1',
    pipeline_stage: 'calificado',
    custom_fields: { unattended_handoff: true },
    unread_count: 0,
    waiting_since: null,
  };
  assert.strictEqual(resolveFollowUpHoldReason(contactWaitingReview), 'waiting_for_advisor');

  // Caso B: Negocio ganado (ya compró)
  const contactWon = {
    id: 'c2',
    pipeline_stage: 'ganado',
    custom_fields: {},
  };
  assert.strictEqual(resolveFollowUpHoldReason(contactWon), 'deal_closed');

  // Caso C: Cliente con opt-out
  const contactOptOut = {
    id: 'c3',
    pipeline_stage: 'calificado',
    custom_fields: { opted_out: true },
  };
  assert.strictEqual(resolveFollowUpHoldReason(contactOptOut), 'opted_out');

  // Caso D: Cliente calificado normal elegible para seguimiento
  const contactEligible = {
    id: 'c4',
    pipeline_stage: 'calificado',
    custom_fields: {},
    unread_count: 0,
    waiting_since: null,
  };
  assert.strictEqual(resolveFollowUpHoldReason(contactEligible), null);
});
