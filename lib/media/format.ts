/**
 * Utilidades de Formateo y Parsing de Mensajes Multimedia (Imágenes y Archivos)
 * Diseñado para compatibilidad universal con base de datos, chat visual y WhatsApp.
 */

import { sanitizeTranscription } from './whisper-sanitizer';

export interface ParsedImageMessage {
  isImage: boolean;
  url?: string;
  caption?: string;
}

/**
 * Formatea el contenido de un mensaje de imagen para almacenarlo de manera estándar y segura
 * en la columna `content` de Supabase sin romper compatibilidad con clientes de base de datos antiguos.
 */
export function formatImageMessageContent(url: string, caption?: string): string {
  const cleanUrl = url.trim();
  const cleanCaption = caption?.trim();

  if (cleanCaption) {
    return `📷 [Imagen: ${cleanUrl}]: ${cleanCaption}`;
  }
  return `📷 [Imagen: ${cleanUrl}]`;
}

/**
 * Extrae la URL y el caption de un mensaje formateado como imagen.
 * Soporta tanto el formato canónico `📷 [Imagen: URL]: Caption` como URLs directas de Supabase Storage.
 */
export function parseImageMessageContent(content: string | null | undefined): ParsedImageMessage {
  if (!content || typeof content !== 'string') {
    return { isImage: false };
  }

  // 1. Formato Canónico Synqo: 📷 [Imagen: https://...]: Caption opcional
  const canonicalMatch = content.match(/^📷\s*\[(?:Imagen|Foto):\s*(https?:\/\/[^\]\s]+)\](?::\s*([\s\S]*))?$/i);
  if (canonicalMatch) {
    return {
      isImage: true,
      url: canonicalMatch[1].trim(),
      caption: canonicalMatch[2]?.trim() || '',
    };
  }

  // 2. Formato alternativo con URL de Supabase Storage directa o markdown ![img](url)
  const mdMatch = content.match(/!\[([\s\S]*?)\]\(\s*(https?:\/\/[^\s)]+(?:\.(?:jpg|jpeg|png|webp|gif)|chat-media\/[^\s)]+)[^\s)]*)\s*\)/i);
  if (mdMatch) {
    return {
      isImage: true,
      url: mdMatch[2].trim(),
      caption: mdMatch[1]?.trim() || '',
    };
  }

  // 3. Si el mensaje es una URL directa de imagen alojada en chat-media
  const urlMatch = content.trim().match(/^(https?:\/\/[^\s]+\/chat-media\/[^\s]+(?:\.jpg|\.jpeg|\.png|\.webp|\.gif)?(?:\?[^\s]*)?)$/i);
  if (urlMatch) {
    return {
      isImage: true,
      url: urlMatch[1].trim(),
      caption: '',
    };
  }

  return { isImage: false };
}

export interface ParsedDocumentMessage {
  isDocument: boolean;
  url?: string;
  fileName?: string;
  caption?: string;
}

/**
 * Formatea el contenido de un mensaje de documento o archivo para almacenamiento seguro en BD.
 */
export function formatDocumentMessageContent(url: string, fileName?: string, caption?: string): string {
  const cleanUrl = url.trim();
  const cleanFileName = (fileName || 'documento.pdf').trim();
  const cleanCaption = caption?.trim();

  if (cleanCaption) {
    return `📄 [Documento: ${cleanUrl} (${cleanFileName})]: ${cleanCaption}`;
  }
  return `📄 [Documento: ${cleanUrl} (${cleanFileName})]`;
}

/**
 * Extrae la URL, nombre de archivo y caption de un mensaje formateado como documento.
 */
