-- Migration: Add custom labels for specialist and room roles per organization
-- These allow each org to customize how their collaborators and spaces are named
-- e.g., "Doctores", "Barberos", "Agentes" / "Consultorios", "Salones", "Cabinas"

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS specialist_label TEXT DEFAULT 'Colaborador',
  ADD COLUMN IF NOT EXISTS room_label TEXT DEFAULT 'Espacio';

-- Set sensible defaults for existing orgs based on their industry_preset
UPDATE organizations
SET specialist_label = CASE
  WHEN industry_preset = 'health' THEN 'Doctor'
  WHEN industry_preset = 'services' THEN 'Especialista'
  WHEN industry_preset = 'gastronomy' THEN 'Chef'
  WHEN industry_preset = 'real_estate' THEN 'Agente'
  ELSE 'Colaborador'
END,
room_label = CASE
  WHEN industry_preset = 'health' THEN 'Consultorio'
  WHEN industry_preset = 'services' THEN 'Cabina'
  WHEN industry_preset = 'gastronomy' THEN 'Mesa'
  WHEN industry_preset = 'real_estate' THEN 'Sala'
  ELSE 'Espacio'
END
WHERE specialist_label IS NULL OR specialist_label = 'Colaborador';
