import { createClient } from '@supabase/supabase-js';
import { Database } from './types';

/**
 * Cliente con privilegios elevados (SUPABASE_SERVICE_ROLE_KEY).
 * IMPORTANTE: Este cliente se restringe EXCLUSIVAMENTE a webhooks sin sesión de usuario
 * y tareas asíncronas en segundo plano. Nunca debe importarse en componentes de cliente
 * ni exponerse en endpoints accesibles sin verificación de seguridad.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key';

export const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

