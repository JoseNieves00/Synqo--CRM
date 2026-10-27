-- ==============================================================================
-- SYNQO CRM (synqo.dev) - Migration: Agent Assignment & Realtime Presence
-- Multi-agent load balancing, atomic lead claiming, and anti-phantom presence
-- ==============================================================================

-- 1. Agregar campos de presencia y disponibilidad en profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS availability_status TEXT DEFAULT 'available' CHECK (availability_status IN ('available', 'busy', 'offline'));

-- 2. Agregar campo assigned_to en contacts
ALTER TABLE public.contacts
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_contacts_org_assigned ON public.contacts(organization_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_profiles_org_presence ON public.profiles(organization_id, last_seen_at, availability_status);

