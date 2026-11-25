-- ==============================================================================
-- SYNQO CRM - Master ERP, Token Packages, Token Ledger, OpenAI Wallet & Atomic Tokens
-- Idempotent migration: safe to run multiple times without data loss.
-- ==============================================================================

-- 1. Extend organizations for exact-date cycles (trial/paid), token packs & ERP notes
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS billing_cycle_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cycle_kind TEXT DEFAULT 'paid' CHECK (cycle_kind IN ('trial', 'paid')),
  ADD COLUMN IF NOT EXISTS extra_tokens_balance BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_fee_cop NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS account_notes TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Safe backfill of billing_cycle_ends_at from paid_until_month ('YYYY-MM')
UPDATE organizations
SET billing_cycle_ends_at = (
  (DATE_TRUNC('month', TO_DATE(paid_until_month || '-01', 'YYYY-MM-DD')) + INTERVAL '1 month - 1 day' + INTERVAL '23 hours 59 minutes 59 seconds')
  AT TIME ZONE 'America/Bogota'
)
WHERE billing_cycle_ends_at IS NULL
  AND paid_until_month ~ '^\d{4}-\d{2}$';

-- 2. Extend organization_payments for COP/USD, concepts, status & token packs
ALTER TABLE organization_payments
  ADD COLUMN IF NOT EXISTS concept_type TEXT NOT NULL DEFAULT 'monthly_base' CHECK (concept_type IN ('monthly_base', 'setup', 'token_pack', 'extra_seats', 'custom')),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'pending', 'partial', 'void')),
  ADD COLUMN IF NOT EXISTS amount_cop NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_usd NUMERIC(12, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10, 2) NOT NULL DEFAULT 4200,
  ADD COLUMN IF NOT EXISTS token_package_id UUID,
  ADD COLUMN IF NOT EXISTS tokens_granted BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reference_code TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Configurable Token Packages Catalog
CREATE TABLE IF NOT EXISTS token_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  tokens_amount BIGINT NOT NULL CHECK (tokens_amount > 0),
  estimated_chats_label TEXT,
  price_cop NUMERIC(14, 2) NOT NULL DEFAULT 0,
  price_usd NUMERIC(12, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO token_packages (slug, name, description, tokens_amount, estimated_chats_label, price_cop, price_usd, is_active, sort_order)
VALUES
  ('pack-impulso-2-5m', 'Pack Impulso (+2.5M)', 'Ideal para picos de fin de mes o campañas puntuales (~165–330 conversaciones)', 2500000, '~165–330 chats', 45000, 10.71, TRUE, 1),
  ('pack-crecimiento-5m', 'Pack Crecimiento (+5M)', 'Duplica la capacidad mensual habitual (~330–660 conversaciones)', 5000000, '~330–660 chats', 80000, 19.05, TRUE, 2),
  ('pack-temporada-10m', 'Pack Temporada (+10M)', 'Para lanzamientos, Black Friday o alto volumen (~660–1,330 conversaciones)', 10000000, '~660–1,330 chats', 145000, 34.52, TRUE, 3)
ON CONFLICT (slug) DO NOTHING;

-- 4. Token Ledger (Immutable audit of base cycles, packs, trials, courtesies & resets)
CREATE TABLE IF NOT EXISTS token_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('cycle_base', 'pack_purchase', 'trial_grant', 'courtesy', 'cycle_reset', 'adjustment')),
  tokens_delta BIGINT NOT NULL,
  balance_after_limit BIGINT NOT NULL DEFAULT 0,
  package_id UUID REFERENCES token_packages(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES organization_payments(id) ON DELETE SET NULL,
  idempotency_key TEXT UNIQUE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_ledger_org_created ON token_ledger(organization_id, created_at DESC);

-- 5. AI Provider Wallet (OpenAI / Gemini liquidity calculator)
CREATE TABLE IF NOT EXISTS ai_provider_wallet (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'openai',
  balance_usd NUMERIC(12, 4) NOT NULL DEFAULT 0,
  trm_cop_per_usd NUMERIC(10, 2) NOT NULL DEFAULT 4200,
  safety_buffer_pct NUMERIC(5, 2) NOT NULL DEFAULT 15,
  last_recharged_usd NUMERIC(12, 4) NOT NULL DEFAULT 0,
  last_recharged_at TIMESTAMPTZ,
  notes TEXT,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ai_provider_wallet (id, provider, balance_usd, trm_cop_per_usd, safety_buffer_pct, notes)
VALUES ('openai_primary', 'openai', 0, 4200, 15, 'Billetera principal de créditos OpenAI')
ON CONFLICT (id) DO NOTHING;

-- 6. SuperAdmin Audit Log
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  target_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at DESC);

-- 7. Strict RLS on all new ERP tables (SuperAdmin / service_role only)
ALTER TABLE token_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_provider_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superadmin_only_token_packages" ON token_packages;
CREATE POLICY "superadmin_only_token_packages" ON token_packages
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = TRUE));

DROP POLICY IF EXISTS "superadmin_only_token_ledger" ON token_ledger;
CREATE POLICY "superadmin_only_token_ledger" ON token_ledger
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = TRUE));

DROP POLICY IF EXISTS "superadmin_only_ai_provider_wallet" ON ai_provider_wallet;
CREATE POLICY "superadmin_only_ai_provider_wallet" ON ai_provider_wallet
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = TRUE));

DROP POLICY IF EXISTS "superadmin_only_admin_audit_log" ON admin_audit_log;
CREATE POLICY "superadmin_only_admin_audit_log" ON admin_audit_log
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = TRUE));

-- 8. Atomic Token Increment RPC (eliminates race condition on concurrent AI turns)
CREATE OR REPLACE FUNCTION increment_org_token_usage(
  p_org_id UUID,
  p_total BIGINT,
  p_google BIGINT DEFAULT 0,
  p_openai BIGINT DEFAULT 0
)
RETURNS TABLE (
  ai_tokens_used BIGINT,
  ai_tokens_limit BIGINT,
  extra_tokens_balance BIGINT,
  ai_tokens_google_used BIGINT,
  ai_tokens_openai_used BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE organizations o
  SET
    ai_tokens_used = COALESCE(o.ai_tokens_used, 0) + GREATEST(0, COALESCE(p_total, 0)),
    ai_tokens_google_used = COALESCE(o.ai_tokens_google_used, 0) + GREATEST(0, COALESCE(p_google, 0)),
    ai_tokens_openai_used = COALESCE(o.ai_tokens_openai_used, 0) + GREATEST(0, COALESCE(p_openai, 0)),
    updated_at = NOW()
  WHERE o.id = p_org_id
  RETURNING
    o.ai_tokens_used::BIGINT,
    COALESCE(o.ai_tokens_limit, 5000000)::BIGINT,
    COALESCE(o.extra_tokens_balance, 0)::BIGINT,
    o.ai_tokens_google_used::BIGINT,
    o.ai_tokens_openai_used::BIGINT;
END;
$$;
