-- ==============================================================================
-- Migración: Sistema de Vacíos de Conocimiento (AI Knowledge Gaps),
-- Configuración Multinicho y Relevo Silencioso de IA
-- Fecha: 27 de Octubre de 2026
-- ==============================================================================

-- 1. Agregar columnas de personalización multinicho y handoff a organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS handoff_mode TEXT DEFAULT 'silent' CHECK (handoff_mode IN ('silent', 'message')),
  ADD COLUMN IF NOT EXISTS after_hours_message TEXT,
  ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT '{"enabled": false, "start": "08:00", "end": "19:00", "days": [1,2,3,4,5,6]}'::jsonb,
  ADD COLUMN IF NOT EXISTS industry_preset TEXT DEFAULT 'services',
  ADD COLUMN IF NOT EXISTS structured_prompt_data JSONB;

-- 2. Crear tabla ai_knowledge_gaps para registrar preguntas de clientes no resueltas
CREATE TABLE IF NOT EXISTS ai_knowledge_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  ai_category VARCHAR(50) DEFAULT 'general',
  reason TEXT,
  occurrences INT DEFAULT 1,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  suggested_answer TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para alto rendimiento en consultas de Inbox y Ajustes
CREATE INDEX IF NOT EXISTS idx_ai_gaps_org_status ON ai_knowledge_gaps(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_gaps_created ON ai_knowledge_gaps(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_gaps_contact ON ai_knowledge_gaps(contact_id);

-- 3. Habilitar Row Level Security (RLS)
ALTER TABLE ai_knowledge_gaps ENABLE ROW LEVEL SECURITY;

-- Política de lectura para miembros de la misma organización
CREATE POLICY "Miembros ven vacíos de conocimiento de su organización"
  ON ai_knowledge_gaps
  FOR SELECT
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

-- Política de inserción (para el sistema o miembros de la organización)
CREATE POLICY "Miembros crean vacíos de conocimiento de su organización"
  ON ai_knowledge_gaps
  FOR INSERT
  WITH CHECK (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

-- Política de actualización para resolver o descartar vacíos de conocimiento
CREATE POLICY "Miembros actualizan vacíos de conocimiento de su organización"
  ON ai_knowledge_gaps
  FOR UPDATE
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

-- Comentario descriptivo
COMMENT ON TABLE ai_knowledge_gaps IS 'Registra las preguntas que la IA de ventas no pudo responder para alimentar el bucle de entrenamiento continuo';

