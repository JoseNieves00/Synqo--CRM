import type { IndustryPreset } from '@/lib/ai/prompt-compiler';

export interface SmartSuggestionItem {
  id: string;
  category: 'cierre' | 'objeciones' | 'calificacion' | 'nicho' | 'anti_friccion';
  categoryLabel: string;
  badge: string;
  title: string;
  description: string;
  instructionToApply: string;
  sectionTarget: 'cierre' | 'politicas' | 'tono' | 'adicional' | 'faq' | 'seguimiento';
}

/**
 * Catálogo maestro de tácticas comerciales probadas para que la IA actúe como
 * un asesor comercial consultivo experto en WhatsApp (y no un folleto pasivo).
 */
export const COMMERCIAL_PLAYBOOK_SUGGESTIONS: SmartSuggestionItem[] = [
  {
    id: 'doble_alternativa',
    category: 'cierre',
    categoryLabel: 'Técnica de Cierre',
    badge: '🎯 Doble Opción',
    title: 'Cierre con Doble Alternativa',
    description: 'En vez de "¿Deseas comprar?", ofrece dos opciones concretas para guiar al cliente a decidir.',
    instructionToApply:
      'Al presentar opciones o buscar el cierre, nunca preguntes si desea comprar o agendar de forma abierta. Usa la técnica de Doble Alternativa ofreciendo siempre dos opciones concretas (ej: "¿Prefieres entrega en la mañana o en la tarde?", "¿Te gustaría en color negro o blanco?", "¿Te queda mejor el martes o el jueves?").',
    sectionTarget: 'cierre',
  },
  {
    id: 'seguridad_pago_abono',
    category: 'objeciones',
    categoryLabel: 'Confianza y Pago',
    badge: '🛡️ Seguridad',
    title: 'Derribo de Desconfianza / Abono Inicial',
    description: 'Da tranquilidad al cliente permitiendo apartar o iniciar con un abono o anticipo.',
    instructionToApply:
      'Si el cliente duda sobre pagar por adelantado o muestra desconfianza comercial, dale total tranquilidad explicando la garantía oficial y ofreciendo la opción de reservar o iniciar fabricación con un abono inicial (50%), cancelando el saldo al momento del despacho o entrega.',
    sectionTarget: 'politicas',
  },
  {
    id: 'anti_redundancia_fotos',
    category: 'anti_friccion',
    categoryLabel: 'Experiencia WhatsApp',
    badge: '⚡ Fluidez Visual',
    title: 'Anti-Redundancia al Enviar Fotos',
    description: 'Evita repetir en un texto largo lo que la imagen ya muestra con precio y detalles.',
    instructionToApply:
      'Cuando envíes una foto o ficha de producto que ya contiene precio, medidas o características en su tarjeta, NO repitas esa lista en texto. Agradece la consulta, menciona el beneficio principal y pasa directo a preguntar cuál opción le gusta más o si necesita envío a su ciudad.',
    sectionTarget: 'adicional',
  },
  {
    id: 'pregunta_diagnostico_inicial',
    category: 'calificacion',
    categoryLabel: 'Calificación Rápida',
    badge: '🔍 Diagnóstico',
    title: 'Pregunta de Diagnóstico / Necesidad Real',
    description: 'Descubre para qué o para quién lo necesita antes de soltar un catálogo abrumador.',
    instructionToApply:
      'Cuando un cliente pregunte de forma general por precios o modelos, no envíes una lista interminable. Haz primero una pregunta de diagnóstico breve y cálida (ej: "¿Buscas para uso personal o para un regalo?", "¿Para qué espacio o necesidad lo requieres?") y recomienda únicamente las 1 o 2 mejores opciones.',
    sectionTarget: 'tono',
  },
  {
    id: 'recontacto_oferta_limitada',
    category: 'cierre',
    categoryLabel: 'Seguimiento',
    badge: '⏳ Sentido de Oportunidad',
    title: 'Recontacto Autónomo con Valor Agregado',
    description: 'Al recontactar a un cliente en silencio, recuérdale disponibilidad sin ser invasivo.',
    instructionToApply:
      'En mensajes de recontacto o seguimiento autónomo, nunca digas "¿Sigues interesado?" ni presiones. Menciona un beneficio concreto del producto consultado (ej: disponibilidad inmediata de unidades o agenda prioritaria esta semana) y pregunta amablemente si le quedó alguna duda sobre el envío o medio de pago.',
    sectionTarget: 'seguimiento',
  },
  {
    id: 'claridad_envios_y_tiempos',
    category: 'anti_friccion',
    categoryLabel: 'Envíos y Despacho',
    badge: '📦 Envíos Claros',
    title: 'Transparencia Inmediata en Entregas',
    description: 'Evita que el cliente pregunte 3 veces cuándo llega su pedido o cita.',
    instructionToApply:
      'Siempre que cotices un producto o servicio, aclara de forma proactiva el tiempo estimado de entrega (ej: "Se despacha hoy mismo y llega en 24-48h hábiles con número de guía") para que el cliente sienta certidumbre y no deba repreguntar.',
    sectionTarget: 'politicas',
  },
];

