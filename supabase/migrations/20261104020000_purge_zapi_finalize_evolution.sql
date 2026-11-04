-- ==============================================================================
-- SYNQO CRM - Purge Z-API and Finalize Evolution API + Meta Cloud API
-- Migrates any legacy 'zapi' organizations to 'evolution'
-- Restricts whatsapp_provider constraint to ('meta', 'evolution')
-- ==============================================================================

-- 1. Actualizar organizaciones que estuviesen en 'zapi' hacia 'evolution'
UPDATE organizations
SET whatsapp_provider = 'evolution'
WHERE whatsapp_provider = 'zapi';

-- 2. Restringir el constraint a solo 'meta' y 'evolution'
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_whatsapp_provider_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_whatsapp_provider_check 
  CHECK (whatsapp_provider IN ('meta', 'evolution'));

