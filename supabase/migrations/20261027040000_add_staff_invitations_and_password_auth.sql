-- ==============================================================================
-- Migración: Invitaciones Seguras para Colaboradores (One-Time Token, TTL 24h),
-- Aprobación por el Admin y Autenticación con Contraseña Cifrada
-- Fecha: 27 de Octubre de 2026
-- ==============================================================================

-- 1. Ampliación de tabla specialists para auto-registro seguro
ALTER TABLE specialists
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- Restricción única para evitar celulares duplicados en la misma empresa
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_specialists_org_phone'
  ) THEN
    ALTER TABLE specialists ADD CONSTRAINT uq_specialists_org_phone UNIQUE (organization_id, phone);
  END IF;
END $$;

-- 2. Tabla staff_invitations para enlaces y QRs seguros (Tokens HMAC efímeros de 24h)
CREATE TABLE IF NOT EXISTS staff_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  is_used BOOLEAN DEFAULT false,
  used_by_specialist_id UUID REFERENCES specialists(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de alta velocidad
CREATE INDEX IF NOT EXISTS idx_invitations_token_hash ON staff_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_org_active ON staff_invitations(organization_id, is_used, expires_at);

-- 3. Habilitar RLS en staff_invitations
ALTER TABLE staff_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation_staff_invitations" ON staff_invitations
  FOR ALL USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

COMMENT ON TABLE staff_invitations IS 'Almacena tokens efímeros firmados con expiración de 24 horas y de un solo uso para invitar colaboradores';

