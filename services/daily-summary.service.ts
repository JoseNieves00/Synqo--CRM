import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAiUtilityChain } from '@/lib/ai/config';
import { extractOrganizationCapabilities, getBusinessFeatureCompatibility } from '@/lib/ai/copilot-engine';
import { normalizeFollowUpSettings } from '@/lib/ai/follow-up-types';
import { resolveOrganizationGallery } from '@/lib/ai/product-gallery';
import { createChatCompletionWithFallback } from '@/services/openai.service';
import { DashboardTipsService } from '@/services/dashboard-tips.service';

export interface DailyAdminSummaryMetrics {
  dateKey: string;
  dateLabel: string;
  newLeads: number;
  inboundMessages: number;
  aiReplies: number;
  humanReplies: number;
  wonDeals: number;
  revenue: number;
  appointmentsBooked: number;
  pendingHandoffs: number;
  tokensUsed: number;
}

export interface DailyAdminSummaryPayload {
  dateKey: string;
  dateLabel: string;
  generatedAt: string;
  metrics: DailyAdminSummaryMetrics;
  shortSummary: string;
  actionableTip: string;
  tipActionHref: string;
  tipActionLabel: string;
}

/**
 * Calcula la ventana del día anterior (ayer) en la zona horaria de la organización.
 */
