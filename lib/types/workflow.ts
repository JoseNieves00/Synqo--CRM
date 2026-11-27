export type WorkflowRole = 'autonomous_close' | 'qualify_and_handoff' | 'assist_only';
export type PriceDisclosurePolicy = 'always' | 'after_hours_only' | 'never';
export type ResponsePertinenceStyle = 'strict' | 'consultive';
export type RequiredLeadField = 'product_or_service' | 'city' | 'modality' | 'date_preference';

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
  };
}

export function resolveEffectiveWorkflowState(
  rawPolicy: Partial<WorkflowPolicy> | null | undefined,
  isWithinBusinessHours: boolean
): EffectiveWorkflowState {
  const policy = normalizeWorkflowPolicy(rawPolicy);
  const role = isWithinBusinessHours ? policy.businessHoursRole : policy.afterHoursRole;

  const canDisclosePrices =
    policy.pricePolicy === 'always' ||
    (policy.pricePolicy === 'after_hours_only' && !isWithinBusinessHours);

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
  };
}
