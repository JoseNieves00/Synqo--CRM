-- ==============================================================================
-- SYNQO CRM - Dual AI Engine Token Tracking & OpenAI Backup Quotas
-- Adds ai_tokens_google_used, ai_tokens_openai_used, and ai_tokens_openai_backup_limit
-- ==============================================================================

-- 1. Campos para trazabilidad dual de motores de Inteligencia Artificial
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS ai_tokens_google_used BIGINT DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS ai_tokens_openai_used BIGINT DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS ai_tokens_openai_backup_limit BIGINT DEFAULT 25000 NOT NULL;

-- 2. Backfill seguro: sincronizar consumo histórico con Google Gemini (motor primario)
UPDATE organizations
SET ai_tokens_google_used = ai_tokens_used
WHERE ai_tokens_google_used = 0 AND ai_tokens_used > 0;

-- 3. Asignación inicial de cuotas de emergencia según plan comercial
UPDATE organizations
SET ai_tokens_openai_backup_limit = CASE
  WHEN plan_type = 'enterprise' THEN 150000
  WHEN plan_type = 'pro' THEN 75000
  ELSE 25000
END;

