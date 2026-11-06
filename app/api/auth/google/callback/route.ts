import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { encryptSecret } from '@/lib/security/encryption';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || url.origin).replace(/\/$/, '');

  if (error) {
    console.error('[GOOGLE OAUTH ERROR]', error);
    return NextResponse.redirect(
      new URL(`/settings?google_error=${encodeURIComponent(error)}#google-calendar`, baseUrl)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/settings?google_error=Faltan+parametros+de+autorizacion#google-calendar', baseUrl)
    );
  }

  try {
    // 1. Validar HMAC y decodificar estado
    const [stateStr, signature] = state.split('.');
    if (!stateStr || !signature) {
      throw new Error('Formato de estado de autenticación inválido.');
    }

    const encKey = process.env.ENCRYPTION_KEY;
    if (!encKey) {
      throw new Error('ENCRYPTION_KEY obligatoria no configurada en el servidor.');
    }

    const expectedSignature = crypto
      .createHmac('sha256', encKey)
      .update(stateStr)
      .digest('hex');

    const expBuf = Buffer.from(expectedSignature, 'utf8');
    const sigBuf = Buffer.from(signature, 'utf8');
    if (expBuf.length !== sigBuf.length || !crypto.timingSafeEqual(expBuf, sigBuf)) {
      throw new Error('Firma de seguridad inválida o manipulada.');
    }

    const payload = JSON.parse(Buffer.from(stateStr, 'base64url').toString('utf8'));
    const { orgId, timestamp } = payload;

    if (!orgId) {
      throw new Error('No se identificó la organización asociada.');
    }

    // Expirar states después de 20 minutos
    if (Date.now() - Number(timestamp) > 20 * 60 * 1000) {
      throw new Error('El intento de vinculación expiró. Por favor intenta de nuevo.');
    }

    // 2. Intercambiar código de autorización por tokens
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${baseUrl}/api/auth/google/callback`;

    if (!clientId || !clientSecret) {
      throw new Error('Credenciales GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET no configuradas en el servidor.');
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.json().catch(() => ({}));
      throw new Error(errBody?.error_description || errBody?.error || `Error ${tokenRes.status} al obtener tokens de Google`);
    }

    const tokens = await tokenRes.json();

    // 3. Obtener el email o ID del calendario primario
    let primaryEmail = 'primary';
    try {
      const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (userinfoRes.ok) {
        const uinfo = await userinfoRes.json();
        if (uinfo.email) primaryEmail = uinfo.email;
      }
    } catch {
      // Fallback a 'primary'
    }

    // 4. Cifrar paquete de tokens con AES-256-GCM
    const tokenBundle = JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + ((tokens.expires_in || 3600) * 1000),
      scope: tokens.scope,
    });

    const encryptedToken = encryptSecret(tokenBundle);

    // 5. Persistir en la base de datos de la organización
    const { error: updateError } = await (supabaseAdmin.from('organizations') as any)
      .update({
        google_calendar_token: encryptedToken,
        google_calendar_id: primaryEmail,
        google_calendar_sync_enabled: true,
        google_calendar_block_busy: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId);

    if (updateError) {
      throw new Error(`Error al persistir integración en base de datos: ${updateError.message}`);
    }

    return NextResponse.redirect(
      new URL('/settings?google=connected#google-calendar', baseUrl)
    );
  } catch (err: any) {
    console.error('[GOOGLE OAUTH CALLBACK ERROR]', err);
    return NextResponse.redirect(
      new URL(`/settings?google_error=${encodeURIComponent(err.message || 'Error vinculando Google Calendar')}#google-calendar`, baseUrl)
    );
  }
}

