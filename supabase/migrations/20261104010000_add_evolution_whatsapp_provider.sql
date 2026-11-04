-- ==============================================================================
-- SYNQO CRM - Evolution API v2 Integration (Self-Hosted VPS WhatsApp Engine)
-- Adds provider selection for 'evolution', encrypted credentials, session tracking,
-- anti-ban cadence settings, and performance indexes.
-- ==============================================================================

-- 1. Campos para soporte de Evolution API v2 en VPS
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS evolution_api_url TEXT,
ADD COLUMN IF NOT EXISTS evolution_api_key TEXT,           -- Cifrado con AES-256-GCM
ADD COLUMN IF NOT EXISTS evolution_instance_name TEXT,
ADD COLUMN IF NOT EXISTS evolution_status TEXT DEFAULT 'disconnected' CHECK (evolution_status IN ('connected', 'disconnected', 'connecting')),
ADD COLUMN IF NOT EXISTS evolution_phone_connected TEXT,
ADD COLUMN IF NOT EXISTS evolution_last_heartbeat TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS evolution_anti_ban_mode BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS evolution_max_outbound_per_hour INTEGER DEFAULT 20;

-- 2. Actualizar la restricción check de whatsapp_provider para permitir 'evolution'
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_whatsapp_provider_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_whatsapp_provider_check 
  CHECK (whatsapp_provider IN ('meta', 'zapi', 'evolution'));

-- 3. Índices de rendimiento para enrutamiento ultra-rápido de Webhooks de Evolution API
CREATE INDEX IF NOT EXISTS idx_org_evolution_instance_name ON organizations(evolution_instance_name);

-- 4. Índice único parcial para evitar duplicación de nombres de instancia entre organizaciones
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_evolution_instance_name 
ON organizations(evolution_instance_name) 
WHERE evolution_instance_name IS NOT NULL;

