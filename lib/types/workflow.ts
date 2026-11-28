export type WorkflowRole = 'autonomous_close' | 'qualify_and_handoff' | 'assist_only';
export type PriceDisclosurePolicy = 'always' | 'after_hours_only' | 'never';
export type ResponsePertinenceStyle = 'strict' | 'consultive';
export type RequiredLeadField = 'product_or_service' | 'city' | 'modality' | 'date_preference';

export type WorkflowStepType =
  | 'greeting'
  | 'identify_catalog'
  | 'collect_data'
  | 'condition_branch'
  | 'quote_or_schedule'
  | 'custom_instruction'
  | 'final_action';

export type WorkflowStepCondition =
  | 'always'
  | 'first_message'
  | 'from_ad_or_story'
  | 'campaign_reply'
  | 'price_or_payment_question'
  | 'when_missing_data';

export interface WorkflowStep {
  id: string;
  type: WorkflowStepType;
  title: string;
  enabled: boolean;
  condition: WorkflowStepCondition;
  config?: {
    showPhoto?: boolean;
    showDetails?: boolean;
    showPrice?: boolean;
    fieldKey?: string;
    fieldLabel?: string;
    shippingMode?: 'separate' | 'included_in_total' | 'calendar';
    instruction?: string;
    actionType?: 'handoff_advisor' | 'autonomous_close' | 'queue_after_hours' | 'schedule_follow_up';
  };
}

export interface WorkflowPolicy {
  presetId?: 'autonomous_24_7' | 'qualifier_handoff' | 'appointments' | 'custom';
  businessHoursRole: WorkflowRole;
  afterHoursRole: WorkflowRole;
  pricePolicy: PriceDisclosurePolicy;
  requiredFields: RequiredLeadField[];
  handoffOnQualified: boolean;
  handoffOnCampaignReply: boolean;
  allowAiOrders: boolean;
  allowAiAppointments: boolean;
  responseStyle: ResponsePertinenceStyle;
  /** Tope máximo de caracteres por respuesta (0 = sin límite, sigue el prompt del negocio). */
  maxReplyChars?: number;
  /** Pasos modulares configurables para horario laboral (si no existen, se sintetizan automáticamente). */
  daySteps?: WorkflowStep[];
  /** Pasos modulares configurables para fuera de horario. */
  nightSteps?: WorkflowStep[];
}

export const DEFAULT_WORKFLOW_POLICY: WorkflowPolicy = {
  presetId: 'autonomous_24_7',
  businessHoursRole: 'autonomous_close',
  afterHoursRole: 'autonomous_close',
  pricePolicy: 'always',
  requiredFields: [],
  handoffOnQualified: false,
  handoffOnCampaignReply: false,
  allowAiOrders: true,
  allowAiAppointments: true,
  responseStyle: 'consultive',
  maxReplyChars: 450,
};

export const WORKFLOW_PRESETS: Record<
  'autonomous_24_7' | 'qualifier_handoff' | 'appointments',
  { label: string; description: string; policy: WorkflowPolicy }
> = {
  autonomous_24_7: {
    label: 'Venta Autónoma 24/7',
    description: 'La IA asesora, da precios, cotiza y cierra pedidos/reservas todo el día.',
    policy: { ...DEFAULT_WORKFLOW_POLICY, presetId: 'autonomous_24_7' },
  },
  qualifier_handoff: {
    label: 'Recepción + Relevo a Asesor (Horario Laboral)',
    description:
      'En horario laboral captura producto/servicio + ciudad y pasa al asesor sin dar precios. Fuera de horario responde dudas, da precios y deja el cierre pendiente en Inbox.',
    policy: {
      presetId: 'qualifier_handoff',
      businessHoursRole: 'qualify_and_handoff',
      afterHoursRole: 'assist_only',
      pricePolicy: 'after_hours_only',
      requiredFields: ['product_or_service', 'city'],
      handoffOnQualified: true,
      handoffOnCampaignReply: true,
      allowAiOrders: false,
      allowAiAppointments: false,
      responseStyle: 'strict',
    },
  },
  appointments: {
    label: 'Agenda de Citas / Servicios',
    description: 'La IA consulta disponibilidad y agenda citas; no crea pedidos físicos.',
    policy: {
      presetId: 'appointments',
      businessHoursRole: 'autonomous_close',
      afterHoursRole: 'autonomous_close',
      pricePolicy: 'always',
      requiredFields: ['product_or_service', 'modality'],
      handoffOnQualified: false,
      handoffOnCampaignReply: false,
      allowAiOrders: false,
      allowAiAppointments: true,
      responseStyle: 'consultive',
    },
  },
};

export interface EffectiveWorkflowState {
  role: WorkflowRole;
  isWithinBusinessHours: boolean;
  canDisclosePrices: boolean;
  canCreateOrders: boolean;
  canBookAppointments: boolean;
  shouldHandoffOnQualified: boolean;
  shouldHandoffOnCampaignReply: boolean;
  requiredFields: RequiredLeadField[];
  responseStyle: ResponsePertinenceStyle;
  maxReplyChars: number;
}

