import { supabaseAdmin } from '@/lib/supabase/admin';
import { sleep } from '@/lib/anti-ban/cadence';
import { AI_OPERATIONAL_CONFIG } from '@/lib/ai/config';
import { applyCustomerFilters, normalizeCustomerFilters, type CustomerFilters } from '@/lib/crm/customer-filters';
import { isLeadWindowOpen } from '@/services/contact.service';
import { LeadReactivationService } from '@/services/reactivation.service';

/** Máximo de destinatarios por campaña (protege reputación del número y costo de IA). */
export const MAX_CAMPAIGN_RECIPIENTS = 500;
/** Atribución de respuestas: cuenta como respuesta si el cliente escribe hasta 7 días después. */
const REPLY_ATTRIBUTION_DAYS = 7;
/** No enviar campaña a quien ya recibió un mensaje automático en las últimas N horas. */
const CONTACT_COOLDOWN_HOURS = 24;

const ORG_SEND_COLUMNS = `
  id, name, is_active, subscription_status, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token,
  evolution_api_url, evolution_api_key, evolution_instance_name, evolution_status, evolution_anti_ban_mode,
  evolution_max_outbound_per_hour, appointment_settings, business_hours, system_prompt, structured_prompt_data, ai_provider
`;

const CONTACT_COLUMNS =
  'id, organization_id, name, phone, channel, pipeline_stage, is_ai_active, last_interaction_at, last_lead_message_at, lead_score, custom_fields, unread_count, waiting_since, deal_value, deleted_at';

export interface CampaignRunResult {
  campaignsProcessed: number;
  sent: number;
  skipped: number;
  failed: number;
  completed: number;
}

/**
 * Consulta base de destinatarios elegibles para campañas:
 * WhatsApp, con teléfono, sin opt-out, no eliminados y no perdidos.
 */
export function buildCampaignAudienceQuery(organizationId: string, filters: CustomerFilters, select = 'id') {
  const normalized = normalizeCustomerFilters(filters);
  const selectCols = normalized.tagId ? `${select}, contact_tags!inner(tag_id)` : select;
  let q = (supabaseAdmin.from('contacts') as any)
    .select(selectCols, { count: 'exact' })
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .not('phone', 'is', null)
    .neq('channel', 'instagram')
    .neq('pipeline_stage', 'perdido')
    .or('custom_fields->>opted_out.is.null,custom_fields->>opted_out.neq.true');
  q = applyCustomerFilters(q, { ...normalized, channel: 'all' });
  return q;
}

export class CampaignService {
  /** Crea la campaña y congela la lista de destinatarios (snapshot) según el segmento. */
  static async createCampaign(params: {
    organizationId: string;
    createdBy: string;
    name: string;
    objective: string;
    filters: CustomerFilters;
    dailyCap?: number;
    includeProductPhoto?: boolean;
  }): Promise<{ id: string; recipients: number }> {
    const filters = normalizeCustomerFilters(params.filters);
    const { data: audience, error: audErr } = await buildCampaignAudienceQuery(params.organizationId, filters)
      .order('lead_score', { ascending: false, nullsFirst: false })
      .limit(MAX_CAMPAIGN_RECIPIENTS);
    if (audErr) throw new Error(`Error calculando audiencia: ${audErr.message}`);
    const contactIds = Array.from(new Set((audience || []).map((c: any) => c.id as string)));
    if (contactIds.length === 0) throw new Error('El segmento no tiene clientes elegibles (WhatsApp, sin opt-out).');

    const { data: campaign, error } = await (supabaseAdmin.from('campaigns') as any)
      .insert({
        organization_id: params.organizationId,
        name: params.name.trim().slice(0, 80),
        objective: params.objective.trim().slice(0, 600),
        segment_filters: filters,
        status: 'running',
        daily_cap: Math.max(1, Math.min(500, Math.round(params.dailyCap || 60))),
        include_product_photo: params.includeProductPhoto !== false,
        created_by: params.createdBy,
      })
      .select('id')
      .single();
    if (error || !campaign) throw new Error(`Error creando campaña: ${error?.message}`);

    const rows = contactIds.map((contactId) => ({
      campaign_id: campaign.id,
      organization_id: params.organizationId,
      contact_id: contactId,
      status: 'pending',
    }));
    for (let i = 0; i < rows.length; i += 250) {
      const { error: insErr } = await (supabaseAdmin.from('campaign_recipients') as any).insert(rows.slice(i, i + 250));
      if (insErr) throw new Error(`Error guardando destinatarios: ${insErr.message}`);
    }

    return { id: campaign.id, recipients: contactIds.length };
  }

