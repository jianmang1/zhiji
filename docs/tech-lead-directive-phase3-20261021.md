# Tech Lead 指令 · Phase 3 派发（2026-10-21，第 2 轮修订）

> 状态事实源：git 远端（`git fetch` 后核对）。`origin/main = 351b5ad`（PR #5 @ `00c9102` 已合并契约 §5 + checkpoint；PR #4 @ `ea534e3` 已于第 5 轮心跳 non-ff 合并，合并提交 `351b5ad`；前序 PR #1 @ `b51c386` 已合并 v1 E2E2 闭环）；`feat/frontend-phase2`、`feat/getfunnel-deploy` 已合入 `main`；**stale `feat/frontend-phase3`（PR #3，tip `89f276b`）随 PR #4 合并自动关闭**；`feat/frontend-a7a8`（PR #4）已合 main。
> 本指令由 Tech Lead 在 Aurora KB 内闭环发出，不经 PO 转述。Codex / DeepSeek 读此文档继续执行。
> 门禁：所有"完成"判据须满足 `four-party-alignment-20261020.md` 防虚报硬门禁（远端分支 + 提交哈希 + 可复现 build/test 日志 + PR，且已合入 main）；缺任一即为未完成，一律不判完成。
> ⚠️ **权威性提示**：本仓库所有 `tech-lead-directive-*.md` 文件 mtime 均为 11:41（批量刷新），**不要按 mtime 判断哪份是最新/权威**。以**本文件（当前派发）+ git 远端 + `integration-checkpoint-20261021.md`** 为准；早期 `tech-lead-directive-20261021.md` 已 SUPERSEDED，仅作历史归档。

---

## 0. 本轮裁定（自治范围，无需 PO）

- **v1 已闭环**：`origin/main = b51c386` 为 "docs: Tech Lead sign-off for v1 E2E2 closure (merge PR #1)"，PR #1 已合并。Phase 1/2 收口。
- **A2 状态更正**：上一轮（心跳 round 1）在 `feat/frontend-phase3` 交付了 `getFunnel` 前端接入（适配器 `funnel.ts`/`funnelApi.ts` + `analyticsStore` 云端失败回退 + 漏斗来源标注），代码与 PR #3 均存在；但 **PR #3 尚未合入 main**，故上一轮日志所标"A2 ✅ 完成"属**高估**——准确状态为"已交付、PR 待 Tech Lead 门禁合并"。本轮不重复实现 A2，聚焦合并门禁与后续 A7/A8。
- **CloudBase 凭证分工**：凡标注「需 CloudBase 凭证 / 等 Codex 会话执行」的项，只在 KB 写精确指令，绝不伪造远端状态或测试结果。

---

## 1. 给 DeepSeek（前端，A7 / A8 —— 不需 CloudBase 凭证，可立即开工并提 PR）

> A2 已由 PR #3 交付（见 §0），本轮不重复。以下两项在 `feat/frontend-phase3` 基础上新开分支或直接在该分支追加提交，经 PR 合回 `main`。

### A7 · 体验指标采集（契约 §8 预留 `product.*`）
- **落点**：关键流程（app_open / view_king / complete_checkin / share / reactivate）埋点。
- **实现**：经 `cloud.rdb()` 直写 `analytics_events`（非敏感、受 RLS，契约 §8 `trackAnalytics` 已明确前端直写，无需云函数）。
  - `name` 用原始行为事件枚举；`step` 归到 `product.*` 命名空间；可选填 `channel`/`region`/`user_type`/`variant`。
  - **口径裁决（Tech Lead，自治）**：v1 `step` 枚举禁止自造，体验时长（load_ms / dwell_ms）放入 `payload`（自由 jsonb），不新增 `step`。按此实现。
- **看板**：在现有看板展示体验步（页面加载 / 流程时长）占位，详细可视化属 A8。
- **验收**：`taro build` + `vitest` 通过；PR 描述附构建/测试日志；远端 `frontend/` 可查。

### A8 · 分群运营后台（简单看板，依赖 A1/A2 服务端聚合）
- **落点**：在 `/funnel` 页面扩展筛选控件（channel / region / user_type），调用 `getFunnel` 时带 `segment` 参数。
- **约束**：前端只消费；服务端聚合（渠道质量分 / 趋势 / A/B）由 A1 提供。A8 可在 A1 落地前先用 `segment` 占位联调。
- **验收**：页面可筛选分群并渲染；`taro build` + `vitest` 通过；PR 附日志。

### 上一轮遗留、本轮要求 DeepSeek 跟进的口径项（不阻塞合并，但需在 A7/A8 前澄清）
1. **`conv_rate` / `drop_off` 单位**：契约 §8 未冻结是比例(0–1) 还是百分数(0–100)。当前前端按 `|v|≤1` 视为比例兼容两种。请 Codex 在契约补一句单位（见 §2 指令），前端即可去容错分支。
2. **`product.retain` / `habit` / `value` 恒为 0 致瓶颈步假性**：Tech Lead 裁定——`habit`（周≥3 天打卡）由前端派生；`value`/`retain` 留 Phase 3（不伪造信号）。前端漏斗展示须能区分"真实 0"与"未采集 0"（标注或灰显）。
3. **`*.refer` 触发信号**：微信分享无可靠成功回调。Tech Lead 裁定——v1 不改名、不冒充，`refer` 留 Phase 3；前端不把"点击分享"计为推荐成功。

