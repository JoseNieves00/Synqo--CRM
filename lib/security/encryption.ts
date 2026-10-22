import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recomendado para AES GCM
const AUTH_TAG_LENGTH = 16; // 128 bits de tag de autenticación

function getMasterKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('FATAL: ENCRYPTION_KEY no está definida en las variables de entorno.');
  }

  // Si la clave viene en hex (64 caracteres)
  if (secret.length === 64) {
    return Buffer.from(secret, 'hex');
  }
  const keyBuffer = Buffer.from(secret, 'utf-8');
  if (keyBuffer.length !== 32) {
    // Si no tiene 32 bytes exactos, derivar clave fija mediante SHA-256
    return crypto.createHash('sha256').update(secret).digest();
  }
  return keyBuffer;
}

/**
 * Cifra un texto en plano usando AES-256-GCM.
 * Formato resultante: "enc:<iv_hex>:<authTag_hex>:<encrypted_hex>"
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  return `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Descifra un texto cifrado con AES-256-GCM generado por encryptSecret.
 */
export function decryptSecret(cipherPayload: string): string {
  if (!cipherPayload) return '';
  if (!cipherPayload.startsWith('enc:')) {
    // Retorno de compatibilidad en caso de datos no migrados
    return cipherPayload;
  }

  const parts = cipherPayload.split(':');
  if (parts.length !== 4) {
    throw new Error('Payload cifrado inválido o corrupto.');
  }

  const [, ivHex, authTagHex, encryptedHex] = parts;
  const key = getMasterKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

