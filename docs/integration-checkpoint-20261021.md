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

## Phase 3 复测与 A 项执行证据 · 2026-10-21

以下为本次 CLI/HTTP 网关直接调用与函数部署回执。HTTP 调用使用重新登录的两个 smoke 测试账号之一的当前 CloudBase access token；不在文档记录账号凭据、token 或用户标识。耗时由本机 `Stopwatch` 测量，包含 HTTP 网关往返时间。

### A1 · getFunnel 聚合增强

- 新增 `analytics_events.experiment_id`（NULL 表示非实验事件）及 `(experiment_id, variant, ts)` 部分索引；migration `20261021120000_analytics_experiments` 已在 CloudBase PostgreSQL 成功应用。
- 渠道质量使用 acquisition→activation 计数和比例；趋势以 UTC 日期与 step 分组；A/B 以 `experiment_id` + `variant` 分组。结果继续使用调用者 JWT/RLS 范围。
- 本地：`python -m pytest cloudbase/tests -q` → **25 passed**；`git diff --check` 通过。
- 公开 HTTPS 路由 `POST /getFunnel`，请求范围 `2026-10-20T00:00:00Z` 至 `2026-10-22T00:00:00Z`，domain=`product`：**HTTP 200，738 ms**。响应：

```json
{"steps":[{"step":"product.acquire","count":0,"conv_rate":1.0,"drop_off":0.0},{"step":"product.activate","count":0,"conv_rate":0.0,"drop_off":0.0},{"step":"product.retain","count":0,"conv_rate":0.0,"drop_off":0.0},{"step":"product.habit","count":0,"conv_rate":0.0,"drop_off":0.0},{"step":"product.value","count":0,"conv_rate":0.0,"drop_off":0.0},{"step":"product.refer","count":0,"conv_rate":0.0,"drop_off":0.0},{"step":"product.reactive","count":0,"conv_rate":null,"drop_off":null}],"bottleneck_step":"product.activate","channel_quality":[],"trend":[],"experiments":[]}
```

### A3 · CLS

- CloudBase `CreateEnvResource(Resources=["log"])` 已接受，随后环境元数据提供日志集 `tcb-logset-zhiji-d3gd1k9j43e7c20ac`、Topic `tcb-topic-zhiji-d3gd1k9j43e7c20ac`；保留期 7 天，计费模式 `payg`。
- 四个 HTTP 函数均已配置并绑定该 Topic。CLI `tcb logs search` 已可查询 `getFunnel` 调用，能读到 `status_code=200` 与运行时长记录；此前 `LOG_SERVICE_NOT_ENABLED` 已消除。

### A4 · generatePlan AI 降级

- AI 不可用/未配置或模型输出不合 schema 时，使用规则内容写入方案，并返回 HTTP 201、`ai_enabled:false` 与完整 `content`；成功使用 AI 时返回 `ai_enabled:true`。
- CLI 本地测试：25 项通过，其中含 AI 网关不可用、模型 schema 无效的规则降级测试。
- 线上降级复测：仅临时清空 `generatePlan` 的 provider/model 配置后部署并调用，再恢复配置并重新部署。返回 **HTTP 201，703 ms**，`ai_enabled:false`，content 含有效 summary 与 2 条 actions；生成方案已 HTTP 204 清理。恢复部署成功。
- 正常 AI 路径实测：**HTTP 201，16,153 ms**，返回 `{"id":"26c9ace5-3997-4cf5-9cf2-661c08a741e8","ai_enabled":true}`；方案已 HTTP 204 清理。

### A5 · cohort 权限

- 新增 `docs/adr/ADR-006-cohort-permission.md`（Proposed）：保持当前调用者 JWT/RLS；ADR 获批前不实现跨用户聚合、不使用 `service_role`；列明管理员授权、最小样本数、维度/范围和反推风险待裁定项。

### A6 · 公网路由

- 已通过 CloudBase 默认 HTTPS 域名建立四函数路径：
  - `https://zhiji-d3gd1k9j43e7c20ac-1510872056.ap-shanghai.app.tcloudbase.com/recordEvent`
  - `/listEvents`、`/generatePlan`、`/getFunnel`
- 路由层匿名开关未启用；函数仍要求有效 Bearer access token。有效 JWT 下的 `getFunnel` 实测为 HTTP 200；无效/缺失 token 返回 HTTP 401。

### 事件写入/查询 CLI 复测与耗时

工作域一次性 smoke 事件通过公开 URL 写入、读回，并清理：

| 调用 | HTTP | 实测耗时 | 脱敏响应证据 |
|---|---:|---:|---|
| `recordEvent` | 201 | 801 ms | `{"id":6}` |
| `listEvents` | 200 | 501 ms | 返回同一事件，`domain=work`、`type=log_spending`、`source=codex-cli-retest`；响应含原始 payload 和时间戳 |
| 删除 smoke 事件 | 204 | 未单独计时 | 已清理 |

### 部署配置注意项

