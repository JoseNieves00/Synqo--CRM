-- ==============================================================================
-- Migración: Soporte de Estados de Entrega (Ticks), Respuestas Citadas,
-- Contador de No Leídos y Pausa Temporal de IA con Auto-Reactivación
-- ==============================================================================

-- 1. Soporte de estados de entrega en mensajes ('pending' | 'sent' | 'delivered' | 'read' | 'failed')
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent';

-- 2. Soporte de citar/responder mensaje anterior
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

-- 3. Soporte de último mensaje y contador de no leídos en contactos para Inbox instantáneo
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS unread_count INTEGER DEFAULT 0;

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS last_message JSONB DEFAULT NULL;

-- 4. Soporte para snooze / pausa temporal de la IA con auto-reanudación
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS ai_snooze_until TIMESTAMPTZ DEFAULT NULL;

-- 5. Índices de aceleración
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_contacts_unread ON contacts(organization_id, unread_count DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_ai_snooze ON contacts(ai_snooze_until) WHERE ai_snooze_until IS NOT NULL;
