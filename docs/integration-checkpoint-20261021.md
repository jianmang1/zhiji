# 集成检查点 · 2026-10-21 · E2E2

## 结论

CloudBase Python 3.11 四个 HTTP 云函数已修复 Layer 导入路径并部署到 `zhiji-d3gd1k9j43e7c20ac`。端到端事件写入/查询、漏斗查询、AI 方案生成及用户隔离均通过。运行日志查询因环境未配置 CLS Topic 而不可用；未启用 CLS。

## 部署与修复

- 分支：`feat/getfunnel-deploy`；基线提交：`ab1f15d`。
- CloudBase Layer ZIP 中 Python 包位于 `python/third_party/`，函数运行时对应 `/opt/python/third_party`。四个 `scf_bootstrap` 均将此目录加入 `PYTHONPATH`，保留 `/opt` 与 Python 3.11 site-packages 路径。
- 使用 `python cloudbase/build_functions.py --skip-deps` 重建四个函数；每个函数部署后状态为 `Active`，代码结果为 `success`，绑定 1 个依赖 Layer。
- 迁移：沿用此前已在 CloudBase PostgreSQL 实施并验证的 `20261020104600_init_schema.sql`（四表与 RLS owner 策略）；本次 E2E2 未改动或重跑迁移。

## E2E2 结果

使用两个已登录测试用户的访问令牌（不记录令牌或凭据）：

| 场景 | 结果 |
|---|---|
| 用户 A 调用 `recordEvent` 写入 `work/log_spending` 事件 | HTTP 201，返回事件 ID |
| 用户 A 调用 `listEvents` 查询同一时间范围 | HTTP 200，可查到刚写入的事件 ID |
| 用户 B 查询相同时间范围 | HTTP 200，看不到用户 A 的事件 |
| 用户 A 调用 `getFunnel` 查询 `product` 范围 | HTTP 200，返回 7 个步骤 |
| 用户 A 调用 `generatePlan`（`work` 域） | HTTP 201，返回方案 ID；数据库读回含 `actions` 的 JSON，`user_id` 与 A 一致 |
| 用户 B 查询该方案 | HTTP 200，结果 0 行 |
| 测试数据清理 | 事件及方案均删除成功（HTTP 204） |

## 本地验证

- `python -m pytest cloudbase/tests -q`：23 passed。
- `git diff --check`：通过（仅有 Git 的 LF/CRLF 自动转换提示）。

## 可观测性限制

`tcb fn log recordEvent --limit 10 --json` 返回 `ResourceNotFound.TopicNotExist`；环境未配置 CLS 日志 Topic，因此当前无法查询运行日志。没有为此启用计费日志服务。函数状态及上述真实 HTTP 调用均验证成功；CLS 配置留待环境负责人决定。

## Tech Lead 签核（2026-10-21 10:54）

- 已基于远端真实状态核实：`origin/feat/getfunnel-deploy = 4019051`；E2E2 四项验收（recordEvent 写入 201 / listEvents 读取 200 闭环、getFunnel 7 步 200、generatePlan 201 且读回含 `actions`、A/B 隔离：B 看不到 A 的事件与方案）全部通过；本地 23 测试通过，工作树干净。
- 已合并 PR #1 至 `main`（merge commit `a3588cb`，非 ff，22 文件 +1026/-69）；`origin/main` 现含完整前端（PR #2，d8c041b）+ 后端四 HTTP 函数部署 + getFunnel + 评分引擎 + 本检查点。
- v1 后端部署验收**闭环**。唯一未决项：环境未配置 CLS Topic，运行日志不可查——不影响已通过的真实 HTTP 调用验证；CLS 配置留待环境负责人决定，不阻塞 v1。
- 结论：**v1（三王小程序前端 + CloudBase 后端）达到派发要求的部署验收条件，PR #1 关闭。**
- 后续自治事项（Phase 3 之前不阻塞 v1）：跨用户 cohort 汇总（ADR 已裁定 Phase 3）、CLS 可观测性、generatePlan 的 AI 能力额度监控。

## 证据补录 · 2026-10-21（契约 §5 状态核对）

本节按 Tech Lead 最新 Phase 3 指令，将 v1 已有 E2E2 证据与本次可重新取得的部署元数据分开记录。只把实际留存的状态码和响应信息写作结果；没有留存原始响应或耗时时明确标记待补。

### 云函数部署元数据（本次 CLI 查询）

`tcb fn list -e zhiji-d3gd1k9j43e7c20ac --json` 返回 4 个函数，均为 `Python3.11` / `HTTP` / `Active`：

| 函数 | 状态 | 最近更新时间（CLI） |
|---|---|---|
| `recordEvent` | Active | 2026-10-21 10:45:40 |
| `listEvents` | Active | 2026-10-21 10:48:20 |
| `getFunnel` | Active | 2026-10-21 10:49:37 |
| `generatePlan` | Active | 2026-10-21 10:50:18 |

### 已留存的 E2E2 调用证据

下列结果来自前述 E2E2 实际调用记录；这些调用的逐请求耗时没有留存，本次没有用估算值补写：

| 调用 | HTTP | 已留存响应证据 | 耗时 |
|---|---:|---|---|
| 用户 A `recordEvent`（测试事件） | 201 | 响应 `{"id":5}` | **待补：原始计时未留存** |
| 用户 A `listEvents`（同一时间范围） | 200 | 响应包含刚创建的事件 ID `5`；完整事件行响应未留存 | **待补：原始计时未留存** |
| 用户 B `listEvents`（同一时间范围） | 200 | 空数组 `[]`，看不到用户 A 的事件 | **待补：原始计时未留存** |
| 用户 A `getFunnel`（product） | 200 | 返回 7 个 steps；完整 JSON 响应未留存 | **待补：原始计时未留存** |
| 用户 A `generatePlan` | 201 | 响应 `{"id":"c7aaf216-7908-42da-8007-8cce9bb05b3e"}`；随后 A 可读到含 `actions` 的方案且 `user_id` 与 A 一致 | **待补：原始计时未留存** |
| 用户 B 读取上述方案 | 200 | 空结果，不能读取用户 A 的方案 | **待补：原始计时未留存** |
| 清理测试事件与方案 | 204 | 两项删除均成功 | **待补：原始计时未留存** |

### 日志与证据缺口

- CLS 查询仍返回 `ResourceNotFound.TopicNotExist`，环境尚无日志 Topic；未创建或启用日志资源。
- 本次尝试用 CLI 重新调用 `listEvents` 时，CLI 在约 20.3 秒后返回 `NETWORK_ERROR`，没有收到函数响应；该次尝试不作为云函数调用证据，也没有写入测试数据。
- 需在 CLI 网络可达时重新执行上述四函数与双用户隔离调用，并保存每次的 HTTP 状态、脱敏后的完整响应体和实测耗时，才能补齐耗时及未留存的完整响应字段。当前 E2E2 通过结论维持不变，逐请求时延证据标为**待补**。
