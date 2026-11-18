import { resolveOrganizationGallery } from '@/lib/ai/product-gallery';

export interface DashboardSmartTip {
  id: string;
  category: 'prompt' | 'shipping' | 'payments' | 'follow_ups' | 'gallery' | 'friction' | 'operational';
  impact: 'high' | 'medium' | 'info';
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}

export class DashboardTipsService {
  /**
   * Genera recomendaciones inteligentes determinísticas (Fases 1 y 2 · 0 Tokens)
   * analizando la configuración real de la empresa y las métricas del periodo actual.
   */
  static generateTips(params: {
    organization: any;
    metrics: {
      categories?: { hot?: number; qualifiedDoubt?: number; warm?: number; cold?: number };
      followUp?: { sentInPeriod?: number; responseRatePct?: number };
      aiPerformance?: { handoffReasons?: Array<{ reason: string; count: number }>; autonomyPct?: number };
      needsHumanCount?: number;
    };
    exemptContactCount?: number;
  }): DashboardSmartTip[] {
    const { organization, metrics, exemptContactCount = 0 } = params;
    if (!organization) return [];

    const tips: DashboardSmartTip[] = [];
    const cf = (organization.custom_fields || {}) as Record<string, any>;
    const spd = organization.structured_prompt_data || {};
    const promptText = String(organization.system_prompt || '');

    // ==========================================
    // FASE 1: HEURÍSTICA DE CONFIGURACIÓN Y REGLAS (0 TOKENS)
    // ==========================================

    // 1. Cuentas de Pago
    const paymentAccounts = Array.isArray(cf.payment_accounts) ? cf.payment_accounts : [];
    if (paymentAccounts.length === 0) {
      tips.push({
        id: 'setup_payment_accounts',
        category: 'payments',
        impact: 'high',
        title: 'Agrega cuentas bancarias oficiales para cobros',
        description:
          'Tu IA podrá entregar cuentas y llaves exactas (Nequi, Bancolombia, etc.) cuando los clientes pidan datos de pago, acelerando el cierre.',
        actionLabel: 'Configurar cuentas',
        actionHref: '/settings',
      });
    }

    // 2. Políticas de Envío y Fletes por Ciudad
    const hasShippingConfig =
      Boolean(spd.shipping_policy) ||
      /(flete|env[ií]o|contraentrega|cobertura|municipio|ciudad)/i.test(promptText);
    if (!hasShippingConfig) {
      tips.push({
        id: 'setup_shipping_policy',
        category: 'shipping',
        impact: 'high',
        title: 'Configura tarifas y cobertura de fletes por ciudad',
        description:
          'Evita que la IA transfiera chats por dudas de fletes y costos de envío en ciudades o municipios específicos.',
        actionLabel: 'Ajustar políticas de envío',
        actionHref: '/settings',
      });
    }

    // 3. Galería Visual y Fotos Oficiales
    const galleryRes = resolveOrganizationGallery(organization, promptText);
    if (!galleryRes || !galleryRes.items || galleryRes.items.length === 0) {
      tips.push({
        id: 'setup_product_gallery',
        category: 'gallery',
        impact: 'medium',
        title: 'Sube fotos oficiales a tu catálogo de productos',
        description:
          'Las tarjetas con fotos oficiales en WhatsApp aumentan un 40% la respuesta de clientes frente a mensajes de texto plano.',
        actionLabel: 'Subir fotos a galería',
        actionHref: '/settings',
      });
    }

    // 4. Seguimientos de Embudo Inactivos
    const followUpConfig = cf.follow_up_settings;
    const isFollowUpEnabled = Boolean(followUpConfig?.enabled);
    if (!isFollowUpEnabled) {
      tips.push({
        id: 'enable_follow_ups',
        category: 'follow_ups',
        impact: 'high',
        title: 'Activa los seguimientos de embudo para rescatar ventas',
        description:
          'Envía recordatorios amables con contraentrega a prospectos tibios o indecisos sin requerir intervención manual.',
        actionLabel: 'Activar seguimientos',
        actionHref: '/settings',
      });
    }

    // ==========================================
    // FASE 2: FRICCIONES REALES & CONTEXTO (0 TOKENS)
    // ==========================================

    // 5. Clientes Calificados con Dudas Puntuales
    const qualifiedDoubtCount = Number(metrics?.categories?.qualifiedDoubt || 0);
    if (qualifiedDoubtCount >= 2) {
      tips.push({
        id: 'qualified_doubt_attention',
        category: 'friction',
        impact: 'medium',
        title: `Tienes ${qualifiedDoubtCount} clientes con dudas puntuales por resolver`,
        description:
          'Son prospectos calificados que dudan en medidas o material antes de comprar. Usa los atajos rápidos del Inbox para cerrar.',
        actionLabel: 'Ver clientes con dudas',
        actionHref: '/inbox?view=ia_atendiendo&temp=qualified_doubt',
      });
    }

    // 6. Causa Principal de Relevo Humano (Knowledge Gap / Handoff)
    const handoffs = metrics?.aiPerformance?.handoffReasons || [];
    if (handoffs.length > 0 && handoffs[0].count >= 2) {
      const topReason = handoffs[0].reason;
      tips.push({
        id: 'top_handoff_reason',
        category: 'prompt',
        impact: 'high',
        title: `Causa #1 de relevo a asesor: "${topReason}"`,
        description:
          'Resuelve este tema en tus preguntas frecuentes o reglas de negocio para que la IA responda sola sin requerir asesor.',
        actionLabel: 'Resolver en Prompt',
        actionHref: '/settings',
      });
    }

    // 7. Contactos Exentos de IA (Transportadoras / Proveedores)
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
