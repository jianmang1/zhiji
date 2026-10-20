# 执己 · 系统设计与实施方案（Phase 0 产出）

> 本文档与 `ADR-001-tech-stack.md`、`data-model-v1.md`、`api/openapi.yaml` 共同构成 **Aurora KB（契约中枢）**。前后端 Agent 仅通过这些文档协作，互不直连。

## 1. 产品形态明确
> ⚠️ **本节为 v1 历史基线（2026-10-19），已过期。** 产品形态已于 2026-10-20 升级为「XX王人格化 + C 端上架 + 新粗野主义」形态，权威定义见 [product-definition.md](./product-definition.md)。本文件 §2–§7 亦基于已废弃的 FastAPI 旧栈，仅作历史参考；当前架构见 `ADR-002-cloudbase-native.md`。

- 产品名：**执己**（全称「执己 · 从认知到执行」）
- 形态：**微信小程序**（Taro 编译，同源出 H5 网页）
- 目标用户：单用户（产品负责人本人）起步；数据模型预留 `user_id` 以支持多用户
- 核心闭环：**采集**（五维生活数据）→ **沉淀**（结构化 events）→ **分析**（多 AI Agent）→ **行动方案**（plans）→ **执行反馈**
- 五维：健康 / 工作 / 消费 / 能力 / 兴趣
- v1 范围：数据采集 + 轻量看板 + 分析接口（先留 `/plans` 与 `/analytics`，分析引擎后续接入）
- v1 非目标：社交/多人协作、复杂图可视化（ReactFlow 降级为静态图/列表）、实时流、Neo4j

## 2. 前后端框架职责

| 维度 | 前端（DeepSeek） | 后端（Codex） |
|------|----------------|---------------|
| 框架 | Taro（React/TS）+ AntD Mobile + Zustand + React Router + Zod | Python + FastAPI + SQLAlchemy 2.0(async) + Alembic |
| 负责 | 组件/UI 布局、状态管理、客户端路由、表单校验(Zod)、数据可视化(降级)、前端测试(Vitest/Playwright) | DB schema 与 migration、RESTful API、业务逻辑、数据访问层、单测/集成测试 |
| 不负责 | DB 查询/schema、API 端点实现、服务端校验、认证逻辑（仅 UI 集成） | UI 组件/样式、前端状态、客户端路由、浏览器兼容 |
| 协作接口 | 消费 `openapi.yaml` 生成 API 客户端 | 提供并维护 `openapi.yaml`、实现 `data-model-v1.md` 的表 |

## 3. System Architecture

```
微信小程序 / H5 (Taro)
        │  HTTPS + JWT(Bearer)
        ▼
   FastAPI 网关 (容器, 公网)
        │
        ├─ auth: 微信 MP OAuth(code2session) → openid → JWT
        ├─ routers / services
        ▼
   SQLAlchemy(async) + Alembic
        │
        ▼
   PostgreSQL(托管, JSONB)  ── 分析层(后续): networkx / SQL CTE → plans
        ▲
        │  Aurora KB = docs/ + api/openapi.yaml（前后端唯一契约源）
   Codex ──────────────── DeepSeek（不直连，仅经 KB）
```

- **认证**：微信 MP `wx.login` → `code` → 后端 `auth.code2session` 换 `openid` → 签发 JWT（access + refresh）。前端仅做登录 UI 与 token 存储。
- **部署**：后端容器（公网 HTTPS，如腾讯云容器/Cloud Run）+ 托管 PostgreSQL；前端微信 MP 后台上传。dev/prod 环境隔离。
- **图分析**：networkx / SQL 递归 CTE；Neo4j 触发条件见 ADR-001 §4。
- **契约中枢（Aurora KB）**：本仓库 `docs/`（ADR、数据模型、架构）与 `docs/api/openapi.yaml`。任何接口变更先更 KB + 写 ADR，再改代码。

## 4. Database Design（初版）
基于 `data-model-v1.md`，PostgreSQL + JSONB：

| 表 | 关键字段 | 说明 |
|----|----------|------|
| users | id(uuid, PK), openid(unique), created_at | 微信用户映射 |
| events | id(bigint PK), user_id, domain(enum), type(text), ts(timestamptz, 索引), payload(jsonb), source(text), created_at | 统一事件表 |
| tags | id, event_id(FK), tag(text) | 跨域检索/图边 |
| goals | id(uuid PK), title, domain(enum), status(enum), created_at | PO 设定目标 |
| plans | id(uuid PK), title, generated_by, based_on(jsonb), content(jsonb), created_at | 分析 Agent 产出方案 |

- 索引：`events(user_id, ts)`、`events(domain)`、`tags(tag)`。
- `payload` 按 `domain+type` 约定结构（见 `data-model-v1.md` 第 2 节），不预建重表。
- Migration：Alembic，每版含 up/down（质量门禁 2）。

## 5. API 大概定义
权威契约见 `api/openapi.yaml`。v1 端点：

- `POST /auth/wx-login` —— 微信 code 换 JWT
- `GET/POST /events` —— 查询/创建事件
- `GET/PUT/DELETE /events/{id}` —— 单条事件
- `GET/POST /goals` —— 目标
- `GET/POST /plans` —— 行动方案（分析引擎写入）
- `GET /analytics/summary` —— 数据概览
- `GET /analytics/domain/{domain}` —— 单域分析

## 6. Phase 拆分
- **Phase 0（已完成）**：契约锁定 —— ADR-001、data-model-v1、architecture、openapi v1.0、职责提示词。
- **Phase 1（Codex）**：后端骨架。项目初始化 → DB 连接(asyncpg/env) → Alembic → 微信 auth → events/goals/plans/analytics 接口 → 单测。验收：接口过契约、单测 ≥70%、migration 可回滚。
- **Phase 2（DeepSeek）**：前端骨架。Taro 初始化 → 登录页 → events 录入页(按域) → 看板页 → Zod 校验 → 前端测试。验收：能录入并落库、看板渲染、类型安全。
- **Phase 3（我主持 weekly checkpoint）**：前后端联调、端到端关键路径测试、公网部署。验收：9 门禁全过。
- **Phase 4（后续）**：分析层 —— 多 AI 分析产出 plans、图分析。
- **Phase 5**：按反馈迭代（context/方向由 PO 风控）。

## 7. 验收标准（对齐 9 质量门禁）
1. API 契约一致性：前端调用匹配 `openapi.yaml`，偏差判失败。
2. Migration 可回溯：Alembic 每版 up/down 可回滚。
3. 单测覆盖率：后端核心 ≥70%。
4. 关键路径集成测试通过：登录 → 录入 → 落库 → 看板 端到端。
5. 类型安全：TS strict + Python type hints。
6. 安全门：无硬编码密钥、输入校验、JWT 鉴权、敏感字段加密。
7. 性能预算：首屏 <2s，API P95 <300ms。
8. 契约变更须 ADR + 通知对方 Agent。
9. 文档齐备：README、部署文档、数据字典。
