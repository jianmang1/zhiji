# 待 PO 处理（自主心跳每轮更新）

> 由「执己 Phase3 自主心跳」每轮覆盖更新。列出需要你（PO）介入的事项：拍板决策、唤醒 Codex/DeepSeek 会话。其余执行类问题由三方在 Aurora KB 自治闭环，不在此列。
> 格式：🔴 拍板 / 🟡 唤醒 Codex（CloudBase 凭证） / 🟢 唤醒 DeepSeek（前端）。
> 本轮回合：2026-10-21T16:25+08:00（第 10 轮）。

## 📌 本轮核验结论（Tech Lead 自治核验，无需你介入）
- **已合并 PR#9 → `origin/main = 84fce6b`**：Codex 的 Phase3 后端 **A1/A3/A4/A5/A6 全入 main**。硬门禁通过：远端分支(`origin/feat/phase3-a1-a6`) + PR#9 + hash `85a8153` + 可复现 `pytest 25 passed` + CloudBase 实测日志（含逐请求耗时、无效/缺失 token→HTTP 401 鉴权验证、CLS 现已可查）。
- **A1 · getFunnel 聚合增强**：新增 `channel_quality`/`trend`/`experiments` 拆分 + 迁移 `20261021120000_analytics_experiments`（PG 已应用）。
- **A3 · CLS 观测**：日志集/Topic 已建（保留 7 天），四函数已绑定；CLI `tcb logs` 现已可查（此前 `LOG_SERVICE_NOT_ENABLED` 已消除）——彻底补上 v1 部署的日志缺口。
- **A4 · generatePlan AI 降级**：`provider/model` 为空或异常时规则兜底，返回 `ai_enabled:false` + `content` + `generated_by=rules-fallback`；正常路径 `ai_enabled:true`。
- **A5 · cohort 权限**：ADR-006 状态由 Proposed → **Tech Lead 已裁定边界（Accepted）**；跨用户聚合刻意**未实现**，仅定硬约束（无 `service_role`、无客户端授权、RLS 仅限调用者可见）。**跨用户聚合是否/如何上线 → 升你（隐私合规）**。
- **A6 · 公网路由**：默认 HTTPS 域名已建四函数路径；**匿名开关未启用，函数仍强制 Bearer token**（无效/缺失 token → HTTP 401，已实测）——公网暴露下鉴权仍强制。
- **契约治理**：冲突按"保留 main E2E2 状态列"解决，并入 PR#9 补齐并扩展 §5.1/§6/§7/§8（main 此前 lineage 缺这些章节：`analytics_events` 表、`experiment_id`、渠道质量/趋势/A-B 拆分、RLS 重申）。无伪造、无降级。
- **诚实待办（不掩盖）**：① 部署环境 `FERNET_ENCRYPTION_KEY` 为空 → health/dating 加密写入**未复测**（Codex 主动没碰敏感域）；② 本地托管环境无 pytest，未独立重跑，验证依据采用 Codex 文档化 `25 passed` + 逐行审过的测试代码（断言真实有效）。

## 🔴 拍板 / 授权事项（需你决策）
- **🔴 `FERNET_ENCRYPTION_KEY` 恢复（环境负责人）**：部署环境当前该密钥为空，health/dating 敏感域加密写入会失败；本轮 Codex 未碰敏感域。需在 CloudBase 函数环境变量**恢复原密钥**后再部署/验证 health/dating 闭环。密钥恢复属环境权限，Agent 不能自造 → 升你/环境负责人。
- **🔴 ADR-006 跨用户 cohort 上线 · 隐私裁定**：边界规则已 Accepted（硬约束）；但是否/如何上线跨用户聚合（看板受众、可信管理员身份来源、最小样本抑制、差分隐私、实施方式）属**隐私合规**，须你拍板。拍板前任何分支不得实现。
- **🔴 KB 文档入库持久化（批准）**：除心跳双件（本文件 + heartbeat-log.md）外，其余 KB 文档仍在 `recover/techlead-quarantine-20261021`（提交 c47909a，**DO NOT MERGE**）。请批准将其中的 KB 文档挑出整理合入 main 持久化（避免被 checkout/stash 误丢）；其中**后端代码部分已被 PR#9 干净取代**，仅 KB 文档需入库（恢复分支可随后弃用）。

## 🟡 需唤醒 Codex 会话（CloudBase 凭证类）
- **待 🔴 FERNET 密钥恢复后**：唤醒 Codex 复测 health/dating 加密写入/读取闭环（`recordEvent` + `listEvents` 敏感域），并补齐 `integration-checkpoint-20261021.md` 的敏感域证据。
- A1/A3/A4/A5/A6 已全部随 PR#9 合并，**无需再唤醒**；A5 的"实现"仍待你在上方 🔴 拍板。

## 🟢 唤醒 DeepSeek 会话（前端待办）
> **DeepSeek 当前无任何待办。** 前端链路（A2/A7/A8/plans/diagnostics/body_sense）已全部合入 main（PR#4 + PR#8 + PR#9 后端增强），B5=A 已落地。无需唤醒。

## 本轮结论
**PR#9 已合并 main(`84fce6b`)，Codex 后端 Phase3（A1/A3/A4/A5/A6）全部入主，硬门禁通过。** 剩余：🔴 **FERNET 密钥恢复 + ADR-006 隐私拍板 + KB 入库批准**；🟡 **密钥恢复后 Codex 复测 health/dating 闭环**。心跳每轮刷新本文件。
