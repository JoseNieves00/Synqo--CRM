'use server';

import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { AppointmentService } from '@/services/appointment.service';
import { revalidatePath } from 'next/cache';
import {
  encryptSecret,
  decryptSecret,
  hashPassword,
  verifyPassword,
  generateInviteToken,
  hashToken,
} from '@/lib/security/encryption';
import { checkRateLimit } from '@/lib/security/rate-limiter';

const STAFF_COOKIE_NAME = 'synqo_staff_session';
const THIRTY_DAYS_SEC = 30 * 24 * 60 * 60;

export interface StaffSession {
  specialistId: string;
  specialistName: string;
  organizationId: string;
  organizationName: string;
  companyCode: string;
  specialty: string;
  loggedInAt: number;
  enabledModules?: Record<string, boolean>;
  industryPreset?: string;
}

export interface StaffAppointmentItem {
  id: string;
  serviceName: string;
  durationMinutes: number;
  startTime: string;
  endTime: string;
  status: 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  clientName: string;
  clientPhone: string;
  roomName?: string | null;
  notes?: string | null;
  bookedVia: string;
  delayNotifiedAt?: string | null;
}

export interface StaffUnavailabilityItem {
  id: string;
  startTime: string;
  endTime: string;
  reason?: string | null;
  isAllDay: boolean;
}

export interface StaffChatMessageItem {
  id: string;
  senderType: 'admin' | 'receptionist' | 'specialist';
  senderName: string | null;
  content: string;
  createdAt: string;
}

/**
 * Iniciar sesión en el portal móvil con Código de Empresa + PIN de 4 dígitos
 */
export async function staffLogin(companyCode: string, accessPin: string) {
  const cleanCode = (companyCode || '').trim().toUpperCase();
  const cleanPin = (accessPin || '').trim();

  if (!cleanCode || !cleanPin) {
    throw new Error('Debes ingresar el Código de Empresa y tu PIN de acceso.');
  }

  // 🛡️ BLINDAJE ANTI-FUERZA BRUTA: Máximo 5 intentos por minuto
  const rateLimitRes = await checkRateLimit(`staff_pin_login_${cleanCode}`, 5);
  if (!rateLimitRes.success) {
    throw new Error('Demasiados intentos fallidos de acceso. Por seguridad, espera 1 minuto antes de reintentar.');
  }

  // 1. Buscar organización por código
  const { data: org, error: orgErr } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name, is_active, enabled_modules, industry_preset')
    .eq('company_code', cleanCode)
    .maybeSingle();

  if (orgErr || !org) {
    throw new Error('Código de empresa no encontrado. Verifica con tu administrador.');
  }

  if (org.is_active === false) {
    throw new Error('La cuenta de esta empresa se encuentra suspendida.');
  }

  // 2. Buscar colaborador por PIN y organización
  const { data: spec, error: specErr } = await supabaseAdmin
    .from('specialists')
    .select('id, name, specialty, is_active')
    .eq('organization_id', org.id)
    .eq('access_pin', cleanPin)
    .eq('is_active', true)
    .maybeSingle();

  if (specErr || !spec) {
    throw new Error('PIN incorrecto o colaborador no activo.');
  }

  // 3. Crear sesión y almacenar en Cookie segura
  const sessionData: StaffSession = {
    specialistId: spec.id,
    specialistName: spec.name,
    organizationId: org.id,
    organizationName: org.name,
    companyCode: cleanCode,
    specialty: spec.specialty || 'Colaborador',
    loggedInAt: Date.now(),
    enabledModules: org.enabled_modules || {},
    industryPreset: org.industry_preset || 'services',
  };

  const cookieStore = cookies();
  const encryptedSession = encryptSecret(JSON.stringify(sessionData));
  cookieStore.set(STAFF_COOKIE_NAME, encryptedSession, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: THIRTY_DAYS_SEC,
    path: '/',
  });

  return { success: true, session: sessionData };
}

/**
 * Obtener la sesión activa del colaborador desde la cookie (Cifrada con AES-256-GCM)
 */
