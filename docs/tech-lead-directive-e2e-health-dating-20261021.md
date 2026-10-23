# Tech Lead 指令 · health/dating 加密读写 E2E 派发（2026-10-21）

> 状态：**激活 · 2026-10-23 唤醒**。前置已满足——PO 报告登录已跑通且已上传小程序；`FERNET_ENCRYPTION_KEY` 此前已恢复。`recordEvent`/`listEvents`/`generatePlan` 环境变量已配置（见 `integration-checkpoint-20261021.md`）。请 Codex 按 **路线 A** 执行服务端加密读写 E2E 核验（用户已可用真实账号写入 health/dating 数据）。token 边界见 §0。

## 0. token 边界（硬约束，PO 明确要求）
- **腾讯云控制台登录态 ≠ 应用侧用户 token**。E2E 所需的「测试用户登录态（CloudBase access token）」只能由前端（小程序/H5）在用户登录后产生。
- 该 token **只在前端 ↔ Codex 之间**，绝不经过 Tech Lead（PO 已明确：不必把 token 发给我）。
- 前端保持登录即可驱动真实用户路径；Codex 的服务端核验**无需持有 token**。

## 1. 前提确认（Codex，CloudBase 会话）
- 确认 `recordEvent`/`listEvents` 函数环境变量 `FERNET_ENCRYPTION_KEY` 已恢复（checkpoint 已记录控制台核对；若本地 `backend/.env` 有原始值可作交叉验证，但不得用其生成替代密钥）。
- 确认已部署代码中：
  - `recordEvent` 对 `domain ∈ {health, dating}` 的 `payload` 走 FERNET 加密后入库；
  - `listEvents` 读出后对敏感域 `payload` 走解密返回明文。
  - （加密逻辑此前因密钥为空被跳过测试，现密钥已恢复，逻辑应已就绪；若发现缺失/未部署，先修后测，提 PR。）

## 2. E2E 流程（两路，择一执行并在证据中注明）
### 路线 A（推荐 · 零 token 外传）：前端驱动 + 服务端核验
- PO 在前端用测试账号**保持登录**，触发：
  - 薄肌王（health）：提交 `body_sense`（腰围 cm + 体感 great/ok/tired + 备注）→ `recordEvent({domain:'health',type:'body_sense',...})`；
  - 黄毛王（dating）：提交一条 dating 事件。
  - 再在 App 内触发 `listEvents`（health/dating）回读，确认看到**明文**内容（解密读取正常）。
  - 记下大致提交时刻（便于 Codex 在 PG/日志定位行）。
- Codex 服务端核验（**不需 token**）：
  1. PG `events`：该用户 health/dating 行的 `payload` 为**密文**（Fernet token 形态，非 JSON 明文）→ 证明加密写入真发生；
  2. 解密读取：用函数环境同一 `FERNET_ENCRYPTION_KEY` 对样本解密验证，或采纳前端明文回读作为解密成功证据；
  3. **RLS 隔离**：以另一用户上下文 / 无用户上下文查询，读不到该用户的加密行 → 加密下跨用户隔离仍成立。

### 路线 B（精确 HTTP 计时）：PO 将前端 access token 直接给 Codex（不经 Tech Lead）
- Codex 用该 token 调 `recordEvent`/`listEvents` 捕获状态码、脱敏响应、逐请求耗时，写入 checkpoint。
- token 仅出现在 Codex 与 PO 之间的临时通道，**不进 KB / 不进 PR / 不抄送 Tech Lead**。

## 3. 证据与门禁
- 无论哪条路线，必须补录 `integration-checkpoint-20261021.md` 敏感域段落：状态码、脱敏响应、耗时、密文样本（脱敏）、解密回读结果、RLS 隔离结果。
- 硬门禁：远端 + 可复现日志 + **不伪造**；token 不出现在任何 KB/PR 文本中。
- 完成后在 KB 回写结果，Tech Lead 按门禁复核合并。

## 4. 不升 PO
E2E 复测属执行层闭环；密钥恢复与隐私裁定（ADR-006 本期不开放跨用户 cohort）均已定。仅 heartbeat-log 记录进展。

## 5. 唤醒记录（2026-10-23 · Tech Lead 派发）
- **前置满足**：PO 报告 `signInWithOpenId` 登录已跑通（真机/开发者工具拿到真实 uid+token），且小程序已上传微信后台。冻结的 `cloudbase.ts`/`authStore.ts` 未被破坏，登录链路以 PO 版本为准。
- **动作**：指令由"可执行但等登录"升级为"激活"。Codex 无需持有 token，按路线 A 执行：
  1. 等待/提示 PO 在前端用已登录账号写入：薄肌王 `body_sense`（腰围 cm + `feel_score` 拖条 1–10 + 可选 `suppression` 压抑值 0–10）+ 黄毛王 `dating` 各至少一条；并在 App 内 `listEvents` 回读确认看到明文。
  2. 服务端核验：PG `events` 该用户 health/dating 行 `payload` 为 Fernet 密文（非 JSON 明文）；用函数环境同款 `FERNET_ENCRYPTION_KEY` 解密样本验证；RLS 隔离（无用户/其他用户上下文读不到该用户行）。
  3. 补录 `integration-checkpoint-20261021.md` 敏感域段落：状态码、脱敏响应、耗时、密文样本（脱敏）、解密回读结果、RLS 隔离结果。
- **门禁**：远端 + 可复现 + 不伪造；token 不进任何 KB/PR。
- **回写**：完成后在 KB 写结果 → Tech Lead 复核合并。

### 6. PO 进展（2026-10-23T11:27 · Tech Lead 记录）
- **PO 报告已用已登录账号打卡（health/dating 写入），且 App 内 `listEvents` 回读成功——看到明文，客户端 FERNET 解密正常。** 这是路线 A 的客户端侧证据（用户自证）。
- 数据已真实落库（带真实 uid）。**Codex 立即执行服务端核验**，无需再等：PG `events` 查该用户 health/dating 行 `payload` 为 Fernet 密文 → 用函数环境同款 `FERNET_ENCRYPTION_KEY` 解密样本验证 → RLS 隔离（无用户/其他用户上下文读不到该用户行）。
- 核验后补录 `integration-checkpoint-20261021.md` 敏感域段落（状态码/脱敏响应/耗时/密文样本/解密回读/RLS），并在 KB 回写结果。
