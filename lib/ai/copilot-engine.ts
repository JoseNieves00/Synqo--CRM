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

export interface BusinessFeatureCompatibility {
  businessModel: BusinessModelType;
  supportsShipping: boolean;
  supportsOrders: boolean;
  supportsCalendar: boolean;
  supportsProductGalleryPrompt: boolean;
}

export function getBusinessFeatureCompatibility(
  organization?: any,
  systemPrompt?: string
): BusinessFeatureCompatibility {
  const caps = extractOrganizationCapabilities(organization, systemPrompt);
  const isServicesOnly = caps.businessModel === 'services';
  const isProductsOnly = caps.businessModel === 'products';
  return {
    businessModel: caps.businessModel,
    supportsShipping: !isServicesOnly,
    supportsOrders: !isServicesOnly,
    supportsCalendar: !isProductsOnly,
    supportsProductGalleryPrompt: !isServicesOnly,
  };
}

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

export type HybridIntentTrack = 'order' | 'appointment' | 'integrated' | 'clarify';

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
  intentTrack?: HybridIntentTrack;
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
  const appointmentSettings = organization?.appointment_settings || {};
  const explicitModality = appointmentSettings.attendance_modality;
  const configuredAddress = typeof appointmentSettings.physical_address === 'string' && appointmentSettings.physical_address.trim().length > 0
    ? appointmentSettings.physical_address.trim()
    : null;
  
  // 1. Sede Física y Dirección Extraída (prioriza dirección oficial de settings si existe)
  const isPhysicalLocationNegated =
    /no\s+[^.!?\n]*(?:sede|tienda|local\s*f[ií]sica)|prohibido\s+[^.!?\n]*(?:sede|visita)/i.test(promptText);
  const physicalAddress = configuredAddress || (isPhysicalLocationNegated ? null : extractPhysicalAddressFromPrompt(rawPrompt));
  const hasPhysicalLocation =
    explicitModality === 'in_person' ||
    explicitModality === 'both' ||
    Boolean(configuredAddress) ||
    (!isPhysicalLocationNegated &&
      (Boolean(physicalAddress) ||
        /sede\s*f[ií]sica|tienda\s*f[ií]sica|local\s*comercial|estamos\s*ubicados|vis[ií]tanos|consultorio|cl[ií]nica/i.test(
          promptText
        )));

  // 2. Modalidades de Atención (Virtual vs Presencial)
  const allowsVirtual =
    explicitModality === 'virtual' ||
    explicitModality === 'both' ||
    /virtual|zoom|meet|videollamada|teleconsulta|en l[ií]nea|remot[ao]/i.test(promptText);
  const allowsInPerson =
    explicitModality === 'in_person' ||
    explicitModality === 'both' ||
    hasPhysicalLocation ||
    /presencial|en\s*sede|instalaciones/i.test(promptText);

  // 3. Detección de Modelo de Negocio (Servicios, Productos o Híbrido)
  const explicitCalendar = organization?.enabled_modules?.native_calendar;
  const hasCalendarIntent = /agenda|agendar|cita|reserva|turno|horario|calendario|visita|consulta|sesi[oó]n|valoraci[oó]n/i.test(promptText);
  const hasServicesIndicator =
    explicitCalendar === true || (explicitCalendar !== false && hasCalendarIntent);

  const explicitOrders = organization?.enabled_modules?.orders;
  const hasProductsIntent = /env[ií]os?|despacho|flete|paquete|transportadora|contraentrega|producto|cat[aá]logo|tienda|talla|stock|f[aá]brica|comercializamos|vendemos|plan\s*separe|apartar|mercanc[ií]a|art[ií]culo/i.test(promptText);
  const hasShippingSettings = Boolean(organization?.appointment_settings?.shipping_settings);
  const hasProductsIndicator =
    explicitOrders === true ||
    (explicitOrders !== false && (hasProductsIntent || hasShippingSettings));

  const presetNorm = String(organization?.industry_preset || '').toLowerCase();
  let businessModel: BusinessModelType = 'services';
  if (hasProductsIndicator && hasServicesIndicator) {
    businessModel = 'hybrid';
  } else if (hasProductsIndicator) {
    businessModel = 'products';
  } else if (hasServicesIndicator) {
    businessModel = 'services';
  } else if (/salud|estetica|servicios|consultoria|educacion|legal|clinica|agencia/.test(presetNorm)) {
    businessModel = 'services';
  } else {
    businessModel = 'products';
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
 * Enrutador determinístico de alta precisión (0 tokens) para negocios híbridos y multi-intención.
 * Soporta carril integrado (ej. remodelación: estimación/visita + venta del proyecto) y cambio dinámico sin bloqueo pegajoso.
 */
export function resolveHybridIntentTrack(params: {
  businessModel: BusinessModelType;
  history: Array<{ sender_type: string; content: string }>;
  contactData?: any;
}): HybridIntentTrack {
  const { businessModel, history, contactData } = params;
  if (businessModel === 'products') return 'order';
  if (businessModel === 'services') return 'appointment';

  const leadMsgs = (history || [])
    .filter((m) => m.sender_type === 'lead' && typeof m.content === 'string')
    .slice(-3);
  if (leadMsgs.length === 0) {
    const saved = contactData?.custom_fields?.active_intent_track;
    return saved === 'order' || saved === 'appointment' || saved === 'integrated' ? saved : 'clarify';
  }

  const orderPhraseRx =
    /\b(?:cu[aá]nto\s+(?:vale|cuesta|sale)|precio\s+de|cotizar\s+env[ií]o|pago\s+contraentrega|contra\s*entrega|plan\s+separe|hacer\s+pedido|comprar|quiero\s+pedir|a\s+qu[eé]\s+cuenta\s+(?:pago|transfiero)|transferencia|nequi|daviplata|bancolombia|anticipo|abono|talla|color|cat[aá]logo|env[ií]o\s+a\s+domicilio|despacho|flete)\b/gi;
  const apptPhraseRx =
    /\b(?:agendar\s+(?:cita|visita)|sacar\s+cita|programar\s+(?:cita|visita)|venir\s+a\s+medir|ir\s+a\s+medir|toma\s+de\s+medidas|visita\s+(?:t[eé]cnica|de\s+estimaci[oó]n)|disponibilidad|tienen\s+(?:espacio|cupo)|espacio\s+(?:hoy|ma[ñn]ana|el)|horarios?\s+disponibles?|qu[eé]\s+d[ií]a\s+pueden|cu[aá]ndo\s+pueden\s+venir|valoraci[oó]n|consulta|sesi[oó]n|cita|turno|reservar|sede\s+f[ií]sica|videollamada|zoom|meet)\b/gi;

  let orderScore = 0;
  let apptScore = 0;

  leadMsgs.forEach((m, idx) => {
    const isLatest = idx === leadMsgs.length - 1;
    const weight = isLatest ? 2.5 : 1.0;
    const text = m.content.toLowerCase();
    const oMatches = text.match(orderPhraseRx)?.length || 0;
    const aMatches = text.match(apptPhraseRx)?.length || 0;
    orderScore += oMatches * weight;
    apptScore += aMatches * weight;
  });

  const latestText = leadMsgs[leadMsgs.length - 1].content.toLowerCase();
  const latestHasExplicitOrder = (latestText.match(orderPhraseRx)?.length || 0) > 0;
  const latestHasExplicitAppt = (latestText.match(apptPhraseRx)?.length || 0) > 0;
  const prevTrack = contactData?.custom_fields?.active_intent_track;

  if (!latestHasExplicitOrder && !latestHasExplicitAppt) {
    if (prevTrack === 'order') orderScore += 0.8;
    else if (prevTrack === 'appointment') apptScore += 0.8;
    else if (prevTrack === 'integrated') return 'integrated';
  }

  if (orderScore >= 2.0 && apptScore >= 2.0) return 'integrated';
  if (orderScore >= 1.5 && orderScore - apptScore >= 1.0) return 'order';
  if (apptScore >= 1.5 && apptScore - orderScore >= 1.0) return 'appointment';
  if (orderScore > 0 && apptScore > 0) return 'integrated';
  if (orderScore > apptScore && orderScore >= 0.8) return 'order';
  if (apptScore > orderScore && apptScore >= 0.8) return 'appointment';

  return 'clarify';
}

/**
 * Genera la prescripción táctica del Copiloto para guiar a la IA o al asesor.
 * Respeta al 100% las capacidades autorizadas en el prompt/configuración.
 */
export function diagnoseCopilotTurn(input: CopilotEngineInput): CopilotPrescription {
  const capabilities = extractOrganizationCapabilities(input.organization, input.organization?.system_prompt || '');
  const intentTrack = resolveHybridIntentTrack({
    businessModel: capabilities.businessModel,
    history: input.history,
    contactData: input.contactData,
  });

  const basePrescription = buildBaseCopilotPrescription(input, capabilities, intentTrack);
  if (capabilities.businessModel !== 'hybrid') {
    return { ...basePrescription, intentTrack };
  }

  const trackOverlay: Record<HybridIntentTrack, { directive: string; prohibited?: string }> = {
    order: {
      directive:
        ' [Carril activo: VENTA / PEDIDO — Entrega lo que pide (precio/foto) y extrae dato de cierre (ciudad, talla o medio de pago). Prohibido ofrecer citas o calendario en este turno.]',
      prohibited: 'Prohibido ofrecer citas o calendario cuando el cliente está en carril de compra directa.',
    },
    appointment: {
      directive:
        ' [Carril activo: AGENDA / CITA — Responde su duda y propón 2 horarios o modalidad. Prohibido pedir dirección de envío de paquetería o fletes en este turno.]',
      prohibited: 'Prohibido pedir dirección de envío de paquetería cuando el cliente está en carril de cita.',
    },
    integrated: {
      directive:
        ' [Carril activo: PROYECTO INTEGRADO — Responde primero lo que el cliente pidió (rango o detalle del proyecto/producto según tu prompt) y propón la visita/estimación como siguiente paso natural con 2 opciones de horario.]',
    },
    clarify: {
      directive:
        ' [Intención abierta en negocio híbrido — Responde brevemente y pregunta en 1 línea si busca comprar un producto para envío o agendar una cita/visita.]',
    },
  };

  const overlay = trackOverlay[intentTrack];
  return {
    ...basePrescription,
    intentTrack,
    copilotDirective: `${basePrescription.copilotDirective}${overlay.directive}`,
    prohibitedActions: overlay.prohibited
      ? [...basePrescription.prohibitedActions, overlay.prohibited]
      : basePrescription.prohibitedActions,
  };
}

function buildBaseCopilotPrescription(
  input: CopilotEngineInput,
  capabilities: OrganizationCapabilities,
  intentTrack: HybridIntentTrack
): CopilotPrescription {
  const { history, contactData, organization, leadScore } = input;
  const cf = (contactData?.custom_fields as Record<string, any>) || {};

  // Obtener último texto del lead y señales de fotos previas / cita de producto
  const lastLeadMsg = [...history].reverse().find((m) => m.sender_type === 'lead');
  const lastLeadText = lastLeadMsg?.content || '';
  const alreadySentPhotosCount = history.filter(
    (m) =>
      (m.sender_type === 'ai' || m.sender_type === 'agent_manual') &&
      /\[IMAGEN:/i.test(m.content || '')
  ).length;
  const quotedCardMatch = lastLeadText.match(/\[Cita:\s*[^\]]*?([^|\n·\]]+?)(?:\s*·\s*\$|\s*\||\])/i);
  const activeProductFocus =
    resolveProductInterest(cf, contactData?.deal_value) ||
    (quotedCardMatch?.[1] ? quotedCardMatch[1].trim() : null);
  const isOperationalOrAvailabilityQuestion =
    /\b(entrega\s+inmediata|disponibilidad|tienen\s+list[oa]s?|list[oa]s?\s+para|cu[aá]nto\s+tarda|d[oó]nde\s+(?:est[aá]n|quedan)|ubicaci[oó]n|direcci[oó]n|garant[ií]a|horario)\b/i.test(
      lastLeadText
    );
  const wantsExplicitResend =
    /\b(repite|de nuevo|otra vez|no me carga|no puedo ver|reenv[ií]a)\b/i.test(lastLeadText);

  // Detectar si el prospecto formuló una consulta consultiva específica multi-nicho:
  // - Productos: estatura, medidas, dimensiones, espacio, edades, peso, resistencia, materiales, armado.
  // - Servicios: dolor, duración, procedimiento, anestesia, preparación, especialista, modalidad virtual vs presencial.
  // - Híbridos: toma de medidas a domicilio, instalación, montaje, garantía de mano de obra.
  const hasConsultativeDoubt =
    /\?|mide|altura|alto|baja?|estatura|tamaño|medida|dimension|espacio|cabe|ancho|profund|edad|años|meses|para\s+niñ[oa]|para\s+beb[eé]|le\s+gusta|le\s+gustan|le\s+sirve|sirve\s+para|funciona\s+para|adecuad[ao]|recomendad[ao]|material|madera|pl[aá]stico|resiste|soporta|peso|kilos|recomiendas|diferencia\s+entre|garant[ií]a|instalaci[oó]n|incluye|armad[ao]|dura|duraci[oó]n|duele|dolor|anestesia|procedimiento|requisito|preparaci[oó]n|visita|domicilio|virtual|presencial|parqueadero/i.test(
      lastLeadText
    );

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
          intentTrack,
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
        intentTrack,
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
        intentTrack,
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
            intentTrack,
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
            intentTrack,
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
          intentTrack,
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
        intentTrack,
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
            ? `El cliente formuló una duda o consulta sobre el servicio. Divide tu respuesta en máximo 2 mensajes: Mensaje 1: asesoría breve y empática (máx 1-2 oraciones, ~25 palabras); Mensaje 2: recomienda la sesión y verifica horarios con check_native_availability.`
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
          intentTrack,
        };
      }

      const suppressCardResend =
        (alreadySentPhotosCount > 0 && isOperationalOrAvailabilityQuestion && !wantsExplicitResend) ||
        (Boolean(quotedCardMatch) && !wantsExplicitResend);

      const spData = organization?.structured_prompt_data || organization?.structured_prompt || {};
      const catalogItemsForMatch: any[] = [
        ...(Array.isArray(spData.gallery) ? spData.gallery : []),
        ...(Array.isArray(spData.catalog) ? spData.catalog : []),
      ];
      const normLeadForMatch = lastLeadText
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      const hasAdOrVisualRef =
        /\[Publicaci[oó]n\/Anuncio compartido:|\[IMAGE_URL:|\[Consulta de cat[aá]logo:|\[Cita:/i.test(lastLeadText);
      const mentionsCatalogItem = catalogItemsForMatch.some((item) => {
        const words = String(item?.name || item?.productName || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length >= 4 && !/^(para|con|sin|los|las|una|unos|unas|mini|gran)$/.test(w));
        return words.length > 0 && words.every((w) => normLeadForMatch.includes(w));
      });
      const isGenericBroadInquiry =
        alreadySentPhotosCount === 0 &&
        !activeProductFocus &&
        !hasAdOrVisualRef &&
        !mentionsCatalogItem &&
        lastLeadText.trim().length <= 100 &&
        /(hola|buen[oa]s|quiero\s+m[aá]s\s+info|m[aá]s\s+informaci[oó]n|\binfo(?:rmaci[oó]n)?\b|cat[aá]logo|precios?|cu[aá]nto\s+(?:cuesta|vale)n?)/i.test(
          normLeadForMatch
        );

      return {
        friction,
        frictionLabel,
        customerMindset,
        tacticKey: hasConsultativeDoubt ? 'consultative_advice_and_card' : 'visual_card_and_advance',
        tacticName: suppressCardResend
          ? 'Respuesta Directa sin Reenviar Catálogo'
          : isGenericBroadInquiry
          ? 'Presentación de Opciones y Clarificación'
          : hasConsultativeDoubt
          ? 'Asesoría Consultiva Prioritaria & Tarjeta Visual'
          : 'Atención Visual con Tarjeta y Micro-Avance',
        copilotDirective: suppressCardResend
          ? `El cliente ya vio fotos en el chat${activeProductFocus ? ` (producto en foco: ${activeProductFocus})` : ''}. Responde directamente su consulta puntual en 1 solo mensaje claro (160–360 caracteres) sin reenviar fotos ni repetir el catálogo.`
          : hasAdOrVisualRef
          ? 'El cliente viene de un anuncio/publicación o envió referencia visual. Extrae e identifica el producto exacto del anuncio o imagen comparándolo con el catálogo y responde directamente sobre ESE producto (enviando su foto con send_product_card si aún no la tiene y su precio). PROHIBIDO preguntarle qué producto busca y PROHIBIDO decirle que "enviaste tarjetas visuales".'
          : isGenericBroadInquiry
          ? 'El cliente hizo una consulta abierta ("quiero más información" / "precio") sin indicar modelo ni traer referencia de anuncio. PROHIBIDO adivinar un solo producto al azar; presenta brevemente las opciones del catálogo con sus precios y pregúntale cuál le interesa.'
          : hasConsultativeDoubt
          ? 'El cliente formuló una consulta o duda específica (estatura, medidas, idoneidad, gusto o edad). Responde primero su duda con empatía en 1 mensaje claro y, si aún no ha visto la foto del modelo ideal, envía send_product_card.'
          : 'Envía send_product_card con foto oficial y precio (solo si aún no se ha enviado esa foto en este chat) y haz una pregunta corta de micro-avance.',
        prohibitedActions: [
          ...prohibitedBase,
          ...(suppressCardResend
            ? [
                'Prohibido llamar a send_product_card o reenviar fotos que el cliente ya tiene en el chat.',
                ...(activeProductFocus ? [`Prohibido preguntar qué modelo busca; el foco ya es "${activeProductFocus}".`] : []),
              ]
            : isGenericBroadInquiry
            ? ['Prohibido llamar a send_product_card o send_whatsapp_image adivinando un solo producto cuando el cliente no especificó cuál busca.']
            : ['Prohibido preguntar "¿quieres que te envíe fotos?"; envía la tarjeta directo si aún no la tiene.']),
          ...(hasConsultativeDoubt ? ['Prohibido ignorar la pregunta del cliente para emitir únicamente un gancho de cierre'] : []),
        ],
        suggestedClosingQuestion: activeProductFocus
          ? `¿Te gustaría confirmar tu pedido de ${activeProductFocus} o resolver alguna duda adicional?`
          : isGenericBroadInquiry
          ? '¿Cuál de estos modelos te gustaría ver en foto o cuál viste en el anuncio?'
          : hasConsultativeDoubt
          ? '¿Te gustaría apartarla desde hoy o prefieres conocer algún detalle adicional?'
          : '¿Para entrega en qué ciudad sería?',
        allowedCapabilities: capabilities,
        intentTrack,
      };
    }
  }
}
