-- ==============================================================================
-- Migración: Motor de Agendamiento Nativo, Gestión de Recursos/Salones,
-- Catálogo Flexible, Portal Móvil de Colaboradores y Mensajería Interna
-- Fecha: 27 de Octubre de 2026
-- ==============================================================================

-- 1. Agregar nuevo rol de 'receptionist' (Recepcionista / Mostrador)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'receptionist';

-- 2. Modificaciones a la tabla organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS company_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS enabled_modules JSONB DEFAULT '{
    "native_calendar": true,
    "physical_rooms": false,
    "staff_mobile_portal": false,
    "quick_pay": false,
    "anti_no_show": true,
    "ad_attribution": false
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS appointment_settings JSONB DEFAULT '{
    "arrival_tolerance_minutes": 15,
    "confirmation_window_hours": 8,
    "max_night_hour": "20:00",
    "max_reschedules": 2,
    "slot_interval_minutes": 15,
    "buffer_minutes": 0
  }'::jsonb;

-- Trigger o función para autogenerar company_code si viene vacío
CREATE OR REPLACE FUNCTION generate_company_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_code IS NULL OR NEW.company_code = '' THEN
    NEW.company_code := UPPER(SUBSTRING(REGEXP_REPLACE(NEW.name, '[^a-zA-Z0-9]', '', 'g') FROM 1 FOR 4)) || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_company_code ON organizations;
CREATE TRIGGER trg_generate_company_code
  BEFORE INSERT OR UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION generate_company_code();

-- Asignar códigos a organizaciones existentes que no lo tengan
UPDATE organizations 
SET company_code = UPPER(SUBSTRING(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g') FROM 1 FOR 4)) || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0')
WHERE company_code IS NULL OR company_code = '';

-- 3. Catálogo de Servicios y Clases (Tiempos estimados reales definidos por el Admin)
CREATE TABLE IF NOT EXISTS services_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INT NOT NULL DEFAULT 45,
  price NUMERIC(12,2) DEFAULT 0,
  category TEXT DEFAULT 'general',
  is_group BOOLEAN DEFAULT false,
  max_group_capacity INT DEFAULT 1,
  requires_room BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Salones Físicos, Oficinas y Estaciones
CREATE TABLE IF NOT EXISTS physical_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INT NOT NULL DEFAULT 1,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Colaboradores (Barberos, Profesores, Especialistas)
CREATE TABLE IF NOT EXISTS specialists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  specialty TEXT,
  services_offered TEXT[] DEFAULT '{}',
  weekly_schedule JSONB DEFAULT '{
    "lunes": {"enabled": true, "slots": [{"start": "09:00", "end": "13:00"}, {"start": "14:00", "end": "19:00"}]},
    "martes": {"enabled": true, "slots": [{"start": "09:00", "end": "13:00"}, {"start": "14:00", "end": "19:00"}]},
    "miercoles": {"enabled": true, "slots": [{"start": "09:00", "end": "13:00"}, {"start": "14:00", "end": "19:00"}]},
    "jueves": {"enabled": true, "slots": [{"start": "09:00", "end": "13:00"}, {"start": "14:00", "end": "19:00"}]},
    "viernes": {"enabled": true, "slots": [{"start": "09:00", "end": "13:00"}, {"start": "14:00", "end": "19:00"}]},
    "sabado": {"enabled": true, "slots": [{"start": "09:00", "end": "17:00"}]},
    "domingo": {"enabled": false, "slots": []}
  }'::jsonb,
  access_pin VARCHAR(10) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Bloqueos Flexibles de Disponibilidad del Colaborador (Horas específicas o día completo)
CREATE TABLE IF NOT EXISTS specialist_unavailability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  specialist_id UUID NOT NULL REFERENCES specialists(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  reason TEXT,
  is_all_day BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Citas y Turnos Agendados
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  specialist_id UUID REFERENCES specialists(id) ON DELETE SET NULL,
  room_id UUID REFERENCES physical_rooms(id) ON DELETE SET NULL,
  service_id UUID REFERENCES services_catalog(id) ON DELETE SET NULL,
  service_name TEXT NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 45,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')),
  booked_via VARCHAR(20) DEFAULT 'ai_whatsapp' CHECK (booked_via IN ('ai_whatsapp', 'manual_reception', 'walk_in', 'client_portal')),
  reschedule_count INT DEFAULT 0,
  notes TEXT,
  client_notified_delay_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  confirmation_status VARCHAR(20) DEFAULT 'unconfirmed' CHECK (confirmation_status IN ('unconfirmed', 'confirmed', 'expired')),
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'not_applicable')),
  payment_method VARCHAR(30),
  amount_paid NUMERIC(12,2) DEFAULT 0,
  package_session_info TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Mensajería Interna: Sede/Mostrador <-> Colaborador
CREATE TABLE IF NOT EXISTS internal_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  specialist_id UUID NOT NULL REFERENCES specialists(id) ON DELETE CASCADE,
  sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('admin', 'receptionist', 'specialist')),
  sender_name TEXT,
  content TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Índices de Alto Rendimiento (Consultas < 20ms)
CREATE INDEX IF NOT EXISTS idx_services_org_active ON services_catalog(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_rooms_org_active ON physical_rooms(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_specialists_org_active ON specialists(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_specialists_pin ON specialists(organization_id, access_pin);
CREATE INDEX IF NOT EXISTS idx_org_company_code ON organizations(company_code);
CREATE INDEX IF NOT EXISTS idx_unavail_specialist_range ON specialist_unavailability(specialist_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_appointments_org_start ON appointments(organization_id, start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_specialist_range ON appointments(specialist_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_appointments_room_range ON appointments(room_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_appointments_contact ON appointments(contact_id);
CREATE INDEX IF NOT EXISTS idx_internal_chat_spec_created ON internal_chat_messages(specialist_id, created_at DESC);

-- 10. Habilitar RLS en todas las nuevas tablas
ALTER TABLE services_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE physical_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE specialists ENABLE ROW LEVEL SECURITY;
ALTER TABLE specialist_unavailability ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_chat_messages ENABLE ROW LEVEL SECURITY;

-- Políticas de aislamiento multi-tenant para miembros de la organización
CREATE POLICY "org_isolation_services_catalog" ON services_catalog
  FOR ALL USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

CREATE POLICY "org_isolation_physical_rooms" ON physical_rooms
  FOR ALL USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

CREATE POLICY "org_isolation_specialists" ON specialists
  FOR ALL USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

CREATE POLICY "org_isolation_unavailability" ON specialist_unavailability
  FOR ALL USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

CREATE POLICY "org_isolation_appointments" ON appointments
  FOR ALL USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

CREATE POLICY "org_isolation_internal_chat" ON internal_chat_messages
  FOR ALL USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

