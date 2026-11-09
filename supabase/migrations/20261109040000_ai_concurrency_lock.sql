-- Migración: Lock Atómico de Concurrencia de IA (Pilar 4.1.3)
-- Evita que dos workers procesen al mismo contacto concurrentemente.

CREATE OR REPLACE FUNCTION try_acquire_ai_lock(
  p_contact_id UUID,
  p_worker_id TEXT,
  p_ttl_seconds INT DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_locked BOOLEAN := FALSE;
  v_now BIGINT := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
  v_new_lock_until BIGINT := v_now + (p_ttl_seconds * 1000);
BEGIN
  UPDATE contacts
  SET custom_fields = jsonb_set(
    COALESCE(custom_fields, '{}'::jsonb),
    '{ai_lock}',
    jsonb_build_object(
      'worker_id', p_worker_id,
      'lock_until', v_new_lock_until
    )
  )
  WHERE id = p_contact_id
    AND (
      custom_fields->'ai_lock' IS NULL
      OR (custom_fields->'ai_lock'->>'lock_until')::BIGINT IS NULL
      OR (custom_fields->'ai_lock'->>'lock_until')::BIGINT < v_now
      OR custom_fields->'ai_lock'->>'worker_id' = p_worker_id
    );

  IF FOUND THEN
    v_locked := TRUE;
  END IF;

  RETURN v_locked;
END;
$$;

CREATE OR REPLACE FUNCTION release_ai_lock(
  p_contact_id UUID,
  p_worker_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE contacts
  SET custom_fields = custom_fields - 'ai_lock'
  WHERE id = p_contact_id
    AND custom_fields->'ai_lock'->>'worker_id' = p_worker_id;
END;
$$;
