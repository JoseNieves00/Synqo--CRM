import { supabaseAdmin } from '@/lib/supabase/admin';
import { normalizeContactInboxState } from '@/lib/inbox/normalize';
import {
  classifySeguimientoSubBucket,
  compareInboxContacts,
  resolveInboxSort,
  type InboxSortMode,
} from '@/lib/inbox/buckets';

export type InboxView =
  | 'por_responder'
  | 'mis_abiertos'
  | 'ia_atendiendo'
  | 'seguimiento'
  | 'cerrados'
  | 'todos';
export type SeguimientoFilter = 'all' | 'ventas_a_medias' | 'compromisos' | 'por_reactivar';

export interface SeguimientoSubCounts {
  ventas_a_medias: number;
  compromisos: number;
  por_reactivar: number;
}

export interface InboxCountsResult {
  por_responder: number;
  mis_abiertos: number;
  ia_atendiendo: number;
  seguimiento: number;
  cerrados: number;
  todos: number;
}

export interface ListInboxServiceParams {
  orgId: string;
  userId: string;
  view?: InboxView;
  seguimientoSubView?: SeguimientoFilter;
  channel?: 'all' | 'whatsapp' | 'instagram';
  agentId?: string;
  stage?: string;
  temperature?: string;
  sort?: InboxSortMode;
  search?: string;
  offset?: number;
  limit?: number;
}

function buildPorResponderOrFilter(staleAiIso: string): string {
  return [
    'custom_fields->>unattended_handoff.eq.true',
    'and(is_ai_active.eq.false,last_message_sender.eq.lead)',
    'and(is_ai_active.eq.false,waiting_since.not.is.null)',
    'and(is_ai_active.eq.false,unread_count.gt.0)',
    'and(is_ai_active.eq.false,last_message_sender.is.null)',
    `and(is_ai_active.eq.true,last_message_sender.eq.lead,waiting_since.lte.${staleAiIso})`,
  ].join(',');
}

function buildSeguimientoOrFilter(d24h: string, d10d: string): string {
  return [
    'ai_snooze_until.not.is.null',
    'custom_fields->>active_reminder.not.is.null',
    'custom_fields->follow_up->>nextSendAt.not.is.null',
    `and(last_interaction_at.lte.${d24h},last_interaction_at.gte.${d10d},unread_count.eq.0,custom_fields->>reactivation_attempted.is.null,last_message_sender.neq.lead)`,
    `and(last_interaction_at.lte.${d24h},last_interaction_at.gte.${d10d},unread_count.eq.0,custom_fields->>reactivation_attempted.is.null,last_message_sender.is.null)`,
  ].join(',');
}

const SEGUIMIENTO_EXCLUDE_COLD_OR =
  'custom_fields->>lead_temperature.is.null,custom_fields->>lead_temperature.neq.cold';
const SEGUIMIENTO_EXCLUDE_LEGACY_COLD_OR =
  'custom_fields->>temperature.is.null,custom_fields->>temperature.neq.cold';