- 本轮重部署后 `TCB_ENV_ID` 已显式设为当前 CloudBase 环境，避免未解析变量导致函数 500。
- **FERNET 密钥恢复（2026-10-21，CloudBase 控制台核对）**：环境负责人已恢复原密钥；控制台环境变量表确认 `recordEvent`、`listEvents`、`generatePlan` 均配置了 `FERNET_ENCRYPTION_KEY`。为避免泄露，检查点不记录密钥值。该核对只证明函数配置项已存在；恢复后的 health/dating 加密写入、读取与解密 E2E 尚未复测，需取得应用侧测试用户登录态（CloudBase access token）后补录状态码、脱敏响应和耗时。腾讯云控制台登录态本身不能替代该用户 token。此前的工作域 smoke 不依赖 Fernet 密钥。

## 敏感域 E2E 路线 A · 服务端补核（2026-10-27）

本节记录 2026-10-27 在 CloudBase 控制台恢复登录后进行的只读核验。PO 报告小程序样本已写入且 App 内回读明文；未索取应用 token。

### 函数配置

- CloudBase 环境 `zhiji-d3gd1k9j43e7c20ac` 中 `recordEvent`、`listEvents`、`generatePlan` 均为 HTTP / Python 3.11、状态“正常”；三个函数配置页均列出 `FERNET_ENCRYPTION_KEY`，其值由控制台遮蔽。本次未展示、复制或比较密钥值。
- 配置页最近更新时间仍为 2026-10-21；线上 `recordEvent` 代码编辑视图未能加载代码内容，故本次不声称从控制台源码逐行核验实现。

### 数据库加密证据（PostgreSQL SQL 编辑器，只读）

查询返回事件域/类型、时间、envelope 检查结果及密文长度或掩码片段，不返回 payload 明文。耗时为控制台 SQL 执行耗时，不是 HTTP 请求耗时。

| 检查 | SQL 执行 | 脱敏结果 |
|---|---:|---|
| 近 14 天 health/dating 类型汇总及 `_encrypted_v1` envelope | 19 ms | 5 个类型组，所有组 `all_have_fernet_envelope=true`；`dating/approach` 2 行（最新 2026-10-23 11:22+08），`health/suppression` 2 行（最新 11:22+08）；密文长度分别为 164 / 100 字符。 |
| Fernet token 前缀与目标类型计数 | 13 ms | `all_are_fernet_tokens=true`（token 均匹配 `gAAAA%`）；`dating/approach=2`、`health/suppression=2`、`health/body_sense=0`。 |
| 登录恢复后复查 `health/body_sense` 近 14 天记录数 | 7 ms | `body_sense_rows_14d=0`。 |
| 脱敏密文样本 | 18 ms | `dating/approach`：`gAAAAABq…jQLA==`（164 字符）；`health/suppression`：`gAAAAABq…ZRGw==`（100 字符），保留首 8 / 尾 6 字符。 |

最近 `approach` / `suppression` 行时间与 PO 报告时间相近，只作为时间线索，不作为用户身份独立证明。没有发现 `health/body_sense` 行；现有 health 样本类型为 `suppression`。

### 解密与读取证据

- PO 报告 App 内 `listEvents` 回读看到明文；该客户端回读作为解密成功的客户端侧证据。原 HTTP 状态码、响应体与端到端耗时未留存；本轮未索取或使用 access token。
- 本次未用控制台遮蔽的函数密钥离线解密，也未逐字比较三个函数密钥。SQL 证明近期敏感域记录具有 Fernet envelope，配置页证明密钥变量存在；密钥值不入本检查点。

### RLS 隔离

| 检查 | SQL 执行 | 脱敏结果 |
|---|---:|---|
| `Anonymous`（未登录）查询 health/dating 可见行数 | 7 ms | `visible_sensitive_rows=0`。 |
| 登录恢复后 `Anonymous` 复测 | 8 ms | `visible_sensitive_rows=0`。 |
| Authenticated 使用合成的非生产探针身份查询 health/dating 可见行数 | 13 ms | `visible_sensitive_rows=0`；探针身份不对应已知用户。 |
| 线上 `pg_policies` 元数据 | 20 ms | `events_owner` 对 `{authenticated}` / `ALL` 生效，`USING` 与 `WITH CHECK` 均为 `(user_id = auth.uid())`。 |

已验证匿名及另一个合成认证用户上下文均不可见。合成身份不是 PO 的真实凭据或端到端登录。管理员数据编辑器显示过行级 `user_id` 与完整 Fernet token；这些值未复制或写入本检查点，也未与 PO 应用身份映射。只记录脱敏查询结果。所有数据库操作均为只读。

### 当前结论与缺项

- **部分通过**：近期 health/dating 记录以 Fernet token envelope 形式保存；三个函数配置中有遮蔽的 `FERNET_ENCRYPTION_KEY`；Anonymous 与合成的另一认证上下文读不到事件；PO 报告 App 明文回读成功。
- **未闭环**：`health/body_sense` 样本不存在；样本用户归属未由本次查询独立证明；没有保存 HTTP 状态码和调用耗时；没有使用函数环境密钥直接解密样本。PO 报告的 App 回读仍只是客户端侧证据。
- **下一步**：PO 使用已登录小程序提交一条 `health/body_sense` 后告知大致时间，再以只读 SQL 查询脱敏 envelope 与时间。若要独立验证解密，需通过已认证函数读回完成；不得把应用 token、key 或明文写入 KB。此前登录会话保持可用。
