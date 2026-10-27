import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

let ratelimit: Ratelimit | null = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    // Límite: Máximo 15 mensajes por minuto por remitente
    ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(15, '60 s'),
      analytics: true,
      prefix: 'synqo_ratelimit',
    });
  } catch (error) {
    console.warn('[RATE LIMITER] No se pudo inicializar Upstash Redis. Usando almacenamiento en memoria local.', error);
  }
}

// In-memory fallback para entornos sin Redis configurado o límites personalizados por acción
const memoryStore = new Map<string, { count: number; resetTime: number }>();

export async function checkRateLimit(
  identifier: string,
  maxRequests: number = 15
): Promise<{ success: boolean; remaining: number }> {
  // Si se solicita un límite diferente a 15 (ej. 5 para login anti-fuerza bruta), usar memoryStore para exactitud
  if (ratelimit && maxRequests === 15) {
    try {
      const result = await ratelimit.limit(identifier);
      return { success: result.success, remaining: result.remaining };
    } catch (e) {
      console.warn('[RATE LIMITER WARNING] Error consultando Redis, aplicando fallback en memoria:', e);
    }
  }

  // Fallback de memoria por ventana deslizante de 60 segundos
  const now = Date.now();
  const record = memoryStore.get(identifier);

  if (!record || now > record.resetTime) {
    memoryStore.set(identifier, { count: 1, resetTime: now + 60000 });
    return { success: true, remaining: maxRequests - 1 };
  }

  if (record.count >= maxRequests) {
    return { success: false, remaining: 0 };
  }

  record.count += 1;
  return { success: true, remaining: Math.max(0, maxRequests - record.count) };
}

