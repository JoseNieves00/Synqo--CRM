-- Tabla ligera para sincronizar cotizaciones pendientes de nuevas empresas entre PC y PWA móvil
-- Incluye expires_at para depuración automática (TTL 15 días) y admin_email único para evitar duplicados.

CREATE TABLE IF NOT EXISTS public.erp_pending_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email text NOT NULL UNIQUE,
  company_name text NOT NULL,
  admin_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  business_model text NOT NULL DEFAULT 'products',
  max_users integer NOT NULL DEFAULT 2,
  ai_tokens_limit bigint NOT NULL DEFAULT 5000000,
  monthly_base_cop integer NOT NULL DEFAULT 169000,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_pending_quotes_expires_at
  ON public.erp_pending_quotes (expires_at);

ALTER TABLE public.erp_pending_quotes ENABLE ROW LEVEL SECURITY;