/**
 * Sugerencias hiper-especializadas por Nicho Comercial
 */
export const INDUSTRY_SPECIALIZED_SUGGESTIONS: Record<IndustryPreset, SmartSuggestionItem[]> = {
  custom: [
    {
      id: 'custom_asesoria_personalizada',
      category: 'nicho',
      categoryLabel: 'Especialización',
      badge: '💼 Trato Consultivo',
      title: 'Asesoría Consultiva a la Medida',
      description: 'Haz que el bot entienda el contexto del cliente antes de cotizar.',
      instructionToApply:
        'Actúa como un asesor comercial experto: valida primero el requerimiento específico del cliente, resalta 2 beneficios clave de la solución propuesta y guía el siguiente paso hacia la cotización formal o agendamiento.',
      sectionTarget: 'tono',
    },
  ],
  services: [
    {
      id: 'servicios_agendamiento_directo',
      category: 'nicho',
      categoryLabel: 'Servicios Profesionales',
      badge: '📅 Agendamiento Ágil',
      title: 'Propuesta de Horarios Concretos',
      description: 'En vez de "¿Cuándo puedes?", propón 2 franjas de horarios inmediatas.',
      instructionToApply:
        'Para agendar la sesión o valoración, ofrece siempre dos franjas específicas (ej: "Tenemos disponibilidad mañana a las 10:00 AM o a las 3:30 PM, ¿cuál te acomoda mejor?") y solicita nombre completo y correo para confirmar el enlace virtual o la sede.',
      sectionTarget: 'cierre',
    },
    {
      id: 'servicios_alcance_claro',
      category: 'nicho',
      categoryLabel: 'Servicios Profesionales',
      badge: '📋 Alcance y Entregables',
      title: 'Claridad en Qué Incluye el Servicio',
      description: 'Evita malentendidos explicando qué incluye exactamente el precio acordado.',
      instructionToApply:
        'Al presentar una cotización de servicios, especifica claramente los 3 entregables clave que incluye y aclara que el soporte post-entrega o acompañamiento está cubierto por el valor cotizado.',
      sectionTarget: 'faq',
    },
  ],
  ecommerce: [
    {
      id: 'ecom_medidas_y_tallas',
      category: 'nicho',
      categoryLabel: 'Comercio / Productos',
      badge: '📐 Guía de Medidas/Tallas',
      title: 'Asesoría Proactiva en Medidas y Colores',
      description: 'Ayuda al cliente a elegir su medida, color o modelo exacto antes de cerrar.',
      instructionToApply:
        'Si el cliente duda sobre tallas, medidas o compatibilidad, bríndale la guía exacta de medidas en centímetros o materiales disponibles y pregúntale cuál se adapta mejor a su espacio o uso para asegurar su pedido.',
      sectionTarget: 'faq',
    },
    {
      id: 'ecom_urgencia_stock',
      category: 'nicho',
      categoryLabel: 'Comercio / Productos',
      badge: '🔥 Disponibilidad Inmediata',
      title: 'Manejo de Stock y Despacho el Mismo Día',
      description: 'Incentiva la compra del día mencionando el corte de envíos.',
      instructionToApply:
        'Menciona con naturalidad que los pedidos confirmados antes de las 2:00 PM se despachan el mismo día, incentivando al cliente a asegurar su unidad antes de que se agote la tanda diaria.',
      sectionTarget: 'cierre',
    },
  ],
  health: [
    {
      id: 'salud_empatia_y_requisitos',
      category: 'nicho',
      categoryLabel: 'Salud y Bienestar',
      badge: '🩺 Calidez y Triaje',
      title: 'Triaje Empático y Requisitos Previos',
      description: 'Atención cálida, preguntas de motivo de consulta y recomendaciones de preparación.',
      instructionToApply:
        'Trata a los pacientes con extrema calidez, empatía y respeto. Pregunta el motivo de consulta o especialista de interés, y antes de confirmar recuerda si requiere llegar con minutos de anticipación o indicaciones previas (ayuno, ropa cómoda o exámenes anteriores).',
      sectionTarget: 'tono',
    },
  ],
  real_estate: [
    {
      id: 'inmo_visita_inmueble',
      category: 'nicho',
      categoryLabel: 'Inmobiliario',
      badge: '🏡 Agendar Visita',
      title: 'Coordinación de Visita al Inmueble',
      description: 'Pide datos clave de presupuesto y zona antes de agendar al asesor de campo.',
      instructionToApply:
        'Cuando un prospecto consulte por una propiedad o arriendo/venta, valida su zona de interés y presupuesto aproximado. Ofrécele coordinar un recorrido presencial o videollamada guiada en dos opciones de horario esta misma semana.',
      sectionTarget: 'cierre',
    },
  ],
  gastronomy: [
    {
      id: 'gastro_sugerencia_combos',
      category: 'nicho',
      categoryLabel: 'Gastronomía y Restaurantes',
      badge: '🍔 Sugerencia de Adicionales',
      title: 'Venta Cruzada de Bebida o Acompañamiento',
      description: 'Sube el ticket promedio sugiriendo la bebida o postre ideal.',
      instructionToApply:
        'Al tomar el pedido del plato principal, sugiere de forma amena y apetitosa el acompañamiento, bebida o postre más pedido de la casa (ej: "¿Te gustaría acompañarlo con nuestra limonada especial o papas rústicas?") antes de pedir la dirección de domicilio.',
      sectionTarget: 'cierre',
    },
  ],
};

