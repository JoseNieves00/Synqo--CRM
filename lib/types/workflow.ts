export type WorkflowRole = 'autonomous_close' | 'qualify_and_handoff' | 'assist_only';
export type PriceDisclosurePolicy = 'always' | 'after_hours_only' | 'never';
export type ResponsePertinenceStyle = 'strict' | 'consultive';
export type RequiredLeadField = 'product_or_service' | 'city' | 'modality' | 'date_preference';

export type WorkflowTriggerType =
  | 'general_message'
  | 'ad_or_story'
  | 'campaign_reply'
  | 'multimedia_or_sticker'
  | 'after_hours';

export interface AutomationWorkflow {
  id: string;
  name: string;
  description?: string;
  trigger: WorkflowTriggerType;
  enabled: boolean;
  priority: number;
  steps: WorkflowStep[];
}

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
    branchCondition?: 'is_business_hours' | 'has_product' | 'has_city' | 'asks_price_or_payment' | 'says_will_think';
    ifTrueAction?: string;
    ifFalseAction?: string;
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
  /** Múltiples flujos independientes por disparador (estilo n8n). */
  workflows?: AutomationWorkflow[];
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
    workflows: Array.isArray(raw.workflows) ? raw.workflows : undefined,
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

    let detail = '';
    if (step.type === 'condition_branch' && step.config?.branchCondition) {
      const condNameMap: Record<string, string> = {
        is_business_hours: '¿Está en horario laboral?',
        has_product: '¿Ya sabemos qué producto/servicio busca?',
        has_city: '¿Ya entregó su ciudad?',
        asks_price_or_payment: '¿Pregunta por precio o forma de pago?',
        says_will_think: '¿Dice "lo pienso" / "luego confirmo"?',
      };
      const q = condNameMap[step.config.branchCondition] || step.config.branchCondition;
      const t = sanitizeStepText(step.config.ifTrueAction || 'Continuar', 120);
      const f = sanitizeStepText(step.config.ifFalseAction || 'Pedir dato faltante', 120);
      detail = `: IF (${q}) → SÍ: [${t}] | NO: [${f}]`;
    } else if (cleanInstruction) {
      detail = `: ${cleanInstruction}`;
    } else if (step.type === 'identify_catalog') {
      detail = `: ${step.config?.showPhoto ? 'enviar foto, ' : ''}${step.config?.showDetails ? 'dar detalles/medidas, ' : ''}${
        step.config?.showPrice ? 'precio permitido' : 'NO mencionar precios'
      }`;
    } else if (step.type === 'collect_data' && fieldKey) {
      detail = `: capturar "${sanitizeStepText(step.config?.fieldLabel || fieldKey, 60)}"`;
    }

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

