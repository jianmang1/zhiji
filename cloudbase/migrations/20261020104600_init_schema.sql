CREATE TABLE public.events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  domain text NOT NULL CHECK (domain IN ('health','work','consumption','capability','interest')),
  type text NOT NULL,
  ts timestamptz NOT NULL,
  payload jsonb NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_events_user_ts ON public.events (user_id, ts);
CREATE INDEX ix_events_domain ON public.events (domain);

CREATE TABLE public.tags (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id bigint NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  tag text NOT NULL
);
CREATE INDEX ix_tags_tag ON public.tags (tag);

CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  domain text NOT NULL CHECK (domain IN ('health','work','consumption','capability','interest')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','done','dropped')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_goals_user_id ON public.goals (user_id);

CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  generated_by text NOT NULL,
  based_on jsonb NOT NULL,
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_plans_user_id ON public.plans (user_id);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY events_owner ON public.events FOR ALL TO authenticated USING (user_id = auth.uid()::uuid) WITH CHECK (user_id = auth.uid()::uuid);
CREATE POLICY goals_owner ON public.goals FOR ALL TO authenticated USING (user_id = auth.uid()::uuid) WITH CHECK (user_id = auth.uid()::uuid);
CREATE POLICY plans_owner ON public.plans FOR ALL TO authenticated USING (user_id = auth.uid()::uuid) WITH CHECK (user_id = auth.uid()::uuid);
CREATE POLICY tags_owner ON public.tags FOR ALL TO authenticated USING (event_id IN (SELECT id FROM public.events WHERE user_id = auth.uid()::uuid)) WITH CHECK (event_id IN (SELECT id FROM public.events WHERE user_id = auth.uid()::uuid));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.events, public.tags, public.goals, public.plans TO authenticated;
GRANT USAGE ON SEQUENCE public.events_id_seq, public.tags_id_seq TO authenticated;
