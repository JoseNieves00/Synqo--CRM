-- ==============================================================================
-- SYNQO CRM - Token Monitoring & Quotas Migration (Phase 3)
-- Adds ai_tokens_used and ai_tokens_limit to organizations
-- ==============================================================================

-- 1. Contador de tokens consumidos acumulados por empresa
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS ai_tokens_used BIGINT DEFAULT 0 NOT NULL;

-- 2. Límite de tokens autorizados según el plan comercial (por defecto 100,000 tokens)
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS ai_tokens_limit BIGINT DEFAULT 100000 NOT NULL;

-- 3. Índice para consultas rápidas de consumo
CREATE INDEX IF NOT EXISTS idx_organizations_token_usage ON organizations(id, ai_tokens_used, ai_tokens_limit);

