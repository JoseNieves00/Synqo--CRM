-- Migración: Soporte Multicanal (Instagram Direct) y Ajustes de Google Calendar Sync
-- Fecha: 2026-10-29

-- 1. Añadir canal e identificadores de Instagram a contacts
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS instagram_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS instagram_username VARCHAR(100);

-- Índice para búsquedas rápidas por instagram_id dentro de la organización
CREATE INDEX IF NOT EXISTS idx_contacts_org_instagram_id ON contacts (organization_id, instagram_id);

-- 2. Añadir canal a messages
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'whatsapp';

-- 3. Añadir credenciales de Instagram y preferencias de Google Calendar a organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS instagram_account_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS instagram_access_token TEXT,
  ADD COLUMN IF NOT EXISTS instagram_app_secret TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_sync_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS google_calendar_block_busy BOOLEAN DEFAULT FALSE;

