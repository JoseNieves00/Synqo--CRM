-- ==============================================================================
-- Migración: Ventana 24h real, aislamiento multi-tenant de recordatorios y
--            columnas de score de propensión de compra.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. contacts.last_lead_message_at → ancla correcta de la ventana de 24h de Meta
--    (last_interaction_at también se mueve con mensajes salientes de IA/asesor)
-- ------------------------------------------------------------------------------
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_lead_message_at TIMESTAMPTZ;

UPDATE contacts c
SET last_lead_message_at = sub.last_at
FROM (
  SELECT contact_id, MAX(created_at) AS last_at
  FROM messages
  WHERE sender_type = 'lead'
  GROUP BY contact_id
) sub
WHERE sub.contact_id = c.id
  AND c.last_lead_message_at IS NULL;

-- Respaldo desde custom_fields para contactos sin mensajes históricos
UPDATE contacts
SET last_lead_message_at = (custom_fields->>'last_lead_message_at')::timestamptz
WHERE last_lead_message_at IS NULL
  AND custom_fields ? 'last_lead_message_at'
  AND (custom_fields->>'last_lead_message_at') ~ '^\d{4}-\d{2}-\d{2}';

-- Trigger de inbox: mantiene last_lead_message_at cuando el lead escribe
CREATE OR REPLACE FUNCTION sync_contact_inbox_state()
RETURNS TRIGGER AS $$
DECLARE
  msg_preview TEXT;
BEGIN
  msg_preview := LEFT(NEW.content, 160);

  IF NEW.sender_type = 'lead' THEN
    UPDATE contacts
    SET
      conversation_status = 'open',
      waiting_since = COALESCE(waiting_since, NEW.created_at, NOW()),
      unread_count = COALESCE(unread_count, 0) + 1,
      last_message_preview = msg_preview,
      last_message_sender = 'lead',
      last_interaction_at = NEW.created_at,
      last_lead_message_at = GREATEST(COALESCE(last_lead_message_at, NEW.created_at), NEW.created_at),
      updated_at = NOW()
    WHERE id = NEW.contact_id;

  ELSIF NEW.sender_type IN ('agent_manual', 'ai') THEN
    UPDATE contacts
    SET
      waiting_since = NULL,
      conversation_status = CASE
        WHEN conversation_status = 'closed' THEN 'closed'
        ELSE 'waiting_customer'
      END,
      last_message_preview = msg_preview,
      last_message_sender = NEW.sender_type,
      last_interaction_at = NEW.created_at,
      updated_at = NOW(),
      custom_fields = CASE
        WHEN custom_fields->'active_reminder'->>'reminderType' = 'reactivation' THEN
          custom_fields - 'active_reminder'
        ELSE custom_fields
      END
    WHERE id = NEW.contact_id;

    UPDATE scheduled_reminders
    SET status = 'cancelled'
    WHERE contact_id = NEW.contact_id
      AND reminder_type = 'reactivation'
      AND status = 'pending';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 2. scheduled_reminders.organization_id (auto-poblado desde contacts)
-- ------------------------------------------------------------------------------
ALTER TABLE scheduled_reminders
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE scheduled_reminders r
SET organization_id = c.organization_id
FROM contacts c
WHERE c.id = r.contact_id
  AND r.organization_id IS NULL;

CREATE OR REPLACE FUNCTION set_scheduled_reminder_org()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id FROM contacts WHERE id = NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_scheduled_reminder_org ON scheduled_reminders;
CREATE TRIGGER trg_set_scheduled_reminder_org
  BEFORE INSERT ON scheduled_reminders
  FOR EACH ROW
  EXECUTE FUNCTION set_scheduled_reminder_org();

CREATE INDEX IF NOT EXISTS idx_reminders_org_due
  ON scheduled_reminders(organization_id, status, reminder_type, scheduled_for);

-- ------------------------------------------------------------------------------
-- 3. Score de propensión de compra + temperatura como columna indexada
-- ------------------------------------------------------------------------------
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_score SMALLINT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_score_updated_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_temperature TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_score_breakdown JSONB;

DO $$
BEGIN
  ALTER TABLE contacts ADD CONSTRAINT contacts_lead_score_range CHECK (lead_score IS NULL OR (lead_score BETWEEN 0 AND 100));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Mantener lead_temperature sincronizada desde custom_fields (fuente actual de verdad
-- escrita por IA, clasificador y edición humana) sin tocar cada escritor.
CREATE OR REPLACE FUNCTION sync_contact_lead_temperature()
RETURNS TRIGGER AS $$
DECLARE
  v_temp TEXT;
BEGIN
  v_temp := COALESCE(NEW.custom_fields->>'lead_temperature', NEW.custom_fields->>'temperature');
  IF v_temp IN ('hot', 'qualified_doubt', 'warm', 'cold') THEN
    NEW.lead_temperature := v_temp;
  ELSE
    NEW.lead_temperature := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_contact_lead_temperature ON contacts;
CREATE TRIGGER trg_sync_contact_lead_temperature
  BEFORE INSERT OR UPDATE OF custom_fields ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION sync_contact_lead_temperature();

-- Backfill (dispara el trigger de temperatura)
UPDATE contacts
SET custom_fields = custom_fields
WHERE lead_temperature IS DISTINCT FROM (
  CASE
    WHEN COALESCE(custom_fields->>'lead_temperature', custom_fields->>'temperature') IN ('hot', 'qualified_doubt', 'warm', 'cold')
      THEN COALESCE(custom_fields->>'lead_temperature', custom_fields->>'temperature')
    ELSE NULL
  END
);

CREATE INDEX IF NOT EXISTS idx_contacts_org_lead_score
  ON contacts(organization_id, lead_score DESC NULLS LAST)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_org_lead_temperature
  ON contacts(organization_id, lead_temperature)
  WHERE deleted_at IS NULL;
