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
