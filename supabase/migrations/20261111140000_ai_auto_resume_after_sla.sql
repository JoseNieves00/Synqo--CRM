-- ==============================================================================
-- Migración: Auto-recuperación de la IA tras SLA de relevo vencido
-- ==============================================================================
-- Problema: cuando un chat pasa a asesor humano (handoff) y NINGÚN asesor
-- responde —ni tras la reasignación autónoma—, el cliente se queda sin
-- respuesta para siempre (IA apagada + cola muerta).
--
-- Solución: si el asesor no respondió en ai_auto_resume_minutes desde la última
-- interacción del cliente, la IA retoma la atención autónomamente y responde
-- vía la cola de reintentos (AiRetryService.strategy='regenerate').
-- Guardas: no retoma comprobantes de pago (verificación humana), opt-outs,
-- conversaciones cerradas ni ganados/perdidos.
-- ==============================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS ai_auto_resume_minutes INTEGER NOT NULL DEFAULT 30;

-- 0 = desactivado por organización
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS org_ai_auto_resume_check;
ALTER TABLE organizations
  ADD CONSTRAINT org_ai_auto_resume_check CHECK (ai_auto_resume_minutes >= 0);

COMMENT ON COLUMN organizations.ai_auto_resume_minutes IS
  'Minutos sin respuesta humana tras un handoff antes de que la IA retome la atención (0 = desactivado).';
