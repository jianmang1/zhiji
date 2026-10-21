# ADR-004: `user_id` 列类型由 `uuid` 改为 `text`

- **状态（Status）**：已采纳（Accepted）
- **日期**：2026-10-21
- **裁定人**：Tech Lead（经 PO 授权——见 2026-10-21 指示「契约冲突先由 Tech Lead 在 KB 裁定并记录 ADR」）
- **废止（Supersedes）**：`cloudbase-contract.md` v1.4 中 `user_id uuid` 与 RLS `auth.uid()::uuid` 的设计假设

---

## 1. 背景（Context）

设计期沿用了 Supabase 心智模型，假设 CloudBase 用户标识为 UUID，因此：

- 数据契约 v1.4（§3 / §5 / §8）将各业务表 `user_id` 定义为 `uuid`；
- 三份已应用迁移（`001_init_schema.sql` / `003_analytics_layer.sql`）的 RLS 策略写成 `user_id = auth.uid()::uuid`；
- 后端 `auth.py:user_id_from_token` 用 `str(UUID(claims["sub"]))` 把 JWT `sub` 强转为 UUID。

实际 CloudBase `auth.uid()` 与 JWT `sub` 返回的是**数字 / 字符串 ID**。测试用户（数字 ID）读取 `events` 时触发 `DATABASE_22P02`（PostgreSQL `invalid_text_representation`）：

- RLS 把数字 ID 强转 `uuid` 失败；
- 同时 `auth.py` 的 `UUID("数字")` 直接抛 `ValueError`。

双用户 RLS 隔离冒烟因此完全阻塞，且**与登录无关**（账号/密码/token 均正常）。

---

## 2. 决策（Decision）

1. 所有业务表的 `user_id` 列类型由 `uuid` 改为 `text`：`events`、`goals`、`plans`、`analytics_events`、`profiles`（含 `profiles.user_id` 主键）。
2. RLS 策略由 `auth.uid()::uuid` 改为 `auth.uid()::text`——显式转 `text`，保证 `text = text` 比较，彻底消除类型转换失败；兼容 `auth.uid()` 返回 `text` / 数字 / `uuid` 任一形态。
3. `auth.py:user_id_from_token` 改为 `return str(claims["sub"])`，移除 `UUID(...)` 强转与 `from uuid import UUID` 导入。
4. 内部主键 `id uuid DEFAULT gen_random_uuid()` 保持不变（与用户身份无关，仅为行标识）。
5. **不修改**已应用的迁移 `001/002/003`；新增迁移 `20261021093200_fix_user_id_text.sql` 执行「DROP 旧 policy → ALTER COLUMN → CREATE 新 policy」。

---

## 3. 后果（Consequences）

- ✅ 解除双用户 RLS 冒烟阻塞，v1 部署验收可继续推进。
- 契约 v1.4 中 `user_id` 相关描述需同步更新（`uuid`→`text`、`auth.uid()::uuid`→`auth.uid()::text`），由 Codex 在后端分支一并提交（随 PR #1 合入）。
- `user_id` 不再有 UUID 格式约束；已有数据（若有）为 uuid 字符串，转 `text` 无损。
- `text` 主键较 `uuid` 略低效，v1 规模可忽略；如未来需优化可引入独立 surrogate key（非本期范围）。
- 后端单测不受影响：测试用 uuid 形态 `sub` 仍可被 `str(claims["sub"])` 正确返回并存入 `text` 列，测试保持绿色。
- 前端无需改动：前端仅经 `cloud.auth` 取 token 并调用云函数，不直接定义 DB 列类型。

---

## 4. 被否决的替代方案（Alternatives Considered）

- **A. 应用层把数字 uid 映射为 UUIDv5**：需映射表 / 确定性哈希，RLS 仍需一致处理，无收益且增加复杂度。❌
- **B. 保留 `uuid` 列 + 新增 `users` 映射表（CloudBase uid → 内部 uuid）**：违反契约「不自建 users 表」原则，过度设计。❌
- **C. 仅改 RLS 不改列类型**：列仍为 `uuid`，插入 / 比较仍需转换，`22P02` 不根除。❌

---

## 5. 验证（Validation）

Codex 应用新迁移 + 改 `auth.py` + 部署四函数 + 重跑双用户冒烟：

- A 用户读取仅见 A 的数据，B 用户仅见 B 的数据（RLS 隔离正确）；
- 全程无 `DATABASE_22P02` / UUID 转换错误；
- `auth.uid()` 返回值与存储 `user_id` 一致（冒烟断言非空，间接校验两者同源）。

---

## 6. 关联

- 执行细则：`docs/tech-lead-directive-userid-20261021.md`（给 Codex 的完整 SQL + diff + 步骤）
- 受影响契约章节：`cloudbase-contract.md` §3 / §5 / §8 及第 12–13、81、177 行
- 受影响代码：`cloudbase/src/zhiji_cloudbase/auth.py:3,32`
- 受影响迁移：`cloudbase/migrations/20261020104600_init_schema.sql`、`20261020174000_analytics_layer.sql`
