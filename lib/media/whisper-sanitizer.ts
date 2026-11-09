/**
 * Utilidades para sanitizar transcripciones de audio generadas por Whisper.
 * Detecta y descarta alucinaciones comunes producidas ante silencio, música de fondo o ruido blanco.
 */

const WHISPER_HALLUCINATION_PATTERNS = [
  /suscr[ií]b(?:ete|ase|anse|ir|te|ite|ete al canal)/i,
  /subt[ií]tulos (?:realizados|creados|por)/i,
  /amara\.org/i,
  /gracias por ver(?: el video| este video)?/i,
  /dale like/i,
  /deja tu like/i,
  /canal de youtube/i,
  /mooji\.org/i,
  /continuar[aá]\.{2,}/i,
  /transmisi[oó]n en vivo/i,
  /fin de la transmisi[oó]n/i,
  /hasta el pr[oó]ximo v[ií]deo/i,
  /bye bye/i,
  /watching this video/i,
  /subscribe to/i,
  /thank you for watching/i,
  /translated by/i,
];

/**
 * Determina si el texto transcrito es una alucinación conocida de Whisper o carece de contenido real.
 */
export function isWhisperHallucination(text: string | null | undefined): boolean {
  if (!text) return true;
  const clean = text.trim();
  if (clean.length < 2) return true;

  // Solo signos o notas musicales
  if (/^[\p{P}\p{S}\s♪♫]+$/u.test(clean)) return true;

  for (const pattern of WHISPER_HALLUCINATION_PATTERNS) {
    if (pattern.test(clean)) {
      return true;
    }
  }

  // Detectar repeticiones patológicas (ej: "hola hola hola hola hola")
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 4) {
    const firstWord = words[0].toLowerCase();
    const allSame = words.every((w) => w.toLowerCase() === firstWord);
    if (allSame) return true;
  }

  return false;
}

/**
 * Limpia el texto de transcripción. Si es una alucinación o texto vacío, retorna string vacío.
 */
export function sanitizeTranscription(text: string | null | undefined): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (isWhisperHallucination(trimmed)) {
    return '';
  }
  return trimmed;
}

