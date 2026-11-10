import { supabaseAdmin } from '@/lib/supabase/admin';
import { MessagingService } from '@/services/messaging.service';
import { isWithin24HourWindow } from '@/services/contact.service';
import { sleep } from '@/lib/anti-ban/cadence';
import { formatImageMessageContent } from '@/lib/media/format';
import { AI_OPERATIONAL_CONFIG } from '@/lib/ai/config';
import {
  type FollowUpCategory,
  type FollowUpSettingsConfig,
  type FollowUpStep,
  interpolateFollowUpText,
  normalizeFollowUpSettings,
  resolveLeadTemperature,
  resolveProductInterest,
} from '@/lib/ai/follow-up-types';

export interface ReactivationResult {
  processedCount: number;
  reactivationsSent: number;
  scheduledRemindersSent: number;
  skippedCurfewCount: number;
  skippedNoTemplateCount: number;
  errors: string[];
}

/**
 * Motor unificado de Seguimientos Automáticos por Embudo y Recordatorios Programados.
 * - Ejecuta pasos precargados por categoría (`hot_unclosed`, `warm`, `unresponsive`, `post_order`) con 0 tokens de IA.
 * - Procesa `scheduled_reminders` (`reminder_type = 'reactivation'`) vencidos ("escríbeme el viernes").
 * - Meta fuera de 24h: usa la plantilla aprobada vinculada al paso o salta el envío registrando auditoría.
 * - Evolution: aplica cadencia anti-ban y tope diario configurable.
 */
export class LeadReactivationService {
  private static getLocalScheduleState(businessHours: any, timeZone: string): { isAllowed: boolean } {
    try {
      const now = new Date();
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
        hour12: false,
      }).formatToParts(now);

