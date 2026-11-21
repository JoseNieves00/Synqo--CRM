-- ==============================================================================
-- Migración: Soporte nativo para Plan Separe y Abonos en Pedidos (orders)
-- ==============================================================================

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS is_separe BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS deposit_paid NUMERIC(14, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS balance_due NUMERIC(14, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS separe_due_date TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_is_separe ON orders(organization_id, is_separe) WHERE is_separe = TRUE;
