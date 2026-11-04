-- ==============================================================================
-- Migración: Índices de Rendimiento Críticos para Inbox & Relevos en Vivo
-- ==============================================================================

-- 1. Índice compuesto para listado de contactos del Inbox ordenados por actividad
-- Optimiza consultas: .eq('organization_id', orgId).is('deleted_at', null).order('updated_at', { ascending: false })
CREATE INDEX IF NOT EXISTS idx_contacts_inbox_active 
ON contacts(organization_id, updated_at DESC) 
WHERE deleted_at IS NULL;

-- 2. Índice compuesto para consulta Anti-Visto / Relevos desatendidos
-- Optimiza: .eq('organization_id', orgId).eq('is_ai_active', false).order('updated_at', { ascending: false })
CREATE INDEX IF NOT EXISTS idx_contacts_unattended_handoffs
ON contacts(organization_id, is_ai_active, updated_at DESC)
WHERE deleted_at IS NULL;

-- 3. Índice compuesto para mensajes recientes por contacto
-- Optimiza: .eq('contact_id', contactId).order('created_at', { ascending: false })
CREATE INDEX IF NOT EXISTS idx_messages_contact_desc
ON messages(contact_id, created_at DESC);