  /** Marca respuesta del cliente a una campaña reciente (llamado en cada mensaje entrante). */
  static async markReplied(contactId: string): Promise<void> {
    try {
      const sinceIso = new Date(Date.now() - REPLY_ATTRIBUTION_DAYS * 24 * 3600 * 1000).toISOString();
      await (supabaseAdmin.from('campaign_recipients') as any)
        .update({ replied_at: new Date().toISOString() })
        .eq('contact_id', contactId)
        .eq('status', 'sent')
        .is('replied_at', null)
        .gte('sent_at', sinceIso);
    } catch (err: any) {
      console.warn('[CAMPAIGN] markReplied falló', err?.message || err);
    }
  }

  private static async markRecipient(id: string, patch: Record<string, any>) {
    await (supabaseAdmin.from('campaign_recipients') as any).update(patch).eq('id', id);
  }

  /**
   * Procesa campañas activas (llamado desde el cron cada 15 min).
   * Respeta horario comercial, tope diario de la campaña, tope horario anti-ban compartido
   * con el recontacto, enfriamiento por contacto y ventana 24h de Meta.
   */
  static async processRunningCampaigns(params: { organizationId?: string; deadlineMs?: number } = {}): Promise<CampaignRunResult> {
    const deadline = params.deadlineMs ?? Date.now() + 20_000;
    const result: CampaignRunResult = { campaignsProcessed: 0, sent: 0, skipped: 0, failed: 0, completed: 0 };

    let cq = (supabaseAdmin.from('campaigns') as any)
      .select('id, organization_id, name, objective, daily_cap, include_product_photo')
      .eq('status', 'running')
      .order('started_at', { ascending: true })
      .limit(10);
    if (params.organizationId) cq = cq.eq('organization_id', params.organizationId);
    const { data: campaigns } = await cq;
    if (!campaigns || campaigns.length === 0) return result;

    const orgCache = new Map<string, any>();

    for (const campaign of campaigns) {
      if (Date.now() >= deadline) break;
      result.campaignsProcessed++;

      let org = orgCache.get(campaign.organization_id);
      if (!org) {
        const { data } = await (supabaseAdmin.from('organizations') as any)
          .select(ORG_SEND_COLUMNS)
          .eq('id', campaign.organization_id)
          .maybeSingle();
        org = data;
        orgCache.set(campaign.organization_id, org);
      }
      if (!org || org.is_active === false) continue;
      if (org.subscription_status && org.subscription_status !== 'active' && org.subscription_status !== 'trialing') continue;

      const timeZone =
        org.appointment_settings?.timezone || org.business_hours?.timezone || AI_OPERATIONAL_CONFIG.defaultTimezone;
      if (!LeadReactivationService.getLocalScheduleState(org.business_hours, timeZone).isAllowed) continue;

      const provider = org.whatsapp_provider || 'meta';
      const isEvolution = provider === 'evolution';
      const hourlyCap = isEvolution && org.evolution_anti_ban_mode !== false
        ? Math.max(1, Number(org.evolution_max_outbound_per_hour || 20))
        : 500;
      const perRunCap = isEvolution ? 5 : 15;

      const dayAgoIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { count: sentLast24h } = await (supabaseAdmin.from('campaign_recipients') as any)
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .eq('status', 'sent')
        .gte('sent_at', dayAgoIso);
      let remainingDaily = Math.max(0, Number(campaign.daily_cap || 60) - (sentLast24h || 0));
      let sentThisHour = await LeadReactivationService.getRecentHourlyFollowUpsCount(org.id);

      const { data: pending } = await (supabaseAdmin.from('campaign_recipients') as any)
        .select('id, contact_id')
        .eq('campaign_id', campaign.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(perRunCap * 3);

      if (!pending || pending.length === 0) {
        await (supabaseAdmin.from('campaigns') as any)
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', campaign.id)
          .eq('status', 'running');
        result.completed++;
        continue;
      }

      let sentThisRun = 0;
      for (const rec of pending) {
        if (Date.now() >= deadline) break;
        if (remainingDaily <= 0 || sentThisHour >= hourlyCap || sentThisRun >= perRunCap) break;

        const { data: contact } = await (supabaseAdmin.from('contacts') as any)
          .select(CONTACT_COLUMNS)
          .eq('id', rec.contact_id)
          .eq('organization_id', org.id)
          .maybeSingle();

        const cf = (contact?.custom_fields as Record<string, any>) || {};
        let skipReason: string | null = null;
        if (!contact || contact.deleted_at) skipReason = 'contact_removed';
        else if (cf.opted_out === true) skipReason = 'opted_out';
        else if (!contact.phone || contact.phone.trim().length < 8) skipReason = 'no_phone';
        else if (contact.pipeline_stage === 'perdido') skipReason = 'lost';
        else if ((contact.unread_count || 0) > 0 || contact.waiting_since) skipReason = 'customer_waiting_reply';
        else if (provider === 'meta' && !isLeadWindowOpen(contact)) skipReason = 'meta_outside_24h';
        else if (await LeadReactivationService.hasRecentFollowUpForContact(contact.id, CONTACT_COOLDOWN_HOURS))
          skipReason = 'recent_automated_message';

        if (skipReason) {
          await this.markRecipient(rec.id, { status: 'skipped', skip_reason: skipReason });
          result.skipped++;
          continue;
        }

        try {
          // El objetivo de la campaña se inyecta como "motivo del recontacto": la IA redacta un mensaje
          // personalizado con nombre, producto de interés, objeción previa, score y reglas del negocio.
          const payload = await LeadReactivationService.resolveAutonomousFollowUpPayload({
            org,
            contact,
            cf: { ...cf, active_reminder: { note: `Campaña "${campaign.name}": ${campaign.objective}` } },
            existingImageUrls: [],
          });
          const imageUrls = campaign.include_product_photo ? payload.imageUrls : [];

          const dispatch = await LeadReactivationService.dispatchFollowUpStep({
            org,
            contact,
            bodyMessage: payload.bodyMessage,
            imageUrls,
            stepLabel: `Campaña · ${campaign.name}`,
          });

          if (dispatch.sent) {
            await this.markRecipient(rec.id, {
              status: 'sent',
              message: payload.bodyMessage.slice(0, 1000),
              sent_at: new Date().toISOString(),
            });
            result.sent++;
            sentThisRun++;
            sentThisHour++;
            remainingDaily--;
            if (isEvolution) await sleep(2500 + Math.floor(Math.random() * 2000));
          } else {
            await this.markRecipient(rec.id, {
              status: dispatch.skippedReason ? 'skipped' : 'failed',
              skip_reason: dispatch.skippedReason || null,
              error: dispatch.error?.slice(0, 500) || null,
            });
            if (dispatch.skippedReason) result.skipped++;
            else result.failed++;
          }
        } catch (err: any) {
          await this.markRecipient(rec.id, { status: 'failed', error: String(err?.message || err).slice(0, 500) });
          result.failed++;
        }
      }
    }

    return result;
  }
}