export function buildDefaultAutomationWorkflows(
  policy: WorkflowPolicy,
  supportsOrders = true,
  supportsAppointments = true
): AutomationWorkflow[] {
  const daySteps =
    policy.daySteps && policy.daySteps.length > 0
      ? policy.daySteps
      : buildDefaultWorkflowSteps(policy, true, supportsOrders, supportsAppointments);
  const nightSteps =
    policy.nightSteps && policy.nightSteps.length > 0
      ? policy.nightSteps
      : buildDefaultWorkflowSteps(policy, false, supportsOrders, supportsAppointments);

  const isAdvisorFlow = policy.businessHoursRole !== 'autonomous_close';

  return [
    {
      id: 'wf_ad_or_story',
      name: 'Leads de Anuncios e Historias',
      description: 'Cruza el anuncio/historia con el catálogo y responde directo sobre ese producto.',
      trigger: 'ad_or_story',
      enabled: true,
      priority: 100,
      steps: [
        {
          id: 'ad_greet',
          type: 'greeting',
          title: 'Saludar con la identidad del negocio',
          enabled: true,
          condition: 'first_message',
          config: { instruction: 'Usa el saludo inicial de <instrucciones_del_negocio>.' },
        },
        {
          id: 'ad_cat',
          type: 'identify_catalog',
          title: 'Mostrar producto detectado del anuncio',
          enabled: true,
          condition: 'from_ad_or_story',
          config: {
            showPhoto: supportsOrders,
            showDetails: true,
            showPrice: policy.pricePolicy === 'always',
          },
        },
        ...(supportsOrders
          ? [
              {
                id: 'ad_city',
                type: 'collect_data' as const,
                title: 'Preguntar ciudad de entrega',
                enabled: true,
                condition: 'when_missing_data' as const,
                config: { fieldKey: 'city', fieldLabel: 'Ciudad de entrega' },
              },
            ]
          : []),
        {
          id: 'ad_final',
          type: 'final_action',
          title: isAdvisorFlow ? 'Pasar a asesor con ficha lista' : 'Cotizar y cerrar autónomamente',
          enabled: true,
          condition: 'always',
          config: { actionType: isAdvisorFlow ? 'handoff_advisor' : 'autonomous_close' },
        },
      ],
    },
    {
      id: 'wf_campaign_reply',
      name: 'Respuestas a Campañas y Seguimientos',
      description: 'Gestiona respuestas a campañas masivas o reactivaciones.',
      trigger: 'campaign_reply',
      enabled: true,
      priority: 90,
      steps: [
        {
          id: 'camp_action',
          type: 'final_action',
          title: policy.handoffOnCampaignReply
            ? 'Pasar directo a asesor disponible (en horario laboral)'
            : 'Continuar asesoría con IA',
          enabled: true,
          condition: 'campaign_reply',
          config: { actionType: policy.handoffOnCampaignReply ? 'handoff_advisor' : 'autonomous_close' },
        },
      ],
    },
    {
      id: 'wf_multimedia',
      name: 'Stickers y Multimedia',
      description: 'Evita respuestas largas ante stickers sueltos y procesa imágenes/videos con seguridad.',
      trigger: 'multimedia_or_sticker',
      enabled: true,
      priority: 80,
      steps: [
        {
          id: 'mm_rule',
          type: 'custom_instruction',
          title: 'Manejo limpio de sticker/video/imagen',
          enabled: true,
          condition: 'always',
          config: {
            instruction:
              'Si es un sticker o emoji suelto de cortesía, responde en 1 línea amable sin reiniciar venta. Si es comprobante, pasa a asesor.',
          },
        },
      ],
    },
    {
      id: 'wf_after_hours',
      name: 'Atención Fuera de Horario (Nocturno)',
      description: 'Atiende dudas/precios fuera del horario laboral y deja el cierre pendiente en Inbox.',
      trigger: 'after_hours',
      enabled: true,
      priority: 70,
      steps: nightSteps,
    },
    {
      id: 'wf_general',
      name: 'Atención General (Horario Laboral)',
      description: 'Flujo principal para mensajes directos sin disparador especial.',
      trigger: 'general_message',
      enabled: true,
      priority: 10,
      steps: daySteps,
    },
  ];
}

export interface WorkflowRouterEventContext {
  isWithinBusinessHours: boolean;
  hasAdContext: boolean;
  isCampaignReply: boolean;
  isMultimediaOrSticker: boolean;
}

export function selectWorkflowForEvent(
  rawPolicy: Partial<WorkflowPolicy> | null | undefined,
  ctx: WorkflowRouterEventContext,
  supportsOrders = true,
  supportsAppointments = true
): AutomationWorkflow {
  const policy = normalizeWorkflowPolicy(rawPolicy);
  const workflows =
    Array.isArray(policy.workflows) && policy.workflows.length > 0
      ? policy.workflows
      : buildDefaultAutomationWorkflows(policy, supportsOrders, supportsAppointments);

  const enabled = workflows
    .filter((w) => w && w.enabled)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const matchesTrigger = (trigger: WorkflowTriggerType): boolean => {
    if (trigger === 'ad_or_story') return ctx.hasAdContext;
    if (trigger === 'campaign_reply') return ctx.isCampaignReply;
    if (trigger === 'multimedia_or_sticker') return ctx.isMultimediaOrSticker;
    if (trigger === 'after_hours') return !ctx.isWithinBusinessHours;
    return true; // general_message
  };

  const matched = enabled.find((w) => matchesTrigger(w.trigger));
  if (matched) return matched;

  return (
    workflows.find((w) => w.trigger === 'general_message') ||
    buildDefaultAutomationWorkflows(policy, supportsOrders, supportsAppointments)[4]
  );
}
