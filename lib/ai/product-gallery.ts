import { extractPhotoUrlsFromText, type GalleryPhotoItem } from '@/lib/media/format';

function normalizeSearchText(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[+_]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeSearch(str: string): string[] {
  const stopWords = new Set(['de', 'la', 'el', 'con', 'para', 'en', 'un', 'una', 'y', 'o', 'los', 'las', 'modelo']);
  return normalizeSearchText(str)
    .split(' ')
    .filter((t) => t.length >= 2 && !stopWords.has(t));
}

function tokenMatchScore(a: string, b: string): number {
  if (a === b) return 2;
  // Tolerar diminutivos / variaciones tipográficas comunes (ej: cocinita/cosinita/cocina)
  const stemA = a.slice(0, Math.max(3, Math.min(5, a.length)));
  const stemB = b.slice(0, Math.max(3, Math.min(5, b.length)));
  if (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4)) return 1.5;
  if (a.includes(b) || b.includes(a)) return 1.3;
  if (a.length >= 5 && b.length >= 5 && a.slice(-4) === b.slice(-4) && a[0] === b[0]) return 1.2;
  if (stemA.length >= 4 && stemB.length >= 4 && stemA === stemB) return 1.1;
  return 0;
}

export function normalizeCurrencyAmount(raw: string | number | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const str = String(raw).replace(/[^0-9]/g, '');
  if (!str) return null;
  const num = Number(str);
  return Number.isFinite(num) && num > 0 ? num : null;
}

export function formatGalleryPrice(rawPrice?: string | number | null): string {
  if (rawPrice === undefined || rawPrice === null) return '';
  const str = String(rawPrice).trim();
  if (!str) return '';
  const digits = str.replace(/[^0-9]/g, '');
  if (!digits) return str;
  const numeric = Number(digits);
  if (!Number.isFinite(numeric) || numeric <= 0) return str;
  return `$${numeric.toLocaleString('es-CO')}`;
}

export interface EnrichedGalleryItem extends GalleryPhotoItem {
  searchKeywords: string[];
  catalogDescription?: string;
}