export class InboxQueryService {
  static async listInbox(params: ListInboxServiceParams) {
    const {
      orgId,
      userId,
      view = 'por_responder',
      seguimientoSubView = 'all',
      channel = 'all',
      agentId = 'all',
      stage = 'all',
      temperature = 'all',
      sort = 'auto',
      search = '',
      offset = 0,
      limit = 30,
    } = params;

    const safeLimit = Math.min(Math.max(1, limit), 60);
    const safeOffset = Math.max(0, offset);

    let query = (supabaseAdmin.from('contacts') as any)
      .select(
        'id, name, phone, pipeline_stage, deal_value, is_ai_active, last_interaction_at, updated_at, custom_fields, assigned_to, channel, instagram_username, instagram_id, unread_count, last_message, last_message_sender, last_message_preview, waiting_since, conversation_status, ai_snooze_until, last_lead_message_at, lead_score, lead_score_breakdown, lead_temperature',
        safeOffset === 0 || view === 'seguimiento' ? { count: 'exact' } : {}
      )
      .eq('organization_id', orgId)
      .is('deleted_at', null);

    const staleAiIso = new Date(Date.now() - 3 * 60 * 1000).toISOString();

    const effectiveSort = resolveInboxSort(view as any, sort);
    if (effectiveSort === 'score') {
      query = query.order('lead_score', { ascending: false, nullsFirst: false });
    } else if (effectiveSort === 'name') {
      query = query.order('name', { ascending: true, nullsFirst: false });
    } else if (effectiveSort === 'oldest') {
      query = query.order('last_interaction_at', { ascending: true, nullsFirst: false });
    }

    const cleanSearch = (search || '').trim().replace(/[%_(),]/g, '');
    const cleanDigits = cleanSearch.replace(/\D/g, '');

    if (!cleanSearch) {
      if (view === 'por_responder') {
        query = query
          .or('conversation_status.is.null,conversation_status.neq.closed')
          .or(buildPorResponderOrFilter(staleAiIso))
          .order('waiting_since', { ascending: true, nullsFirst: false })
          .order('last_interaction_at', { ascending: true, nullsFirst: false });
      } else if (view === 'mis_abiertos') {
        query = query
          .eq('assigned_to', userId)
          .neq('conversation_status', 'closed')
          .order('last_interaction_at', { ascending: false, nullsFirst: false })
          .order('updated_at', { ascending: false });
      } else if (view === 'ia_atendiendo') {
        query = query
          .eq('is_ai_active', true)
          .neq('conversation_status', 'closed')
          .or('custom_fields->>unattended_handoff.is.null,custom_fields->>unattended_handoff.neq.true')
          .order('last_interaction_at', { ascending: false, nullsFirst: false })
          .order('updated_at', { ascending: false });
      } else if (view === 'seguimiento') {
        const d24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const d10d = new Date(Date.now() - 240 * 3600 * 1000).toISOString();
        query = query
          .neq('conversation_status', 'closed')
          .is('waiting_since', null)
          .not('pipeline_stage', 'in', '("ganado","perdido","cita_agendada")')
          .or(SEGUIMIENTO_EXCLUDE_COLD_OR)
          .or(SEGUIMIENTO_EXCLUDE_LEGACY_COLD_OR)
          .or(buildSeguimientoOrFilter(d24h, d10d))
          .order('last_interaction_at', { ascending: false, nullsFirst: false })
          .order('updated_at', { ascending: false });
      } else if (view === 'cerrados') {
        query = query
          .eq('conversation_status', 'closed')
          .order('last_interaction_at', { ascending: false, nullsFirst: false })
          .order('updated_at', { ascending: false });
      } else {
        query = query
          .order('last_interaction_at', { ascending: false, nullsFirst: false })
          .order('updated_at', { ascending: false });
      }
    } else {
      query = query
        .order('last_interaction_at', { ascending: false, nullsFirst: false })
        .order('updated_at', { ascending: false });
    }

    query = query.order('id', { ascending: true });

    if (channel === 'whatsapp') {
      query = query.neq('channel', 'instagram');
    } else if (channel === 'instagram') {
      query = query.eq('channel', 'instagram');
    }

    if (agentId === 'unassigned') {
      query = query.is('assigned_to', null);
    } else if (agentId && agentId !== 'all') {
      query = query.eq('assigned_to', agentId);
    }

    if (stage && stage !== 'all') {
      query = query.eq('pipeline_stage', stage);
    }

    if (temperature === 'unclassified') {
      query = query.is('lead_temperature', null);
    } else if (temperature && ['hot', 'qualified_doubt', 'warm', 'cold'].includes(temperature)) {
      query = query.eq('lead_temperature', temperature);
    }

    if (cleanSearch) {
      if (cleanDigits.length >= 3) {
        query = query.or(
          `name.ilike.%${cleanSearch}%,phone.ilike.%${cleanDigits}%,instagram_username.ilike.%${cleanSearch}%`
        );
      } else {
        query = query.or(`name.ilike.%${cleanSearch}%,instagram_username.ilike.%${cleanSearch}%`);
      }
    }

    if (view === 'seguimiento') {
      const { data: segContacts, error: segErr } = await query.range(0, 999);
      if (segErr) {
        console.error('[LIST INBOX SEGUIMIENTO ERROR]', segErr);
        throw new Error('Error al listar contactos de seguimiento');
      }

      const nowMs = Date.now();
      const normalizedAll = (segContacts || []).map(normalizeContactInboxState);
      const subCounts: SeguimientoSubCounts = {
        ventas_a_medias: 0,
        compromisos: 0,
        por_reactivar: 0,
      };
      const filteredAll: any[] = [];

      for (const c of normalizedAll) {
        const sb = classifySeguimientoSubBucket(c, nowMs);
        if (sb) {
          subCounts[sb]++;
          if (seguimientoSubView === 'all' || sb === seguimientoSubView) {
            filteredAll.push(c);
          }
        }
      }

      filteredAll.sort((a, b) => compareInboxContacts(a, b, 'seguimiento', sort));

      return {
        contacts: filteredAll.slice(safeOffset, safeOffset + safeLimit),
        totalCount: filteredAll.length,
        seguimientoSubCounts: subCounts,
      };
    }

    const { data: contacts, error, count } = await query.range(safeOffset, safeOffset + safeLimit - 1);

    if (error) {
      console.error('[LIST INBOX ERROR]', error);
      throw new Error('Error al listar contactos de la bandeja');
    }

    const normalized = (contacts || []).map(normalizeContactInboxState);
    normalized.sort((a: any, b: any) => compareInboxContacts(a, b, view, sort));
    return { contacts: normalized, totalCount: count ?? null, seguimientoSubCounts: null };
  }

