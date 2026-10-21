-- ==============================================================================
-- SYNQO CRM - Manual Billing, Mora Tracking & Organization Payments
-- Adds billing lifecycle columns and payment history table
-- ==============================================================================

-- 1. Agregar columnas de ciclo de facturación y mora a organizations
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS paid_until_month TEXT DEFAULT TO_CHAR(NOW(), 'YYYY-MM');

ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS billing_due_day INT DEFAULT 5;

ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS past_due_since TIMESTAMPTZ;

-- 2. Tabla para registrar el historial de pagos manuales (transferencias, enlaces, etc.)
CREATE TABLE IF NOT EXISTS organization_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    period_month TEXT NOT NULL, -- Ej: '2026-10'
    payment_method TEXT NOT NULL DEFAULT 'transferencia', -- 'transferencia', 'stripe_link', 'wompi', 'mercadopago', 'otro'
    notes TEXT,
    registered_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. Índices para consultas rápidas de estado de cobranza
CREATE INDEX IF NOT EXISTS idx_organizations_billing ON organizations(id, is_active, subscription_status, paid_until_month);
CREATE INDEX IF NOT EXISTS idx_organization_payments_org ON organization_payments(organization_id, period_month);