export function resolveOrganizationGallery(organization?: any, systemPromptText?: string | null): {
  items: EnrichedGalleryItem[];
  allowedUrls: Set<string>;
  knownPrices: Set<number>;
} {
  const spData = organization?.structured_prompt_data || organization?.structured_prompt || {};
  const rawGallery: GalleryPhotoItem[] = Array.isArray(spData.gallery) ? spData.gallery : [];
  const rawCatalog: any[] = Array.isArray(spData.catalog) ? spData.catalog : [];

  const allowedUrls = new Set<string>();
  const knownPrices = new Set<number>();

  // 1. Indexar catálogo estructurado para enriquecer keywords y precios
  const items: EnrichedGalleryItem[] = rawGallery
    .filter((g) => g && g.url && /^https?:\/\//i.test(g.url.trim()))
    .map((g) => {
      const cleanUrl = g.url.trim();
      allowedUrls.add(cleanUrl);

      const gPrice = normalizeCurrencyAmount(g.price);
      if (gPrice && gPrice >= 1000) knownPrices.add(gPrice);

      // Buscar coincidencia en catalog para heredar keywords/aliases/descripción sin editar BD
      const normName = normalizeSearchText(g.name);
      const matchedCatalog = rawCatalog.find((c) => {
        const cNorm = normalizeSearchText(c?.name || '');
        if (!cNorm) return false;
        return cNorm === normName || cNorm.includes(normName) || normName.includes(cNorm);
      });

      const mergedKeywords = new Set<string>([
        ...(Array.isArray(g.keywords) ? g.keywords : []),
        ...(Array.isArray(matchedCatalog?.keywords) ? matchedCatalog.keywords : []),
      ]);

      if (matchedCatalog?.description) {
        // Extraer posibles apodos entre comillas en la descripción del catálogo (solo lectura)
        const quotedMatches = String(matchedCatalog.description).match(/"([^"]{2,40})"/g);
        if (quotedMatches) {
          for (const qm of quotedMatches) {
            mergedKeywords.add(qm.replace(/"/g, '').trim());
          }
        }
        // Incluir tokens clave de la descripción
        mergedKeywords.add(String(matchedCatalog.description));
      }

      const cPrice = normalizeCurrencyAmount(matchedCatalog?.price);
      if (cPrice && cPrice >= 1000) knownPrices.add(cPrice);

      return {
        ...g,
        url: cleanUrl,
        price: g.price || matchedCatalog?.price,
        searchKeywords: Array.from(mergedKeywords),
        catalogDescription: matchedCatalog?.description,
      };
    });

  // 2. Fallback para prompts antiguos con [foto: URL] embebido
  if (systemPromptText) {
    const legacyPhotos = extractPhotoUrlsFromText(systemPromptText);
    for (const lp of legacyPhotos) {
      const cleanUrl = lp.url.trim();
      if (!allowedUrls.has(cleanUrl)) {
        allowedUrls.add(cleanUrl);
        items.push({
          id: `legacy-${items.length}`,
          name: lp.name || 'Producto',
          url: cleanUrl,
          searchKeywords: [],
        });
      }
    }

    // Extraer todos los montos reales presentes en el systemPrompt (precios, envíos, abonos)
    const priceMatches = systemPromptText.match(/(?:\$\s*[0-9]{1,3}(?:[.,][0-9]{3})+|\$\s*[0-9]{4,})/g) || [];
    for (const pm of priceMatches) {
      const num = normalizeCurrencyAmount(pm);
      if (num && num >= 1000) knownPrices.add(num);
    }
  }

  for (const c of rawCatalog) {
    const cPrice = normalizeCurrencyAmount(c?.price);
    if (cPrice && cPrice >= 1000) knownPrices.add(cPrice);
  }

  return { items, allowedUrls, knownPrices };
}

export function findGalleryProductMatch(
  items: EnrichedGalleryItem[],
  query: string
): EnrichedGalleryItem | null {
  if (!items || items.length === 0 || !query || !query.trim()) return null;

  const cleanQuery = query.trim();
  const normQuery = normalizeSearchText(cleanQuery);

  // 1. Match exacto por ID o nombre normalizado
  const exactMatch = items.find(
    (item) => item.id === cleanQuery || normalizeSearchText(item.name) === normQuery
  );
  if (exactMatch) return exactMatch;

  // 2. Match exacto o por inclusión dentro de keywords
  const keywordMatch = items.find((item) =>
    item.searchKeywords.some((kw) => {
      const nkw = normalizeSearchText(kw);
      return nkw === normQuery || (normQuery.length >= 4 && nkw.includes(normQuery));
    })
  );
  if (keywordMatch) return keywordMatch;

  // 3. Scoring semántico por tokens + coincidencia de subcadena
  const queryTokens = tokenizeSearch(cleanQuery);
  if (queryTokens.length === 0) return null;

  let bestItem: EnrichedGalleryItem | null = null;
  let bestScore = 0;

  for (const item of items) {
    const normItemName = normalizeSearchText(item.name);
    const nameTokens = tokenizeSearch(item.name);
    const kwTokens = item.searchKeywords.flatMap((k) => tokenizeSearch(k));
    const allItemTokens = Array.from(new Set([...nameTokens, ...kwTokens]));

    let score = 0;
    if (normItemName.includes(normQuery) || normQuery.includes(normItemName)) {
      score += 4;
    }

    for (const qt of queryTokens) {
      let maxTokenSim = 0;
      for (const it of nameTokens) {
        maxTokenSim = Math.max(maxTokenSim, tokenMatchScore(qt, it) * 1.4);
      }
      for (const it of allItemTokens) {
        maxTokenSim = Math.max(maxTokenSim, tokenMatchScore(qt, it));
      }
      score += maxTokenSim;
    }

    // Preferir item marcado como isHero solo en empate exacto de relevancia
    if (item.isHero && score > 0) {
      score += 0.05;
    }

    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  return bestScore >= 1.5 ? bestItem : null;
}

export function buildProductCardCaption(params: {
  name: string;
  price?: string | number | null;
  details?: string | null;
}): string {
  const formattedPrice = formatGalleryPrice(params.price);
  const cleanDetails = (params.details || '').trim();
  const header = formattedPrice ? `${params.name} · ${formattedPrice}` : params.name;
  return cleanDetails ? `${header}\n${cleanDetails}` : header;
}

/**
 * Valida que los precios citados en la respuesta de la IA pertenezcan al catálogo/prompt
 * o sean combinaciones aritméticas directas de precios reales (ej: suma de pedido).
 */
export function findHallucinatedPrices(
  responseText: string,
  knownPrices: Set<number>
): number[] {
  if (!responseText || knownPrices.size === 0) return [];

  const priceMatches = responseText.match(/(?:\$\s*[0-9]{1,3}(?:[.,][0-9]{3})+|\$\s*[0-9]{4,})/g) || [];
  if (priceMatches.length === 0) return [];

  const knownArray = Array.from(knownPrices);
  const validSums = new Set<number>(knownArray);
  // Permitir sumas de 2 ítems conocidos o multiplicación x2/x3 (común en total de pedidos/envío)
  for (const a of knownArray) {
    validSums.add(a * 2);
    validSums.add(a * 3);
    for (const b of knownArray) {
      validSums.add(a + b);
    }
  }

  const invalid: number[] = [];
  for (const raw of priceMatches) {
    const val = normalizeCurrencyAmount(raw);
    if (!val || val < 1000) continue;
    if (!validSums.has(val)) {
      invalid.push(val);
    }
  }

  return invalid;
}