export function normalizeWorkflowPolicy(raw?: Partial<WorkflowPolicy> | null): WorkflowPolicy {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_WORKFLOW_POLICY };
  return {
    presetId: raw.presetId || 'custom',
    businessHoursRole: raw.businessHoursRole || DEFAULT_WORKFLOW_POLICY.businessHoursRole,
    afterHoursRole: raw.afterHoursRole || DEFAULT_WORKFLOW_POLICY.afterHoursRole,
    pricePolicy: raw.pricePolicy || DEFAULT_WORKFLOW_POLICY.pricePolicy,
    requiredFields: Array.isArray(raw.requiredFields) ? raw.requiredFields : DEFAULT_WORKFLOW_POLICY.requiredFields,
    handoffOnQualified:
      typeof raw.handoffOnQualified === 'boolean' ? raw.handoffOnQualified : DEFAULT_WORKFLOW_POLICY.handoffOnQualified,
    handoffOnCampaignReply:
      typeof raw.handoffOnCampaignReply === 'boolean'
        ? raw.handoffOnCampaignReply
        : DEFAULT_WORKFLOW_POLICY.handoffOnCampaignReply,
    allowAiOrders: typeof raw.allowAiOrders === 'boolean' ? raw.allowAiOrders : DEFAULT_WORKFLOW_POLICY.allowAiOrders,
    allowAiAppointments:
      typeof raw.allowAiAppointments === 'boolean'
        ? raw.allowAiAppointments
        : DEFAULT_WORKFLOW_POLICY.allowAiAppointments,
    responseStyle: raw.responseStyle || DEFAULT_WORKFLOW_POLICY.responseStyle,
    maxReplyChars:
      typeof raw.maxReplyChars === 'number' ? raw.maxReplyChars : DEFAULT_WORKFLOW_POLICY.maxReplyChars,
    daySteps: Array.isArray(raw.daySteps) ? raw.daySteps : undefined,
    nightSteps: Array.isArray(raw.nightSteps) ? raw.nightSteps : undefined,
  };
}

export function buildDefaultWorkflowSteps(
  policy: WorkflowPolicy,
  isDay: boolean,
  supportsOrders = true,
  supportsAppointments = true
): WorkflowStep[] {
  const role = isDay ? policy.businessHoursRole : policy.afterHoursRole;
  const canShowPrice =
    policy.pricePolicy === 'always' || (policy.pricePolicy === 'after_hours_only' && !isDay);

  const steps: WorkflowStep[] = [
    {
      id: `${isDay ? 'day' : 'night'}_greeting`,
      type: 'greeting',
      title: 'Saludar con la identidad del negocio',
      enabled: true,
      condition: 'first_message',
      config: { instruction: 'Usa el saludo inicial de <instrucciones_del_negocio> en el primer contacto.' },
    },
    {
      id: `${isDay ? 'day' : 'night'}_catalog`,
      type: 'identify_catalog',
      title: supportsOrders ? 'Identificar producto y mostrar ficha' : 'Identificar servicio y explicar alcance',
      enabled: true,
      condition: 'always',
      config: {
        showPhoto: supportsOrders,
        showDetails: true,
        showPrice: canShowPrice,
      },
    },
  ];

  if (policy.requiredFields.includes('city') && supportsOrders) {
    steps.push({
      id: `${isDay ? 'day' : 'night'}_city`,
      type: 'collect_data',
      title: 'Preguntar ciudad de entrega',
      enabled: true,
      condition: 'when_missing_data',
      config: { fieldKey: 'city', fieldLabel: 'Ciudad de entrega' },
    });
  }

  if (policy.requiredFields.includes('modality') && supportsAppointments) {
    steps.push({
      id: `${isDay ? 'day' : 'night'}_modality`,
      type: 'collect_data',
      title: 'Preguntar modalidad (presencial / virtual)',
      enabled: true,
      condition: 'when_missing_data',
      config: { fieldKey: 'modality', fieldLabel: 'Modalidad de atención' },
    });
  }

  if (role === 'autonomous_close') {
    if (supportsOrders) {
      steps.push({
        id: `${isDay ? 'day' : 'night'}_quote`,
        type: 'quote_or_schedule',
        title: 'Cotizar envío y confirmar total',
        enabled: true,
        condition: 'always',
        config: { shippingMode: 'separate' },
      });
    }
    if (supportsAppointments) {
      steps.push({
        id: `${isDay ? 'day' : 'night'}_calendar`,
        type: 'quote_or_schedule',
        title: 'Consultar disponibilidad de agenda',
        enabled: true,
        condition: 'always',
        config: { shippingMode: 'calendar' },
      });
    }
    steps.push({
      id: `${isDay ? 'day' : 'night'}_close`,
      type: 'final_action',
      title: 'Cerrar pedido o agendar cita de forma autónoma',
      enabled: true,
      condition: 'always',
      config: { actionType: 'autonomous_close' },
    });
  } else if (role === 'qualify_and_handoff') {
    steps.push({
      id: `${isDay ? 'day' : 'night'}_handoff`,
      type: 'final_action',
      title: 'Pasar a asesor disponible con resumen listo',
      enabled: true,
      condition: 'always',
      config: { actionType: 'handoff_advisor' },
    });
  } else {
    steps.push({
      id: `${isDay ? 'day' : 'night'}_queue`,
      type: 'final_action',
      title: isDay ? 'Responder dudas y pasar a asesor' : 'Asistir dudas y dejar cierre pendiente en Inbox',
      enabled: true,
      condition: 'always',
      config: { actionType: isDay ? 'handoff_advisor' : 'queue_after_hours' },
    });
  }

  return steps;
}

