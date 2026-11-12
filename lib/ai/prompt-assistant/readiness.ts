import { splitGalleryTail } from './versions';

/**
 * ============================================================================
 * Readiness + Contrato de Comportamiento del Prompt (0 tokens, determinístico)
 * ============================================================================
 * Garantiza la conexión asistente ↔ autonomía:
 *
 * 1. `evaluatePromptReadiness` decide cómo debe comportarse el bot en runtime:
 *    - 'empty': prompt sin configurar → el bot NO improvisa (compuerta en el
 *      worker; el asesor atiende manualmente hasta que el negocio complete el
 *      asistente). Se recupera automáticamente al configurar el prompt.
 *    - 'weak': prompt presente pero sin secciones críticas → se inyecta un
 *      bloque defensivo (`defensiveBlock`) que prohíbe inventar precios,
 *      promesas y fechas, y obliga a ofrecer relevo ante la duda.
 *    - 'ready': prompt con cobertura completa de lo crítico.
 *
 * 2. `buildBehaviorContract` traduce el prompt a lenguaje de negocio: la lista
 *    de conductas ejecutables que el bot SÍ hará (con evidencia del texto) y
 *    las que FALTAN, cada una con una propuesta ejecutable lista para aplicar
 *    con 1 clic (compatible con applySectionProposalAction).
 */

export type PromptReadinessLevel = 'empty' | 'weak' | 'ready';

