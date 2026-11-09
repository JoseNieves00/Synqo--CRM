-- ==============================================================================
-- Migración: Reorganización del Inbox (Bandejas por Estado, Métricas del Servidor
-- y Sincronización Automática de Espera / SLA)
-- ==============================================================================

-- 1. Nuevas columnas de estado y control en contacts
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS conversation_status TEXT DEFAULT 'open' CHECK (conversation_status IN ('open', 'waiting_customer', 'snoozed', 'closed')),
  ADD COLUMN IF NOT EXISTS waiting_since TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_message_preview TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_message_sender TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deal_value NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS close_reason TEXT DEFAULT NULL;

-- 2. Índices compuestos para alto desempeño con cientos de miles de contactos
CREATE INDEX IF NOT EXISTS idx_contacts_inbox_status 
  ON contacts(organization_id, conversation_status, assigned_to, waiting_since)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_waiting_since 
  ON contacts(organization_id, waiting_since ASC) 
  WHERE deleted_at IS NULL AND waiting_since IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_inbox_updated 
  ON contacts(organization_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- 3. Función y Trigger sobre messages INSERT para mantener al día el estado de la bandeja a 60 FPS
CREATE OR REPLACE FUNCTION sync_contact_inbox_state()
RETURNS TRIGGER AS $$
DECLARE
  msg_preview TEXT;
BEGIN
  -- Vista previa limpia de hasta 160 caracteres
  msg_preview := LEFT(NEW.content, 160);

  IF NEW.sender_type = 'lead' THEN
    -- El lead escribe:
    -- - Reabrir si estaba cerrado
    -- - Establecer waiting_since si no estaba esperando ya
    -- - Incrementar unread_count
    UPDATE contacts
    SET 
      conversation_status = 'open',
      waiting_since = COALESCE(waiting_since, NEW.created_at, NOW()),
      unread_count = COALESCE(unread_count, 0) + 1,
      last_message_preview = msg_preview,
      last_message_sender = 'lead',
      last_interaction_at = NEW.created_at,
      updated_at = NOW()
    WHERE id = NEW.contact_id;

  ELSIF NEW.sender_type IN ('agent_manual', 'ai') THEN
    -- El asesor o la IA responden:
    -- - Despejar el contador de espera (lead atendido)
    -- - Marcar esperando respuesta del cliente
    -- - Si tenía un recordatorio de reactivación pendiente, limpiarlo automáticamente
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

    -- Completar en tabla scheduled_reminders si existía recordatorio de reactivación
    UPDATE scheduled_reminders
    SET status = 'completed'
    WHERE contact_id = NEW.contact_id 
      AND reminder_type = 'reactivation' 
      AND status = 'pending';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_contact_inbox_state ON messages;
CREATE TRIGGER trg_sync_contact_inbox_state
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION sync_contact_inbox_state();

-- 4. RPC para calcular contadores reales del servidor instantáneamente
CREATE OR REPLACE FUNCTION inbox_counts(p_org_id UUID, p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_por_responder INT := 0;
  v_mis_abiertos INT := 0;
  v_ia_atendiendo INT := 0;
  v_seguimiento INT := 0;
  v_cerrados INT := 0;
BEGIN
  -- Por responder: chats abiertos con espera activa donde la IA está pausada o están asignados a mí
  SELECT COUNT(*) INTO v_por_responder
  FROM contacts
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL
    AND conversation_status = 'open'
    AND (
      waiting_since IS NOT NULL 
      OR unread_count > 0 
      OR (custom_fields->>'unattended_handoff')::boolean = true
    )
    AND (is_ai_active = false OR assigned_to = p_user_id);

  -- Mis abiertos: chats asignados a mí que no están cerrados
  SELECT COUNT(*) INTO v_mis_abiertos
  FROM contacts
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL
    AND assigned_to = p_user_id
    AND conversation_status IN ('open', 'waiting_customer');

  -- IA atendiendo: chats activos monitoreados donde la IA responde
  SELECT COUNT(*) INTO v_ia_atendiendo
  FROM contacts
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL
    AND is_ai_active = true
    AND conversation_status != 'closed';

  -- Seguimiento: recordatorios de hoy, chats snoozed activos o prospectos en silencio (>24h) por reactivar
  SELECT COUNT(*) INTO v_seguimiento
  FROM contacts
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL
    AND conversation_status != 'closed'
    AND (
      (ai_snooze_until IS NOT NULL AND ai_snooze_until > NOW())
      OR (snoozed_until IS NOT NULL AND snoozed_until > NOW())
      OR (
        custom_fields->'active_reminder'->>'scheduledFor' IS NOT NULL 
        AND (custom_fields->'active_reminder'->>'scheduledFor')::timestamptz::date <= CURRENT_DATE
      )
      OR (
        -- Prospectos en frío elegibles para reactivación: silencio entre 24h y 10d, último mensaje fue nuestro
        last_interaction_at <= NOW() - INTERVAL '24 hours'
        AND last_interaction_at >= NOW() - INTERVAL '10 days'
        AND COALESCE(unread_count, 0) = 0
        AND waiting_since IS NULL
        AND last_message_sender IN ('ai', 'agent_manual', 'agent')
        AND pipeline_stage NOT IN ('ganado', 'perdido', 'cita_agendada')
        AND (custom_fields->>'reactivation_attempted')::boolean IS NOT TRUE
      )
    );

  -- Cerrados: historial de chats finalizados
  SELECT COUNT(*) INTO v_cerrados
  FROM contacts
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL
    AND conversation_status = 'closed';

  RETURN jsonb_build_object(
    'por_responder', v_por_responder,
    'mis_abiertos', v_mis_abiertos,
    'ia_atendiendo', v_ia_atendiendo,
    'seguimiento', v_seguimiento,
    'cerrados', v_cerrados
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 5. Backfill de datos existentes para consistencia inmediata
UPDATE contacts
SET conversation_status = 'closed'
WHERE custom_fields->>'conversation_status' = 'closed'
  AND (conversation_status IS NULL OR conversation_status = 'open');

UPDATE contacts
SET conversation_status = 'open'
WHERE conversation_status IS NULL;
