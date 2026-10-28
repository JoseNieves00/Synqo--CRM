import { supabaseAdmin } from '@/lib/supabase/admin';
import { WhatsAppService } from '@/services/whatsapp.service';
import { decryptSecret } from '@/lib/security/encryption';

interface ProcessResult {
  processedCount: number;
  remindersSent: number;
  autoCancelledCount: number;
  errors: string[];
}

/**
 * Servicio Central de Recordatorios y Auto-Cancelación Anti-No-Show (Fase 6)
 * - Regla 1: Recordatorio 24h previas con estricto Curfew Nocturno (Cero mensajes de 8:00 PM a 8:00 AM).
 * - Regla 2: Auto-Cancelación y liberación del cupo a las 8 horas previas si no hubo confirmación.
 */
export class ReminderService {
  private static DEFAULT_TIMEZONE = 'America/Bogota';

  /**
   * Obtiene la hora actual (0-23) y minutos en la zona horaria del negocio
   */
  private static getLocalTimeInfo(timeZone: string = this.DEFAULT_TIMEZONE) {
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      const hourPart = parts.find((p) => p.type === 'hour')?.value;
      const minutePart = parts.find((p) => p.type === 'minute')?.value;
      const hour = hourPart ? parseInt(hourPart, 10) : now.getHours();
      const minute = minutePart ? parseInt(minutePart, 10) : now.getMinutes();
      return { hour, minute };
    } catch {
      return { hour: new Date().getHours(), minute: new Date().getMinutes() };
    }
  }

  /**
   * Procesa de forma atómica recordatorios pendientes y cancelaciones a 8 horas
   */
  static async processAppointmentRemindersAndCancellations(specificOrgId?: string): Promise<ProcessResult> {
    const result: ProcessResult = {
      processedCount: 0,
      remindersSent: 0,
      autoCancelledCount: 0,
      errors: [],
    };

    const now = new Date();
    const nowIso = now.toISOString();

    // -------------------------------------------------------------------------
    // ETAPA 1: AUTO-CANCELACIÓN A LAS 8 HORAS POR FALTA DE CONFIRMACIÓN
    // -------------------------------------------------------------------------
    // Umbral de 8 horas: citas que empiezan entre ahora y dentro de 8 horas
    const eightHoursFromNow = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();

    let unconfirmedQuery = (supabaseAdmin.from('appointments') as any)
      .select(`
        id,
        organization_id,
        contact_id,
        specialist_id,
        service_name,
        start_time,
        booked_via,
        notes,
        contact:contacts(id, name, phone, last_interaction_at),
        specialist:specialists(id, name),
        organization:organizations(id, name, whatsapp_phone_number_id, whatsapp_access_token, enabled_modules, appointment_settings)
      `)
      .eq('status', 'confirmed')
      .eq('confirmation_status', 'unconfirmed')
      .neq('booked_via', 'walk_in')
      .gte('start_time', nowIso)
      .lte('start_time', eightHoursFromNow);

    if (specificOrgId) {
      unconfirmedQuery = unconfirmedQuery.eq('organization_id', specificOrgId);
    }

    const { data: expiredAppointments, error: expErr } = await unconfirmedQuery;

    if (expErr) {
      result.errors.push(`Error consultando citas no confirmadas a 8h: ${expErr.message}`);
    } else if (expiredAppointments && expiredAppointments.length > 0) {
      for (const appt of expiredAppointments) {
        result.processedCount++;
        try {
          // 1. Marcar cita como cancelada por expiración
          const updatedNotes = [
            appt.notes,
            'Auto-cancelada a las 8 horas por falta de confirmación del cliente (Anti-No-Show)',
          ]
            .filter(Boolean)
            .join(' | ');

          await (supabaseAdmin.from('appointments') as any)
            .update({
              status: 'cancelled',
              confirmation_status: 'expired',
              notes: updatedNotes,
              updated_at: new Date().toISOString(),
            })
            .eq('id', appt.id);

          result.autoCancelledCount++;

          // 2. Notificar en el chat interno al colaborador para que sepa que su turno quedó libre
          if (appt.specialist_id) {
            try {
              const startFormatted = new Date(appt.start_time).toLocaleTimeString('es-CO', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              });
              await (supabaseAdmin.from('internal_chat_messages') as any).insert({
                organization_id: appt.organization_id,
                specialist_id: appt.specialist_id,
                sender_type: 'admin',
                sender_name: 'Sistema Synqo',
                content: `⚠️ Cita de las ${startFormatted} con ${appt.contact?.name || 'Cliente'} cancelada automáticamente al no recibir confirmación previa a 8h. Horario liberado en agenda.`,
              });
            } catch (chatErr) {
              console.warn('[REMINDER SERVICE] Error notificando cancelación al chat interno:', chatErr);
            }
          }

          // 3. Avisar al cliente por WhatsApp de la liberación del cupo
          if (
            appt.organization?.whatsapp_phone_number_id &&
            appt.organization?.whatsapp_access_token &&
            appt.contact?.phone
          ) {
            try {
              const decryptedToken = decryptSecret(appt.organization.whatsapp_access_token);
              const startFormatted = new Date(appt.start_time).toLocaleTimeString('es-CO', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              });
              const msg = `Hola ${appt.contact.name || ''}, tu cita para hoy a las ${startFormatted} (${appt.service_name}) fue liberada al no recibir confirmación con 8 horas de anticipación según nuestras políticas de asistencia. Si deseas agendar un nuevo horario, con gusto te atenderemos por este medio.`;

              await WhatsAppService.sendTextMessage({
                phoneNumberId: appt.organization.whatsapp_phone_number_id,
                accessToken: decryptedToken,
                to: appt.contact.phone,
                body: msg,
              });
            } catch (waErr: any) {
              // Si la ventana de 24h está cerrada en WhatsApp, es esperado que no entregue texto plano
              console.warn('[REMINDER SERVICE] No se pudo enviar mensaje WhatsApp de cita liberada (ventana cerrada o error):', waErr.message);
            }
          }
        } catch (itemErr: any) {
          result.errors.push(`Error cancelando cita ${appt.id}: ${itemErr.message}`);
        }
      }
    }

    // -------------------------------------------------------------------------
    // ETAPA 2: RECORDATORIO DE CONFIRMACIÓN (24 HORAS CON CURFEW 8:00 PM)
    // -------------------------------------------------------------------------
    // Rango: Citas que inician entre 12 y 26 horas en el futuro que aún no han recibido recordatorio
    const reminderWindowStart = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
    const reminderWindowEnd = new Date(now.getTime() + 26 * 60 * 60 * 1000).toISOString();

    let reminderQuery = (supabaseAdmin.from('appointments') as any)
      .select(`
        id,
        organization_id,
        contact_id,
        specialist_id,
        service_name,
        start_time,
        booked_via,
        contact:contacts(id, name, phone, last_interaction_at),
        specialist:specialists(id, name),
        organization:organizations(id, name, whatsapp_phone_number_id, whatsapp_access_token, enabled_modules, appointment_settings)
      `)
      .eq('status', 'confirmed')
      .eq('confirmation_status', 'unconfirmed')
      .is('reminder_sent_at', null)
      .neq('booked_via', 'walk_in')
      .gte('start_time', reminderWindowStart)
      .lte('start_time', reminderWindowEnd);

    if (specificOrgId) {
      reminderQuery = reminderQuery.eq('organization_id', specificOrgId);
    }

    const { data: upcomingForReminder, error: remErr } = await reminderQuery;

    if (remErr) {
      result.errors.push(`Error consultando citas para recordatorio: ${remErr.message}`);
    } else if (upcomingForReminder && upcomingForReminder.length > 0) {
      for (const appt of upcomingForReminder) {
        result.processedCount++;

        // 🛡️ REGLA OPERATIVA DE RESPETO Y CURFEW NOCTURNO:
        // Cero mensajes automatizados de 8:00 PM a 8:00 AM
        const timeZone = appt.organization?.appointment_settings?.timezone || this.DEFAULT_TIMEZONE;
        const { hour } = this.getLocalTimeInfo(timeZone);

        if (hour >= 20 || hour < 8) {
          // Estamos en horario nocturno (Curfew). No enviar mensaje invasivo a esta hora.
          continue;
        }

        // Validar credenciales de WhatsApp
        if (
          !appt.organization?.whatsapp_phone_number_id ||
          !appt.organization?.whatsapp_access_token ||
          !appt.contact?.phone
        ) {
          continue;
        }

        try {
          const decryptedToken = decryptSecret(appt.organization.whatsapp_access_token);
          const startFormatted = new Date(appt.start_time).toLocaleTimeString('es-CO', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });
          const specialistName = appt.specialist?.name ? ` con ${appt.specialist.name}` : '';

          const bodyText = `Hola ${appt.contact.name || ''} 👋 Te recordamos tu cita programada para mañana a las ${startFormatted}${specialistName} (${appt.service_name}).\n\nPor favor confirma tu asistencia a continuación. Recuerda que las citas no confirmadas se liberan con 8 horas de antelación.`;

          // Intentar enviar con botones interactivos de 1-toque
          try {
            await WhatsAppService.sendInteractiveButtonsMessage({
              phoneNumberId: appt.organization.whatsapp_phone_number_id,
              accessToken: decryptedToken,
              to: appt.contact.phone,
              bodyText,
              buttons: [
                { id: 'btn_confirm_appt', title: '✓ Confirmar Cita' },
                { id: 'btn_reschedule_appt', title: '↻ Reprogramar' },
              ],
            });
          } catch (interactiveErr: any) {
            // Si el envío interactivo falla (ej. ventana de 24h cerrada), fallback a texto plano
            await WhatsAppService.sendTextMessage({
              phoneNumberId: appt.organization.whatsapp_phone_number_id,
              accessToken: decryptedToken,
              to: appt.contact.phone,
              body: `${bodyText}\n\nResponde *"Sí confirmo"* para validar tu asistencia o *"Reprogramar"* si necesitas cambiar de horario.`,
            });
          }

          // Marcar recordatorio como despachado
          await (supabaseAdmin.from('appointments') as any)
            .update({
              reminder_sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', appt.id);

          result.remindersSent++;
        } catch (sendErr: any) {
          result.errors.push(`Error enviando recordatorio para cita ${appt.id}: ${sendErr.message}`);
        }
      }
    }

    return result;
  }
}

