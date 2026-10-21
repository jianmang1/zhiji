-- ADR-004: user_id uuid -> text (CloudBase auth.uid()/sub 为数字/字符串 ID)
-- 应用于已执行的 001/002/003 之后；不要回滚或改动已应用迁移。

-- 1) 删除引用 auth.uid()::uuid 的旧 RLS 策略
DROP POLICY IF EXISTS events_owner ON public.events;
DROP POLICY IF EXISTS goals_owner ON public.goals;
DROP POLICY IF EXISTS plans_owner ON public.plans;
DROP POLICY IF EXISTS tags_owner ON public.tags;
DROP POLICY IF EXISTS analytics_events_owner ON public.analytics_events;
DROP POLICY IF EXISTS profiles_owner ON public.profiles;

-- 2) user_id 列 uuid -> text（含 profiles 主键）
ALTER TABLE public.events ALTER COLUMN user_id TYPE text;
ALTER TABLE public.goals ALTER COLUMN user_id TYPE text;
ALTER TABLE public.plans ALTER COLUMN user_id TYPE text;
ALTER TABLE public.analytics_events ALTER COLUMN user_id TYPE text;
ALTER TABLE public.profiles ALTER COLUMN user_id TYPE text;

-- 3) 重建 RLS 策略：auth.uid()::text（text=text，杜绝类型转换失败）
CREATE POLICY events_owner ON public.events FOR ALL TO authenticated
  USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY goals_owner ON public.goals FOR ALL TO authenticated
  USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY plans_owner ON public.plans FOR ALL TO authenticated
  USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY tags_owner ON public.tags FOR ALL TO authenticated
  USING (event_id IN (SELECT id FROM public.events WHERE user_id = auth.uid()::text))
  WITH CHECK (event_id IN (SELECT id FROM public.events WHERE user_id = auth.uid()::text));
CREATE POLICY analytics_events_owner ON public.analytics_events FOR ALL TO authenticated
  USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY profiles_owner ON public.profiles FOR ALL TO authenticated
  USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
