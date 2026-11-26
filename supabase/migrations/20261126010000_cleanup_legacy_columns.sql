-- Depuración segura de columnas legacy en organizations que ya no usa el código:
-- Cal.com (reemplazado por Calendario Nativo + Google Calendar),
-- Stripe (cobros gestionados en COP desde ERP),
-- ai_tokens_openai_backup_limit (cuota unificada).

ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS cal_api_key,
  DROP COLUMN IF EXISTS cal_event_type_id,
  DROP COLUMN IF EXISTS cal_com_enabled,
  DROP COLUMN IF EXISTS stripe_customer_id,
  DROP COLUMN IF EXISTS ai_tokens_openai_backup_limit;
