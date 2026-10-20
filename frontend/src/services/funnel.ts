/**
 * 两层漏斗本地计算（模块 7 的数据层）。
 *
 * 契约 §8 / 产品定义 §15：v1 由前端拉 analytics_events 本地算基础漏斗；
 * getFunnel 云函数属 Phase 3，未标「已实现」前不接。
 */
import type { AnalyticsEventRow, Domain, FunnelStep } from '../types/contract'

/** 产品级 AARRR（§15.1 ①）；product.reactive 为召回环，单独展示不计入主漏斗 */
export const PRODUCT_FUNNEL: readonly FunnelStep[] = [
  'product.acquire',
  'product.activate',
  'product.retain',
  'product.habit',
  'product.value',
  'product.refer',
]

/** 各王行为漏斗（§15.1 ② / §15.3 v1 步骤） */
export const KING_FUNNELS: Readonly<Record<Domain, readonly FunnelStep[]>> = {
  dating: [
    'dating.onboard',
    'dating.approach',
    'dating.response',
    'dating.date',
    'dating.stage_up',
    'dating.stage5',
    'dating.refer',
  ],
  health: [
    'health.onboard',
    'health.water',
    'health.sleep',
    'health.workout',
    'health.active_day',
    'health.body_sense',
    'health.refer',
  ],
  work: ['work.onboard', 'work.wage', 'work.spend', 'work.retain', 'work.refer'],
}

export const STEP_LABELS: Readonly<Record<FunnelStep, string>> = {
  'product.acquire': '获取',
  'product.activate': '激活',
  'product.retain': '留存',
  'product.habit': '习惯',
  'product.value': '价值',
  'product.refer': '推荐',
  'product.reactive': '召回/复活',
  'dating.onboard': '启动',
  'dating.approach': '首触',
  'dating.response': '破冰',
  'dating.date': '约见',
  'dating.stage_up': '进阶',
  'dating.stage5': '脱单',
  'dating.refer': '推荐',
  'health.onboard': '启动',
  'health.water': '饮水',
  'health.sleep': '睡眠',
  'health.workout': '运动',
  'health.active_day': '综合打卡',
  'health.body_sense': '体感/围度',
  'health.refer': '推荐',
  'work.onboard': '启动',
  'work.wage': '收入',
  'work.spend': '支出',
  'work.retain': '留存',
  'work.refer': '推荐',
}

export interface FunnelStepStat {
  step: FunnelStep
  label: string
  count: number
  /** 相对上一步的转化率（0–1；首步为 1） */
  conversionFromPrev: number
  /** 单步流失率 % */
  dropOffPct: number
}

export interface FunnelReport {
  key: 'product' | Domain
  title: string
  steps: FunnelStepStat[]
  /** 瓶颈步 = drop-off 最大的一步（首步除外） */
  bottleneck: FunnelStep | null
  /** 末步 / 首步 */
  overallConversion: number
}

function countByStep(events: readonly AnalyticsEventRow[]): Map<FunnelStep, number> {
  const counts = new Map<FunnelStep, number>()
  for (const event of events) {
    if (!event.step) continue
    counts.set(event.step, (counts.get(event.step) ?? 0) + 1)
  }
  return counts
}

export function computeFunnel(
  key: 'product' | Domain,
  title: string,
  steps: readonly FunnelStep[],
  counts: ReadonlyMap<FunnelStep, number>,
): FunnelReport {
  const stats: FunnelStepStat[] = steps.map((step, index) => {
    const count = counts.get(step) ?? 0
    const prev = index === 0 ? count : counts.get(steps[index - 1] as FunnelStep) ?? 0
    const conversionFromPrev = index === 0 ? (count > 0 ? 1 : 0) : prev > 0 ? count / prev : 0
    const dropOffPct = index === 0 ? 0 : prev > 0 ? Math.max(0, (1 - count / prev) * 100) : 0
    return {
      step,
      label: STEP_LABELS[step],
      count,
      conversionFromPrev,
      dropOffPct,
    }
  })

  let bottleneck: FunnelStep | null = null
  let worst = -1
  for (let i = 1; i < stats.length; i += 1) {
    const stat = stats[i] as FunnelStepStat
    if (stat.dropOffPct > worst) {
      worst = stat.dropOffPct
      bottleneck = stat.step
    }
  }

  const first = stats[0]?.count ?? 0
  const last = stats[stats.length - 1]?.count ?? 0
  return {
    key,
    title,
    steps: stats,
    bottleneck,
    overallConversion: first > 0 ? last / first : 0,
  }
}

export interface Segment {
  channel?: string
  region?: string
  user_type?: string
}

/** 按分群维度过滤埋点（契约 §8 的 channel/region/user_type） */
export function filterBySegment(
  events: readonly AnalyticsEventRow[],
  segment: Segment,
): AnalyticsEventRow[] {
  return events.filter((event) => {
    if (segment.channel && event.channel !== segment.channel) return false
    if (segment.region && event.region !== segment.region) return false
    if (segment.user_type && event.user_type !== segment.user_type) return false
    return true
  })
}

/** 生成两层漏斗：产品级 + 三王 */
export function buildFunnelReports(
  events: readonly AnalyticsEventRow[],
  segment: Segment = {},
): FunnelReport[] {
  const filtered = filterBySegment(events, segment)
  const counts = countByStep(filtered)
  return [
    computeFunnel('product', '产品级 AARRR', PRODUCT_FUNNEL, counts),
    computeFunnel('dating', '黄毛王', KING_FUNNELS.dating, counts),
    computeFunnel('health', '薄肌王', KING_FUNNELS.health, counts),
    computeFunnel('work', '力王', KING_FUNNELS.work, counts),
  ]
}

/** 召回环：product.reactive 单步计数（单独展示） */
export function reactiveCount(events: readonly AnalyticsEventRow[]): number {
  return events.filter((event) => event.step === 'product.reactive').length
}

/** 各分群可选值（页面筛选器用） */
export function segmentOptions(events: readonly AnalyticsEventRow[]): {
  channels: string[]
  regions: string[]
  userTypes: string[]
} {
  const channels = new Set<string>()
  const regions = new Set<string>()
  const userTypes = new Set<string>()
  for (const event of events) {
    if (event.channel) channels.add(event.channel)
    if (event.region) regions.add(event.region)
    if (event.user_type) userTypes.add(event.user_type)
  }
  return {
    channels: [...channels].sort(),
    regions: [...regions].sort(),
    userTypes: [...userTypes].sort(),
  }
}