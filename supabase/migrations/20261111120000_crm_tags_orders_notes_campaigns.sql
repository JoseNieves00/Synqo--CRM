-- ==============================================================================
-- Migración: CRM robusto — etiquetas, segmentos, pedidos, notas y campañas IA
-- ==============================================================================
-- Todas las tablas son multi-tenant (organization_id) con RLS por get_auth_org_id().
-- El backend opera con service role; las políticas protegen el acceso directo del cliente.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Etiquetas
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  color TEXT NOT NULL DEFAULT 'slate',
  created_by_ai BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_org_name ON tags(organization_id, lower(name));

CREATE TABLE IF NOT EXISTS contact_tags (
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'human' CHECK (source IN ('human', 'ai')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contact_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_contact_tags_org_tag ON contact_tags(organization_id, tag_id);

-- ------------------------------------------------------------------------------
-- 2. Segmentos guardados (filtros reutilizables para la base de clientes y campañas)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_segments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_saved_segments_org ON saved_segments(organization_id);

-- ------------------------------------------------------------------------------
-- 3. Pedidos (entidad propia; antes vivían en contacts.custom_fields.order)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'paid', 'delivered', 'cancelled')),
  payment_method TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  address TEXT,
  city TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'human', 'import')),
  campaign_id UUID,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_org_created ON orders(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_contact ON orders(contact_id, created_at DESC);

-- Backfill: pedidos registrados por la IA dentro de custom_fields.order
INSERT INTO orders (organization_id, contact_id, items, total, status, payment_method, customer_name, customer_phone, address, city, notes, source, created_at, updated_at)
SELECT
  c.organization_id,
  c.id,
  COALESCE(c.custom_fields->'order'->'items', '[]'::jsonb),
  COALESCE(NULLIF(c.custom_fields->'order'->>'total', '')::numeric, c.deal_value, 0),
  'confirmed',
  c.custom_fields->'order'->>'metodo_pago',
  c.custom_fields->'order'->>'nombre',
  c.custom_fields->'order'->>'telefono',
  c.custom_fields->'order'->>'direccion',
  c.custom_fields->'order'->>'ciudad',
  c.custom_fields->'order'->>'notas',
  CASE WHEN c.custom_fields->'order'->>'created_by' = 'ai' THEN 'ai' ELSE 'human' END,
  COALESCE(NULLIF(c.custom_fields->'order'->>'created_at', '')::timestamptz, c.closed_at, c.updated_at, NOW()),
  NOW()
FROM contacts c
WHERE c.custom_fields ? 'order'
  AND jsonb_typeof(c.custom_fields->'order') = 'object'
  AND (c.custom_fields->'order'->>'total') ~ '^[0-9]+(\.[0-9]+)?$'
  AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.contact_id = c.id);

-- ------------------------------------------------------------------------------
-- 4. Notas internas con autor (historial; reemplaza el campo único custom_fields.notes)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  author_name TEXT,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contact_notes_contact ON contact_notes(contact_id, created_at DESC);

-- Backfill: nota única previa
INSERT INTO contact_notes (organization_id, contact_id, author_name, body, created_at)
SELECT c.organization_id, c.id, 'Nota previa', LEFT(c.custom_fields->>'notes', 2000), COALESCE(c.updated_at, NOW())
FROM contacts c
WHERE COALESCE(TRIM(c.custom_fields->>'notes'), '') <> ''
  AND NOT EXISTS (SELECT 1 FROM contact_notes n WHERE n.contact_id = c.id);

-- ------------------------------------------------------------------------------
-- 5. Campañas IA a segmentos
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  objective TEXT NOT NULL CHECK (char_length(objective) BETWEEN 5 AND 600),
  segment_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'completed', 'cancelled')),
  daily_cap INTEGER NOT NULL DEFAULT 60 CHECK (daily_cap BETWEEN 1 AND 500),
  include_product_photo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_campaigns_org_status ON campaigns(organization_id, status);

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped', 'failed')),
  skip_reason TEXT,
  message TEXT,
  error TEXT,
  sent_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, contact_id)
);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_pending ON campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_contact ON campaign_recipients(contact_id, sent_at DESC);

DO $$
BEGIN
  ALTER TABLE orders ADD CONSTRAINT orders_campaign_fk FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------------------------------------------------
-- 6. RLS multi-tenant
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['tags', 'contact_tags', 'saved_segments', 'orders', 'contact_notes', 'campaigns', 'campaign_recipients'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Org members manage %s" ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY "Org members manage %s" ON %I FOR ALL USING (organization_id = get_auth_org_id()) WITH CHECK (organization_id = get_auth_org_id())',
      t, t
    );
  END LOOP;
END $$;
