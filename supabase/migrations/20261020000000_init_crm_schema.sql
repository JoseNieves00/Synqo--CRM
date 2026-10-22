-- ==============================================================================
-- SYNQO CRM (synqo.dev) - Database Schema Migration
-- Multi-tenant isolation with Row Level Security (RLS) & Billing Shielding
-- ==============================================================================

-- Extensiones requeridas
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ENUMs
CREATE TYPE user_role AS ENUM ('admin', 'supervisor', 'agent');
CREATE TYPE pipeline_stage AS ENUM ('nuevo', 'calificado', 'cita_agendada', 'ganado', 'perdido');
CREATE TYPE message_sender AS ENUM ('lead', 'ai', 'agent_manual', 'system');
CREATE TYPE reminder_status AS ENUM ('pending', 'sent', 'cancelled');

-- 2. Tablas del Sistema

-- Organizaciones (Tenants) con Blindaje de Facturación
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    whatsapp_phone_number_id TEXT UNIQUE,
    whatsapp_access_token TEXT,            -- Cifrado con AES-256-GCM a nivel de aplicación
    cal_api_key TEXT,                      -- Cifrado con AES-256-GCM a nivel de aplicación
    cal_event_type_id TEXT,
    system_prompt TEXT DEFAULT 'Eres un asesor comercial experto y empático de Synqo. Responde con cortesía, atiende dudas comerciales y guía al cliente a agendar una cita usando las herramientas de calendario.',
    -- Facturación / Parche 1: Blindaje de Rentabilidad
    stripe_customer_id TEXT UNIQUE,
    subscription_status TEXT DEFAULT 'trialing' CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'trialing')),
    plan_type TEXT DEFAULT 'core' CHECK (plan_type IN ('core', 'pro', 'enterprise')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Perfiles de Usuarios asociados a Organizaciones
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role user_role DEFAULT 'agent' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Contactos / Leads Comerciales
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    name TEXT,
    pipeline_stage pipeline_stage DEFAULT 'nuevo' NOT NULL,
    custom_fields JSONB DEFAULT '{}'::jsonb NOT NULL,
    is_ai_active BOOLEAN DEFAULT TRUE NOT NULL,
    last_interaction_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT uq_org_phone UNIQUE(organization_id, phone)
);

-- Mensajes de WhatsApp
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    sender_type message_sender NOT NULL,
    content TEXT NOT NULL,
    meta_message_id TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Recordatorios Agendados
CREATE TABLE IF NOT EXISTS scheduled_reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    scheduled_for TIMESTAMPTZ NOT NULL,
    reminder_type TEXT NOT NULL,
    status reminder_status DEFAULT 'pending' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. Índices de Rendimiento y Búsqueda Rápida
CREATE INDEX IF NOT EXISTS idx_org_sub_status ON organizations(subscription_status);
CREATE INDEX IF NOT EXISTS idx_org_phone_number_id ON organizations(whatsapp_phone_number_id);
CREATE INDEX IF NOT EXISTS idx_contacts_org_stage ON contacts(organization_id, pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_messages_contact_created ON messages(contact_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_meta_id ON messages(meta_message_id);
CREATE INDEX IF NOT EXISTS idx_reminders_status_date ON scheduled_reminders(status, scheduled_for);

-- 4. Función Auxiliar de Seguridad para RLS (Obtener organization_id del usuario autenticado)
CREATE OR REPLACE FUNCTION get_auth_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 5. Habilitar Row Level Security (RLS) en todas las tablas
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_reminders ENABLE ROW LEVEL SECURITY;

-- 6. Políticas de Seguridad RLS Multi-tenant

-- Organizations
CREATE POLICY "Users can view own organization"
    ON organizations FOR SELECT
    USING (id = get_auth_org_id());

CREATE POLICY "Admins can update own organization"
    ON organizations FOR UPDATE
    USING (id = get_auth_org_id() AND EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    ));

-- Profiles (evita recursión usando id = auth.uid())
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (id = auth.uid());

CREATE POLICY "Admins can manage profiles in their organization"
    ON profiles FOR ALL
    USING (organization_id = get_auth_org_id() AND EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    ));

-- Contacts
CREATE POLICY "Tenant isolation for contacts (SELECT)"
    ON contacts FOR SELECT
    USING (organization_id = get_auth_org_id());

CREATE POLICY "Tenant isolation for contacts (INSERT)"
    ON contacts FOR INSERT
    WITH CHECK (organization_id = get_auth_org_id());

CREATE POLICY "Tenant isolation for contacts (UPDATE)"
    ON contacts FOR UPDATE
    USING (organization_id = get_auth_org_id());

CREATE POLICY "Tenant isolation for contacts (DELETE)"
    ON contacts FOR DELETE
    USING (organization_id = get_auth_org_id());

-- Messages
CREATE POLICY "Tenant isolation for messages (SELECT)"
    ON messages FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM contacts 
        WHERE contacts.id = messages.contact_id 
        AND contacts.organization_id = get_auth_org_id()
    ));

CREATE POLICY "Tenant isolation for messages (INSERT)"
    ON messages FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM contacts 
        WHERE contacts.id = messages.contact_id 
        AND contacts.organization_id = get_auth_org_id()
    ));

-- Scheduled Reminders
CREATE POLICY "Tenant isolation for reminders"
    ON scheduled_reminders FOR ALL
    USING (EXISTS (
        SELECT 1 FROM contacts 
        WHERE contacts.id = scheduled_reminders.contact_id 
        AND contacts.organization_id = get_auth_org_id()
    ));