export async function getStaffSession(): Promise<StaffSession | null> {
  try {
    const cookieStore = cookies();
    const raw = cookieStore.get(STAFF_COOKIE_NAME)?.value;
    if (!raw) return null;

    // Descifrado seguro AES-256-GCM
    const decrypted = decryptSecret(raw);
    const session = JSON.parse(decrypted) as StaffSession;

    if (!session?.specialistId) return null;

    // 🛡️ BLINDAJE DE REVOCACIÓN INMEDIATA: Validar que el colaborador siga activo y aprobado
    const { data: spec } = await (supabaseAdmin.from('specialists') as any)
      .select('id, is_active, approval_status, organization:organizations(enabled_modules, industry_preset)')
      .eq('id', session.specialistId)
      .maybeSingle();

    if (!spec || !spec.is_active || spec.approval_status !== 'approved') {
      // Destruir cookie si el colaborador fue desactivado o revocado por el admin
      cookieStore.delete(STAFF_COOKIE_NAME);
      return null;
    }

    if (spec.organization) {
      session.enabledModules = spec.organization.enabled_modules || {};
      session.industryPreset = spec.organization.industry_preset || 'services';
    }

    return session;
  } catch {
    return null;
  }
}

/**
 * Cerrar sesión del colaborador
 */
export async function staffLogout() {
  const cookieStore = cookies();
  cookieStore.delete(STAFF_COOKIE_NAME);
  return { success: true };
}

/**
 * Obtener la agenda de citas de hoy para el colaborador autenticado
 */
export async function getStaffTodayAgenda(): Promise<{
  appointments: StaffAppointmentItem[];
  stats: { totalToday: number; completedToday: number; pendingToday: number };
}> {
  const session = await getStaffSession();
  if (!session) {
    throw new Error('No autorizado: Sesión de colaborador no activa.');
  }

  // Rango de hoy en hora local (00:00 a 23:59)
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  const dayStartISO = new Date(`${dateStr}T00:00:00-05:00`).toISOString();
  const dayEndISO = new Date(`${dateStr}T23:59:59-05:00`).toISOString();

  // Consultar citas del colaborador
  const { data: appts, error } = await supabaseAdmin
    .from('appointments')
    .select(`
      id,
      service_name,
      duration_minutes,
      start_time,
      end_time,
      status,
      notes,
      booked_via,
      client_notified_delay_at,
      contact_id,
      room_id
    `)
    .eq('specialist_id', session.specialistId)
    .gte('start_time', dayStartISO)
    .lte('start_time', dayEndISO)
    .neq('status', 'cancelled')
    .order('start_time', { ascending: true });

  if (error) {
    throw new Error(`Error al cargar agenda: ${error.message}`);
  }

  // Cargar contactos y salones asociados
  const contactIds = (appts || []).map(a => a.contact_id).filter(Boolean) as string[];
  const roomIds = (appts || []).map(a => a.room_id).filter(Boolean) as string[];

  let contactsMap = new Map<string, { name: string | null; phone: string }>();
  if (contactIds.length > 0) {
    const { data: contactsData } = await supabaseAdmin
      .from('contacts')
      .select('id, name, phone')
      .in('id', contactIds);
    (contactsData || []).forEach(c => contactsMap.set(c.id, { name: c.name, phone: c.phone }));
  }

  let roomsMap = new Map<string, string>();
  if (roomIds.length > 0) {
    const { data: roomsData } = await supabaseAdmin
      .from('physical_rooms')
      .select('id, name')
      .in('id', roomIds);
    (roomsData || []).forEach(r => roomsMap.set(r.id, r.name));
  }

  const items: StaffAppointmentItem[] = (appts || []).map(a => {
    const contact = a.contact_id ? contactsMap.get(a.contact_id) : null;
    return {
      id: a.id,
      serviceName: a.service_name,
      durationMinutes: a.duration_minutes,
      startTime: a.start_time,
      endTime: a.end_time,
      status: a.status as any,
      clientName: contact?.name || 'Cliente en sala',
      clientPhone: contact?.phone || '',
      roomName: a.room_id ? roomsMap.get(a.room_id) || null : null,
      notes: a.notes,
      bookedVia: a.booked_via,
      delayNotifiedAt: a.client_notified_delay_at,
    };
  });

  const completed = items.filter(i => i.status === 'completed').length;

  return {
    appointments: items,
    stats: {
      totalToday: items.length,
      completedToday: completed,
      pendingToday: items.length - completed,
    },
  };
}

