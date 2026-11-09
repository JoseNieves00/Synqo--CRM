import {
  parseImageMessageContent,
  parseDocumentMessageContent,
  parseAudioMessageContent,
  parseVideoMessageContent,
  parseQuoteMessageContent,
  ParsedImageMessage,
  ParsedDocumentMessage,
  ParsedAudioMessage,
  ParsedVideoMessage,
  ParsedQuoteMessage,
} from './format';

export interface ParsedInstagramPost {
  isInstagramPost: boolean;
  details: string;
  clientMessage: string;
  imageUrl?: string;
}

export interface ParsedVoiceNote {
  isVoiceNote: boolean;
  transcription: string;
  isFailed: boolean;
  audioUrl?: string;
}

export interface ParsedMediaMessage {
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'instagram' | 'voice_note';
  cleanText: string;
  quote: ParsedQuoteMessage;
  image: ParsedImageMessage;
  document: ParsedDocumentMessage;
  audio: ParsedAudioMessage;
  video: ParsedVideoMessage;
  instagram: ParsedInstagramPost;
  voiceNote: ParsedVoiceNote;
}

const DEFAULT_PARSED_TEXT: ParsedMediaMessage = {
  type: 'text',
  cleanText: '',
  quote: { hasQuote: false, actualText: '' },
  image: { isImage: false },
  document: { isDocument: false },
  audio: { isAudio: false },
  video: { isVideo: false },
  instagram: { isInstagramPost: false, details: '', clientMessage: '' },
  voiceNote: { isVoiceNote: false, transcription: '', isFailed: false },
};

// Caché en memoria para evitar re-parsear strings inmutables
const PARSE_CACHE = new Map<string, ParsedMediaMessage>();
const MAX_CACHE_SIZE = 2000;

function computeMediaParse(content: string): ParsedMediaMessage {
  const quote = parseQuoteMessageContent(content);
  const actualText = quote.hasQuote ? quote.actualText : content;

  // 1. Instagram Post / Ad
  const igMatch = actualText.match(
    /^\[(?:Publicación\/Anuncio compartido de Instagram|Anuncio\/Publicación de Instagram):\s*([\s\S]*?)\]\s*([\s\S]*)$/i
  );
  let instagram: ParsedInstagramPost = { isInstagramPost: false, details: '', clientMessage: '' };
  if (igMatch) {
    const details = igMatch[1].trim();
    const clientMessage = igMatch[2].trim();
    const imageMatch =
      details.match(/\[Foto:\s*(https?:\/\/[^\s\]]+)\]/i) ||
      details.match(/(https?:\/\/[^\s\]\)]+(?:cdninstagram|fbcdn|chat-media)[^\s\]\)]*)/i);
    const imageUrl = imageMatch ? imageMatch[1] : undefined;
    const cleanDetails = details.replace(/\[Foto:\s*https?:\/\/[^\s\]]+\]/gi, '').replace(/"/g, '').trim();

    instagram = {
      isInstagramPost: true,
      details: cleanDetails,
      clientMessage,
      imageUrl,
    };
  }

  // 2. Video
  const video = parseVideoMessageContent(actualText);

  // 3. Imagen
  const image = parseImageMessageContent(actualText);

  // 4. Documento
  const document = parseDocumentMessageContent(actualText);

  // 5. Audio / Nota de voz
  const audio = parseAudioMessageContent(actualText);

  let voiceNote: ParsedVoiceNote = { isVoiceNote: false, transcription: '', isFailed: false };
  const audioUrlMatch = actualText.match(
    /(https?:\/\/[^\s\]\)]+(?:chat-media|\.(?:ogg|opus|mp3|wav|m4a|webm))[^\s\]\)]*)/i
  );
  const audioUrl = audioUrlMatch ? audioUrlMatch[1] : undefined;

  if (actualText.includes('🎤') || actualText.includes('[Nota de voz]') || (audioUrl && !audio.isAudio)) {
    const isPlaceholder = /\[Nota de voz (?:recibida|inaudible|no reproducible)\]/i.test(actualText);
    if (isPlaceholder) {
      voiceNote = { isVoiceNote: true, transcription: '', isFailed: true, audioUrl };
    } else {
      const match = actualText.match(/🎤\s*\[Nota de voz(?:\](?::\s*["“]([\s\S]*?)["”])?|:\s*["“]([\s\S]*?)["”]\s*\])/i);
      const text = match ? (match[1] || match[2] || '').trim() : '';
      if (text) {
        const isFallback = /\[Nota de voz/i.test(text);
        voiceNote = {
          isVoiceNote: true,
          transcription: isFallback ? '' : text,
          isFailed: isFallback,
          audioUrl,
        };
      } else if (actualText.startsWith('🎤')) {
        const text = actualText.replace(/^🎤\s*/, '').trim();
        const isFallback = /\[Nota de voz/i.test(text);
        voiceNote = {
          isVoiceNote: true,
          transcription: isFallback ? '' : text,
          isFailed: isFallback,
          audioUrl,
        };
      } else {
        voiceNote = { isVoiceNote: Boolean(audioUrl), transcription: '', isFailed: false, audioUrl };
      }
    }
  }

  let type: ParsedMediaMessage['type'] = 'text';
  if (video.isVideo) type = 'video';
  else if (image.isImage) type = 'image';
  else if (document.isDocument) type = 'document';
  else if (audio.isAudio) type = 'audio';
  else if (instagram.isInstagramPost) type = 'instagram';
  else if (voiceNote.isVoiceNote) type = 'voice_note';

  return {
    type,
    cleanText: actualText,
    quote,
    image,
    document,
    audio,
    video,
    instagram,
    voiceNote,
  };
}

/**
 * Parser ultra rápido con discriminador y caché para MessageBubble.
 * Salta la ejecución de expresiones regulares para mensajes de texto puro.
 */
export function parseMessageContentFast(content: string | null | undefined): ParsedMediaMessage {
  if (!content || typeof content !== 'string') {
    return DEFAULT_PARSED_TEXT;
  }

  // Vía rápida: Si el texto no contiene caracteres especiales de media, es texto plano.
  const mayHaveMedia =
    content.includes('[') ||
    content.includes('http://') ||
    content.includes('https://') ||
    content.includes('📷') ||
    content.includes('📄') ||
    content.includes('🎙') ||
    content.includes('🎤') ||
    content.includes('🎥') ||
    content.includes('![');

  if (!mayHaveMedia) {
    return {
      ...DEFAULT_PARSED_TEXT,
      cleanText: content,
    };
  }

  // Verificar caché
  const cached = PARSE_CACHE.get(content);
  if (cached) return cached;

  const result = computeMediaParse(content);

  // Mantener tamaño de caché controlado
  if (PARSE_CACHE.size >= MAX_CACHE_SIZE) {
    const firstKey = PARSE_CACHE.keys().next().value;
    if (firstKey) PARSE_CACHE.delete(firstKey);
  }
  PARSE_CACHE.set(content, result);

  return result;
}
