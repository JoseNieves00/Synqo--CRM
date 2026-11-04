-- ==============================================================================
-- SYNQO CRM - Dual WhatsApp Engine (Meta Cloud API & Z-API Express QR)
-- Adds provider selection, encrypted Z-API credentials, session tracking and anti-ban settings
-- ==============================================================================

-- 1. Campos para soporte dual de proveedores de WhatsApp y sesión Z-API
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS whatsapp_provider TEXT DEFAULT 'meta' CHECK (whatsapp_provider IN ('meta', 'zapi')),
ADD COLUMN IF NOT EXISTS zapi_instance_id TEXT,
ADD COLUMN IF NOT EXISTS zapi_token TEXT,              -- Cifrado con AES-256-GCM
ADD COLUMN IF NOT EXISTS zapi_client_token TEXT,       -- Cifrado con AES-256-GCM
ADD COLUMN IF NOT EXISTS zapi_status TEXT DEFAULT 'disconnected' CHECK (zapi_status IN ('connected', 'disconnected', 'connecting')),
ADD COLUMN IF NOT EXISTS zapi_phone_connected TEXT,
ADD COLUMN IF NOT EXISTS zapi_last_heartbeat TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS zapi_anti_ban_mode BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS zapi_max_outbound_per_hour INTEGER DEFAULT 20;

-- 2. Índices de Rendimiento para Enrutamiento Rápido de Webhooks de Z-API
CREATE INDEX IF NOT EXISTS idx_org_whatsapp_provider ON organizations(whatsapp_provider);
CREATE INDEX IF NOT EXISTS idx_org_zapi_instance_id ON organizations(zapi_instance_id);

-- 3. Índice único parcial para evitar duplicación de instancias activas de Z-API entre organizaciones
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_zapi_instance_id 
ON organizations(zapi_instance_id) 
WHERE zapi_instance_id IS NOT NULL;