/**
 * Registro de 1 toque: "Cliente en el local (Walk-in)"
 */
export async function staffRegisterWalkIn(durationMinutes: number = 40, clientName?: string) {
  const session = await getStaffSession();
  if (!session) throw new Error('No autorizado.');

  await AppointmentService.registerWalkIn({
    organizationId: session.organizationId,
    specialistId: session.specialistId,
    durationMinutes,
    clientName: clientName || 'Cliente espontáneo',
  });

  revalidatePath('/colaborador');
  return { success: true };
}

/**
 * Botón de 1 toque: "+15 min de retraso" con aviso al siguiente cliente
 */
export async function staffReportDelay(appointmentId: string, delayMinutes: number = 15) {
  const session = await getStaffSession();
  if (!session) throw new Error('No autorizado.');

  const res = await AppointmentService.reportDelay({
    appointmentId,
    delayMinutes,
  });

  revalidatePath('/colaborador');
  return res;
}

/**
 * Cambiar estado de la cita (ej. En atención, Finalizado)
 */
export async function staffUpdateAppointmentStatus(
  appointmentId: string,
  newStatus: 'in_progress' | 'completed'
) {
  const session = await getStaffSession();
  if (!session) throw new Error('No autorizado.');

  const { error } = await supabaseAdmin
    .from('appointments')
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', appointmentId)
    .eq('specialist_id', session.specialistId);

  if (error) {
    throw new Error(`Error al actualizar estado: ${error.message}`);
  }

  revalidatePath('/colaborador');
  return { success: true };
}

/**
 * Cargar horarios de disponibilidad semanal y bloqueos del colaborador
 */
export async function staffGetAvailability() {
  const session = await getStaffSession();
  if (!session) throw new Error('No autorizado.');

  const [specRes, unavailRes] = await Promise.all([
    supabaseAdmin
      .from('specialists')
      .select('weekly_schedule')
      .eq('id', session.specialistId)
      .single(),
    supabaseAdmin
      .from('specialist_unavailability')
      .select('id, start_time, end_time, reason, is_all_day')
      .eq('specialist_id', session.specialistId)
      .gte('end_time', new Date().toISOString())
      .order('start_time', { ascending: true }),
  ]);

  const weeklySchedule = specRes.data?.weekly_schedule || {};
  const unavailabilities: StaffUnavailabilityItem[] = (unavailRes.data || []).map(u => ({
    id: u.id,
    startTime: u.start_time,
    endTime: u.end_time,
    reason: u.reason,
    isAllDay: u.is_all_day || false,
  }));

  return { weeklySchedule, unavailabilities };
}

/**
 * Actualizar horario semanal por el propio colaborador
 */
export async function staffSaveWeeklySchedule(weeklySchedule: any) {
  const session = await getStaffSession();
  if (!session) throw new Error('No autorizado.');

  const { error } = await supabaseAdmin
    .from('specialists')
    .update({
      weekly_schedule: weeklySchedule,
      updated_at: new Date().toISOString(),
    })
    .eq('id', session.specialistId);

  if (error) {
    throw new Error(`Error al guardar disponibilidad: ${error.message}`);
  }

  revalidatePath('/colaborador');
  return { success: true };
}

/**
 * Bloquear rango de horas o día completo por emergencia/cita médica
 */