export function parseDocumentMessageContent(content: string | null | undefined): ParsedDocumentMessage {
  if (!content || typeof content !== 'string') {
    return { isDocument: false };
  }

  const canonicalMatch = content.match(/^📄\s*\[(?:Documento|Archivo):\s*(https?:\/\/[^\s()\]]+)(?:\s*\(([^)]+)\))?\](?::\s*([\s\S]*))?$/i);
  if (canonicalMatch) {
    return {
      isDocument: true,
      url: canonicalMatch[1].trim(),
      fileName: canonicalMatch[2]?.trim() || 'Documento',
      caption: canonicalMatch[3]?.trim() || '',
    };
  }

  const legacyMatch = content.match(/^📄\s*\[(?:Documento|Archivo)\s*(?:recibido)?:\s*([^\]]+)\](?::\s*([\s\S]*))?$/i);
  if (legacyMatch) {
    const rawVal = legacyMatch[1].trim();
    if (rawVal.startsWith('http')) {
      return {
        isDocument: true,
        url: rawVal,
        fileName: 'Documento',
        caption: legacyMatch[2]?.trim() || '',
      };
    }
    return {
      isDocument: true,
      fileName: rawVal,
      caption: legacyMatch[2]?.trim() || '',
    };
  }

  return { isDocument: false };
}

/**
 * Limpia y remueve cualquier bloque de catálogo interno o enlace [foto: URL] del texto
 * para que el comerciante nunca vea URLs largas ni sintaxis técnica en el editor.
 */
export function stripPhotoUrlsFromText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/===\s*CATÁLOGO VISUAL DE (?:FOTOS|PRODUCTOS)[^\n]*===[\s\S]*?(?=\n\n[#=]|$)/gi, '')
    .replace(/\[(?:foto|imagen):\s*https?:\/\/[^\]]+\]/gi, '')
    .replace(/[ \t]+(?=\r?\n|$)/gm, '')
    .trim();
}

export interface GalleryPhotoItem {
  id: string;
  name: string;
  url: string;
  keywords?: string[];
  price?: string;
  description?: string;
  isAvailable?: boolean;
  isHero?: boolean;
  /**
   * Identificador o nombre canónico del producto padre (para agrupar múltiples fotos bajo un mismo producto).
   * Si no se especifica, se asume igual a `name`.
   */
  productName?: string;
  /**
   * Rol o etiqueta de la vista (ej: "principal", "personalizada", "de lado", "accesorios", "abierta").
   */
  imageRole?: string;
}

/**
 * Extrae un arreglo de fotos vinculadas { id, name, url } a partir de un texto con [foto: URL]
 * o a partir del bloque de despacho interno `=== CATÁLOGO VISUAL DE FOTOS ===`.
 */
export function extractPhotoUrlsFromText(text: string | null | undefined): GalleryPhotoItem[] {
  if (!text) return [];
  const items: GalleryPhotoItem[] = [];
  const seenUrls = new Set<string>();

  // 1. Extraer del bloque estructurado de catálogo visual si existe
  const catalogBlockMatch = text.match(/===\s*CATÁLOGO VISUAL DE (?:FOTOS|PRODUCTOS)[^\n]*===([\s\S]*?)(?=\n\n[#=]|$)/i);
  if (catalogBlockMatch) {
    const lines = catalogBlockMatch[1].split(/\r?\n/);
    for (const line of lines) {
      // Soporta "- Nombre - Precio: [foto: URL]" o "- Nombre: URL"
      const urlMatch = line.match(/(https?:\/\/[^\s\]\)]+)/i);
      const nameMatch = line.match(/[-*]\s*([^:\n(]+)/i);
      if (urlMatch && nameMatch) {
        const name = nameMatch[1].trim();
        const url = urlMatch[1].trim();
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          items.push({ id: `photo-${Date.now()}-${items.length}`, name, url });
        }
      }
    }
  }

  // 2. Extraer de etiquetas inline [foto: URL] (comunes en catálogos redactados)
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/[-*]\s*([^($:\n]+).*?\[(?:foto|imagen):\s*(https?:\/\/[^\]\s]+)\]/i);
    if (match) {
      const name = match[1].trim();
      const url = match[2].trim();
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        items.push({ id: `photo-${Date.now()}-${items.length}`, name, url });
      }
    }
  }

  return items;
}

/**
 * Heurística Zero-Cost para detectar si un mensaje con foto es un comprobante de pago o transferencia.
 * Si es verdadero, la IA nunca debe validar el pago ni invocar modelos de visión costosos;
 * debe activar de inmediato el relevo humano para que el asesor valide la cuenta bancaria.
 */
