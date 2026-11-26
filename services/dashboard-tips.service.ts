import { resolveOrganizationGallery } from '@/lib/ai/product-gallery';
import {
  extractOrganizationCapabilities,
  getBusinessFeatureCompatibility,
  type BusinessFeatureCompatibility,
} from '@/lib/ai/copilot-engine';
import { evaluatePromptHealth } from '@/lib/ai/prompt-assistant/health';
import { normalizeAssistantState } from '@/lib/ai/prompt-assistant/state';
import { normalizeFollowUpSettings } from '@/lib/ai/follow-up-types';

export function isTipCompatibleWithBusiness(
  tip: Pick<DashboardSmartTip, 'id' | 'category'>,
  compat: BusinessFeatureCompatibility
): boolean {
  if (tip.category === 'shipping' && !compat.supportsShipping) return false;
  if (tip.id === 'setup_product_gallery' && !compat.supportsProductGalleryPrompt) return false;
  if (tip.id === 'setup_calendar_hours' && !compat.supportsCalendar) return false;
  return true;
}

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
      categories?: { hot?: number; qualifiedDoubt?: number; warm?: number; cold?: number; unclassified?: number };
      followUp?: { sentInPeriod?: number; responseRatePct?: number; skippedNoTemplateCount?: number };
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
    const preset = String(organization.industry_preset || 'custom').toLowerCase();
    const cf = (organization.custom_fields || {}) as Record<string, any>;
    const appSettings = (organization.appointment_settings || {}) as Record<string, any>;
    const spd = organization.structured_prompt_data || {};
    const promptText = String(organization.system_prompt || '');
    const hotCount = Number(metrics?.categories?.hot || 0);
    const warmCount = Number(metrics?.categories?.warm || 0);
    const qualifiedDoubtCount = Number(metrics?.categories?.qualifiedDoubt || 0);
    const unclassifiedCount = Number(metrics?.categories?.unclassified || 0);
    const needsHumanCount = Number(metrics?.needsHumanCount || 0);
    const skippedNoTemplateCount = Number(metrics?.followUp?.skippedNoTemplateCount || 0);

    const caps = extractOrganizationCapabilities(organization, promptText);
    const compat = getBusinessFeatureCompatibility(organization, promptText);
    const galleryRes = resolveOrganizationGallery(organization, promptText);
    const galleryItems = galleryRes?.items || [];
    const galleryCount = galleryItems.length;
    const followUpCfg = normalizeFollowUpSettings(appSettings.follow_up_sequences || cf.follow_up_settings);
    const health = evaluatePromptHealth({
      prompt: promptText,
      state: normalizeAssistantState(spd?.assistant),
      gallery: galleryItems,
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
        actionHref: '/settings?tab=integrations#prompt-assistant',
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
        title: `Mejora pendiente en "${firstProp.sectionTitle || 'tu prompt'}"`,
        description: String(firstProp.reason || 'Detectamos una oportunidad de mejora basada en chats reales.'),
        actionLabel: 'Revisar en Asistente',
        actionHref: '/settings?tab=integrations#prompt-assistant',
      });
    }

    // 3. Eficiencia operativa: chats en relevo humano o seguimientos bloqueados por plantilla Meta
    if (needsHumanCount >= 2) {
      tips.push({
        id: `unattended_handoffs_${needsHumanCount >= 5 ? 'high' : 'normal'}`,
        category: 'friction',
        impact: 'high',
        title: `${needsHumanCount} chats esperan respuesta humana`,
        description:
          'Atiéndelos primero en el Inbox y reactiva la IA al terminar para no perder el impulso de compra.',
        actionLabel: 'Atender en Inbox',
        actionHref: '/inbox?view=por_responder',
      });
    }

    if (skippedNoTemplateCount > 0) {
      tips.push({
        id: 'followup_missing_meta_templates',
        category: 'follow_ups',
        impact: 'high',
        title: `${skippedNoTemplateCount} seguimiento(s) omitido(s) por ventana 24h`,
        description:
          'Meta bloquea mensajes fuera de 24h si no hay plantilla aprobada vinculada en tus secuencias de seguimiento.',
        actionLabel: 'Vincular plantillas',
        actionHref: '/settings?tab=follow_ups',
      });
    }

    // 4. Oportunidad de Campaña a Prospectos Tibios / Con Dudas
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
        title: `${potentialReactivationCount} prospectos listos para recontactar`,
        description: `Hay ${potentialReactivationCount} clientes interesados sin cierre aún. Lanza una campaña usando ${hookText} para recuperar esas ventas.`,
        actionLabel: 'Crear Campaña',
        actionHref: '/campanas',
      });
    }

    // 5. Brechas reales detectadas en el Prompt y Configuración según modelo de negocio
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
        title: `Faltan medios de pago oficiales en ${orgName}`,
        description:
          'Configura tus cuentas o métodos de cobro para que la IA cierre directamente cuando el cliente pida pagar.',
        actionLabel: 'Configurar pagos',
        actionHref: '/settings?tab=payments',
      });
    }

    const hasShippingInPrompt = /(flete|env[ií]o|contraentrega|cobertura|municipio|ciudad|domicilio|transportadora|retiro en tienda|punto f[ií]sico|entrega digital)/i.test(promptText);
    const hasShippingSettings = Boolean(appSettings.shipping_settings?.enabled || spd.shipping_policy);
    if (compat.supportsShipping && !hasShippingSettings && !hasShippingInPrompt) {
      tips.push({
        id: 'setup_shipping_policy',
        category: 'shipping',
        impact: 'high',
        title: `Aclara cómo entregas en ${orgName}`,
        description:
          'Define tarifas de envío, domicilio, retiro en punto físico o entrega digital para evitar dudas justo antes de pagar.',
        actionLabel: 'Ajustar entregas',
        actionHref: '/settings?tab=shipping',
      });
    }

    // Negocios de servicios / agenda: revisar horario y calendario
    if (compat.supportsCalendar && !organization.business_hours && !organization.google_calendar_sync_enabled) {
      tips.push({
        id: 'setup_calendar_hours',
        category: 'operational',
        impact: 'medium',
        title: `Configura horarios y sincronización de agenda`,
        description:
          preset.includes('salud') || preset.includes('estetica')
            ? 'Define tus horarios de atención y conecta Google Calendar para que la IA agende citas sin cruces.'
            : 'Establece tu horario comercial y calendario para automatizar reservas sin intervención manual.',
        actionLabel: 'Configurar agenda',
        actionHref: '/settings?tab=integrations',
      });
    }

    // Call-to-action de cierre personalizado al giro real
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
            : 'Tu prompt aún no especifica qué datos debe pedir la IA cuando el cliente decide comprar.',
        actionLabel: 'Mejorar con Asistente',
        actionHref: '/settings?tab=integrations#prompt-assistant',
      });
    }

    // Galería visual: falta de fotos (solo sugerir proactivamente si vende productos) o fotos sin contexto/keywords
    if (galleryCount === 0 && compat.supportsProductGalleryPrompt) {
      tips.push({
        id: 'setup_product_gallery',
        category: 'gallery',
        impact: 'medium',
        title: `Sube fotos a tu galería visual`,
        description:
          'La IA envía imágenes en el contexto correcto junto con su descripción; sin fotos responderá solo con texto.',
        actionLabel: 'Ir a Galería',
        actionHref: '/settings?tab=gallery',
      });
    } else if (galleryCount > 0) {
      const itemsWithoutContext = galleryItems.filter(
        (g) => (!g.searchKeywords || g.searchKeywords.length === 0) && !g.contextRule
      ).length;
      if (itemsWithoutContext > 0) {
        tips.push({
          id: 'enrich_gallery_context',
          category: 'gallery',
          impact: 'medium',
          title: `${itemsWithoutContext} imagen(es) sin contexto o palabras clave`,
          description:
            'Usa el autocompletado con Gemini en la Galería para que la IA sepa exactamente cuándo sí y cuándo no enviar cada foto.',
          actionLabel: 'Completar en Galería',
          actionHref: '/settings?tab=gallery',
        });
      }
    }

    // Seguimientos apagados
    if (!followUpCfg.enabled) {
      tips.push({
        id: 'enable_follow_ups',
        category: 'follow_ups',
        impact: 'high',
        title: `Seguimientos automáticos apagados`,
        description:
          'Activa los seguimientos de embudo para retomar automáticamente a los prospectos que dejan en visto.',
        actionLabel: 'Activar seguimientos',
        actionHref: '/settings?tab=follow_ups',
      });
    }

    // Uso eficiente del software: leads sin clasificar o sin atajos rápidos
    if (unclassifiedCount >= 5) {
      tips.push({
        id: 'classify_unclassified_leads',
        category: 'operational',
        impact: 'medium',
        title: `${unclassifiedCount} contactos sin clasificar por temperatura`,
        description:
          'Usa "Clasificar con IA" en el Dashboard para segmentar leads calientes, tibios y con dudas antes de hacer seguimiento.',
        actionLabel: 'Ver clasificación',
        actionHref: '/dashboard',
      });
    }

    const quickReplies = Array.isArray(appSettings.quick_replies)
      ? appSettings.quick_replies
      : Array.isArray(cf.quick_replies)
      ? cf.quick_replies
      : [];
    if (quickReplies.length === 0 && (needsHumanCount > 0 || Number(metrics?.totalContacts || 0) >= 10)) {
      tips.push({
        id: 'setup_quick_replies',
        category: 'operational',
        impact: 'info',
        title: `Acelera respuestas manuales con atajos (/)`,
        description:
          'Configura respuestas rápidas en Ajustes para que tu equipo responda en 1 segundo al tomar un chat del Inbox.',
        actionLabel: 'Crear atajos',
        actionHref: '/settings?tab=quick_replies',
      });
    }

    // Salud del prompt (ej. si no ha probado Sandbox)
    if (!health.sandboxTested && promptText.trim().length > 25) {
      tips.push({
        id: 'test_prompt_sandbox',
        category: 'prompt',
        impact: 'medium',
        title: `Prueba el prompt en el Sandbox`,
        description:
          'Simula preguntas reales de clientes después de tus últimos cambios antes de que atienda leads en vivo.',
        actionLabel: 'Abrir Sandbox',
        actionHref: '/settings?tab=integrations#prompt-assistant',
      });
    }

    // Fricciones operativas en tiempo real
    if (qualifiedDoubtCount >= 2) {
      tips.push({
        id: 'qualified_doubt_attention',
        category: 'friction',
        impact: 'medium',
        title: `${qualifiedDoubtCount} clientes con dudas puntuales`,
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
        actionLabel: 'Resolver con Asistente',
        actionHref: '/settings?tab=integrations#prompt-assistant',
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
    return tips
      .filter((t) => isTipCompatibleWithBusiness(t, compat))
      .sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact])
      .slice(0, 6);
  }
}
