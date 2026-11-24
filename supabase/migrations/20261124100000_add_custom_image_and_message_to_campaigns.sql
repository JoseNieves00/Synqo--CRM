-- ==============================================================================
-- Migración: Imagen propia y mensaje personalizado con calificación IA en Campañas
-- ==============================================================================

ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS custom_image_url TEXT,
ADD COLUMN IF NOT EXISTS custom_message TEXT,
ADD COLUMN IF NOT EXISTS dispatch_mode TEXT NOT NULL DEFAULT 'ai';
