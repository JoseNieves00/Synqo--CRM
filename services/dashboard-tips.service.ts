import { resolveOrganizationGallery } from '@/lib/ai/product-gallery';
import { extractOrganizationCapabilities } from '@/lib/ai/copilot-engine';
import { evaluatePromptHealth } from '@/lib/ai/prompt-assistant/health';
import { normalizeAssistantState } from '@/lib/ai/prompt-assistant/state';
import { normalizeFollowUpSettings } from '@/lib/ai/follow-up-types';

export interface DashboardSmartTip {
  id: string;
  category: 'prompt' | 'shipping' | 'payments' | 'follow_ups' | 'gallery' | 'friction' | 'operational' | 'campaign';
  impact: 'high' | 'medium' | 'info';
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}

export class DashboardTipsService {
  /**
   * Genera recomendaciones personalizadas (0 Tokens) analizando el prompt real de la empresa,
   * sus capacidades detectadas, su configuración en appointment_settings y su auditoría diaria.
   */
  static generateTips(params: {
    organization: any;
    metrics: {
      categories?: { hot?: number; qualifiedDoubt?: number; warm?: number; cold?: number };
      followUp?: { sentInPeriod?: number; responseRatePct?: number };
      aiPerformance?: { handoffReasons?: Array<{ reason: string; count: number }>; autonomyPct?: number };
      needsHumanCount?: number;
      wonCount?: number;
      avgTicket?: number;
      totalContacts?: number;
    };
    exemptContactCount?: number;
  }): DashboardSmartTip[] {
    const { organization, metrics, exemptContactCount = 0 } = params;
    if (!organization) return [];

    const tips: DashboardSmartTip[] = [];
    const orgName = String(organization.name || 'tu negocio').trim();
    const cf = (organization.custom_fields || {}) as Record<string, any>;
    const appSettings = (organization.appointment_settings || {}) as Record<string, any>;
    const spd = organization.structured_prompt_data || {};
    const promptText = String(organization.system_prompt || '');
    const hotCount = Number(metrics?.categories?.hot || 0);
    const warmCount = Number(metrics?.categories?.warm || 0);
    const qualifiedDoubtCount = Number(metrics?.categories?.qualifiedDoubt || 0);

    const caps = extractOrganizationCapabilities(organization, promptText);
    const galleryRes = resolveOrganizationGallery(organization, promptText);
    const galleryCount = galleryRes?.items?.length || 0;
    const followUpCfg = normalizeFollowUpSettings(appSettings.follow_up_sequences || cf.follow_up_settings);
    const health = evaluatePromptHealth({
      prompt: promptText,
      state: normalizeAssistantState(spd?.assistant),
      gallery: galleryRes?.items || [],
    });

    // 1. Insights reales de la Auditoría Diaria del Prompt & Conversaciones
    const dailyInsights = spd?.assistant?.dailyInsights;
    if (dailyInsights && Array.isArray(dailyInsights.dailyTips) && dailyInsights.dailyTips.length > 0) {
      const headline = String(dailyInsights.summaryHeadline || '').trim();
      tips.push({
        id: `prompt_audit_${dailyInsights.lastAuditDay || 'latest'}`,
        category: 'prompt',
        impact: 'high',
        title: headline || `Diagnóstico del prompt de ${orgName}`,
        description: String(dailyInsights.dailyTips[0]),
        actionLabel: 'Aplicar mejora al Prompt',
        actionHref: '/settings',
      });
    }

    // 2. Propuestas pendientes detectadas en el prompt
    const pendingProposals = Array.isArray(spd?.assistant?.pendingProposals)
      ? spd.assistant.pendingProposals
      : [];
    if (pendingProposals.length > 0) {
      const firstProp = pendingProposals[0];
      tips.push({
        id: `pending_proposal_${firstProp.sectionId || 'prompt'}`,
        category: 'prompt',
        impact: 'high',
        title: `${orgName}: mejora pendiente en "${firstProp.sectionTitle || 'tu prompt'}"`,
        description: String(firstProp.reason || 'Detectamos una oportunidad de mejora basada en chats reales.'),
        actionLabel: 'Revisar en Ajustes',
        actionHref: '/settings',
      });
    }

    // 3. Oportunidad de Campaña a Prospectos Tibios / Con Dudas
    const potentialReactivationCount = warmCount + qualifiedDoubtCount;
    if (potentialReactivationCount >= 3) {
      const hookText = caps.canOfferPlanSepare
        ? 'Plan Separe'
        : caps.businessModel === 'services'
        ? 'reserva de cupo'
        : 'una oferta puntual';
      tips.push({
        id: 'launch_reactivation_campaign',
        category: 'campaign',
        impact: 'high',
        title: `${potentialReactivationCount} prospectos de ${orgName} listos para recontactar`,
        description: `Hay ${potentialReactivationCount} clientes interesados sin cierre aún. Lanza una campaña en /campanas usando ${hookText} para recuperar esas ventas.`,
        actionLabel: 'Crear Campaña',
        actionHref: '/campanas',
      });
    }

    // 4. Brechas reales detectadas en el Prompt (solo si faltan en prompt Y en settings)
    const hasPaymentInPrompt = /(nequi|daviplata|bancolombia|transferencia|efectivo|contra\s*entrega|tarjeta)/i.test(promptText);
    const paymentAccounts = Array.isArray(appSettings.payment_accounts)
      ? appSettings.payment_accounts
      : Array.isArray(cf.payment_accounts)
      ? cf.payment_accounts
      : [];
    if (paymentAccounts.length === 0 && !hasPaymentInPrompt) {
      tips.push({
        id: 'setup_payment_accounts',
        category: 'payments',
        impact: 'high',
        title: `Faltan medios de pago oficiales en el prompt de ${orgName}`,
        description:
          'Tu prompt aún no especifica cuentas ni métodos de cobro claros para que la IA cierre directamente cuando el cliente pida pagar.',
        actionLabel: 'Configurar pagos',
        actionHref: '/settings',
      });
    }

    // Solo sugerir políticas de envío si el negocio vende productos/híbrido, despacha (no solo tienda física/digital) y no las tiene
    const hasShippingInPrompt = /(flete|env[ií]o|contraentrega|cobertura|municipio|ciudad|domicilio|transportadora|retiro en tienda|punto f[ií]sico|entrega digital)/i.test(promptText);
    const hasShippingSettings = Boolean(appSettings.shipping_settings?.enabled || spd.shipping_policy);
    if (caps.businessModel !== 'services' && !hasShippingSettings && !hasShippingInPrompt) {
      tips.push({
        id: 'setup_shipping_policy',
        category: 'shipping',
        impact: 'high',
        title: `${orgName}: aclara cómo entregas tus productos`,
        description:
          'Tu prompt aún no indica si manejas envíos, domicilio, retiro en punto físico o entrega digital; definirlo evita dudas al cerrar.',
        actionLabel: 'Ajustar entregas',
        actionHref: '/settings',
      });
    }

    // Sugerir llamado a la acción de cierre personalizado al giro real (sin imponer Plan Separe si el cliente no lo ofrece)
    const hasClearClosingCta = /(agendar|reservar|confirmar.*cita|pedir|orden|datos de env[ií]o|link de pago|transferencia|cotizar|whatsapp)/i.test(promptText);
    if (promptText.trim().length > 0 && !hasClearClosingCta && hotCount + warmCount >= 2) {
      tips.push({
        id: 'suggest_closing_hook',
        category: 'prompt',
        impact: 'medium',
        title:
          caps.businessModel === 'services'
            ? `Define el paso final de reserva en ${orgName}`
            : `Define el paso final de compra en ${orgName}`,
        description:
          caps.businessModel === 'services'
            ? 'Tu prompt aún no especifica qué debe pedir la IA para confirmar una cita (fecha, hora o servicio).'
            : 'Tu prompt aún no especifica qué datos debe pedir la IA cuando el cliente decide comprar según tu flujo actual.',
        actionLabel: 'Editar Prompt',
        actionHref: '/settings',
      });
    }

    // Catálogo visual solo si falta
    if (galleryCount === 0 && caps.businessModel !== 'services') {
      tips.push({
        id: 'setup_product_gallery',
        category: 'gallery',
        impact: 'medium',
        title: `Sube fotos a tu galería visual de ${orgName}`,
        description:
          'El bot envía tarjetas con foto y precio oficiales; sin fotos en galería responderá solo con texto.',
        actionLabel: 'Ir al Catálogo',
        actionHref: '/settings',
      });
    }

    // Seguimientos solo si están apagados realmente en appointment_settings.follow_up_sequences
    if (!followUpCfg.enabled) {
      tips.push({
        id: 'enable_follow_ups',
        category: 'follow_ups',
        impact: 'high',
        title: `Seguimientos automáticos apagados en ${orgName}`,
        description:
          'Activa los seguimientos de embudo en Ajustes para retomar automáticamente a los prospectos que dejan en visto.',
        actionLabel: 'Activar seguimientos',
        actionHref: '/settings',
      });
    }

    // 5. Salud del prompt (ej. si no ha probado Sandbox)
    if (!health.sandboxTested) {
      tips.push({
        id: 'test_prompt_sandbox',
        category: 'prompt',
        impact: 'medium',
        title: `Prueba el prompt de ${orgName} en el Sandbox`,
        description:
          'Aún no registras una simulación en el Sandbox después de tus últimos cambios; valida precios y respuestas antes de atender leads.',
        actionLabel: 'Abrir Sandbox',
        actionHref: '/settings',
      });
    }

    // 6. Fricciones operativas en tiempo real
    if (qualifiedDoubtCount >= 2) {
      tips.push({
        id: 'qualified_doubt_attention',
        category: 'friction',
        impact: 'medium',
        title: `${qualifiedDoubtCount} clientes de ${orgName} con dudas puntuales`,
        description:
          'Son prospectos calificados con preguntas específicas antes de comprar o agendar. Priorízalos en el Inbox.',
        actionLabel: 'Ver en Inbox',
        actionHref: '/inbox?view=ia_atendiendo&temp=qualified_doubt',
      });
    }

    const handoffs = metrics?.aiPerformance?.handoffReasons || [];
    if (handoffs.length > 0 && handoffs[0].count >= 2) {
      const topReason = handoffs[0].reason;
      tips.push({
        id: 'top_handoff_reason',
        category: 'prompt',
        impact: 'high',
        title: `Causa #1 de relevo a asesor: "${topReason}"`,
        description: `Documenta este tema en el prompt de ${orgName} para que la IA lo resuelva de forma autónoma.`,
        actionLabel: 'Resolver en Prompt',
        actionHref: '/settings',
      });
    }

    if (exemptContactCount > 0) {
      tips.push({
        id: 'tag_exempt_status',
        category: 'operational',
        impact: 'info',
        title: `${exemptContactCount} contacto(s) exento(s) de IA`,
        description: 'Operan en modo manual sin consumir tokens de IA.',
        actionLabel: 'Ver en Clientes',
        actionHref: '/clientes',
      });
    }

    const impactOrder: Record<string, number> = { high: 1, medium: 2, info: 3 };
    return tips.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]).slice(0, 6);
  }
}
