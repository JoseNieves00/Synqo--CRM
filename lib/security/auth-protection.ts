import { Redis } from '@upstash/redis';

let redis: Redis | null = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  } catch {
    redis = null;
  }
}

// Configuración de Seguridad Empresarial
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutos de bloqueo tras 5 intentos fallidos
export const FAILED_ATTEMPTS_WINDOW_MS = 15 * 60 * 1000; // 15 minutos

// Configuración de Expiración de Sesión
export const SESSION_INACTIVITY_LIMIT_MS = 8 * 60 * 60 * 1000; // 8 horas de inactividad máxima
export const SESSION_MAX_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24 horas de duración absoluta máxima
export const COOKIE_SESSION_CREATED_AT = 'synqo_session_created_at';
export const COOKIE_SESSION_LAST_ACTIVE = 'synqo_session_last_active';

// Almacén en memoria fallback
interface AttemptRecord {
  count: number;
  resetAt: number;
}
interface LockoutRecord {
  lockedUntil: number;
}

const memoryAttempts = new Map<string, AttemptRecord>();
const memoryLockouts = new Map<string, LockoutRecord>();

/**
 * Normaliza la clave del correo electrónico para tracking
 */
function getEmailKey(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Verifica si una cuenta está actualmente bloqueada por exceso de intentos fallidos.
 */
export async function checkAccountLockout(
  email: string
): Promise<{ locked: boolean; minutesRemaining?: number }> {
  const key = getEmailKey(email);
  const now = Date.now();

  // 1. Verificar en Redis si está disponible
  if (redis) {
    try {
      const lockUntil = await redis.get<number>(`synqo:lockout:${key}`);
      if (lockUntil && lockUntil > now) {
        const minutes = Math.max(1, Math.ceil((lockUntil - now) / 60000));
        return { locked: true, minutesRemaining: minutes };
      }
    } catch (err) {
      console.warn('[AUTH PROTECTION] Redis error en checkAccountLockout, usando memoria:', err);
    }
  }

  // 2. Fallback en memoria
  const lock = memoryLockouts.get(key);
  if (lock) {
    if (lock.lockedUntil > now) {
      const minutes = Math.max(1, Math.ceil((lock.lockedUntil - now) / 60000));
      return { locked: true, minutesRemaining: minutes };
    } else {
      memoryLockouts.delete(key);
    }
  }

  return { locked: false };
}

/**
 * Registra un intento fallido de contraseña.
 * Si alcanza el límite (5), bloquea la cuenta automáticamente por 15 minutos.
 */
export async function recordFailedLogin(
  email: string
): Promise<{ locked: boolean; remainingAttempts: number; minutesRemaining?: number }> {
  const key = getEmailKey(email);
  const now = Date.now();

  // 1. Intentar con Redis
  if (redis) {
    try {
      const currentAttempts = (await redis.incr(`synqo:failed:${key}`)) || 1;
      if (currentAttempts === 1) {
        await redis.expire(`synqo:failed:${key}`, 900); // 15 minutos TTL
      }

      if (currentAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        const lockUntil = now + LOCKOUT_DURATION_MS;
        await redis.set(`synqo:lockout:${key}`, lockUntil, { ex: 900 });
        await redis.del(`synqo:failed:${key}`);
        return { locked: true, remainingAttempts: 0, minutesRemaining: 15 };
      }

      return {
        locked: false,
        remainingAttempts: MAX_FAILED_LOGIN_ATTEMPTS - currentAttempts,
      };
    } catch (err) {
      console.warn('[AUTH PROTECTION] Redis error en recordFailedLogin, usando memoria:', err);
    }
  }

  // 2. Fallback en memoria
  let record = memoryAttempts.get(key);
  if (!record || now > record.resetAt) {
    record = { count: 1, resetAt: now + FAILED_ATTEMPTS_WINDOW_MS };
    memoryAttempts.set(key, record);
    return { locked: false, remainingAttempts: MAX_FAILED_LOGIN_ATTEMPTS - 1 };
  }

  record.count += 1;

  if (record.count >= MAX_FAILED_LOGIN_ATTEMPTS) {
    memoryLockouts.set(key, { lockedUntil: now + LOCKOUT_DURATION_MS });
    memoryAttempts.delete(key);
    return { locked: true, remainingAttempts: 0, minutesRemaining: 15 };
  }

  return {
    locked: false,
    remainingAttempts: MAX_FAILED_LOGIN_ATTEMPTS - record.count,
  };
}

/**
 * Limpia el contador de intentos fallidos tras un login exitoso.
 */
export async function recordSuccessfulLogin(email: string): Promise<void> {
  const key = getEmailKey(email);

  if (redis) {
    try {
      await redis.del(`synqo:failed:${key}`, `synqo:lockout:${key}`);
    } catch {}
  }

  memoryAttempts.delete(key);
  memoryLockouts.delete(key);
}

