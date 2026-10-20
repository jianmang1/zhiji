-- 迁移：调整 events / goals 的 domain CHECK 约束（v1.1 三王）
-- 背景：PO 决策取消 consumption 维度、黄毛王改为异性交往(dating)、v1 仅三域。
--       capability/interest 后续扩展版本再加入。
-- 对应契约：docs/cloudbase-contract.md v1.1 §2 / §3
-- 约束名约定：PostgreSQL 对内联 CHECK 自动命名为 <table>_<column>_check
--           即 events_domain_check / goals_domain_check。若实际名不同，部署时按需修正。
-- 部署：由 Codex 通过 managePgDatabase applyMigration 执行（需带云端 PG 环境）。

-- ===================== UP =====================
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_domain_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_domain_check
  CHECK (domain IN ('health','work','dating'));

ALTER TABLE public.goals
  DROP CONSTRAINT IF EXISTS goals_domain_check;
ALTER TABLE public.goals
  ADD CONSTRAINT goals_domain_check
  CHECK (domain IN ('health','work','dating'));

-- ===================== DOWN =====================
-- ALTER TABLE public.events
--   DROP CONSTRAINT IF EXISTS events_domain_check;
-- ALTER TABLE public.events
--   ADD CONSTRAINT events_domain_check
--   CHECK (domain IN ('health','work','consumption','capability','interest'));
--
-- ALTER TABLE public.goals
--   DROP CONSTRAINT IF EXISTS goals_domain_check;
-- ALTER TABLE public.goals
--   ADD CONSTRAINT goals_domain_check
--   CHECK (domain IN ('health','work','consumption','capability','interest'));
