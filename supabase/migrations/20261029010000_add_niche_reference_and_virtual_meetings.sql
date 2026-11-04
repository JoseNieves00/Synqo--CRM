-- ==============================================================================
-- Migración: Campo de Referencia por Nicho (Placa/Mascota/Alumno),
-- Citas Virtuales (Google Meet / Links), Combos y Retraso Acumulado
-- Fecha: 29 de Octubre de 2026
-- ==============================================================================

-- 1. Ampliación de la tabla appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reference_info TEXT,
  ADD COLUMN IF NOT EXISTS meeting_link TEXT,
  ADD COLUMN IF NOT EXISTS delay_minutes INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS services_list JSONB DEFAULT '[]'::jsonb;

-- 2. Soporte para servicios virtuales en catálogo
ALTER TABLE services_catalog
  ADD COLUMN IF NOT EXISTS is_virtual BOOLEAN DEFAULT false;

-- 3. Soporte para Google Calendar OAuth y Proveedor Dual de IA en organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS google_calendar_token TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT,
  ADD COLUMN IF NOT EXISTS ai_provider TEXT DEFAULT 'gemini';

-- 4. Índice de alto rendimiento para búsquedas por placa / referencia
CREATE INDEX IF NOT EXISTS idx_appointments_reference ON appointments(organization_id, reference_info);
CREATE INDEX IF NOT EXISTS idx_appointments_meeting_link ON appointments(meeting_link) WHERE meeting_link IS NOT NULL;

COMMENT ON COLUMN appointments.reference_info IS 'Placa del vehículo, nombre del alumno, mascota o documento según el nicho';
COMMENT ON COLUMN appointments.meeting_link IS 'Enlace de Google Meet / videollamada para citas de consultoría o telemedicina';
COMMENT ON COLUMN appointments.delay_minutes IS 'Minutos de retraso acumulado reportados en la cita';
COMMENT ON COLUMN appointments.services_list IS 'Lista de servicios combinados en caso de combos o multi-servicio';

