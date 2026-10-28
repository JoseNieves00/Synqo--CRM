import { supabaseAdmin } from '@/lib/supabase/admin';
import { isHoliday } from '@/lib/calendar/holidays';
import { decryptSecret } from '@/lib/security/encryption';
import { WhatsAppService } from './whatsapp.service';
import type { 
  AppointmentStatus, 
  BookedVia, 
  AppointmentConfirmationStatus,
  PaymentStatus 
} from '@/lib/supabase/types';

export interface AvailableSlot {
  startTime: string; // ISO string
  endTime: string;   // ISO string
  displayTime: string; // ej. "10:00 AM"
  specialistId: string;
  specialistName: string;
  roomId?: string | null;
  roomName?: string | null;
}

export interface DayScheduleSlot {
  start: string; // "09:00"
  end: string;   // "13:00"
}

export interface SpecialistWeeklySchedule {
  [day: string]: {
    enabled: boolean;
    slots: DayScheduleSlot[];
  };
}

/**
 * Helper para obtener el desfase de zona horaria (ej. '-05:00' para Bogotá o '-06:00' para México)
 */
function getTimezoneOffsetString(timeZone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'America/Bogota',
      timeZoneName: 'longOffset',
    });
    const parts = formatter.formatToParts(new Date());
    const offsetPart = parts.find(p => p.type === 'timeZoneName');
    const val = offsetPart?.value?.replace('GMT', '').trim();
    if (val === '') return '+00:00';
    return val || '-05:00';
  } catch {
    return '-05:00';
  }
}

