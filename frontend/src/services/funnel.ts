/**
 * 两层漏斗本地计算（模块 7 的数据层）。
 *
 * 契约 §8 / 产品定义 §15：v1 由前端拉 analytics_events 本地算基础漏斗；
 * getFunnel 云函数属 Phase 3，未标「已实现」前不接。
 */
import type { AnalyticsEventRow, Domain, EventRow, FunnelStep } from '../types/contract'

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
  // 产品级漏斗改名「王败寇」（ADR-007）：社交证明向，展示"多少人在记录"
  'product.acquire': '陌生人',
  'product.activate': '好奇猫',
  'product.retain': '留存',
  'product.habit': '落魄谷',
  'product.value': '少年归',
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
  /** ADR-007：阈值型层是否已达成（如"记录天数 > 3"）。仅王败寇/行为漏斗的语义层使用 */
  achieved?: boolean
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

/**
 * 王败寇（原产品级 AARRR 改名 · ADR-007）：社交证明向，五层阶梯。
 * 基于该用户自己的 analytics_events 派生：
 *   L1 陌生人 = 进站/首触（product.acquire 次数）
 *   L2 好奇猫 = 激活（product.activate 次数）
 *   L3 留存   = 记录数据天数 > 3
 *   L4 落魄谷 = 记录数据天数 > 10
 *   L5 少年归 = 漏斗到达底部次数（complete_checkin） > 10
 * 阈值达成写进 `achieved`，由页面显示"达成"徽章。保留转化/drop-off 可视化。
 */
export const WANG_BAI_KOU_STEPS: readonly FunnelStep[] = [
  'product.acquire',
  'product.activate',
  'product.retain',
  'product.habit',
  'product.value',
]

function distinctActiveDays(events: readonly AnalyticsEventRow[]): number {
  const days = new Set<string>()
  for (const event of events) {
    days.add(event.ts.slice(0, 10)) // UTC 日期 YYYY-MM-DD
  }
  return days.size
}

export function buildWangBaiKouFunnel(events: readonly AnalyticsEventRow[]): FunnelReport {
  const opens = events.filter((e) => e.step === 'product.acquire').length
  const activations = events.filter((e) => e.step === 'product.activate').length
  const activeDays = distinctActiveDays(events)
  const completeCheckins = events.filter((e) => e.name === 'complete_checkin').length

  const counts = new Map<FunnelStep, number>([
    ['product.acquire', opens],
    ['product.activate', activations],
    ['product.retain', activeDays],
    ['product.habit', activeDays],
    ['product.value', completeCheckins],
  ])

  const report = computeFunnel('product', '王败寇', WANG_BAI_KOU_STEPS, counts)
  const achievedMap: Record<string, boolean> = {
    'product.acquire': opens > 0,
    'product.activate': activations > 0,
    'product.retain': activeDays > 3,
    'product.habit': activeDays > 10,
    'product.value': completeCheckins > 10,
  }
  for (const step of report.steps) {
    step.achieved = achievedMap[step.step] ?? false
  }
  return report
}

/**
 * 薄肌王漏斗（ADR-007 Task2）：基于真实打卡 `events`（domain=health）的四层，长期累积。
 *   L1 喝大水和睡大觉 = water + sleep 出现的天数
 *   L2 运动          = workout 出现的天数
 *   L3 压抑指标      = suppression 出现的天数（越低越好）
 *   L4 体感（最终层） = body_sense 出现的天数（feel_score 1–10）
 * 各层"坚持天数"自然呈漏斗形，并标 `achieved`（该层是否记录过）。
 */
const HEALTH_KING_LAYERS = [
  { key: 'water_sleep', label: '喝大水和睡大觉' },
  { key: 'workout', label: '运动' },
  { key: 'suppression', label: '压抑指标' },
  { key: 'body_sense', label: '体感' },
] as const

function daysWithType(events: readonly EventRow[], types: readonly string[]): number {
  const days = new Set<string>()
  for (const event of events) {
    if (types.includes(event.type)) days.add(event.ts.slice(0, 10))
  }
  return days.size
}

