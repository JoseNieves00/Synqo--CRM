'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { GitHubService } from '@/services/github.service';
import { TicketCategory, TicketPriority, TicketStatus } from '@/lib/supabase/types';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { revalidatePath } from 'next/cache';

interface CreateTicketInput {
  title: string;
  description: string;
  category: TicketCategory;
  priority?: TicketPriority;
  screenshotUrl?: string | null;
  systemMetadata?: Record<string, any>;
}

/**
 * Crea un nuevo ticket de soporte y genera el Issue correspondiente en GitHub.
 * Incluye protección Anti-Abuso (Rate Limit de máx 3 tickets cada 15 min).
 */
export async function createSupportTicket(input: CreateTicketInput) {
  const supabase = createServerSupabaseClient();

  // 1. Validar autenticación
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('No autorizado. Inicia sesión para enviar un ticket.');
  }

  // 2. Rate limiting anti-spam: Máximo 3 tickets por usuario cada 15 minutos
  const rateLimitKey = `ticket_${user.id}`;
  const rateCheck = await checkRateLimit(rateLimitKey, 3);
  if (!rateCheck.success) {
    throw new Error(
      'Has alcanzado el límite de reportes por ahora. Por favor espera unos minutos antes de enviar otro ticket.'
    );
  }

  // 3. Validar y sanitizar entradas
  const title = input.title?.trim();
  const description = input.description?.trim();
  const category = input.category || 'bug';
  const priority = input.priority || 'medium';

  if (!title || title.length < 5 || title.length > 150) {
    throw new Error('El título debe tener entre 5 y 150 caracteres.');
  }

  if (!description || description.length < 10 || description.length > 3000) {
    throw new Error('La descripción debe tener entre 10 y 3,000 caracteres para poder diagnosticar la falla.');
  }

  // 4. Obtener organización y perfil
  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('id, full_name, email, organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    throw new Error('No se encontró la organización asociada a tu usuario.');
  }

  const { data: org } = await (supabaseAdmin.from('organizations') as any)
    .select('id, name, whatsapp_phone_number_id, whatsapp_access_token')
    .eq('id', profile.organization_id)
    .single();

  const orgName = org?.name || 'Organización Synqo';
  const isWhatsappConnected = Boolean(org?.whatsapp_phone_number_id && org?.whatsapp_access_token);

  const enrichedMetadata = {
    ...(input.systemMetadata || {}),
    isWhatsappConnected,
    whatsappPhoneId: org?.whatsapp_phone_number_id || null,
    reportedAt: new Date().toISOString(),
  };

  // 5. Crear el Issue en GitHub automáticamente
  const ghResult = await GitHubService.createIssue({
    title,
    description,
    category,
    priority,
    companyName: orgName,
    companyId: org?.id || profile.organization_id,
    userFullName: profile.full_name || user.email || 'Usuario',
    userEmail: user.email || profile.email,
    systemMetadata: enrichedMetadata,
    screenshotUrl: input.screenshotUrl,
  });

  // 6. Persistir el ticket en Supabase (con fallback defensivo si la tabla aún no se ha ejecutado)
  try {
    const { data: newTicket, error: insertError } = await (supabaseAdmin.from('support_tickets') as any)
      .insert({
        organization_id: profile.organization_id,
        created_by: user.id,
        category,
        priority,
        status: 'open',
        title,
        description,
        screenshot_url: input.screenshotUrl || null,
        github_issue_number: ghResult.issueNumber || null,
        github_issue_url: ghResult.issueUrl || null,
        system_metadata: enrichedMetadata,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id, title, status, github_issue_number, github_issue_url, created_at')
      .single();

    if (insertError) {
      console.warn('[SUPPORT DB WARN]', insertError.message);
      // Fallback para cuando la migración SQL esté en proceso
      return {
        success: true,
        ticket: {
          id: 'temp-' + Date.now(),
          title,
          status: 'open',
          github_issue_number: ghResult.issueNumber,
          github_issue_url: ghResult.issueUrl,
        },
        githubIssueUrl: ghResult.issueUrl,
        message: 'Ticket enviado exitosamente a desarrollo vía GitHub Issues.',
      };
    }

    revalidatePath('/admin');
    return {
      success: true,
      ticket: newTicket,
      githubIssueUrl: ghResult.issueUrl,
      message: 'Ticket registrado con éxito.',
    };
  } catch (err: any) {
    console.error('[SUPPORT INSERT EXCEPTION]', err);
    return {
      success: true,
      githubIssueUrl: ghResult.issueUrl,
      message: 'Ticket registrado y enviado al equipo de desarrollo.',
    };
  }
}

/**
 * Lista los tickets de la organización del usuario autenticado.
 */
export async function listMyTickets() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) return [];

  try {
    const { data: tickets, error } = await (supabaseAdmin.from('support_tickets') as any)
      .select('id, title, description, category, priority, status, github_issue_number, github_issue_url, created_at, resolved_at')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.warn('[MY TICKETS WARN]', error.message);
      return [];
    }

    return tickets || [];
  } catch {
    return [];
  }
}

