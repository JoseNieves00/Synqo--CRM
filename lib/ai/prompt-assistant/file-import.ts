import ExcelJS from 'exceljs';
import { extractText } from 'unpdf';
import { PROMPT_ASSISTANT_CONFIG } from '@/lib/ai/config';
import type { GalleryPhotoItem } from '@/lib/media/format';

export interface ImportedCatalogItem {
  name: string;
  price?: string;
  specs?: string;
  variants?: string;
  includes?: string;
  matchedPhotoUrl?: string | null;
}

export interface SpreadsheetColumnMapping {
  nameCol: string | null;
  priceCol: string | null;
  specsCol: string | null;
  variantsCol: string | null;
  includesCol: string | null;
}

export interface ParsedSpreadsheetResult {
  headers: string[];
  sampleRows: Record<string, string>[];
  allRows: Record<string, string>[];
  totalRows: number;
}

export interface ExtractedPdfResult {
  totalPages: number;
  pagesProcessed: number;
  isScanned: boolean;
  blocks: string[];
  estimatedInputTokens: number;
}

/**
 * Sanitiza texto proveniente de archivos externos para evitar prompt injection o ruido HTML/control.
 */
export function sanitizeImportedText(raw: string): string {
  return String(raw || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/<\/?(?:system|assistant|prompt|reglas_estrictas|instrucciones)[^>]*>/gi, '')
    .replace(/(?:ignore|forget|disregard)\s+(?:all\s+)?(?:previous|prior)\s+instructions?/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function cellValueToString(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    if ('text' in val && val.text) return String(val.text);
    if ('result' in val && val.result !== undefined) return String(val.result);
    if (Array.isArray(val.richText)) return val.richText.map((r: any) => r?.text || '').join('');
  }
  return String(val);
}

/**
 * Lee Excel (.xlsx) o CSV en el servidor devolviendo encabezados, 3 filas de muestra y todas las filas limpias.
 */
export async function parseCatalogSpreadsheet(
  buffer: Buffer,
  fileName: string,
  maxRows = 500
): Promise<ParsedSpreadsheetResult> {
  const lowerName = (fileName || '').toLowerCase();
  const rowsAsMatrix: string[][] = [];

  if (lowerName.endsWith('.csv')) {
    const csvStr = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const lines = csvStr.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const firstLine = lines[0] || '';
    const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
    for (const line of lines.slice(0, maxRows + 1)) {
      const cells = parseCsvLine(line, delimiter).map((c) => sanitizeImportedText(c));
      if (cells.some(Boolean)) rowsAsMatrix.push(cells);
    }
  } else {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return { headers: [], sampleRows: [], allRows: [], totalRows: 0 };
    }
    sheet.eachRow({ includeEmpty: false }, (row) => {
      if (rowsAsMatrix.length >= maxRows + 1) return;
      const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
      const cells = vals.map((v) => sanitizeImportedText(cellValueToString(v)));
      if (cells.some(Boolean)) rowsAsMatrix.push(cells);
    });
  }

  if (rowsAsMatrix.length < 2) {
    return { headers: [], sampleRows: [], allRows: [], totalRows: 0 };
  }

  const rawHeaders = rowsAsMatrix[0];
  const headers = rawHeaders.map((h, i) => h || `Columna_${i + 1}`);
  const allRows: Record<string, string>[] = [];

  for (let r = 1; r < rowsAsMatrix.length; r++) {
    const rowArr = rowsAsMatrix[r];
    const obj: Record<string, string> = {};
    let hasContent = false;
    for (let c = 0; c < headers.length; c++) {
      const v = (rowArr[c] || '').trim();
      obj[headers[c]] = v;
      if (v) hasContent = true;
    }
    if (hasContent) allRows.push(obj);
  }

  return {
    headers,
    sampleRows: allRows.slice(0, 3),
    allRows,
    totalRows: allRows.length,
  };
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

/**
 * Mapeo determinístico de todas las filas de Excel usando los nombres de columna resueltos (0 tokens por fila).
 */
export function applySpreadsheetColumnMapping(
  allRows: Record<string, string>[],
  mapping: SpreadsheetColumnMapping
): ImportedCatalogItem[] {
  const items: ImportedCatalogItem[] = [];
  for (const row of allRows) {
    const name = mapping.nameCol ? (row[mapping.nameCol] || '').trim() : '';
    if (!name) continue;
    items.push({
      name: name.slice(0, 120),
      price: mapping.priceCol ? (row[mapping.priceCol] || '').trim().slice(0, 60) || undefined : undefined,
      specs: mapping.specsCol ? (row[mapping.specsCol] || '').trim().slice(0, 180) || undefined : undefined,
      variants: mapping.variantsCol ? (row[mapping.variantsCol] || '').trim().slice(0, 140) || undefined : undefined,
      includes: mapping.includesCol ? (row[mapping.includesCol] || '').trim().slice(0, 180) || undefined : undefined,
    });
  }
  return items;
}

/**
 * Extrae texto de un PDF sin OCR costoso; si detecta PDF escaneado (sin texto seleccionable),
 * lo rechaza con 0 consumo de tokens de IA.
 */
export async function extractCatalogPdfText(
  buffer: Buffer,
  maxPages: number = PROMPT_ASSISTANT_CONFIG.pdfMaxPages
): Promise<ExtractedPdfResult> {
  const res = await extractText(new Uint8Array(buffer), { mergePages: false });
  const pagesArray = Array.isArray(res.text) ? res.text : [String(res.text || '')];
  const totalPages = Number(res.totalPages || pagesArray.length || 0);
  const slicedPages = pagesArray.slice(0, Math.max(1, maxPages));
  const merged = slicedPages.map((p) => sanitizeImportedText(p)).join('\n\n').trim();

  if (merged.length < 60) {
    return {
      totalPages,
      pagesProcessed: slicedPages.length,
      isScanned: true,
      blocks: [],
      estimatedInputTokens: 0,
    };
  }

  // Dividir en bloques de ~12.000 chars (~3.000 tokens por bloque)
  const chunkSize = 12000;
  const blocks: string[] = [];
  for (let i = 0; i < merged.length; i += chunkSize) {
    blocks.push(merged.slice(i, i + chunkSize));
  }

  const estimatedInputTokens = blocks.reduce((acc, b) => acc + Math.ceil(b.length / 4) + 250, 0);

  return {
    totalPages,
    pagesProcessed: slicedPages.length,
    isScanned: false,
    blocks,
    estimatedInputTokens,
  };
}

function normName(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Enlaza productos importados con fotos ya existentes en la galería de la organización (0 tokens).
 */
export function matchImportedItemsWithGallery(
  items: ImportedCatalogItem[],
  gallery: GalleryPhotoItem[]
): ImportedCatalogItem[] {
  if (!Array.isArray(gallery) || gallery.length === 0) return items;

  const indexed = gallery.map((g) => {
    const kwText = Array.isArray((g as any).keywords)
      ? (g as any).keywords.join(' ')
      : typeof (g as any).keywords === 'string'
        ? (g as any).keywords
        : '';
    const normCombined = normName(`${g.name} ${kwText}`);
    return {
      url: g.url,
      norm: normName(g.name),
      tokens: normCombined.split(' ').filter((t) => t.length >= 3),
    };
  });

  return items.map((item) => {
    const ni = normName(item.name);
    if (!ni) return item;
    const exact = indexed.find((g) => g.norm === ni || (ni.length >= 4 && (g.norm.includes(ni) || ni.includes(g.norm))));
    if (exact) return { ...item, matchedPhotoUrl: exact.url };

    const itemTokens = ni.split(' ').filter((t) => t.length >= 3);
    if (itemTokens.length > 0) {
      let bestUrl: string | null = null;
      let bestHits = 0;
      for (const g of indexed) {
        const hits = itemTokens.filter((t) => g.tokens.includes(t)).length;
        if (hits > bestHits && hits >= Math.min(2, itemTokens.length)) {
          bestHits = hits;
          bestUrl = g.url;
        }
      }
      if (bestUrl) return { ...item, matchedPhotoUrl: bestUrl };
    }
    return item;
  });
}
