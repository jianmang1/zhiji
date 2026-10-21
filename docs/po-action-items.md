# 待 PO 处理（自主心跳每轮更新）

> 由「执己 Phase3 自主心跳」每轮覆盖更新。列出需要你（PO）介入的事项：拍板决策、唤醒 Codex/DeepSeek 会话。其余执行类问题由三方在 Aurora KB 自治闭环，不在此列。
> 格式：🔴 拍板 / 🟡 唤醒 Codex（CloudBase 凭证） / 🟢 唤醒 DeepSeek（前端）。
> 本轮回合：2026-10-21T17:21+08:00（第 12 轮）。

## 📌 本轮核验结论（Tech Lead 自治核验，无需你介入）
- **PR#10 已合并 → `origin/main = bd2155a`**：文档 PR `docs/privacy-kb-approval` 把此前隔离快照中的 KB 指令文档（phase3-backlog / upgrade-queue / 多份 tech-lead-directive）持久化入 main，并落盘 **ADR-006 PO 隐私裁定（本期不开放跨用户 cohort）**。本地 `main` 已 ff 同步至 `bd2155a`（干净树、纯 ff、未推送）。
- **已合并 PR#9 → `origin/main` 含 PR#9(`84fce6b`)+PR#10(`bd2155a`)**：Codex 的 Phase3 后端 **A1/A3/A4/A5/A6 全入 main**。硬门禁通过：远端分支(`origin/feat/phase3-a1-a6`) + PR#9 + hash `85a8153` + 可复现 `pytest 25 passed` + CloudBase 实测日志（含逐请求耗时、无效/缺失 token→HTTP 401 鉴权验证、CLS 现已可查）。
- **A1 · getFunnel 聚合增强**：新增 `channel_quality`/`trend`/`experiments` 拆分 + 迁移 `20261021120000_analytics_experiments`（PG 已应用）。
- **A3 · CLS 观测**：日志集/Topic 已建（保留 7 天），四函数已绑定；CLI `tcb logs` 现已可查（此前 `LOG_SERVICE_NOT_ENABLED` 已消除）——彻底补上 v1 部署的日志缺口。
- **A4 · generatePlan AI 降级**：`provider/model` 为空或异常时规则兜底，返回 `ai_enabled:false` + `content` + `generated_by=rules-fallback`；正常路径 `ai_enabled:true`。
- **A5 · cohort 权限**：ADR-006 权限边界已 Accepted；PO 已裁定**当前产品周期不开放跨用户 cohort**，`getFunnel` 保持调用者 JWT/RLS 范围，未批准跨用户聚合实现或上线。未来如重提，须重新完成隐私评审。
- **A6 · 公网路由**：默认 HTTPS 域名已建四函数路径；**匿名开关未启用，函数仍强制 Bearer token**（无效/缺失 token → HTTP 401，已实测）——公网暴露下鉴权仍强制。
- **契约治理**：冲突按"保留 main E2E2 状态列"解决，并入 PR#9 补齐并扩展 §5.1/§6/§7/§8（main 此前 lineage 缺这些章节：`analytics_events` 表、`experiment_id`、渠道质量/趋势/A-B 拆分、RLS 重申）。无伪造、无降级。
- **诚实待办（不掩盖）**：① `FERNET_ENCRYPTION_KEY` 已在 CloudBase 控制台恢复（`recordEvent`/`listEvents`/`generatePlan` 环境变量已配置，checkpoint 已核对），但**恢复后的 health/dating 加密写入/读取/解密 E2E 尚未复测**——需应用侧测试用户登录态（前端 access token），腾讯云控制台登录态不能替代该用户 token（见 `tech-lead-directive-e2e-health-dating-20261021.md`）；② 本地托管环境无 pytest，未独立重跑，验证依据采用 Codex 文档化 `25 passed` + 逐行审过的测试代码（断言真实有效）。

## 🔴 拍板 / 授权事项（需你决策）
- **🔴 `FERNET_ENCRYPTION_KEY` 恢复（环境负责人）**：原密钥已在本机 `backend/.env` 找到并通过 Fernet 格式校验，但 CloudBase 控制台当前会话未登录，尚未回写云函数环境变量。不得生成替代密钥；登录后恢复原值，再部署/验证 health/dating 闭环。
- **ADR-006 隐私裁定**：已完成。当前产品周期不开放跨用户 cohort；维持调用者 JWT/RLS，无跨用户查询、无 `service_role`、不放宽 RLS。未来重提须单独评审并批准。
- **KB 文档入库**：已批准；本次从隔离快照挑出缺失的 backlog、历史派发指令及 upgrade queue，随文档 PR 入库。隔离分支中的后端代码不纳入。

## 🟡 需唤醒 Codex 会话（CloudBase 凭证类）
- **health/dating 加密读写 E2E（已派发 directive-e2e-health-dating）**：`FERNET_ENCRYPTION_KEY` 已在 CloudBase 控制台恢复；E2E 需**你（PO）在前端用测试账号保持登录**驱动 health(`body_sense`)+dating 写入并回读明文，Codex 做服务端密文/解密/RLS 隔离核验（路线 A 零 token 外传；或路线 B 你把前端 token 直接给 Codex，不经 Tech Lead）。**唤醒 Codex 执行并补录 checkpoint 敏感域证据。**
- A1/A3/A4/A5/A6 已全部随 PR#9 合并，**无需再唤醒**；A5 的隐私决定已记录为本期不开放跨用户 cohort。

## 🟢 唤醒 DeepSeek 会话（前端待办）
> **DeepSeek 当前无任何待办。** 前端链路（A2/A7/A8/plans/diagnostics/body_sense）已全部合入 main（PR#4 + PR#8 + PR#9 后端增强），B5=A 已落地。无需唤醒。

## 本轮结论
**`origin/main = bd2155a`（PR#9 后端 A1–A6 + PR#10 KB 持久化与 ADR-006 隐私裁定均已合）。`FERNET_ENCRYPTION_KEY` 已在 CloudBase 控制台恢复**（环境变量已配，checkpoint 已核对）。剩余唯一活项：**🟡 唤醒 Codex 执行 health/dating 加密读写 E2E**——需你（PO）在前端用测试账号保持登录驱动真实用户路径，Codex 做服务端密文/解密/RLS 隔离核验（directive 已派发）。token 边界：仅前端↔Codex，不经 Tech Lead。心跳每轮刷新本文件。
