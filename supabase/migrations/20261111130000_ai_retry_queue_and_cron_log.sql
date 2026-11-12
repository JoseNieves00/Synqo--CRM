-- ==============================================================================
-- Migración: Reintentos diferidos de IA (dead-letter) + Log de salud de crons
-- ==============================================================================
-- 1) ai_retry_queue: todo run de IA que falla (generación o despacho) entra a esta
--    cola y el cron de reactivación reintenta (máx. 2) antes de escalar al asesor.
-- 2) cron_job_log: registro de cada invocación/omisión de cron para que la salud
--    del recontacto autónomo sea observable (antes, secretos de Vault faltantes
--    se omitían con RAISE NOTICE silencioso).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS ai_retry_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  -- 'regenerate': re-ejecutar el worker de IA (fallo de generación).
  -- 'resend': re-enviar la respuesta ya generada (fallo de despacho).
  strategy TEXT NOT NULL CHECK (strategy IN ('regenerate', 'resend')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts SMALLINT NOT NULL DEFAULT 0,
  max_attempts SMALLINT NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'failed')),
  last_error TEXT,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_retry_queue_due
  ON ai_retry_queue (status, next_retry_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ai_retry_queue_org
  ON ai_retry_queue (organization_id, status, created_at DESC);

ALTER TABLE ai_retry_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_retry_queue_org_isolation" ON ai_retry_queue
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true
    )
  );

-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cron_job_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  -- 'invoked': HTTP disparado (app). 'skipped_missing_secrets': Vault sin config.
  -- 'error': excepción dentro del endpoint.
  status TEXT NOT NULL CHECK (status IN ('invoked', 'skipped_missing_secrets', 'error')),
  detail TEXT,
  request_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cron_job_log_recent
  ON cron_job_log (job_name, created_at DESC);

ALTER TABLE cron_job_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cron_job_log_superadmin_read" ON cron_job_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true
    )
  );

-- ------------------------------------------------------------------------------
-- Actualiza synqo_invoke_cron para que la OMISIÓN por secretos faltantes quede
-- registrada en cron_job_log (antes solo RAISE NOTICE, invisible en producción).
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.synqo_invoke_cron(p_path TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
  v_request_id BIGINT;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'synqo_app_url' LIMIT 1;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'synqo_cron_secret' LIMIT 1;

  IF v_url IS NULL OR v_secret IS NULL THEN
    INSERT INTO public.cron_job_log (job_name, status, detail)
    VALUES (
      split_part(p_path, '/', 4),
      'skipped_missing_secrets',
      'Vault secrets synqo_app_url / synqo_cron_secret no configurados; el cron no se ejecutó'
    );
    RAISE NOTICE '[synqo_invoke_cron] Vault secrets synqo_app_url / synqo_cron_secret no configurados; se omite %', p_path;
    RETURN NULL;
  END IF;

  SELECT net.http_get(
    url := rtrim(v_url, '/') || p_path,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 60000
  ) INTO v_request_id;

  INSERT INTO public.cron_job_log (job_name, status, request_id)
  VALUES (split_part(p_path, '/', 4), 'invoked', v_request_id);

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.synqo_invoke_cron(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.synqo_invoke_cron(TEXT) FROM anon, authenticated;
