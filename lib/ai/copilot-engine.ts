/**
 * ==============================================================================
 * COPILOT SALES ENGINE (Motor Estratégico de Ventas)
 * ==============================================================================
 * Guía tanto al Agente Autónomo de IA en cada turno como al Asesor Humano en el CRM.
 * 
 * Regla de Oro: Estrictamente atado al prompt, catálogo, políticas de pago y envío del negocio.
 * NUNCA inventa Plan Separe ni Contraentrega si el negocio no los tiene configurados.
 */

import { resolveLeadTemperature, resolveProductInterest, type LeadTemperature } from '@/lib/ai/follow-up-types';
import { resolveRecommendedCommercialAction, type RecommendedCommercialAction } from '@/lib/leads/lead-score';

export type CustomerFriction =
  | 'distrust'
  | 'postponement'
  | 'comparison'
  | 'price'
  | 'ready_to_close'
  | 'discovery';

export interface CopilotPrescription {
  friction: CustomerFriction;
  frictionLabel: string;
  customerMindset: string;
  tacticKey: string;
  tacticName: string;
  copilotDirective: string;
  prohibitedActions: string[];
  suggestedClosingQuestion: string;
  allowedCapabilities: {
    canOfferPlanSepare: boolean;
    canOfferContraentrega: boolean;
    hasPaymentAccounts: boolean;
  };
}

export interface CopilotEngineInput {
  history: Array<{ sender_type: string; content: string }>;
  contactData?: any;
  organization?: any;
  leadScore?: number | null;
}

/**
 * Detecta qué opciones comerciales están formalmente autorizadas en el prompt y configuración del negocio.
 */
export function extractOrganizationCapabilities(organization?: any, systemPrompt?: string): {
  canOfferPlanSepare: boolean;
  canOfferContraentrega: boolean;
  hasPaymentAccounts: boolean;
} {
  const promptText = (systemPrompt || organization?.system_prompt || '').toLowerCase();
  const structuredPrompt = organization?.structured_prompt_data || {};
  
  // 1. Plan Separe / Abono
  const hasPlanSepareInPrompt = /plan\s*separe|abono|separar|apartar/i.test(promptText);
  const hasPlanSepareInCustom = Boolean(structuredPrompt.has_plan_separe);
  const canOfferPlanSepare = hasPlanSepareInPrompt || hasPlanSepareInCustom;

  // 2. Contraentrega
  const shippingSettings = organization?.appointment_settings?.shipping_settings;
  const hasContraentregaInSettings = Boolean(shippingSettings?.isCashOnDeliveryAllowed);
  const hasContraentregaInPrompt = /contraentrega|contra\s*entrega|pago\s*al\s*recibir/i.test(promptText);
  const canOfferContraentrega = hasContraentregaInSettings || hasContraentregaInPrompt;

  // 3. Cuentas de Pago
  const paymentAccounts = organization?.appointment_settings?.payment_accounts;
  const hasActivePaymentAccounts = Array.isArray(paymentAccounts) && paymentAccounts.some((a: any) => a.isActive !== false);
  const hasPaymentAccountsInPrompt = /bancolombia|nequi|daviplata|cuenta\s*de\s*ahorros/i.test(promptText);
  const hasPaymentAccounts = hasActivePaymentAccounts || hasPaymentAccountsInPrompt;

  return {
    canOfferPlanSepare,
    canOfferContraentrega,
    hasPaymentAccounts,
  };
}

/**
 * Detecta la fricción o estado mental predominante del prospecto en el último turno.
 */
