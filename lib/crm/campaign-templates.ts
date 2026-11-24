import { type CustomerFilters, normalizeCustomerFilters } from './customer-filters';

export interface CampaignTemplatePreset {
  id: string;
  title: string;
  category: 'PRODUCTOS' | 'SERVICIOS' | 'GENERAL';
  badgeColor: 'amber' | 'blue' | 'emerald' | 'purple';
  emoji: string;
  description: string;
  defaultName: string;
  defaultObjective: string;
  defaultFilters: CustomerFilters;
  includeProductPhoto: boolean;
  dailyCap: number;
}

/**
 * Resuelve plantillas inteligentes para campañas comerciales 1-clic
 * adaptadas 100% al nicho, naturaleza y prompt configurado del negocio.
 */
export function resolveCampaignTemplates(params: {
  systemPrompt?: string | null;
  structuredPromptData?: any;
  enabledModules?: any;
  orgName?: string | null;
}): CampaignTemplatePreset[] {
  const promptText = (params.systemPrompt || '').toLowerCase();
  const spData = params.structuredPromptData || {};
  const modules = params.enabledModules || {};

  const hasPhysicalCatalog =
    (Array.isArray(spData.catalog) && spData.catalog.length > 0) ||
    (Array.isArray(spData.gallery) && spData.gallery.length > 0) ||
    /producto|flete|env[ií]o|despacho|f[aá]brica|tienda|cat[aá]logo|cocin\w*|mdf|artesanal/i.test(
      promptText
    );

  const isServiceOrAppointment =
    Boolean(modules.native_calendar) ||
    Boolean(modules.physical_rooms) ||
    (!hasPhysicalCatalog &&
      /\b(paciente|pacientes|diagn[oó]stico|odontol[oó]g\w*|cl[ií]nica|doctor|doctora|terapia|m[eé]dic\w*)\b/i.test(
        promptText
      ));

  // Nicho Servicios / Salud / Citas médicas o de valoración
  if (isServiceOrAppointment) {
    return [
      {
        id: 'appointment_free_eval',
        title: 'Valoración / Cita Gratis',
        category: 'SERVICIOS',
        badgeColor: 'emerald',
        emoji: '🩺',
        description: 'Agendamiento de diagnóstico o cupo prioritario sin costo.',
        defaultName: 'Cupos de Diagnóstico o Valoración',
        defaultObjective:
          'Invita amablemente al cliente a agendar una cita o valoración personalizada sin costo o con cupo prioritario esta semana para analizar su caso directamente con un especialista.',
        defaultFilters: normalizeCustomerFilters({ temperature: 'warm', inactiveDays: 2 }),
        includeProductPhoto: false,
        dailyCap: 35,
      },
      {
        id: 'service_followup_treatment',
        title: 'Seguimiento de Consulta',
        category: 'SERVICIOS',
        badgeColor: 'blue',
        emoji: '📅',
        description: 'Retomar pacientes con dudas para definir su inicio.',
        defaultName: 'Seguimiento Consulta y Dudas',
        defaultObjective:
          'Saluda con calidez recordando su consulta inicial y aclara cualquier duda pendiente para ayudarle a coordinar su fecha ideal de inicio.',
        defaultFilters: normalizeCustomerFilters({ temperature: 'qualified_doubt' }),
        includeProductPhoto: false,
        dailyCap: 30,
      },
      {
        id: 'weekly_priority_slots',
        title: 'Cupos Especiales de la Semana',
        category: 'SERVICIOS',
        badgeColor: 'amber',
        emoji: '⚡',
        description: 'Habilitación de horarios preferenciales de atención.',
        defaultName: 'Jornada Cupos Preferenciales',
        defaultObjective:
          'Informa con amabilidad que abrimos nuevos horarios de atención prioritaria esta semana para quienes aún no habían podido agendar.',
        defaultFilters: normalizeCustomerFilters({ stage: 'nuevo', inactiveDays: 3 }),
        includeProductPhoto: false,
        dailyCap: 40,
      },
      {
        id: 'service_reactivate_inactive',
        title: 'Reactivar Pacientes Inactivos',
        category: 'GENERAL',
        badgeColor: 'purple',
        emoji: '✨',
        description: 'Recuperar pacientes de más de 15 días sin agendar.',
        defaultName: 'Reactivación Pacientes +15 Días',
        defaultObjective:
          'Saluda con afecto recordando su interés previo y verifica si desea retomar su cita o tratamiento con nuestro equipo.',
        defaultFilters: normalizeCustomerFilters({ inactiveDays: 15 }),
        includeProductPhoto: false,
        dailyCap: 25,
      },
    ];
  }

  // Nicho Productos físicos / Fabricación / E-commerce (ej. Filippo Kids)
  const hasCraftOrWood =
    /madera|mdf|artesanal|cocinita|closet|juguete|infantil|niña/i.test(promptText);

  const hasContraentrega =
    /contraentrega|contra entrega|pago al recibir|pagar al recibir/i.test(promptText) ||
    /contraentrega|contra entrega/i.test(JSON.stringify(spData));

  const productTemplates: CampaignTemplatePreset[] = [
    {
      id: 'plan_separe_hook',
      title: 'Plan Separe / Abono',
      category: 'PRODUCTOS',
      badgeColor: 'amber',
      emoji: '🏷️',
      description: 'Apartar con abono inicial y pagar saldo a su ritmo.',
      defaultName: 'Reactivación Plan Separe / Apartado',
      defaultObjective:
        'Recontacta al cliente con calidez recordando el modelo o producto que le interesó. Ofrécele la facilidad de apartarlo hoy con un abono inicial mediante Plan Separe, asegurando su cupo y pagando el saldo a su propio ritmo antes del despacho.',
      defaultFilters: normalizeCustomerFilters({ temperature: 'warm', inactiveDays: 3 }),
      includeProductPhoto: true,
      dailyCap: 40,
    },
  ];

  if (hasContraentrega) {
    productTemplates.push({
      id: 'contraentrega_national_hook',
      title: 'Pago Contraentrega Nacional',
      category: 'PRODUCTOS',
      badgeColor: 'emerald',
      emoji: '📦',
      description: 'Paga al recibir en tu ciudad. Cero desconfianza y máxima seguridad.',
      defaultName: 'Campaña Pago Contraentrega Nacional',
      defaultObjective:
        'Saluda con calidez recordando el modelo o producto que le interesó. Cuéntale la excelente noticia de que contamos con opción de Pago Contraentrega en envíos nacionales para que pague con total tranquilidad al recibir su paquete en casa. Pregúntale a qué ciudad sería el despacho para verificar cobertura.',
      defaultFilters: normalizeCustomerFilters({ temperature: 'warm', inactiveDays: 4 }),
      includeProductPhoto: true,
      dailyCap: 40,
    });
  }

  if (hasCraftOrWood) {
    productTemplates.push({
      id: 'pedagogical_benefits_closet',
      title: 'Beneficio Mini-Closet & Espacio',
      category: 'PRODUCTOS',
      badgeColor: 'purple',
      emoji: '🧸',
      description: 'Madera MDF artesanal, mini closet para juguetes y juego sano en casa.',
      defaultName: 'Campaña Beneficios & Durabilidad Artesanal',
      defaultObjective:
        'Saluda con afecto y resalta las ventajas únicas de nuestros modelos: madera MDF artesanal duradera por años, compartimientos tan espaciosos que le sirven de mini closet para organizar juguetes y el regalo perfecto para jugar en casa con sus amiguitas.',
      defaultFilters: normalizeCustomerFilters({ stage: 'nuevo', inactiveDays: 4 }),
      includeProductPhoto: true,
      dailyCap: 35,
    });
  } else {
    productTemplates.push({
      id: 'product_quality_benefits',
      title: 'Beneficios & Calidad de Producto',
      category: 'PRODUCTOS',
      badgeColor: 'purple',
      emoji: '💎',
      description: 'Resaltar ventajas, calidad garantizada y valor diferencial.',
      defaultName: 'Campaña Beneficios de Producto',
      defaultObjective:
        'Recontacta con calidez recordando las ventajas y calidad garantizada de nuestros productos, resolviendo cualquier duda pendiente para facilitar su pedido.',
      defaultFilters: normalizeCustomerFilters({ stage: 'nuevo', inactiveDays: 4 }),
      includeProductPhoto: true,
      dailyCap: 35,
    });
  }

  productTemplates.push({
    id: 'flete_shipping_preference',
    title: 'Romper Objeción de Flete',
    category: 'PRODUCTOS',
    badgeColor: 'blue',
    emoji: '🚚',
    description: 'Beneficio especial o prioridad en despacho a su ciudad.',
    defaultName: 'Bono Especial en Flete / Despacho',
    defaultObjective:
      'Saluda con calidez y resuélvele la duda del costo de despacho ofreciéndole prioridad y acompañamiento en la coordinación del flete a su ciudad si confirma su pedido esta semana.',
    defaultFilters: normalizeCustomerFilters({ temperature: 'qualified_doubt' }),
    includeProductPhoto: true,
    dailyCap: 40,
  });

  productTemplates.push({
    id: 'seasonal_batch_reactivation',
    title: 'Asegurar Cupo de Temporada',
    category: 'GENERAL',
    badgeColor: 'emerald',
    emoji: '🔥',
    description: 'Asegurar fabricación antes del cierre de cupos de temporada.',
    defaultName: 'Reactivación Cupos de Temporada (+10 días)',
    defaultObjective:
      'Saluda con cariño recordando su consulta anterior. Comenta que estamos organizando los despachos y cupos de la temporada y pregúntale con amabilidad si aún desea asegurar el modelo de su pequeña antes de que se agoten los lotes.',
    defaultFilters: normalizeCustomerFilters({ inactiveDays: 10 }),
    includeProductPhoto: true,
    dailyCap: 30,
  });

  return productTemplates;
}