export async function staffBlockTime(input: {
  startTime: string;
  endTime: string;
  reason: string;
  isAllDay?: boolean;
}) {
  const session = await getStaffSession();
  if (!session) throw new Error('No autorizado.');

  const res = await AppointmentService.blockSpecialistTime({
    organizationId: session.organizationId,
    specialistId: session.specialistId,
    startTime: input.startTime,
    endTime: input.endTime,
    reason: input.reason,
    isAllDay: input.isAllDay || false,
  });

  // Notificar en el chat interno para el administrador/mostrador
  try {
    const formattedRange = `${new Date(input.startTime).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true })} a ${new Date(input.endTime).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    await supabaseAdmin.from('internal_chat_messages').insert({
      organization_id: session.organizationId,
      specialist_id: session.specialistId,
      sender_type: 'specialist',
      sender_name: session.specialistName,
      content: `⚠️ Bloqueo de horario registrado: ${formattedRange}. Motivo: ${input.reason || 'Trámite personal'}. ${res.affectedCount > 0 ? `(${res.affectedCount} citas afectadas)` : ''}`,
    });
  } catch (chatErr) {
    console.warn('[Staff] Error enviando aviso de bloqueo al chat:', chatErr);
  }

  revalidatePath('/colaborador');
  return { success: true, affectedCount: res.affectedCount };
}

/**
 * Eliminar un bloqueo de horario
 */
export async function staffDeleteBlock(blockId: string) {
  const session = await getStaffSession();
  if (!session) throw new Error('No autorizado.');

  const { error } = await supabaseAdmin
    .from('specialist_unavailability')
    .delete()
    .eq('id', blockId)
    .eq('specialist_id', session.specialistId);

  if (error) {
    throw new Error(`Error al eliminar bloqueo: ${error.message}`);
  }

  revalidatePath('/colaborador');
  return { success: true };
}

/**
 * Cargar mensajes del chat interno con la sede
 */
export async function getStaffChatMessages(): Promise<StaffChatMessageItem[]> {
  const session = await getStaffSession();
  if (!session) throw new Error('No autorizado.');

  const { data, error } = await supabaseAdmin
    .from('internal_chat_messages')
    .select('id, sender_type, sender_name, content, created_at')
    .eq('specialist_id', session.specialistId)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) {
    throw new Error(`Error al cargar chat: ${error.message}`);
  }

  return (data || []).map(m => ({
    id: m.id,
    senderType: m.sender_type as any,
    senderName: m.sender_name,
    content: m.content,
    createdAt: m.created_at,
  }));
}

/**
 * Enviar mensaje desde el colaborador hacia la administración
 */
export async function sendStaffChatMessage(content: string) {
  const session = await getStaffSession();
  if (!session) throw new Error('No autorizado.');

  const cleanContent = (content || '').trim();
  if (!cleanContent) return { success: false };

  const { data, error } = await supabaseAdmin
    .from('internal_chat_messages')
    .insert({
      organization_id: session.organizationId,
      specialist_id: session.specialistId,
      sender_type: 'specialist',
      sender_name: session.specialistName,
      content: cleanContent,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Error al enviar mensaje: ${error.message}`);
  }

  revalidatePath('/colaborador');
  return { success: true, message: data };
}

/**
 * ==============================================================================
 * SISTEMA DE INVITACIONES EFÍMERAS (24H), AUTO-REGISTRO Y APROBACIÓN POR EL ADMIN
 * ==============================================================================
 */

/**
 * El Administrador genera una invitación efímera (24h) con token HMAC único de un solo uso
 */
export async function createStaffInvitation(organizationId: string) {
  const { rawToken, tokenHash } = generateInviteToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 horas

  const { data: inv, error } = await (supabaseAdmin.from('staff_invitations') as any)
    .insert({
      organization_id: organizationId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      is_used: false,
    })
    .select('id, expires_at')
    .single();

  if (error) {
    throw new Error(`Error al generar invitación: ${error.message}`);
  }

  return {
    success: true,
    rawToken,
    expiresAt,
    invitePath: `/colaborador/join?token=${rawToken}`,
  };
}

