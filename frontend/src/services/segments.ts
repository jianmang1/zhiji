/**
 * 分群汇总（A8 的数据层）：按 channel / region / user_type 拆分 analytics_events。
 * 契约 §8 的分群维度；v1 为单用户，分群维度来自 profiles 回填与埋点字段。
 */
import type { AnalyticsEventRow, Domain } from '../types/contract'
import { DOMAINS } from '../types/contract'

export const SEGMENT_DIMENSIONS = ['channel', 'region', 'user_type'] as const
export type SegmentDimension = (typeof SEGMENT_DIMENSIONS)[number]

export const SEGMENT_DIMENSION_LABELS: Readonly<Record<SegmentDimension, string>> = {
  channel: '渠道',
  region: '地域',
  user_type: '用户类型',
}

/** 维度值缺失时的兜底分组名（不丢数据、也不臆造） */
export const UNKNOWN_SEGMENT = '(未标注)'

export interface SegmentSummary {
  value: string
  events: number
  acquire: number
  activate: number
  refer: number
  perKing: Record<Domain, number>
  /** 激活率 = activate / acquire（acquire=0 时为 0） */
  activationRate: number
}

function dimValue(row: AnalyticsEventRow, dimension: SegmentDimension): string {
  const raw = row[dimension]
  return typeof raw === 'string' && raw.length > 0 ? raw : UNKNOWN_SEGMENT
}

function emptyKingCounts(): Record<Domain, number> {
  return DOMAINS.reduce((acc, domain) => {
    acc[domain] = 0
    return acc
  }, {} as Record<Domain, number>)
}

/** 按维度聚合，按事件量倒序 */
export function summarizeSegments(
  rows: readonly AnalyticsEventRow[],
  dimension: SegmentDimension,
): SegmentSummary[] {
  const groups = new Map<string, SegmentSummary>()

  for (const row of rows) {
    const value = dimValue(row, dimension)
    let group = groups.get(value)
    if (!group) {
      group = {
        value,
        events: 0,
        acquire: 0,
        activate: 0,
        refer: 0,
        perKing: emptyKingCounts(),
        activationRate: 0,
      }
      groups.set(value, group)
    }
    group.events += 1
    if (row.step === 'product.acquire') group.acquire += 1
    if (row.step === 'product.activate') group.activate += 1
    if (row.step === 'product.refer') group.refer += 1
    if (row.domain) group.perKing[row.domain] += 1
  }

  const list = [...groups.values()]
  for (const group of list) {
    group.activationRate = group.acquire > 0 ? group.activate / group.acquire : 0
  }
  return list.sort((a, b) => b.events - a.events)
}

/** 某维度下可选的取值（供筛选器展示） */
export function segmentValues(
  rows: readonly AnalyticsEventRow[],
  dimension: SegmentDimension,
): string[] {
  const values = new Set<string>()
  for (const row of rows) values.add(dimValue(row, dimension))
  return [...values].sort()
}