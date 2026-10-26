-- SYNQO CRM - Plantillas Dinámicas de WhatsApp Meta
-- Permite que cada empresa gestione y sincronice sus plantillas oficiales aprobadas por Meta

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS whatsapp_templates JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN organizations.whatsapp_templates IS 'Array de plantillas oficiales de Meta WhatsApp aprobadas para la empresa: [{ name, label, language }]';

