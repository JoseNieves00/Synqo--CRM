'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sanitizeCsvField } from '@/lib/security/sanitize';
import { LeadScoreService } from '@/services/lead-score.service';
import { TagService, TAG_COLORS, type TagColor, normalizeTagName } from '@/services/tag.service';
import { OrderService, ORDER_STATUSES, type OrderStatus, type OrderItemInput } from '@/services/order.service';
import { CampaignService, buildCampaignAudienceQuery } from '@/services/campaign.service';
import { isLeadWindowOpen } from '@/services/contact.service';
import {
  applyCustomerFilters,
  applyCustomerSort,
  normalizeCustomerFilters,
  type CustomerFilters,
  type CustomerSort,
} from '@/lib/crm/customer-filters';

async function requireOrgMember() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('id, organization_id, role, is_super_admin, full_name')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) throw new Error('Organización no encontrada');
  return { user, profile };
}

export interface TagRecord {
  id: string;
  name: string;
  color: string;
  created_by_ai: boolean;
}

export interface SavedSegmentRecord {
  id: string;
  name: string;
  filters: CustomerFilters;
  created_at: string;
}

export interface CustomerDirectoryRow {
  id: string;
  name: string | null;
  phone: string;
  channel: 'whatsapp' | 'instagram' | string | null;
  instagram_username?: string | null;
  pipeline_stage: string;
  lead_temperature: string | null;
  lead_score: number | null;
  lead_score_breakdown?: any;
  deal_value: number | null;
  assigned_to: string | null;
  last_interaction_at: string | null;
  last_lead_message_at: string | null;
  created_at: string;
  custom_fields: Record<string, any> | null;
  tags: Array<{ id: string; name: string; color: string; source: 'ai' | 'human' }>;
  orders_count: number;
  orders_total: number;
}

