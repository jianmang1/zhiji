/**
 * 事件域服务：按契约 §5 决定"直连 rdb"还是"必须走云函数"。
 *
 *   - health / consumption：payload 敏感 → 只能经 recordEvent / listEvents（云函数加解密）
 *   - work / capability / interest：可经 cloud.rdb() 高频读写
 *
 * 云函数端点是 HTTP 函数（cloudbase/src/zhiji_cloudbase/http_function.py：POST + Bearer）。
 * Codex 侧标注「本地已实现…待云端联调」，因此端点未配置时抛 CloudFunctionUnavailableError，
 * 由页面显式提示而不是伪造数据。
 */
import Taro from '@tarojs/taro'
import { CloudFunctionUnavailableError, getAuth } from './cloudbase'
import { insertEvent, selectEventsByDomains, selectGoals } from './rdb'
import type { BigIntId, Domain, EventInsert, EventRow, GoalRow } from '../types/contract'
import { isSensitiveDomain, RDB_DOMAINS, SENSITIVE_DOMAINS } from '../types/contract'

const RAW_BASE = process.env.TARO_APP_CLOUDBASE_FN_BASE_URL ?? ''
export const FUNCTIONS_BASE_URL = RAW_BASE.replace(/\/+$/, '')

export function isCloudFunctionConfigured(): boolean {
  return FUNCTIONS_BASE_URL.length > 0
}

export type EventVia = 'rdb' | 'recordEvent'

export interface CreateEventResult {
  id: BigIntId
  via: EventVia
}

async function accessToken(): Promise<string> {
  const { accessToken: token } = await getAuth().getAccessToken()
  return token
}

function errorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message?: unknown }).message
    if (typeof message === 'string' && message.length > 0) return message
  }
  return `云函数调用失败（HTTP ${status}）`
}

export async function callHttpFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!isCloudFunctionConfigured()) {
    throw new CloudFunctionUnavailableError(name)
  }
  const token = await accessToken()
  const response = await Taro.request({
    url: `${FUNCTIONS_BASE_URL}/${name}`,
    method: 'POST',
    header: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    data: body,
  })
  const status = response.statusCode
  if (status === 200 || status === 201) {
    return response.data as T
  }
  throw new Error(errorMessage(response.data, status))
}

/** 云函数 recordEvent：{domain,type,ts,payload,source} → 201 {id} */
export async function recordEventRemote(input: EventInsert): Promise<BigIntId> {
  const body = {
    domain: input.domain,
    type: input.type,
    ts: input.ts,
    payload: input.payload,
    source: input.source,
  }
  const result = await callHttpFunction<{ id: BigIntId }>('recordEvent', body)
  return result.id
}

export interface ListEventsQuery {
  domain?: Domain
  limit?: number
  range?: { from: string; to: string }
}

/** 云函数 listEvents：返回已解密 payload 的事件行 */
export async function listEventsRemote(query: ListEventsQuery = {}): Promise<EventRow[]> {
  const body: Record<string, unknown> = { limit: query.limit ?? 50 }
  if (query.domain) body.domain = query.domain
  if (query.range) body.range = query.range
  const rows = await callHttpFunction<EventRow[]>('listEvents', body)
  return Array.isArray(rows) ? rows : []
}

/**
 * 统一写入入口：敏感域强制走云函数，其余直连 rdb（带上当前 user_id，由 RLS 校验）。
 */
export async function createEvent(input: EventInsert, userId: string): Promise<CreateEventResult> {
  if (isSensitiveDomain(input.domain)) {
    return { id: await recordEventRemote(input), via: 'recordEvent' }
  }
  const id = await insertEvent({ ...input, user_id: userId })
  return { id, via: 'rdb' }
}

export interface DashboardData {
  events: EventRow[]
  goals: GoalRow[]
  /** 端点未配置而暂时读不到的敏感域 */
  unavailableDomains: Domain[]
}

/**
 * 看板数据：非敏感域走 rdb，敏感域走 listEvents；敏感端点缺失时降级并上报缺失域。
 */
export async function loadDashboardData(limit = 20): Promise<DashboardData> {
  const [events, goals] = await Promise.all([
    selectEventsByDomains(RDB_DOMAINS, limit),
    selectGoals(),
  ])

  const unavailableDomains: Domain[] = []
  const sensitiveEvents: EventRow[] = []

  if (isCloudFunctionConfigured()) {
    const results = await Promise.all(
      SENSITIVE_DOMAINS.map(async (domain) => listEventsRemote({ domain, limit })),
    )
    results.forEach((rows) => sensitiveEvents.push(...rows))
  } else {
    unavailableDomains.push(...SENSITIVE_DOMAINS)
  }

  const merged = [...events, ...sensitiveEvents]
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, limit)

  return { events: merged, goals, unavailableDomains }
}