      const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '12');
      const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
      const currentHHMM = `${String(hh === 24 ? 0 : hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      const weekdayStr = parts.find((p) => p.type === 'weekday')?.value || 'Mon';

      const weekdayToIso: Record<string, number> = {
        Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
      };
      const isoDay = weekdayToIso[weekdayStr] || 1;

      if (businessHours?.enabled) {
        const daysAllowed: number[] = Array.isArray(businessHours.days)
          ? businessHours.days
          : [1, 2, 3, 4, 5, 6];
        const startStr = businessHours.start || '08:00';
        const endStr = businessHours.end || '19:00';
        return {
          isAllowed: daysAllowed.includes(isoDay) && currentHHMM >= startStr && currentHHMM <= endStr,
        };
      }

      // Curfew comercial seguro por defecto: Lunes a Sábado 09:00 - 18:00
      return {
        isAllowed: isoDay !== 7 && hh >= 9 && hh < 18,
      };
    } catch {
      const now = new Date();
      return {
        isAllowed: now.getDay() !== 0 && now.getHours() >= 9 && now.getHours() < 18,
      };
    }
  }

  private static stepDelayMs(step: FollowUpStep): number {
    const unitMs = step.delayUnit === 'days' ? 24 * 3600 * 1000 : 3600 * 1000;
    return Math.max(1, step.delayValue) * unitMs;
  }

  public static resolveSequenceCategory(contact: any, seqConfig: FollowUpSettingsConfig): FollowUpCategory {
    if (contact.pipeline_stage === 'ganado' && seqConfig.sequences.post_order.enabled) {
      return 'post_order';
    }
    const existingCat = contact.custom_fields?.follow_up?.category;
    if (existingCat === 'qualified_doubt') {
      const qd = seqConfig.sequences.qualified_doubt;
      return qd?.enabled && qd.steps.length > 0 ? 'qualified_doubt' : 'warm';
    }
    if (
      existingCat === 'hot_unclosed' ||
      existingCat === 'warm' ||
      existingCat === 'unresponsive'
    ) {
      return existingCat;
    }
    const temp = resolveLeadTemperature(contact.custom_fields);
    if (temp === 'hot') return 'hot_unclosed';
    if (temp === 'qualified_doubt') {
      const qd = seqConfig.sequences.qualified_doubt;
      return qd?.enabled && qd.steps.length > 0 ? 'qualified_doubt' : 'warm';
    }
    if (temp === 'warm') return 'warm';
    return 'unresponsive';
  }

  /**
   * Genera el mensaje contextual de respaldo cuando la organización aún no ha configurado secuencias.
   */
  public static buildReactivationMessage(name?: string | null, customFields?: any): string {
    const cleanName = (name || '').trim();
    const isPhoneOnly = /^[+0-9\s-]+$/.test(cleanName) || cleanName.startsWith('+');
    const firstName = cleanName && !isPhoneOnly ? cleanName.split(' ')[0] : '';
    const greeting = firstName ? `¡Hola ${firstName}!` : '¡Hola!';

    const productOfInterest = resolveProductInterest(customFields);
    if (productOfInterest && productOfInterest.trim().length > 2) {
      return `${greeting} ¿Cómo estás? Quería consultar si alcanzaste a ver los detalles sobre ${productOfInterest.trim()} o si te quedó alguna inquietud para apoyarte con gusto 😊`;
    }

    return `${greeting} ¿Cómo estás? Quería consultar si tuviste oportunidad de revisar la información que te compartimos o si tienes alguna duda en la que podamos apoyarte con gusto 😊`;
  }

  /**
   * Cuenta mensajes automatizados de seguimiento enviados hoy en la organización para hacer cumplir tope diario.
   */
  private static async getTodayFollowUpsSentCount(orgId: string, timeZone: string): Promise<number> {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      // Ampliar margen -5h para cubrir desfase horario respecto a UTC
      const windowStart = new Date(startOfDay.getTime() - 6 * 3600 * 1000).toISOString();

      const { count } = await (supabaseAdmin.from('messages') as any)
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('sender_type', 'ai')
        .gte('created_at', windowStart)
        .or('content.ilike.%[Seguimiento %,content.ilike.%[Reactivación Autónoma%');

      return count || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Despacha un paso de seguimiento (texto + imágenes o plantilla Meta fuera de 24h)
   * y retorna metadatos del resultado.
   */
  private static async dispatchFollowUpStep(params: {
    org: any;
    contact: any;
    bodyMessage: string;
    imageUrls?: string[];
    metaTemplateName?: string;
    stepLabel: string;
    category?: FollowUpCategory;
    stepIndex?: number;
  }): Promise<{ sent: boolean; skippedReason?: string; error?: string }> {
    const { org, contact, bodyMessage, imageUrls = [], metaTemplateName, stepLabel, category, stepIndex } = params;
    const provider = org.whatsapp_provider || 'meta';
    const is24hOpen = isWithin24HourWindow(contact.last_interaction_at);
    const custom = (contact.custom_fields as Record<string, any>) || {};
    const targetRecipient = custom.remote_jid || custom.whatsapp_jid || contact.phone;

    let metaMessageId: string | null = null;

    if (provider === 'meta' && !is24hOpen) {
      const tplToUse = (metaTemplateName || '').trim();
      if (!tplToUse) {
        return { sent: false, skippedReason: 'meta_outside_24h_no_template' };
      }
      try {
        metaMessageId = await MessagingService.sendTemplateMessage({
          organization: org,
          to: contact.phone,
          templateKey: tplToUse,
          templateName: tplToUse,
        });
      } catch (tplErr: any) {
        return { sent: false, error: `Fallo plantilla Meta (${tplToUse}) a ${contact.phone}: ${tplErr?.message}` };
      }
    } else {
      try {
        metaMessageId = await MessagingService.sendTextMessage({
          organization: org,
          to: targetRecipient,
          body: bodyMessage,
          simulateTyping: false,
          isColdOutbound: true,
        });

        for (const imgUrl of imageUrls.slice(0, 3)) {
          try {
            const imgId = await MessagingService.sendMediaMessage({
              organization: org,
              to: targetRecipient,
              mediaUrl: imgUrl,
              mediaType: 'image',
            });
            await (supabaseAdmin.from('messages') as any).insert({
              contact_id: contact.id,
              organization_id: org.id,
              sender_type: 'ai',
              content: formatImageMessageContent(imgUrl, ''),
              status: 'sent',
              channel: 'whatsapp',
              meta_message_id: imgId || null,
            });
          } catch (imgErr: any) {
            console.warn('[FOLLOWUP IMAGE SEND WARN]', imgErr?.message || imgErr);
          }
        }
      } catch (msgErr: any) {
        return { sent: false, error: `Fallo envío a ${contact.phone}: ${msgErr?.message}` };
      }
    }

    await (supabaseAdmin.from('messages') as any).insert({
      contact_id: contact.id,
      organization_id: org.id,
      sender_type: 'ai',
      content: `🤖 [${stepLabel}${category ? ` · ${category}` : ''}${stepIndex !== undefined ? ` #${stepIndex + 1}` : ''}]: "${bodyMessage}"`,
      status: 'sent',
      channel: 'whatsapp',
      meta_message_id: metaMessageId || null,
    });

    return { sent: true };
  }

  /**
   * Escanea todas las organizaciones activas y procesa:
   * 1) Recordatorios programados vencidos (`scheduled_reminders` tipo `reactivation`).
   * 2) Secuencias automáticas por embudo según categoría e historial.
   */
  static async processAutonomousLeadReactivations(specificOrgId?: string): Promise<ReactivationResult> {
    const result: ReactivationResult = {
      processedCount: 0,
      reactivationsSent: 0,
      scheduledRemindersSent: 0,
      skippedCurfewCount: 0,
      skippedNoTemplateCount: 0,
      errors: [],
    };

    const now = new Date();
    const nowTime = now.getTime();
    const nowIso = now.toISOString();

    let orgsQuery = (supabaseAdmin.from('organizations') as any)
      .select(`
        id,
        name,
        is_active,
        subscription_status,
        whatsapp_provider,
        whatsapp_phone_number_id,
        whatsapp_access_token,
        evolution_api_url,
        evolution_api_key,
        evolution_instance_name,
        evolution_status,
        evolution_anti_ban_mode,
        evolution_max_outbound_per_hour,
        appointment_settings,
        business_hours
      `);

    if (specificOrgId) {
      orgsQuery = orgsQuery.eq('id', specificOrgId);
    }

    const { data: orgs, error: orgsErr } = await orgsQuery;
    if (orgsErr) {
      result.errors.push(`Error consultando organizaciones: ${orgsErr.message}`);
      return result;
    }
    if (!orgs || orgs.length === 0) return result;

    for (const org of orgs) {
      if (org.is_active === false) continue;
      if (org.subscription_status && org.subscription_status !== 'active' && org.subscription_status !== 'trialing') {
        continue;
      }

      const timeZone =
        org.appointment_settings?.timezone ||
        org.business_hours?.timezone ||
        AI_OPERATIONAL_CONFIG.defaultTimezone;

      const scheduleState = this.getLocalScheduleState(org.business_hours, timeZone);
      if (!scheduleState.isAllowed) {
        result.skippedCurfewCount++;
        continue;
      }

      if (org.appointment_settings?.autonomous_reactivation_enabled === false) {
        continue;
      }

      const hasMeta = Boolean(org.whatsapp_phone_number_id && org.whatsapp_access_token);
      const hasEvolution = Boolean(org.evolution_api_url && org.evolution_api_key && org.evolution_instance_name);
      if (!hasMeta && !hasEvolution) continue;

      const seqConfig = normalizeFollowUpSettings(org.appointment_settings?.follow_up_sequences);
      const hasCustomSequences = Object.values(seqConfig.sequences).some((s) => s.enabled && s.steps.length > 0);
      const dailyCap = seqConfig.dailyCap || 40;
      let sentToday = await this.getTodayFollowUpsSentCount(org.id, timeZone);

      // -----------------------------------------------------------
      // A. Procesar recordatorios programados vencidos (scheduled_reminders)
      // -----------------------------------------------------------
      const { data: dueReminders } = await (supabaseAdmin.from('scheduled_reminders') as any)
        .select('id, contact_id, scheduled_for, reminder_type, status')
        .eq('reminder_type', 'reactivation')
        .eq('status', 'pending')
        .lte('scheduled_for', nowIso)
        .order('scheduled_for', { ascending: true })
        .limit(250);

      const processedContactIds = new Set<string>();

      if (dueReminders && dueReminders.length > 0) {
        const contactIds = Array.from(new Set(dueReminders.map((r: any) => r.contact_id)));
        const { data: remContacts } = await (supabaseAdmin.from('contacts') as any)
          .select('id, organization_id, name, phone, pipeline_stage, is_ai_active, last_interaction_at, custom_fields, unread_count, waiting_since, conversation_status, deal_value')
          .eq('organization_id', org.id)
          .in('id', contactIds)
          .is('deleted_at', null);

        const cMap = new Map<string, any>((remContacts || []).map((c: any) => [c.id, c]));

        for (const rem of dueReminders) {
          if (sentToday >= dailyCap) break;
          const contact = cMap.get(rem.contact_id);
          if (!contact || !contact.phone) continue;

          const cf = (contact.custom_fields as Record<string, any>) || {};
          if (cf.opted_out === true || cf.follow_up?.paused === true) {
            await (supabaseAdmin.from('scheduled_reminders') as any)
              .update({ status: 'cancelled' })
              .eq('id', rem.id);
            continue;
          }
          if (contact.is_ai_active === false || contact.conversation_status === 'closed' || (contact.unread_count || 0) > 0 || contact.waiting_since) {
            continue;
          }
          if (contact.pipeline_stage === 'ganado' || contact.pipeline_stage === 'perdido') {
            await (supabaseAdmin.from('scheduled_reminders') as any)
              .update({ status: 'cancelled' })
              .eq('id', rem.id);
            continue;
          }

          result.processedCount++;
          const category = this.resolveSequenceCategory(contact, seqConfig);
          const steps = seqConfig.sequences[category]?.steps || [];
          const currentStepIdx = Math.min(Number(cf.follow_up?.currentStepIndex || 0), Math.max(0, steps.length - 1));
          const step: FollowUpStep | undefined = steps[currentStepIdx];

          const rawText = step?.text || this.buildReactivationMessage(contact.name, cf);
          const bodyMessage = interpolateFollowUpText(rawText, {
            contactName: contact.name,
            productName: resolveProductInterest(cf, contact.deal_value),
            companyName: org.name,
          });

          const dispatch = await this.dispatchFollowUpStep({
            org,
            contact,
            bodyMessage,
            imageUrls: step?.imageUrls,
            metaTemplateName: step?.metaTemplateName,
            stepLabel: 'Seguimiento Agendado',
            category,
            stepIndex: currentStepIdx,
          });

          if (dispatch.skippedReason === 'meta_outside_24h_no_template') {
            result.skippedNoTemplateCount++;
            await (supabaseAdmin.from('contacts') as any)
              .update({
                custom_fields: { ...cf, follow_up_last_skipped: 'meta_outside_24h_no_template' },
              })
              .eq('id', contact.id);
            continue;
          }

          if (dispatch.error) {
            result.errors.push(dispatch.error);
            continue;
          }

          if (dispatch.sent) {
            sentToday++;
            result.reactivationsSent++;
            result.scheduledRemindersSent++;
            processedContactIds.add(contact.id);

            await (supabaseAdmin.from('scheduled_reminders') as any)
              .update({ status: 'sent' })
              .eq('id', rem.id);

            const nextIndex = currentStepIdx + 1;
            const nextStep = steps[nextIndex];
            const updatedCf: Record<string, any> = {
              ...cf,
              follow_up: {
                ...(cf.follow_up || {}),
                category,
                currentStepIndex: nextIndex,
                lastSentAt: nowIso,
                ...(nextStep ? { nextSendAt: new Date(nowTime + this.stepDelayMs(nextStep)).toISOString() } : {}),
                completed: !nextStep,
              },
            };
            delete updatedCf.active_reminder;
            if (!nextStep) delete updatedCf.follow_up.nextSendAt;

            await (supabaseAdmin.from('contacts') as any)
              .update({
                custom_fields: updatedCf,
                last_interaction_at: nowIso,
                updated_at: nowIso,
                last_message_sender: 'ai',
                last_message_preview: bodyMessage.slice(0, 160),
              })
              .eq('id', contact.id);

            if ((org.whatsapp_provider || 'meta') === 'evolution') {
              await sleep(2000 + Math.floor(Math.random() * 1500));
            }
          }
        }
      }

      // -----------------------------------------------------------
      // B. Secuencias por Embudo (si el interruptor follow_up_sequences está activo)
      //    o respaldo legado si no hay secuencias configuradas todavía
      // -----------------------------------------------------------
      if (!seqConfig.enabled && hasCustomSequences) {
        // La organización configuró secuencias pero apagó explícitamente el interruptor
        continue;
      }

      const PAGE_SIZE = 100;
      const MAX_SCAN = 500;
      const eligibleQueue: Array<{
        contact: any;
        category: FollowUpCategory;
        stepIndex: number;
        step?: FollowUpStep;
      }> = [];

      for (let offset = 0; offset < MAX_SCAN; offset += PAGE_SIZE) {
        const { data: candidates, error: candErr } = await (supabaseAdmin.from('contacts') as any)
          .select('id, name, phone, pipeline_stage, is_ai_active, last_interaction_at, custom_fields, unread_count, last_message, waiting_since, last_message_sender, conversation_status, deal_value')
          .eq('organization_id', org.id)
          .eq('is_ai_active', true)
          .is('deleted_at', null)
          .not('phone', 'is', null)
          .neq('conversation_status', 'closed')
          .neq('pipeline_stage', 'perdido')
          .neq('pipeline_stage', 'cita_agendada')
          .order('last_interaction_at', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (candErr) {
          result.errors.push(`Error consultando leads org ${org.id}: ${candErr.message}`);
          break;
        }
        if (!candidates || candidates.length === 0) break;

        for (const contact of candidates) {
          if (processedContactIds.has(contact.id)) continue;
          if (!contact.phone || contact.phone.trim().length < 8) continue;

          const cf = (contact.custom_fields as Record<string, any>) || {};
          if (cf.opted_out === true || cf.follow_up?.paused === true || cf.follow_up?.completed === true) continue;
          if ((contact.unread_count || 0) > 0 || contact.waiting_since) continue;

          const effectiveSender =
            contact.last_message_sender ||
            contact.last_message?.sender_type ||
            cf.last_message?.sender_type;
          if (effectiveSender === 'lead') continue;

          if (!contact.last_interaction_at) continue;
          const lastTime = new Date(contact.last_interaction_at).getTime();
          if (isNaN(lastTime)) continue;

          // Modo Secuencias Configuradas
          if (seqConfig.enabled) {
            const category = this.resolveSequenceCategory(contact, seqConfig);
            const catConfig = seqConfig.sequences[category];
            if (!catConfig || !catConfig.enabled || catConfig.steps.length === 0) continue;

            if (contact.pipeline_stage === 'ganado' && category !== 'post_order') continue;

            const stepIndex = Number(cf.follow_up?.currentStepIndex || 0);
            const step = catConfig.steps[stepIndex];
            if (!step) continue;

            const dueTime = cf.follow_up?.nextSendAt
              ? new Date(cf.follow_up.nextSendAt).getTime()
              : lastTime + this.stepDelayMs(step);

            if (nowTime >= dueTime) {
              eligibleQueue.push({ contact, category, stepIndex, step });
            }
          } else {
            // Modo Respaldo Legado (1-toque entre 24h y 240h) si aún no ha activado secuencias personalizadas
            if (contact.pipeline_stage === 'ganado') continue;
            if (cf.reactivation_attempted === true || cf.reactivation_sent_at) continue;
            if (resolveLeadTemperature(cf) === 'cold') continue;

            const hoursElapsed = (nowTime - lastTime) / (1000 * 3600);
            if (hoursElapsed >= 24 && hoursElapsed <= 240) {
              eligibleQueue.push({ contact, category: 'unresponsive', stepIndex: 0 });
            }
          }
        }

        if (candidates.length < PAGE_SIZE) break;
      }

      // Priorizar leads calientes primero, respetar tope por corrida/día
      eligibleQueue.sort((a, b) => {
        const rank = (cat: FollowUpCategory) => (cat === 'hot_unclosed' ? 0 : cat === 'warm' ? 1 : cat === 'post_order' ? 2 : 3);
        return rank(a.category) - rank(b.category);
      });

      const remainingToday = Math.max(0, dailyCap - sentToday);
      const batchLimit = Math.min(remainingToday, (org.whatsapp_provider || 'meta') === 'evolution' ? 8 : 20);
      const batchToProcess = eligibleQueue.slice(0, batchLimit);

      for (const item of batchToProcess) {
        const { contact, category, stepIndex, step } = item;
        const cf = (contact.custom_fields as Record<string, any>) || {};
        result.processedCount++;

        const bodyMessage = step
          ? interpolateFollowUpText(step.text, {
              contactName: contact.name,
              productName: resolveProductInterest(cf, contact.deal_value),
              companyName: org.name,
            })
          : this.buildReactivationMessage(contact.name, cf);

        const dispatch = await this.dispatchFollowUpStep({
          org,
          contact,
          bodyMessage,
          imageUrls: step?.imageUrls,
          metaTemplateName: step?.metaTemplateName,
          stepLabel: step ? 'Seguimiento Embudo' : 'Reactivación Autónoma 1-Toque',
          category,
          stepIndex,
        });

        if (dispatch.skippedReason === 'meta_outside_24h_no_template') {
          result.skippedNoTemplateCount++;
          await (supabaseAdmin.from('contacts') as any)
            .update({
              custom_fields: { ...cf, follow_up_last_skipped: 'meta_outside_24h_no_template' },
            })
            .eq('id', contact.id);
          continue;
        }

        if (dispatch.error) {
          result.errors.push(dispatch.error);
          continue;
        }

        if (dispatch.sent) {
          sentToday++;
          result.reactivationsSent++;

          const steps = seqConfig.sequences[category]?.steps || [];
          const nextIdx = stepIndex + 1;
          const nextStep = steps[nextIdx];
          const isSequenceDone = step ? !nextStep : true;

          const updatedCustom: Record<string, any> = {
            ...cf,
            follow_up_last_skipped: null,
            ...(step
              ? {
                  follow_up: {
                    category,
                    currentStepIndex: nextIdx,
                    lastSentAt: nowIso,
                    nextSendAt: nextStep ? new Date(nowTime + this.stepDelayMs(nextStep)).toISOString() : null,
                    completed: isSequenceDone,
                    completedAt: isSequenceDone ? nowIso : undefined,
                  },
                }
              : {
                  reactivation_attempted: true,
                  reactivation_sent_at: nowIso,
                  reactivation_type: 'autonomous_cron',
                }),
          };

          if (updatedCustom.active_reminder?.reminderType === 'reactivation') {
            delete updatedCustom.active_reminder;
          }

          await (supabaseAdmin.from('contacts') as any)
            .update({
              custom_fields: updatedCustom,
              last_interaction_at: nowIso,
              updated_at: nowIso,
              last_message_sender: 'ai',
              last_message_preview: bodyMessage.slice(0, 160),
            })
            .eq('id', contact.id);

          try {
            await (supabaseAdmin.from('scheduled_reminders') as any)
              .update({ status: 'cancelled' })
              .eq('contact_id', contact.id)
              .eq('reminder_type', 'reactivation')
              .eq('status', 'pending');
          } catch {}

          if ((org.whatsapp_provider || 'meta') === 'evolution') {
            await sleep(2200 + Math.floor(Math.random() * 1500));
          }
        }
      }
    }

    return result;
  }

  /**
   * Al completar la secuencia (o reactivación legada) y pasar 48h sin respuesta del cliente,
   * marca temperatura `cold` y archiva en Cerrados para mantener el Inbox limpio.
   */
  static async processAutoArchiveUnresponsiveReactivations(
    specificOrgId?: string
  ): Promise<{ autoArchivedCount: number; markedColdCount: number; errors: string[] }> {
    const result = { autoArchivedCount: 0, markedColdCount: 0, errors: [] as string[] };
    const PAGE_SIZE = 100;

    for (let offset = 0; offset < 500; offset += PAGE_SIZE) {
      let query = (supabaseAdmin.from('contacts') as any)
        .select('id, name, phone, organization_id, pipeline_stage, custom_fields, unread_count, waiting_since, conversation_status')
        .neq('conversation_status', 'closed')
        .is('deleted_at', null)
        .range(offset, offset + PAGE_SIZE - 1);

      if (specificOrgId) {
        query = query.eq('organization_id', specificOrgId);
      }

      const { data: contacts, error } = await query;
      if (error) {
        result.errors.push(`Error consultando auto-archivo: ${error.message}`);
        break;
      }
      if (!contacts || contacts.length === 0) break;

      for (const contact of contacts) {
        const cf = (contact.custom_fields as Record<string, any>) || {};
        const isLegacyDone = cf.reactivation_attempted === true && cf.reactivation_sent_at;
        const isSeqDone = cf.follow_up?.completed === true && (cf.follow_up?.completedAt || cf.follow_up?.lastSentAt);
        if (!isLegacyDone && !isSeqDone) continue;
        if (contact.pipeline_stage === 'ganado') continue;

        const refIso = cf.follow_up?.completedAt || cf.follow_up?.lastSentAt || cf.reactivation_sent_at;
        const sentTime = new Date(refIso).getTime();
        if (isNaN(sentTime)) continue;

        const isPast48h = Date.now() - sentTime >= 48 * 3600 * 1000;
        const unread = contact.unread_count || 0;

        if (isPast48h && unread === 0 && !contact.waiting_since) {
          try {
            const wasCold = resolveLeadTemperature(cf) === 'cold';
            const updatedCustom: Record<string, any> = {
              ...cf,
              lead_temperature: 'cold',
              conversation_status: 'closed',
              closed_reason_label: 'Sin respuesta tras secuencia de seguimiento',
              closed_by: 'Sistema (Auto-Archivo)',
            };
            delete updatedCustom.temperature;

            await (supabaseAdmin.from('contacts') as any)
              .update({
                conversation_status: 'closed',
                closed_at: new Date().toISOString(),
                close_reason: 'sin_respuesta_post_seguimiento',
                custom_fields: updatedCustom,
                updated_at: new Date().toISOString(),
              })
              .eq('id', contact.id);

            await (supabaseAdmin.from('messages') as any).insert({
              contact_id: contact.id,
              sender_type: 'system',
              content:
                '[❄️ Marca automática Frío & Archivada tras finalizar secuencia de seguimiento 48h sin respuesta]',
            });

            if (!wasCold) result.markedColdCount++;
            result.autoArchivedCount++;
          } catch (itemErr: any) {
            result.errors.push(`Error auto-archivando ${contact.id}: ${itemErr.message}`);
          }
        }
      }

      if (contacts.length < PAGE_SIZE) break;
    }

    return result;
  }
}
