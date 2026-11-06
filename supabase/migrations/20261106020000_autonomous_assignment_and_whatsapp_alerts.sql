-- ==============================================================================
-- Migración: Asignación Autónoma y Alertas de Relevo por WhatsApp Personal
-- ==============================================================================

-- 1. Campos de WhatsApp y Asignación en profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_alerts_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS whatsapp_alerts_24_7 BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_assigned_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Configuración de Asignación y SLA en organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS assignment_mode TEXT NOT NULL DEFAULT 'load_balance',
  ADD COLUMN IF NOT EXISTS handoff_sla_minutes INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS include_admins_in_assignment BOOLEAN NOT NULL DEFAULT false;

-- 3. Tabla de auditoría y rastreo de alertas de relevo (handoff_alerts)
CREATE TABLE IF NOT EXISTS handoff_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  channel_message_id TEXT DEFAULT NULL,
  reason TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'sent', -- 'sent', 'claimed', 'reassigned', 'expired'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ DEFAULT NULL
);

-- Índices para búsqueda ultra-rápida cuando el asesor responde por WhatsApp
CREATE INDEX IF NOT EXISTS idx_handoff_alerts_msg_id ON handoff_alerts(channel_message_id);
CREATE INDEX IF NOT EXISTS idx_handoff_alerts_profile_status ON handoff_alerts(profile_id, status);
CREATE INDEX IF NOT EXISTS idx_handoff_alerts_contact_created ON handoff_alerts(contact_id, created_at DESC);

-- Habilitar RLS
ALTER TABLE handoff_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "handoff_alerts_org_isolation" ON handoff_alerts
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true
    )
  );
