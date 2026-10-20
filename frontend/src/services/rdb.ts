/**
 * cloud.rdb() 之上的薄仓储层：只做"表 → 类型"映射与错误归一。
 * 不拼 URL、不直连数据库；RLS 由 CloudBase 按 auth.uid() 自动隔离（契约 §4）。
 */
import { CloudbaseQueryError, getRdb } from './cloudbase'
import type { RdbErrorLike } from './cloudbase'
import type {
  AnalyticsEventInsert,
  AnalyticsEventRow,
  BigIntId,
  Domain,
  EventInsert,
  EventRow,
  GoalRow,
  ProfileRow,
} from '../types/contract'

/** events 直写需带 user_id：列 NOT NULL 且 RLS WITH CHECK 校验其等于 auth.uid() */
export type EventRowInsert = EventInsert & { user_id: string }

const EVENT_COLUMNS = 'id,user_id,domain,type,ts,payload,source,created_at'
const GOAL_COLUMNS = 'id,user_id,title,domain,status,created_at'
const ANALYTICS_COLUMNS =
  'id,user_id,name,step,domain,channel,region,user_type,variant,payload,ts'
const PROFILE_COLUMNS = 'user_id,region,user_type,acquire_channel,gender,created_at'

function fail(error: RdbErrorLike | null, fallback: string): void {
  if (error) {
    throw new CloudbaseQueryError(error.message ?? fallback, error.code)
  }
}

/** 按域集合读取事件（§5 注：仅非敏感域可走此路径） */
export async function selectEventsByDomains(
  domains: readonly Domain[],
  limit = 200,
): Promise<EventRow[]> {
  const { data, error } = await getRdb()
    .from<EventRow>('events')
    .select(EVENT_COLUMNS)
    .in('domain', domains)
    .order('ts', { ascending: false })
    .limit(limit)
  fail(error, '查询 events 失败')
  return data ?? []
}

/** 写入非敏感域事件，返回自增 id */
export async function insertEvent(row: EventRowInsert): Promise<BigIntId> {
  const { data, error } = await getRdb()
    .from<{ id: BigIntId }>('events')
    .insert(row)
    .select('id')
    .single()
  fail(error, '写入 events 失败')
  if (!data) throw new CloudbaseQueryError('写入 events 失败：未返回 id')
  return data.id
}

export async function selectGoals(limit = 50): Promise<GoalRow[]> {
  const { data, error } = await getRdb()
    .from<GoalRow>('goals')
    .select(GOAL_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)
  fail(error, '查询 goals 失败')
  return data ?? []
}

/* ───────────────────────── §8 分析层（非敏感，直连 rdb） ───────────────────────── */

/** 写入一条行为/漏斗事件（name 为原始行为，step 为漏斗归属） */
export async function insertAnalyticsEvent(row: AnalyticsEventInsert): Promise<BigIntId> {
  const { data, error } = await getRdb()
    .from<{ id: BigIntId }>('analytics_events')
    .insert(row)
    .select('id')
    .single()
  fail(error, '写入 analytics_events 失败')
  if (!data) throw new CloudbaseQueryError('写入 analytics_events 失败：未返回 id')
  return data.id
}

/** 拉取最近的埋点事件（v1 前端本地算漏斗；Phase 3 换 getFunnel 云函数） */
export async function selectAnalyticsEvents(limit = 200): Promise<AnalyticsEventRow[]> {
  const { data, error } = await getRdb()
    .from<AnalyticsEventRow>('analytics_events')
    .select(ANALYTICS_COLUMNS)
    .order('ts', { ascending: false })
    .limit(limit)
  fail(error, '查询 analytics_events 失败')
  return data ?? []
}

/** 当前用户的分群档案（可能尚未创建） */
export async function selectProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await getRdb()
    .from<ProfileRow>('profiles')
    .select(PROFILE_COLUMNS)
    .eq('user_id', userId)
    .limit(1)
  fail(error, '查询 profiles 失败')
  return data && data.length > 0 ? data[0] ?? null : null
}

/** 登录后写一次分群档案（user_id 为 PK，幂等） */
export async function upsertProfile(row: {
  user_id: string
  region?: string | null
  user_type?: ProfileRow['user_type']
  acquire_channel?: ProfileRow['acquire_channel']
  gender?: string | null
}): Promise<void> {
  const { error } = await getRdb()
    .from<ProfileRow>('profiles')
    .upsert(row, { onConflict: 'user_id' })
  fail(error, '写入 profiles 失败')
}