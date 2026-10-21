-- Phase 3 A1: attach analytics events to an experiment and variant.
-- Existing rows remain valid and NULL means not part of an experiment.
ALTER TABLE public.analytics_events
    ADD COLUMN IF NOT EXISTS experiment_id text;

CREATE INDEX IF NOT EXISTS ix_analytics_experiment_variant_ts
    ON public.analytics_events (experiment_id, variant, ts)
    WHERE experiment_id IS NOT NULL AND variant IS NOT NULL;

-- Rollback:
-- DROP INDEX IF EXISTS public.ix_analytics_experiment_variant_ts;
-- ALTER TABLE public.analytics_events DROP COLUMN IF EXISTS experiment_id;
