/**
 * Filtros de la base de clientes. Se comparten entre la tabla /clientes, los segmentos
 * guardados y las campañas IA (el segmento de una campaña es exactamente este objeto).
 */
export interface CustomerFilters {
  search?: string;
  stage?: string; // 'all' | pipeline_stage
  temperature?: string; // 'all' | hot | qualified_doubt | warm | cold | unclassified
  scoreMin?: number | null;
  scoreMax?: number | null;
  tagId?: string | null;
  assignedTo?: string | null; // 'all' | 'unassigned' | profile id
  channel?: 'all' | 'whatsapp' | 'instagram';
  /** Clientes que no escriben hace al menos N días (o nunca escribieron). */
  inactiveDays?: number | null;
  /** Clientes con al menos un pedido / sin pedidos. */
  buyers?: 'all' | 'buyers' | 'non_buyers';
}

export type CustomerSort = 'score' | 'recent' | 'name' | 'created';

export const CUSTOMER_TEMPERATURES = ['hot', 'qualified_doubt', 'warm', 'cold'] as const;
const PIPELINE_STAGES = ['nuevo', 'calificado', 'cita_agendada', 'ganado', 'perdido'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normaliza y valida filtros recibidos del cliente (lista blanca: nada se interpola sin validar). */
export function normalizeCustomerFilters(raw: any): CustomerFilters {
  const f = raw && typeof raw === 'object' ? raw : {};
  const num = (v: any, min: number, max: number) =>
    v === null || v === undefined || v === '' || !Number.isFinite(Number(v))
      ? null
      : Math.max(min, Math.min(max, Math.round(Number(v))));

  return {
    search: typeof f.search === 'string' ? f.search.trim().replace(/[%_(),*]/g, '').slice(0, 80) : '',
    stage: PIPELINE_STAGES.includes(f.stage) ? f.stage : 'all',
    temperature:
      (CUSTOMER_TEMPERATURES as readonly string[]).includes(f.temperature) || f.temperature === 'unclassified'
        ? f.temperature
        : 'all',
    scoreMin: num(f.scoreMin, 0, 100),
    scoreMax: num(f.scoreMax, 0, 100),
    tagId: typeof f.tagId === 'string' && UUID_RE.test(f.tagId) ? f.tagId : null,
    assignedTo:
      f.assignedTo === 'unassigned' || (typeof f.assignedTo === 'string' && UUID_RE.test(f.assignedTo))
        ? f.assignedTo
        : 'all',
    channel: f.channel === 'whatsapp' || f.channel === 'instagram' ? f.channel : 'all',
    inactiveDays: num(f.inactiveDays, 1, 365),
    buyers: f.buyers === 'buyers' || f.buyers === 'non_buyers' ? f.buyers : 'all',
  };
}

/**
 * Aplica los filtros a una consulta PostgREST sobre `contacts`.
 * Si hay `tagId`, la consulta debe incluir el embebido `contact_tags!inner(tag_id)` en el select.
 */
export function applyCustomerFilters(query: any, filters: CustomerFilters, now = Date.now()): any {
  let q = query;
  if (filters.search) {
    const s = filters.search;
    q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%,instagram_username.ilike.%${s}%`);
  }
  if (filters.stage && filters.stage !== 'all') q = q.eq('pipeline_stage', filters.stage);
  if (filters.temperature === 'unclassified') q = q.is('lead_temperature', null);
  else if (filters.temperature && filters.temperature !== 'all') q = q.eq('lead_temperature', filters.temperature);
  if (typeof filters.scoreMin === 'number') q = q.gte('lead_score', filters.scoreMin);
  if (typeof filters.scoreMax === 'number') q = q.lte('lead_score', filters.scoreMax);
  if (filters.tagId) q = q.eq('contact_tags.tag_id', filters.tagId);
  if (filters.assignedTo === 'unassigned') q = q.is('assigned_to', null);
  else if (filters.assignedTo && filters.assignedTo !== 'all') q = q.eq('assigned_to', filters.assignedTo);
  if (filters.channel === 'instagram') q = q.eq('channel', 'instagram');
  else if (filters.channel === 'whatsapp') q = q.neq('channel', 'instagram');
  if (typeof filters.inactiveDays === 'number') {
    const cutoff = new Date(now - filters.inactiveDays * 24 * 3600 * 1000).toISOString();
    q = q.or(`last_lead_message_at.is.null,last_lead_message_at.lt.${cutoff}`);
  }
  if (filters.buyers === 'buyers') q = q.or('pipeline_stage.eq.ganado,custom_fields->order.not.is.null');
  else if (filters.buyers === 'non_buyers') q = q.neq('pipeline_stage', 'ganado').is('custom_fields->order', null);
  return q;
}

export function applyCustomerSort(query: any, sort: CustomerSort): any {
  switch (sort) {
    case 'recent':
      return query.order('last_interaction_at', { ascending: false, nullsFirst: false }).order('id');
    case 'name':
      return query.order('name', { ascending: true, nullsFirst: false }).order('id');
    case 'created':
      return query.order('created_at', { ascending: false }).order('id');
    case 'score':
    default:
      return query
        .order('lead_score', { ascending: false, nullsFirst: false })
        .order('last_interaction_at', { ascending: false, nullsFirst: false })
        .order('id');
  }
}

/** Descripción legible de un segmento (para campañas y segmentos guardados). */
export function describeCustomerFilters(f: CustomerFilters, tagName?: string | null): string {
  const parts: string[] = [];
  const tempLabels: Record<string, string> = {
    hot: 'listos para comprar',
    qualified_doubt: 'interesados con dudas',
    warm: 'tibios',
    cold: 'fríos',
    unclassified: 'sin clasificar',
  };
  if (f.temperature && f.temperature !== 'all') parts.push(tempLabels[f.temperature] || f.temperature);
  if (f.stage && f.stage !== 'all') parts.push(`etapa ${f.stage}`);
  if (typeof f.scoreMin === 'number' || typeof f.scoreMax === 'number')
    parts.push(`score ${f.scoreMin ?? 0}–${f.scoreMax ?? 100}`);
  if (f.tagId) parts.push(`etiqueta "${tagName || 'seleccionada'}"`);
  if (typeof f.inactiveDays === 'number') parts.push(`sin escribir hace ${f.inactiveDays}+ días`);
  if (f.buyers === 'buyers') parts.push('compradores');
  if (f.buyers === 'non_buyers') parts.push('sin compras');
  if (f.channel && f.channel !== 'all') parts.push(f.channel === 'instagram' ? 'Instagram' : 'WhatsApp');
  if (f.assignedTo === 'unassigned') parts.push('sin asesor');
  if (f.search) parts.push(`búsqueda "${f.search}"`);
  return parts.length > 0 ? parts.join(' · ') : 'Todos los clientes';
}