/**
 * Valida si un token de invitación sigue vigente y no ha sido usado
 */
export async function validateStaffInvitation(token: string) {
  const cleanToken = (token || '').trim();
  if (!cleanToken) return { valid: false, error: 'Token no proporcionado' };

  const tokenHash = hashToken(cleanToken);

  const { data: inv, error } = await (supabaseAdmin.from('staff_invitations') as any)
    .select('id, organization_id, expires_at, is_used')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error || !inv) {
    return { valid: false, error: 'Invitación no encontrada o enlace inválido.' };
  }

  if (inv.is_used) {
    return { valid: false, error: 'Este enlace de invitación ya fue utilizado previamente.' };
  }

  const isExpired = new Date(inv.expires_at).getTime() < Date.now();
  if (isExpired) {
    return { valid: false, error: 'Esta invitación ha caducado (vigencia máxima: 24 horas).' };
  }

  // Obtener datos públicos de la empresa para mostrar en el formulario
  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name, company_code')
    .eq('id', inv.organization_id)
    .single();

  return {
    valid: true,
    invitationId: inv.id,
    organizationId: inv.organization_id,
    companyName: org?.name || 'Tu Empresa',
    companyCode: org?.company_code || '',
  };
}

/**
 * El colaborador se auto-registra con el token de invitación (queda en pending_approval)
 */
export async function staffRegisterWithInvitation(input: {
  token: string;
  name: string;
  phone: string;
  specialty: string;
  password: string;
}) {
  const validation = await validateStaffInvitation(input.token);
  if (!validation.valid || !validation.organizationId) {
    throw new Error(validation.error || 'Invitación inválida.');
  }

  const name = (input.name || '').trim();
  const phone = (input.phone || '').trim();
  const specialty = (input.specialty || '').trim();
  const password = (input.password || '').trim();

  if (name.length < 2) throw new Error('Ingresa tu nombre completo.');
  if (phone.length < 7) throw new Error('Ingresa un número de celular válido.');
  if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');

  // Verificar si el teléfono ya está registrado en esta empresa
  const { data: existing } = await supabaseAdmin
    .from('specialists')
    .select('id')
    .eq('organization_id', validation.organizationId)
    .eq('phone', phone)
    .maybeSingle();

  if (existing) {
    throw new Error('Este número de teléfono ya está registrado en el equipo.');
  }

  const passwordHash = hashPassword(password);

  // 1. Crear el colaborador en estado 'pending'
  const { data: newSpec, error: specErr } = await (supabaseAdmin.from('specialists') as any)
    .insert({
      organization_id: validation.organizationId,
      name,
      phone,
      specialty: specialty || 'Colaborador',
      access_pin: phone.slice(-4), // PIN de respaldo automático (últimos 4 dígitos)
      password_hash: passwordHash,
      approval_status: 'pending',
      is_active: true,
    })
    .select('id, name')
    .single();

  if (specErr || !newSpec) {
    throw new Error(`Error al registrar colaborador: ${specErr?.message}`);
  }

  // 2. Marcar el token de invitación como consumido (One-time token)
  const tokenHash = hashToken(input.token);
  await (supabaseAdmin.from('staff_invitations') as any)
    .update({
      is_used: true,
      used_by_specialist_id: newSpec.id,
    })
    .eq('token_hash', tokenHash);

  // 3. Notificar internamente para el administrador
  try {
    await supabaseAdmin.from('internal_chat_messages').insert({
      organization_id: validation.organizationId,
      specialist_id: newSpec.id,
      sender_type: 'specialist',
      sender_name: name,
      content: `👋 Nuevo colaborador registrado: ${name} (${specialty || 'General'}, Tel: ${phone}). Esperando aprobación de la administración.`,
    });
  } catch (err) {
    console.warn('[Staff Register] Error creando aviso de registro:', err);
  }

  return {
    success: true,
    pendingApproval: true,
    message: 'Registro completado. Tu cuenta será habilitada una vez que la administración la apruebe.',
  };
}

/**
 * Login seguro con Celular y Contraseña
 */