export function detectCustomerFriction(params: {
  lastLeadText: string;
  customFields?: Record<string, any> | null;
  score?: number | null;
}): { friction: CustomerFriction; frictionLabel: string; customerMindset: string } {
  const { lastLeadText, customFields, score } = params;
  const cf = customFields || {};
  const lower = (lastLeadText || '').toLowerCase();

  // 1. Listo para cerrar / En la meta
  const isPendingReceipt = cf.has_pending_receipt === true;
  const isPaymentInquiry = cf.requested_payment_info === true || /cuenta|nequi|daviplata|bancolombia|como pago|cómo pago|donde consigno|dónde consigno|donde pago|dónde pago|transferir|transferencia/i.test(lower);
  const isShippingInquiry = cf.requested_shipping_quote === true || /cuanto con envio|cuánto con envío|envio a|envío a|cuanto el flete/i.test(lower);
  const isSepareInquiry = /lo aparto|separo|con cuanto aparto|con cuánto aparto|abono inicial/i.test(lower);

  if (isPendingReceipt || isPaymentInquiry || isShippingInquiry || isSepareInquiry || (typeof score === 'number' && score >= 80)) {
    return {
      friction: 'ready_to_close',
      frictionLabel: isPendingReceipt ? 'Comprobante enviado' : 'Intención de pago / Cierre',
      customerMindset: 'El cliente está en la meta, listo para concretar o confirmar comprobante.',
    };
  }

  // 2. Desconfianza / Seguridad
  if (/d[oó]nde est[aá]n|tienen tienda|es seguro|c[oó]mo s[eé] que llega|estafan|sede f[ií]sica|foto real|ubicaci[oó]n/i.test(lower)) {
    return {
      friction: 'distrust',
      frictionLabel: 'Desconfianza / Validación de Seguridad',
      customerMindset: 'Teme perder su dinero o duda de la legitimidad de la empresa.',
    };
  }

  // 3. Postergación / Salida fría
  if (/lo voy a pensar|d[eé]jame ver|voy a consultar|con mi espos[ao]|con mi pareja|cualquier cosa te aviso|ah bueno|listo gracias|muchas gracias|ah ok/i.test(lower)) {
    return {
      friction: 'postponement',
      frictionLabel: 'Postergación / Indecisión',
      customerMindset: 'Interesado pero indeciso; busca posponer para enfriar la conversación.',
    };
  }

  // 4. Parálisis por comparación
  if (/cu[aá]l me recomiendas|cu[aá]l es mejor|qu[eé] diferencia|no s[eé] cu[aá]l|cu[aá]l se vende m[aá]s/i.test(lower)) {
    return {
      friction: 'comparison',
      frictionLabel: 'Parálisis por Comparación',
      customerMindset: 'Le gustan varias opciones y teme equivocarse al elegir.',
    };
  }

  // 5. Objeción de precio / Presupuesto
  if (/muy caro|no me alcanza|tienen descuento|rebaja|muy costoso|presupuesto/i.test(lower) || cf.last_objection === 'precio') {
    return {
      friction: 'price',
      frictionLabel: 'Objeción de Precio / Presupuesto',
      customerMindset: 'Desea el producto o servicio pero percibe fricción en el desembolso total.',
    };
  }

  // 6. Descubrimiento general
  return {
    friction: 'discovery',
    frictionLabel: 'Descubrimiento / Consulta de Catálogo',
    customerMindset: 'Explorando opciones iniciales; necesita ver producto oficial y precio claro.',
  };
}

/**
 * Genera la prescripción táctica del Copiloto para guiar a la IA o al asesor.
 * Respeta al 100% las capacidades autorizadas en el prompt/configuración.
 */
export function diagnoseCopilotTurn(input: CopilotEngineInput): CopilotPrescription {
  const { history, contactData, organization, leadScore } = input;
  const cf = (contactData?.custom_fields as Record<string, any>) || {};
  const promptText = organization?.system_prompt || '';

  const capabilities = extractOrganizationCapabilities(organization, promptText);

  // Obtener último texto del lead
  const lastLeadMsg = [...history].reverse().find((m) => m.sender_type === 'lead');
  const lastLeadText = lastLeadMsg?.content || '';

  const { friction, frictionLabel, customerMindset } = detectCustomerFriction({
    lastLeadText,
    customFields: cf,
    score: leadScore ?? contactData?.lead_score,
  });

  const prohibitedBase = [
    'Prohibido despedirte con "a la orden" o "quedo atento" (eso mata la venta)',
    'Prohibido inventar precios, descuentos o fletes no autorizados en el prompt',
    'Prohibido solicitar relevo a asesor humano ante consultas de compra o pago',
  ];

  switch (friction) {
    case 'ready_to_close': {
      const isReceipt = cf.has_pending_receipt === true;
      return {
        friction,
        frictionLabel,
        customerMindset,
        tacticKey: isReceipt ? 'validate_receipt_and_dispatch' : 'immediate_liquidation_and_hold',
        tacticName: isReceipt ? 'Confirmación de Comprobante & Datos' : 'Liquidación Directa con Urgencia Natural (2h)',
        copilotDirective: isReceipt
          ? 'El cliente ya compartió comprobante. Valídalo cordialmente y solicita en 1 solo paso: Nombre completo, Cédula, Ciudad, Dirección y Teléfono.'
          : 'Cero rodeos ni fotos adicionales. Entrega liquidación exacta y cuentas bancarias. Añade urgencia humana: "Te dejo apartado el tuyo por un par de horitas mientras nos compartes el comprobante" y solicita datos de despacho.',
        prohibitedActions: [
          ...prohibitedBase,
          'Prohibido enviar más fotos o preguntas abiertas de exploración cuando el cliente ya quiere pagar',
        ],
        suggestedClosingQuestion: '¿A nombre de quién registramos el despacho para dejártelo listo hoy?',
        allowedCapabilities: capabilities,
      };
    }

    case 'distrust': {
      if (capabilities.canOfferContraentrega) {
        return {
          friction,
          frictionLabel,
          customerMindset,
          tacticKey: 'demolish_distrust_contraentrega',
          tacticName: 'Derribar Desconfianza con Pago Contraentrega',
          copilotDirective:
            'Indica la sede de la empresa y de inmediato ofrece Pago Contraentrega para que cancele seguro al recibir en su puerta. Pregunta ciudad de destino.',
          prohibitedActions: [
            ...prohibitedBase,
            'Prohibido dar explicaciones defensivas largas; ofrece la garantía y la contraentrega directo.',
          ],
          suggestedClosingQuestion: '¿A qué ciudad sería la entrega para confirmarte el tiempo de llegada?',
          allowedCapabilities: capabilities,
        };
      }
      return {
        friction,
        frictionLabel,
        customerMindset,
        tacticKey: 'demolish_distrust_guarantee_and_office',
        tacticName: 'Validación de Seguridad con Sede y Garantía Oficial',
        copilotDirective:
          'Indica la sede del negocio, garantía de satisfacción y ofrece fotos reales de clientes o catálogo oficial.',
        prohibitedActions: prohibitedBase,
        suggestedClosingQuestion: '¿Deseas que te comparta los detalles de nuestra garantía oficial?',
        allowedCapabilities: capabilities,
      };
    }

    case 'postponement': {
      if (capabilities.canOfferPlanSepare) {
        return {
          friction,
          frictionLabel,
          customerMindset,
          tacticKey: 'bridge_plan_separe_deposit',
          tacticName: 'Puente de Bajo Compromiso (Plan Separe / Abono Inicial)',
          copilotDirective:
            'No lo des por perdido ni digas "a la orden". Ofrécele dejar apartado el suyo con un abono inicial para que no pierda la disponibilidad y pagar el saldo con calma.',
          prohibitedActions: [
            ...prohibitedBase,
            'Prohibido inventar condiciones o plazos de Plan Separe no autorizados en el prompt.',
          ],
          suggestedClosingQuestion: '¿Te gustaría asegurar el tuyo desde hoy con un abono inicial?',
          allowedCapabilities: capabilities,
        };
      }
      return {
        friction,
        frictionLabel,
        customerMindset,
        tacticKey: 'ethical_reservation_hold',
        tacticName: 'Reserva Temporal Ética por 2 Horas',
        copilotDirective:
          'Comprende con calidez su tiempo y ofrécele guardarle el cupo o producto por un par de horas para que no se quede sin disponibilidad si toma la decisión hoy.',
        prohibitedActions: prohibitedBase,
        suggestedClosingQuestion: '¿Te dejo reservado el cupo por un par de horitas para que lo asegures?',
        allowedCapabilities: capabilities,
      };
    }

    case 'comparison': {
      return {
        friction,
        frictionLabel,
        customerMindset,
        tacticKey: 'bestseller_recommendation',
        tacticName: 'Regla del Best-Seller (Opción Más Popular)',
        copilotDirective:
          'Recomienda con convicción la opción favorita de los clientes destacando su beneficio clave y cierra con una alternativa binaria A vs B.',
        prohibitedActions: [
          ...prohibitedBase,
          'Prohibido enviar fichas técnicas largas o aburridas que aumenten la confusión.',
        ],
        suggestedClosingQuestion: '¿Prefieres la opción favorita de nuestros clientes o buscas un detalle puntual?',
        allowedCapabilities: capabilities,
      };
    }

    case 'price': {
      if (capabilities.canOfferPlanSepare) {
        return {
          friction,
          frictionLabel,
          customerMindset,
          tacticKey: 'budget_relief_separe',
          tacticName: 'Alivio de Presupuesto con Plan Separe',
          copilotDirective:
            'Facilita la compra proponiendo apartarlo con un abono cómodo y pagar el resto a su ritmo sin intereses.',
          prohibitedActions: [
            ...prohibitedBase,
            'Prohibido prometer rebajas o descuentos inventados.',
          ],
          suggestedClosingQuestion: '¿Te quedaría cómodo apartarlo hoy con un abono inicial y pagar el saldo después?',
          allowedCapabilities: capabilities,
        };
      }
      return {
        friction,
        frictionLabel,
        customerMindset,
        tacticKey: 'value_reframing_and_durability',
        tacticName: 'Reencuadre de Valor, Calidad y Durabilidad',
        copilotDirective:
          'Explica brevemente por qué el precio refleja calidad, garantía y acabado superior sin inventar rebajas.',
        prohibitedActions: prohibitedBase,
        suggestedClosingQuestion: '¿Te gustaría conocer la garantía y materiales que respaldan su durabilidad?',
        allowedCapabilities: capabilities,
      };
    }

    case 'discovery':
    default: {
      return {
        friction,
        frictionLabel,
        customerMindset,
        tacticKey: 'visual_card_and_advance',
        tacticName: 'Atención Visual con Tarjeta y Micro-Avance',
        copilotDirective:
          'Envía send_product_card con foto oficial y precio. En tu mensaje (máx 1-2 líneas), presenta el beneficio y haz una pregunta de micro-avance hacia el despacho.',
        prohibitedActions: [
          ...prohibitedBase,
          'Prohibido preguntar "¿quieres que te envíe fotos?"; envía la tarjeta directo.',
        ],
        suggestedClosingQuestion: '¿Para entrega en qué ciudad sería?',
        allowedCapabilities: capabilities,
      };
    }
  }
}