  static async getInboxCounts(orgId: string, userId: string): Promise<InboxCountsResult> {
    const staleAiIso = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const d24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const d10d = new Date(Date.now() - 240 * 3600 * 1000).toISOString();

    const [resPorResponder, resMisAbiertos, resIa, resSeguimiento, resCerrados, resTodos] =
      await Promise.all([
        (supabaseAdmin.from('contacts') as any)
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .is('deleted_at', null)
          .or('conversation_status.is.null,conversation_status.neq.closed')
          .or(buildPorResponderOrFilter(staleAiIso)),
        (supabaseAdmin.from('contacts') as any)
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .is('deleted_at', null)
          .eq('assigned_to', userId)
          .neq('conversation_status', 'closed'),
        (supabaseAdmin.from('contacts') as any)
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .is('deleted_at', null)
          .eq('is_ai_active', true)
          .neq('conversation_status', 'closed')
          .or('custom_fields->>unattended_handoff.is.null,custom_fields->>unattended_handoff.neq.true'),
        (supabaseAdmin.from('contacts') as any)
          .select(
            'id, pipeline_stage, deal_value, is_ai_active, last_interaction_at, custom_fields, unread_count, waiting_since, last_message_sender, conversation_status, ai_snooze_until'
          )
          .eq('organization_id', orgId)
          .is('deleted_at', null)
          .neq('conversation_status', 'closed')
          .is('waiting_since', null)
          .not('pipeline_stage', 'in', '("ganado","perdido","cita_agendada")')
          .or(SEGUIMIENTO_EXCLUDE_COLD_OR)
          .or(SEGUIMIENTO_EXCLUDE_LEGACY_COLD_OR)
          .or(buildSeguimientoOrFilter(d24h, d10d))
          .range(0, 999),
        (supabaseAdmin.from('contacts') as any)
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .is('deleted_at', null)
          .eq('conversation_status', 'closed'),
        (supabaseAdmin.from('contacts') as any)
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .is('deleted_at', null),
      ]);

    const nowMs = Date.now();
    const validSeguimientoCount = (resSeguimiento.data || []).reduce((acc: number, row: any) => {
      const normalized = normalizeContactInboxState(row);
      return classifySeguimientoSubBucket(normalized, nowMs) ? acc + 1 : acc;
    }, 0);

    return {
      por_responder: resPorResponder.count || 0,
      mis_abiertos: resMisAbiertos.count || 0,
      ia_atendiendo: resIa.count || 0,
      seguimiento: validSeguimientoCount,
      cerrados: resCerrados.count || 0,
      todos: resTodos?.count || 0,
    };
  }
}
