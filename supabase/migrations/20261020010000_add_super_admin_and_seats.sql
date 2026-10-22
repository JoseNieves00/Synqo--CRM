-- ==============================================================================
-- SYNQO CRM - Super Admin & Seat Limit Migration (Phase 2)
-- Adds max_users (seats limit) to organizations and is_super_admin to profiles
-- ==============================================================================

-- 1. Agregar columna max_users en organizations (límite de usuarios autorizados)
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 3 NOT NULL;

-- 2. Agregar columna is_active en organizations para suspensión por morosidad
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE NOT NULL;

-- 3. Agregar columna is_super_admin en profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE NOT NULL;

-- 4. Asignar super_admin al usuario inicial
UPDATE profiles 
SET is_super_admin = TRUE 
WHERE email = 'admin@synqo.dev';

-- 5. Índice de rendimiento para recuento de usuarios por organización
CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON profiles(organization_id);