> DeepSeek 开工前 `git fetch` 并重读 `cloudbase-contract.md`（v1.4）与本文。完成 PR 后于本文件追加"DeepSeek 回执"段（PR 链接 + 哈希 + 构建日志摘要）。

---

## 2. 给 Codex（后端，A1 / A3 / A4 / A5 / A6 —— 需 CloudBase 凭证，等 Codex 会话执行）

> 以下项均**不升 PO**（部署/配置/权限自治范围）。Codex 在已登录 CloudBase 会话内执行，回写证据到 `docs/integration-checkpoint-*.md`，Tech Lead 复核门禁后合 PR。

### 契约治理（优先，低成本）✅ 已完成（PR #5 @00c9102）
- **更新 `cloudbase-contract.md` §5 状态列**：当前仍写"本地实现并通过单元测试；待云端联调"，但 `b51c386` 已签核 E2E2 四函数真实调用通过、PR #1 已合并。请改为"**已实现（E2E2 验证通过，见 integration-checkpoint）**"，使前端握手信号（契约标"已实现"）成立。属文档更新，不涉 schema，自治可改。
- **补全 `docs/integration-checkpoint-20261021.md`**：当前仓库**无此文件**（仅有 `b51c386` 签核提交）。请 Codex 凭**真实部署/调用日志**补建该 checkpoint（四函数状态码+响应体+耗时+RLS 隔离证据）。**不得凭记忆伪造**；无日志则标"证据待补"。
  - *✅ 上两项已由 PR #5（`00c9102`）完成：契约 §5 已加状态列（四函数标"已实现（E2E2 验证通过，见 checkpoint）"；`upsertGoal`/`listGoals`/`listPlans` 显式标"未提供云函数"）；`integration-checkpoint-20261021.md` 已补建并合入 main。无需重做，详见该 checkpoint。*

### A1 · `getFunnel` 完整聚合增强
- 在已部署 `getFunnel` 基础上增加：`channel_quality`（渠道质量分）、趋势序列（按 `ts` 滚动）、A/B（`experiment_id` / `variant`）拆分。单测覆盖新增分支（本地 `pytest` 通过）。
- 需部署 + 端到端验证（E2E2 同款 `tcb fn deploy getFunnel` + 真实调用取状态码/响应体/日志）。

### A3 · CLS 日志服务配置
- 当前环境未配 Topic（`ResourceNotFound.TopicNotExist`）。创建/绑定日志集 Topic，使 4 函数运行日志可在 `tcb fn log` 查询。验收：调用后 `tcb fn log get <fn>` 可见启动/请求日志。

### A4 · `generatePlan` AI 能力监控 + 降级
- CloudBase AI 未开通 / 模型不可用 / `TCB_AI_PROVIDER`/`TCB_AI_MODEL` 缺失时：返回 **2xx + 降级字段**（`ai_enabled:false`，`summary` 由规则引擎兜底），**严禁 5xx**。验收：未开通场景端到端返回 2xx + 降级字段。

### A5 · 跨用户 cohort 汇总（权限设计优先）
- **Tech Lead 架构裁定（已定，不升 PO）**：v1 仅按 RLS 汇总调用者可见数据；跨用户 cohort 属 Phase 3，先定权限设计再实现。
- 动作：Codex **起草 `docs/adr/ADR-006-cohort-permission.md`**（注意：`ADR-005` 已被"薄肌王体感/围度漏斗步缺 event type"占用，勿冲突）。经 Tech Lead 裁定冻结后，再据 ADR 实现按权限过滤的聚合。**ADR-006 裁定前不得实现跨用户聚合**。

### A6 · 公网部署 / 自定义域名（Phase 3 联调收口）
- 依赖 A1–A5 部分落地。验收：公网 URL 可访问 4 函数。等 A1/A3/A4 完成后启动。

> Codex 执行顺序建议：契约治理（§5 + checkpoint）→ A3（日志可观测）→ A4（降级解耦 AI）→ A1（聚合增强）→ A5（ADR-006 起草）→ A6（公网）。每项独立 PR + 证据回写。

---

## 3. PR #3（A2）合并门禁清单（Tech Lead 执行）
- [ ] `feat/frontend-phase3` 合入 `main` 前：PR 链接 + 哈希 `89f276b` 可查。
- [ ] 可复现构建/测试日志：`taro build` 通过 + `vitest` 通过（需本轮或 Codex/DeepSeek 会话提供，Tech Lead 不凭记忆判过）。
- [ ] 契约 §5 状态列已更新为"已实现"，前端握手信号成立。
- [ ] 上节口径项 1–3 已在 PR 描述或后续 PR 中交代。
- 满足上述方可 fast-forward / 合并提交合入 `main`；**绝不 `--force`**。

---

## 4. 边界重申
- 纯部署 / 配置 / 环境 / 权限设计 / 契约文档更新 = 自治范围，不升 PO。
- 若发现**新架构 / 契约缺陷**（如 CloudBase AI 不支持 `hy3`、RLS 端到端异常），则升 PO：写 `docs/upgrade-queue.md`。
- 严禁伪造远端状态、测试结果或日志。无证据 = 未完成。
