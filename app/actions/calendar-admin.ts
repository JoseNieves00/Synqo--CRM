'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { AppointmentService } from '@/services/appointment.service';
import { ReminderService } from '@/services/reminder.service';
import { generateInviteToken, hashPassword } from '@/lib/security/encryption';
import { revalidatePath } from 'next/cache';

/**
 * Valida la sesión del usuario actual y retorna su perfil y organización.
 */
async function requireAuthOrgUser() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('No autorizado: Inicia sesión para continuar.');
  }

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('id, organization_id, email, full_name, role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.organization_id) {
    throw new Error('Perfil u organización no encontrada.');
  }

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name, company_code, enabled_modules, appointment_settings, industry_preset')
    .eq('id', profile.organization_id)
    .single();

  return { user, profile, org };
}

/**
 * Carga citas, especialistas, salones y catálogo de servicios para la vista de Calendario.
 */
export async function getCalendarData(options?: {
  startDate?: string;
  endDate?: string;
  specialistId?: string;
  roomId?: string;
}) {
  const { org } = await requireAuthOrgUser();

  // Rango de fechas por defecto: últimos 3 días hasta próximos 30 días
  const now = new Date();
  const defaultStart = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const defaultEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const start = options?.startDate || defaultStart;
  const end = options?.endDate || defaultEnd;

  // 1. Cargar citas
  let query = (supabaseAdmin.from('appointments') as any)
    .select(`
      id,
      service_id,
      service_name,
      duration_minutes,
      start_time,
      end_time,
      status,
      booked_via,
      reschedule_count,
      notes,
      client_notified_delay_at,
      confirmation_status,
      payment_status,
      amount_paid,
      contact:contacts (id, name, phone),
      specialist:specialists (id, name, specialty),
      room:physical_rooms (id, name)
    `)
    .eq('organization_id', org.id)
    .gte('start_time', start)
    .lte('start_time', end)
    .order('start_time', { ascending: true });

  if (options?.specialistId && options.specialistId !== 'all') {
    query = query.eq('specialist_id', options.specialistId);
  }

  if (options?.roomId && options.roomId !== 'all') {
    query = query.eq('room_id', options.roomId);
  }

  const { data: rawAppointments, error: apptErr } = await query;
  if (apptErr) {
    console.error('[getCalendarData] Error cargando citas:', apptErr);
  }

  // 2. Cargar especialistas activos y pendientes
  const { data: specialists } = await (supabaseAdmin.from('specialists') as any)
    .select('id, name, phone, specialty, access_pin, approval_status, is_active, created_at')
    .eq('organization_id', org.id)
    .order('name', { ascending: true });

  // 3. Cargar salones
  const { data: rooms } = await (supabaseAdmin.from('physical_rooms') as any)
    .select('id, name, capacity, description, is_active')
    .eq('organization_id', org.id)
    .order('name', { ascending: true });

  // 4. Cargar servicios
  const { data: services } = await (supabaseAdmin.from('services_catalog') as any)
    .select('id, name, duration_minutes, price, category, is_active')
    .eq('organization_id', org.id)
    .order('name', { ascending: true });

  // Normalizar estructura de citas para el cliente
  const appointments = (rawAppointments || []).map((appt: any) => ({
    id: appt.id,
    serviceId: appt.service_id,
    serviceName: appt.service_name,
    durationMinutes: appt.duration_minutes,
    startTime: appt.start_time,
    endTime: appt.end_time,
    status: appt.status as 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show',
    bookedVia: appt.booked_via,
    rescheduleCount: appt.reschedule_count || 0,
    notes: appt.notes,
    clientNotifiedDelayAt: appt.client_notified_delay_at,
    confirmationStatus: appt.confirmation_status,
    paymentStatus: appt.payment_status,
    amountPaid: Number(appt.amount_paid) || 0,
    client: appt.contact ? {
      id: appt.contact.id,
      name: appt.contact.name || 'Sin nombre',
      phone: appt.contact.phone || '',
    } : null,
    specialist: appt.specialist ? {
      id: appt.specialist.id,
      name: appt.specialist.name,
      specialty: appt.specialist.specialty,
    } : null,
    room: appt.room ? {
      id: appt.room.id,
      name: appt.room.name,
    } : null,
  }));

  return {
    organization: org,
    appointments,
    specialists: specialists || [],
    rooms: rooms || [],
    services: services || [],
  };
}

/**
 * Agendamiento Rápido de Cita desde el CRM (Llamada, Presencial o Mostrador)
 */
