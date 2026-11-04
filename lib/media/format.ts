/**
 * Utilidades de Formateo y Parsing de Mensajes Multimedia (Imágenes y Archivos)
 * Diseñado para compatibilidad universal con base de datos, chat visual y WhatsApp.
 */

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
  const mdMatch = content.match(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+\.(?:jpg|jpeg|png|webp|gif)[^\s)]*)\)/i);
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
    .replace(/===\s*CATÁLOGO VISUAL DE FOTOS[\s\S]*?(?=\n\n[#=]|$)/gi, '')
    .replace(/\[(?:foto|imagen):\s*https?:\/\/[^\]]+\]/gi, '')
    .replace(/[ \t]+(?=\r?\n|$)/gm, '')
    .trim();
}

export interface GalleryPhotoItem {
  id: string;
  name: string;
  url: string;
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
  const catalogBlockMatch = text.match(/===\s*CATÁLOGO VISUAL DE FOTOS[^\n]*===([\s\S]*?)(?=\n\n[#=]|$)/i);
  if (catalogBlockMatch) {
    const lines = catalogBlockMatch[1].split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/[-*]\s*([^:\n]+):\s*(https?:\/\/[^\s]+)/i);
      if (match) {
        const name = match[1].trim();
        const url = match[2].trim();
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
