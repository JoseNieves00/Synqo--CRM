import crypto from 'node:crypto';

export interface GoogleOAuthStatePayload {
  orgId: string;
  userId?: string;
  nonce: string;
  timestamp: number;
}

export const GOOGLE_OAUTH_NONCE_COOKIE = 'synqo_gcal_oauth_nonce';
const STATE_MAX_AGE_MS = 20 * 60 * 1000;

export function createSignedGoogleOAuthState(params: {
  orgId: string;
  userId: string;
  encKey: string;
  nonce?: string;
  timestamp?: number;
}): { state: string; nonce: string } {
  const nonce = params.nonce || crypto.randomBytes(24).toString('hex');
  const payload: GoogleOAuthStatePayload = {
    orgId: params.orgId,
    userId: params.userId,
    nonce,
    timestamp: params.timestamp ?? Date.now(),
  };
  const stateStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', params.encKey)
    .update(stateStr)
    .digest('hex');

  return { state: `${stateStr}.${signature}`, nonce };
}

export function verifySignedGoogleOAuthState(params: {
  state: string;
  cookieNonce?: string | null;
  encKey: string;
  now?: number;
}): GoogleOAuthStatePayload {
  const [stateStr, signature] = params.state.split('.');
  if (!stateStr || !signature) {
    throw new Error('Formato de estado de autenticación inválido.');
  }

  const expectedSignature = crypto
    .createHmac('sha256', params.encKey)
    .update(stateStr)
    .digest('hex');

  const expBuf = Buffer.from(expectedSignature, 'utf8');
  const sigBuf = Buffer.from(signature, 'utf8');
  if (expBuf.length !== sigBuf.length || !crypto.timingSafeEqual(expBuf, sigBuf)) {
    throw new Error('Firma de seguridad inválida o manipulada.');
  }

  const payload = JSON.parse(
    Buffer.from(stateStr, 'base64url').toString('utf8')
  ) as Partial<GoogleOAuthStatePayload>;

  if (!payload.orgId) {
    throw new Error('No se identificó la organización asociada.');
  }

  const now = params.now ?? Date.now();
  if (now - Number(payload.timestamp) > STATE_MAX_AGE_MS) {
    throw new Error('El intento de vinculación expiró. Por favor intenta de nuevo.');
  }

  if (!payload.nonce || !params.cookieNonce) {
    throw new Error('Sesión OAuth inválida o expirada (nonce ausente).');
  }

  const expectedNonceBuf = Buffer.from(payload.nonce, 'utf8');
  const cookieNonceBuf = Buffer.from(params.cookieNonce, 'utf8');
  if (
    expectedNonceBuf.length !== cookieNonceBuf.length ||
    !crypto.timingSafeEqual(expectedNonceBuf, cookieNonceBuf)
  ) {
    throw new Error('Sesión OAuth no coincide con el navegador solicitante.');
  }

  return payload as GoogleOAuthStatePayload;
}
