import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { MessagingService } from '@/services/messaging.service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Cron Job para el Daily Briefing matutino (Agenda del Día por WhatsApp).
 * Se ejecuta al iniciar la jornada (ej. 7:30 - 8:00 AM) para notificar a los especialistas
 * y asesores qué citas atenderán durante el día.
 */
export async function GET(request: NextRequest) {
  return handleDailyBriefing(request);
}

export async function POST(request: NextRequest) {
  return handleDailyBriefing(request);
}

async function handleDailyBriefing(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.warn('[CRON SECURITY ALERT] CRON_SECRET no está configurado en el servidor.');
    return NextResponse.json({ error: 'Unauthorized: CRON_SECRET not configured' }, { status: 401 });
  }

  const authHeader = request.headers.get('authorization');
  const { searchParams } = new URL(request.url);
  const secretParam = searchParams.get('secret') || searchParams.get('cron_secret');

  let isAuthorized = false;

  if (authHeader) {
    const expectedHeader = `Bearer ${cronSecret}`;
    const authBuf = Buffer.from(authHeader, 'utf8');
    const expBuf = Buffer.from(expectedHeader, 'utf8');
    if (authBuf.length === expBuf.length && crypto.timingSafeEqual(authBuf, expBuf)) {
      isAuthorized = true;
    }
  } else if (secretParam) {
    const paramBuf = Buffer.from(secretParam, 'utf8');
    const secretBuf = Buffer.from(cronSecret, 'utf8');
    if (paramBuf.length === secretBuf.length && crypto.timingSafeEqual(paramBuf, secretBuf)) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized: Invalid or missing CRON_SECRET' }, { status: 401 });
  }

  const targetOrgId = searchParams.get('orgId') || undefined;

  try {
    let orgsQuery = (supabaseAdmin.from('organizations') as any)
      .select('id, name, whatsapp_provider, whatsapp_phone_number_id, whatsapp_access_token, evolution_api_url, evolution_api_key, evolution_instance_name, evolution_anti_ban_mode, evolution_max_outbound_per_hour, appointment_settings, enabled_modules')
      .eq('is_active', true);

    if (targetOrgId) {
      orgsQuery = orgsQuery.eq('id', targetOrgId);
    }

    const { data: orgs, error: orgsErr } = await orgsQuery;
    if (orgsErr) throw new Error(`Error consultando empresas: ${orgsErr.message}`);

    let totalNotificationsSent = 0;
    const details: Array<{ orgId: string; orgName: string; sentTo: string; count: number }> = [];

    for (const org of orgs || []) {
      const enabledModules = org.enabled_modules || {};
      // Si la empresa tiene apagado el módulo de citas, no requiere briefing de citas
      if (enabledModules.native_calendar === false) continue;

      const appSettings = (org.appointment_settings as Record<string, any>) || {};
      const timezone = appSettings.timezone || 'America/Bogota';

      // Calcular inicio y fin del día local (00:00:00 a 23:59:59)
      const now = new Date();
      const localDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now); // "YYYY-MM-DD"
      const dayStartIso = `${localDateStr}T00:00:00.000Z`;
      const dayEndIso = `${localDateStr}T23:59:59.999Z`;

      // Consultar citas confirmadas para hoy
      const { data: appointments, error: apptErr } = await (supabaseAdmin.from('appointments') as any)
        .select(`
          id,
          service_name,
          start_time,
          specialist_id,
          meeting_link,
          notes,
          contacts:contact_id (
            id,
            name,
            phone
          ),
          specialists:specialist_id (
            id,
            name,
            phone
          )
        `)
        .eq('organization_id', org.id)
        .eq('status', 'confirmed')
        .gte('start_time', dayStartIso)
        .lte('start_time', dayEndIso)
        .order('start_time', { ascending: true });

      if (apptErr || !appointments || appointments.length === 0) {
        continue;
      }

      // Agrupar citas por especialista
      const bySpecialist = new Map<string, any[]>();
      const unassigned: any[] = [];

      for (const appt of appointments) {
        if (appt.specialist_id && appt.specialists) {
          const list = bySpecialist.get(appt.specialist_id) || [];
          list.push(appt);
          bySpecialist.set(appt.specialist_id, list);
        } else {
          unassigned.push(appt);
        }
      }

      // 1. Notificar a cada especialista asignado que tenga número de teléfono
      for (const [specId, specAppts] of bySpecialist.entries()) {
        const spec = specAppts[0].specialists;
        if (!spec?.phone) continue;

        const dateHeader = new Intl.DateTimeFormat('es-CO', {
          timeZone: timezone,
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }).format(now);

        const agendaLines = specAppts.map((a: any, idx: number) => {
          const timeStr = new Intl.DateTimeFormat('es-CO', {
            timeZone: timezone,
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          }).format(new Date(a.start_time));

          const clientName = a.contacts?.name || a.contacts?.phone || 'Cliente';
          const linkStr = a.meeting_link ? `\n   🔗 Link: ${a.meeting_link}` : '';
          return `${idx + 1}️⃣ *${timeStr}* - ${clientName}\n   📌 Servicio: ${a.service_name}${linkStr}`;
        });

        const body = `☀️ *¡Buenos días, ${spec.name}! Agenda de Hoy*\n📅 *${dateHeader}*\n\nTienes *${specAppts.length}* cita(s) programada(s) para hoy:\n\n${agendaLines.join('\n\n')}\n\n¡Que tengas una jornada productiva y llena de éxitos! 🚀`;

        try {
          await MessagingService.sendTextMessage({
            organization: org,
            to: spec.phone,
            body,
            simulateTyping: false,
          });
          totalNotificationsSent++;
          details.push({ orgId: org.id, orgName: org.name, sentTo: spec.name, count: specAppts.length });
        } catch (e: any) {
          console.warn(`[Daily Briefing] Error notificando a especialista ${spec.name}:`, e.message);
        }
      }

      // 2. Si hay citas sin especialista o se configuró notification_phone global, enviar resumen al negocio
      const notificationPhone = appSettings.notification_phone;
      if (notificationPhone && appointments.length > 0) {
        const dateHeader = new Intl.DateTimeFormat('es-CO', {
          timeZone: timezone,
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }).format(now);

        const agendaLines = appointments.map((a: any, idx: number) => {
          const timeStr = new Intl.DateTimeFormat('es-CO', {
            timeZone: timezone,
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          }).format(new Date(a.start_time));

          const clientName = a.contacts?.name || a.contacts?.phone || 'Cliente';
          const specName = a.specialists?.name ? ` (Atiende: ${a.specialists.name})` : '';
          return `${idx + 1}️⃣ *${timeStr}* - ${clientName}${specName}\n   📌 ${a.service_name}`;
        });

        const adminBody = `📋 *Resumen Matutino de Agenda - ${org.name}*\n📅 *${dateHeader}*\n\nTotal del día: *${appointments.length}* cita(s) confirmada(s):\n\n${agendaLines.join('\n\n')}\n\n¡Excelente día para todo el equipo! 🚀`;

        try {
          await MessagingService.sendTextMessage({
            organization: org,
            to: notificationPhone,
            body: adminBody,
            simulateTyping: false,
          });
          totalNotificationsSent++;
          details.push({ orgId: org.id, orgName: org.name, sentTo: `Admin (${notificationPhone})`, count: appointments.length });
        } catch (e: any) {
          console.warn(`[Daily Briefing] Error notificando al teléfono del admin ${notificationPhone}:`, e.message);
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      totalNotificationsSent,
      details,
    });
  } catch (err: any) {
    console.error('[CRON DAILY BRIEFING ERROR]', err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Error procesando daily briefing matutino',
      },
      { status: 500 }
    );
  }
}
