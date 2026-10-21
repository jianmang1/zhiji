# 数据契约 v1.4（CloudBase 原生 · public schema）

> 这是 **执己** 项目在 CloudBase 原生模型下的**唯一数据契约**（原则三）。
> 取代原 `docs/api/openapi.yaml` 作为前端数据访问契约；openapi.yaml 降为可选 HTTP 云函数端点文档。
> Codex（云函数）/ DeepSeek（前端 SDK）均以此文档为准，互不直连。
>
> **2026-10-20 更新（v1.4）**：§8 `step` 字段改为**命名空间枚举**（`product.*`/`dating.*`/`health.*`/`work.*`，仅列 v1 步骤，Phase 3 留 TODO），支撑两层漏斗聚合；v1.3 的 §8 分析层（`analytics_events`+`profiles` 表，前向兼容）维持不变。v1.2 冻结项（dating 4 类热点、评分阈值、等级命名、generatePlan schema）维持不变。
> 注：`user_id` 类型经 ADR-004（2026-10-21）由 `uuid` 改为 `text`。

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

所有 `public` 表均 `ENABLE ROW LEVEL SECURITY`，策略：`USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text)`。
`tags` 经 `event_id` 间接归属当前用户（子查询校验）。
前端（authenticated 角色）只能读写自己的行。当前云函数也透传调用者的 authenticated access token，因此事件、方案和漏斗结果仍受同一 RLS 策略约束；本项目当前没有启用可绕过 RLS 的 service_role 聚合。

## 5. 云函数接口（服务端逻辑，Codex 负责）

| 函数 | 入参 | 行为 | 返回 | 状态 |
|------|------|------|------|------|
| `recordEvent` | payload（domain,type,ts,payload,source） | 注入 user_id=auth.uid() 插入 events | 新事件 id | **已实现（E2E2 验证通过，见 [集成检查点](integration-checkpoint-20261021.md)）** |
| `listEvents` | domain?, range? | 按当前用户查 events（+tags） | 事件列表 | **已实现（E2E2 验证通过，见 [集成检查点](integration-checkpoint-20261021.md)）** |
| `upsertGoal` / `listGoals` | goal 字段 / — | 目标增查；读写必须遵守当前用户 RLS | 目标 | **未提供云函数**；客户端已有 `selectGoals` RDB 查询，目标写入端点未实现 |
| `generatePlan` | based_on（含 domain 与查询范围） | 以滚动 7 天 events 镜像前端规则引擎算 score/tier；LLM 生成摘要、行动和里程碑后写 plans；AI 未配置或不可用时写入规则兜底并返回 `ai_enabled:false` | 新方案 id；降级时附 `content` | **已实现（E2E2 验证通过；AI 降级见 Phase 3 checkpoint）** |
| `getFunnel` | domain?（默认 product）, range{from,to}, segment? | 在当前用户 RLS 可见的 analytics_events 中按 step 聚合，并以本人 profile 补充分群维度；返回渠道质量、日趋势及 experiment/variant 拆分 | steps, bottleneck_step, channel_quality, trend, experiments, segment? | **已实现（E2E2 验证通过；Phase 3 增强见 checkpoint）** |
| `listPlans` | — | 按当前用户查 plans | 方案列表 | **未提供云函数**；页面仍为占位，尚未接入读取 |

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
- AI provider/model 未配置、AI 请求失败或模型输出不符合 schema 时，仍按 2xx 创建规则兜底方案。响应包含 `ai_enabled:false` 与 `content`（符合上方 schema），`generated_by` 为 `rules-fallback`；正常 AI 响应为 `ai_enabled:true`。

## 6. 图分析（环路检测等）

- 边由 events + tags 派生（后续扩展域可形成跨域投入关系，v1 三域暂不构图）。
- v1 用云函数内 networkx / SQL 递归 CTE；Neo4j 仅当触发条件满足后评估（见 ADR-001 §4）。

## 7. 变更流程（质量门禁 8）

任何表/字段/RLS/云函数签名变更：先写 ADR → 更新本文档 → `managePgDatabase applyMigration`（带回滚 SQL）→ 通知 DeepSeek 重读。

## 8. 增长漏斗与精细化分析层（前向兼容 · v1 建表，Phase 3 计算）

> 依据 product-definition.md §15。目标：漏斗瓶颈定位、渠道质量、体验指标、A/B、分群运营。
> **v1 即建表 + 埋点**；完整聚合/可视化计算放 Phase 3。新增表**不改动** §2–§5 已冻结结构。

