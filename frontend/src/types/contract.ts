/**
 * TS 类型 —— 严格镜像 docs/cloudbase-contract.md **v1.4** 的 public 表结构。
 * 契约是唯一事实源：任何字段改动必须先改契约（走 ADR），再改这里。
 *
 * v1.4 要点：
 *   - 三王域：health(薄肌王) / work(力王) / dating(黄毛王)；capability / interest 后续扩展
 *   - §8 新增 analytics_events / profiles（漏斗埋点与分析层）
 *   - step 为命名空间枚举（product.* / dating.* / health.* / work.*），仅 v1 取值
 */

/** 三域（events.domain CHECK / goals.domain 同枚举） */
export const DOMAINS = ['health', 'work', 'dating'] as const
export type Domain = (typeof DOMAINS)[number]

/** 三王中文名（产品定义 §4） */
export const KING_LABELS: Readonly<Record<Domain, string>> = {
  health: '薄肌王',
  work: '力王',
  dating: '黄毛王',
}

/** goals.status CHECK */
export const GOAL_STATUSES = ['active', 'done', 'dropped'] as const
export type GoalStatus = (typeof GOAL_STATUSES)[number]

/** jsonb */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

/** bigint（超出 JS 安全整数时网关可能返回字符串，故两者都接受） */
export type BigIntId = number | string

/** events（统一事件表） */
export interface EventRow {
  id: BigIntId
  user_id: string
  domain: Domain
  type: string
  /** timestamptz（ISO 8601，带时区） */
  ts: string
  payload: JsonObject
  source: string
  created_at: string
}

/** 写入载荷：user_id 由 RLS/auth.uid() 注入，created_at 用 DB 默认值 */
export interface EventInsert {
  domain: Domain
  type: string
  ts: string
  payload: JsonObject
  source: string
}

export interface TagRow {
  id: BigIntId
  event_id: BigIntId
  tag: string
}

export interface GoalRow {
  id: string
  user_id: string
  title: string
  domain: Domain
  status: GoalStatus
  created_at: string
}

export interface PlanRow {
  id: string
  user_id: string
  title: string
  generated_by: string
  based_on: JsonObject
  content: JsonObject
  created_at: string
}

/* ───────────────────────── contract §8 增长漏斗与分析层 ───────────────────────── */

/** analytics_events.name —— 原始行为事件（契约 §8） */
export const ANALYTICS_NAMES = [
  'app_open',
  'view_king',
  'complete_checkin',
  'share',
  'reactivate',
  'stage_up',
  'log_spending',
  'set_goal',
] as const
export type AnalyticsName = (typeof ANALYTICS_NAMES)[number]

/** analytics_events.channel —— 获客渠道 */
export const CHANNELS = ['wechat_search', 'moments_ad', 'friend_share', 'organic'] as const
export type Channel = (typeof CHANNELS)[number]

/** profiles.user_type */
export const USER_TYPES = ['new', 'returning'] as const
export type UserType = (typeof USER_TYPES)[number]

/**
 * 漏斗步（契约 §8 命名空间枚举，**仅 v1 取值**；Phase 3 步骤不在 v1 枚举内）。
 */
export const FUNNEL_STEPS = [
  // 产品级 AARRR
  'product.acquire',
  'product.activate',
  'product.retain',
  'product.habit',
  'product.value',
  'product.refer',
  'product.reactive',
  // 黄毛王
  'dating.onboard',
  'dating.approach',
  'dating.response',
  'dating.date',
  'dating.stage_up',
  'dating.stage5',
  'dating.refer',
  // 薄肌王
  'health.onboard',
  'health.water',
  'health.sleep',
  'health.workout',
  'health.active_day',
  'health.body_sense',
  'health.refer',
  // 力王
  'work.onboard',
  'work.wage',
  'work.spend',
  'work.retain',
  'work.refer',
] as const
export type FunnelStep = (typeof FUNNEL_STEPS)[number]

/** analytics_events（行为/漏斗事件） */
export interface AnalyticsEventRow {
  id: BigIntId
  user_id: string
  name: AnalyticsName
  /** 漏斗归属；name 仅记原始行为 */
  step: FunnelStep | null
  domain: Domain | null
  channel: Channel | null
  region: string | null
  user_type: UserType | null
  variant: string | null
  payload: JsonObject
  ts: string
}

/** 写入载荷（id/ts 由 DB 生成；user_id 由 RLS 校验） */
export interface AnalyticsEventInsert {
  user_id: string
  name: AnalyticsName
  step?: FunnelStep | null
  domain?: Domain | null
  channel?: Channel | null
  region?: string | null
  user_type?: UserType | null
  variant?: string | null
  payload?: JsonObject
}

/** profiles（用户分群维度，user_id 即主键） */
export interface ProfileRow {
  user_id: string
  region: string | null
  user_type: UserType
  acquire_channel: Channel | null
  gender: string | null
  created_at: string
}

/* ───────────────────────── 敏感域与访问通道（契约 §5 注） ───────────────────────── */

/**
 * 契约 §5 注：**health / dating 敏感事件必须经 recordEvent / listEvents 云函数**读写
 * （payload 由服务端加解密）；work 可经 cloud.rdb() 直连。
 */
export const SENSITIVE_DOMAINS = ['health', 'dating'] as const
export type SensitiveDomain = (typeof SENSITIVE_DOMAINS)[number]

export function isSensitiveDomain(domain: Domain): domain is SensitiveDomain {
  return (SENSITIVE_DOMAINS as readonly Domain[]).includes(domain)
}

/** 可安全走 cloud.rdb() 的域 */
export const RDB_DOMAINS: readonly Domain[] = DOMAINS.filter((d) => !isSensitiveDomain(d))

/** 可经 rdb 访问的表（契约 §2 / §8；analytics_events、profiles 非敏感） */
export type TableName = 'events' | 'tags' | 'goals' | 'plans' | 'analytics_events' | 'profiles'