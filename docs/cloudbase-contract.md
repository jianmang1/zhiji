# 数据契约 v1（CloudBase 原生 · public schema）

> 这是 **执己** 项目在 CloudBase 原生模型下的**唯一数据契约**（原则三）。
> 取代原 `docs/api/openapi.yaml` 作为前端数据访问契约；openapi.yaml 降为可选 HTTP 云函数端点文档。
> Codex（云函数）/ Gemini（前端 SDK）均以此文档为准，互不直连。

## 1. 鉴权模型

- 用户体系由 **CloudBase 内置 auth** 提供（`auth.users` / `auth.tokens`）。
- 微信登录：前端调 `cloud.auth` 微信登录集成；服务端用 `auth.uid()` 取当前用户 id（uuid）。
- **不**自建 `users` 表、不签发 JWT；应用表用 `user_id uuid` 关联当前用户，RLS 强制隔离。

## 2. 表（public schema）

### events（统一事件表）
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | bigint | PK, IDENTITY | 自增 |
| user_id | uuid | NOT NULL | 当前用户（= auth.uid()） |
| domain | text | `CHECK IN ('health','work','consumption','capability','interest')` | 五域之一 |
| type | text | NOT NULL | 域内事件类型（sleep/expense/focus_session/...） |
| ts | timestamptz | NOT NULL | 事件发生时间（核心索引） |
| payload | jsonb | NOT NULL | 结构化明细，按 domain+type 约定 schema |
| source | text | NOT NULL | 录入来源（manual/wechat_sport/bank_csv/...） |
| created_at | timestamptz | NOT NULL DEFAULT now() | 入库时间 |

索引：`ix_events_user_ts(user_id, ts)`、`ix_events_domain(domain)`

### tags
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | bigint | PK, IDENTITY | |
| event_id | bigint | FK→events.id ON DELETE CASCADE | |
| tag | text | NOT NULL | 自由标签，跨域检索/图边 |

索引：`ix_tags_tag(tag)`

### goals（PO 设定的目标）
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| user_id | uuid | NOT NULL | |
| title | text | NOT NULL | |
| domain | text | `CHECK IN (五域)` | 关联域 |
| status | text | DEFAULT 'active', `CHECK IN ('active','done','dropped')` | |
| created_at | timestamptz | NOT NULL DEFAULT now() | |

索引：`ix_goals_user_id(user_id)`

### plans（分析 Agent 产出的行动方案）
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| user_id | uuid | NOT NULL | |
| title | text | NOT NULL | |
| generated_by | text | NOT NULL | 哪个分析模型/Agent |
| based_on | jsonb | NOT NULL | 引用的事件范围/查询条件（可回溯） |
| content | jsonb | NOT NULL | 行动方案明细 |
| created_at | timestamptz | NOT NULL DEFAULT now() | |

索引：`ix_plans_user_id(user_id)`

## 3. 各域 type 与 payload 草案（待 PO 确认粒度）

- **health**：sleep{duration,hour,quality} / steps{count} / weight{kg} / workout{type,duration_min,calorie} / mood{score} / water{ml}
- **work**：focus_session{duration_min,project} / task{done,pomodoro} / meeting{duration_min,title}
- **consumption**：expense{amount,category,merchant,pay_method} / income{amount,source} / subscription{name,amount,cycle}
- **capability**：skill_log{name,hours} / learning{resource,hours} / cert{name,status}
- **interest**：read{title,topic,mins} / hobby{log,mins} / topic_follow{name}

> 敏感字段（健康明细、消费金额/商户）建议应用层加密后再入 `payload`（门禁 6）。

## 4. 行级安全（RLS，每用户隔离）

所有 `public` 表均 `ENABLE ROW LEVEL SECURITY`，策略：`USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`。
`tags` 经 `event_id` 间接归属当前用户（子查询校验）。
前端（authenticated 角色）只能读写自己的行；云函数（service_role）可越权做聚合/分析。

## 5. 云函数接口（服务端逻辑，Codex 负责）

| 函数 | 入参 | 行为 | 返回 |
|------|------|------|------|
| `recordEvent` | payload（domain,type,ts,payload,source） | 注入 user_id=auth.uid() 插入 events | 新事件 id |
| `listEvents` | domain?, range? | 按当前用户查 events（+tags） | 事件列表 |
| `upsertGoal` / `listGoals` | goal 字段 / — | 目标增查（带 user_id） | 目标 |
| `generatePlan` | based_on（查询范围） | 调 LLM 分析 → 写 plans（generated_by 记模型） | 新方案 id |
| `listPlans` | — | 按当前用户查 plans | 方案列表 |

> 高频录入/查询可由前端直接 `cloud.rdb()` 完成（受 RLS）；复杂聚合与 AI 分析走云函数。

## 6. 图分析（环路检测等）

- 边由 events + tags 派生（如 capability→interest 投入关系）。
- v1 用云函数内 networkx / SQL 递归 CTE；Neo4j 仅当触发条件满足后评估（见 ADR-001 §4）。

## 7. 变更流程（质量门禁 8）

任何表/字段/RLS/云函数签名变更：先写 ADR → 更新本文档 → `managePgDatabase applyMigration`（带回滚 SQL）→ 通知 Gemini 重读。
