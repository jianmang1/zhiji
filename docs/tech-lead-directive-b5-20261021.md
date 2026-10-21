# Tech Lead 指令 · B5 裁决派发（2026-10-21，PO 采纳 A）

> 状态：可执行。ADR-005 已 **Accepted**。本指令为冻结契约变更（B 类）的派发，PO 已拍板，不升 PO。

## 0. 裁决
薄肌王"体感/围度"漏斗步（`health.body_sense`，product-definition §15.1）在事件模型里没有可产出它的 type。PO 采纳 **方案 A**：在契约 §3 health 域新增 `body_sense` type。

## 1. 契约变更（已落盘，无需再改）
- `docs/cloudbase-contract.md` 版本号 **v1.4 → v1.5**（顶部 + 2026-10-21 更新说明）。
- §3 health：`water{ml}` / `sleep{duration_h,quality}` / `workout{type,duration_min,calorie}` **+ `body_sense{waist_cm?:number, feel?:enum('great','ok','tired'), note?:text}`**。
- §8：`health.body_sense` step 已在 v1.4 枚举中，补注解"事件 type 见 §3，ADR-005 采纳 A"。
- **零数据库迁移**：`events.type` 为自由 `text` 无 CHECK 约束，`profiles` 及表结构不动。
- **Codex 零改**：`EventInput.payload` 为自由 `dict`，`domain` 枚举不变，`type` 不受限。

## 2. 对 Codex（后端）
- 确认 `recordEvent` 对 `domain=health, type=body_sense` 无额外校验（预期零改动）。
- 可选增强：在 `validation` / `score_engine` 单测加一条 `body_sense` 合法 payload 用例（`waist_cm=82, feel='ok'`），证明新 type 端到端可达。
- **不新增云函数、不改迁移、无需重部署**。
- 若发现 `EventInput` 存在 type 白名单需放开：提 PR（建议分支 `feat/contract-body-sense`），标题 `feat(contract): accept health.body_sense type`；本地单测通过即达标，无需 CloudBase 凭证。
- 完成后在 `docs/integration-checkpoint-20261021.md` 追加一行"body_sense type 已受 recordEvent 接受（单测证据）"。

## 3. 对 DeepSeek（前端，需会话实现）
- `src/schemas/payload.ts` 注册表：health 域补 `body_sense` type，payload schema：
  `{ waist_cm?: number, feel?: 'great'|'ok'|'tired', note?: string }`。
- 薄肌王（health）记录/打卡页：加"体感/围度"入口——腰围 cm（可选输入）+ 体感三选一（great/ok/tired）+ 备注，发出
  `recordEvent({ domain:'health', type:'body_sense', payload:{ waist_cm?, feel?, note? } })`。
- 对齐 `health.body_sense` 漏斗步（product-definition §15.1），使该步不再恒为 0。
- **加密一致性**：health 属 `SENSITIVE_DOMAINS`，仍走 `recordEvent` 云函数（不经客户端直写 `events`），与现有 water/sleep/workout 一致。
- 门禁（防虚报）：`tsc=0` / `vitest` 通过 / `weapp+h5 build=0`；提 PR（建议 `feat/frontend-body-sense`）；**不伪造远端状态或测试日志**。
- 当天可交付。

## 4. 合并与门禁
- 所有"完成"判据须满足：远端分支 + 提交哈希 + 可复现 build/test 日志 + PR；缺任一不判完成。
- 两方 PR 由 Tech Lead 在 checkpoint 复核（fast-forward 或常规合并提交，绝不 `git push --force`）。

## 5. 不升 PO
冻结契约变更已由 PO 拍板 A，执行层自治闭环；后续仅 heartbeat-log 记录进展。
