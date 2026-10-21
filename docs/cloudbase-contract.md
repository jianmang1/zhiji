# 数据契约 v1.5（CloudBase 原生 · public schema）

> 这是 **执己** 项目在 CloudBase 原生模型下的**唯一数据契约**（原则三）。
> 取代原 `docs/api/openapi.yaml` 作为前端数据访问契约；openapi.yaml 降为可选 HTTP 云函数端点文档。
> Codex（云函数）/ DeepSeek（前端 SDK）均以此文档为准，互不直连。
>
> **2026-10-20 更新（v1.4）**：§8 `step` 字段改为**命名空间枚举**（`product.*`/`dating.*`/`health.*`/`work.*`，仅列 v1 步骤，Phase 3 留 TODO），支撑两层漏斗聚合；v1.3 的 §8 分析层（`analytics_events`+`profiles` 表，前向兼容）维持不变。v1.2 冻结项（dating 4 类热点、评分阈值、等级命名、generatePlan schema）维持不变。
> 注：`user_id` 类型经 ADR-004（2026-10-21）由 `uuid` 改为 `text`。
> **2026-10-21 更新（v1.5）**：ADR-005 采纳 A——§3 health 域新增 `body_sense` type（`{waist_cm?, feel?:enum('great','ok','tired'), note?}`），补齐薄肌王"体感/围度"漏斗步的可产出事件；零数据库迁移（`events.type` 为自由 text），仅改契约 §3 + 前端注册表，Codex 零改；冻结项变更受控生效。

## 1. 鉴权模型

- 用户体系由 **CloudBase 内置 auth** 提供（`auth.users` / `auth.tokens`）。
- 微信登录：前端调 `cloud.auth` 微信登录集成；服务端用 `auth.uid()` 取当前用户 id（text）。
- **不**自建 `users` 表、不签发 JWT；应用表用 `user_id text` 关联当前用户，RLS 强制隔离。

## 2. 表（public schema）

### events（统一事件表）
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | bigint | PK, IDENTITY | 自增 |
| user_id | text | NOT NULL | 当前用户（= auth.uid()） |
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
| user_id | text | NOT NULL | |
| title | text | NOT NULL | |
| domain | text | `CHECK IN ('health','work','dating')` | 关联域（v1 三域） |
| status | text | DEFAULT 'active', `CHECK IN ('active','done','dropped')` | |
| created_at | timestamptz | NOT NULL DEFAULT now() | |

索引：`ix_goals_user_id(user_id)`

### plans（分析 Agent 产出的行动方案）
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| user_id | text | NOT NULL | |
| title | text | NOT NULL | |
| generated_by | text | NOT NULL | 哪个分析模型/Agent |
| based_on | jsonb | NOT NULL | 引用的事件范围/查询条件（可回溯） |
| content | jsonb | NOT NULL | 行动方案明细 |
| created_at | timestamptz | NOT NULL DEFAULT now() | |

索引：`ix_plans_user_id(user_id)`

## 3. 各域 type 与 payload 草案（v1 三王）

- **health（薄肌王）**：`water{ml}` / `sleep{duration_h,quality}` / `workout{type,duration_min,calorie}` / `body_sense{waist_cm?:number, feel?:enum('great','ok','tired'), note?:text}`（ADR-005 采纳 A，2026-10-21；零迁移）
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

所有 `public` 表均 `ENABLE ROW LEVEL SECURITY`，策略：`USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text)`。
`tags` 经 `event_id` 间接归属当前用户（子查询校验）。
前端（authenticated 角色）只能读写自己的行。当前云函数也透传调用者的 authenticated access token，因此事件、方案和漏斗结果仍受同一 RLS 策略约束；本项目当前没有启用可绕过 RLS 的 service_role 聚合。

## 5. 云函数接口（服务端逻辑，Codex 负责）

| 函数 | 入参 | 行为 | 返回 | 状态 |
|------|------|------|------|------|
| `recordEvent` | payload（domain,type,ts,payload,source） | 注入 user_id=auth.uid() 插入 events | 新事件 id | **已实现（E2E2 验证通过，见 [集成检查点](integration-checkpoint-20261021.md)）** |
| `listEvents` | domain?, range? | 按当前用户查 events（+tags） | 事件列表 | **已实现（E2E2 验证通过，见 [集成检查点](integration-checkpoint-20261021.md)）** |
| `upsertGoal` / `listGoals` | goal 字段 / — | 目标增查；读写必须遵守当前用户 RLS | 目标 | **未提供云函数**；客户端已有 `selectGoals` RDB 查询，目标写入端点未实现 |
| `generatePlan` | based_on（含 domain 与查询范围） | 以滚动 7 天 events 镜像前端规则引擎算 score/tier；LLM 生成摘要、行动和里程碑后写 plans | 新方案 id | **已实现（E2E2 验证通过，见 [集成检查点](integration-checkpoint-20261021.md)）** |
| `getFunnel` | domain?（默认 product）, range{from,to}, segment? | 在当前用户 RLS 可见的 analytics_events 中按 step 聚合，并以本人 profile 补充分群维度 | steps, bottleneck_step, segment? | **已实现（E2E2 验证通过，见 [集成检查点](integration-checkpoint-20261021.md)）** |
| `listPlans` | — | 按当前用户查 plans | 方案列表 | **未提供云函数**；页面仍为占位，尚未接入读取 |