export async function createQuickAppointmentAdmin(input: {
  contactName: string;
  contactPhone: string;
  serviceId: string;
  specialistId?: string;
  roomId?: string;
  startTime: string; // ISO 8601
  notes?: string;
  studentName?: string;
  recurringWeeks?: number;
  modality?: 'presencial' | 'virtual' | 'domicilio';
  meetingUrl?: string;
  locationAddress?: string;
}) {
  const { org, user } = await requireAuthOrgUser();

  const phone = input.contactPhone.trim().replace(/\s+/g, '');
  const cleanPhone = phone.startsWith('+') ? phone : '+' + phone;

  if (cleanPhone.length < 8) {
    throw new Error('Ingresa un número telefónico válido con indicativo.');
  }

  // 1. Buscar o crear el contacto en la organización
  let { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .select('id, name')
    .eq('organization_id', org.id)
    .eq('phone', cleanPhone)
    .maybeSingle();

  if (!contact) {
    const { data: newContact, error: createContactErr } = await (supabaseAdmin.from('contacts') as any)
      .insert({
        organization_id: org.id,
        name: input.contactName.trim() || 'Cliente Mostrador',
        phone: cleanPhone,
        pipeline_stage: 'agendado',
        is_ai_active: true,
        assigned_to: user.id,
        last_interaction_at: new Date().toISOString(),
      })
      .select('id, name')
      .single();

    if (createContactErr || !newContact) {
      throw new Error(`Error al registrar contacto: ${createContactErr?.message}`);
    }
    contact = newContact;
  }

  // 2. Obtener detalles del servicio
  const { data: service } = await (supabaseAdmin.from('services_catalog') as any)
    .select('name, duration_minutes')
    .eq('id', input.serviceId)
    .maybeSingle();

  const serviceName = service?.name || 'Servicio General';
  const durationMinutes = service?.duration_minutes || 45;

  // 3. Soporte para Agendamiento Recurrente (Clases Semanales para Academias)
  const totalWeeks = Math.min(Math.max(1, input.recurringWeeks || 1), 12);
  const baseDate = new Date(input.startTime);
  const createdAppointments: any[] = [];

  const rawNotes = input.notes?.trim() || '';
  const studentPrefix = input.studentName?.trim() ? `[Alumno: ${input.studentName.trim()}] ` : '';
  
  let modalityPrefix = '';
  if (input.modality === 'virtual') {
    modalityPrefix = `[💻 Virtual${input.meetingUrl ? ': ' + input.meetingUrl.trim() : ''}] `;
  } else if (input.modality === 'domicilio') {
    modalityPrefix = `[📍 Domicilio${input.locationAddress ? ': ' + input.locationAddress.trim() : ''}] `;
  } else if (input.modality === 'presencial') {
    modalityPrefix = `[🏢 Presencial] `;
  }

  const baseNotes = `${modalityPrefix}${studentPrefix}${rawNotes}`.trim();
  const displayName = input.studentName?.trim() 
    ? `${input.studentName.trim()} (Acudiente: ${contact.name})`
    : contact.name;

  // Si es virtual o domicilio, no se bloquea salón físico
  const effectiveRoomId = (input.modality === 'virtual' || input.modality === 'domicilio')
    ? undefined
    : (input.roomId && input.roomId !== 'auto' ? input.roomId : undefined);

  for (let w = 0; w < totalWeeks; w++) {
    const currentStart = new Date(baseDate.getTime() + w * 7 * 24 * 60 * 60 * 1000);
    const sessionNote = totalWeeks > 1 
      ? `${baseNotes ? baseNotes + ' • ' : ''}(Sesión ${w + 1} de ${totalWeeks})`
      : baseNotes;

    const appointment = await AppointmentService.createAppointment({
      organizationId: org.id,
      contactId: contact.id,
      specialistId: input.specialistId && input.specialistId !== 'auto' ? input.specialistId : undefined,
      roomId: effectiveRoomId,
      serviceId: input.serviceId,
      serviceName,
      durationMinutes,
      startTime: currentStart.toISOString(),
      bookedVia: 'manual_reception',
      notes: sessionNote || null,
      clientName: displayName,
    });

    createdAppointments.push(appointment);
  }

  revalidatePath('/calendar');
  revalidatePath('/pipeline');
  return { 
    success: true, 
    appointment: createdAppointments[0], 
    totalCreated: createdAppointments.length 
  };
}

/**
 * Actualizar estado de una cita desde la vista de calendario
 */
export async function updateAppointmentStatusAdmin(
  appointmentId: string,
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show',
  notes?: string
) {
  const { org } = await requireAuthOrgUser();

  const updatePayload: any = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (notes !== undefined) {
    updatePayload.notes = notes;
  }

  const { error } = await (supabaseAdmin.from('appointments') as any)
    .update(updatePayload)
    .eq('id', appointmentId)
    .eq('organization_id', org.id);

  if (error) {
    throw new Error(`Error al actualizar estado de la cita: ${error.message}`);
  }

  revalidatePath('/calendar');
  return { success: true, status };
}

/**
 * Cancelar cita desde el CRM liberando el salón y la agenda del especialista
 */
export async function cancelAppointmentAdmin(appointmentId: string, reason?: string) {
  const { org } = await requireAuthOrgUser();

  const result = await AppointmentService.cancelAppointment({
    appointmentId,
    organizationId: org.id,
    reason: reason || 'Cancelada por recepción/administración',
    cancelledBy: 'admin',
  });

  revalidatePath('/calendar');
  return result;
}

/**
 * Notificar retraso en servicio (+15 min) desde la recepción y localizar al siguiente cliente
 */
export async function reportDelayAdmin(appointmentId: string, delayMinutes: number = 15) {
  const { org } = await requireAuthOrgUser();

  const res = await AppointmentService.reportDelay({
    appointmentId,
    delayMinutes,
  });

  revalidatePath('/calendar');
  return res;
}

/**
 * Reasignar una cita a otro colaborador disponible ante un imprevisto
 */
export async function reassignAppointmentAdmin(appointmentId: string, newSpecialistId: string) {
  const { org } = await requireAuthOrgUser();

  // Validar que el nuevo especialista pertenezca a la misma organización y esté activo
  const { data: spec, error: specErr } = await (supabaseAdmin.from('specialists') as any)
    .select('id, name')
    .eq('id', newSpecialistId)
    .eq('organization_id', org.id)
    .eq('is_active', true)
    .single();

  if (specErr || !spec) {
    throw new Error('Especialista no válido para reasignación.');
  }

  const { error } = await (supabaseAdmin.from('appointments') as any)
    .update({
      specialist_id: newSpecialistId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', appointmentId)
    .eq('organization_id', org.id);

  if (error) {
    throw new Error(`Error al reasignar cita: ${error.message}`);
  }

  revalidatePath('/calendar');
  return { success: true, specialistName: spec.name };
}

/**
 * Generar enlace de auto-registro e invitación segura con TTL de 24 horas y QR
 */
export async function generateStaffInviteAdmin() {
  const { org, user } = await requireAuthOrgUser();

  const { rawToken, tokenHash } = generateInviteToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data: inv, error } = await (supabaseAdmin.from('staff_invitations') as any)
    .insert({
      organization_id: org.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      is_used: false,
      created_by: user.id,
    })
    .select('id, expires_at')
    .single();

  if (error) {
    throw new Error(`Error al crear invitación: ${error.message}`);
  }

  // Ruta pública de registro
  const invitePath = `/colaborador/join?token=${rawToken}`;

  return {
    success: true,
    rawToken,
    expiresAt,
    invitePath,
    companyName: org.name,
    companyCode: org.company_code,
  };
}

/**
 * Crear colaborador manualmente desde el panel de administración
 */
export async function createSpecialistAdmin(input: {
  name: string;
  phone: string;
  specialty: string;
  accessPin?: string;
  password?: string;
}) {
  const { org } = await requireAuthOrgUser();

  const name = input.name.trim();
  const phone = input.phone.trim();
  const specialty = input.specialty.trim();

  if (!name) throw new Error('El nombre del colaborador es requerido.');
  if (!phone) throw new Error('El número telefónico es requerido.');

  // PIN de 4 dígitos (si no lo asignan, usar últimos 4 de su celular)
  const pin = input.accessPin?.trim() || phone.slice(-4);
  const passwordHash = input.password ? hashPassword(input.password) : null;

  const { data: newSpec, error } = await (supabaseAdmin.from('specialists') as any)
    .insert({
      organization_id: org.id,
      name,
      phone,
      specialty: specialty || 'Especialista',
      access_pin: pin,
      password_hash: passwordHash,
      approval_status: 'approved',
      is_active: true,
    })
    .select('id, name')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('Ya existe un colaborador con este número telefónico en la empresa.');
    }
    throw new Error(`Error al crear colaborador: ${error.message}`);
  }

  revalidatePath('/settings');
  revalidatePath('/calendar');
  return { success: true, specialist: newSpec };
}

