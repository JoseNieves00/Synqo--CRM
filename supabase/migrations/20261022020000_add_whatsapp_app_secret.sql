-- SYNQO CRM - Multi-tenant WhatsApp App Secret Migration
-- Permite que cada empresa gestione su propio Meta App Secret de forma independiente

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS whatsapp_app_secret TEXT;

COMMENT ON COLUMN organizations.whatsapp_app_secret IS 'Meta App Secret de la aplicacion del cliente cifrado con AES-256-GCM para verificacion criptografica HMAC';

