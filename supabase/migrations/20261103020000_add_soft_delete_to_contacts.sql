-- Migración: Soporte para Papelera de Reciclaje y Borrado Lógico (Soft Delete) en Contactos
-- Permite la recuperación de leads eliminados por error humano dentro de los 30 días posteriores.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Índice para optimizar consultas de leads activos excluyendo la papelera
CREATE INDEX IF NOT EXISTS idx_contacts_org_deleted_at ON contacts(organization_id, deleted_at) WHERE deleted_at IS NULL;

-- Política de RLS o comentario de purga automática
COMMENT ON COLUMN contacts.deleted_at IS 'Marca de tiempo cuando el contacto fue enviado a la papelera. Permite recuperación hasta 30 días antes de la purga definitiva.';

