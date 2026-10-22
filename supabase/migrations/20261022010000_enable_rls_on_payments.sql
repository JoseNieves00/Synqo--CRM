-- ==============================================================================
-- SYNQO CRM - Enable RLS on organization_payments
-- Ensures strict multi-tenant isolation and prevents unauthorized data leaks
-- ==============================================================================

ALTER TABLE organization_payments ENABLE ROW LEVEL SECURITY;

-- Política de lectura: los miembros de la empresa solo pueden ver pagos de su organización
CREATE POLICY "Tenant isolation for organization_payments (SELECT)"
    ON organization_payments FOR SELECT
    USING (organization_id = get_auth_org_id());

-- Los pagos solo pueden ser insertados por el sistema (Service Role / Server Actions de Super Admin)

