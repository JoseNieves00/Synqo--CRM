-- ==============================================================================
-- Migración Fase B: Soporte de organization_id en messages y publicación Realtime
-- ==============================================================================

-- 1. Agregar organization_id a tabla messages para suscripciones Realtime con filtro por org
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- 2. Backfill de organization_id existente desde contacts
UPDATE messages m
SET organization_id = c.organization_id
FROM contacts c
WHERE m.contact_id = c.id
  AND m.organization_id IS NULL;

-- 3. Trigger BEFORE INSERT para asegurar que cada mensaje nuevo herede organization_id
CREATE OR REPLACE FUNCTION fill_message_organization_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM contacts
    WHERE id = NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fill_message_organization_id ON messages;
CREATE TRIGGER trg_fill_message_organization_id
  BEFORE INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION fill_message_organization_id();

-- 4. Índices de aceleración para filtrado por org y paginación
CREATE INDEX IF NOT EXISTS idx_messages_org_created 
  ON messages(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_contact_created 
  ON messages(contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contacts_org_last_interaction 
  ON contacts(organization_id, last_interaction_at DESC) 
  WHERE deleted_at IS NULL;

-- 5. Publicación Realtime con REPLICA IDENTITY FULL
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE contacts REPLICA IDENTITY FULL;
