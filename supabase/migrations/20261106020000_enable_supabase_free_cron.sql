-- ==============================================================================
-- Migración: Cron Job Gratuito en Supabase (pg_cron + pg_net)
-- ==============================================================================
-- Permite programar los recordatorios de citas (cada 15m) y la limpieza de
-- almacenamiento de videos (diario) de forma 100% gratuita directamente en la
-- base de datos Supabase, sin depender de los límites de Vercel Hobby (1 cron/día).
--
-- INSTRUCCIONES:
-- 1. Reemplaza '<TU_DOMINIO_CRM>' por tu URL de producción (ej. 'crm.synqo.dev').
-- 2. Reemplaza '<TU_CRON_SECRET>' por el valor de tu variable CRON_SECRET en .env.
-- 3. Ejecuta este script en el SQL Editor de tu proyecto en Supabase Dashboard.
-- ==============================================================================

-- 1. Activar extensiones requeridas (gratuitas en Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Eliminar tareas anteriores si existieran para evitar duplicidad
DO $$
BEGIN
  PERFORM cron.unschedule('synqo-appointment-reminders');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('synqo-cleanup-storage');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 3. Programar recordatorios de citas cada 15 minutos (Anti-No-Show)
-- Descomenta y configura las variables antes de ejecutar:
/*
SELECT cron.schedule(
  'synqo-appointment-reminders',
  '*/15 * * * *',
  $$
  SELECT net.http_get(
    url := 'https://<TU_DOMINIO_CRM>/api/cron/appointment-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <TU_CRON_SECRET>',
      'Content-Type', 'application/json'
    )
  );
  $$
);

-- 4. Programar limpieza de videos de más de 45 días (1 vez al día a las 03:00 AM UTC)
SELECT cron.schedule(
  'synqo-cleanup-storage',
  '0 3 * * *',
  $$
  SELECT net.http_get(
    url := 'https://<TU_DOMINIO_CRM>/api/cron/cleanup-storage',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <TU_CRON_SECRET>',
      'Content-Type', 'application/json'
    )
  );
  $$
);
*/
