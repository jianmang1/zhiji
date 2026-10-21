-- Migration: 增长漏斗与精细化分析层（前向兼容 · v1 建表，Phase 3 计算）
-- 依据 cloudbase-contract.md §8。不改动已冻结的 events/tags/goals/plans 结构。
-- 回滚见文件末尾。

-- 1) analytics_events（行为/漏斗事件）
CREATE TABLE IF NOT EXISTS public.analytics_events (
    id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     uuid        NOT NULL,
    name        text        NOT NULL,
    step        text,
    domain      text        CHECK (domain IN ('health', 'work', 'dating')),
    channel     text,
    region      text,
    user_type   text,
    variant     text,
    payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    ts          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_analytics_user_ts ON public.analytics_events (user_id, ts);
CREATE INDEX IF NOT EXISTS ix_analytics_name    ON public.analytics_events (name);

-- 2) profiles（用户分群维度）
CREATE TABLE IF NOT EXISTS public.profiles (
    user_id         uuid        PRIMARY KEY,
    region          text,
    user_type       text        NOT NULL DEFAULT 'new' CHECK (user_type IN ('new', 'returning')),
    acquire_channel text,
    gender          text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- 3) RLS：仅本人可读写；auth.uid() returns text in CloudBase PG, cast to UUID.
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analytics_events_owner ON public.analytics_events;
CREATE POLICY analytics_events_owner
    ON public.analytics_events
    FOR ALL
    USING (user_id = auth.uid()::uuid)
    WITH CHECK (user_id = auth.uid()::uuid);

DROP POLICY IF EXISTS profiles_owner ON public.profiles;
CREATE POLICY profiles_owner
    ON public.profiles
    FOR ALL
    USING (user_id = auth.uid()::uuid)
    WITH CHECK (user_id = auth.uid()::uuid);

GRANT ALL ON public.analytics_events TO authenticated;
GRANT ALL ON public.profiles       TO authenticated;

-- === 回滚 (rollback) ===
-- DROP POLICY IF EXISTS analytics_events_owner ON public.analytics_events;
-- DROP POLICY IF EXISTS profiles_owner ON public.profiles;
-- ALTER TABLE public.analytics_events DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
-- DROP TABLE IF EXISTS public.analytics_events;
-- DROP TABLE IF EXISTS public.profiles;
