# Tech Lead 指令（user_id 类型修复）— 2026-10-21

- **指向**：Codex（后端，分支 `feat/getfunnel-deploy`）
- **裁定依据**：`docs/adr/ADR-004-user-id-type.md`（本文即执行细则）
- **属性**：契约冲突裁定，属自治范围，**不升 PO**，Codex 自驱执行

---

## 1. 阻塞确认（你已报告，Tech Lead 已核实）

- 报错 `DATABASE_22P02` = PostgreSQL `invalid_text_representation`。
- 根因**两层**：
  1. 库：`user_id uuid` + RLS `auth.uid()::uuid` 对数字 ID 强转 `uuid` 失败；
  2. 代码：`auth.py:32` `str(UUID(claims["sub"]))` 对数字 `sub` 抛 `ValueError`。
- 结论：**非登录问题**，是契约 / 类型冲突。账号密码 / token 均正常，PO 无需提供任何凭证。

---

## 2. 新迁移（放到 `cloudbase/migrations/`，文件名固定）

`20261021093200_fix_user_id_text.sql`

```sql
-- ADR-004: user_id uuid -> text (CloudBase auth.uid()/sub 为数字/字符串 ID)
-- 应用于已执行的 001/002/003 之后；不要回滚或改动已应用迁移。

-- 1) 删除引用 auth.uid()::uuid 的旧 RLS 策略
DROP POLICY IF EXISTS events_owner       ON public.events;
DROP POLICY IF EXISTS goals_owner        ON public.goals;
DROP POLICY IF EXISTS plans_owner        ON public.plans;
DROP POLICY IF EXISTS tags_owner         ON public.tags;
DROP POLICY IF EXISTS analytics_events_owner ON public.analytics_events;
DROP POLICY IF EXISTS profiles_owner     ON public.profiles;

-- 2) user_id 列 uuid -> text（含 profiles 主键）
ALTER TABLE public.events          ALTER COLUMN user_id TYPE text;
ALTER TABLE public.goals           ALTER COLUMN user_id TYPE text;
ALTER TABLE public.plans           ALTER COLUMN user_id TYPE text;
ALTER TABLE public.analytics_events ALTER COLUMN user_id TYPE text;
ALTER TABLE public.profiles        ALTER COLUMN user_id TYPE text;

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
```

---

## 3. 代码改动（`cloudbase/src/zhiji_cloudbase/auth.py`）

- 删除第 3 行：`from uuid import UUID`
- 第 32 行：`return str(UUID(claims["sub"]))` → `return str(claims["sub"])`

---

## 4. 契约同步（`docs/cloudbase-contract.md`，在后端分支改，随 PR #1 合入）

- 第 12–13 行叙述：`uuid` → `text`，`auth.uid()::uuid` → `auth.uid()::text`
- §3 / §5 / §8 各表 `| user_id | uuid |` → `| user_id | text |`
- 第 81 行 RLS 策略：去掉 `::uuid`（写为 `auth.uid()` 文字说明，策略实质为 `auth.uid()::text`）
- 第 177 行 analytics RLS：同上
- 顶部或相应处加注：`> 注：user_id 类型经 ADR-004（2026-10-21）由 uuid 改为 text。`

---

## 5. 执行顺序（在你已登录的 CloudBase 会话内）

1. 写迁移文件 + 改 `auth.py` + 改契约（本地）。
2. 跑后端单测：`pytest` 应仍全绿（预期 22 passed）。
3. 应用新迁移（ALTER 已应用库；**不要**回滚 `001/002/003`）。
4. 重新部署 4 个函数（`recordEvent` / `listEvents` / `generatePlan` / `getFunnel`）；本次一并解决此前 COS 60s 超时 / ZIP >1.5MB（用 Web 控制台上传或依赖瘦身 / layer）。
5. 配 `FERNET_ENCRYPTION_KEY`（本地 `Fernet.generate_key()`，仅写函数 env，不进主仓）；用 CloudBase Auth 自注册取 A/B 测试 token，存 fixtures（不进主仓密钥）。
6. 重跑双用户 RLS 冒烟：A 只见 A、B 只见 B、无 `22P02`。
7. commit + push 到 `feat/getfunnel-deploy`，更新 PR #1。

---

## 6. 验收门槛（满足后 Tech Lead 合 PR #1）

- [ ] 4 函数已部署且可调用
- [ ] 双用户冒烟通过（隔离正确、无 `22P02`）
- [ ] 单测全绿
- [ ] 契约已同步 ADR-004

---

## 7. 边界重申

- 此冲突 Tech Lead 已裁定，**不升 PO**；Codex 自驱执行即可。
- `getFunnel` 跨用户 cohort 仍按先前裁定：v1 仅按 RLS 汇总调用者可见数据，cohort 留 Phase 3。
- DeepSeek（前端）无需改动——前端不经手 DB 列类型。
