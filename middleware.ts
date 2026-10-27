import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Tiempos de expiración de sesión
const SESSION_INACTIVITY_LIMIT_MS = 8 * 60 * 60 * 1000; // 8 horas de inactividad máxima
const ADMIN_INACTIVITY_LIMIT_MS = 4 * 60 * 60 * 1000; // 4 horas para zona sensible Super Admin
const SESSION_MAX_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24 horas de duración máxima absoluta
const COOKIE_SESSION_CREATED_AT = 'synqo_session_created_at';
const COOKIE_SESSION_LAST_ACTIVE = 'synqo_session_last_active';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Inyección de Headers de Seguridad HTTP Estrictos
  const applySecurityHeaders = (res: NextResponse) => {
    res.headers.set('X-Frame-Options', 'DENY');
    res.headers.set('X-Content-Type-Options', 'nosniff');
    res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.headers.set('X-XSS-Protection', '1; mode=block');
  };

  applySecurityHeaders(response);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Si aún no están configuradas las variables, permitir acceso en modo dev
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) {
    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({
            request,
          });
          applySecurityHeaders(response);
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Rutas protegidas que requieren sesión activa
  const isProtectedPath =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/inbox') ||
    pathname.startsWith('/pipeline') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/admin');

  // Si no está autenticado y visita ruta protegida -> Redirigir a /login
  if (!user && isProtectedPath) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    const redirectRes = NextResponse.redirect(redirectUrl);
    applySecurityHeaders(redirectRes);
    return redirectRes;
  }

  // Si está autenticado y visita ruta protegida -> Verificar Ciclo de Vida y Expiración
  if (user && isProtectedPath) {
    const now = Date.now();
    const createdAtStr = request.cookies.get(COOKIE_SESSION_CREATED_AT)?.value;
    const lastActiveStr = request.cookies.get(COOKIE_SESSION_LAST_ACTIVE)?.value;

    let expirationReason: 'expired' | 'inactivity' | null = null;

    // 1. Verificar duración absoluta máxima (24 horas)
    if (createdAtStr) {
      const createdTime = parseInt(createdAtStr, 10);
      if (!isNaN(createdTime) && now - createdTime > SESSION_MAX_LIFETIME_MS) {
        expirationReason = 'expired';
      }
    }

    // 2. Verificar inactividad (4h para /admin, 8h para resto)
    if (!expirationReason && lastActiveStr) {
      const lastActiveTime = parseInt(lastActiveStr, 10);
      const inactivityLimit = pathname.startsWith('/admin')
        ? ADMIN_INACTIVITY_LIMIT_MS
        : SESSION_INACTIVITY_LIMIT_MS;
      if (!isNaN(lastActiveTime) && now - lastActiveTime > inactivityLimit) {
        expirationReason = 'inactivity';
      }
    }

    // Si expiró la sesión, cerrar y redirigir con notificación al usuario
    if (expirationReason) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/login';
      redirectUrl.searchParams.set('reason', expirationReason);

      const redirectResponse = NextResponse.redirect(redirectUrl);
      applySecurityHeaders(redirectResponse);

      // Eliminar cookies de sesión y de auth
      redirectResponse.cookies.delete(COOKIE_SESSION_CREATED_AT);
      redirectResponse.cookies.delete(COOKIE_SESSION_LAST_ACTIVE);
      request.cookies.getAll().forEach((c) => {
        if (c.name.startsWith('sb-')) {
          redirectResponse.cookies.delete(c.name);
        }
      });

      return redirectResponse;
    }

    // Sesión válida: renovar cookie de actividad reciente
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 24 * 3600,
    };

    response.cookies.set(COOKIE_SESSION_LAST_ACTIVE, now.toString(), cookieOptions);
    if (!createdAtStr) {
      response.cookies.set(COOKIE_SESSION_CREATED_AT, now.toString(), cookieOptions);
    }
  }

  // Si ya está autenticado y visita /login sin motivo de expiración -> Redirigir a /dashboard
  if (user && pathname === '/login' && !request.nextUrl.searchParams.get('reason')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/dashboard';
    const redirectRes = NextResponse.redirect(redirectUrl);
    applySecurityHeaders(redirectRes);
    return redirectRes;
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Coincidir con todas las rutas excepto:
     * - api (webhooks de whatsapp, supabase, cron)
     * - _next/static (archivos estáticos)
     * - _next/image (imágenes optimizadas)
     * - favicon.ico, etc.
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};

