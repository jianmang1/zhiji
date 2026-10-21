/**
 * getFunnel 云函数客户端（契约 §8 / docs/agents/codex-dispatch-getfunnel.md）。
 *
 * getFunnel 每次只聚合一个漏斗（默认 product，或按 domain 指定某一王），
 * 因此两层看板需要 4 次请求：产品级 + 三王。
 * 云函数用调用者 JWT 在 RLS 范围内聚合，结果不含他人数据。
 */
import { callHttpFunction } from './events'
import {
  adaptRemoteFunnel,
  KING_FUNNELS,
  PRODUCT_FUNNEL,
  type FunnelReport,
  type RemoteFunnelPayload,
  type Segment,
} from './funnel'
import type { Domain } from '../types/contract'

export interface FunnelRange {
  from: string
  to: string
}

export interface RemoteFunnelQuery {
  /** 省略 = product 级 */
  domain?: 'product' | Domain
  range: FunnelRange
  segment?: Segment
}

/** 单次调用：返回云端原始结构（未适配） */
export async function fetchRemoteFunnel(query: RemoteFunnelQuery): Promise<RemoteFunnelPayload> {
  const body: Record<string, unknown> = { range: query.range }
  if (query.domain && query.domain !== 'product') body.domain = query.domain

  if (query.segment) {
    const segment: Record<string, string> = {}
    if (query.segment.channel) segment.channel = query.segment.channel
    if (query.segment.region) segment.region = query.segment.region
    if (query.segment.user_type) segment.user_type = query.segment.user_type
    if (Object.keys(segment).length > 0) body.segment = segment
  }

  return await callHttpFunction<RemoteFunnelPayload>('getFunnel', body)
}

/** 两层漏斗：产品级 + 三王，适配成页面已有的 FunnelReport[]（页面零改动） */
export async function fetchRemoteFunnels(
  segment: Segment,
  range: FunnelRange,
): Promise<FunnelReport[]> {
  const [product, dating, health, work] = await Promise.all([
    fetchRemoteFunnel({ range, segment }),
    fetchRemoteFunnel({ domain: 'dating', range, segment }),
    fetchRemoteFunnel({ domain: 'health', range, segment }),
    fetchRemoteFunnel({ domain: 'work', range, segment }),
  ])

  return [
    adaptRemoteFunnel('product', '产品级 AARRR', product, PRODUCT_FUNNEL),
    adaptRemoteFunnel('dating', '黄毛王', dating, KING_FUNNELS.dating),
    adaptRemoteFunnel('health', '薄肌王', health, KING_FUNNELS.health),
    adaptRemoteFunnel('work', '力王', work, KING_FUNNELS.work),
  ]
}

/** 默认统计窗口：最近 N 天 */
export function funnelRange(days = 30, now: Date = new Date()): FunnelRange {
  return {
    from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
    to: now.toISOString(),
  }
}