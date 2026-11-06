import crypto from 'node:crypto';
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

  // 🛡️ PROTECCIÓN ESTRICTA DE RUTA CRON: Exigir Bearer CRON_SECRET en cabecera Authorization (no se permite bypass por x-vercel-cron)
  if (!cronSecret) {
    console.warn('[CRON SECURITY ALERT] CRON_SECRET no está configurado en el servidor.');
    return NextResponse.json({ error: 'Unauthorized: CRON_SECRET not configured' }, { status: 401 });
  }

  const authHeader = request.headers.get('authorization');
  const expectedHeader = `Bearer ${cronSecret}`;

  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized: Missing Authorization header' }, { status: 401 });
  }

  const authBuf = Buffer.from(authHeader, 'utf8');
  const expBuf = Buffer.from(expectedHeader, 'utf8');

  if (authBuf.length !== expBuf.length || !crypto.timingSafeEqual(authBuf, expBuf)) {
    return NextResponse.json({ error: 'Unauthorized: Invalid CRON_SECRET' }, { status: 401 });
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