export function buildYesterdayWindow(timezone: string): {
  dateKey: string;
  dateLabel: string;
  startIso: string;
  endIso: string;
} {
  const tz = timezone || 'America/Bogota';
  const now = new Date();
  const yesterdayRef = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(yesterdayRef);
  const dateLabel = new Intl.DateTimeFormat('es-CO', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(yesterdayRef);

  // Offset aproximado de Colombia/LATAM o genérico usando partes de fecha local
  const startIso = `${dateKey}T00:00:00.000Z`;
  const endIso = `${dateKey}T23:59:59.999Z`;

  return { dateKey, dateLabel, startIso, endIso };
}

function stripJsonFence(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

export class DailySummaryService {
  /**
   * Genera el resumen diario matutino (con métricas reales del día anterior, resumen ejecutivo corto
   * y 1 tip vital accionable según configuración y contexto real).
   * Persiste el resultado más reciente en structured_prompt_data.daily_admin_summary para mostrarlo en Dashboard.
   */
  static async generateAndPersistForOrg(org: any): Promise<DailyAdminSummaryPayload> {
    const appSettings = (org.appointment_settings as Record<string, any>) || {};
    const timezone = appSettings.timezone || 'America/Bogota';
    const { dateKey, dateLabel, startIso, endIso } = buildYesterdayWindow(timezone);

    const [
      newLeadsRes,
      wonContactsRes,
      apptsRes,
      messagesRes,
      aiRunsRes,
      pendingHandoffsRes,
      gapsRes,
    ] = await Promise.all([
      (supabaseAdmin.from('contacts') as any)
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', org.id)
        .is('deleted_at', null)
        .gte('created_at', startIso)
        .lte('created_at', endIso),
      (supabaseAdmin.from('contacts') as any)
        .select('id, deal_value, pipeline_stage, updated_at')
        .eq('organization_id', org.id)
        .is('deleted_at', null)
        .eq('pipeline_stage', 'ganado')
        .gte('updated_at', startIso)
        .lte('updated_at', endIso),
      (supabaseAdmin.from('appointments') as any)
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', org.id)
        .gte('created_at', startIso)
        .lte('created_at', endIso),
      (supabaseAdmin.from('messages') as any)
        .select('sender_type')
        .eq('organization_id', org.id)
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .limit(1000),
      (supabaseAdmin.from('ai_runs') as any)
        .select('total_tokens')
        .eq('organization_id', org.id)
        .neq('channel', 'prompt_assistant')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .limit(1000),
      (supabaseAdmin.from('contacts') as any)
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', org.id)
        .is('deleted_at', null)
        .contains('custom_fields', { unattended_handoff: true }),
      (supabaseAdmin.from('ai_knowledge_gaps') as any)
        .select('question_text, occurrences')
        .eq('organization_id', org.id)
        .eq('status', 'pending')
        .order('occurrences', { ascending: false })
        .limit(3),
    ]);

    const msgRows = Array.isArray(messagesRes?.data) ? messagesRes.data : [];
    const inboundMessages = msgRows.filter((m: any) => m.sender_type === 'lead').length;
    const aiReplies = msgRows.filter((m: any) => m.sender_type === 'ai').length;
    const humanReplies = msgRows.filter((m: any) => m.sender_type === 'agent_manual').length;

    const wonRows = Array.isArray(wonContactsRes?.data) ? wonContactsRes.data : [];
    const wonDeals = wonRows.length;
    const revenue = wonRows.reduce((acc: number, c: any) => acc + Number(c.deal_value || 0), 0);

    const runRows = Array.isArray(aiRunsRes?.data) ? aiRunsRes.data : [];
    const tokensUsed = runRows.reduce((acc: number, r: any) => acc + Number(r.total_tokens || 0), 0);

    const metrics: DailyAdminSummaryMetrics = {
      dateKey,
      dateLabel,
      newLeads: Number(newLeadsRes?.count || 0),
      inboundMessages,
      aiReplies,
      humanReplies,
      wonDeals,
      revenue,
      appointmentsBooked: Number(apptsRes?.count || 0),
      pendingHandoffs: Number(pendingHandoffsRes?.count || 0),
      tokensUsed,
    };

    const gaps = Array.isArray(gapsRes?.data) ? gapsRes.data : [];
    const promptText = String(org.system_prompt || '');
    const caps = extractOrganizationCapabilities(org, promptText);
    const galleryRes = resolveOrganizationGallery(org, promptText);
    const followUpCfg = normalizeFollowUpSettings(appSettings.follow_up_sequences);
    const paymentAccounts = Array.isArray(appSettings.payment_accounts) ? appSettings.payment_accounts : [];
    const hasShipping = Boolean(appSettings.shipping_settings?.enabled || org.structured_prompt_data?.shipping_policy);

    const fallbackTips = DashboardTipsService.generateTips({
      organization: org,
      metrics: {
        needsHumanCount: metrics.pendingHandoffs,
        wonCount: metrics.wonDeals,
      },
    });
    const topFallbackTip = fallbackTips[0];

    let shortSummary =
      metrics.inboundMessages === 0 && metrics.newLeads === 0
        ? `Ayer (${dateLabel}) no se registró movimiento de nuevos mensajes ni leads en ${org.name || 'tu negocio'}.`
        : `Ayer (${dateLabel}) entraron ${metrics.newLeads} lead(s) nuevos, la IA respondió ${metrics.aiReplies} veces frente a ${metrics.humanReplies} respuestas manuales y se registraron ${metrics.wonDeals} cierre(s).`;

    let actionableTip =
      topFallbackTip?.description ||
      'Revisa los chats pendientes en el Inbox y valida que tu prompt responda las dudas más frecuentes de tus clientes.';
    let tipActionHref = topFallbackTip?.actionHref || '/inbox';
    let tipActionLabel = topFallbackTip?.actionLabel || 'Ir al Inbox';

    const hasActivity = metrics.inboundMessages > 0 || metrics.newLeads > 0 || metrics.aiReplies > 0;
    const compat = getBusinessFeatureCompatibility(org, promptText);
    const isServicesOnly = !compat.supportsShipping;
    const isProductsOnly = !compat.supportsCalendar;

    if (hasActivity) {
      try {
        const configContext = [
          `Negocio: ${org.name || 'Empresa'} (tipo: ${isServicesOnly ? 'SOLO SERVICIOS (no vende ni envía productos físicos)' : isProductsOnly ? 'SOLO PRODUCTOS (no agenda citas)' : 'HÍBRIDO (productos + servicios)'}, rubro: ${org.industry_preset || 'custom'})`,
          `Cuentas de pago configuradas: ${paymentAccounts.length}`,
          ...(compat.supportsShipping ? [`Política de envíos configurada: ${hasShipping ? 'Sí' : 'No'}`] : []),
          `Fotos en galería: ${galleryRes.items.length}`,
          `Seguimientos automáticos: ${followUpCfg.enabled ? 'Activos' : 'Apagados'}`,
          `Chats sin atender por humano: ${metrics.pendingHandoffs}`,
          gaps.length > 0
            ? `Dudas sin responder detectadas: ${gaps.map((g: any) => `"${g.question_text}" (${g.occurrences}x)`).join(', ')}`
            : 'Sin dudas pendientes registradas en ai_knowledge_gaps.',
        ].join('\n');

        const llmRes = await createChatCompletionWithFallback({
          messages: [
            {
              role: 'system',
              content: `Eres el copiloto operativo de Synqo CRM para administradores de negocio.
Genera el Resumen Diario Matutino sobre lo que ocurrió AYER (${dateLabel}).
REGLAS ESTRICTAS:
1. NADA DE TIPS BÁSICOS, GENÉRICOS NI INCOHERENTES (prohibido sugerir configurar algo que ya aparece como configurado arriba, y prohibido decir obviedades como "responde rápido" o "saluda amablemente").
2. ${isServicesOnly ? 'ESTE NEGOCIO SOLO OFRECE SERVICIOS: PROHIBIDO sugerir políticas de envío, fletes, transportadoras o contraentrega.' : isProductsOnly ? 'ESTE NEGOCIO SOLO VENDE PRODUCTOS: PROHIBIDO sugerir citas, agenda o Google Calendar.' : 'Respeta estrictamente el modelo híbrido del negocio.'}
3. El tip debe estar 100% anclado a los datos reales de ayer y a la configuración actual del negocio, enfocado en mejorar la automatización de la IA (asistencia, asesoramiento y venta) o resolver un cuello de botella real.
4. Responde ÚNICAMENTE JSON válido:
{
  "shortSummary": "Resumen ejecutivo de 2 frases claras con lo más relevante de ayer",
  "actionableTip": "1 recomendación concreta, accionable y específica del contexto actual",
  "target": "inbox" | "prompt" | "gallery" | "follow_ups" | "payments" | "shipping" | "campanas"
}`,
            },
            {
              role: 'user',
              content: `Métricas de ayer:\n${JSON.stringify(metrics)}\n\nContexto de configuración:\n${configContext}`,
            },
          ],
          temperature: 0.2,
          maxTokens: 280,
          chainOverride: getAiUtilityChain(),
          aiProvider: org.ai_provider,
          organizationId: org.id,
          skipQuotaDeduction: true,
          responseFormat: { type: 'json_object' },
        });

        const parsed = JSON.parse(stripJsonFence(llmRes.response.choices[0]?.message?.content || '{}'));
        if (typeof parsed.shortSummary === 'string' && parsed.shortSummary.trim()) {
          shortSummary = parsed.shortSummary.trim();
        }
        if (typeof parsed.actionableTip === 'string' && parsed.actionableTip.trim()) {
          actionableTip = parsed.actionableTip.trim();
        }
        const targetMap: Record<string, { href: string; label: string }> = {
          inbox: { href: '/inbox?view=por_responder', label: 'Atender en Inbox' },
          prompt: { href: '/settings?tab=integrations#prompt-assistant', label: 'Ajustar Prompt' },
          gallery: { href: '/settings?tab=gallery', label: 'Ir a Galería' },
          follow_ups: { href: '/settings?tab=follow_ups', label: 'Ver Seguimientos' },
          payments: { href: '/settings?tab=payments', label: 'Configurar Pagos' },
          shipping: { href: '/settings?tab=shipping', label: 'Ajustar Envíos' },
          campanas: { href: '/campanas', label: 'Crear Campaña' },
        };
        if (parsed.target && targetMap[parsed.target]) {
          tipActionHref = targetMap[parsed.target].href;
          tipActionLabel = targetMap[parsed.target].label;
        }
      } catch (err) {
        console.warn('[DailySummaryService] Fallback determinístico por error LLM:', err);
      }
    }

    const payload: DailyAdminSummaryPayload = {
      dateKey,
      dateLabel,
      generatedAt: new Date().toISOString(),
      metrics,
      shortSummary,
      actionableTip,
      tipActionHref,
      tipActionLabel,
    };

    try {
      const existingStructured =
        org.structured_prompt_data && typeof org.structured_prompt_data === 'object'
          ? org.structured_prompt_data
          : {};
      await (supabaseAdmin.from('organizations') as any)
        .update({
          structured_prompt_data: {
            ...existingStructured,
            daily_admin_summary: payload,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', org.id);
    } catch (persistErr) {
      console.warn('[DailySummaryService] No se pudo persistir resumen en structured_prompt_data:', persistErr);
    }

    return payload;
  }

  static formatWhatsAppMessage(orgName: string, summary: DailyAdminSummaryPayload): string {
    const m = summary.metrics;
    const revenueLine = m.revenue > 0 ? ` ($${m.revenue.toLocaleString('es-CO')})` : '';
    const extraLine = m.appointmentsBooked > 0 ? `\n📅 Citas agendadas: *${m.appointmentsBooked}*` : '';
    const handoffLine =
      m.pendingHandoffs > 0 ? `\n🙋 Pendientes de asesor ahora: *${m.pendingHandoffs}*` : '';

    return [
      `📊 *Resumen Diario - ${orgName}*`,
      `🗓️ Ayer (${summary.dateLabel})`,
      '',
      `• Leads nuevos: *${m.newLeads}*`,
      `• Mensajes recibidos: *${m.inboundMessages}*`,
      `• Respuestas IA / Asesor: *${m.aiReplies}* / *${m.humanReplies}*`,
      `• Cierres ganados: *${m.wonDeals}*${revenueLine}${extraLine}${handoffLine}`,
      '',
      `📝 *Resumen:* ${summary.shortSummary}`,
      '',
      `💡 *Tip para hoy:* ${summary.actionableTip}`,
    ].join('\n');
  }
}
