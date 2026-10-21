> ⚠️ **本文件已 SUPERSEDED（历史归档，勿作当前依据）** —— 写于 Sprint 初（PR #1 仍 OPEN、仅 `recordEvent` 上线之时）。其"PR #1 未合并 / 仅 recordEvent 部署 / 双用户冒烟未跑"等陈述**已不成立**。
> 当前权威事实（git 远端，`origin/main = 00c9102`）：PR #1 已合并（`b51c386` 签核 v1 E2E2 闭环）；四函数均部署并通过 E2E2（`recordEvent`/`listEvents`/`generatePlan`/`getFunnel` 全 `Active`）；PR #5（`00c9102`）已补契约 §5 状态列与 `integration-checkpoint-20261021.md`。
> **当前执行以 `tech-lead-directive-phase3-20261021.md` 为准**；部署/验收事实以 `integration-checkpoint-20261021.md` 为准。
> ⚠️ 所有 KB 指令文件 mtime 均为 11:41（批量 checkout/刷新），**mtime 不可用于判断权威性** —— 以文件顶部状态框 + git 远端为准。

# Tech Lead 指令 · 2026-10-21（自治模式 · PO 不在线）〔本件为历史归档，已 SUPERSEDED〕

> 本指令由 Tech Lead 在 Aurora KB 内闭环发出，不经 PO 转述。Codex / DeepSeek 读此文档继续执行。

## 0. 边界重申（纠正：禁止向 PO 实时转述）
PO 已明确：三 Agent 经 Aurora KB 自驱，**不等待 PO 在线协调，状态/需求不经二次转述**。
- Tech Lead 读 KB（Agent 的 PR 描述与状态更新）→ 直接裁决/派发指令到 KB → Agent 读 KB 继续。
- PO 仅在返回时读 `docs/integration-checkpoint-*.md`，**不在 Sprint 中途被拉入任何协调**。
- 章程 §2.3「经 Tech Lead 转述 PO」已作废：三类升级事项改为异步写入 KB 升级区，PO 返回时批阅，绝不实时 relay。

## 1. Codex 当前状态（已记入 KB，非转述 PO）
- 迁移：3 个 migration 已应用核对通过；RLS `auth.uid()::uuid` 修复 `ee8eb63` 已推送 PR #1。✅
- 部署：4 函数仅 recordEvent（Py3.11 HTTP）上线；listEvents / generatePlan / getFunnel 卡在 COS 60s 超时 + ZIP > 1.5MB 被拒。⛔
- 验收：缺 `FERNET_ENCRYPTION_KEY` 与测试用户 A/B token；双用户 RLS 冒烟未跑。⛔
- 结论（历史，已被推翻）：PR #1 未达部署验收，暂不可合并。→ 同意 Codex 判断，维持 open，不合并。
  - *更正（见顶部 SUPERSEDED 框）：PR #1 已于 `b51c386` 合并，四函数均 E2E2 通过；此结论不再适用。*

## 2. Tech Lead 裁决（全部在自治范围内可解，无需 PO）
| 阻塞项 | 裁决 | 执行方 |
|---|---|---|
| COS 60s 超时 / ZIP 1.5MB 上限 | 属部署工程问题，Codex 自有。路径（任选并写 `cloudbase/README.md` 部署段）：①Web 控制台手动上传大包；②依赖瘦身（仅留 runtime 必需，剔除 dev/test 依赖与 `__pycache__`）；③用 CloudBase 层(layer) 剥离冷启依赖；④CLI 异步/分段上传。 | Codex |
| `FERNET_ENCRYPTION_KEY` | 由 Codex 本地 `Fernet.generate_key()` 生成并写入 CloudBase 函数环境变量（v1 冒烟用，非生产密钥）。Tech Lead 批准。 | Codex |
| 测试用户 A/B token | 用 CloudBase Auth 注册两个测试用户并取 token（或本地 signUp 流程），存入 `cloudbase/tests/fixtures/`，**不入库主仓密钥区**。 | Codex |
| getFunnel 跨用户 cohort | **Tech Lead 架构裁决**：v1 仅按 RLS 汇总调用者可见数据；跨用户 cohort 汇总属 Phase 3（需单独权限设计，非 v1 范围，**不升级 PO**）。 | 已定 |
| 未提交后端 WIP（funnel.py / score_engine.py / getFunnel/ + handlers 等 +404 行） | 须提交并推送到 `feat/getfunnel-deploy` 使 PR #1 与本地一致；**切勿带入 `feat/frontend-phase2`**。Codex 在其自身 checkout 完成，base 冲突自行 rebase。 | Codex |

## 3. 完成判据（PR #1 可合并门禁）
1. 4 函数全部部署可达（含 getFunnel）。
2. 双用户 A/B 冒烟：事件录入/查询 OK + generatePlan OK + 跨用户 RLS 隔离验证（A 看不到 B 数据）。
3. §10 四项证据齐：远端分支 + 哈希 + 构建/部署日志 + PR。
达成后 Codex 在 PR 描述更新证据，Tech Lead 在 checkpoint（≤48h）合并。

## 4. 给 PO
你无需做任何事，本 Sprint 中途不向你 relay。完成后你会在此目录看到 `docs/integration-checkpoint-20261021.md`。