function sanitizeStepText(value: unknown, maxLen: number): string {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function compileWorkflowStepsDirective(
  steps: WorkflowStep[],
  ctx: {
    isFirstAiTurn: boolean;
    hasProduct: boolean;
    hasCity: boolean;
    hasAdContext: boolean;
    capturedFields?: Record<string, boolean>;
  }
): string {
  const active = (steps || []).filter((s) => s.enabled);
  if (active.length === 0) return '';

  const lines = active.map((step, idx) => {
    const fieldKey = step.config?.fieldKey || '';
    const isFieldCaptured =
      (fieldKey === 'city' && ctx.hasCity) ||
      (fieldKey && Boolean(ctx.capturedFields?.[fieldKey]));

    let statusTag = '[PENDIENTE]';
    if (step.type === 'greeting' && !ctx.isFirstAiTurn) statusTag = '[YA CUMPLIDO]';
    if (step.type === 'identify_catalog' && ctx.hasProduct) statusTag = '[PRODUCTO IDENTIFICADO - avanzar si aplica]';
    if (step.type === 'collect_data' && isFieldCaptured) {
      statusTag = '[YA CAPTURADO - NO volver a pedir]';
    }

    const condLabel =
      step.condition === 'first_message'
        ? ' (solo 1er mensaje)'
        : step.condition === 'from_ad_or_story'
        ? ' (si viene de anuncio/historia)'
        : step.condition === 'campaign_reply'
        ? ' (si responde campaña/seguimiento)'
        : step.condition === 'price_or_payment_question'
        ? ' (solo si pregunta precio/pago)'
        : step.condition === 'when_missing_data'
        ? ' (si aún falta el dato)'
        : '';

    const cleanTitle = sanitizeStepText(step.title, 100) || 'Paso';
    const cleanInstruction = sanitizeStepText(step.config?.instruction, 280);

    const detail = cleanInstruction
      ? `: ${cleanInstruction}`
      : step.type === 'identify_catalog'
      ? `: ${step.config?.showPhoto ? 'enviar foto, ' : ''}${step.config?.showDetails ? 'dar detalles/medidas, ' : ''}${
          step.config?.showPrice ? 'precio permitido' : 'NO mencionar precios'
        }`
      : step.type === 'collect_data' && fieldKey
      ? `: capturar "${sanitizeStepText(step.config?.fieldLabel || fieldKey, 60)}"`
      : '';

    return `${idx + 1}. ${statusTag} ${cleanTitle}${condLabel}${detail}`;
  });

  return `Pasos flexibles del flujo (sigue el orden; si el cliente ya entregó un dato o saltó adelante, avanza al siguiente paso sin repetir):\n${lines.join('\n')}`;
}

export function resolveEffectiveWorkflowState(
  rawPolicy: Partial<WorkflowPolicy> | null | undefined,
  isWithinBusinessHours: boolean
): EffectiveWorkflowState {
  const policy = normalizeWorkflowPolicy(rawPolicy);
  const role = isWithinBusinessHours ? policy.businessHoursRole : policy.afterHoursRole;

  let canDisclosePrices =
    policy.pricePolicy === 'always' ||
    (policy.pricePolicy === 'after_hours_only' && !isWithinBusinessHours);

  // Respetar el toggle específico del nodo identify_catalog en la rama activa (sin permitir precios si pricePolicy === 'never')
  const branchSteps = isWithinBusinessHours ? policy.daySteps : policy.nightSteps;
  if (Array.isArray(branchSteps) && branchSteps.length > 0 && policy.pricePolicy !== 'never') {
    const catalogStep = branchSteps.find((s) => s.enabled && s.type === 'identify_catalog');
    if (catalogStep && typeof catalogStep.config?.showPrice === 'boolean') {
      canDisclosePrices = catalogStep.config.showPrice;
    }
  }

  const canCreateOrders = policy.allowAiOrders && role === 'autonomous_close';
  const canBookAppointments = policy.allowAiAppointments && role === 'autonomous_close';

  return {
    role,
    isWithinBusinessHours,
    canDisclosePrices,
    canCreateOrders,
    canBookAppointments,
    shouldHandoffOnQualified:
      isWithinBusinessHours && (policy.handoffOnQualified || role === 'qualify_and_handoff'),
    shouldHandoffOnCampaignReply: isWithinBusinessHours && policy.handoffOnCampaignReply,
    requiredFields: policy.requiredFields,
    responseStyle: policy.responseStyle,
    maxReplyChars: typeof policy.maxReplyChars === 'number' ? policy.maxReplyChars : 450,
  };
}