export function isPaymentReceiptHint(text?: string | null): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  const paymentKeywords = [
    'pago',
    'pague',
    'pagué',
    'transferencia',
    'transferi',
    'transferí',
    'consignacion',
    'consignación',
    'comprobante',
    'pantallazo',
    'captura',
    'recibo',
    'nequi',
    'daviplata',
    'bancolombia',
    'pse',
    'abono',
    'anticipo',
    'ya transferí',
    'ya te transferí',
    'aquí está el comprobante',
    'ahi te mande el comprobante',
    'ahí te mandé el comprobante',
  ];

  return paymentKeywords.some((keyword) => lower.includes(keyword));
}

export interface ParsedAudioMessage {
  isAudio: boolean;
  url?: string;
  transcription?: string;
}

/**
 * Formatea el contenido de una nota de voz para almacenamiento estándar en BD.
 */
export function formatAudioMessageContent(url: string, transcription?: string): string {
  const cleanUrl = url.trim();
  const cleanTrans = sanitizeTranscription(transcription);
  if (cleanTrans) {
    return `🎙️ [Audio: ${cleanUrl}]: "${cleanTrans}"`;
  }
  return `🎙️ [Audio: ${cleanUrl}]`;
}

/**
 * Extrae la URL y la transcripción de un mensaje formateado como audio / nota de voz.
 */
export function parseAudioMessageContent(content: string | null | undefined): ParsedAudioMessage {
  if (!content || typeof content !== 'string') {
    return { isAudio: false };
  }

  const audioMatch = content.match(/^(?:🎙️|🎤)\s*\[Audio:\s*(https?:\/\/[^\s()\]]+)\](?::\s*["“]?([\s\S]*?)["”]?)?$/i);
  if (audioMatch) {
    const rawTrans = audioMatch[2]?.trim() || '';
    const isPlaceholder = /\[Nota de voz/i.test(rawTrans);
    const cleanTrans = isPlaceholder ? '' : sanitizeTranscription(rawTrans);
    return {
      isAudio: true,
      url: audioMatch[1].trim(),
      transcription: cleanTrans,
    };
  }

  // Compatibilidad con URLs directas de storage que terminen en formato de audio
  const directAudioMatch = content.trim().match(/^(https?:\/\/[^\s]+\/chat-media\/[^\s]+(?:\.webm|\.ogg|\.mp3|\.wav|\.m4a)(?:\?[^\s]*)?)$/i);
  if (directAudioMatch) {
    return {
      isAudio: true,
      url: directAudioMatch[1].trim(),
      transcription: '',
    };
  }

  return { isAudio: false };
}

export interface ParsedVideoMessage {
  isVideo: boolean;
  url?: string;
  caption?: string;
}

/**
 * Formatea el contenido de un mensaje de video para almacenamiento estándar en BD.
 */
export function formatVideoMessageContent(url: string, caption?: string): string {
  const cleanUrl = url.trim();
  const cleanCaption = caption?.trim();
  if (cleanCaption) {
    return `📹 [Video: ${cleanUrl}]: ${cleanCaption}`;
  }
  return `📹 [Video: ${cleanUrl}]`;
}

/**
 * Extrae la URL y el caption de un mensaje formateado como video.
 */
export function parseVideoMessageContent(content: string | null | undefined): ParsedVideoMessage {
  if (!content || typeof content !== 'string') {
    return { isVideo: false };
  }

  // 1. Formato canónico Synqo: 📹 [Video: https://...]: Caption (con o sin emoji de cámara)
  const canonicalMatch = content.match(/^(?:📹\s*)?\[(?:Video|Clip):\s*(https?:\/\/[^\]\s]+)\](?::\s*([\s\S]*))?$/i);
  if (canonicalMatch) {
    return {
      isVideo: true,
      url: canonicalMatch[1].trim(),
      caption: canonicalMatch[2]?.trim() || '',
    };
  }

  // 2. URLs directas de chat-media que apunten a video
  const urlMatch = content.trim().match(/^(https?:\/\/[^\s]+\/chat-media\/[^\s]+(?:\.mp4|\.mov|\.webm|\.3gp)(?:\?[^\s]*)?)$/i);
  if (urlMatch) {
    return {
      isVideo: true,
      url: urlMatch[1].trim(),
      caption: '',
    };
  }

  return { isVideo: false };
}

