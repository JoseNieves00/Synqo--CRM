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

