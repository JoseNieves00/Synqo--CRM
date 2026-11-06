-- ==============================================================================
-- Migración: Fase 3 - Tabla de Observabilidad ai_runs y Métricas de Ingesta Unificada
-- ==============================================================================

CREATE TABLE IF NOT EXISTS ai_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp_meta',
  provider TEXT NOT NULL DEFAULT 'google',
  model TEXT NOT NULL DEFAULT 'gemini-1.5-flash',
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success', -- 'success' | 'failed' | 'fallback' | 'skipped'
  error_message TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de consulta de alto rendimiento
CREATE INDEX IF NOT EXISTS idx_ai_runs_org_created ON ai_runs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_runs_status ON ai_runs(status);

-- Habilitar RLS
ALTER TABLE ai_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_runs_org_isolation" ON ai_runs
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

-- ==============================================================================
-- Seguridad H4: Protección contra Elevación de Privilegios en Profiles
-- ==============================================================================

CREATE OR REPLACE FUNCTION prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super BOOLEAN;
BEGIN
  -- Si no hay cambio en campos privilegiados, permitir la actualización
  IF (OLD.is_super_admin IS NOT DISTINCT FROM NEW.is_super_admin) AND
     (OLD.role IS NOT DISTINCT FROM NEW.role) AND
     (OLD.organization_id IS NOT DISTINCT FROM NEW.organization_id) THEN
    RETURN NEW;
  END IF;

  -- Si la ejecución proviene de service_role (backend/admin SDK), permitir
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Verificar si el usuario que ejecuta la consulta es superadmin
  SELECT is_super_admin INTO v_is_super
  FROM profiles
  WHERE id = auth.uid();

  IF v_is_super IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Bloquear elevación no autorizada de privilegios
  RAISE EXCEPTION 'Operación denegada: Solo un superadministrador puede modificar roles, organizaciones o permisos de superadmin.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON profiles;

CREATE TRIGGER trg_prevent_profile_privilege_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_profile_privilege_escalation();

