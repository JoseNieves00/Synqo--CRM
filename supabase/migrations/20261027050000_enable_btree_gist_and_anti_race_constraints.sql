-- ==============================================================================
-- Migración: Extensión btree_gist y Restricción Atómica Anti-Colisión de Citas
-- ==============================================================================

-- 1. Habilitar la extensión estándar btree_gist para soportar operadores '=' en GiST con UUID
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Asegurar que las columnas de password y approval existan en specialists
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

-- 3. Tabla staff_invitations para enlaces y QRs seguros (Tokens HMAC efímeros de 24h)
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

-- 4. Habilitar RLS en staff_invitations
ALTER TABLE staff_invitations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'org_isolation_staff_invitations'
  ) THEN
    CREATE POLICY "org_isolation_staff_invitations" ON staff_invitations
      FOR ALL USING (
        organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
      );
  END IF;
END $$;

-- 5. Restricción Atómica contra Colisiones Concurrentes a nivel de Base de Datos
-- (Impide físicamente que dos clientes agenden al mismo especialista al mismo milisegundo)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'no_overlapping_specialist_appointments'
  ) THEN
    ALTER TABLE appointments ADD CONSTRAINT no_overlapping_specialist_appointments
    EXCLUDE USING gist (
      specialist_id WITH =,
      tstzrange(start_time, end_time) WITH &&
    ) WHERE (status NOT IN ('cancelled', 'no_show') AND specialist_id IS NOT NULL);
  END IF;
END $$;

