import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ReminderService } from '@/services/reminder.service';
import { AssignmentService } from '@/services/assignment.service';
import { LeadReactivationService } from '@/services/reactivation.service';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Hasta 60s en Vercel Serverless

/**
 * Endpoint de Cron Worker para Recordatorios (24h con Curfew) y Auto-Cancelación a 8 Horas
 * Puede ser invocado periódicamente (ej. cada 15 o 30 minutos) por Vercel Cron, Supabase pg_cron o script externo.
 */
export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}

async function handleCron(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  // 🛡️ PROTECCIÓN ESTRICTA DE RUTA CRON: Exigir Bearer CRON_SECRET en cabecera Authorization (no se permite bypass por x-vercel-cron)
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

  try {
    const orgId = searchParams.get('orgId') || undefined;

    const result = await ReminderService.processAppointmentRemindersAndCancellations(orgId);
    const slaResult = await AssignmentService.reassignStaleHandoffs(orgId);
    const reactivationResult = await LeadReactivationService.processAutonomousLeadReactivations(orgId);
    const archiveResult = await LeadReactivationService.processAutoArchiveUnresponsiveReactivations(orgId);

    await logCronRun(
      'invoked',
      `handoffs: ${slaResult.reallocatedCount} reasignados / ${slaResult.autoResumedCount} retomados por IA`
    );

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
      reallocatedHandoffs: slaResult.reallocatedCount,
      aiAutoResumedHandoffs: slaResult.autoResumedCount,
      autonomousReactivations: reactivationResult,
      autoArchivedUnresponsive: archiveResult.autoArchivedCount,
    });
  } catch (err: any) {
    console.error('[CRON APPOINTMENT REMINDERS ERROR]', err);
    await logCronRun('error', err?.message || 'Error procesando recordatorios de citas');
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Error procesando recordatorios de citas',
      },
      { status: 500 }
    );
  }
}

/** Registro de salud del cron en cron_job_log (visible en el panel SuperAdmin). */
async function logCronRun(status: 'invoked' | 'error', detail: string): Promise<void> {
  try {
    await (supabaseAdmin.from('cron_job_log') as any).insert({
      job_name: 'appointment-reminders',
      status,
      detail: String(detail).slice(0, 400),
    });
  } catch (e) {
    console.warn('[CRON JOB LOG WARN]', e);
  }
}

