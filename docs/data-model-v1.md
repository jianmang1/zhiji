# 数据模型 v1（草案）

> 目标：支撑 2-4 个月个人数据积累（健康/工作/消费/能力/兴趣），并能交给不同分析 Agent 产出多套行动方案。
> 设计取向：**统一事件模型（event-sourcing）+ JSONB 弹性载荷**，避免 5 域各自建重表导致早期过度工程。

## 1. 核心表

### events（统一事件表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint PK | |
| user_id | uuid | 单用户初期可固定 |
| domain | enum | health / work / consumption / capability / interest |
| type | text | 域内事件类型（如 sleep / expense / focus_session） |
| ts | timestamptz | 事件发生时间（核心索引） |
| payload | jsonb | 结构化明细，按 domain+type 约定 schema |
| source | text | 录入来源（manual / wechat_sport / bank_csv / ...） |
| created_at | timestamptz | 入库时间 |

### tags
| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint PK | |
| event_id | FK → events.id | |
| tag | text | 自由标签，便于跨域检索与图边 |

### goals（PO 设定的目标）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid PK | |
| title | text | |
| domain | enum | 关联域 |
| status | enum | active / done / dropped |
| created_at | timestamptz | |

### plans（分析 Agent 产出的行动方案）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid PK | |
| title | text | |
| generated_by | text | 哪个分析 Agent / 模型 |
| based_on | jsonb | 引用的事件范围/查询条件（可回溯） |
| content | jsonb / text | 行动方案明细 |
| created_at | timestamptz | |

## 2. 各域 type 与 payload 草案（待 PO 确认粒度）

- **health**：sleep{duration,hour,quality} / steps{count} / weight{kg} / workout{type,duration_min,calorie} / mood{score} / water{ml}
- **work**：focus_session{duration_min,project} / task{done,pomodoro} / meeting{duration_min,title}
- **consumption**：expense{amount,category,merchant,pay_method} / income{amount,source} / subscription{name,amount,cycle}
- **capability**：skill_log{name,hours} / learning{resource,hours} / cert{name,status}
- **interest**：read{title,topic,mins} / hobby{log,mins} / topic_follow{name}

## 3. 图分析（环路检测等）

- 边由 events + tags 派生（如 capability→interest 的投入关系）。
- v1 用 networkx（Python）或 SQL 递归 CTE 做环路/多跳；Neo4j 仅在触发条件满足后迁移（见 ADR-001 §4）。

## 4. 待 PO 确认的关键问题

1. **采集方式**：各域主要靠手动录入，还是自动导入（微信运动/账单 CSV/日历）？决定 payload 结构与采集入口复杂度。
2. **记录粒度**：先粗（每天一条汇总）还是先细（每次事件一条）？v1 建议先粗以保留存率。
3. **分析目标**：2-4 个月后你最想拿到哪类"行动方案"？决定 plans 表设计与喂给哪些分析 Agent。