export async function staffLoginWithPhone(input: {
  phone: string;
  password: string;
  companyCode?: string;
}) {
  const phone = (input.phone || '').trim();
  const password = (input.password || '').trim();
  const code = (input.companyCode || '').trim().toUpperCase();

  if (!phone || !password) {
    throw new Error('Debes ingresar tu número de celular y contraseña.');
  }

  // 🛡️ BLINDAJE ANTI-FUERZA BRUTA: Máximo 5 intentos por minuto
  const rateLimitRes = await checkRateLimit(`staff_phone_login_${phone}`, 5);
  if (!rateLimitRes.success) {
    throw new Error('Demasiados intentos fallidos de acceso. Por seguridad, espera 1 minuto antes de reintentar.');
  }

  let query = supabaseAdmin
    .from('specialists')
    .select('id, organization_id, name, specialty, password_hash, access_pin, is_active, approval_status')
    .eq('phone', phone)
    .eq('is_active', true);

  // Si especifica código de empresa, filtrar por ella
  if (code) {
    const { data: org } = await (supabaseAdmin.from('organizations') as any)
      .select('id')
      .eq('company_code', code)
      .maybeSingle();
    if (org?.id) {
      query = query.eq('organization_id', org.id);
    }
  }

  const { data: spec, error } = await (query as any).maybeSingle();

  if (error || !spec) {
    throw new Error('Celular o contraseña incorrectos.');
  }

  if (spec.approval_status === 'pending') {
    throw new Error('Tu cuenta está registrada pero aún está pendiente de aprobación por el administrador.');
  }

  if (spec.approval_status === 'rejected') {
    throw new Error('El acceso de esta cuenta ha sido denegado por la administración.');
  }

  // Validar contraseña (o PIN como fallback)
  let isValidPassword = false;
  if (spec.password_hash) {
    isValidPassword = verifyPassword(password, spec.password_hash);
  } else if (spec.access_pin) {
    isValidPassword = spec.access_pin === password;
  }

  if (!isValidPassword) {
    throw new Error('Celular o contraseña incorrectos.');
  }

  // Obtener datos de la empresa para la sesión
  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('name, company_code, enabled_modules, industry_preset')
    .eq('id', spec.organization_id)
    .single();

  const sessionData: StaffSession = {
    specialistId: spec.id,
    specialistName: spec.name,
    organizationId: spec.organization_id,
    organizationName: org?.name || 'Mi Empresa',
    companyCode: org?.company_code || '',
    specialty: spec.specialty || 'Colaborador',
    loggedInAt: Date.now(),
    enabledModules: org?.enabled_modules || {},
    industryPreset: org?.industry_preset || 'services',
  };

  const cookieStore = cookies();
  const encryptedSession = encryptSecret(JSON.stringify(sessionData));
  cookieStore.set(STAFF_COOKIE_NAME, encryptedSession, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: THIRTY_DAYS_SEC,
    path: '/',
  });

  return { success: true, session: sessionData };
}

/**
 * El Administrador aprueba o rechaza a un colaborador registrado
 */
export async function approveSpecialist(specialistId: string, approved: boolean) {
  const newStatus = approved ? 'approved' : 'rejected';

  const { error } = await (supabaseAdmin.from('specialists') as any)
    .update({
      approval_status: newStatus,
      is_active: approved,
      updated_at: new Date().toISOString(),
    })
    .eq('id', specialistId);

  if (error) {
    throw new Error(`Error al actualizar estado de colaborador: ${error.message}`);
  }

  revalidatePath('/settings');
  return { success: true, approvalStatus: newStatus };
}

/**
 * Listar colaboradores para la pantalla de Ajustes del Admin
 */
export async function listSpecialistsForAdmin(organizationId: string) {
  const { data, error } = await (supabaseAdmin.from('specialists') as any)
    .select('id, name, phone, specialty, access_pin, approval_status, is_active, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Error listando colaboradores: ${error.message}`);
  }

  return data || [];
}