export interface ParsedQuoteMessage {
  hasQuote: boolean;
  quotedText?: string;
  actualText: string;
}

/**
 * Formatea un mensaje que cita una respuesta previa.
 */
export function formatQuoteMessageContent(quotedText: string, text: string): string {
  const cleanQuoted = quotedText.replace(/\r?\n/g, ' ').slice(0, 160).trim();
  return `💬 [Cita: "${cleanQuoted}"]\n${text.trim()}`;
}

/**
 * Extrae el texto citado y el mensaje real de un mensaje con cita.
 */
export function parseQuoteMessageContent(content: string | null | undefined): ParsedQuoteMessage {
  if (!content || typeof content !== 'string') {
    return { hasQuote: false, actualText: content || '' };
  }

  const quoteMatch = content.match(/^💬\s*\[(?:Cita|Respuesta):\s*["“]([\s\S]*?)["”]\]\s*\n?([\s\S]*)$/i);
  if (quoteMatch) {
    return {
      hasQuote: true,
      quotedText: quoteMatch[1].trim(),
      actualText: quoteMatch[2]?.trim() || '',
    };
  }

  return { hasQuote: false, actualText: content };
}

/**
 * Blindaje Determinístico Anti-Redundancia tras Enviar Tarjetas de Producto.
 *
 * Cuando la IA despachó una o más tarjetas con fotos oficiales (que ya llevan
 * nombre, precio y medidas en el caption de la imagen), este guardrail poda
 * determinísticamente cualquier listado redundante de productos, precios, medidas,
 * dimensiones o características que el modelo intente emitir en el texto final,
 * garantizando que el usuario reciba ÚNICAMENTE la pregunta de cierre o el mensaje
 * conversacional limpio sin duplicar información.
 */
export function stripRedundantCatalogListAfterCards(
  text: string,
  options?: {
    allowRedundancy?: boolean;
    customFallbackQuestion?: string;
  }
): string {
  if (!text || typeof text !== 'string') return text;
  if (options?.allowRedundancy) return text;

  const lines = text.split('\n');
  const cleanedLines: string[] = [];

  // Patrones que identifican listas numeradas o con viñetas
  const listMarkerPattern = /^\s*(\d+[\.\)]|[-*•–—])\s+/;
  // Patrones de atributos individuales de producto
  const singleAttributePattern = /^\s*(medidas?|dimensiones?|precio|altura|ancho|profundidad|personalizable|incluye|especificaciones?|material|color)\b/i;
  // Encabezados huérfanos que introducen listas de catálogo (ej. "Aquí te comparto los modelos:", "Opciones disponibles:")
  const orphanCatalogIntroPattern = /^(?:aqu[ií]\s+(?:tienes|te\s+(?:comparto|dejo|muestro|presento))|estas?\s+son\s+las\s+opciones|modelos?\s+disponibles?|opciones?\s+disponibles?|te\s+detallo\s+las\s+opciones)[\s\S]*:$/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      cleanedLines.push(line);
      continue;
    }
    // Si la línea empieza con un número de lista ("1.", "2)") o una viñeta ("-", "*", "•"),
    // se poda por completo, eliminando nombres de productos, precios, medidas, dimensiones o viñetas de personalización.
    if (listMarkerPattern.test(trimmed)) {
      continue;
    }
    // Si es un atributo suelto de especificaciones (ej. "Medidas: 1,07 m...", "Personalizable...")
    if (singleAttributePattern.test(trimmed)) {
      continue;
    }
    // Si era una introducción de lista que terminaba en ":" y ahora la lista fue podada
    if (orphanCatalogIntroPattern.test(trimmed)) {
      continue;
    }
    cleanedLines.push(line);
  }

  let result = cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  // Poda de marcadores internos o ecos de tarjeta de producto
  result = result
    .replace(/^\[(?:Foto oficial enviada|Imagen enviada|Tarjeta visual)[^\]]*\]:?\s*/gim, '')
    .replace(/\[(?:Foto oficial enviada|Imagen enviada)\]:?\s*/gi, '')
    .trim();

  // Poda determinística de frases meta-referenciales donde la IA anuncia que "envió" fotos o datos
  // (ej. "He enviado la información sobre la cocina pequeña. ¿Cuál de estos modelos se adapta mejor a tu espacio?")
  result = result
    .replace(
      /(?:^|\n)\s*(?:he\s+enviado\s+(?:la\s+informaci[oó]n|la\s+foto|el\s+cat[aá]logo|los\s+detalles|la\s+ficha|las\s+fotos|las\s+im[aá]genes|informaci[oó]n|todo|esto)[^.?!]*[.?!]\s*|te\s+(?:acabo\s+de\s+(?:enviar|compartir)|he\s+(?:enviado|compartido)|envi[eé]|compart[ií]|dej[eé])\s+[^.?!]*[.?!]\s*|ya\s+te\s+(?:envi[eé]|compart[ií]|dej[eé]|mand[eé]|he\s+enviado)\s+[^.?!]*[.?!]\s*|adjunto\s+te\s+[^.?!]*[.?!]\s*|listo,\s*ya\s+te\s+[^.?!]*[.?!]\s*)/gi,
      ''
    )
    .trim();

  const fallbackQuestion = options?.customFallbackQuestion || '¿Cuál de estas opciones se adapta mejor a lo que buscas?';
  return result || fallbackQuestion;
}

