  -- Telemetría exacta de costos, caché y guardias en ai_runs + agregación SQL sin límite de filas para el ERP.

  ALTER TABLE public.ai_runs
    ADD COLUMN IF NOT EXISTS cached_tokens INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS guard_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

  CREATE INDEX IF NOT EXISTS idx_ai_runs_provider_created_at
    ON public.ai_runs (provider, created_at DESC);

  CREATE OR REPLACE FUNCTION public.get_openai_spend_since(p_since TIMESTAMPTZ)
  RETURNS TABLE (
    total_cost_usd NUMERIC,
    total_runs BIGINT,
    total_tokens BIGINT
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  AS $$
    SELECT
      COALESCE(SUM(
        CASE
          WHEN r.cost_usd > 0 THEN r.cost_usd
          ELSE (
            (
              GREATEST(0, COALESCE(r.prompt_tokens, 0) - LEAST(COALESCE(r.prompt_tokens, 0), COALESCE(r.cached_tokens, 0))) *
              CASE
                WHEN LOWER(COALESCE(r.model, '')) LIKE 'gpt-4.1-mini%' THEN 0.40
                WHEN LOWER(COALESCE(r.model, '')) LIKE 'gpt-4o-mini%' THEN 0.15
                WHEN LOWER(COALESCE(r.model, '')) LIKE 'gpt-4o%' THEN 2.50
                WHEN LOWER(COALESCE(r.model, '')) LIKE 'gpt-4.1-nano%' THEN 0.10
                ELSE 0.15
              END
              +
              LEAST(COALESCE(r.prompt_tokens, 0), COALESCE(r.cached_tokens, 0)) *
              CASE
                WHEN LOWER(COALESCE(r.model, '')) LIKE 'gpt-4.1-mini%' THEN 0.10
                WHEN LOWER(COALESCE(r.model, '')) LIKE 'gpt-4o-mini%' THEN 0.075
                WHEN LOWER(COALESCE(r.model, '')) LIKE 'gpt-4o%' THEN 1.25
                WHEN LOWER(COALESCE(r.model, '')) LIKE 'gpt-4.1-nano%' THEN 0.025
                ELSE 0.075
              END
              +
              COALESCE(r.completion_tokens, 0) *
              CASE
                WHEN LOWER(COALESCE(r.model, '')) LIKE 'gpt-4.1-mini%' THEN 1.60
                WHEN LOWER(COALESCE(r.model, '')) LIKE 'gpt-4o-mini%' THEN 0.60
                WHEN LOWER(COALESCE(r.model, '')) LIKE 'gpt-4o%' THEN 10.00
                WHEN LOWER(COALESCE(r.model, '')) LIKE 'gpt-4.1-nano%' THEN 0.40
                ELSE 0.60
              END
            ) / 1000000.0
          )
        END
      ), 0)::NUMERIC AS total_cost_usd,
      COUNT(*)::BIGINT AS total_runs,
      COALESCE(SUM(COALESCE(r.total_tokens, COALESCE(r.prompt_tokens, 0) + COALESCE(r.completion_tokens, 0))), 0)::BIGINT AS total_tokens
    FROM public.ai_runs r
    WHERE r.provider = 'openai'
      AND r.created_at >= p_since;
  $$;
