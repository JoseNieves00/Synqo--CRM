-- ==============================================================================
-- Migración: Sistema de Tickets de Soporte y GitHub Issues
-- Tabla: support_tickets
-- Descripción: Almacena reportes de fallas y solicitudes de soporte técnico de las
-- organizaciones, sincronizados bidireccionalmente con GitHub Issues.
-- Incluye Row Level Security (RLS) para aislamiento multi-inquilino estricto.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    category TEXT NOT NULL CHECK (category IN ('whatsapp', 'ai_assistant', 'calendar', 'billing', 'bug', 'feature_request')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    screenshot_url TEXT,
    github_issue_number INT,
    github_issue_url TEXT,
    system_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- Índices de alto rendimiento para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_support_tickets_org ON public.support_tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON public.support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_github_issue ON public.support_tickets(github_issue_number);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- 1. Política de Aislamiento Multi-Tenant:
-- Los asesores y administradores de empresa solo pueden visualizar y crear tickets pertenecientes a su propia organización.
DROP POLICY IF EXISTS "Users can only view tickets from their org" ON public.support_tickets;
CREATE POLICY "Users can only view tickets from their org"
ON public.support_tickets FOR SELECT
USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Users can create tickets for their org" ON public.support_tickets;
CREATE POLICY "Users can create tickets for their org"
ON public.support_tickets FOR INSERT
WITH CHECK (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
);

-- 2. Política para Super Administrador:
-- El Super Admin tiene acceso completo de lectura, edición y resolución sobre todos los tickets de todas las empresas.
DROP POLICY IF EXISTS "Super Admins have full access to tickets" ON public.support_tickets;
CREATE POLICY "Super Admins have full access to tickets"
ON public.support_tickets FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND (is_super_admin = true OR email = 'admin@synqo.dev')
    )
);

