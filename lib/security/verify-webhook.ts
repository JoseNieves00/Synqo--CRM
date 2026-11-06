import crypto from 'node:crypto';

/**
 * Valida la firma criptográfica HMAC-SHA256 enviada por Meta en el encabezado X-Hub-Signature-256.
 * Utiliza crypto.timingSafeEqual para prevenir ataques de temporización (timing attacks).
 *
 * @param rawBody - El cuerpo crudo de la petición como string o Buffer intacto.
 * @param signatureHeader - El valor del encabezado 'X-Hub-Signature-256' de Meta ('sha256=<hash>').
 * @param appSecret - El App Secret de la aplicación en Meta Developers (META_APP_SECRET).
 * @returns boolean indicando si la firma es auténtica e inalterada.
 */
export function verifyMetaSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader || !appSecret) {
    return false;
  }

  // El formato esperado es 'sha256=<64_hex_chars>'
  const prefix = 'sha256=';
  if (!signatureHeader.startsWith(prefix)) {
    return false;
  }

  const receivedHash = signatureHeader.slice(prefix.length).trim();

  // SHA-256 en formato hexadecimal debe tener exactamente 64 caracteres
  if (receivedHash.length !== 64) {
    return false;
  }

  try {
    const hmac = crypto.createHmac('sha256', appSecret);
    hmac.update(rawBody);
    const expectedHash = hmac.digest('hex');

    const expectedBuffer = Buffer.from(expectedHash, 'utf8');
    const receivedBuffer = Buffer.from(receivedHash, 'utf8');

    // timingSafeEqual requiere que ambos buffers tengan la misma longitud
    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch (error) {
    console.error('[SECURITY ERROR] Error durante la verificación HMAC-SHA256 de Meta:', error);
    return false;
  }
}

/**
 * Genera un secreto HMAC-SHA256 determinista para autenticar webhooks de Evolution API de una instancia.
 */
export function generateEvolutionWebhookSecret(instanceName: string): string {
  const masterKey = process.env.ENCRYPTION_KEY;
  if (!masterKey) {
    throw new Error('Variable de entorno ENCRYPTION_KEY obligatoria no configurada en el servidor.');
  }
  return crypto.createHmac('sha256', masterKey).update(instanceName.trim()).digest('hex').slice(0, 32);
}

/**
 * Valida si el secreto, token Bearer o apikey coincide con las credenciales de la instancia Evolution API.
 */
export function verifyEvolutionWebhook(params: {
  instanceName: string;
  providedSecret?: string | null;
  providedApiKey?: string | null;
  decryptedApiKey?: string | null;
}): boolean {
  const { instanceName, providedSecret, providedApiKey, decryptedApiKey } = params;

  // 1. Validar por secreto HMAC en query string o header Bearer
  if (providedSecret && providedSecret.trim()) {
    const cleanSecret = providedSecret.trim().replace(/^Bearer\s+/i, '');
    const expectedSecret = generateEvolutionWebhookSecret(instanceName);
    const expectedBuf = Buffer.from(expectedSecret, 'utf8');
    const providedBuf = Buffer.from(cleanSecret, 'utf8');
    if (expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf)) {
      return true;
    }
  }

  // 2. Validar por API Key en header apikey o Authorization
  if (providedApiKey && providedApiKey.trim()) {
    const cleanProvided = providedApiKey.trim().replace(/^Bearer\s+/i, '');
    
    if (decryptedApiKey && decryptedApiKey.trim()) {
      const expBuf = Buffer.from(decryptedApiKey.trim(), 'utf8');
      const provBuf = Buffer.from(cleanProvided, 'utf8');
      if (expBuf.length === provBuf.length && crypto.timingSafeEqual(expBuf, provBuf)) {
        return true;
      }
    }

    const envKey = process.env.EVOLUTION_API_KEY;
    if (envKey && envKey.trim()) {
      const expBuf = Buffer.from(envKey.trim(), 'utf8');
      const provBuf = Buffer.from(cleanProvided, 'utf8');
      if (expBuf.length === provBuf.length && crypto.timingSafeEqual(expBuf, provBuf)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Valida que una URL multimedia (audio/imagen/documento) provenga de un host seguro y autorizado
 * Bloquea Server-Side Request Forgery (SSRF) hacia IPs internas o servicios de metadatos de nube.
 */
export function isValidMediaUrl(urlString?: string | null): boolean {
  if (!urlString || typeof urlString !== 'string') return false;
  try {
    const parsed = new URL(urlString.trim());
    if (parsed.protocol !== 'https:') return false;

    const hostname = parsed.hostname.toLowerCase();

    // Bloquear localhost, loopbacks e IPs privadas
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '169.254.169.254' ||
      /^127\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return false;
    }

    // Permitir exclusivamente dominios autorizados de Z-API y WhatsApp/Meta
    const allowedSuffixes = [
      'z-api.io',
      'whatsapp.net',
      'fbcdn.net',
      'fbsbx.com',
    ];

    return allowedSuffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

/**
 * Valida que una URL de Evolution API sea segura (HTTPS en producción, sin IPs privadas ni metadatos de nube).
 * Previene ataques de SSRF al VPS o infraestructura interna.
 */
export function isValidEvolutionApiUrl(urlString?: string | null): boolean {
  if (!urlString || typeof urlString !== 'string') return false;
  try {
    const parsed = new URL(urlString.trim());
    const isProd = process.env.NODE_ENV === 'production';

    // En producción, exigir HTTPS estricto
    if (isProd && parsed.protocol !== 'https:') {
      return false;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Bloquear metadatos de nube, loopback e IPs privadas en cualquier entorno
    if (
      hostname === '169.254.169.254' ||
      hostname.startsWith('169.254.') ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
      hostname === '::1' ||
      hostname === '0.0.0.0'
    ) {
      return false;
    }

    // En producción, bloquear localhost y loopback
    if (isProd) {
      if (
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        /^127\./.test(hostname)
      ) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}


