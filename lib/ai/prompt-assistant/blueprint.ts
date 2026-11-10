import type { IndustryPreset } from '@/lib/ai/prompt-compiler';

export type AssistantSlotType = 'text' | 'list' | 'yes_no' | 'catalog' | 'schedule';

export interface BlueprintSectionMeta {
  id: string;
  title: string;
  order: number;
  description: string;
}

export interface BlueprintSlot {
  id: string;
  sectionId: string;
  sectionTitle: string;
  label: string;
  question: string;
  help?: string;
  required: boolean;
  type: AssistantSlotType;
  chips?: (preset?: IndustryPreset) => string[];
  condition?: (slots: Record<string, any>, preset?: IndustryPreset) => boolean;
}

export const PROMPT_SECTIONS: BlueprintSectionMeta[] = [
  { id: 'empresa', title: 'Empresa', order: 1, description: 'Nombre, actividad comercial, ciudad y cobertura' },
  { id: 'catalogo', title: 'Catálogo', order: 2, description: 'Productos o servicios, precios y características clave' },
  { id: 'pagos', title: 'Pagos', order: 3, description: 'Medios de pago, reservas, anticipos o abonos' },
  { id: 'envios', title: 'Envíos y cobertura', order: 4, description: 'Entregas, domicilio, tiempos o atención presencial' },
  { id: 'politicas', title: 'Políticas y garantías', order: 5, description: 'Garantías, cambios, cancelaciones o reprogramaciones' },
  { id: 'faq', title: 'Preguntas frecuentes', order: 6, description: 'Dudas repetidas que hacen tus clientes' },
  { id: 'tono', title: 'Tono y estilo', order: 7, description: 'Forma de hablar, emojis y nombre del asesor' },
  { id: 'cierre', title: 'Datos de cierre', order: 8, description: 'Qué datos pedir antes de confirmar el pedido o cita' },
  { id: 'relevo', title: 'Relevo humano y horario', order: 9, description: 'Cuándo pasar a un asesor y horario de atención' },
  { id: 'seguimiento', title: 'Seguimiento', order: 10, description: 'Qué destacar cuando la IA recontacta automáticamente' },
  { id: 'adicional', title: 'Reglas adicionales', order: 11, description: 'Cualquier pauta especial de tu negocio' },
];

