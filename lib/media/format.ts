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