### analytics_events（行为/漏斗事件）
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | bigint | PK, IDENTITY | |
| user_id | text | NOT NULL | = auth.uid() |
| name | text | NOT NULL | 原始行为事件：`app_open`/`view_king`/`complete_checkin`/`share`/`reactivate`/`stage_up`/`log_spending`/`set_goal` |
| step | text | | 漏斗步代码（命名空间枚举，见下）。v1 仅取下列值；Phase 3 扩展留 TODO |
| domain | text | `CHECK IN ('health','work','dating')` | 关联王（可选） |
| channel | text | | 获客渠道：`wechat_search`/`moments_ad`/`friend_share`/`organic` |
| region | text | | 地域（省/市，可选） |
| user_type | text | | `new`/`returning`；dating 域可加 `gender` |
| variant | text | | A/B 实验分组（Phase 3） |
| experiment_id | text | NULL 表示非实验事件 | A/B 实验标识（Phase 3） |
| payload | jsonb | NOT NULL DEFAULT '{}' | 扩展：如 spending `{category, amount}` |
| ts | timestamptz | NOT NULL DEFAULT now() | |

索引：`ix_analytics_user_ts(user_id, ts)`、`ix_analytics_name(name)`

**`step` 命名空间枚举（v1，Phase 3 步骤留 TODO）**：
- `product.acquire` / `product.activate` / `product.retain` / `product.habit` / `product.value` / `product.refer` / `product.reactive`
- `dating.onboard` / `dating.approach` / `dating.response` / `dating.date` / `dating.stage_up` / `dating.stage5` / `dating.refer`
- `health.onboard` / `health.water` / `health.sleep` / `health.workout` / `health.active_day` / `health.body_sense` / `health.refer`
- `work.onboard` / `work.wage` / `work.spend` / `work.retain` / `work.refer`
- *Phase 3 TODO（不在 v1 枚举）：`health.body_fat`/`health.in_band`、`work.save`/`work.grow`/`work.fin_health`*
- `getFunnel` 据此 `step` 聚合两层漏斗；`name` 仅记录原始行为，`step` 才是漏斗归属。

### profiles（用户分群维度，v1 即建）
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| user_id | text | PK, = auth.uid() | |
| region | text | | 地域 |
| user_type | text | DEFAULT 'new', `CHECK IN ('new','returning')` | |
| acquire_channel | text | | 首次获客渠道（渠道质量评估） |
| gender | text | | dating 域可选（`male`/`female`/`other`） |
| created_at | timestamptz | NOT NULL DEFAULT now() | |

### 力王`消费`步骤的轻量行为事件（不复活 consumption 域）
- 用 `analytics_events`(name=`log_spending`, domain=`work`, payload=`{category, amount}`) 记录。
- `category` 枚举：`rent`(房租, 与力王程度**正比**) / `hedonic`(奶茶·烧烤·小吃等享乐, **反比**) / `for_others`(花在别人身上, **正比**) / `other`。
- v1 仅作漏斗"消费"步完成信号；Phase 3 据 category 做力王消费观洞察（正比/反比加权）。

### 云函数
- `trackAnalytics`：前端直接 `cloud.rdb()` 写 `analytics_events`（非敏感，受 RLS）；无需云函数。
- `getFunnel(domain?, range, segment?)`：当前版本每次请求聚合一个漏斗（默认产品级 `product.*`，或 `dating.*`/`health.*`/`work.*`），输出各步事件数、相邻步转化率/drop-off/瓶颈步；`product.reactive` 单独计数。segment 优先使用埋点字段，缺失时回退到调用者自己的 `profiles` 字段。函数使用调用者 JWT，不使用 `service_role`，因此结果严格限于当前用户可见事件；跨用户 cohort 聚合仍属后续 ADR/权限设计范围。前端看板可分别请求产品级和各王级结果。

Phase 3 增强字段：`channel_quality` 按渠道返回 acquisition→activation 事件数及转化比例（health/work/dating 使用 onboard→第二步）；`trend` 返回按 UTC 日期与 step 汇总的事件数；`experiments` 按 `experiment_id`/`variant` 返回各步计数。以上均使用同一 RLS 可见事件集，样本不足时仍返回原始计数，渠道转化率在 acquisition 计数为 0 时为 `null`。`conv_rate` 与 `drop_off` 均为 0–1 比例。

### RLS
`analytics_events` / `profiles` 同 §4：`ENABLE RLS`，策略 `USING (user_id = auth.uid()::text)`；云函数使用调用者 JWT，不使用 `service_role`，聚合结果仅包含调用者可见数据。