export const PROMPT_BLUEPRINT_SLOTS: BlueprintSlot[] = [
  {
    id: 'empresa.resumen',
    sectionId: 'empresa',
    sectionTitle: 'Empresa',
    label: 'Identidad del negocio',
    question: '¿Cómo se llama tu empresa, a qué se dedica y en qué ciudad o cobertura atienden?',
    help: 'Ejemplo breve: nombre comercial, qué venden o realizan y si atienden local, presencial o nacional.',
    required: true,
    type: 'text',
    chips: (preset) => {
      if (preset === 'health') return ['Atención presencial en sede', 'Teleconsulta y presencial'];
      if (preset === 'services') return ['Atención presencial y a domicilio', 'Servicio virtual y presencial'];
      if (preset === 'real_estate') return ['Arriendos y ventas locales', 'Proyectos nuevos y usados'];
      if (preset === 'gastronomy') return ['Restaurante y domicilios locales', 'Solo domicilios y para llevar'];
      return ['Tienda física y envíos nacionales', '100% virtual con envíos', 'Atención local en ciudad'];
    },
  },
  {
    id: 'catalogo.items',
    sectionId: 'catalogo',
    sectionTitle: 'Catálogo',
    label: 'Productos o servicios con precio',
    question: 'Cuéntame tus principales productos o servicios con su precio (y medidas, variantes o qué incluye). También puedes subir un Excel o PDF.',
    help: 'Entre más exactos sean nombres, precios y qué incluye cada opción, más precisa será la IA al cotizar.',
    required: true,
    type: 'catalog',
  },
  {
    id: 'pagos.medios',
    sectionId: 'pagos',
    sectionTitle: 'Pagos',
    label: 'Medios y condiciones de pago',
    question: '¿Qué medios de pago aceptan y si manejan pago contra entrega, enlace de pago o abonos/reservas?',
    help: 'Recuerda registrar tus cuentas exactas en la pestaña Pagos de Configuración.',
    required: true,
    type: 'list',
    chips: (preset) => {
      if (preset === 'health' || preset === 'services') {
        return ['Transferencia y efectivo', 'Tarjeta / enlace de pago y transferencia', 'Anticipo para reservar cita', 'Pago al finalizar el servicio'];
      }
      if (preset === 'gastronomy') {
        return ['Efectivo y transferencia contra entrega', 'Enlace de pago, tarjeta y transferencia', 'Pago en punto físico'];
      }
      return ['Transferencia y pago contra entrega', 'Transferencia, tarjeta y enlace de pago', 'Abono inicial para apartar o reservar', 'Solo pago anticipado por transferencia'];
    },
  },
  {
    id: 'envios.cobertura',
    sectionId: 'envios',
    sectionTitle: 'Envíos y cobertura',
    label: 'Entregas, envíos o modalidad',
    question: '¿Cómo entregan o atienden? Indica costos de envío/domicilio, tiempos estimados o dirección de sede si es presencial.',
    required: false,
    type: 'text',
    condition: (_slots, preset) => preset !== 'health',
    chips: (preset) => {
      if (preset === 'services' || preset === 'real_estate') {
        return ['Visita técnica sin costo en zona urbana', 'Atención únicamente en nuestra oficina/sede', 'Cobertura a domicilio en toda la ciudad'];
      }
      if (preset === 'gastronomy') {
        return ['Domicilio en 30-45 min según zona', 'Recoger en tienda sin costo adicional'];
      }
      return ['Envío nacional en 2-4 días hábiles', 'Envío gratis por monto mínimo', 'Entrega el mismo día en ciudad principal', 'Envío por transportadora con cobro al destino'];
    },
  },
  {
    id: 'politicas.garantia',
    sectionId: 'politicas',
    sectionTitle: 'Políticas y garantías',
    label: 'Garantías, cambios o cancelaciones',
    question: '¿Qué garantía, política de cambios/devoluciones o reglas de cancelación aplican en tu empresa?',
    required: false,
    type: 'text',
    chips: (preset) => {
      if (preset === 'health' || preset === 'services') {
        return ['Reagendamiento con 24h de anticipación', 'Garantía de satisfacción y soporte post-servicio'];
      }
      return ['Garantía por defectos de fabricación', 'Cambios dentro de los primeros 5 a 8 días', 'No aplica devolución en productos personalizados'];
    },
  },
  {
    id: 'faq.lista',
    sectionId: 'faq',
    sectionTitle: 'Preguntas frecuentes',
    label: 'Preguntas frecuentes',
    question: '¿Qué 2 o 3 preguntas te hacen casi todos los clientes antes de comprar o agendar?',
    required: false,
    type: 'list',
    chips: () => ['Si está disponible para entrega inmediata', 'Horarios de atención y ubicación', 'Qué incluye exactamente el precio', 'Omitir por ahora'],
  },
  {
    id: 'tono.estilo',
    sectionId: 'tono',
    sectionTitle: 'Tono y estilo',
    label: 'Personalidad y trato al cliente',
    question: '¿Cómo prefieres que hable tu IA con los clientes (tuteo/usted, emojis o un nombre de asesor)?',
    required: true,
    type: 'text',
    chips: () => [
      'Cercano tuteando, con pocos emojis',
      'Profesional pero cálido (de usted)',
      'Amigable y directo al grano sin emojis excesivos',
    ],
  },
  {
    id: 'cierre.datos',
    sectionId: 'cierre',
    sectionTitle: 'Datos de cierre',
    label: 'Datos para confirmar compra o cita',
    question: '¿Qué datos mínimos debe pedir la IA cuando el cliente dice que sí quiere comprar o agendar?',
    required: true,
    type: 'list',
    chips: (preset) => {
      if (preset === 'health' || preset === 'services') {
        return ['Nombre completo, teléfono y correo', 'Nombre, motivo de consulta y fecha/hora preferida'];
      }
      return ['Nombre, teléfono, ciudad, dirección y método de pago', 'Nombre, teléfono y comprobante de pago'];
    },
  },
  {
    id: 'relevo.reglas',
    sectionId: 'relevo',
    sectionTitle: 'Relevo humano y horario',
    label: 'Cuándo pasar a un asesor',
    question: '¿En qué casos específicos debe la IA pausarse y pasar el chat a un asesor humano?',
    required: true,
    type: 'list',
    chips: () => [
      'Cuando pidan hablar con una persona, reclamos o descuentos especiales',
      'Cuando envíen comprobantes de pago o pedidos mayoristas',
      'Solo en reclamos, garantías o casos especiales complejos',
    ],
  },
  {
    id: 'seguimiento.estrategia',
    sectionId: 'seguimiento',
    sectionTitle: 'Seguimiento',
    label: 'Instrucciones de recontacto autónomo',
    question: 'Cuando un cliente quede en silencio o pida hablar después, ¿qué argumentos o beneficios debe recordar la IA al volver a escribirle?',
    help: 'Este bloque gobierna tanto el tono de los recontactos autónomos como si conviene enviar foto del producto.',
    required: false,
    type: 'text',
    chips: () => [
      'Recordar facilidades de pago/abono y adjuntar foto del producto consultado',
      'Preguntar cordialmente si quedó alguna duda sobre disponibilidad o envío',
      'Invitar a confirmar fecha u horario disponible sin ser invasivo',
    ],
  },
  {
    id: 'adicional.notas',
    sectionId: 'adicional',
    sectionTitle: 'Reglas adicionales',
    label: 'Restricciones o pautas extra',
    question: '¿Hay algo que la IA NUNCA deba hacer o alguna instrucción especial adicional de tu empresa?',
    required: false,
    type: 'text',
    chips: () => ['No dar precios sin confirmar disponibilidad', 'No prometer descuentos sin aprobación', 'Ninguna instrucción adicional'],
  },
];

