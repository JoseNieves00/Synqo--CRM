-- ==============================================================================
-- SYNQO CRM - Plan Type Alignment (Starter / Core)
-- Permite 'starter' como valor oficial y mantiene 'core' por retrocompatibilidad
-- ==============================================================================

-- 1. Modificar restricción CHECK para admitir 'starter'
ALTER TABLE organizations 
DROP CONSTRAINT IF EXISTS organizations_plan_type_check;

ALTER TABLE organizations 
ADD CONSTRAINT organizations_plan_type_check 
CHECK (plan_type IN ('starter', 'core', 'pro', 'enterprise'));

-- 2. Migrar organizaciones existentes con valor 'core' a 'starter'
UPDATE organizations 
SET plan_type = 'starter' 
WHERE plan_type = 'core';

-- 3. Establecer 'starter' como valor por defecto de columna
ALTER TABLE organizations 
ALTER COLUMN plan_type SET DEFAULT 'starter';

-- 4. Sincronizar cuota de tokens base a 500,000 (según MANUAL_SUPERADMIN.md)
UPDATE organizations 
SET ai_tokens_limit = 500000 
WHERE plan_type = 'starter' AND (ai_tokens_limit IS NULL OR ai_tokens_limit <= 100000);
