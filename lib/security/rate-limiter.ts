import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

let redis: Redis | null = null;
const limitersCache = new Map<number, Ratelimit>();

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  } catch (error) {
    console.warn('[RATE LIMITER] No se pudo inicializar Upstash Redis. Usando almacenamiento en memoria local.', error);
  }
}

function getRedisLimiter(maxRequests: number): Ratelimit | null {
  if (!redis) return null;
  let limiter = limitersCache.get(maxRequests);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(maxRequests, '60 s'),
      analytics: true,
      prefix: `synqo_ratelimit_${maxRequests}`,
    });
    limitersCache.set(maxRequests, limiter);
  }
  return limiter;
}

// In-memory fallback para entornos sin Redis configurado o pruebas locales
const memoryStore = new Map<string, { count: number; resetTime: number }>();

export async function checkRateLimit(
  identifier: string,
  maxRequests: number = 15
): Promise<{ success: boolean; remaining: number }> {
  // 1. Usar Upstash Redis distribuido si está configurado (apto para Serverless / Vercel Lambdas)
  const dynamicLimiter = getRedisLimiter(maxRequests);
  if (dynamicLimiter) {
    try {
      const result = await dynamicLimiter.limit(identifier);
      return { success: result.success, remaining: result.remaining };
    } catch (e) {
      console.warn('[RATE LIMITER WARNING] Error consultando Redis, aplicando fallback en memoria:', e);
    }
  }

  // 2. Fallback de memoria por ventana deslizante de 60 segundos
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