const SKIP_VALUES = new Set(['omitir por ahora', 'ninguna instrucción adicional', 'saltar', 'omitir']);

/**
 * Intenta resolver chips, respuestas sí/no o listas simples en TypeScript puro (0 tokens de IA).
 */
export function tryParseSlotLocally(
  slot: BlueprintSlot,
  rawAnswer: string,
  preset?: IndustryPreset
): { handled: boolean; value?: any; skipped?: boolean } {
  const clean = (rawAnswer || '').trim();
  if (!clean) return { handled: false };

  const lower = clean.toLowerCase();
  if (SKIP_VALUES.has(lower)) {
    return { handled: true, skipped: true };
  }

  const chips = (slot.chips?.(preset) || []).map((c) => c.toLowerCase());
  const exactChip = chips.includes(lower);

  if (slot.type === 'yes_no') {
    if (/^(s[ií]|claro|por supuesto|correcto)$/i.test(lower)) {
      return { handled: true, value: 'Sí' };
    }
    if (/^(no|ninguno|no aplica)$/i.test(lower)) {
      return { handled: true, value: 'No aplica' };
    }
  }

  if (exactChip) {
    if (slot.type === 'list') {
      return { handled: true, value: [clean] };
    }
    return { handled: true, value: clean };
  }

  // Para texto breve directo en tono, adicional, políticas o reglas simples, aceptar sin quemar LLM
  if (
    slot.type === 'text' &&
    (slot.sectionId === 'tono' || slot.sectionId === 'adicional' || slot.sectionId === 'seguimiento') &&
    clean.length >= 4 &&
    clean.length <= 260
  ) {
    return { handled: true, value: clean };
  }

  // Listas explícitas separadas por coma o salto de línea cuando son claras y cortas
  if (slot.type === 'list' && (clean.includes(',') || clean.includes('\n')) && clean.length <= 240) {
    const items = clean
      .split(/[\n,;]+/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 2);
    if (items.length >= 2 && items.length <= 8) {
      return { handled: true, value: items };
    }
  }

  return { handled: false };
}
