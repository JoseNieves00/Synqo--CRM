-- ==============================================================================
-- Corrección Urgente: Trigger sync_contact_inbox_state enum reminder_status
-- ==============================================================================
-- El enum reminder_status solo admite: 'pending' | 'sent' | 'cancelled'.
-- Al responder el asesor o la IA, se actualiza a 'cancelled' (no 'completed').

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

    -- Cancelar en tabla scheduled_reminders si existía recordatorio de reactivación
    UPDATE scheduled_reminders
    SET status = 'cancelled'
    WHERE contact_id = NEW.contact_id 
      AND reminder_type = 'reactivation' 
      AND status = 'pending';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-vincular trigger
DROP TRIGGER IF EXISTS trg_sync_contact_inbox_state ON messages;
CREATE TRIGGER trg_sync_contact_inbox_state
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION sync_contact_inbox_state();