/** Regex de señal por sección — fuente única compartida con health.ts */
export const SECTION_SIGNALS: Record<string, RegExp> = {
  'catalogo.items': /(\$|precio|valor|plan|servicio|producto|##\s*cat[aá]logo)/i,
  'pagos.medios': /(pago|transferencia|tarjeta|efectivo|contraentrega|enlace|abono|##\s*pagos)/i,
  'tono.estilo': /(tono|tute|usted|emoji|cercan|amable|##\s*tono)/i,
  'cierre.datos': /(nombre|tel[eé]fono|direcci[oó]n|ciudad|correo|datos|confirmar|##\s*datos de cierre)/i,
  'relevo.reglas': /(asesor|humano|relevo|reclamo|comprobante|horario|##\s*relevo)/i,
  'envios.cobertura': /(env[ií]o|domicilio|entrega|transportadora|cobertura|presencial|sede|##\s*env[ií]os)/i,
  'politicas.garantia': /(garant[ií]a|cambio|devoluci[oó]n|cancelaci[oó]n|reprogram|pol[ií]tica|##\s*pol[ií]ticas)/i,
  'faq.lista': /(pregunta|frecuente|faq|##\s*preguntas frecuentes)/i,
  'seguimiento.estrategia': /(seguimiento|recontacto|recordatorio|promoci[oó]n|descuento|##\s*seguimiento)/i,
  'adicional.flujo': /(reglas adicionales|regla de flujo|no repetir|ruta de cierre|prohib|nunca|restricci|##\s*reglas adicionales)/i,
  // Alias legacy del blueprint que comparte señal con adicional.flujo
  'adicional.notas': /(reglas adicionales|regla de flujo|no repetir|ruta de cierre|prohib|nunca|restricci|##\s*reglas adicionales)/i,
};

export interface PromptReadinessReport {
  level: PromptReadinessLevel;
  missingCritical: string[];
  defensiveBlock: string | null;
}

/** Secciones críticas: sin ellas el bot improvisa donde más duele (dinero y expectativas). */
const CRITICAL_SECTIONS = ['catalogo.items', 'pagos.medios', 'relevo.reglas'];

const CRITICAL_LABELS: Record<string, string> = {
  'catalogo.items': 'catálogo con precios',
  'pagos.medios': 'medios de pago',
  'relevo.reglas': 'reglas de relevo a asesor',
};

export function evaluatePromptReadiness(prompt: string | null | undefined): PromptReadinessReport {
  const { body } = splitGalleryTail(prompt || '');
  const lower = body.toLowerCase();
  // El catálogo visual vive en la cola de galería (que SIEMPRE viaja al contexto de
  // runtime con precios oficiales), así que la señal de catálogo se evalúa sobre el
  // texto completo para no marcar falsos débiles.
  const lowerFull = String(prompt || '').toLowerCase();

  const missingCritical = CRITICAL_SECTIONS.filter((slotId) => {
    const rx = SECTION_SIGNALS[slotId];
    if (!rx) return false;
    const haystack = slotId === 'catalogo.items' ? lowerFull : lower;
    return !rx.test(haystack);
  });

  if (body.trim().length < 25) {
    return { level: 'empty', missingCritical, defensiveBlock: null };
  }

  if (missingCritical.length > 0) {
    const missingList = missingCritical.map((s) => CRITICAL_LABELS[s] || s).join(', ');
    return {
      level: 'weak',
      missingCritical,
      defensiveBlock: [
        '<modo_seguro_onboarding prioridad="MAXIMA">',
        `Tu configuración aún no cubre: ${missingList}. Mientras tanto, estas reglas son OBLIGATORIAS:`,
        '- NUNCA inventes precios, promociones, disponibilidad, tiempos de entrega ni condiciones. Si no tienes el dato exacto escrito en tu información, dilo con honestidad y ofrece pasar al cliente con un asesor.',
        '- No prometas descuentos, cambios ni garantías que no estén autorizados por escrito aquí.',
        '- No des fechas ni horarios exactos si no los tienes confirmados; ofrece verificarlo con el equipo.',
        '- Si el cliente pregunta algo que no cubre tu información, responde que lo vas a verificar y ofrece el relevo a un asesor.',
        '- Antes de considerar cerrada una venta, asegúrate de tener el nombre y la necesidad clara del cliente.',
        '</modo_seguro_onboarding>',
      ].join('\n'),
    };
  }

  return { level: 'ready', missingCritical: [], defensiveBlock: null };
}

// ----------------------------------------------------------------------------

export interface BehaviorContractItem {
  id: string;
  title: string;
  detected: boolean;
  evidence?: string;
}

export interface BehaviorContract {
  items: BehaviorContractItem[];
  missingCount: number;
}

/** Propuesta ejecutable por sección faltante (placeholders que el negocio rellena). */
const BEHAVIOR_SUGGESTIONS: Record<string, { title: string; text: string }> = {
  'catalogo.items': {
    title: 'Catálogo con precios exactos',
    text: 'Cuando pregunten por precios, muestra el catálogo con fotos y valores exactos: [PRODUCTO 1]: $[VALOR 1], [PRODUCTO 2]: $[VALOR 2]. Nunca inventes ni estimes precios que no estén escritos aquí.',
  },
  'pagos.medios': {
    title: 'Medios de pago aceptados',
    text: 'Medios de pago aceptados: transferencia a [banco/cuenta], efectivo, pago contraentrega y enlace de pago. Confirma el comprobante del abono antes de despachar o separar cualquier pedido.',
  },
  'tono.estilo': {
    title: 'Tono de comunicación',
    text: 'Comunícate con tono cercano y profesional, tuteando al cliente, en mensajes cortos de 2 a 4 líneas, con máximo 1 emoji por mensaje y sin tecnicismos innecesarios.',
  },
  'cierre.datos': {
    title: 'Datos para cerrar la venta',
    text: 'Antes de confirmar una venta obtén: nombre completo, ciudad, dirección de entrega y teléfono de contacto. Confirma el pedido repitiendo los datos al cliente antes de despachar.',
  },
  'relevo.reglas': {
    title: 'Cuándo pasar a un asesor',
    text: 'Pasa el chat a un asesor humano cuando: el cliente lo pida, haya reclamos o quejas, pidan descuentos especiales, envíen comprobantes de pago, o no tengas la información exacta para responder.',
  },
  'envios.cobertura': {
    title: 'Envíos y cobertura',
    text: 'Enviamos a [ciudades/cobertura] mediante [transportadora], con un costo de $[valor] (gratis en pedidos superiores a $[valor]). Tiempo de entrega estimado: [días] hábiles.',
  },
  'politicas.garantia': {
    title: 'Cambios, garantía y cancelaciones',
    text: 'Cambios y garantía: [condiciones y plazo]. Cancelaciones y reprogramaciones: [condiciones]. No prometas condiciones fuera de estas reglas.',
  },
  'faq.lista': {
    title: 'Preguntas frecuentes',
    text: 'Preguntas frecuentes: - ¿Hacen envíos a todo el país? Sí, cubrimos [cobertura]. - ¿Cuánto demora? Entre [días] hábiles. - ¿Tienen garantía? Sí, [condiciones].',
  },
  'seguimiento.estrategia': {
    title: 'Recontacto de clientes que no responden',
    text: 'Si un cliente interesado no responde, haz un toque de seguimiento amable después de [3 horas] y otro al día siguiente con un motivo útil (novedad, disponibilidad o duda resuelta). Máximo 2 intentos; sin respuesta, archívalo sin insistir.',
  },
  'adicional.flujo': {
    title: 'Reglas adicionales del negocio',
    text: 'Reglas adicionales: no hables de temas ajenos al negocio, no menciones la competencia, no reveles procesos internos ni prometas resultados sin autorización del dueño.',
  },
};

interface BehaviorDefinition {
  id: string;
  title: string;
  slots: string[];
  /** Señal adicional fuera de SECTION_SIGNALS (opcional) */
  extraSignal?: RegExp;
  suggestionKey: string;
}

const BEHAVIOR_DEFINITIONS: BehaviorDefinition[] = [
  { id: 'resumen', title: 'Qué vende el negocio (descripción)', slots: [], extraSignal: undefined, suggestionKey: '' },
  { id: 'catalogo', title: 'Catálogo con precios exactos', slots: ['catalogo.items'], suggestionKey: 'catalogo.items' },
  { id: 'pagos', title: 'Medios de pago aceptados', slots: ['pagos.medios'], suggestionKey: 'pagos.medios' },
  { id: 'horarios', title: 'Horario de atención visible', slots: ['relevo.reglas'], extraSignal: /(horario|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|a\.m\.|p\.m\.|\d{1,2}:\d{2})/i, suggestionKey: 'relevo.reglas' },
  { id: 'envios', title: 'Envíos y cobertura', slots: ['envios.cobertura'], suggestionKey: 'envios.cobertura' },
  { id: 'politicas', title: 'Cambios, garantía y cancelaciones', slots: ['politicas.garantia'], suggestionKey: 'politicas.garantia' },
  { id: 'relevo', title: 'Cuándo pasa a un asesor humano', slots: ['relevo.reglas'], suggestionKey: 'relevo.reglas' },
  { id: 'cierre', title: 'Datos que pide para cerrar la venta', slots: ['cierre.datos'], suggestionKey: 'cierre.datos' },
  { id: 'seguimiento', title: 'Cómo recontacta a quien no responde', slots: ['seguimiento.estrategia'], suggestionKey: 'seguimiento.estrategia' },
  { id: 'tono', title: 'Tono y estilo de conversación', slots: ['tono.estilo'], suggestionKey: 'tono.estilo' },
  { id: 'reglas', title: 'Reglas adicionales y prohibiciones', slots: ['adicional.flujo'], suggestionKey: 'adicional.flujo' },
  { id: 'faq', title: 'Respuestas a preguntas frecuentes', slots: ['faq.lista'], suggestionKey: 'faq.lista' },
];

const BEHAVIOR_SUGGESTION_BY_BEHAVIOR: Record<string, { title: string; text: string }> = {
  resumen: {
    title: 'Descripción del negocio',
    text: 'Somos [nombre del negocio]: vendemos [qué vendes o haces], para [cliente ideal], y nos diferenciamos por [diferencial principal].',
  },
  horarios: {
    title: 'Horario de atención',
    text: 'Atendemos de [hora inicio] a [hora fin], de [días]. Fuera de horario, recibe al cliente con amabilidad y registra su solicitud para responder al iniciar el horario de atención.',
  },
};

/** Mapeo comportamiento → sectionId del blueprint (ids válidos de PROMPT_SECTIONS) */
const BEHAVIOR_SECTION_ID: Record<string, string> = {
  resumen: 'empresa',
  catalogo: 'catalogo',
  pagos: 'pagos',
  horarios: 'relevo',
  envios: 'envios',
  politicas: 'politicas',
  relevo: 'relevo',
  cierre: 'cierre',
  seguimiento: 'seguimiento',
  tono: 'tono',
  reglas: 'adicional',
  faq: 'faq',
};

export function buildBehaviorContract(
  prompt: string | null | undefined,
  gallery?: Array<{ name?: string; price?: string }>
): BehaviorContract {
  const galleryCount = Array.isArray(gallery) ? gallery.length : 0;
  const { body } = splitGalleryTail(prompt || '');
  const lower = body.toLowerCase();
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);

  const findEvidence = (rx: RegExp): string | undefined => {
    for (const line of lines) {
      if (rx.test(line) && line.length >= 8) return line.slice(0, 110);
    }
    return undefined;
  };

  const items: BehaviorContractItem[] = BEHAVIOR_DEFINITIONS.map((def) => {
    let detected = false;
    let evidence: string | undefined;

    if (def.id === 'resumen') {
      detected = body.trim().length >= 40;
      evidence = detected ? lines.find((l) => l.length >= 30)?.slice(0, 110) : undefined;
    } else if (def.id === 'catalogo') {
      const rx = SECTION_SIGNALS['catalogo.items'];
      const lineEvidence = rx ? findEvidence(rx) : undefined;
      if (lineEvidence) {
        detected = true;
        evidence = lineEvidence;
      } else if (galleryCount > 0) {
        const namedItem = (gallery || []).find((g) => String(g?.name || '').trim().length >= 3);
        detected = true;
        evidence = namedItem
          ? `Galería visual: ${namedItem.name}${namedItem.price ? ` (${namedItem.price})` : ''}`
          : `Galería visual activa con ${galleryCount} foto(s) de producto`;
      }
    } else {
      const slotRx = def.slots.map((s) => SECTION_SIGNALS[s]).filter(Boolean);
      detected = slotRx.some((rx) => rx.test(lower));
      if (detected) evidence = findEvidence(slotRx[0]);
      if (def.extraSignal && !detected) {
        detected = def.extraSignal.test(lower);
        if (detected) evidence = findEvidence(def.extraSignal);
      }
      // horarios: el slot de relevo no basta por sí solo para afirmar horario visible
      if (def.id === 'horarios') {
        detected = Boolean(def.extraSignal?.test(lower));
        evidence = detected ? findEvidence(def.extraSignal!) : undefined;
      }
    }

    return { id: def.id, title: def.title, detected, evidence };
  });

  const missingCount = items.filter((i) => !i.detected).length;
  return { items, missingCount };
}

/**
 * Propuestas ejecutables listas para aplicar con 1 clic por cada comportamiento
 * faltante (compatible con PendingSectionProposal / SectionProposalCard).
 */
export function buildMissingBehaviorProposals(
  prompt: string | null | undefined,
  gallery?: Array<{ name?: string; price?: string }>
): Array<{
  id: string;
  sectionId: string;
  sectionTitle: string;
  currentText: string;
  proposedText: string;
  reason: string;
  source: 'behavior_contract';
}> {
  const contract = buildBehaviorContract(prompt, gallery);
  const proposals: ReturnType<typeof buildMissingBehaviorProposals> = [];

  for (const item of contract.items) {
    if (item.detected) continue;

    let suggestion: { title: string; text: string } | undefined;
    if (item.id === 'resumen' || item.id === 'horarios') {
      suggestion = BEHAVIOR_SUGGESTION_BY_BEHAVIOR[item.id];
    } else {
      const def = BEHAVIOR_DEFINITIONS.find((d) => d.id === item.id);
      suggestion = def?.suggestionKey ? BEHAVIOR_SUGGESTIONS[def.suggestionKey] : undefined;
    }
    if (!suggestion) continue;

    proposals.push({
      id: `contract-${item.id}`,
      sectionId: BEHAVIOR_SECTION_ID[item.id] || item.id,
      sectionTitle: suggestion.title,
      currentText: 'No especificado',
      proposedText: suggestion.text,
      reason: `Tu bot todavía no hace esto de forma confiable: ${item.title.toLowerCase()}.`,
      source: 'behavior_contract',
    });
  }

  return proposals;
}
