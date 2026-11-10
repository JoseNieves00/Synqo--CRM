export interface QuickSnippet {
  id?: string;
  shortcut: string;
  label: string;
  text: string;
  isAiGenerated?: boolean;
}

export const BASE_DEFAULT_SNIPPETS: QuickSnippet[] = [
  {
    id: 'default-saludo',
    shortcut: '/hola',
    label: 'Saludo Personalizado',
    text: '¡Hola {primer_nombre}! ¿Cómo estás? Con mucho gusto te atiendo el día de hoy. ¿En qué te podemos asesorar?',
  },
  {
    id: 'default-cuenta',
    shortcut: '/cuenta',
    label: 'Cuentas Bancarias',
    text: '¡Hola {primer_nombre}! Te comparto nuestros medios de pago oficiales. Por favor envíanos la captura de tu comprobante una vez realizada la transferencia para validarla de inmediato.',
  },
  {
    id: 'default-ubicacion',
    shortcut: '/ubicacion',
    label: 'Ubicación & Horario',
    text: '¡Hola {primer_nombre}! Estamos ubicados en nuestra sede principal. Horario de atención: Lunes a Sábado de 8:00 AM a 7:00 PM. ¡Te esperamos!',
  },
  {
    id: 'default-agenda',
    shortcut: '/agenda',
    label: 'Agendar Cita',
    text: '{primer_nombre}, ¿para qué día y hora te gustaría agendar tu servicio o cita? Con gusto te confirmo la disponibilidad de inmediato.',
  },
  {
    id: 'default-catalogo',
    shortcut: '/catalogo',
    label: 'Servicios & Tarifas',
    text: '¡Hola {primer_nombre}! Ofrecemos atención profesional personalizada y paquetes a tu medida. ¿En qué producto o modelo estás interesado hoy?',
  },
  {
    id: 'default-reactivacion',
    shortcut: '/reactivar',
    label: 'Reactivar Lead Frío',
    text: '¡Hola {primer_nombre}! ¿Cómo estás? Quería confirmar si alcanzaste a revisar la información o si te quedó alguna duda sobre las opciones para ayudarte con mucho gusto 😊',
  },
];

/**
 * Generador Inteligente de Atajos sugeridos por la IA basados en el Prompt y Políticas del Negocio
 */
export function generateSuggestedSnippetsFromPrompt(
  structuredData?: any,
  systemPrompt?: string | null
): QuickSnippet[] {
  const suggestions: QuickSnippet[] = [];

  if (structuredData) {
    const { identity, catalog, policies } = structuredData;

    // 1. Cuentas bancarias configuradas en las políticas
    const pd = policies?.paymentDetails;
    if (pd && (pd.nequi || pd.daviplata || pd.bancolombia || pd.other)) {
      const parts: string[] = [];
      if (pd.nequi) parts.push(`• Nequi: ${pd.nequi}`);
      if (pd.daviplata) parts.push(`• Daviplata: ${pd.daviplata}`);
      if (pd.bancolombia) parts.push(`• Bancolombia: ${pd.bancolombia}`);
      if (pd.other) parts.push(`• ${pd.other}`);

      suggestions.push({
        id: 'ai-cuenta',
        shortcut: '/cuenta',
        label: 'Cuentas Bancarias (IA)',
        text: `Nuestros medios de pago oficiales son:\n${parts.join('\n')}\nPor favor envíanos la captura de tu comprobante una vez realizada la transferencia para verificarla.`,
        isAiGenerated: true,
      });
    }

    // 2. Ubicación y cobertura
    if (identity?.cityCoverage && identity.cityCoverage.trim().length > 0) {
      suggestions.push({
        id: 'ai-ubicacion',
        shortcut: '/ubicacion',
        label: 'Ubicación Oficial (IA)',
        text: `Estamos ubicados en: ${identity.cityCoverage.trim()}. Nuestro horario de atención habitual es de lunes a sábado. ¡Con gusto te esperamos!`,
        isAiGenerated: true,
      });
    }

    // 3. Catálogo y Tarifas principales
    if (Array.isArray(catalog) && catalog.length > 0) {
      const topItems = catalog.slice(0, 4).map((c: any) => `• ${c.name}: ${c.price}`).join('\n');
      suggestions.push({
        id: 'ai-precios',
        shortcut: '/precios',
        label: 'Tarifas y Servicios (IA)',
        text: `Nuestros principales servicios y tarifas son:\n${topItems}\n¿Deseas conocer más detalles o agendar tu cita?`,
        isAiGenerated: true,
      });
    }

    // 4. Garantía
    if (policies?.warrantyInfo && policies.warrantyInfo.trim().length > 0) {
      suggestions.push({
        id: 'ai-garantia',
        shortcut: '/garantia',
        label: 'Garantía del Servicio (IA)',
        text: `Nuestra política de garantía: ${policies.warrantyInfo.trim()}`,
        isAiGenerated: true,
      });
    }

    // 5. Envíos y Domicilios
    if (policies?.shippingInfo && policies.shippingInfo.trim().length > 0) {
      suggestions.push({
        id: 'ai-envios',
        shortcut: '/envios',
        label: 'Domicilios y Envíos (IA)',
        text: `Información de entregas y despachos: ${policies.shippingInfo.trim()}`,
        isAiGenerated: true,
      });
    }

    // 6. Preguntas frecuentes (customFaqs)
    if (Array.isArray(policies?.customFaqs)) {
      policies.customFaqs.slice(0, 3).forEach((faq: any, idx: number) => {
        if (faq.question && faq.answer) {
          const cleanKey = faq.question
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '')
            .slice(0, 10) || `duda${idx + 1}`;
          suggestions.push({
            id: `ai-faq-${idx}`,
            shortcut: `/faq-${cleanKey}`,
            label: `${faq.question.slice(0, 26)}...`,
            text: faq.answer,
            isAiGenerated: true,
          });
        }
      });
    }
  }

  // Fallback si no tiene structured data pero hay instrucciones generales
  if (suggestions.length === 0 && systemPrompt) {
    suggestions.push({
      id: 'ai-bienvenida',
      shortcut: '/hola',
      label: 'Saludo de Bienvenida (IA)',
      text: '¡Hola! Qué gusto saludarte. Te damos la bienvenida a nuestro canal oficial. ¿En qué podemos ayudarte hoy?',
      isAiGenerated: true,
    });
    suggestions.push({
      id: 'ai-agenda',
      shortcut: '/agenda',
      label: 'Solicitar Cita o Turno (IA)',
      text: '¿Para qué día y hora te gustaría agendar tu servicio? Con gusto te confirmo la disponibilidad de inmediato.',
      isAiGenerated: true,
    });
  }

  return suggestions;
}

