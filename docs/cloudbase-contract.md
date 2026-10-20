# 数据契约 v1.2（CloudBase 原生 · public schema）

> 这是 **执己** 项目在 CloudBase 原生模型下的**唯一数据契约**（原则三）。
> 取代原 `docs/api/openapi.yaml` 作为前端数据访问契约；openapi.yaml 降为可选 HTTP 云函数端点文档。
> Codex（云函数）/ DeepSeek（前端 SDK）均以此文档为准，互不直连。
>
> **2026-10-20 更新（v1.2，已达可派发状态）**：黄毛王(dating)热点维度由 PO 锁定为 4 类（approach/date/chat/stage）；新增 `generatePlan` 统一输出 schema（§5.1）。评分阈值与等级命名已由 PO 冻结（见 product-definition.md §5）；主色板 PO 决定不冻结、由前端按粗野风自选（受约束）。**v1 契约进入可派发状态**——派发 DeepSeek 前不应再改 payload/type/评分/LLM schema；此后变更须走 ADR+PR（门禁 8）。

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
| domain | text | `CHECK IN ('health','work','dating')` | 三域之一（v1）；capability/interest 后续扩展 |
| type | text | NOT NULL | 域内事件类型（water/workout/date_session/...） |
| ts | timestamptz | NOT NULL | 事件发生时间（核心索引） |
| payload | jsonb | NOT NULL | 结构化明细，按 domain+type 约定 schema |
| source | text | NOT NULL | 录入来源（manual/wechat_sport/...） |
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
| domain | text | `CHECK IN ('health','work','dating')` | 关联域（v1 三域） |
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

## 3. 各域 type 与 payload 草案（v1 三王）

- **health（薄肌王）**：`water{ml}` / `sleep{duration_h,quality}` / `workout{type,duration_min,calorie}`
- **work（力王）**：`work_log{hours,wage,salary,commute_min}`
- **dating（黄毛王·异性交往）**：
  - `approach` 主动搭讪：`{count:int≥1, channel:enum('online','offline','social'), got_response:bool}`
  - `date` 约会：`{count:int≥1, duration_min:int, mood:enum('great','ok','awkward'), spend_yuan:number?}`
  - `chat` 聊天：`{duration_min:int, platform:enum('wechat','app','phone','face'), initiator:enum('me','them','both')}`
  - `stage` 脱单进度：`{stage:int CHECK 0..5, label:enum('solo','talking','ambiguous','dating_steady','exclusive','in_love'), note:text?}`
  - 阶段定义：0 母胎solo｜1 有接触｜2 暧昧中｜3 稳定约会｜4 确定关系｜5 恋爱中
- *扩展域 `capability`/`interest` 后续版本加入，v1 不含。*

> 敏感字段（健康明细、异性交往明细）建议应用层加密后再入 `payload`（门禁 6）。

## 4. 行级安全（RLS，每用户隔离）

所有 `public` 表均 `ENABLE ROW LEVEL SECURITY`，策略：`USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`。
`tags` 经 `event_id` 间接归属当前用户（子查询校验）。
前端（authenticated 角色）只能读写自己的行；云函数（service_role）可越权做聚合/分析。

## 5. 云函数接口（服务端逻辑，Codex 负责）

| 函数 | 入参 | 行为 | 返回 |
|------|------|------|------|
| `recordEvent` | payload（domain,type,ts,payload,source） | 注入 user_id=auth.uid() 插入 events | 新事件 id | 本地已实现并通过单元测试；待云端联调 |
| `listEvents` | domain?, range? | 按当前用户查 events（+tags） | 事件列表 | 本地已实现并通过单元测试；待云端联调 |
| `upsertGoal` / `listGoals` | goal 字段 / — | 目标增查（带 user_id） | 目标 |
| `generatePlan` | based_on（查询范围） | 调 LLM 分析 → 写 plans（generated_by 记模型） | 新方案 id | 本地已实现并通过单元测试；待云端联调 |
| `listPlans` | — | 按当前用户查 plans | 方案列表 |

> 非敏感数据的高频读写可由前端直接 `cloud.rdb()` 完成（受 RLS）。**health/dating 敏感事件必须通过 `recordEvent` 写入、通过 `listEvents` 读取**，由云函数负责加密和解密 payload；不得由客户端直接写入或读取敏感事件 payload。复杂聚合与 AI 分析走云函数。

### 5.1 `generatePlan` 统一输出 schema（v1 三王同构）

LLM 产出的 `plans.content` 必须符合以下 JSON 结构（三王通用，Codex 在 prompt 中强制）：

```json
{
  "domain": "health | work | dating",
  "score": 72,
  "tier": "荣耀黄金",
  "summary": "本周概览一句话（基于近期 events + 当前评分）",
  "actions": [
    {"title": "可执行动作", "why": "依据", "effort": "low | mid | high"}
  ],
  "next_milestone": "下一阶段目标（如：从暧昧中推进到稳定约会）"
}
```

- `score`/`tier` 由规则引擎算好后传入，LLM 仅生成 `summary`/`actions`/`next_milestone`，避免 LLM 编造分数。
- `actions` 数组长度建议 2–4 条，按 `effort` 升序，确保"从认知到执行"可落地。

## 6. 图分析（环路检测等）

- 边由 events + tags 派生（后续扩展域可形成跨域投入关系，v1 三域暂不构图）。
- v1 用云函数内 networkx / SQL 递归 CTE；Neo4j 仅当触发条件满足后评估（见 ADR-001 §4）。

## 7. 变更流程（质量门禁 8）

任何表/字段/RLS/云函数签名变更：先写 ADR → 更新本文档 → `managePgDatabase applyMigration`（带回滚 SQL）→ 通知 DeepSeek 重读。
