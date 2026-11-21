import { resolveOrganizationGallery } from '@/lib/ai/product-gallery';

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
   * Genera recomendaciones inteligentes determinísticas y altamente contextuales (0 Tokens)
   * analizando la configuración real de la empresa y el comportamiento de sus clientes.
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
    const cf = (organization.custom_fields || {}) as Record<string, any>;
    const spd = organization.structured_prompt_data || {};
    const promptText = String(organization.system_prompt || '');
    const hotCount = Number(metrics?.categories?.hot || 0);
    const warmCount = Number(metrics?.categories?.warm || 0);
    const qualifiedDoubtCount = Number(metrics?.categories?.qualifiedDoubt || 0);

    // ==========================================
    // FASE 1: OPORTUNIDADES COMERCIALES BASADAS EN DATOS REALES (0 TOKENS)
    // ==========================================

    // 1. Oportunidad de Campaña de Reactivación a Prospectos Tibios / Interesados
    const potentialReactivationCount = warmCount + qualifiedDoubtCount;
    if (potentialReactivationCount >= 3) {
      tips.push({
        id: 'launch_reactivation_campaign',
        category: 'campaign',
        impact: 'high',
        title: `Reactivación: ${potentialReactivationCount} prospectos interesados listos para recontactar`,
        description:
          `Tienes ${potentialReactivationCount} clientes que mostraron interés en tus productos o servicios pero aún no compraron. Lanza una campaña con una oferta de Plan Separe o flete preferencial para rescatar esas ventas.`,
        actionLabel: 'Crear Campaña en 1 Clic',
        actionHref: '/campanas',
      });
    }

    // 2. Oportunidad de Plan Separe para Acelerar Cierres
    if (!/separe|abono|separar|cuotas/i.test(promptText)) {
      tips.push({
        id: 'suggest_plan_separe',
        category: 'prompt',
        impact: 'high',
        title: 'Acelera cierres incorporando Plan Separe en tu atención',
        description:
          'Permitir que el cliente reserve o aparte su producto o cita con un abono inicial (ej: 20% al 30%) reduce drásticamente el abandono de prospectos que no cuentan con la totalidad del dinero en el momento.',
        actionLabel: 'Añadir al Prompt',
        actionHref: '/settings',
      });
    }

    // 3. Cuentas de Pago
    const paymentAccounts = Array.isArray(cf.payment_accounts) ? cf.payment_accounts : [];
    if (paymentAccounts.length === 0) {
      tips.push({
        id: 'setup_payment_accounts',
        category: 'payments',
        impact: 'high',
        title: 'Agrega cuentas bancarias oficiales para cobros inmediatos',
        description:
          'Cuando un prospecto diga "¿a dónde transfiero?", la IA entregará las llaves oficiales (Nequi, Bancolombia, etc.) al instante (<3s) sin hacer esperar al comprador.',
        actionLabel: 'Configurar cuentas',
        actionHref: '/settings',
      });
    }

    // 4. Políticas de Envío y Fletes por Ciudad
    const hasShippingConfig =
      Boolean(spd.shipping_policy) ||
      /(flete|env[ií]o|contraentrega|cobertura|municipio|ciudad)/i.test(promptText);
    if (!hasShippingConfig) {
      tips.push({
        id: 'setup_shipping_policy',
        category: 'shipping',
        impact: 'high',
        title: 'Configura tarifas claras o subsidios de flete por ciudad',
        description:
          'El costo imprevisto de envío es una de las principales causas de abandono. Configura tarifas fijas o condiciones de envío gratis a partir de cierto monto.',
        actionLabel: 'Ajustar políticas de envío',
        actionHref: '/settings',
      });
    }

    // 5. Galería Visual y Fotos Oficiales
    const galleryRes = resolveOrganizationGallery(organization, promptText);
    if (!galleryRes || !galleryRes.items || galleryRes.items.length === 0) {
      tips.push({
        id: 'setup_product_gallery',
        category: 'gallery',
        impact: 'medium',
        title: 'Sube fotos oficiales y medidas a tu catálogo visual',
        description:
          'Los clientes compran por los ojos. Cargar fotos con sus medidas y especificaciones aumenta hasta un 40% la tasa de respuesta en WhatsApp.',
        actionLabel: 'Ir al Catálogo',
        actionHref: '/settings',
      });
    }

    // 6. Seguimientos de Embudo Inactivos
    const followUpConfig = cf.follow_up_settings;
    const isFollowUpEnabled = Boolean(followUpConfig?.enabled);
    if (!isFollowUpEnabled) {
      tips.push({
        id: 'enable_follow_ups',
        category: 'follow_ups',
        impact: 'high',
        title: 'Activa los seguimientos de embudo para rescatar ventas',
        description:
          'Envía recordatorios amables a prospectos indecisos o que dejaron en visto para recuperar hasta un 25% de ventas perdidas.',
        actionLabel: 'Activar seguimientos',
        actionHref: '/settings',
      });
    }

    // ==========================================
    // FASE 2: FRICCIONES OPERATIVAS Y CONTEXTUALES (0 TOKENS)
    // ==========================================

    // 7. Clientes Calificados con Dudas Puntuales
    if (qualifiedDoubtCount >= 2) {
      tips.push({
        id: 'qualified_doubt_attention',
        category: 'friction',
        impact: 'medium',
        title: `Tienes ${qualifiedDoubtCount} clientes con dudas puntuales por resolver`,
        description:
          'Son prospectos calificados que dudan sobre medidas, colores o fechas antes de pagar. Respóndeles en el Inbox para asegurar el cierre.',
        actionLabel: 'Ver clientes con dudas',
        actionHref: '/inbox?view=ia_atendiendo&temp=qualified_doubt',
      });
    }

    // 8. Causa Principal de Relevo Humano (Knowledge Gap / Handoff)
    const handoffs = metrics?.aiPerformance?.handoffReasons || [];
    if (handoffs.length > 0 && handoffs[0].count >= 2) {
      const topReason = handoffs[0].reason;
      tips.push({
        id: 'top_handoff_reason',
        category: 'prompt',
        impact: 'high',
        title: `Causa #1 de relevo a asesor: "${topReason}"`,
        description:
          'Resuelve este tema en tus instrucciones de negocio para que la IA responda sola sin requerir asesor.',
        actionLabel: 'Resolver en Prompt',
        actionHref: '/settings',
      });
    }

    // 9. Contactos Exentos de IA (Transportadoras / Proveedores)
    if (exemptContactCount > 0) {
      tips.push({
        id: 'tag_exempt_status',
        category: 'operational',
        impact: 'info',
        title: `${exemptContactCount} contacto(s) logístico(s) exento(s) de IA`,
        description:
          'Tus conversaciones con transportadoras y administración operan en modo manual con 0 tokens de IA consumidos.',
        actionLabel: 'Ver en Clientes',
        actionHref: '/clientes',
      });
    }

    // Priorizar tips: primero 'high', luego 'medium', luego 'info'
    const impactOrder: Record<string, number> = { high: 1, medium: 2, info: 3 };
    return tips.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);
  }
}