export function buildHealthKingFunnel(events: readonly EventRow[]): FunnelReport {
  const counts = [
    daysWithType(events, ['water', 'sleep']),
    daysWithType(events, ['workout']),
    daysWithType(events, ['suppression']),
    daysWithType(events, ['body_sense']),
  ]

  let bottleneck: FunnelStep | null = null
  let worst = -1
  const steps = HEALTH_KING_LAYERS.map((layer, index) => {
    const count = counts[index] as number
    const prev = index === 0 ? count : (counts[index - 1] as number)
    const conversionFromPrev = index === 0 ? (count > 0 ? 1 : 0) : prev > 0 ? count / prev : 0
    const dropOffPct = index === 0 ? 0 : prev > 0 ? Math.max(0, (1 - count / prev) * 100) : 0
    if (dropOffPct > worst) {
      worst = dropOffPct
      bottleneck = layer.key as FunnelStep
    }
    return {
      step: layer.key as FunnelStep,
      label: layer.label,
      count,
      conversionFromPrev,
      dropOffPct,
      achieved: count > 0,
    }
  })

  const first = counts[0] ?? 0
  const last = counts[counts.length - 1] ?? 0
  return {
    key: 'health',
    title: '薄肌王',
    steps,
    bottleneck,
    overallConversion: first > 0 && last > 0 ? last / first : 0,
  }
}

/** 生成两层漏斗：王败寇（产品级改名）+ 三王 */
export function buildFunnelReports(
  events: readonly AnalyticsEventRow[],
  segment: Segment = {},
  healthEvents?: readonly EventRow[],
): FunnelReport[] {
  const filtered = filterBySegment(events, segment)
  const counts = countByStep(filtered)
  const healthReport =
    healthEvents && healthEvents.length > 0
      ? buildHealthKingFunnel(healthEvents)
      : computeFunnel('health', '薄肌王', KING_FUNNELS.health, counts)
  return [
    buildWangBaiKouFunnel(filtered),
    computeFunnel('dating', '黄毛王', KING_FUNNELS.dating, counts),
    healthReport,
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
/* ─────────────────── getFunnel 云函数接入（契约 §8，A2） ─────────────────── */

/** getFunnel 返回的单步（签名见 docs/agents/codex-dispatch-getfunnel.md） */
export interface RemoteFunnelStep {
  step: FunnelStep
  count: number
  conv_rate: number
  drop_off: number
}

export interface RemoteFunnelPayload {
  steps: RemoteFunnelStep[]
  bottleneck_step: FunnelStep | null
  segment?: Record<string, string | null>
}

/**
 * `conv_rate` / `drop_off` 的单位契约未冻结（比例 0–1 或百分数 0–100 都可能）。
 * 这里按数值大小归一：绝对值 ≤1 视为比例，>1 视为百分数。
 * 已作为口径待确认项记入 docs/heartbeat-log.md。
 */
export function toPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.abs(value) <= 1 ? value * 100 : value
}

/**
 * 把 getFunnel 的响应适配成页面已在用的 FunnelReport（页面零改动）。
 * 以契约 §8 的步骤顺序为准，缺失步补 0；bottleneck 优先取云端结论。
 */
export function adaptRemoteFunnel(
  key: 'product' | Domain,
  title: string,
  remote: RemoteFunnelPayload,
  orderedSteps: readonly FunnelStep[],
): FunnelReport {
  const byStep = new Map<FunnelStep, RemoteFunnelStep>()
  if (Array.isArray(remote.steps)) {
    for (const item of remote.steps) {
      if (item && typeof item.step === 'string') byStep.set(item.step, item)
    }
  }

  const steps: FunnelStepStat[] = orderedSteps.map((step) => {
    const item = byStep.get(step)
    const count = item ? item.count : 0
    return {
      step,
      label: STEP_LABELS[step],
      count,
      conversionFromPrev: item ? toPercent(item.conv_rate) / 100 : 0,
      dropOffPct: item ? toPercent(item.drop_off) : 0,
    }
  })

  let bottleneck: FunnelStep | null = remote.bottleneck_step ?? null
  if (!bottleneck) {
    let worst = -1
    for (let i = 1; i < steps.length; i += 1) {
      const stat = steps[i]
      if (stat && stat.dropOffPct > worst) {
        worst = stat.dropOffPct
        bottleneck = stat.step
      }
    }
  }

  const first = steps[0] ? steps[0].count : 0
  const last = steps.length > 0 ? steps[steps.length - 1] : undefined
  return {
    key,
    title,
    steps,
    bottleneck,
    overallConversion: first > 0 && last ? last.count / first : 0,
  }
}