/**
 * Actualizar colaborador
 */
export async function updateSpecialistAdmin(
  specialistId: string,
  input: {
    name?: string;
    phone?: string;
    specialty?: string;
    accessPin?: string;
    isActive?: boolean;
    approvalStatus?: 'pending' | 'approved' | 'rejected';
  }
) {
  const { org } = await requireAuthOrgUser();

  const updatePayload: any = {
    updated_at: new Date().toISOString(),
  };

  if (input.name !== undefined) updatePayload.name = input.name.trim();
  if (input.phone !== undefined) updatePayload.phone = input.phone.trim();
  if (input.specialty !== undefined) updatePayload.specialty = input.specialty.trim();
  if (input.accessPin !== undefined) updatePayload.access_pin = input.accessPin.trim();
  if (input.isActive !== undefined) updatePayload.is_active = input.isActive;
  if (input.approvalStatus !== undefined) updatePayload.approval_status = input.approvalStatus;

  const { error } = await (supabaseAdmin.from('specialists') as any)
    .update(updatePayload)
    .eq('id', specialistId)
    .eq('organization_id', org.id);

  if (error) {
    throw new Error(`Error al actualizar colaborador: ${error.message}`);
  }

  revalidatePath('/settings');
  revalidatePath('/calendar');
  return { success: true };
}

