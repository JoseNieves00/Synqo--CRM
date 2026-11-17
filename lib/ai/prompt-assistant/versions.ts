import type { IndustryPreset } from '@/lib/ai/prompt-compiler';
import { PROMPT_SECTIONS } from './blueprint';

export interface PromptVersionEntry {
  id: string;
  prompt: string;
  createdAt: string;
  reason: string;
}

const GALLERY_MARKER_REGEX = /(\n*===\s*CAT[ÁA]LOGO VISUAL DE PRODUCTOS[\s\S]*$)/i;

/**
 * Separa el texto editable del bloque interno de galería visual para nunca destruirlo al editar/parchear.
 */
export function splitGalleryTail(prompt: string): { body: string; galleryTail: string } {
  const raw = String(prompt || '');
  const match = raw.match(GALLERY_MARKER_REGEX);
  if (!match) {
    return { body: raw.trimEnd(), galleryTail: '' };
  }
  const idx = raw.indexOf(match[0]);
  return {
    body: raw.slice(0, idx).trimEnd(),
    galleryTail: raw.slice(idx).replace(/^\n+/, ''),
  };
}

/**
 * Estima tokens aproximados de un prompt para monitorear brevedad y eficiencia por mensaje.
 */
export function estimatePromptTokens(text: string): number {
  const clean = String(text || '').trim();
  if (!clean) return 0;
  return Math.ceil(clean.length / 4);
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type PromptHeadingStyle = 'hash2' | 'hash1' | 'colon_upper' | 'xml';
export type PromptBulletStyle = '-' | '*';

export interface PromptFormatProfile {
  headingStyle: PromptHeadingStyle;
  bulletStyle: PromptBulletStyle;
  styleDescription: string;
}

const SECTION_HEADING_SYNONYMS: Record<string, string[]> = {
  empresa: [
    'empresa', 'negocio', 'identidad', 'sobre nosotros', 'quienes somos', 'quiénes somos',
    'nuestra empresa', 'presentacion', 'presentación', 'informacion general', 'información general',
  ],
  catalogo: [
    'catalogo', 'catálogo', 'productos', 'servicios', 'portafolio', 'planes', 'precios',
    'catalogo oferta', 'productos servicios y precios', 'productos y precios', 'productos y servicios',
    // encabezados informales reales de clientes (prosa de negocio)
    'nuestros productos', 'lo que ofrecemos', 'que vendemos', 'qué vendemos', 'lista de precios',
    'tarifas', 'oferta', 'nuestro catalogo', 'nuestro catálogo', 'servicios y tarifas',
  ],
  pagos: [
    'pagos', 'medios de pago', 'metodos de pago', 'métodos de pago', 'plan separe', 'cuentas', 'abonos',
    // secciones compuestas que incluyen pagos
    'politicas envios y pagos', 'politicas  envios y pagos', 'envios y pagos', 'politicas y pagos',
    // encabezados informales reales de clientes
    'como pagar', 'cómo pagar', 'formas de pago', 'forma de pago', 'informacion de pago',
    'información de pago', 'datos de pago', 'pago', 'pagos y abonos', 'transferencias',
  ],
  envios: [
    'envios y cobertura', 'envíos y cobertura', 'envios', 'envíos', 'entregas', 'domicilios', 'cobertura',
    // secciones compuestas que incluyen envíos
    'politicas envios y pagos', 'politicas  envios y pagos', 'envios y pagos', 'politicas y envios',
    // encabezados informales reales de clientes
    'envios y entregas', 'envíos y entregas', 'tiempos de entrega', 'zona de cobertura',
    'zonas de cobertura', 'domicilios y envios', 'domicilios y envíos', 'despacho', 'despachos',
    'envio a domicilio', 'envío a domicilio', 'entrega', 'cobertura de envios', 'cobertura de envíos',
  ],
  politicas: [
    'politicas y garantias', 'políticas y garantías', 'politicas', 'políticas', 'garantia', 'garantía',
    'cambios', 'devoluciones',
    // secciones compuestas que incluyen políticas
    'politicas envios y pagos', 'politicas  envios y pagos', 'politicas y pagos', 'politicas y envios',
    // encabezados informales reales de clientes
    'nuestra política', 'nuestra politica', 'politicas de la empresa', 'politicas de la empresa',
    'garantias y cambios', 'garantías y cambios', 'cambios y devoluciones', 'politicas internas',
  ],
  faq: ['preguntas frecuentes', 'faq', 'dudas frecuentes', 'preguntas y respuestas'],
  tono: ['tono y estilo', 'tono', 'estilo', 'personalidad', 'comunicacion', 'comunicación'],
  cierre: [
    'datos de cierre', 'cierre', 'cierre agil', 'cierre ágil', 'confirmacion', 'confirmación', 'pedido',
    'ruta de cierre', 'ruta de cierre agil', 'ruta de cierre ágil', 'datos de contacto y cierre',
  ],
  relevo: [
    'relevo humano y horario', 'relevo', 'horario', 'atencion humana', 'atención humana', 'soporte',
    // encabezados informales reales de clientes
    'horario de atencion', 'horario de atención', 'horarios', 'horarios de atencion', 'horarios de atención',
    'asesor humano', 'asesores', 'cuando no estamos',
  ],
  seguimiento: [
    'seguimiento', 'recontacto',
    // encabezados informales reales de clientes
    'seguimientos', 'recordatorios', 'seguimiento y recordatorios', 'recordatorios automaticos',
    'recordatorios automáticos', 'seguimiento de clientes',
  ],
  adicional: [
    'reglas adicionales', 'reglas operativas', 'instrucciones', 'reglas',
    // 'ruta de cierre agil' como instrucciones/flujo del bot (sinónimo de adicional en muchos clientes)
    'ruta de cierre', 'ruta de cierre agil', 'ruta de cierre ágil',
    'instrucciones generales', 'instrucciones clave',
    // encabezados informales reales de clientes
    'notas adicionales', 'notas', 'extra', 'consideraciones', 'importante',
  ],
};

/**
 * Señales de tema en PROSA (sin encabezado): regex que detectan que el negocio ya habla
 * del tema aunque nunca haya puesto un título de sección. Se usan para (a) insertar mejoras
 * junto a su contenido relacionado en vez de al final, y (b) detectar solapamientos.
 */
const TOPIC_SIGNALS: Record<string, RegExp[]> = {
  empresa: [/\b(somos|empresa|negocio|años de experiencia|trabajamos)\b/i],
  catalogo: [
    /\$\s?\d/, /\bd\s?e\s?\d/, /\bprecio[s]?\b/i, /\bcuesta\b/i, /\bvalor\b/i, /\btarifa[s]?\b/i,
    /\b(desde|vale|cotiza)\b/i, /\b(producto|servicio)s?\s+(de|que)\b/i,
  ],
  pagos: [
    /\bpago[s]?\b/i, /\b(transferencia|nequi|daviplata|bancolombia|efectivo|tarjeta|contraentrega)\b/i,
    /\b(abono|anticipo|separe|dep[oó]sito|cuenta (bancaria|de ahorros))\b/i,
  ],
  envios: [
    /\b(env[ií]o|env[ií]os|domicilio|entrega|despach)\w*\b/i, /\bcobertura\b/i, /\bciudad(es)?\b/i,
    /\b(24|48|72)\s?(horas|h)\b/i, /\b(enviamos|llega|gu[ií]a)\b/i,
  ],
  politicas: [
    /\bgarant[ií]a\b/i, /\b(cambio|cambios|devoluci[oó]n|devoluciones)\b/i, /\bpolid\w*\b/i,
    /\b(no se acepta|no hay devoluci)\b/i,
  ],
  faq: [/\bpreguntas? frecuentes\b/i, /\bP:\s*["“]/],
  tono: [/\b(tono|estilo|personalidad|trato)\b/i],
  cierre: [
    /\b(cierre|cerrar la venta|confirmaci[oó]n)\b/i, /\bdatos (de despacho|del pedido|de contacto)\b/i,
    /\bagenda(r|mos)?\b/i,
  ],
  relevo: [
    /\bhorario\b/i, /\b(fuera de horario|no estamos|despu[eé]s de las)\b/i, /\basesor(es)? humano/i,
    /\brelevo\b/i,
  ],
  seguimiento: [/\bseguimiento(s)?\b/i, /\brecordatori\w*\b/i, /\b(recontactar|volver a escribir)\b/i],
  adicional: [/\b(regla|instrucci[oó]n|nota)\b/i],
};

function normalizeHeadingKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detecta el formato predominante (encabezados y viñetas) que usa el cliente en su prompt (0 tokens).
 */
export function detectPromptFormat(prompt: string): PromptFormatProfile {
  const { body } = splitGalleryTail(prompt);
  const hash2Count = (body.match(/^##\s+\S/gm) || []).length;
  const hash1Count = (body.match(/^#\s+[^#\s]/gm) || []).length;
  const colonUpperCount = (body.match(/^[A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s/_-]{3,}:\s*$/gm) || []).length;
  const xmlCount = (body.match(/^<[a-z0-9_]+>/gim) || []).length;

  const starBullets = (body.match(/^\*\s+\S/gm) || []).length;
  const dashBullets = (body.match(/^-\s+\S/gm) || []).length;
  const bulletStyle: PromptBulletStyle = starBullets > dashBullets ? '*' : '-';

  let headingStyle: PromptHeadingStyle = 'hash2';
  if (hash1Count > hash2Count && hash1Count >= colonUpperCount) headingStyle = 'hash1';
  else if (colonUpperCount > hash2Count && colonUpperCount > hash1Count) headingStyle = 'colon_upper';
  else if (xmlCount >= 2 && hash2Count === 0 && hash1Count === 0) headingStyle = 'xml';

  const descParts: string[] = [];
  if (headingStyle === 'hash1') descParts.push('encabezados `# TÍTULO:`');
  else if (headingStyle === 'colon_upper') descParts.push('encabezados en MAYÚSCULAS con dos puntos');
  else if (headingStyle === 'xml') descParts.push('bloques XML `<seccion>`');
  else descParts.push('encabezados Markdown `## Sección`');

  descParts.push(bulletStyle === '*' ? 'viñetas con asterisco `*`' : 'viñetas con guion `-`');

  return {
    headingStyle,
    bulletStyle,
    styleDescription: descParts.join(' y '),
  };
}

export function adaptBulletStyle(bodyText: string, bulletStyle: PromptBulletStyle): string {
  const clean = bodyText.trim();
  if (!clean) return clean;
  if (bulletStyle === '*') {
    return clean.replace(/^-\s+/gm, '* ');
  }
  return clean.replace(/^\*\s+/gm, '- ');
}

function formatSectionWithProfile(
  sectionTitle: string,
  sectionBody: string,
  profile: PromptFormatProfile
): string {
  const adaptedBody = adaptBulletStyle(sectionBody, profile.bulletStyle);
  const cleanTitle = sectionTitle.trim();
  switch (profile.headingStyle) {
    case 'hash1':
      return `# ${cleanTitle.toUpperCase()}:\n${adaptedBody}`;
    case 'colon_upper':
      return `${cleanTitle.toUpperCase()}:\n${adaptedBody}`;
    case 'xml': {
      const tag = normalizeHeadingKey(cleanTitle).replace(/\s+/g, '_') || 'reglas';
      return `<${tag}>\n${adaptedBody}\n</${tag}>`;
    }
    case 'hash2':
    default:
      return `## ${cleanTitle}\n${adaptedBody}`;
  }
}

interface ParsedSectionBlock {
  startIdx: number;
  endIdx: number;
  rawHeading: string;
  normalizedTitle: string;
  body: string;
  isXml?: boolean;
  xmlTag?: string;
}

function findParsedSections(body: string): ParsedSectionBlock[] {
  const headingRegex = /^(?:(#{1,3})\s+([^\n]+)|([A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s/_-]{3,}):\s*)$/gm;
  const matches: Array<{ start: number; headerEnd: number; rawHeading: string; title: string }> = [];

  let m: RegExpExecArray | null;
  while ((m = headingRegex.exec(body)) !== null) {
    const rawHeading = m[0];
    const title = (m[2] || m[3] || '').replace(/[:\s]+$/, '').trim();
    if (!title) continue;
    matches.push({
      start: m.index,
      headerEnd: m.index + rawHeading.length,
      rawHeading,
      title,
    });
  }

  return matches.map((cur, idx) => {
    const nextStart = idx + 1 < matches.length ? matches[idx + 1].start : body.length;
    const sectionBody = body.slice(cur.headerEnd, nextStart).replace(/^\n+/, '').trimEnd();
    return {
      startIdx: cur.start,
      endIdx: nextStart,
      rawHeading: cur.rawHeading,
      normalizedTitle: normalizeHeadingKey(cur.title),
      body: sectionBody,
    };
  });
}

function findMatchingSectionBlock(
  body: string,
  sectionTitle: string,
  sectionId?: string
): ParsedSectionBlock | null {
  const blocks = findParsedSections(body);
  const targetNorm = normalizeHeadingKey(sectionTitle);
  const synonyms = new Set<string>([
    targetNorm,
    ...(sectionId && SECTION_HEADING_SYNONYMS[sectionId] ? SECTION_HEADING_SYNONYMS[sectionId] : []),
  ]);

  // 1. Coincidencia exacta por título normalizado
  const exact = blocks.find((b) => b.normalizedTitle === targetNorm);
  if (exact) return exact;

  // 2. Coincidencia por sinónimo exacto
  const synExact = blocks.find((b) => synonyms.has(b.normalizedTitle));
  if (synExact) return synExact;

  // 3. Sinónimo contenido DENTRO del título del cliente (p.ej. "envios" dentro de "politicas  envios y pagos")
  const synInClientTitle = blocks.find((b) =>
    Array.from(synonyms).some((s) => s.length >= 5 && b.normalizedTitle.includes(s))
  );
  if (synInClientTitle) return synInClientTitle;

  // 4. Match inverso: alguna palabra clave del título del cliente está en los sinónimos de la sección
  //    Esto captura p.ej. "politicas  envios y pagos" cuando buscamos sectionId="envios"
  const inverseMatch = blocks.find((b) => {
    const clientNorm = b.normalizedTitle;
    // Verificar si algún sinónimo de largo suficiente está contenido en el título compuesto del cliente
    return Array.from(synonyms).some(
      (s) => s.length >= 5 && clientNorm.includes(normalizeHeadingKey(s))
    );
  });
  if (inverseMatch) return inverseMatch;

  return null;
}

/**
 * Extrae el contenido actual de una sección existente en el prompt (reconociendo
 * encabezados `#`, `##`, `MAYÚSCULAS:` y sinónimos como "RUTA DE CIERRE AGIL" o "MEDIOS DE PAGO").
 */
export function extractExistingSectionContent(
  prompt: string,
  sectionTitle: string,
  sectionId?: string
): { found: boolean; rawHeading: string | null; body: string } {
  const { body } = splitGalleryTail(prompt);
  if (!body.trim()) return { found: false, rawHeading: null, body: '' };
  const matched = findMatchingSectionBlock(body, sectionTitle, sectionId);
  if (!matched) return { found: false, rawHeading: null, body: '' };
  return {
    found: true,
    rawHeading: matched.rawHeading,
    body: matched.body,
  };
}

export interface SectionOverlapInfo {
  /** El negocio YA tiene un encabezado reconocido para esta sección (in-place). */
  hasHeadingSection: boolean;
  /** Título exacto del encabezado encontrado (normalizado al original del cliente). */
  headingTitle: string | null;
  /** El negocio ya menciona el tema en prosa aunque sin encabezado. */
  topicMentioned: boolean;
  /** Fragmento corto (≤120 chars) donde se menciona el tema. */
  mentionExcerpt: string | null;
}

/**
 * Detecta si una propuesta de mejora sobrepondría contenido que el cliente ya tiene,
 * para avisarle "actualicé donde ya lo tenías, no agregué una sección duplicada al final".
 */
export function detectSectionOverlap(
  prompt: string,
  sectionId: string,
  sectionTitle?: string
): SectionOverlapInfo {
  const { body } = splitGalleryTail(prompt);
  if (!body.trim()) {
    return { hasHeadingSection: false, headingTitle: null, topicMentioned: false, mentionExcerpt: null };
  }

  const matched = findMatchingSectionBlock(body, (sectionTitle || sectionId).trim(), sectionId);
  if (matched) {
    // Recuperar el título original (sin `#` ni `:`) tal como lo escribió el cliente
    const originalTitle = matched.rawHeading
      .replace(/^#+\s*/, '')
      .replace(/:\s*$/, '')
      .replace(/^<|>$/g, '')
      .trim();
    return {
      hasHeadingSection: true,
      headingTitle: originalTitle || matched.normalizedTitle,
      topicMentioned: true,
      mentionExcerpt: null,
    };
  }

  // Sin encabezado: buscar señales del tema en prosa
  const signals = TOPIC_SIGNALS[sectionId] || [];
  for (const regex of signals) {
    const m = body.match(regex);
    if (m && typeof m.index === 'number') {
      const start = Math.max(0, m.index - 50);
      const end = Math.min(body.length, m.index + m[0].length + 70);
      const excerpt = body
        .slice(start, end)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
      return { hasHeadingSection: false, headingTitle: null, topicMentioned: true, mentionExcerpt: excerpt };
    }
  }

  return { hasHeadingSection: false, headingTitle: null, topicMentioned: false, mentionExcerpt: null };
}

/**
 * Encuentra el índice dentro del body donde conviene insertar una sección nueva:
 * justo después del párrafo que más señales del tema contiene (contexto del cliente),
 * o -1 si no hay ninguna señal y debe ir al final.
 */
function findContextualAnchor(body: string, sectionId?: string): number {
  const signals = (sectionId && TOPIC_SIGNALS[sectionId]) || [];
  if (signals.length === 0) return -1;

  const paragraphs: Array<{ text: string; endIdx: number; score: number }> = [];
  // Dividir por bloques separados por línea en blanco, preservando el índice del fin de cada bloque
  const blockRegex = /(?:^|\n\n)((?:[^\n]|\n(?!\n))+)/g;
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(body)) !== null) {
    const text = m[1];
    const endIdx = m.index + m[0].length;
    let score = 0;
    for (const regex of signals) {
      const found = text.match(new RegExp(regex.source, regex.flags.replace('g', '')));
      if (found) score += 1;
    }
    if (score > 0) paragraphs.push({ text, endIdx, score });
  }

  if (paragraphs.length === 0) return -1;
  const best = paragraphs.sort((a, b) => b.score - a.score || b.endIdx - a.endIdx)[0];
  return best.endIdx;
}

/**
 * Parche NO destructivo y adaptable al formato del cliente:
 * - Si encuentra la sección existente (exacta o por sinónimo en `#`, `##` o `TÍTULO:`),
 *   actualiza su cuerpo manteniendo el encabezado original del cliente y su estilo de viñetas.
 * - Si no existe pero el cliente ya habla del tema en prosa, inserta la sección JUNTO a ese
 *   contenido (contextual), nunca al final — evita contradicciones tipo "pagos por Nequi" en
 *   el medio y "Medios de pago: transferencia" duplicado al final.
 * - Solo si el tema es totalmente nuevo, la agrega al final adoptando el estilo dominante.
 */
export function patchSectionInPrompt(
  existingPrompt: string,
  sectionTitle: string,
  sectionBody: string,
  sectionId?: string
): string {
  const cleanTitle = sectionTitle.trim();
  const cleanBody = sectionBody.trim();
  const { body, galleryTail } = splitGalleryTail(existingPrompt);

  if (!cleanBody) {
    return existingPrompt;
  }

  const profile = detectPromptFormat(existingPrompt);
  const existingBlock = body.trim()
    ? findMatchingSectionBlock(body, cleanTitle, sectionId)
    : null;

  let nextBody: string;
  if (!body.trim()) {
    nextBody = `## ${cleanTitle}\n${cleanBody}`;
  } else if (existingBlock) {
    const adapted = adaptBulletStyle(cleanBody, profile.bulletStyle);
    const replacement = `${existingBlock.rawHeading}\n${adapted}\n\n`;
    const before = body.slice(0, existingBlock.startIdx);
    const after = body.slice(existingBlock.endIdx).replace(/^\n+/, '');
    nextBody = `${before}${replacement}${after}`.trimEnd();
  } else {
    const formattedSection = formatSectionWithProfile(cleanTitle, cleanBody, profile);
    const anchorIdx = findContextualAnchor(body, sectionId);
    if (anchorIdx >= 0 && anchorIdx < body.trimEnd().length) {
      // Insertar contextualmente: después del párrafo con más señales del tema
      const before = body.slice(0, anchorIdx).trimEnd();
      const after = body.slice(anchorIdx).trim();
      nextBody = after
        ? `${before}\n\n${formattedSection}\n\n${after}`
        : `${before}\n\n${formattedSection}`;
    } else {
      nextBody = `${body.trimEnd()}\n\n${formattedSection}`;
    }
  }

  return galleryTail ? `${nextBody.trimEnd()}\n\n${galleryTail}` : nextBody.trimEnd();
}

/**
 * Renderiza el body Markdown de una sección individual a partir de los slots completados.
 */
export function renderSectionBodyFromSlots(sectionId: string, slots: Record<string, any>): string {
  const formatVal = (val: any): string => {
    if (!val) return '';
    if (Array.isArray(val)) {
      return val
        .map((item) => {
          if (item && typeof item === 'object') {
            const name = item.name || item.nombre || item.title || 'Opción';
            const price = item.price || item.precio ? ` — ${item.price || item.precio}` : '';
            const detailsParts = [
              item.specs || item.medidas || '',
              item.variants || item.variantes || '',
              item.includes || item.incluye ? `Incluye: ${item.includes || item.incluye}` : '',
              item.description || item.descripcion || '',
            ].filter(Boolean);
            return `- **${name}**${price}${detailsParts.length ? ` (${detailsParts.join(' · ')})` : ''}`;
          }
          return `- ${String(item).trim()}`;
        })
        .filter(Boolean)
        .join('\n');
    }
    if (typeof val === 'object') {
      return Object.entries(val)
        .filter(([, v]) => Boolean(v))
        .map(([k, v]) => `- ${k}: ${String(v)}`)
        .join('\n');
    }
    return String(val).trim();
  };

  switch (sectionId) {
    case 'empresa':
      return formatVal(slots['empresa.resumen']);
    case 'catalogo':
      return formatVal(slots['catalogo.items']);
    case 'pagos':
      return formatVal(slots['pagos.medios']);
    case 'envios':
      return formatVal(slots['envios.cobertura']);
    case 'politicas':
      return formatVal(slots['politicas.garantia']);
    case 'faq':
      return formatVal(slots['faq.lista']);
    case 'tono':
      return formatVal(slots['tono.estilo']);
    case 'cierre':
      return formatVal(slots['cierre.datos']);
    case 'relevo':
      return formatVal(slots['relevo.reglas']);
    case 'seguimiento':
      return formatVal(slots['seguimiento.estrategia']);
    case 'adicional': {
      const flowPart = formatVal(slots['adicional.flujo']);
      const notesPart = formatVal(slots['adicional.notas']);
      return [
        flowPart ? `- Regla de flujo y cierre: ${flowPart}` : '',
        notesPart ? `- Reglas adicionales: ${notesPart}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }
    default:
      return '';
  }
}

/**
 * Renderiza un prompt limpio y compacto en Markdown desde los slots recolectados (0 tokens de IA).
 */
export function renderPromptFromSlots(
  slots: Record<string, any>,
  _preset?: IndustryPreset
): string {
  const blocks: string[] = [];

  for (const sec of [...PROMPT_SECTIONS].sort((a, b) => a.order - b.order)) {
    const content = renderSectionBodyFromSlots(sec.id, slots);
    if (content && content.trim()) {
      blocks.push(`## ${sec.title}\n${content.trim()}`);
    }
  }

  return blocks.join('\n\n').trim();
}

/**
 * Guarda una instantánea histórica antes de sobrescribir/aplicar cambios para garantizar recuperación 1-clic.
 */
export function pushPromptVersion(
  existingVersions: unknown,
  previousPrompt: string,
  reason: string,
  maxVersions = 8
): PromptVersionEntry[] {
  const list: PromptVersionEntry[] = Array.isArray(existingVersions)
    ? existingVersions.filter(
        (v: any): v is PromptVersionEntry =>
          v && typeof v === 'object' && typeof v.prompt === 'string' && typeof v.id === 'string'
      )
    : [];

  const { body } = splitGalleryTail(previousPrompt);
  const cleanPrev = body.trim();
  if (!cleanPrev) return list;

  // Evitar duplicar si la versión más reciente es idéntica
  if (list[0] && splitGalleryTail(list[0].prompt).body.trim() === cleanPrev) {
    return list;
  }

  const nextEntry: PromptVersionEntry = {
    id: `ver-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    prompt: previousPrompt.trim(),
    createdAt: new Date().toISOString(),
    reason,
  };

  return [nextEntry, ...list].slice(0, maxVersions);
}

const META_COMMENTARY_START_REGEX =
  /^\s*(?:[-*]\s*)?(?:es recomendable|se recomienda|te recomiendo|conviene|ser[ií]a (?:ideal|bueno|útil|recomendable)|es aconsejable|deber[ií]as|sugiero|se sugiere|te sugerimos|falta especificar|podr[ií]as agregar)\b/i;

const META_COMMENTARY_BODY_REGEX =
  /(?:evitar dispersi[oó]n|unificar (?:las )?instrucciones|por ejemplo,\s*(?:incluir|agregar|crear) una secci[oó]n|en un solo apartado|reorganizar (?:el|este) prompt)/i;

/**
 * Extrae los encabezados exactos del prompt del cliente (en su formato original) ordenados.
 * Se usa para alimentar al LLM con los títulos reales, evitando que cree secciones duplicadas.
 */
export function buildExactSectionHeadingsList(prompt: string): string[] {
  const { body } = splitGalleryTail(prompt);
  if (!body.trim()) return [];
  return findParsedSections(body).map((b) => b.rawHeading.replace(/\n+$/, '').trim());
}

/**
 * Detecta si un texto propuesto es un consejo/meta-comentario dirigido al administrador
 * (en lugar de una instrucción directa lista para pegar en el prompt del bot).
 */
export function isMetaPromptCommentary(text: string): boolean {
  const clean = String(text || '').trim();
  if (!clean) return false;
  return META_COMMENTARY_START_REGEX.test(clean) || META_COMMENTARY_BODY_REGEX.test(clean);
}

/**
 * Construye un esquema compacto (títulos y primeras líneas por sección) para ahorrar
 * tokens de entrada al contextualizar cambios puntuales en prompts extensos.
 */
export function buildCompactPromptOutline(prompt: string, maxChars = 1400): string {
  const { body } = splitGalleryTail(prompt);
  const clean = body.trim();
  if (!clean) return '';
  if (clean.length <= maxChars) return clean;

  const blocks = findParsedSections(clean);
  if (blocks.length === 0) return clean.slice(0, maxChars);

  const compactBlocks = blocks.map((b) => {
    const firstLines = b.body
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join('\n');
    return `${b.rawHeading}\n${firstLines.slice(0, 180)}`;
  });

  return compactBlocks.join('\n\n').slice(0, maxChars);
}

/**
 * Elimina líneas/viñetas duplicadas exactas y exceso de saltos en TypeScript (0 tokens).
 */
export function dedupePromptLinesDeterministically(promptBody: string): string {
  const lines = String(promptBody || '').split('\n');
  const seenNonEmpty = new Set<string>();
  const out: string[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      if (out.length > 0 && out[out.length - 1] !== '') {
        out.push('');
      }
      continue;
    }

    // Conservar encabezados siempre y comparar viñetas/reglas normalizadas
    const isHeading = /^(?:#{1,3}\s+|[A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s/_-]{3,}:\s*$|<\/?[a-z0-9_]+>)/i.test(
      trimmed
    );
    const norm = trimmed
      .toLowerCase()
      .replace(/^[-*•]\s*/, '')
      .replace(/\s+/g, ' ');

    if (!isHeading && norm.length >= 12 && seenNonEmpty.has(norm)) {
      continue;
    }
    if (!isHeading && norm.length >= 12) {
      seenNonEmpty.add(norm);
    }
    out.push(rawLine);
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Enruta reglas o instrucciones únicas e inequívocas en Chat Libre sin llamar al LLM (0 tokens).
 */
export function tryRouteFreeInstructionLocally(
  rawAnswer: string,
  currentPrompt: string
): {
  handled: boolean;
  sectionId?: string;
  slotId?: string;
  value?: string;
  mergedBody?: string;
} {
  const clean = String(rawAnswer || '').trim();
  if (!clean || clean.length < 10 || clean.length > 240) {
    return { handled: false };
  }
  // Si contiene múltiples productos con precios o varias líneas complejas, delegar al LLM
  if (clean.includes('\n') || (clean.match(/\$/g) || []).length >= 2) {
    return { handled: false };
  }

  const lower = clean.toLowerCase();
  let targetSectionId: string | null = null;
  let targetSlotId: string | null = null;

  if (/(no repit|si ya envi[aá]|tras enviar foto|ruta de cierre|finiquita|pregunta sutil|al cerrar)/i.test(lower)) {
    targetSectionId = 'adicional';
    targetSlotId = 'adicional.flujo';
  } else if (/^(?:regla|prohibici[oó]n|importante)\s*:/i.test(lower) || /(nunca digas|no prometas|no des descuento|prohibido)/i.test(lower)) {
    targetSectionId = 'adicional';
    targetSlotId = 'adicional.notas';
  } else if (/^(?:horario|horarios|horario de atenci[oó]n)\s*:/i.test(lower)) {
    targetSectionId = 'relevo';
    targetSlotId = 'relevo.reglas';
  } else if (/^(?:env[ií]o|env[ií]os|cobertura|domicilio)\s*:/i.test(lower)) {
    targetSectionId = 'envios';
    targetSlotId = 'envios.cobertura';
  }

  if (!targetSectionId || !targetSlotId) {
    return { handled: false };
  }

  const profile = detectPromptFormat(currentPrompt || '');
  const bullet = profile.bulletStyle;
  const formattedLine = `${bullet} ${clean.replace(/^(?:regla|horario|env[ií]o)\s*:\s*/i, '').trim()}`;

  const secMeta = PROMPT_SECTIONS.find((s) => s.id === targetSectionId);
  const existing = extractExistingSectionContent(currentPrompt || '', secMeta?.title || targetSectionId, targetSectionId);

  let mergedBody = formattedLine;
  if (existing.found && existing.body.trim()) {
    const normNew = formattedLine.replace(/^[-*]\s*/, '').toLowerCase();
    const alreadyPresent = existing.body.toLowerCase().includes(normNew);
    mergedBody = alreadyPresent
      ? existing.body
      : `${existing.body.trimEnd()}\n${formattedLine}`;
  }

  return {
    handled: true,
    sectionId: targetSectionId,
    slotId: targetSlotId,
    value: clean,
    mergedBody: adaptBulletStyle(mergedBody, bullet),
  };
}