export async function listTagsAndSegmentsAction() {
  const { profile } = await requireOrgMember();
  const orgId = profile.organization_id;

  const [tagsRes, segsRes, teamRes, orgRes] = await Promise.all([
    (supabaseAdmin.from('tags') as any)
      .select('id, name, color, created_by_ai')
      .eq('organization_id', orgId)
      .order('name', { ascending: true }),
    (supabaseAdmin.from('saved_segments') as any)
      .select('id, name, filters, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false }),
    (supabaseAdmin.from('profiles') as any)
      .select('id, full_name')
      .eq('organization_id', orgId)
      .order('full_name', { ascending: true }),
    (supabaseAdmin.from('organizations') as any)
      .select('whatsapp_provider, stage_labels')
      .eq('id', orgId)
      .maybeSingle(),
  ]);

  return {
    tags: (tagsRes.data || []) as TagRecord[],
    segments: (segsRes.data || []) as SavedSegmentRecord[],
    teamMembers: (teamRes.data || []) as Array<{ id: string; full_name: string }>,
    whatsappProvider: (orgRes.data?.whatsapp_provider || 'meta') as 'meta' | 'evolution',
    stageLabels: (orgRes.data?.stage_labels || {}) as Record<string, string>,
  };
}

export async function listCustomersAction(params: {
  filters?: CustomerFilters;
  sort?: CustomerSort;
  page?: number;
  pageSize?: number;
}) {
  const { profile } = await requireOrgMember();
  const orgId = profile.organization_id;
  const filters = normalizeCustomerFilters(params.filters);
  const sort: CustomerSort = params.sort || 'score';
  const pageSize = Math.max(10, Math.min(50, Math.round(params.pageSize || 25)));
  const page = Math.max(1, Math.round(params.page || 1));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const baseSelect =
    'id, name, phone, channel, instagram_username, pipeline_stage, lead_temperature, lead_score, lead_score_breakdown, deal_value, assigned_to, last_interaction_at, last_lead_message_at, created_at, custom_fields';
  const selectCols = filters.tagId ? `${baseSelect}, contact_tags!inner(tag_id)` : baseSelect;

  let query = (supabaseAdmin.from('contacts') as any)
    .select(selectCols, { count: 'exact' })
    .eq('organization_id', orgId)
    .is('deleted_at', null);

  query = applyCustomerFilters(query, filters);
  query = applyCustomerSort(query, sort);
  query = query.range(from, to);

  const { data: rows, count, error } = await query;
  if (error) {
    throw new Error(`Error consultando base de clientes: ${error.message}`);
  }

  const list: any[] = rows || [];
  const contactIds = list.map((c) => c.id);

  const tagsByContact = new Map<string, CustomerDirectoryRow['tags']>();
  const ordersByContact = new Map<string, { count: number; total: number }>();

  if (contactIds.length > 0) {
    const [ctRes, ordRes] = await Promise.all([
      (supabaseAdmin.from('contact_tags') as any)
        .select('contact_id, source, tags(id, name, color)')
        .eq('organization_id', orgId)
        .in('contact_id', contactIds),
      (supabaseAdmin.from('orders') as any)
        .select('contact_id, total, status')
        .eq('organization_id', orgId)
        .in('contact_id', contactIds)
        .neq('status', 'cancelled'),
    ]);

    for (const row of ctRes.data || []) {
      const t = row.tags;
      if (!t?.id) continue;
      const arr = tagsByContact.get(row.contact_id) || [];
      arr.push({ id: t.id, name: t.name, color: t.color || 'slate', source: row.source === 'ai' ? 'ai' : 'human' });
      tagsByContact.set(row.contact_id, arr);
    }

    for (const ord of ordRes.data || []) {
      const cur = ordersByContact.get(ord.contact_id) || { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(ord.total || 0);
      ordersByContact.set(ord.contact_id, cur);
    }
  }

  const items: CustomerDirectoryRow[] = list.map((c) => {
    const ordStats = ordersByContact.get(c.id);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      channel: c.channel || 'whatsapp',
      instagram_username: c.instagram_username || null,
      pipeline_stage: c.pipeline_stage || 'nuevo',
      lead_temperature: c.lead_temperature || c.custom_fields?.lead_temperature || null,
      lead_score: typeof c.lead_score === 'number' ? c.lead_score : null,
      lead_score_breakdown: c.lead_score_breakdown || null,
      deal_value: c.deal_value !== null && c.deal_value !== undefined ? Number(c.deal_value) : null,
      assigned_to: c.assigned_to || null,
      last_interaction_at: c.last_interaction_at || null,
      last_lead_message_at: c.last_lead_message_at || null,
      created_at: c.created_at,
      custom_fields: c.custom_fields || {},
      tags: tagsByContact.get(c.id) || [],
      orders_count: ordStats?.count || (c.custom_fields?.order ? 1 : 0),
      orders_total: ordStats?.total || Number(c.custom_fields?.order?.total || 0),
    };
  });

  const totalCount = Number(count || 0);
  return {
    items,
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

export async function exportCustomersCsvAction(params: {
  filters?: CustomerFilters;
  sort?: CustomerSort;
}): Promise<{ csv: string; count: number }> {
  const { profile } = await requireOrgMember();
  const orgId = profile.organization_id;
  const filters = normalizeCustomerFilters(params.filters);
  const sort: CustomerSort = params.sort || 'score';

  const baseSelect =
    'id, name, phone, channel, instagram_username, pipeline_stage, lead_temperature, lead_score, deal_value, last_interaction_at, created_at';
  const selectCols = filters.tagId ? `${baseSelect}, contact_tags!inner(tag_id)` : baseSelect;

  let query = (supabaseAdmin.from('contacts') as any)
    .select(selectCols)
    .eq('organization_id', orgId)
    .is('deleted_at', null);
  query = applyCustomerFilters(query, filters);
  query = applyCustomerSort(query, sort).limit(1000);

  const { data: rows, error } = await query;
  if (error) throw new Error(`Error exportando clientes: ${error.message}`);

  const list: any[] = rows || [];
  const header = ['Nombre', 'Teléfono', 'Canal', 'Etapa', 'Intención', 'Score', 'Valor (COP)', 'Última interacción'];
  const lines = [
    header.join(','),
    ...list.map((c) =>
      [
        sanitizeCsvField(c.name || 'Sin nombre'),
        sanitizeCsvField(c.phone || c.instagram_username || ''),
        sanitizeCsvField(c.channel || 'whatsapp'),
        sanitizeCsvField(c.pipeline_stage || 'nuevo'),
        sanitizeCsvField(c.lead_temperature || 'sin_clasificar'),
        sanitizeCsvField(c.lead_score !== null && c.lead_score !== undefined ? String(c.lead_score) : ''),
        sanitizeCsvField(c.deal_value !== null && c.deal_value !== undefined ? String(c.deal_value) : '0'),
        sanitizeCsvField(c.last_interaction_at || ''),
      ].join(',')
    ),
  ];

  return { csv: lines.join('\n'), count: list.length };
}

export async function createTagAction(input: { name: string; color?: TagColor }) {
  const { profile } = await requireOrgMember();
  const cleanName = normalizeTagName(input.name);
  if (!cleanName) throw new Error('Nombre de etiqueta inválido.');

  const color = TAG_COLORS.includes(input.color as TagColor) ? input.color! : undefined;
  const created = await TagService.ensureTags({
    organizationId: profile.organization_id,
    names: [cleanName],
    createdByAi: false,
  });

  if (color && created[0]?.id) {
    await (supabaseAdmin.from('tags') as any)
      .update({ color })
      .eq('id', created[0].id)
      .eq('organization_id', profile.organization_id);
  }

  revalidatePath('/clientes');
  revalidatePath('/inbox');
  return { success: true, tag: created[0] };
}

export async function deleteTagAction(tagId: string) {
  const { profile } = await requireOrgMember();
  const { error } = await (supabaseAdmin.from('tags') as any)
    .delete()
    .eq('id', tagId)
    .eq('organization_id', profile.organization_id);
  if (error) throw new Error(`Error eliminando etiqueta: ${error.message}`);

  revalidatePath('/clientes');
  revalidatePath('/inbox');
  return { success: true };
}

export async function assignTagsToContactsAction(input: { contactIds: string[]; tagIds: string[] }) {
  const { profile } = await requireOrgMember();
  const orgId = profile.organization_id;
  if (!input.contactIds?.length || !input.tagIds?.length) {
    throw new Error('Selecciona al menos un cliente y una etiqueta.');
  }

  // Verificar que los contactos pertenecen a la organización (Anti-IDOR)
  const { data: validContacts } = await (supabaseAdmin.from('contacts') as any)
    .select('id')
    .eq('organization_id', orgId)
    .in('id', input.contactIds.slice(0, 200));
  const validContactIds = (validContacts || []).map((c: any) => c.id);

  const { data: validTags } = await (supabaseAdmin.from('tags') as any)
    .select('id')
    .eq('organization_id', orgId)
    .in('id', input.tagIds.slice(0, 20));
  const validTagIds = (validTags || []).map((t: any) => t.id);

  const assigned = await TagService.addTagsToContacts({
    organizationId: orgId,
    contactIds: validContactIds,
    tagIds: validTagIds,
    source: 'human',
  });

  revalidatePath('/clientes');
  revalidatePath('/inbox');
  return { success: true, assigned };
}

export async function removeTagFromContactAction(input: { contactId: string; tagId: string }) {
  const { profile } = await requireOrgMember();
  await (supabaseAdmin.from('contact_tags') as any)
    .delete()
    .eq('contact_id', input.contactId)
    .eq('tag_id', input.tagId)
    .eq('organization_id', profile.organization_id);

  revalidatePath('/clientes');
  revalidatePath('/inbox');
  return { success: true };
}

export async function saveSegmentAction(input: { name: string; filters: CustomerFilters }) {
  const { user, profile } = await requireOrgMember();
  const name = String(input.name || '').trim().slice(0, 60);
  if (!name) throw new Error('Ingresa un nombre para el segmento.');

  const filters = normalizeCustomerFilters(input.filters);
  const { data, error } = await (supabaseAdmin.from('saved_segments') as any)
    .insert({
      organization_id: profile.organization_id,
      name,
      filters,
      created_by: user.id,
    })
    .select('id, name, filters, created_at')
    .single();

  if (error) throw new Error(`Error guardando segmento: ${error.message}`);
  revalidatePath('/clientes');
  revalidatePath('/campanas');
  return { success: true, segment: data as SavedSegmentRecord };
}

export async function deleteSegmentAction(segmentId: string) {
  const { profile } = await requireOrgMember();
  await (supabaseAdmin.from('saved_segments') as any)
    .delete()
    .eq('id', segmentId)
    .eq('organization_id', profile.organization_id);

  revalidatePath('/clientes');
  revalidatePath('/campanas');
  return { success: true };
}

export async function getCustomer360Action(contactId: string) {
  const { profile } = await requireOrgMember();
  const orgId = profile.organization_id;

  const { data: contact, error: contactErr } = await (supabaseAdmin.from('contacts') as any)
    .select('*')
    .eq('id', contactId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .maybeSingle();

  if (contactErr || !contact) {
    throw new Error('Cliente no encontrado o sin acceso.');
  }

  const [tagsRes, ordersRes, notesRes, campaignsRes, orgTagsRes] = await Promise.all([
    (supabaseAdmin.from('contact_tags') as any)
      .select('tag_id, source, created_at, tags(id, name, color, created_by_ai)')
      .eq('organization_id', orgId)
      .eq('contact_id', contactId),
    (supabaseAdmin.from('orders') as any)
      .select('id, items, total, status, payment_method, customer_name, customer_phone, address, city, notes, source, campaign_id, created_at, updated_at')
      .eq('organization_id', orgId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(50),
    (supabaseAdmin.from('contact_notes') as any)
      .select('id, author_id, author_name, body, created_at')
      .eq('organization_id', orgId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(50),
    (supabaseAdmin.from('campaign_recipients') as any)
      .select('id, campaign_id, status, skip_reason, message, sent_at, replied_at, converted_at, campaigns(name)')
      .eq('organization_id', orgId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(20),
    (supabaseAdmin.from('tags') as any)
      .select('id, name, color, created_by_ai')
      .eq('organization_id', orgId)
      .order('name', { ascending: true }),
  ]);

  const tags = (tagsRes.data || [])
    .filter((r: any) => r.tags?.id)
    .map((r: any) => ({
      id: r.tags.id,
      name: r.tags.name,
      color: r.tags.color || 'slate',
      source: r.source === 'ai' ? ('ai' as const) : ('human' as const),
    }));

  const orders = ordersRes.data || [];
  const validOrders = orders.filter((o: any) => o.status !== 'cancelled');
  const ltv = validOrders.reduce((acc: number, o: any) => acc + Number(o.total || 0), 0);

  return {
    contact,
    tags,
    allOrgTags: (orgTagsRes.data || []) as TagRecord[],
    orders,
    ordersCount: validOrders.length,
    ltv,
    notes: notesRes.data || [],
    campaigns: (campaignsRes.data || []).map((r: any) => ({
      id: r.id,
      campaignId: r.campaign_id,
      campaignName: r.campaigns?.name || 'Campaña',
      status: r.status,
      skipReason: r.skip_reason,
      message: r.message,
      sentAt: r.sent_at,
      repliedAt: r.replied_at,
      convertedAt: r.converted_at,
    })),
    windowOpen: isLeadWindowOpen(contact),
  };
}

export async function createManualOrderAction(input: {
  contactId: string;
  items: OrderItemInput[];
  total: number;
  status?: OrderStatus;
  paymentMethod?: string;
  address?: string;
  city?: string;
  notes?: string;
}) {
  const { user, profile } = await requireOrgMember();
  const orgId = profile.organization_id;

  const { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .select('id, name, phone, pipeline_stage, custom_fields')
    .eq('id', input.contactId)
    .eq('organization_id', orgId)
    .single();
  if (!contact) throw new Error('Cliente no encontrado.');

  const cleanItems = (input.items || [])
    .filter((i) => i.product_name && String(i.product_name).trim())
    .map((i) => ({
      product_name: String(i.product_name).trim().slice(0, 140),
      quantity: Math.max(1, Math.round(Number(i.quantity) || 1)),
      ...(i.unit_price !== undefined ? { unit_price: Math.max(0, Number(i.unit_price) || 0) } : {}),
    }));
  if (cleanItems.length === 0) throw new Error('Agrega al menos un producto o servicio al pedido.');

  const total = Math.max(0, Number(input.total) || 0);
  const status: OrderStatus = ORDER_STATUSES.includes(input.status as OrderStatus)
    ? (input.status as OrderStatus)
    : 'confirmed';

  const recorded = await OrderService.recordOrder({
    organizationId: orgId,
    contactId: contact.id,
    items: cleanItems,
    total,
    status,
    paymentMethod: input.paymentMethod?.trim() || null,
    customerName: contact.name || null,
    customerPhone: contact.phone || null,
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    notes: input.notes?.trim() || null,
    source: 'human',
    createdBy: user.id,
  });

  if (!recorded) throw new Error('No se pudo guardar el pedido.');

  // Actualizar valor comercial del contacto si el pedido está confirmado/pagado/entregado
  if (status !== 'cancelled') {
    const { data: activeOrders } = await (supabaseAdmin.from('orders') as any)
      .select('total')
      .eq('organization_id', orgId)
      .eq('contact_id', contact.id)
      .neq('status', 'cancelled');
    const ltv = (activeOrders || []).reduce((acc: number, o: any) => acc + Number(o.total || 0), 0);

    const nextCf = {
      ...(contact.custom_fields || {}),
      lead_temperature: 'hot',
      deal_value: ltv || total,
    };
    const updatePayload: Record<string, any> = {
      deal_value: ltv || total,
      custom_fields: nextCf,
      updated_at: new Date().toISOString(),
    };
    if (status === 'paid' || status === 'delivered' || status === 'confirmed') {
      updatePayload.pipeline_stage = 'ganado';
      updatePayload.closed_at = new Date().toISOString();
    }
    await (supabaseAdmin.from('contacts') as any).update(updatePayload).eq('id', contact.id);

    const itemsStr = cleanItems.map((i) => `${i.quantity}x ${i.product_name}`).join(', ');
    await (supabaseAdmin.from('messages') as any).insert({
      contact_id: contact.id,
      organization_id: orgId,
      sender_type: 'system',
      content: `[🛒 Pedido registrado por ${profile.full_name || 'Asesor'}: ${itemsStr} ($${total.toLocaleString('es-CO')} COP)]`,
    });

    await LeadScoreService.recompute(contact.id);
  }

  revalidatePath('/clientes');
  revalidatePath('/dashboard');
  revalidatePath('/pipeline');
  revalidatePath('/inbox');
  return { success: true, orderId: recorded.id };
}

export async function updateOrderStatusAction(input: { orderId: string; status: OrderStatus }) {
  const { profile } = await requireOrgMember();
  const orgId = profile.organization_id;
  if (!ORDER_STATUSES.includes(input.status)) throw new Error('Estado de pedido inválido.');

  const { data: order, error: fetchErr } = await (supabaseAdmin.from('orders') as any)
    .select('id, contact_id, total, status')
    .eq('id', input.orderId)
    .eq('organization_id', orgId)
    .single();
  if (fetchErr || !order) throw new Error('Pedido no encontrado.');

  const { error } = await (supabaseAdmin.from('orders') as any)
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq('id', order.id)
    .eq('organization_id', orgId);
  if (error) throw new Error(`Error actualizando pedido: ${error.message}`);

  // Recalcular LTV de pedidos no cancelados
  const { data: activeOrders } = await (supabaseAdmin.from('orders') as any)
    .select('total')
    .eq('organization_id', orgId)
    .eq('contact_id', order.contact_id)
    .neq('status', 'cancelled');
  const ltv = (activeOrders || []).reduce((acc: number, o: any) => acc + Number(o.total || 0), 0);

  await (supabaseAdmin.from('contacts') as any)
    .update({ deal_value: ltv, updated_at: new Date().toISOString() })
    .eq('id', order.contact_id)
    .eq('organization_id', orgId);

  revalidatePath('/clientes');
  revalidatePath('/dashboard');
  revalidatePath('/inbox');
  return { success: true, ltv };
}

export async function addContactNoteAction(input: { contactId: string; body: string }) {
  const { user, profile } = await requireOrgMember();
  const orgId = profile.organization_id;
  const cleanBody = String(input.body || '').trim().slice(0, 2000);
  if (!cleanBody) throw new Error('Escribe una nota antes de guardar.');

  const { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .select('id, custom_fields')
    .eq('id', input.contactId)
    .eq('organization_id', orgId)
    .single();
  if (!contact) throw new Error('Cliente no encontrado.');

  const { data: note, error } = await (supabaseAdmin.from('contact_notes') as any)
    .insert({
      organization_id: orgId,
      contact_id: contact.id,
      author_id: user.id,
      author_name: profile.full_name || 'Asesor',
      body: cleanBody,
    })
    .select('id, author_id, author_name, body, created_at')
    .single();

  if (error) throw new Error(`Error guardando nota: ${error.message}`);

  // Mantener espejo rápido en custom_fields.notes por retrocompatibilidad con Inbox
  const nextCf = { ...(contact.custom_fields || {}), notes: cleanBody };
  await (supabaseAdmin.from('contacts') as any)
    .update({ custom_fields: nextCf, updated_at: new Date().toISOString() })
    .eq('id', contact.id);

  revalidatePath('/clientes');
  revalidatePath('/inbox');
  return { success: true, note };
}

export async function deleteContactNoteAction(noteId: string) {
  const { profile } = await requireOrgMember();
  await (supabaseAdmin.from('contact_notes') as any)
    .delete()
    .eq('id', noteId)
    .eq('organization_id', profile.organization_id);

  revalidatePath('/clientes');
  revalidatePath('/inbox');
  return { success: true };
}

export async function previewCampaignAudienceAction(filters: CustomerFilters) {
  const { profile } = await requireOrgMember();
  const orgId = profile.organization_id;
  const normalized = normalizeCustomerFilters(filters);

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('whatsapp_provider')
    .eq('id', orgId)
    .maybeSingle();
  const provider = (org?.whatsapp_provider || 'meta') as 'meta' | 'evolution';

  const { data: rows, count, error } = await buildCampaignAudienceQuery(
    orgId,
    normalized,
    'id, name, phone, lead_score, last_lead_message_at, last_interaction_at'
  )
    .order('lead_score', { ascending: false, nullsFirst: false })
    .limit(500);

  if (error) throw new Error(`Error calculando audiencia: ${error.message}`);

  const list: any[] = rows || [];
  const metaEligibleNow =
    provider === 'meta' ? list.filter((c) => isLeadWindowOpen(c)).length : list.length;

  return {
    totalEligible: Math.min(500, Number(count || list.length)),
    metaEligibleNow,
    whatsappProvider: provider,
    sample: list.slice(0, 5).map((c) => ({
      id: c.id,
      name: c.name || 'Sin nombre',
      phone: c.phone,
      lead_score: c.lead_score ?? null,
    })),
  };
}

export async function createCampaignAction(input: {
  name: string;
  objective: string;
  filters: CustomerFilters;
  dailyCap?: number;
  includeProductPhoto?: boolean;
}) {
  const { user, profile } = await requireOrgMember();
  if (!input.name?.trim() || !input.objective?.trim() || input.objective.trim().length < 5) {
    throw new Error('Define un nombre y un objetivo claro (mínimo 5 caracteres) para la campaña.');
  }

  const created = await CampaignService.createCampaign({
    organizationId: profile.organization_id,
    createdBy: user.id,
    name: input.name,
    objective: input.objective,
    filters: input.filters,
    dailyCap: input.dailyCap,
    includeProductPhoto: input.includeProductPhoto,
  });

  revalidatePath('/campanas');
  revalidatePath('/clientes');
  return { success: true, campaignId: created.id, recipients: created.recipients };
}

export async function listCampaignsAction() {
  const { profile } = await requireOrgMember();
  const orgId = profile.organization_id;

  const [campaignsRes, recipientsRes, ordersRes] = await Promise.all([
    (supabaseAdmin.from('campaigns') as any)
      .select('id, name, objective, segment_filters, status, daily_cap, include_product_photo, created_at, started_at, completed_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50),
    (supabaseAdmin.from('campaign_recipients') as any)
      .select('campaign_id, status, replied_at, converted_at')
      .eq('organization_id', orgId),
    (supabaseAdmin.from('orders') as any)
      .select('campaign_id, total, status')
      .eq('organization_id', orgId)
      .not('campaign_id', 'is', null)
      .neq('status', 'cancelled'),
  ]);

  const statsMap = new Map<
    string,
    { total: number; pending: number; sent: number; skipped: number; failed: number; replied: number; converted: number; revenue: number }
  >();

  for (const r of recipientsRes.data || []) {
    const cur = statsMap.get(r.campaign_id) || {
      total: 0,
      pending: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      replied: 0,
      converted: 0,
      revenue: 0,
    };
    cur.total += 1;
    if (r.status === 'pending') cur.pending += 1;
    else if (r.status === 'sent') cur.sent += 1;
    else if (r.status === 'skipped') cur.skipped += 1;
    else if (r.status === 'failed') cur.failed += 1;
    if (r.replied_at) cur.replied += 1;
    if (r.converted_at) cur.converted += 1;
    statsMap.set(r.campaign_id, cur);
  }

  for (const o of ordersRes.data || []) {
    if (!o.campaign_id) continue;
    const cur = statsMap.get(o.campaign_id);
    if (cur) cur.revenue += Number(o.total || 0);
  }

  return (campaignsRes.data || []).map((c: any) => ({
    ...c,
    stats: statsMap.get(c.id) || {
      total: 0,
      pending: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      replied: 0,
      converted: 0,
      revenue: 0,
    },
  }));
}

export async function updateCampaignStatusAction(input: {
  campaignId: string;
  status: 'running' | 'paused' | 'cancelled';
}) {
  const { profile } = await requireOrgMember();
  const payload: Record<string, any> = { status: input.status };
  if (input.status === 'cancelled') payload.completed_at = new Date().toISOString();

  const { error } = await (supabaseAdmin.from('campaigns') as any)
    .update(payload)
    .eq('id', input.campaignId)
    .eq('organization_id', profile.organization_id);
  if (error) throw new Error(`Error actualizando campaña: ${error.message}`);

  revalidatePath('/campanas');
  return { success: true };
}

export async function runCampaignTickNowAction() {
  const { profile } = await requireOrgMember();
  const res = await CampaignService.processRunningCampaigns({
    organizationId: profile.organization_id,
    deadlineMs: Date.now() + 20_000,
  });
  revalidatePath('/campanas');
  return res;
}