/**
 * Extrae y sintetiza de forma ultra-ligera (15-40 tokens) los datos clave que la empresa
 * ya transmitió al cliente en este chat (tarjetas con foto/precio/medidas enviadas, cuentas de pago,
 * cotizaciones de envío), para que la IA tenga memoria interna perfecta y NUNCA duplique información.
 */
export function extractSentInformationSummary(
  dbMessages: Array<{ sender_type: string; content?: string | null }>
): string[] {
  const sentSummaries: string[] = [];
  const seenItems = new Set<string>();

  for (const msg of dbMessages) {
    if (msg.sender_type !== 'ai' && msg.sender_type !== 'agent_manual') continue;
    const text = msg.content || '';

    // 1. Tarjetas oficiales de producto enviadas con foto y caption
    const parsedImg = parseImageMessageContent(text);
    if (parsedImg.isImage && parsedImg.caption) {
      const cleanCap = parsedImg.caption.trim();
      const firstLine = cleanCap.split('\n')[0].trim();
      const key = firstLine.toLowerCase();
      if (!seenItems.has(key)) {
        seenItems.add(key);
        const detailsPreview =
          cleanCap.length > firstLine.length
            ? ` · ${cleanCap.slice(firstLine.length).replace(/\n+/g, ' ').trim().slice(0, 90)}`
            : '';
        sentSummaries.push(`Tarjeta visual enviada: "${firstLine}"${detailsPreview}`);
      }
    }

    // 2. Cuentas bancarias o medios de pago ya entregados
    if (
      /(\bnequi\b|\bbancolombia\b|\bdaviplata\b|\bcuenta de ahorros\b|\bcuenta corriente\b|\bllave\b|\btransfiya\b)/i.test(text) &&
      /\d{6,}/.test(text)
    ) {
      if (!seenItems.has('cuentas_pago')) {
        seenItems.add('cuentas_pago');
        sentSummaries.push('Datos y cuentas oficiales de pago ya entregados');
      }
    }

    // 3. Cotizaciones o tarifas de envío ya acordadas o entregadas
    if (
      /(flete|costo de env[ií]o|valor del env[ií]o|contraentrega a|env[ií]o a)/i.test(text) &&
      /(\$\s*\d+|\d+\s*mil)/i.test(text)
    ) {
      if (!seenItems.has('cotizacion_envio')) {
        seenItems.add('cotizacion_envio');
        sentSummaries.push('Tarifas o condiciones de envío/contraentrega ya comunicadas');
      }
    }
  }

  return sentSummaries;
}