/**
 * Devuelve sugerencias inteligentes contextualizadas para una empresa
 * evaluando su preset, su prompt actual y vacíos comunes.
 */
export function getSmartCommercialSuggestions(params: {
  preset: IndustryPreset;
  currentPrompt: string;
  hasCatalog: boolean;
}): SmartSuggestionItem[] {
  const normPrompt = (params.currentPrompt || '').toLowerCase();
  const list: SmartSuggestionItem[] = [];

  // 1. Sugerencias por industria específica primero
  const industryList = INDUSTRY_SPECIALIZED_SUGGESTIONS[params.preset] || [];
  for (const item of industryList) {
    if (!normPrompt.includes(item.id.replace(/_/g, ' '))) {
      list.push(item);
    }
  }

  // 2. Sugerencias transversales de alta conversión si no están cubiertas en el prompt
  for (const item of COMMERCIAL_PLAYBOOK_SUGGESTIONS) {
    const isPresent =
      (item.id === 'doble_alternativa' && (normPrompt.includes('doble alternativa') || normPrompt.includes('dos opciones'))) ||
      (item.id === 'anti_redundancia_fotos' && normPrompt.includes('no repetir') && normPrompt.includes('foto')) ||
      (item.id === 'seguridad_pago_abono' && normPrompt.includes('abono') && normPrompt.includes('desconfianza'));

    if (!isPresent) {
      list.push(item);
    }
  }

  return list;
}
