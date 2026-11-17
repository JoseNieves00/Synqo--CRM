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

CREATE INDEX IF NOT EXISTS idx_ai_retry_queue_due
  ON ai_retry_queue (next_attempt_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_ai_retry_queue_org_status
  ON ai_retry_queue (organization_id, status);

-- RLS: los miembros de la organización pueden ver la cola; el backend usa service role.
ALTER TABLE ai_retry_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view ai retry queue" ON ai_retry_queue;
CREATE POLICY "Org members view ai retry queue" ON ai_retry_queue
  FOR SELECT USING (organization_id = get_auth_org_id());
