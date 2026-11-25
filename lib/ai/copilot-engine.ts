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

export type BusinessModelType = 'products' | 'services' | 'hybrid';
export type HookCategory =
  | 'separe'
  | 'cod'
  | 'appointment_deposit'
  | 'free_assessment'
  | 'virtual_or_inperson'
  | 'custom';

export interface OrganizationCapabilities {
  businessModel: BusinessModelType;
  allowsVirtual: boolean;
  allowsInPerson: boolean;
  physicalAddress: string | null;
  primaryHook: string;
  hookCategory: HookCategory;
  canOfferPlanSepare: boolean;
  canOfferContraentrega: boolean;
  hasPaymentAccounts: boolean;
  hasPhysicalLocation: boolean;
  hasOfficialGuarantee: boolean;
}

export interface CopilotPrescription {
  friction: CustomerFriction;
  frictionLabel: string;
  customerMindset: string;
  tacticKey: string;
  tacticName: string;
  copilotDirective: string;
  prohibitedActions: string[];
  suggestedClosingQuestion: string;
  allowedCapabilities: OrganizationCapabilities;
}

export interface CopilotEngineInput {
  history: Array<{ sender_type: string; content: string }>;
  contactData?: any;
  organization?: any;
  leadScore?: number | null;
}

/**
 * Extrae la dirección física exacta de la sede si está explícita en el prompt.
 */
