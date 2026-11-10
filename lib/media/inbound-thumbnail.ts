import { formatImageMessageContent } from './format';
import { uploadIncomingChatMedia } from './storage';
import { isValidMediaUrl } from '@/lib/security/verify-webhook';

const NON_IMAGE_EXT_REGEX = /\.(?:mp4|mov|avi|webm|ogg|oga|mp3|wav|m4a|pdf|docx?|xlsx?|zip)(?:\?.*)?$/i;
const DIRECT_IMAGE_EXT_REGEX = /\.(?:jpe?g|png|webp|gif)(?:\?.*)?$/i;

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function extractMetaTag(html: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern1 = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
    'i'
  );
  const pattern2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
    'i'
  );
  const match = html.match(pattern1) || html.match(pattern2);
  return match?.[1] ? decodeHtmlEntities(match[1]) : '';
}

async function fetchImageBufferSafe(url: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  if (!isValidMediaUrl(url) || NON_IMAGE_EXT_REGEX.test(url)) return null;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SynqoPreviewBot/1.0)',
        Accept: 'image/*,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/') && !DIRECT_IMAGE_EXT_REGEX.test(url)) {
      return null;
    }
    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > 5 * 1024 * 1024) return null;
    return {
      buffer: Buffer.from(arrayBuf),
      mimeType: contentType.startsWith('image/') ? contentType.split(';')[0] : 'image/jpeg',
    };
  } catch {
    return null;
  }
}

async function fetchOpenGraphPreview(pageUrl: string): Promise<{ imageUrl?: string; title?: string; description?: string } | null> {
  if (!isValidMediaUrl(pageUrl)) return null;
  try {
    const res = await fetch(pageUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType.startsWith('image/')) {
      return { imageUrl: pageUrl };
    }
    if (!contentType.includes('text/html')) return null;

    const rawHtml = (await res.text()).slice(0, 220_000);
    const ogImage = extractMetaTag(rawHtml, 'og:image') || extractMetaTag(rawHtml, 'twitter:image');
    const ogTitle = extractMetaTag(rawHtml, 'og:title') || extractMetaTag(rawHtml, 'twitter:title');
    const ogDesc = extractMetaTag(rawHtml, 'og:description') || extractMetaTag(rawHtml, 'description');

    return {
      imageUrl: ogImage && isValidMediaUrl(ogImage) ? ogImage : undefined,
      title: ogTitle || undefined,
      description: ogDesc || undefined,
    };
  } catch {
    return null;
  }
}

export interface ResolveInboundThumbnailParams {
  organizationId: string;
  contactKey: string;
  text?: string;
  labelPrefix?: string;
  title?: string;
  body?: string;
  thumbnailUrl?: string;
  thumbnailBase64?: string;
  sourceUrl?: string;
}

/**
 * Extrae y persiste miniaturas de anuncios, enlaces compartidos o publicaciones
 * (WhatsApp Referral, Evolution externalAdReply, enlaces web o adjuntos de Instagram)
 * en Supabase Storage para que el Inbox muestre la foto y la IA pueda analizarla con visión.
 */
export async function resolveInboundThumbnailMessage(
  params: ResolveInboundThumbnailParams
): Promise<string> {
  const cleanText = (params.text || '').trim();
  let title = (params.title || '').trim();
  let body = (params.body || '').trim();
  const explicitThumb = (params.thumbnailUrl || '').trim();
  const inlineUrlMatch = cleanText.match(/https?:\/\/[^\s"'<>)]+/i);
  const candidatePageUrl = (params.sourceUrl || inlineUrlMatch?.[0] || '').trim();

  let persistedImageUrl: string | null = null;

  // 1. Miniatura inline en base64 (común en Evolution / Baileys externalAdReply.jpegThumbnail)
  if (params.thumbnailBase64 && params.thumbnailBase64.length > 64) {
    try {
      const cleanB64 = params.thumbnailBase64.replace(/^data:image\/[a-z+]+;base64,/i, '');
      const buf = Buffer.from(cleanB64, 'base64');
      if (buf.byteLength > 0 && buf.byteLength <= 2 * 1024 * 1024) {
        persistedImageUrl = await uploadIncomingChatMedia({
          buffer: buf,
          mimeType: 'image/jpeg',
          organizationId: params.organizationId,
          contactId: params.contactKey,
        });
      }
    } catch {}
  }

  // 2. URL directa de miniatura/imagen del anuncio o adjunto
  if (!persistedImageUrl && explicitThumb && isValidMediaUrl(explicitThumb)) {
    const imgData = await fetchImageBufferSafe(explicitThumb);
    if (imgData) {
      persistedImageUrl = await uploadIncomingChatMedia({
        buffer: imgData.buffer,
        mimeType: imgData.mimeType,
        organizationId: params.organizationId,
        contactId: params.contactKey,
      });
    }
    if (!persistedImageUrl && (DIRECT_IMAGE_EXT_REGEX.test(explicitThumb) || /fbcdn|cdninstagram/i.test(explicitThumb))) {
      persistedImageUrl = explicitThumb;
    }
  }

  // 3. Si solo llegó una URL de publicación/página web sin miniatura, intentar extraer og:image / og:title
  if (!persistedImageUrl && candidatePageUrl && isValidMediaUrl(candidatePageUrl)) {
    const og = await fetchOpenGraphPreview(candidatePageUrl);
    if (og) {
      if (!title && og.title) title = og.title;
      if (!body && og.description) body = og.description;
      if (og.imageUrl) {
        const imgData = await fetchImageBufferSafe(og.imageUrl);
        if (imgData) {
          persistedImageUrl = await uploadIncomingChatMedia({
            buffer: imgData.buffer,
            mimeType: imgData.mimeType,
            organizationId: params.organizationId,
            contactId: params.contactKey,
          });
        }
        if (!persistedImageUrl && (DIRECT_IMAGE_EXT_REGEX.test(og.imageUrl) || /fbcdn|cdninstagram/i.test(og.imageUrl))) {
          persistedImageUrl = og.imageUrl;
        }
      }
    }
  }

  const metaParts: string[] = [];
  if (title) metaParts.push(`"${title.slice(0, 140)}"`);
  if (body && body !== title) metaParts.push(`"${body.slice(0, 220)}"`);
  if (params.sourceUrl && !cleanText.includes(params.sourceUrl)) {
    metaParts.push(params.sourceUrl);
  }

  const label = params.labelPrefix || 'Publicación/Anuncio compartido';
  const contextHeader = metaParts.length > 0 ? `[${label}: ${metaParts.join(' - ')}]` : '';
  const combinedCaption = [contextHeader, cleanText].filter(Boolean).join(' ').trim();

  if (persistedImageUrl) {
    return formatImageMessageContent(persistedImageUrl, combinedCaption || label);
  }
  return combinedCaption;
}
