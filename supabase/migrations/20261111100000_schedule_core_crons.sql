-- ==============================================================================
-- Migración: Programación real de los crons principales (pg_cron + pg_net + Vault)
-- ==============================================================================
-- Hasta ahora ningún job ejecutaba /api/cron/lead-reactivation, por lo que el
-- recontacto autónomo de la IA no corría. Esta migración programa:
--   * synqo-lead-reactivation     → cada 15 min (recontacto IA + score + auto-clasificación)
--   * synqo-appointment-reminders → cada 15 min (anti no-show + reasignación de handoffs)
--   * synqo-cleanup-storage       → diario 03:00 UTC
--
-- Los jobs leen la URL y el secreto desde Supabase Vault EN CADA EJECUCIÓN, así
-- no queda ningún secreto escrito en el SQL. Configura una sola vez (SQL Editor):
--
--   select vault.create_secret('https://crm.tudominio.com', 'synqo_app_url');
--   select vault.create_secret('<valor de CRON_SECRET>', 'synqo_cron_secret');
--
-- Si los secretos no existen, el job no hace nada (no falla).
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Función que dispara un endpoint cron de la app leyendo la configuración de Vault.
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

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.synqo_invoke_cron(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.synqo_invoke_cron(TEXT) FROM anon, authenticated;

-- Idempotencia: eliminar jobs previos con los mismos nombres
DO $$
DECLARE
  v_job TEXT;
BEGIN
  FOREACH v_job IN ARRAY ARRAY['synqo-lead-reactivation', 'synqo-appointment-reminders', 'synqo-cleanup-storage'] LOOP
    BEGIN
      PERFORM cron.unschedule(v_job);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;

SELECT cron.schedule(
  'synqo-lead-reactivation',
  '*/15 * * * *',
  $$ SELECT public.synqo_invoke_cron('/api/cron/lead-reactivation'); $$
);

SELECT cron.schedule(
  'synqo-appointment-reminders',
  '7-59/15 * * * *',
  $$ SELECT public.synqo_invoke_cron('/api/cron/appointment-reminders'); $$
);

SELECT cron.schedule(
  'synqo-cleanup-storage',
  '0 3 * * *',
  $$ SELECT public.synqo_invoke_cron('/api/cron/cleanup-storage'); $$
);