export function extractPhysicalAddressFromPrompt(prompt: string): string | null {
  if (!prompt) return null;
  const match =
    prompt.match(/(?:direcci[oó]n|ubicad[ao]s?\s*en|sede(?:\s*f[ií]sica)?(?:\s*en)?|consultorio\s*en|local(?:\s*en)?)\s*:\s*([^.\n]+)/i) ||
    prompt.match(/(?:estamos\s+ubicados\s+en|vis[ií]tanos\s+en)\s+([^.\n]+)/i) ||
    prompt.match(/(?:carrera|calle|cra\.?|cll\.?|diagonal|transversal|av(?:enida)?\.?)\s+\d+[^.\n]+/i);
  if (!match) return null;
  const raw = (match[1] || match[0]).replace(/[*_`]/g, '').trim();
  return raw.length >= 8 && raw.length <= 150 ? raw : null;
}

/**
 * Detecta qué opciones comerciales están formalmente autorizadas en el prompt y configuración del negocio.
 * Soporta de manera multinicho negocios de Productos, Servicios (Virtuales y Presenciales) e Híbridos.
 */
export function extractOrganizationCapabilities(organization?: any, systemPrompt?: string): OrganizationCapabilities {
  const rawPrompt = systemPrompt || organization?.system_prompt || '';
  const promptText = rawPrompt.toLowerCase();
  const structuredPrompt = organization?.structured_prompt_data || {};
  
  // 1. Sede Física y Dirección Extraída
  const isPhysicalLocationNegated =
    /no\s+[^.!?\n]*(?:sede|tienda|local\s*f[ií]sica)|prohibido\s+[^.!?\n]*(?:sede|visita)/i.test(promptText);
  const physicalAddress = isPhysicalLocationNegated ? null : extractPhysicalAddressFromPrompt(rawPrompt);
  const hasPhysicalLocation =
    !isPhysicalLocationNegated &&
    (Boolean(physicalAddress) ||
      /sede\s*f[ií]sica|tienda\s*f[ií]sica|local\s*comercial|estamos\s*ubicados|vis[ií]tanos|consultorio|cl[ií]nica/i.test(
        promptText
      ));

  // 2. Modalidades de Atención (Virtual vs Presencial)
  const allowsVirtual = /virtual|zoom|meet|videollamada|teleconsulta|en l[ií]nea|remot[ao]/i.test(promptText);
  const allowsInPerson = hasPhysicalLocation || /presencial|en\s*sede|instalaciones/i.test(promptText);

  // 3. Detección de Modelo de Negocio (Servicios, Productos o Híbrido)
  const hasCalendarModule = organization?.enabled_modules?.native_calendar !== false;
  const hasCalendarIntent = /agenda|agendar|cita|reserva|turno|horario|calendario|visita/i.test(promptText);
  const hasServicesIndicator = hasCalendarModule || hasCalendarIntent;

  const hasOrdersModule = organization?.enabled_modules?.orders !== false;
  const hasProductsIndicator =
    hasOrdersModule ||
    /env[ií]os?|despacho|flete|paquete|transportadora|contraentrega|producto|cat[aá]logo/i.test(promptText);

  let businessModel: BusinessModelType = 'services';
  if (hasProductsIndicator && hasServicesIndicator) {
    businessModel = 'hybrid';
  } else if (hasProductsIndicator) {
    businessModel = 'products';
  } else {
    businessModel = 'services';
  }

  // 4. Plan Separe / Abono
  const isPlanSepareNegated =
    /no\s+[^.!?\n]*(?:plan\s*separe|separe|abono)|prohibido\s+[^.!?\n]*(?:plan\s*separe|separe|abono)/i.test(
      promptText
    );
  const hasPlanSepareInPrompt =
    !isPlanSepareNegated && /plan\s*separe|abono|separar|apartar/i.test(promptText);
  const hasPlanSepareInCustom = Boolean(structuredPrompt.has_plan_separe);
  const canOfferPlanSepare = (hasPlanSepareInPrompt || hasPlanSepareInCustom) && !isPlanSepareNegated;

  // 5. Contraentrega
  const shippingSettings = organization?.appointment_settings?.shipping_settings;
  const allowCod = shippingSettings?.allowCashOnDelivery ?? shippingSettings?.isCashOnDeliveryAllowed;
  const isContraentregaExplicitlyFalse = allowCod === false;
  const isContraentregaNegated =
    isContraentregaExplicitlyFalse ||
    /no\s+[^.!?\n]*(?:contraentrega|contra\s*entrega|pago\s*al\s*recibir)|prohibido\s+[^.!?\n]*(?:contraentrega|contra\s*entrega)/i.test(
      promptText
    );
  const hasContraentregaInSettings = allowCod === true;
  const hasContraentregaInPrompt =
    !isContraentregaNegated && /contraentrega|contra\s*entrega|pago\s*al\s*recibir/i.test(promptText);
  const canOfferContraentrega =
    businessModel !== 'services' &&
    (hasContraentregaInSettings || hasContraentregaInPrompt) &&
    !isContraentregaNegated &&
    !isContraentregaExplicitlyFalse;

  // 6. Cuentas de Pago
  const paymentAccounts = organization?.appointment_settings?.payment_accounts;
  const hasActivePaymentAccounts = Array.isArray(paymentAccounts) && paymentAccounts.some((a: any) => a.isActive !== false);
  const hasPaymentAccountsInPrompt = /bancolombia|nequi|daviplata|cuenta\s*de\s*ahorros/i.test(promptText);
  const hasPaymentAccounts = hasActivePaymentAccounts || hasPaymentAccountsInPrompt;

  // 7. Garantía Explícita
  const isGuaranteeNegated =
    /sin\s+garant[ií]a|no\s+[^.!?\n]*garant[ií]a/i.test(promptText);
  const hasOfficialGuarantee =
    !isGuaranteeNegated &&
    /garant[ií]a\s*(?:de\s*)?\d+|garant[ií]a\s*oficial|pol[ií]tica\s*de\s*(?:cambio|garant[ií]a)|satisfacci[oó]n\s*garantizada/i.test(
      promptText
    );

  // 8. Análisis Inteligente del Gancho Comercial Activo (Multi-Nicho)
  let primaryHook = '';
  let hookCategory: HookCategory = 'custom';

  const hasFreeAssessment =
    /valoraci[oó]n[^.\n]*(?:gratis|sin\s*costo)|diagn[oó]stico[^.\n]*(?:gratis|sin\s*costo)|primera\s*(?:consulta|sesi[oó]n|cita)[^.\n]*(?:gratis|sin\s*costo|de\s*prueba)|clase\s*de\s*prueba/i.test(
      promptText
    );

  if (hasFreeAssessment) {
    primaryHook = 'Valoración o diagnóstico inicial sin costo para evaluar tu caso';
    hookCategory = 'free_assessment';
  } else if (businessModel === 'products' && canOfferPlanSepare) {
    primaryHook = 'Plan Separe dando un abono inicial y pagando el saldo a tu ritmo';
    hookCategory = 'separe';
  } else if (businessModel === 'products' && canOfferContraentrega) {
    primaryHook = 'Pago Contraentrega nacional (cancelas seguro al recibir en tu puerta)';
    hookCategory = 'cod';
  } else if ((businessModel === 'services' || businessModel === 'hybrid') && canOfferPlanSepare) {
    primaryHook = 'Reserva de cupo con anticipo o abono inicial para congelar tu fecha';
    hookCategory = 'appointment_deposit';
  } else if (allowsVirtual && allowsInPerson) {
    primaryHook = 'Cita con agenda abierta (modalidad presencial en sede o virtual por videollamada)';
    hookCategory = 'virtual_or_inperson';
  } else if (allowsVirtual) {
    primaryHook = 'Sesión 100% virtual vía Google Meet o Zoom en tu horario preferido';
    hookCategory = 'virtual_or_inperson';
  } else if (allowsInPerson) {
    primaryHook = physicalAddress
      ? `Atención presencial en nuestra sede (${physicalAddress})`
      : 'Atención presencial en nuestra sede con cita previa';
    hookCategory = 'virtual_or_inperson';
  } else {
    primaryHook = 'Agendamiento previo para asegurar tu cupo esta semana';
    hookCategory = 'custom';
  }

  return {
    businessModel,
    allowsVirtual,
    allowsInPerson,
    physicalAddress,
    primaryHook,
    hookCategory,
    canOfferPlanSepare,
    canOfferContraentrega,
    hasPaymentAccounts,
    hasPhysicalLocation,
    hasOfficialGuarantee,
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

  // Detectar si el prospecto formuló una consulta consultiva específica (medidas, edad, gusto, idoneidad, material)
  const hasConsultativeDoubt = /\?|mide|altura|alto|tamaño|medida|edad|años|le gusta|le gustan|le sirve|sirve para|material|madera|espacio|cabe|soporta|peso|recomiendas/i.test(lastLeadText);

  const { friction, frictionLabel, customerMindset } = detectCustomerFriction({
    lastLeadText,
    customFields: cf,
    score: leadScore ?? contactData?.lead_score,
  });

  const prohibitedBase = [
    'Prohibido despedirte con "a la orden" o "quedo atento" (eso mata la venta)',
    'Prohibido inventar precios, descuentos o fletes no autorizados en el prompt',
    'Prohibido inventar sedes físicas, garantías o políticas que no estén explícitas en tu prompt',
    'Prohibido solicitar relevo a asesor humano ante consultas de compra o pago',
    ...(hasConsultativeDoubt ? ['Prohibido ignorar la pregunta del cliente para soltar un gancho comercial desconectado'] : []),
  ];

  switch (friction) {
    case 'ready_to_close': {
      const isReceipt = cf.has_pending_receipt === true;
      if (capabilities.businessModel === 'services') {
        return {
          friction,
          frictionLabel,
          customerMindset,
          tacticKey: isReceipt ? 'validate_service_receipt' : 'confirm_service_booking',
          tacticName: isReceipt ? 'Confirmación de Pago & Cita' : 'Cierre de Agendamiento / Reserva',
          copilotDirective: isReceipt
            ? `El cliente compartió comprobante de la cita. Valídalo cordialmente, confirma día y hora, y comparte el enlace de videollamada (si es virtual) o la dirección de sede (${capabilities.physicalAddress || 'sede oficial'}) si es presencial.`
            : `El cliente desea concretar la cita. Si requiere abono, entrega cuentas oficiales. Si es agenda directa, llama a book_native_appointment y confirma si prefiere virtual o presencial.`,
          prohibitedActions: [
            ...prohibitedBase,
            'Prohibido cobrar fletes o pedir direcciones de envío físico para un servicio.',
          ],
          suggestedClosingQuestion: capabilities.allowsVirtual && capabilities.allowsInPerson
            ? '¿Prefieres asistir de manera presencial en nuestra sede o conectarte de forma virtual por videollamada?'
            : '¿A nombre de quién y en qué horario dejamos confirmada tu cita?',
          allowedCapabilities: capabilities,
        };
      }

      return {
        friction,
        frictionLabel,
        customerMindset,
        tacticKey: isReceipt ? 'validate_receipt_and_dispatch' : 'immediate_liquidation_and_hold',
        tacticName: isReceipt ? 'Confirmación de Comprobante & Datos' : 'Liquidación Directa con Urgencia Natural (2h)',
        copilotDirective: isReceipt
          ? 'El cliente ya compartió comprobante. Valídalo cordialmente y solicita en 1 solo paso los datos de despacho requeridos en tu prompt (Nombre, Cédula, Ciudad, Dirección, Teléfono).'
          : 'Cero rodeos ni fotos adicionales. Entrega liquidación exacta y cuentas bancarias oficiales según tu prompt. Añade urgencia humana: "Te dejo apartado el tuyo por un par de horitas mientras nos compartes el comprobante" y solicita datos de despacho.',
        prohibitedActions: [
          ...prohibitedBase,
          'Prohibido enviar más fotos o preguntas abiertas de exploración cuando el cliente ya quiere pagar',
        ],
        suggestedClosingQuestion: '¿A nombre de quién registramos el despacho para dejártelo listo hoy?',
        allowedCapabilities: capabilities,
      };
    }

    case 'distrust': {
      if (capabilities.businessModel === 'services') {
        const addressText = capabilities.physicalAddress ? `en nuestra sede (${capabilities.physicalAddress})` : 'en nuestras instalaciones';
        return {
          friction,
          frictionLabel,
          customerMindset,
          tacticKey: 'demolish_service_distrust',
          tacticName: 'Seguridad en Servicios (Sede o Modalidad Virtual Verificada)',
          copilotDirective: capabilities.hasPhysicalLocation
            ? `Brinda total tranquilidad mencionando que pueden visitarnos de forma presencial ${addressText} o agendar previa cita para conocer al especialista.`
            : (capabilities.allowsVirtual
                ? 'Explica con calidez y profesionalismo que la atención es 100% personalizada por videollamada (Google Meet / Zoom) con acompañamiento directo de un especialista oficial.'
                : 'Resuelve la desconfianza apoyándote estrictamente en la trayectoria, certificaciones y canales oficiales descritos en tu prompt.'),
          prohibitedActions: [
            ...prohibitedBase,
            'Prohibido inventar sedes físicas que no figuren en el prompt.',
          ],
          suggestedClosingQuestion: capabilities.allowsVirtual && capabilities.allowsInPerson
            ? '¿Te gustaría agendar una cita presencial en nuestra sede o prefieres iniciar con una videollamada?'
            : '¿Te gustaría revisar los horarios disponibles para tu sesión?',
          allowedCapabilities: capabilities,
        };
      }

      if (capabilities.canOfferContraentrega) {
        return {
          friction,
          frictionLabel,
          customerMindset,
          tacticKey: 'demolish_distrust_contraentrega',
          tacticName: 'Derribar Desconfianza con Pago Contraentrega',
          copilotDirective: capabilities.hasPhysicalLocation
            ? 'Menciona la sede autorizada en tu prompt y ofrece Pago Contraentrega para que cancele seguro al recibir en su puerta. Pregunta ciudad de destino.'
            : 'Ofrece directamente la opción de Pago Contraentrega autorizada para que cancele seguro al recibir en su puerta. Pregunta ciudad de destino.',
          prohibitedActions: [
            ...prohibitedBase,
            'Prohibido dar explicaciones defensivas largas; ofrece la contraentrega directo.',
            'Prohibido inventar una sede física si no está en el prompt.',
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
        tacticName: 'Validación de Seguridad Basada en el Prompt',
        copilotDirective: capabilities.hasPhysicalLocation
          ? 'Apóyate en la sede y canales oficiales descritos en tu prompt para validar legitimidad sin dar explicaciones defensivas.'
          : (capabilities.hasOfficialGuarantee
              ? 'Apóyate en la garantía oficial y canales respaldados en tu prompt. Prohibido inventar sedes físicas si el negocio opera online.'
              : 'Resuelve la desconfianza basándote estrictamente en los respaldos, trayectoria y canales oficiales descritos en tu prompt. Prohibido inventar sedes físicas o garantías no escritas.'),
        prohibitedActions: [
          ...prohibitedBase,
          'Prohibido inventar sedes físicas, tiendas presenciales o garantías si no están en el prompt.',
        ],
        suggestedClosingQuestion: capabilities.hasOfficialGuarantee
          ? '¿Deseas que te comparta los detalles de nuestra garantía oficial?'
          : '¿Te gustaría resolver alguna duda puntual sobre el servicio o producto?',
        allowedCapabilities: capabilities,
      };
    }

    case 'postponement': {
      if (capabilities.businessModel === 'services') {
        if (capabilities.hookCategory === 'free_assessment') {
          return {
            friction,
            frictionLabel,
            customerMindset,
            tacticKey: 'free_assessment_bridge',
            tacticName: 'Puente de Valoración Inicial Sin Costo',
            copilotDirective:
              'Comprende su tiempo con calidez. Recuérdale que la primera sesión o diagnóstico es 100% sin costo ni compromiso para que conozca el plan exacto antes de decidir.',
            prohibitedActions: [...prohibitedBase],
            suggestedClosingQuestion: '¿Te gustaría que agendemos tu valoración inicial sin costo para esta semana?',
            allowedCapabilities: capabilities,
          };
        }
        if (capabilities.canOfferPlanSepare) {
          return {
            friction,
            frictionLabel,
            customerMindset,
            tacticKey: 'appointment_deposit_bridge',
            tacticName: 'Reserva de Cupo con Abono Inicial',
            copilotDirective:
              'Ofrécele asegurar su espacio en la agenda con un abono inicial mínimo para congelar la fecha y pagar el saldo el día de la sesión.',
            prohibitedActions: [...prohibitedBase],
            suggestedClosingQuestion: '¿Te gustaría asegurar tu cupo con un abono inicial y programar tu fecha con tranquilidad?',
            allowedCapabilities: capabilities,
          };
        }
        return {
          friction,
          frictionLabel,
          customerMindset,
          tacticKey: 'service_hold_bridge',
          tacticName: 'Acompañamiento en Servicios',
          copilotDirective:
            'Comprende su tiempo sin decir "a la orden". Ofrécele resolver dudas del servicio o revisar horarios tentativos para cuando le quede cómodo.',
          prohibitedActions: [...prohibitedBase],
          suggestedClosingQuestion: '¿Prefieres que revisemos horarios tentativos para la próxima semana?',
          allowedCapabilities: capabilities,
        };
      }

      if (capabilities.canOfferPlanSepare) {
        return {
          friction,
          frictionLabel,
          customerMindset,
          tacticKey: 'bridge_plan_separe_deposit',
          tacticName: 'Puente de Bajo Compromiso (Plan Separe / Abono Inicial)',
          copilotDirective:
            'No lo des por perdido ni digas "a la orden". Ofrécele dejar apartado el suyo con un abono inicial según lo autorizado en tu prompt para congelar disponibilidad y pagar el saldo con calma.',
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
        tacticName: 'Acompañamiento y Micro-Avance según Prompt',
        copilotDirective:
          'Comprende con calidez su tiempo sin cerrar la conversación ni decir "a la orden". Ofrécele guardar su cupo o resolver cualquier duda puntual sobre lo descrito en el catálogo o servicio para ayudarle a decidir con calma (solo ofrece reserva temporal si tu prompt lo contempla).',
        prohibitedActions: [
          ...prohibitedBase,
          'Prohibido inventar reservas temporales o plazos no contemplados en el prompt.',
        ],
        suggestedClosingQuestion: '¿Tienes alguna duda sobre las opciones que te ayude a resolver hoy?',
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
          capabilities.businessModel === 'services'
            ? 'Compara de forma concisa y clara los 2 servicios o modalidades recomendando la más conveniente para su necesidad.'
            : 'Recomienda con convicción la opción favorita de los clientes destacando su beneficio clave y cierra con una alternativa binaria A vs B.',
        prohibitedActions: [
          ...prohibitedBase,
          'Prohibido enviar fichas técnicas largas o aburridas que aumenten la confusión.',
        ],
        suggestedClosingQuestion: capabilities.businessModel === 'services'
          ? '¿Cuál de las dos alternativas va más acorde a lo que buscas?'
          : '¿Prefieres la opción favorita de nuestros clientes o buscas un detalle puntual?',
        allowedCapabilities: capabilities,
      };
    }

    case 'price': {
      if (capabilities.businessModel === 'services') {
        if (capabilities.hookCategory === 'free_assessment') {
          return {
            friction,
            frictionLabel,
            customerMindset,
            tacticKey: 'free_assessment_price_relief',
            tacticName: 'Diagnóstico Sin Costo para Ajustar Presupuesto',
            copilotDirective:
              'Recuérdale que la valoración inicial no tiene costo. En ella se determina con precisión el plan necesario para que no pague de más.',
            prohibitedActions: [...prohibitedBase, 'Prohibido prometer rebajas no autorizadas.'],
            suggestedClosingQuestion: '¿Te gustaría agendar tu valoración sin costo para evaluar tu caso puntual?',
            allowedCapabilities: capabilities,
          };
        }
        if (capabilities.canOfferPlanSepare) {
          return {
            friction,
            frictionLabel,
            customerMindset,
            tacticKey: 'service_deposit_budget_relief',
            tacticName: 'Reserva con Abono Parcial',
            copilotDirective:
              'Facilita el acceso ofreciendo reservar el cupo con un abono inicial y cancelar el resto en cuotas o al recibir la sesión.',
            prohibitedActions: [...prohibitedBase],
            suggestedClosingQuestion: '¿Te quedaría cómodo congelar tu cupo hoy con un anticipo inicial?',
            allowedCapabilities: capabilities,
          };
        }
      }

      if (capabilities.canOfferPlanSepare) {
        return {
          friction,
          frictionLabel,
          customerMindset,
          tacticKey: 'budget_relief_separe',
          tacticName: 'Alivio de Presupuesto con Plan Separe',
          copilotDirective:
            'Facilita la compra proponiendo apartarlo con un abono inicial según lo autorizado en tu prompt.',
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
        tacticName: 'Reencuadre de Valor según el Prompt',
        copilotDirective:
          'Explica el beneficio clave o respaldo que justifica el valor según lo descrito en tu prompt, sin inventar rebajas ni características que no existan.',
        prohibitedActions: [
          ...prohibitedBase,
          'Prohibido inventar descuentos, rebajas o beneficios no descritos en el prompt.',
        ],
        suggestedClosingQuestion: '¿Te gustaría revisar el detalle de lo que incluye para ver si se ajusta a lo que buscas?',
        allowedCapabilities: capabilities,
      };
    }

    case 'discovery':
    default: {
      if (capabilities.businessModel === 'services') {
        const isFree = capabilities.hookCategory === 'free_assessment';
        return {
          friction,
          frictionLabel,
          customerMindset,
          tacticKey: hasConsultativeDoubt ? 'consultative_service_advice' : 'service_availability_discovery',
          tacticName: hasConsultativeDoubt
            ? 'Asesoría Consultiva de Servicios & Agenda'
            : 'Orientación de Servicio y Consulta de Agenda',
          copilotDirective: hasConsultativeDoubt
            ? `El cliente formuló una duda o consulta sobre el servicio. Responde primero con empatía y asesoría clara (máx 2 mensajes cortos); luego recomienda la sesión adecuada usando check_native_availability.`
            : (isFree
                ? 'Presenta el servicio con su gancho de valoración inicial sin costo y ofrece verificar horarios disponibles con check_native_availability.'
                : 'Presenta el servicio con claridad y ofrece verificar horarios disponibles con check_native_availability.'),
          prohibitedActions: [
            ...prohibitedBase,
            'Prohibido cobrar envíos de paquetes para un servicio.',
          ],
          suggestedClosingQuestion: capabilities.allowsVirtual && capabilities.allowsInPerson
            ? '¿Te gustaría agendar de forma presencial en nuestra sede o por videollamada virtual?'
            : (isFree
                ? '¿Te gustaría agendar tu valoración inicial sin costo para esta semana?'
                : '¿Para qué día te quedaría mejor programar tu sesión?'),
          allowedCapabilities: capabilities,
        };
      }

      return {
        friction,
        frictionLabel,
        customerMindset,
        tacticKey: hasConsultativeDoubt ? 'consultative_advice_and_card' : 'visual_card_and_advance',
        tacticName: hasConsultativeDoubt
          ? 'Asesoría Consultiva Prioritaria & Tarjeta Visual'
          : 'Atención Visual con Tarjeta y Micro-Avance',
        copilotDirective: hasConsultativeDoubt
          ? 'El cliente formuló una consulta o duda específica (estatura, medidas, idoneidad, gusto o edad). Divide tu respuesta en máximo 2 mensajes cortos (separados por doble salto): Mensaje 1: responde primero su duda con asesoría honesta; Mensaje 2: recomienda el modelo ideal con su gancho comercial y pregunta de avance. Envía send_product_card.'
          : 'Envía send_product_card con foto oficial y precio. En tu mensaje (máx 1-2 líneas), presenta el beneficio y haz una pregunta de micro-avance hacia el despacho.',
        prohibitedActions: [
          ...prohibitedBase,
          'Prohibido preguntar "¿quieres que te envíe fotos?"; envía la tarjeta directo.',
          ...(hasConsultativeDoubt ? ['Prohibido ignorar la pregunta del cliente para emitir únicamente un gancho de cierre'] : []),
        ],
        suggestedClosingQuestion: hasConsultativeDoubt
          ? '¿Te gustaría apartarla desde hoy con Plan Separe o prefieres conocer algún detalle adicional?'
          : '¿Para entrega en qué ciudad sería?',
        allowedCapabilities: capabilities,
      };
    }
  }
}
