import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { LeadReactivationService } from '@/services/reactivation.service';
import { OpenAIService } from '@/services/openai.service';
import { PlatformAlertService } from '@/services/platform-alert.service';
import { ConversationAuditService } from '@/lib/ai/prompt-assistant/conversation-audit';
import { LeadScoreService } from '@/services/lead-score.service';
import { CampaignService } from '@/services/campaign.service';

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
    // Presupuesto de tiempo: Vercel corta a los 60s. Lo crítico (score + recontacto) va primero;
    // las tareas pesadas de IA solo corren si queda margen suficiente.
    const startedAt = Date.now();
    const HARD_BUDGET_MS = 50_000;
    const remainingMs = () => HARD_BUDGET_MS - (Date.now() - startedAt);

    // 1. Score de propensión (decaimiento por recencia) → alimenta el orden del recontacto
    const leadScoreResult = await LeadScoreService.recomputeStale({
      organizationId: orgId,
      staleHours: 6,
      maxContacts: 800,
      deadlineMs: startedAt + 8_000,
    });

    // 2. Recontacto autónomo (núcleo del pilar de automatización)
    const reactivationResult = await LeadReactivationService.processAutonomousLeadReactivations(orgId);
    const archiveResult = await LeadReactivationService.processAutoArchiveUnresponsiveReactivations(orgId);

    // 2b. Campañas IA a segmentos (comparten topes anti-ban con el recontacto)
    const campaignResult =
      remainingMs() > 10_000
        ? await CampaignService.processRunningCampaigns({
            organizationId: orgId,
            deadlineMs: Date.now() + Math.min(20_000, remainingMs() - 8_000),
          }).catch((err: any) => ({ error: String(err?.message || err) }))
        : { skipped: 'time_budget' };

    // 3. Tareas de IA en lote, solo con margen de tiempo
    const autoClassifyResult =
      remainingMs() > 20_000
        ? await OpenAIService.classifyUnclassifiedContactsForActiveOrgs(orgId, 5, 35)
        : { skipped: 'time_budget' };
    const passiveAuditResult =
      remainingMs() > 15_000
        ? await ConversationAuditService.runPassiveDailyAuditsForActiveOrgs(orgId, 6).catch(() => ({
            auditedOrgs: 0,
            skippedOrgs: 0,
          }))
        : { auditedOrgs: 0, skippedOrgs: 0, skipped: 'time_budget' };
    const superAdminDigestSent =
      !orgId && remainingMs() > 5_000
        ? await PlatformAlertService.sendDailyDigestIfDue().catch(() => false)
        : false;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      ...reactivationResult,
      leadScore: leadScoreResult,
      campaigns: campaignResult,
      autoClassified: autoClassifyResult,
      autoArchivedUnresponsive: archiveResult.autoArchivedCount,
      passiveConversationAudits: passiveAuditResult,
      superAdminDigestSent,
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
