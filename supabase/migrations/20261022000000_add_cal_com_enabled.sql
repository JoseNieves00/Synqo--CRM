-- ==============================================================================
-- SYNQO CRM - Feature Flags / Cal.com Module Activation
-- Allows Super Admin to activate or deactivate Cal.com per organization
-- ==============================================================================

ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS cal_com_enabled BOOLEAN DEFAULT FALSE;

-- Marcar como habilitada si ya contaba previamente con cal_api_key configurada
UPDATE organizations
SET cal_com_enabled = TRUE
WHERE cal_api_key IS NOT NULL AND cal_com_enabled IS FALSE;

