-- ==============================================================================
-- Migración: Cola de reintentos diferidos de IA (ai_retry_queue)
-- ==============================================================================
-- Cuando la respuesta de la IA ya está generada pero el despacho al canal falla
-- (transitorio), o el worker de IA falla antes de responder al lead, se encola un
-- reintento diferido: se reenvía lo ya generado SIN gastar tokens del LLM de nuevo.
-- El cron (lead-reactivation) procesa la cola con topes y guardas de candados.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS ai_retry_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  strategy TEXT NOT NULL CHECK (strategy IN ('resend', 'regenerate')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Si la tabla ya fue creada previamente con la columna 'next_retry_at', renombrarla a 'next_attempt_at'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_retry_queue' AND column_name = 'next_retry_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_retry_queue' AND column_name = 'next_attempt_at'
  ) THEN
    ALTER TABLE ai_retry_queue RENAME COLUMN next_retry_at TO next_attempt_at;
  END IF;
END $$;

-- Si la tabla existía pero carecía de 'next_attempt_at', agregarla de forma segura
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_retry_queue' AND column_name = 'next_attempt_at'
  ) THEN
    ALTER TABLE ai_retry_queue ADD COLUMN next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_retry_queue_due
  ON ai_retry_queue (next_attempt_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_ai_retry_queue_org_status
  ON ai_retry_queue (organization_id, status);

-- RLS: los miembros de la organización pueden ver su propia cola; el backend opera vía service role.
ALTER TABLE ai_retry_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view ai retry queue" ON ai_retry_queue;
CREATE POLICY "Org members view ai retry queue" ON ai_retry_queue
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );
