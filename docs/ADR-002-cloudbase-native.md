# ADR-002 后端架构转向 CloudBase 原生（SHARED PG + SDK + 内置鉴权）

- 状态：已采纳（2026-10-20，PO 拍板）
- 决策者：产品负责人（PO）
- 触发：CloudBase 环境 `zhiji`（ap-shanghai）的 PG 为 **SHARED** 形态（仅 SDK/网关访问，无 TCP host），与 Codex Phase 1 的 `asyncpg` TCP 直连后端不兼容。
- 关联原则：专业化 > 通用化；明确"能/不能"；契约是唯一交流语言

## 1. 决策

放弃「自建 FastAPI + SQLAlchemy + asyncpg + 自写 JWT 鉴权」的后端形态，改为 **CloudBase 原生模型**：

- **鉴权**：用 CloudBase 内置 `auth`（`auth.users` / `auth.tokens`），微信登录走 CloudBase 微信登录集成；不再自写 `code2session` 与 JWT。
- **数据**：应用表建在 CloudBase PG `public` schema，经 `app.rdb()`（Supabase 式链式查询）访问；行级安全（RLS）按 `user_id = auth.uid()` 做每用户隔离。
- **服务端逻辑**：由 **CloudBase 云函数（Python）** 承载，尤其是 AI 分析（调用 LLM 产出行动方案）；不再跑独立 FastAPI 容器。

## 2. 为何（Considered Alternatives）

- 升级独占（DEDICATED）PG 保留 FastAPI：保留 Codex 投资，但为付费项、体验版不含，且需云托管运维 → **否决**。
- 后端 + 独立标准 PostgreSQL（绕开 CloudBase PG）：Codex 不变，但 CloudBase PG 闲置、两套环境并存 → **否决**。
- 本决策：零运维、微信登录/存储/RLS 开箱即用，最贴小程序；代价是 Codex 的 Phase 1 后端需改写、ADR-001 技术栈更新。

## 3. 技术栈变更

| 维度 | 原（ADR-001） | 新（本 ADR） |
|------|------|------|
| 后端语言/框架 | Python + FastAPI | Python 云函数（云函数 / 云托管） |
| ORM/驱动 | SQLAlchemy + asyncpg（TCP） | CloudBase PG SDK（`app.rdb()` / 网关） |
| 鉴权 | 自写 `code2session` + JWT | CloudBase 内置 auth（微信登录） |
| 数据访问 | REST API（openapi） | `app.rdb()` + 云函数 |
| 迁移 | Alembic | CloudBase PG Migration（`managePgDatabase applyMigration`） |
| 前端数据层 | openapi-typescript 生成 client | CloudBase JS SDK v3（`cloud.auth` / `cloud.rdb`） |
| AI 分析 | （未实现） | CloudBase LLM API（keyless）/ 外部 LLM 云函数 |

## 4. 契约模型变更（原则三仍成立）

契约的「载体」从 `openapi.yaml` 改为 **Aurora KB 中的表结构 + RLS + 云函数接口**：

- `docs/cloudbase-contract.md` = `public` 表 DDL、字段语义、RLS 策略、云函数签名 —— **新的唯一数据契约**。
- `docs/api/openapi.yaml` 降为「可选 HTTP 云函数端点文档」，不再作为前端数据访问契约。
- Codex（云函数）/ DeepSeek（前端 SDK）仍**互不直连**，仅对 KB 文档说话。

## 5. Codex Phase 1 后端处置

- **弃用**：`asyncpg` 连接串、自写 `users` 表、JWT 签发、REST 端点 handler、Alembic。
- **保留/迁移**：事件/目标/方案的数据模型（转 `public` 表 + RLS）；AI 分析业务逻辑（转云函数）。
- 既有 `backend/` 目录保留为参考，新代码写入云函数目录（待建，建议 `functions/`）。

## 6. 质量门禁映射（9 项仍适用，载体调整）

1. 契约一致性 → 前端 SDK 调用须匹配 `cloudbase-contract.md` 表/字段
2. 迁移可回溯 → CloudBase PG Migration 有 history（`cloudbase_migrations`），回滚 SQL 随迁移提交
3. 单测 ≥70% → 云函数单测
4. 关键路径集成 → 微信登录 → 录入 → 落库（RLS 隔离验证通过）
5. 类型安全 → TS strict + Python type hints
6. 安全门 → 不硬编码密钥、RLS 强制、敏感字段加密（应用层或 pgcrypto）
7. 性能预算 → 前端首屏 < 2s；云函数 P95 < 300ms
8. 契约变更走 ADR + 通知对方 Agent
9. 文档齐备 → `cloudbase-contract.md` + 云函数 README

## 7. 风险与缓解

- SHARED PG 无 TCP：后端逻辑只能走云函数/SDK，不能跑常驻 TCP 服务 → 已接受（本 ADR 核心）。
- RLS 配置错误致越权 → 迁移内含 `ENABLE RLS` + `CREATE POLICY`，集成测试验证跨用户隔离。
- 敏感字段出云 → 健康/消费 payload 应用层加密（门禁 6）。