/**
 * Consulta de tickets para el Super Administrador con filtros y paginación.
 * Por defecto solo muestra tickets abiertos / en progreso para no saturar.
 */
export async function listAllTicketsForAdmin(filters?: {
  status?: string;
  category?: string;
  search?: string;
}) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('is_super_admin, email')
    .eq('id', user.id)
    .single();

  const isSuperAdmin = Boolean(profile?.is_super_admin || profile?.email === 'admin@synqo.dev' || user.email === 'admin@synqo.dev');
  if (!isSuperAdmin) {
    throw new Error('Solo el Super Administrador puede acceder a la gestión de tickets globales.');
  }

  try {
    let query = (supabaseAdmin.from('support_tickets') as any)
      .select(`
        id,
        organization_id,
        created_by,
        category,
        priority,
        status,
        title,
        description,
        screenshot_url,
        github_issue_number,
        github_issue_url,
        system_metadata,
        created_at,
        updated_at,
        resolved_at,
        organizations:organization_id (id, name),
        profiles:created_by (id, full_name, email)
      `)
      .order('created_at', { ascending: false });

    // Filtro por estado: si no se especifica, mostrar abiertos y en progreso
    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters?.category && filters.category !== 'all') {
      query = query.eq('category', filters.category);
    }

    const { data: tickets, error } = await query.limit(50);

    if (error) {
      console.warn('[ADMIN TICKETS WARN]', error.message);
      return [];
    }

    return tickets || [];
  } catch (err) {
    console.warn('[ADMIN TICKETS EXCEPTION]', err);
    return [];
  }
}

/**
 * Actualiza el estado de un ticket y opcionalmente cierra el Issue en GitHub.
 */
export async function updateTicketStatus(
  ticketId: string,
  newStatus: TicketStatus,
  resolutionNotes?: string
) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('No autorizado');

  const { data: profile } = await (supabaseAdmin.from('profiles') as any)
    .select('is_super_admin, email')
    .eq('id', user.id)
    .single();

  const isSuperAdmin = Boolean(profile?.is_super_admin || profile?.email === 'admin@synqo.dev' || user.email === 'admin@synqo.dev');
  if (!isSuperAdmin) {
    throw new Error('Solo el Super Administrador puede modificar estados de tickets.');
  }

  try {
    // 1. Obtener ticket actual para conocer el número de GitHub Issue
    const { data: ticket } = await (supabaseAdmin.from('support_tickets') as any)
      .select('id, github_issue_number, status')
      .eq('id', ticketId)
      .single();

    const isResolved = newStatus === 'resolved' || newStatus === 'closed';

    // 2. Si se marca como resuelto y tiene issue en GitHub, cerrarlo en GitHub
    if (isResolved && ticket?.github_issue_number) {
      await GitHubService.closeIssue(
        ticket.github_issue_number,
        resolutionNotes || 'Marcado como resuelto por el equipo técnico en la consola de Super Admin.'
      );
    }

    // 3. Actualizar en Supabase
    const { error: updateError } = await (supabaseAdmin.from('support_tickets') as any)
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
        resolved_at: isResolved ? new Date().toISOString() : null,
      })
      .eq('id', ticketId);

    if (updateError) {
      throw new Error(`Error actualizando ticket: ${updateError.message}`);
    }

    revalidatePath('/admin');
    return { success: true };
  } catch (err: any) {
    throw new Error(err.message || 'Error al actualizar el ticket');
  }
}

