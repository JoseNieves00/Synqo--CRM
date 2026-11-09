import { supabaseAdmin } from '@/lib/supabase/admin';
import { MessagingService } from '@/services/messaging.service';
import { isWithin24HourWindow } from '@/services/contact.service';

export interface ReactivationResult {
  processedCount: number;
  reactivationsSent: number;
  skippedCurfewCount: number;
  errors: string[];
}

/**
 * Servicio de Reactivación Autónoma de Leads Fríos (Blindaje Anti-Spam Estricto)
 * - Regla 1: 1 solo intento por prospecto (reactivation_attempted: true de por vida si no contesta).
 * - Regla 2: Curfew comercial estricto (únicamente lunes a sábado de 9:00 AM a 6:00 PM).
 * - Regla 3: Filtro de inactividad de 24h a 240h (10 días) en etapas activas (no ganado/perdido).
 * - Regla 4: Respeto al canal de WhatsApp (Plantilla oficial en Meta si expiró 24h, o texto plano en Evolution).
 */
export class LeadReactivationService {
  private static DEFAULT_TIMEZONE = 'America/Bogota';

  /**
   * Obtiene la hora actual (0-23), minutos y día de la semana (0: domingo, 6: sábado) en la zona del negocio
   */
  private static getLocalTimeInfo(timeZone: string = this.DEFAULT_TIMEZONE) {
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: 'numeric',
        minute: 'numeric',
        weekday: 'short',
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      const hourPart = parts.find((p) => p.type === 'hour')?.value;
      const minutePart = parts.find((p) => p.type === 'minute')?.value;
      const hour = hourPart ? parseInt(hourPart, 10) : now.getHours();
      const minute = minutePart ? parseInt(minutePart, 10) : now.getMinutes();

      const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' });
      const weekdayStr = dayFormatter.format(now); // "Sun", "Mon", "Tue", etc.
      const isSunday = weekdayStr === 'Sun';

      return { hour, minute, isSunday };
    } catch {
      return { hour: new Date().getHours(), minute: new Date().getMinutes(), isSunday: new Date().getDay() === 0 };
    }
  }

  /**
   * Genera el mensaje de reactivación contextual y humano
   */
  public static buildReactivationMessage(name?: string | null, customFields?: any): string {
    const cleanName = (name || '').trim();
    const isPhoneOnly = /^[+0-9\s-]+$/.test(cleanName) || cleanName.startsWith('+');
    const firstName = cleanName && !isPhoneOnly ? cleanName.split(' ')[0] : '';
    const greeting = firstName ? `¡Hola ${firstName}!` : '¡Hola!';

    const productOfInterest = customFields?.ai_summary?.product_of_interest;
    if (productOfInterest && typeof productOfInterest === 'string' && productOfInterest.trim().length > 2) {
      return `${greeting} ¿Cómo estás? Quería consultar si alcanzaste a ver los detalles sobre ${productOfInterest.trim()} o si te quedó alguna inquietud para apoyarte con gusto 😊`;
    }

    return `${greeting} ¿Cómo estás? Quería consultar si tuviste oportunidad de revisar la información que te compartimos o si tienes alguna duda en la que podamos apoyarte con gusto 😊`;
  }

  /**
   * Ejecuta el proceso de escaneo y despacho de reactivaciones autónomas
   */
  static async processAutonomousLeadReactivations(specificOrgId?: string): Promise<ReactivationResult> {
    const result: ReactivationResult = {
      processedCount: 0,
      reactivationsSent: 0,
      skippedCurfewCount: 0,
      errors: [],
    };

    const now = new Date();
    const nowTime = now.getTime();

    // 1. Obtener organizaciones candidatas con WhatsApp configurado
    let orgsQuery = (supabaseAdmin.from('organizations') as any)
      .select(`
        id,
        name,
        whatsapp_provider,
        whatsapp_phone_number_id,
        whatsapp_access_token,
        evolution_api_url,
        evolution_api_key,
        evolution_instance_name,
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

    if (!orgs || orgs.length === 0) {
      return result;
    }

    for (const org of orgs) {
      // 🛡️ REGLA OPERATIVA DE RESPETO Y CURFEW NOCTURNO:
      // Solo despachar de Lunes a Sábado entre 9:00 AM y 6:00 PM (18:00)
      const timeZone = org.appointment_settings?.timezone || org.business_hours?.timezone || this.DEFAULT_TIMEZONE;
      const { hour, isSunday } = this.getLocalTimeInfo(timeZone);

      // Si es domingo o fuera del horario comercial (9:00 AM - 6:00 PM)
      if (isSunday || hour < 9 || hour >= 18) {
        result.skippedCurfewCount++;
        continue;
      }

      // Si la organización desactivó expresamente la reactivación automática
      if (org.appointment_settings?.autonomous_reactivation_enabled === false) {
        continue;
      }

      // Validar conexión a WhatsApp
      const hasMeta = Boolean(org.whatsapp_phone_number_id && org.whatsapp_access_token);
      const hasEvolution = Boolean(org.evolution_api_url && org.evolution_api_key && org.evolution_instance_name);
      if (!hasMeta && !hasEvolution) {
        continue;
      }

      // 2. Buscar prospectos candidatos en esta organización:
      // - Etapa NO es ganado, perdido ni cita agendada
      // - Teléfono válido
      // - IA activa
      const { data: candidates, error: candErr } = await (supabaseAdmin.from('contacts') as any)
        .select('id, name, phone, pipeline_stage, is_ai_active, last_interaction_at, custom_fields, unread_count, last_message, waiting_since, last_message_sender')
        .eq('organization_id', org.id)
        .not('phone', 'is', null)
        .neq('pipeline_stage', 'ganado')
        .neq('pipeline_stage', 'perdido')
        .neq('pipeline_stage', 'cita_agendada')
        .order('last_interaction_at', { ascending: false })
        .limit(30);

      if (candErr) {
        result.errors.push(`Error consultando leads de org ${org.id}: ${candErr.message}`);
        continue;
      }

      if (!candidates || candidates.length === 0) {
        continue;
      }

      // 3. Filtrar en memoria por inactividad y blindaje anti-spam (1 solo intento)
      let eligibleForOrg: typeof candidates = [];
      for (const contact of candidates) {
        if (!contact.phone || contact.phone.trim().length < 8) continue;

        const custom = (contact.custom_fields as Record<string, any>) || {};

        // 🛡️ Ignorar si la conversación está archivada o cerrada
        if (custom.conversation_status === 'closed' || (contact as any).conversation_status === 'closed') {
          continue;
        }

        // 🛡️ REGLA FUNDAMENTAL:
        // Si el cliente tiene mensajes sin leer, o espera atención nuestra, ¡NO es reactivación!
        // Pertenece a "Por Responder" para que el asesor o la IA le den respuesta.
        if ((contact.unread_count || 0) > 0 || contact.waiting_since) {
          continue;
        }

        // 🛡️ QUIÉN HABLÓ DE ÚLTIMO:
        // Solo es elegible para reactivar si el último mensaje fue enviado por NOSOTROS (IA o Asesor).
        // Si el cliente habló de último, le debemos una respuesta y no se debe reactivar en frío.
        const effectiveSender =
          contact.last_message_sender ||
          contact.last_message?.sender_type ||
          custom.last_message?.sender_type;

        if (effectiveSender === 'lead') {
          continue;
        }

        // 🛡️ BLINDAJE ANTI-SPAM ABSOLUTO:
        // Si ya se intentó reactivar antes, SE OMITE DE POR VIDA.
        if (custom.reactivation_attempted === true || custom.reactivation_sent_at) {
          continue;
        }

        // Evaluar ventana de inactividad (entre 24 horas y 240 horas = 10 días)
        if (!contact.last_interaction_at) continue;
        const lastTime = new Date(contact.last_interaction_at).getTime();
        if (isNaN(lastTime)) continue;

        const hoursElapsed = (nowTime - lastTime) / (1000 * 3600);
        if (hoursElapsed < 24 || hoursElapsed > 240) {
          continue;
        }

        // Si tiene temperatura definida, priorizar 'hot' y 'warm'
        const temp = custom.lead_temperature;
        if (temp === 'cold') {
          // Si fue expresamente marcado como frío por el asesor, no molestar
          continue;
        }

        eligibleForOrg.push(contact);
      }

      // 🛡️ PROTECCIÓN ANTI-BAN: Máximo 5 envíos por hora por organización
      const batchToProcess = eligibleForOrg.slice(0, 5);

      for (const contact of batchToProcess) {
        result.processedCount++;
        try {
          const bodyMessage = this.buildReactivationMessage(contact.name, contact.custom_fields);
          const is24hOpen = isWithin24HourWindow(contact.last_interaction_at);
          const provider = org.whatsapp_provider || 'meta';

          let messageSent = false;
          let metaMessageId: string | null = null;

          if (provider === 'meta' && !is24hOpen) {
            // Ventana de 24h expirada en Meta Cloud API -> Enviar plantilla oficial aprobada
            try {
              metaMessageId = await MessagingService.sendTemplateMessage({
                organization: org,
                to: contact.phone,
                templateKey: 'reactivacion_lead',
              });
              messageSent = true;
            } catch (tplErr: any) {
              console.warn(`[LEAD REACTIVATION TEMPLATE FAILED] ${contact.phone}:`, tplErr?.message);
              result.errors.push(`Fallo plantilla Meta a ${contact.phone}: ${tplErr?.message}`);
            }
          } else {
            // Evolution API o ventana de Meta aún abierta
            try {
              metaMessageId = await MessagingService.sendTextMessage({
                organization: org,
                to: contact.phone,
                body: bodyMessage,
                simulateTyping: false,
                isColdOutbound: true,
              });
              messageSent = true;
            } catch (msgErr: any) {
              console.warn(`[LEAD REACTIVATION TEXT FAILED] ${contact.phone}:`, msgErr?.message);
              result.errors.push(`Fallo envío texto a ${contact.phone}: ${msgErr?.message}`);
            }
          }

          if (messageSent) {
            result.reactivationsSent++;

            // 1. Auditoría en la tabla messages del chat
            await (supabaseAdmin.from('messages') as any).insert({
              contact_id: contact.id,
              sender_type: 'ai',
              content: `🤖 [Reactivación Autónoma 1-Toque]: "${bodyMessage}"`,
              status: 'sent',
              channel: 'whatsapp',
              meta_message_id: metaMessageId || null,
            });

            // 2. Marcar blindaje atómico en custom_fields para NUNCA volver a insistir
            const updatedCustom: Record<string, any> = {
              ...((contact.custom_fields as Record<string, any>) || {}),
              reactivation_attempted: true,
              reactivation_sent_at: new Date().toISOString(),
              reactivation_type: 'autonomous_cron',
            };

            // Limpiar cualquier recordatorio pendiente de reactivación ya que fue ejecutado
            if (updatedCustom.active_reminder?.reminderType === 'reactivation') {
              updatedCustom.active_reminder = null;
            }

            await (supabaseAdmin.from('contacts') as any)
              .update({
                custom_fields: updatedCustom,
                last_interaction_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                last_message_sender: 'ai',
                last_message_preview: bodyMessage.slice(0, 160),
              })
              .eq('id', contact.id);

            // Completar en la tabla scheduled_reminders si existía
            try {
              await (supabaseAdmin.from('scheduled_reminders') as any)
                .update({ status: 'completed' })
                .eq('contact_id', contact.id)
                .eq('reminder_type', 'reactivation')
                .eq('status', 'pending');
            } catch {}
          }
        } catch (itemErr: any) {
          result.errors.push(`Error en lead ${contact.id}: ${itemErr.message}`);
        }
      }
    }

    return result;
  }
}