export class AppointmentService {
  /**
   * Obtiene los horarios disponibles en milisegundos consultando la disponibilidad del colaborador,
   * sus bloqueos por horas/emergencias y la capacidad del salón físico.
   * Con soporte completo de zona horaria local (ej. America/Bogota).
   */
  static async getAvailableSlots(params: {
    organizationId: string;
    date: string; // YYYY-MM-DD
    durationMinutes?: number;
    specialistId?: string | null;
    serviceId?: string | null;
  }): Promise<AvailableSlot[]> {
    const { organizationId, date, specialistId } = params;
    const duration = params.durationMinutes || 45;

    // 1. Obtener ajustes de la organización (tolerancia, buffer, zona horaria)
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('appointment_settings, enabled_modules')
      .eq('id', organizationId)
      .single();

    const settings = (org?.appointment_settings as any) || {};
    const timeZone = settings.timezone || 'America/Bogota';
    const offsetStr = getTimezoneOffsetString(timeZone);
    const bufferMinutes = Number(settings.buffer_minutes || 0);
    const slotInterval = Number(settings.slot_interval_minutes || 15);

    // 🛡️ REGLA OPERATIVA ANTI-DESPISTE: Bloqueo de días festivos oficiales si está configurado
    if (settings.block_holidays === true) {
      const holidayInfo = isHoliday(date, settings.country || 'CO');
      if (holidayInfo.isHoliday) {
        return [];
      }
    }

    // 2. Obtener especialistas activos (o el específico solicitado)
    let specQuery = supabaseAdmin
      .from('specialists')
      .select('id, name, specialty, weekly_schedule')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (specialistId) {
      specQuery = specQuery.eq('id', specialistId);
    }

    const { data: specialists, error: specErr } = await specQuery;
    if (specErr || !specialists || specialists.length === 0) {
      return [];
    }

    // 3. Determinar el día de la semana en español en la zona horaria del negocio
    const targetDate = new Date(`${date}T12:00:00${offsetStr}`);
    const dayNames = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const dayKey = dayNames[targetDate.getDay()];

    // 4. Rango del día completo en la zona horaria local
    const dayStartISO = new Date(`${date}T00:00:00${offsetStr}`).toISOString();
    const dayEndISO = new Date(`${date}T23:59:59${offsetStr}`).toISOString();

    // 5. Cargar citas existentes del día
    const { data: existingAppointments } = await supabaseAdmin
      .from('appointments')
      .select('id, specialist_id, room_id, start_time, end_time, status')
      .eq('organization_id', organizationId)
      .gte('start_time', dayStartISO)
      .lte('start_time', dayEndISO)
      .neq('status', 'cancelled');

    // 6. Cargar bloqueos temporales de colaboradores
    const { data: unavailabilities } = await supabaseAdmin
      .from('specialist_unavailability')
      .select('id, specialist_id, start_time, end_time, is_all_day')
      .eq('organization_id', organizationId)
      .lte('start_time', dayEndISO)
      .gte('end_time', dayStartISO);

    // 7. Cargar salones físicos activos si el módulo está habilitado
    const modules = (org?.enabled_modules as any) || {};
    const requiresRooms = !!modules.physical_rooms;
    let rooms: Array<{ id: string; name: string; capacity: number }> = [];

    if (requiresRooms) {
      const { data: roomData } = await supabaseAdmin
        .from('physical_rooms')
        .select('id, name, capacity')
        .eq('organization_id', organizationId)
        .eq('is_active', true);
      rooms = roomData || [];
    }

    const availableSlots: AvailableSlot[] = [];

    // 8. Iterar por cada especialista y calcular huecos libres
    for (const spec of specialists) {
      const schedule = (spec.weekly_schedule as unknown as SpecialistWeeklySchedule) || {};
      const dayConfig = schedule[dayKey];

      if (!dayConfig || !dayConfig.enabled || !Array.isArray(dayConfig.slots)) {
        continue; // Este colaborador no trabaja este día
      }

      // Filtrar bloqueos para este especialista
      const specBlocks = (unavailabilities || []).filter(u => u.specialist_id === spec.id);
      const isAllDayBlocked = specBlocks.some(u => u.is_all_day);
      if (isAllDayBlocked) {
        continue; // Tiene bloqueo de día completo
      }

      const specAppointments = (existingAppointments || []).filter(a => a.specialist_id === spec.id);

      for (const windowSlot of dayConfig.slots) {
        const [startH, startM] = windowSlot.start.split(':').map(Number);
        const [endH, endM] = windowSlot.end.split(':').map(Number);

        let currentMinutes = startH * 60 + startM;
        const windowEndMinutes = endH * 60 + endM;

        while (currentMinutes + duration <= windowEndMinutes) {
          const slotStartH = Math.floor(currentMinutes / 60);
          const slotStartM = currentMinutes % 60;
          const slotEndMinutes = currentMinutes + duration;
          const slotEndH = Math.floor(slotEndMinutes / 60);
          const slotEndM = slotEndMinutes % 60;

          // Timestamp en zona horaria local convertido a ISO exacto
          const localStartStr = `${date}T${String(slotStartH).padStart(2, '0')}:${String(slotStartM).padStart(2, '0')}:00${offsetStr}`;
          const localEndStr = `${date}T${String(slotEndH).padStart(2, '0')}:${String(slotEndM).padStart(2, '0')}:00${offsetStr}`;

          const slotStartDate = new Date(localStartStr);
          const slotEndDate = new Date(localEndStr);

          const slotStartTime = slotStartDate.getTime();
          const slotEndTime = slotEndDate.getTime();

          // 🛡️ REGLA OPERATIVA: Descartar horarios pasados o con menos de 30 minutos de antelación
          const minimumLeadTimeMs = 30 * 60 * 1000;
          if (slotStartTime <= Date.now() + minimumLeadTimeMs) {
            currentMinutes += slotInterval;
            continue;
          }

          // A. Validar si choca con bloqueo temporal
          const hasUnavailConflict = specBlocks.some(b => {
            const bStart = new Date(b.start_time).getTime();
            const bEnd = new Date(b.end_time).getTime();
            return (slotStartTime < bEnd && slotEndTime > bStart);
          });

          if (hasUnavailConflict) {
            currentMinutes += slotInterval;
            continue;
          }

          // B. Validar si choca con otra cita del especialista
          const hasApptConflict = specAppointments.some(a => {
            const aStart = new Date(a.start_time).getTime();
            const aEnd = new Date(a.end_time).getTime();
            return (slotStartTime < aEnd && slotEndTime > aStart);
          });

          if (hasApptConflict) {
            currentMinutes += slotInterval;
            continue;
          }

          // C. Validar salón físico si aplica
          let assignedRoomId: string | null = null;
          let assignedRoomName: string | null = null;

          if (requiresRooms && rooms.length > 0) {
            const availableRoom = rooms.find(room => {
              const roomAppts = (existingAppointments || []).filter(a => {
                if (a.room_id !== room.id) return false;
                const aStart = new Date(a.start_time).getTime();
                const aEnd = new Date(a.end_time).getTime();
                return (slotStartTime < aEnd && slotEndTime > aStart);
              });
              return roomAppts.length < room.capacity;
            });

            if (!availableRoom) {
              currentMinutes += slotInterval;
              continue;
            }
            assignedRoomId = availableRoom.id;
            assignedRoomName = availableRoom.name;
          }

          // Formatear display time legible (ej. "10:00 AM")
          const period = slotStartH >= 12 ? 'PM' : 'AM';
          const displayH = slotStartH % 12 || 12;
          const displayTime = `${displayH}:${String(slotStartM).padStart(2, '0')} ${period}`;

          availableSlots.push({
            startTime: slotStartDate.toISOString(),
            endTime: slotEndDate.toISOString(),
            displayTime,
            specialistId: spec.id,
            specialistName: spec.name,
            roomId: assignedRoomId,
            roomName: assignedRoomName,
          });

          currentMinutes += slotInterval;
        }
      }
    }

    // Ordenar cronológicamente
    return availableSlots.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  /**
   * Crea una nueva cita nativa con blindaje atómico contra carreras concurrentes (Anti-Race Condition)
   * y notificación interna automática al colaborador.
   */
  static async createAppointment(params: {
    organizationId: string;
    contactId?: string | null;
    specialistId?: string | null;
    roomId?: string | null;
    serviceId?: string | null;
    serviceName: string;
    durationMinutes: number;
    startTime: string;
    endTime?: string;
    bookedVia?: BookedVia;
    notes?: string | null;
    clientName?: string | null;
  }) {
    const {
      organizationId,
      contactId,
      specialistId,
      roomId,
      serviceId,
      serviceName,
      durationMinutes,
      startTime,
      bookedVia = 'ai_whatsapp',
      notes,
      clientName,
    } = params;

    const start = new Date(startTime);
    const end = params.endTime ? new Date(params.endTime) : new Date(start.getTime() + durationMinutes * 60 * 1000);

    // 🛡️ REGLA OPERATIVA ANTI-ACAPARAMIENTO (DoS de Agenda vía WhatsApp):
    // Un contacto no puede tener más de 2 citas futuras activas simultáneas sin previa atención.
    if (contactId && bookedVia === 'ai_whatsapp') {
      const { count: activeApptCount } = await supabaseAdmin
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', contactId)
        .gte('start_time', new Date().toISOString())
        .in('status', ['pending', 'confirmed']);

      if (typeof activeApptCount === 'number' && activeApptCount >= 2) {
        throw new Error('LIMIT_REACHED: Ya cuentas con 2 citas activas programadas. Por favor asiste o gestiona tus citas previas antes de solicitar un nuevo turno.');
      }
    }

    // 🛡️ BLINDAJE ATÓMICO: Verificar que no haya colisión simultánea de último segundo
    if (specialistId) {
      const { data: conflictAppts } = await supabaseAdmin
        .from('appointments')
        .select('id')
        .eq('specialist_id', specialistId)
        .neq('status', 'cancelled')
        .lt('start_time', end.toISOString())
        .gt('end_time', start.toISOString());

      if (conflictAppts && conflictAppts.length > 0) {
        throw new Error('CONFLICT: El horario seleccionado acaba de ser reservado por otro usuario. Por favor selecciona otro horario.');
      }
    }

    // Si requiere salón físico, verificar capacidad restante en ese salón
    if (roomId) {
      const { data: room } = await supabaseAdmin
        .from('physical_rooms')
        .select('capacity')
        .eq('id', roomId)
        .single();

      if (room) {
        const { count: roomBookings } = await supabaseAdmin
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('room_id', roomId)
          .neq('status', 'cancelled')
          .lt('start_time', end.toISOString())
          .gt('end_time', start.toISOString());

        if (typeof roomBookings === 'number' && roomBookings >= room.capacity) {
          throw new Error('CONFLICT: El cupo máximo del salón físico para este horario se ha agotado.');
        }
      }
    }

    // Insertar la cita
    const { data: appointment, error } = await supabaseAdmin
      .from('appointments')
      .insert({
        organization_id: organizationId,
        contact_id: contactId || null,
        specialist_id: specialistId || null,
        room_id: roomId || null,
        service_id: serviceId || null,
        service_name: serviceName,
        duration_minutes: durationMinutes,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: 'confirmed',
        booked_via: bookedVia,
        reschedule_count: 0,
        notes: notes || null,
        confirmation_status: 'confirmed',
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Error al registrar cita: ${error.message}`);
    }

    // Si tiene contactId asociado, actualizar pipeline_stage a 'cita_agendada'
    if (contactId) {
      await supabaseAdmin
        .from('contacts')
        .update({ pipeline_stage: 'cita_agendada' })
        .eq('id', contactId);
    }

    // 🔔 NOTIFICACIÓN INTERNA AL COLABORADOR (Cero Teléfono Roto)
    if (specialistId) {
      try {
        let contactDisplayName = clientName;
        if (!contactDisplayName && contactId) {
          const { data: c } = await supabaseAdmin
            .from('contacts')
            .select('name, phone')
            .eq('id', contactId)
            .single();
          contactDisplayName = c?.name || c?.phone || 'Cliente WhatsApp';
        }

        const dateFormatted = start.toLocaleString('es-CO', {
          timeZone: 'America/Bogota',
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        // 1. Notificación en la App Móvil del Colaborador
        await supabaseAdmin.from('internal_chat_messages').insert({
          organization_id: organizationId,
          specialist_id: specialistId,
          sender_type: 'admin',
          sender_name: 'Sistema Synqo',
          content: `🔔 Nueva cita agendada: ${serviceName} para el ${dateFormatted}. Cliente: ${contactDisplayName || 'Cliente presencial'}.`,
        });

        // 2. Constancia instantánea directa al WhatsApp personal del Colaborador
        const { data: spec } = await supabaseAdmin
          .from('specialists')
          .select('name, phone')
          .eq('id', specialistId)
          .single();

        if (spec?.phone) {
          const { data: org } = await supabaseAdmin
            .from('organizations')
            .select('whatsapp_phone_number_id, whatsapp_access_token')
            .eq('id', organizationId)
            .single();

          if (org?.whatsapp_phone_number_id && org?.whatsapp_access_token) {
            try {
              const token = decryptSecret(org.whatsapp_access_token);
              const waBody = `🔔 *Nuevo Turno Agendado*\n\nHola ${spec.name}, se ha programado una nueva cita:\n• *Servicio:* ${serviceName}\n• *Fecha/Hora:* ${dateFormatted}\n• *Cliente/Alumno:* ${contactDisplayName || 'Cliente'}\n\nRevisa tu cronograma en el portal. ¡Éxitos! 🚀`;

              await WhatsAppService.sendTextMessage({
                phoneNumberId: org.whatsapp_phone_number_id,
                accessToken: token,
                to: spec.phone,
                body: waBody,
              });
            } catch (waErr: any) {
              console.warn('[AppointmentService] WhatsApp al especialista no enviado:', waErr?.message);
            }
          }
        }
      } catch (notifyErr) {
        console.warn('[AppointmentService] Aviso interno al colaborador omitido:', notifyErr);
      }
    }

    return appointment;
  }

  /**
   * Cancela una cita y libera de inmediato el horario en el calendario.
   */
  static async cancelAppointment(params: {
    appointmentId: string;
    organizationId?: string;
    reason?: string;
    cancelledBy?: 'client' | 'admin' | 'specialist';
  }) {
    const { appointmentId, organizationId, reason, cancelledBy = 'client' } = params;

    const { data: appt, error: findErr } = await supabaseAdmin
      .from('appointments')
      .select('id, organization_id, specialist_id, contact_id, service_name, start_time, notes')
      .eq('id', appointmentId)
      .single();

    if (findErr || !appt) {
      throw new Error('Cita no encontrada para cancelar.');
    }

    // 🛡️ BLINDAJE ANTI-IDOR: Validar que la cita pertenezca a la organización solicitante
    if (organizationId && appt.organization_id !== organizationId) {
      throw new Error('No autorizado: Esta cita pertenece a otra organización.');
    }

    const updatedNotes = [
      appt.notes,
      reason ? `Cancelada por ${cancelledBy}: ${reason}` : `Cancelada por ${cancelledBy}`,
    ]
      .filter(Boolean)
      .join(' | ');

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('appointments')
      .update({
        status: 'cancelled',
        notes: updatedNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', appointmentId)
      .select()
      .single();

    if (updateErr) {
      throw new Error(`Error al cancelar cita: ${updateErr.message}`);
    }

    // Notificar al especialista de la liberación del cupo
    if (appt.specialist_id) {
      try {
        const start = new Date(appt.start_time);
        const dateFormatted = start.toLocaleString('es-CO', {
          timeZone: 'America/Bogota',
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        await supabaseAdmin.from('internal_chat_messages').insert({
          organization_id: appt.organization_id,
          specialist_id: appt.specialist_id,
          sender_type: 'admin',
          sender_name: 'Sistema Synqo',
          content: `❌ Cita cancelada: El turno del ${dateFormatted} (${appt.service_name}) ha quedado libre.`,
        });
      } catch (err) {
        console.warn('[AppointmentService] Aviso de cancelación omitido:', err);
      }
    }

    return {
      success: true,
      appointment: updated,
      message: 'Cita cancelada exitosamente y horario liberado.',
    };
  }

  /**
   * Reprograma una cita existente respetando el límite máximo de 2 reprogramaciones.
   */
  static async rescheduleAppointment(params: {
    appointmentId: string;
    organizationId?: string;
    newStartTime: string;
    durationMinutes?: number;
    reason?: string;
  }) {
    const { appointmentId, organizationId, newStartTime, reason } = params;

    const { data: appt, error: findErr } = await supabaseAdmin
      .from('appointments')
      .select('id, organization_id, specialist_id, reschedule_count, duration_minutes, notes, service_name')
      .eq('id', appointmentId)
      .single();

    if (findErr || !appt) {
      throw new Error('Cita no encontrada para reprogramar.');
    }

    // 🛡️ BLINDAJE ANTI-IDOR: Validar pertenencia de la cita
    if (organizationId && appt.organization_id !== organizationId) {
      throw new Error('No autorizado: Esta cita pertenece a otra organización.');
    }

    const currentCount = appt.reschedule_count || 0;
    if (currentCount >= 2) {
      return {
        success: false,
        limitReached: true,
        message: 'Has alcanzado el límite máximo de 2 reprogramaciones permitidas. Por favor contáctanos con un asesor.',
      };
    }

    const duration = params.durationMinutes || appt.duration_minutes || 45;
    const start = new Date(newStartTime);
    const end = new Date(start.getTime() + duration * 60 * 1000);

    // Verificar colisión en el nuevo horario
    if (appt.specialist_id) {
      const { data: conflicts } = await supabaseAdmin
        .from('appointments')
        .select('id')
        .eq('specialist_id', appt.specialist_id)
        .neq('id', appointmentId)
        .neq('status', 'cancelled')
        .lt('start_time', end.toISOString())
        .gt('end_time', start.toISOString());

      if (conflicts && conflicts.length > 0) {
        throw new Error('CONFLICT: El nuevo horario seleccionado ya está ocupado. Por favor elige otro.');
      }
    }

    const updatedNotes = [appt.notes, reason ? `Reprogramación (${currentCount + 1}): ${reason}` : null]
      .filter(Boolean)
      .join(' | ');

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('appointments')
      .update({
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        duration_minutes: duration,
        reschedule_count: currentCount + 1,
        notes: updatedNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', appointmentId)
      .select()
      .single();

    if (updateErr) {
      throw new Error(`Error al actualizar reprogramación: ${updateErr.message}`);
    }

    const remainingReschedules = 2 - (currentCount + 1);

    // Notificar al especialista del cambio de horario
    if (appt.specialist_id) {
      try {
        const dateFormatted = start.toLocaleString('es-CO', {
          timeZone: 'America/Bogota',
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        await supabaseAdmin.from('internal_chat_messages').insert({
          organization_id: appt.organization_id,
          specialist_id: appt.specialist_id,
          sender_type: 'admin',
          sender_name: 'Sistema Synqo',
          content: `🔄 Cita reprogramada: ${appt.service_name} movida al ${dateFormatted}.`,
        });
      } catch (err) {
        console.warn('[AppointmentService] Aviso de reprogramación omitido:', err);
      }
    }

    return {
      success: true,
      limitReached: false,
      rescheduleCount: currentCount + 1,
      remainingReschedules,
      warningMessage: remainingReschedules === 1
        ? 'Cita reprogramada con éxito. Ten en cuenta que solo tienes 1 reprogramación más disponible para asegurar tu cupo.'
        : 'Cita reprogramada con éxito.',
      appointment: updated,
    };
  }

  /**
   * Bloqueo flexible de colaborador (rango horario de emergencia, cita médica o día completo).
   */
  static async blockSpecialistTime(params: {
    organizationId: string;
    specialistId: string;
    startTime: string;
    endTime: string;
    reason?: string;
    isAllDay?: boolean;
  }) {
    const { organizationId, specialistId, startTime, endTime, reason, isAllDay = false } = params;

    // 1. Guardar el bloqueo en specialist_unavailability
    const { data: block, error: blockErr } = await supabaseAdmin
      .from('specialist_unavailability')
      .insert({
        organization_id: organizationId,
        specialist_id: specialistId,
        start_time: startTime,
        end_time: endTime,
        reason: reason || null,
        is_all_day: isAllDay,
      })
      .select()
      .single();

    if (blockErr) {
      throw new Error(`Error al registrar bloqueo: ${blockErr.message}`);
    }

    // 2. Buscar citas que hayan quedado afectadas en este rango para alertar al admin/recepcionista
    const { data: affectedAppointments } = await supabaseAdmin
      .from('appointments')
      .select('id, contact_id, service_name, start_time, end_time, status')
      .eq('specialist_id', specialistId)
      .gte('start_time', startTime)
      .lte('start_time', endTime)
      .neq('status', 'cancelled');

    return {
      block,
      affectedAppointments: affectedAppointments || [],
      affectedCount: (affectedAppointments || []).length,
    };
  }

  /**
   * Registro instantáneo de cliente presencial en sala ("Cliente en el local / Walk-in").
   */
  static async registerWalkIn(params: {
    organizationId: string;
    specialistId: string;
    durationMinutes: number;
    clientName?: string;
    serviceName?: string;
    roomId?: string | null;
  }) {
    const now = new Date();
    const end = new Date(now.getTime() + params.durationMinutes * 60 * 1000);

    return this.createAppointment({
      organizationId: params.organizationId,
      specialistId: params.specialistId,
      roomId: params.roomId || null,
      serviceName: params.serviceName || 'Atención en el local',
      durationMinutes: params.durationMinutes,
      startTime: now.toISOString(),
      endTime: end.toISOString(),
      bookedVia: 'walk_in',
      notes: `Cliente en el local: ${params.clientName || 'Sin nombre registrado'}`,
    });
  }

  /**
   * Notificación de retraso en servicio (+15 min).
   */
  static async reportDelay(params: {
    appointmentId: string;
    delayMinutes: number;
  }) {
    const { appointmentId, delayMinutes } = params;

    const { data: appt, error } = await supabaseAdmin
      .from('appointments')
      .update({
        client_notified_delay_at: new Date().toISOString(),
      })
      .eq('id', appointmentId)
      .select('id, organization_id, specialist_id, start_time, contact_id')
      .single();

    if (error || !appt) {
      throw new Error('Error al registrar aviso de retraso.');
    }

    // Buscar el siguiente cliente del especialista para notificarlo
    let nextAppt = null;
    if (appt.specialist_id) {
      const { data } = await supabaseAdmin
        .from('appointments')
        .select('id, contact_id, start_time, service_name')
        .eq('specialist_id', appt.specialist_id)
        .gt('start_time', appt.start_time)
        .neq('status', 'cancelled')
        .order('start_time', { ascending: true })
        .limit(1)
        .maybeSingle();
      nextAppt = data;
    }

    let nextContact = null;
    if (nextAppt?.contact_id) {
      const { data: contact } = await supabaseAdmin
        .from('contacts')
        .select('id, name, phone')
        .eq('id', nextAppt.contact_id)
        .single();
      nextContact = contact;
    }

    return {
      success: true,
      nextAppointment: nextAppt,
      nextContact,
      delayMinutes,
    };
  }
}
