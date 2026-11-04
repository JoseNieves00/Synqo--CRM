/**
 * Módulo de Cadencia Humana Orgánica y Blindaje Anti-Baneo (Synqo CRM)
 *
 * Emula patrones de digitación humana y pausas biológicas para mitigar
 * la detección algorítmica de Meta sobre conexiones web no oficiales (Z-API / Baileys).
 */

export interface HumanTypingCadence {
  /** Tiempo en segundos para el parámetro delayTyping de Z-API (1 a 15) */
  delayTypingSeconds: number;
  /** Tiempo total estimado en milisegundos */
  totalDelayMs: number;
  /** Pausa previa de lectura antes de comenzar a tipear (ms) */
  readingDelayMs: number;
}

/**
 * Calcula un tiempo de respuesta y tipeo natural basado en la longitud del texto.
 * Un humano promedio digita ~40 a 60 palabras por minuto (~35-50 ms por carácter).
 */
export function calculateHumanCadence(messageText: string): HumanTypingCadence {
  const charCount = (messageText || '').trim().length;

  // 1. Pausa de lectura biológica: 1.2 a 2.8 segundos
  const readingDelayMs = Math.floor(1200 + Math.random() * 1600);

  // 2. Velocidad de tipeo: entre 35ms y 55ms por carácter con variación orgánica (Jitter)
  const msPerChar = 35 + Math.random() * 20;
  let estimatedTypingMs = Math.round(charCount * msPerChar);

  // 3. Pausas micro-cognitivas (el humano piensa entre oraciones)
  const sentencePunctuationCount = (messageText.match(/[.!?\n]/g) || []).length;
  estimatedTypingMs += sentencePunctuationCount * Math.floor(400 + Math.random() * 600);

  // 4. Clampear entre 2 segundos y 14 segundos para Z-API (su API acepta delayTyping entre 0 y 15s)
  const totalTypingSeconds = Math.min(14, Math.max(2, Math.round(estimatedTypingMs / 1000)));

  return {
    delayTypingSeconds: totalTypingSeconds,
    totalDelayMs: readingDelayMs + (totalTypingSeconds * 1000),
    readingDelayMs,
  };
}

/**
 * Pausa asíncrona segura.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Registro en memoria de cuotas de envío en frío (Outbound Rate Limiting)
 * Previene que un usuario dispare más de N mensajes por hora a destinatarios que no hayan iniciado el chat.
 */
const outboundTracker = new Map<string, { count: number; windowStart: number }>();

export function checkOutboundRateLimit(
  organizationId: string,
  maxPerHour: number = 20
): { allowed: boolean; remaining: number; resetInMinutes: number } {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;

  const current = outboundTracker.get(organizationId);

  if (!current || (now - current.windowStart) > ONE_HOUR) {
    outboundTracker.set(organizationId, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: maxPerHour - 1,
      resetInMinutes: 60,
    };
  }

  if (current.count >= maxPerHour) {
    const remainingMs = ONE_HOUR - (now - current.windowStart);
    return {
      allowed: false,
      remaining: 0,
      resetInMinutes: Math.ceil(remainingMs / 60000),
    };
  }

  current.count += 1;
  const remainingMs = ONE_HOUR - (now - current.windowStart);
  return {
    allowed: true,
    remaining: maxPerHour - current.count,
    resetInMinutes: Math.ceil(remainingMs / 60000),
  };
}

