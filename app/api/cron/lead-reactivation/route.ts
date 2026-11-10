import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { LeadReactivationService } from '@/services/reactivation.service';
import { OpenAIService } from '@/services/openai.service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Hasta 60s en Vercel Serverless

/**
 * Endpoint de Cron Worker para Reactivación Autónoma de Leads Fríos (Blindaje Anti-Spam Estricto)
 * Se ejecuta periódicamente (ej. diario a las 10:00 AM o cada 2 horas) por Vercel Cron, pg_cron o scheduler externo.
 */
export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}

async function handleCron(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  // 🛡️ PROTECCIÓN ESTRICTA DE RUTA CRON: Exigir Bearer CRON_SECRET en cabecera Authorization
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
    const autoClassifyResult = await OpenAIService.classifyUnclassifiedContactsForActiveOrgs(orgId, 5, 12);
    const reactivationResult = await LeadReactivationService.processAutonomousLeadReactivations(orgId);
    const archiveResult = await LeadReactivationService.processAutoArchiveUnresponsiveReactivations(orgId);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...reactivationResult,
      autoClassified: autoClassifyResult,
      autoArchivedUnresponsive: archiveResult.autoArchivedCount,
    });
  } catch (err: any) {
    console.error('[CRON LEAD REACTIVATION ERROR]', err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Error procesando reactivaciones autónomas de leads',
      },
      { status: 500 }
    );
  }
}
