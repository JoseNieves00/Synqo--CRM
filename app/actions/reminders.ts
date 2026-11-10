'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export type ReminderType = 'shipping' | 'reactivation' | 'custom';

export interface CreateReminderInput {
  contactId: string;
  reminderType: ReminderType;
  scheduledFor: string; // ISO 8601 string
  note?: string;
}

export interface ActiveReminderData {
  id: string;
  reminderType: ReminderType;
  scheduledFor: string;
  note?: string;
  createdByName?: string;
  createdAt: string;
}

export interface ReminderItemView {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  assignedTo?: string | null;
  assignedName?: string | null;
  reminderType: ReminderType;
  scheduledFor: string;
  note?: string;
  status: string;
  isOverdue: boolean;
  isToday: boolean;
  createdAt: string;
}

/**
 * Programa un nuevo recordatorio comercial (envío, reactivación o personalizado)
 * para un contacto, registrando auditoría en el chat y actualizando la base de datos.
 */
export async function createContactReminder(input: CreateReminderInput) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, full_name')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) throw new Error('Organización no encontrada');

  const { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .select('id, name, organization_id, custom_fields')
    .eq('id', input.contactId)
    .eq('organization_id', profile.organization_id)
    .single();

  if (!contact) throw new Error('Contacto no encontrado');

  const scheduledDate = new Date(input.scheduledFor);
  if (isNaN(scheduledDate.getTime())) {
    throw new Error('Fecha de recordatorio inválida.');
  }

  // 1. Insertar en tabla scheduled_reminders
  const { data: reminder, error: reminderErr } = await (supabaseAdmin.from('scheduled_reminders') as any)
    .insert({
      contact_id: input.contactId,
      scheduled_for: scheduledDate.toISOString(),
      reminder_type: input.reminderType,
      status: 'pending',
    })
    .select('id, scheduled_for, created_at')
    .single();

  if (reminderErr || !reminder) {
    throw new Error(`Error al programar recordatorio: ${reminderErr?.message}`);
  }

  // 2. Actualizar custom_fields en contacts para visualización instantánea sin joins pesados
  const reminderData: ActiveReminderData = {
    id: reminder.id,
    reminderType: input.reminderType,
    scheduledFor: reminder.scheduled_for,
    note: input.note?.trim() || undefined,
    createdByName: profile.full_name || 'Asesor',
    createdAt: reminder.created_at,
  };

  const currentCustom = (contact.custom_fields as Record<string, any>) || {};
  await (supabaseAdmin.from('contacts') as any)
    .update({
      custom_fields: {
        ...currentCustom,
        active_reminder: reminderData,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.contactId);

  // 3. Auditoría en el historial del chat
  const typeLabel =
    input.reminderType === 'shipping'
      ? '📦 Envío / Despacho'
      : input.reminderType === 'reactivation'
      ? '🔄 Reactivación de Lead'
      : '⏰ Recordatorio';

  const dateFormatted = scheduledDate.toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const noteStr = input.note?.trim() ? ` - Nota: "${input.note.trim()}"` : '';

  await (supabaseAdmin.from('messages') as any).insert({
    contact_id: input.contactId,
    sender_type: 'system',
    content: `[⏰ Recordatorio Programado: ${typeLabel} para el ${dateFormatted} por ${profile.full_name || 'Asesor'}${noteStr}]`,
  });

  revalidatePath('/inbox');
  revalidatePath(`/inbox/${input.contactId}`);
  revalidatePath('/dashboard');

  return { success: true, reminder: reminderData };
}

/**
 * Marca un recordatorio activo como completado ('Marcar Hecho').
 * Registra auditoría interna en el chat y limpia la alerta visual.
 */
export async function completeContactReminder(contactId: string, reminderId?: string, completionNote?: string) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, full_name')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) throw new Error('Organización no encontrada');

  let resolvedContactId = contactId;
  let resolvedReminderId = reminderId;

  // 1. Intentar buscar el contacto directamente por su ID
  let { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .select('id, name, organization_id, custom_fields')
    .eq('id', resolvedContactId)
    .eq('organization_id', profile.organization_id)
    .maybeSingle();

  // 2. Si no se encontró, contactId podría ser en realidad el reminderId (tolerancia bidireccional)
  if (!contact) {
    const { data: reminderRow } = await (supabaseAdmin.from('scheduled_reminders') as any)
      .select('id, contact_id')
      .eq('id', contactId)
      .maybeSingle();

    if (reminderRow) {
      resolvedReminderId = reminderRow.id;
      resolvedContactId = reminderRow.contact_id;
      const { data: c } = await (supabaseAdmin.from('contacts') as any)
        .select('id, name, organization_id, custom_fields')
        .eq('id', resolvedContactId)
        .eq('organization_id', profile.organization_id)
        .maybeSingle();
      contact = c;
    }
  }

  if (!contact) throw new Error('Contacto no encontrado');

  const currentCustom = (contact.custom_fields as Record<string, any>) || {};
  const activeRem = currentCustom.active_reminder;
  const targetId = resolvedReminderId || activeRem?.id;

  if (targetId) {
    await (supabaseAdmin.from('scheduled_reminders') as any)
      .update({ status: 'sent' })
      .eq('id', targetId);
  }

  // Limpiar el recordatorio activo de custom_fields
  await (supabaseAdmin.from('contacts') as any)
    .update({
      custom_fields: {
        ...currentCustom,
        active_reminder: null,
        last_completed_reminder: {
          ...activeRem,
          completedAt: new Date().toISOString(),
          completedBy: profile.full_name || 'Asesor',
          completionNote: completionNote?.trim() || null,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', resolvedContactId);

  const noteStr = completionNote?.trim() ? ` - Detalle: "${completionNote.trim()}"` : '';

  await (supabaseAdmin.from('messages') as any).insert({
    contact_id: resolvedContactId,
    sender_type: 'system',
    content: `[✅ Recordatorio completado por ${profile.full_name || 'Asesor'}${noteStr}]`,
  });

  revalidatePath('/inbox');
  revalidatePath(`/inbox/${resolvedContactId}`);
  revalidatePath('/dashboard');

  return { success: true };
}

/**
 * Cancela o descarta un recordatorio activo.
 */
export async function cancelContactReminder(contactId: string, reminderId?: string) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, full_name')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) throw new Error('Organización no encontrada');

  let resolvedContactId = contactId;
  let resolvedReminderId = reminderId;

  // 1. Intentar buscar el contacto directamente por su ID
  let { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .select('id, name, organization_id, custom_fields')
    .eq('id', resolvedContactId)
    .eq('organization_id', profile.organization_id)
    .maybeSingle();

  // 2. Si no se encontró, contactId podría ser en realidad el reminderId (tolerancia bidireccional)
  if (!contact) {
    const { data: reminderRow } = await (supabaseAdmin.from('scheduled_reminders') as any)
      .select('id, contact_id')
      .eq('id', contactId)
      .maybeSingle();

    if (reminderRow) {
      resolvedReminderId = reminderRow.id;
      resolvedContactId = reminderRow.contact_id;
      const { data: c } = await (supabaseAdmin.from('contacts') as any)
        .select('id, name, organization_id, custom_fields')
        .eq('id', resolvedContactId)
        .eq('organization_id', profile.organization_id)
        .maybeSingle();
      contact = c;
    }
  }

  if (!contact) throw new Error('Contacto no encontrado');

  const currentCustom = (contact.custom_fields as Record<string, any>) || {};
  const activeRem = currentCustom.active_reminder;
  const targetId = resolvedReminderId || activeRem?.id;

  if (targetId) {
    await (supabaseAdmin.from('scheduled_reminders') as any)
      .update({ status: 'cancelled' })
      .eq('id', targetId);
  }

  await (supabaseAdmin.from('contacts') as any)
    .update({
      custom_fields: {
        ...currentCustom,
        active_reminder: null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', resolvedContactId);

  await (supabaseAdmin.from('messages') as any).insert({
    contact_id: resolvedContactId,
    sender_type: 'system',
    content: `[✕ Recordatorio cancelado por ${profile.full_name || 'Asesor'}]`,
  });

  revalidatePath('/inbox');
  revalidatePath(`/inbox/${resolvedContactId}`);
  revalidatePath('/dashboard');

  return { success: true };
}

/**
 * Obtiene los recordatorios pendientes de la organización para el Dashboard y alertas.
 * Permite filtrar por asesor específico o ver el consolidado general para administradores.
 */
export async function getOrganizationPendingReminders(options?: {
  agentId?: string;
}): Promise<{
  overdue: ReminderItemView[];
  today: ReminderItemView[];
  upcoming: ReminderItemView[];
  totalPending: number;
}> {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return { overdue: [], today: [], upcoming: [], totalPending: 0 };
    }

    const { data: profile } = await (supabaseAdmin.from('profiles') as any)
      .select('organization_id, role, is_super_admin')
      .eq('id', user.id)
      .single();

    const orgId = profile?.organization_id;
    if (!orgId) {
      return { overdue: [], today: [], upcoming: [], totalPending: 0 };
    }

    // Consultar contactos de la organización que tengan un recordatorio activo
    let query = (supabaseAdmin.from('contacts') as any)
      .select('id, name, phone, assigned_to, custom_fields')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .not('custom_fields->active_reminder', 'is', null);

    if (options?.agentId && options.agentId !== 'all') {
      query = query.eq('assigned_to', options.agentId);
    }

    const { data: contacts } = await query;

    if (!contacts || contacts.length === 0) {
      return { overdue: [], today: [], upcoming: [], totalPending: 0 };
    }

    // Obtener nombres de agentes asignados
    const agentIds = Array.from(new Set(contacts.map((c: any) => c.assigned_to).filter(Boolean)));
    const agentNameMap = new Map<string, string>();
    if (agentIds.length > 0) {
      const { data: profiles } = await (supabaseAdmin.from('profiles') as any)
        .select('id, full_name')
        .in('id', agentIds);
      if (profiles) {
        for (const p of profiles) {
          agentNameMap.set(p.id, p.full_name || 'Asesor');
        }
      }
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000;

    const overdue: ReminderItemView[] = [];
    const today: ReminderItemView[] = [];
    const upcoming: ReminderItemView[] = [];

    for (const c of contacts) {
      const rem = c.custom_fields?.active_reminder as ActiveReminderData | undefined;
      if (!rem || !rem.scheduledFor) continue;

      const remTime = new Date(rem.scheduledFor).getTime();
      const isOverdue = remTime < now.getTime();
      const isToday = remTime >= todayStart && remTime < todayEnd;

      const item: ReminderItemView = {
        id: rem.id || `rem-${c.id}`,
        contactId: c.id,
        contactName: c.name || 'Lead WhatsApp',
        contactPhone: c.phone || '',
        assignedTo: c.assigned_to,
        assignedName: c.assigned_to ? agentNameMap.get(c.assigned_to) || 'Asesor' : 'Sin Asignar',
        reminderType: rem.reminderType || 'custom',
        scheduledFor: rem.scheduledFor,
        note: rem.note,
        status: 'pending',
        isOverdue,
        isToday,
        createdAt: rem.createdAt || new Date().toISOString(),
      };

      if (isOverdue) {
        overdue.push(item);
      } else if (isToday) {
        today.push(item);
      } else {
        upcoming.push(item);
      }
    }

    // Ordenar por fecha programada (los más urgentes primero)
    overdue.sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());
    today.sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());
    upcoming.sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());

    const totalPending = overdue.length + today.length + upcoming.length;

    return { overdue, today, upcoming, totalPending };
  } catch (err) {
    console.warn('[getOrganizationPendingReminders error]:', err);
    return { overdue: [], today: [], upcoming: [], totalPending: 0 };
  }
}

/**
 * Pausa o reanuda la secuencia de seguimiento automático para un contacto desde el Inbox.
 */
export async function toggleContactFollowUpPause(contactId: string, paused: boolean) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id, full_name')
    .eq('id', user.id)
    .single();
  if (!profile?.organization_id) throw new Error('Organización no encontrada');

  const { data: contact } = await (supabaseAdmin.from('contacts') as any)
    .select('id, custom_fields')
    .eq('id', contactId)
    .eq('organization_id', profile.organization_id)
    .single();
  if (!contact) throw new Error('Contacto no encontrado');

  const cf = (contact.custom_fields as Record<string, any>) || {};
  const nextFollowUp: Record<string, any> = {
    ...(cf.follow_up || { category: 'warm', currentStepIndex: 0 }),
    paused,
  };
  if (paused) {
    delete nextFollowUp.nextSendAt;
  }
  const nextCustom = {
    ...cf,
    follow_up: nextFollowUp,
  };

  await (supabaseAdmin.from('contacts') as any)
    .update({ custom_fields: nextCustom, updated_at: new Date().toISOString() })
    .eq('id', contactId)
    .eq('organization_id', profile.organization_id);

  await (supabaseAdmin.from('messages') as any).insert({
    contact_id: contactId,
    sender_type: 'system',
    content: `[${paused ? '⏸️ Seguimiento automático pausado' : '▶️ Seguimiento automático reanudado'} por ${profile.full_name || 'Asesor'}]`,
  });

  revalidatePath('/inbox');
  revalidatePath(`/inbox/${contactId}`);
  return { success: true, paused };
}
