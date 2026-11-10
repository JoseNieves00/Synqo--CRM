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

/**
 * Parche NO destructivo: actualiza ÚNICAMENTE la sección `## {sectionTitle}` si existe en el prompt,
 * o la agrega limpiamente sin tocar ninguna otra línea, instrucción manual o galería previa del cliente.
 */
export function patchSectionInPrompt(
  existingPrompt: string,
  sectionTitle: string,
  sectionBody: string
): string {
  const cleanTitle = sectionTitle.trim();
  const cleanBody = sectionBody.trim();
  const { body, galleryTail } = splitGalleryTail(existingPrompt);

  if (!cleanBody) {
    return existingPrompt;
  }

  const formattedSection = `## ${cleanTitle}\n${cleanBody}`;
  const sectionRegex = new RegExp(
    `(^|\\n)##\\s+${escapeRegExp(cleanTitle)}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`,
    'i'
  );

  let nextBody: string;
  if (!body.trim()) {
    nextBody = formattedSection;
  } else if (sectionRegex.test(body)) {
    nextBody = body.replace(sectionRegex, (_full, leading) => `${leading}${formattedSection}`);
  } else {
    nextBody = `${body.trimEnd()}\n\n${formattedSection}`;
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
    case 'adicional':
      return formatVal(slots['adicional.notas']);
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