/**
 * Desactivar o eliminar colaborador con protección de citas activas
 */
export async function deleteSpecialistAdmin(specialistId: string) {
  const { org } = await requireAuthOrgUser();

  // 🛡️ REGLA OPERATIVA: Evitar dejar citas huérfanas
  const { count: futureAppts } = await (supabaseAdmin.from('appointments') as any)
    .select('id', { count: 'exact', head: true })
    .eq('specialist_id', specialistId)
    .gte('start_time', new Date().toISOString())
    .neq('status', 'cancelled');

  if (futureAppts && futureAppts > 0) {
    throw new Error(
      `No es posible eliminar al colaborador porque tiene ${futureAppts} cita(s) futura(s) activa(s). Reasigna o cancela sus turnos primero, o desactívalo cambiando su estado a inactivo.`
    );
  }

  const { error } = await (supabaseAdmin.from('specialists') as any)
    .delete()
    .eq('id', specialistId)
    .eq('organization_id', org.id);

  if (error) {
    throw new Error(`Error al eliminar colaborador: ${error.message}`);
  }

  revalidatePath('/settings');
  revalidatePath('/calendar');
  return { success: true };
}

/**
 * Crear Salón o Estación Física
 */
export async function createRoomAdmin(input: {
  name: string;
  capacity?: number;
  description?: string;
}) {
  const { org } = await requireAuthOrgUser();

  const name = input.name.trim();
  if (!name) throw new Error('El nombre del salón o estación es obligatorio.');

  const capacity = Number(input.capacity) || 1;

  const { data: room, error } = await (supabaseAdmin.from('physical_rooms') as any)
    .insert({
      organization_id: org.id,
      name,
      capacity,
      description: input.description?.trim() || null,
      is_active: true,
    })
    .select('id, name')
    .single();

  if (error) {
    throw new Error(`Error al registrar salón: ${error.message}`);
  }

  revalidatePath('/settings');
  revalidatePath('/calendar');
  return { success: true, room };
}

/**
 * Actualizar Salón
 */
export async function updateRoomAdmin(
  roomId: string,
  input: {
    name?: string;
    capacity?: number;
    description?: string;
    isActive?: boolean;
  }
) {
  const { org } = await requireAuthOrgUser();

  const updatePayload: any = {
    updated_at: new Date().toISOString(),
  };

  if (input.name !== undefined) updatePayload.name = input.name.trim();
  if (input.capacity !== undefined) updatePayload.capacity = Number(input.capacity) || 1;
  if (input.description !== undefined) updatePayload.description = input.description.trim();
  if (input.isActive !== undefined) updatePayload.is_active = input.isActive;

  const { error } = await (supabaseAdmin.from('physical_rooms') as any)
    .update(updatePayload)
    .eq('id', roomId)
    .eq('organization_id', org.id);

  if (error) {
    throw new Error(`Error al actualizar salón: ${error.message}`);
  }

  revalidatePath('/settings');
  revalidatePath('/calendar');
  return { success: true };
}

/**
 * Eliminar Salón con protección de citas activas
 */
export async function deleteRoomAdmin(roomId: string) {
  const { org } = await requireAuthOrgUser();

  // 🛡️ REGLA OPERATIVA: Evitar dejar citas huérfanas de salón
  const { count: futureAppts } = await (supabaseAdmin.from('appointments') as any)
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .gte('start_time', new Date().toISOString())
    .neq('status', 'cancelled');

  if (futureAppts && futureAppts > 0) {
    throw new Error(
      `No es posible eliminar el salón porque tiene ${futureAppts} cita(s) futura(s) activa(s). Reasigna las citas a otro salón o estación física primero.`
    );
  }

  const { error } = await (supabaseAdmin.from('physical_rooms') as any)
    .delete()
    .eq('id', roomId)
    .eq('organization_id', org.id);

  if (error) {
    throw new Error(`Error al eliminar salón: ${error.message}`);
  }

  revalidatePath('/settings');
  revalidatePath('/calendar');
  return { success: true };
}

/**
 * Ejecutar verificación manual de recordatorios 24h y auto-cancelación a 8 horas
 */
export async function triggerManualReminderCheck() {
  const { org } = await requireAuthOrgUser();
  const result = await ReminderService.processAppointmentRemindersAndCancellations(org.id);
  revalidatePath('/calendar');
  return result;
}

