import { NextRequest, NextResponse } from 'next/server';
import { ReminderService } from '@/services/reminder.service';

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
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';

  // Si existe CRON_SECRET configurado, exigir cabecera Bearer (a menos que sea Vercel Cron oficial)
  if (cronSecret && !isVercelCron) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized: Invalid CRON_SECRET' }, { status: 401 });
    }
  }

  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId') || undefined;

    const result = await ReminderService.processAppointmentRemindersAndCancellations(orgId);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err: any) {
    console.error('[CRON APPOINTMENT REMINDERS ERROR]', err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Error procesando recordatorios de citas',
      },
      { status: 500 }
    );
  }
}

