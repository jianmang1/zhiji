# Tech Lead 指令（端到端验收失败排查）— 2026-10-21

- **指向**：Codex（后端分支 `feat/getfunnel-deploy`，已登录 CloudBase 会话）
- **背景**：ADR-004 已正确落地（commit `59a2167`：`auth.py` 改 `str(claims["sub"])`、迁移 `20261021093200_fix_user_id_text.sql` 已加、契约同步、单测新增数字 sub 用例 `2112717453276565505`）。此前 `22P02` 读路径已修复。现"函数端到端调用"验收未过，需定位**新**阻塞。
- **属性**：部署/配置/环境排查，属自治范围，**不升 PO**（PO 无需凭证、无需介入）。

---

## 已排除（实证）

- 网关 URL / PostgREST / 调用方 token / RLS：此前 `listEvents` 已触达 DB 并返回 `22P02`，证明 `gateway_base_url()`、`Authorization` 透传、`auth.uid()` 链路本身通。故端到端失败**不在**网关与鉴权。
- ADR-004 修复本身正确（`59a2167` diff 与 Tech Lead 指令一致）。

---

## 重点嫌疑（按概率排序）

1. **4 函数未全量部署**（最高概率）
   - `59a2167` 新增 `--dependency-layer` 打包以破 ZIP >1.5MB 限制，但 deploy 是否成功未知。
   - `listEvents` / `generatePlan` / `getFunnel` 此前卡 COS 60s / ZIP；若仍未部署，调用即"函数不存在 / 404"。
   - **先做**：`tcb fn list` 确认 4 个函数均 `ONLINE`；未部署的用 `--dependency-layer` 补部署。

2. **`generatePlan` 依赖 LLM 未配置**
   - `complete_chat` → `POST /v1/ai/{provider}/chat/completions`，`provider=TCB_AI_PROVIDER`(默认 `cloudbase`)、`model=TCB_AI_MODEL`(默认 `hy3`)。
   - 若 CloudBase AI 能力未开通 / 模型不可用 / 密钥缺失 → 500。确认 AI 已启用且 `hy3` 可调。

3. **部署 env 未注入**
   - `cloudbaserc.json` 的 env 用 `{{env.TCB_ENV_ID}}` / `{{env.FERNET_ENCRYPTION_KEY}}` 模板，部署者本地须 `export` 这两个变量，否则函数启动即 500（`TCB_ENV_ID is required`）。确认部署机已 set。
   - `FERNET_ENCRYPTION_KEY` 仅在 health/dating 事件加密时需要；work 域写入不依赖它，但若端到端覆盖 health/dating 则必须配。

---

## 你要做的（在 CloudBase 会话内）

1. **复现 + 取精确错误**：用 A/B 测试 token 依次调 `recordEvent` → `listEvents` → `generatePlan` → `getFunnel`，捕获**每一步的 HTTP 状态码 + 响应体/错误串 + 函数运行日志**。没有精确错误无法定位。
2. **`tcb fn list`** 确认 4 函数均部署且 `ONLINE`；缺失的补部署（用 `--dependency-layer`）。
3. 确认 **LLM 配置**（provider / model / 密钥）与 **`FERNET_ENCRYPTION_KEY`** 已注入到部署函数。
4. 把精确错误与定位结论写回 KB（本文件追加"排查结果"段或新 directive），并继续修复直到端到端通过。
5. 修复后重跑双用户 RLS 冒烟，满足 ADR-004 §6 验收门槛即通知 Tech Lead 合 PR #1。

---

## 边界

- 纯部署 / 配置 / 环境 = 自治范围，不升 PO。
- 若发现是**新架构 / 契约缺陷**（如 CloudBase AI 不支持 `hy3`、或 RLS 在端到端下行为异常、或 `auth.uid()` 与 `sub` 不一致），则升 PO（写 KB 升级区，由 Tech Lead 裁定新 ADR）。
