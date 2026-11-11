import { supabaseAdmin } from '@/lib/supabase/admin';
import { computeLeadScore, type LeadScoreResult } from '@/lib/leads/lead-score';

const SCORE_CONTACT_COLUMNS =
  'id, organization_id, pipeline_stage, custom_fields, deal_value, last_lead_message_at, lead_score, lead_score_breakdown';

const DAY_MS = 24 * 3600 * 1000;

type ScoreContactRow = {
  id: string;
  organization_id: string;
  pipeline_stage: string | null;
  custom_fields: Record<string, any> | null;
  deal_value: number | null;
  last_lead_message_at: string | null;
  lead_score: number | null;
  lead_score_breakdown: any;
};

/**
 * Servicio de score de propensión de compra.
 * Todas las funciones públicas son "best effort": nunca lanzan hacia el flujo de mensajes/IA.
 */
export class LeadScoreService {
  /** Cuenta mensajes del lead de los últimos 7 días para un conjunto de contactos. */
  private static async countRecentLeadMessages(contactIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (contactIds.length === 0) return counts;
    const sinceIso = new Date(Date.now() - 7 * DAY_MS).toISOString();
    const { data } = await (supabaseAdmin.from('messages') as any)
      .select('contact_id')
      .in('contact_id', contactIds)
      .eq('sender_type', 'lead')
      .gte('created_at', sinceIso)
      .limit(5000);
    for (const row of (data || []) as { contact_id: string }[]) {
      counts.set(row.contact_id, (counts.get(row.contact_id) || 0) + 1);
    }
    return counts;
  }

  private static scoreRow(row: ScoreContactRow, leadMessagesLast7d: number): LeadScoreResult {
    return computeLeadScore({
      pipelineStage: row.pipeline_stage,
      customFields: row.custom_fields,
      dealValue: row.deal_value,
      lastLeadMessageAt: row.last_lead_message_at,
      leadMessagesLast7d,
    });
  }

  private static async persist(row: ScoreContactRow, result: LeadScoreResult): Promise<boolean> {
    const nowIso = new Date().toISOString();
    const breakdownChanged = JSON.stringify(row.lead_score_breakdown || null) !== JSON.stringify(result.breakdown);
    const scoreChanged = row.lead_score !== result.score;

    // Solo marcar timestamp si nada cambió (evita eventos realtime innecesarios en el inbox)
    const payload: Record<string, any> = scoreChanged || breakdownChanged
      ? { lead_score: result.score, lead_score_breakdown: result.breakdown, lead_score_updated_at: nowIso }
      : { lead_score_updated_at: nowIso };

    // Nota: no se toca updated_at para no alterar la sincronización incremental del inbox
    // salvo que el score cambie (el inbox debe reflejar el nuevo valor).
    if (scoreChanged || breakdownChanged) payload.updated_at = nowIso;

    const { error } = await (supabaseAdmin.from('contacts') as any).update(payload).eq('id', row.id);
    if (error) {
      console.warn('[LEAD SCORE] Error guardando score', row.id, error.message);
      return false;
    }
    return scoreChanged;
  }

  /** Recalcula el score de un contacto. Seguro de llamar desde cualquier flujo (no lanza). */
  static async recompute(contactId: string | null | undefined): Promise<number | null> {
    if (!contactId) return null;
    try {
      const { data: row } = await (supabaseAdmin.from('contacts') as any)
        .select(SCORE_CONTACT_COLUMNS)
        .eq('id', contactId)
        .maybeSingle();
      if (!row) return null;
      const counts = await this.countRecentLeadMessages([row.id]);
      const result = this.scoreRow(row as ScoreContactRow, counts.get(row.id) || 0);
      await this.persist(row as ScoreContactRow, result);
      return result.score;
    } catch (err: any) {
      console.warn('[LEAD SCORE] recompute falló', contactId, err?.message || err);
      return null;
    }
  }

  /** Dispara el recálculo sin bloquear al llamador. */
  static recomputeInBackground(contactId: string | null | undefined): void {
    void this.recompute(contactId);
  }

  /**
   * Recalcula scores vencidos (nunca calculados o con más de `staleHours`) de una organización
   * o de todas. Pensado para el cron: aplica el decaimiento por recencia.
   */
  static async recomputeStale(params: {
    organizationId?: string;
    staleHours?: number;
    maxContacts?: number;
    deadlineMs?: number;
  } = {}): Promise<{ scanned: number; changed: number }> {
    const staleHours = params.staleHours ?? 6;
    const maxContacts = params.maxContacts ?? 600;
    const deadline = params.deadlineMs ?? Date.now() + 15_000;
    const staleIso = new Date(Date.now() - staleHours * 3600 * 1000).toISOString();
    const batchSize = 150;

    let scanned = 0;
    let changed = 0;

    try {
      while (scanned < maxContacts && Date.now() < deadline) {
        let query = (supabaseAdmin.from('contacts') as any)
          .select(SCORE_CONTACT_COLUMNS)
          .is('deleted_at', null)
          .or(`lead_score_updated_at.is.null,lead_score_updated_at.lt.${staleIso}`)
          .order('lead_score_updated_at', { ascending: true, nullsFirst: true })
          .limit(Math.min(batchSize, maxContacts - scanned));
        if (params.organizationId) query = query.eq('organization_id', params.organizationId);

        const { data: rows, error } = await query;
        if (error) {
          console.warn('[LEAD SCORE] recomputeStale query error', error.message);
          break;
        }
        if (!rows || rows.length === 0) break;

        const counts = await this.countRecentLeadMessages(rows.map((r: ScoreContactRow) => r.id));
        for (const row of rows as ScoreContactRow[]) {
          const result = this.scoreRow(row, counts.get(row.id) || 0);
          if (await this.persist(row, result)) changed++;
          scanned++;
          if (Date.now() >= deadline) break;
        }
        if (rows.length < batchSize) break;
      }
    } catch (err: any) {
      console.warn('[LEAD SCORE] recomputeStale falló', err?.message || err);
    }

    return { scanned, changed };
  }
}
