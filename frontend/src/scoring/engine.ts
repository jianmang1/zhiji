/**
 * 评分引擎（模块 5）—— 纯函数、客户端计算、不调 LLM（产品定义 §5）。
 * 输入严格来自 events.payload（契约 §3），禁止自造字段。
 */
import type { Domain, EventRow, JsonObject } from '../types/contract'
import {
  DEFAULT_EXPECTED_MONTHLY_WAGE,
  SCORE_RULES,
  WEEK_MS,
  tierFor,
  type MetricKey,
  type MetricRule,
  type TierName,
} from './thresholds'

export interface ScoreOptions {
  /** 预期月薪（元），决定力王工资阈值 = 月薪/4 */
  expectedMonthlyWage?: number
  /** 窗口结束时间，默认当前时刻 */
  now?: Date
}

export interface ScoreBreakdownItem {
  metric: MetricKey
  label: string
  unit: string
  raw: number
  threshold: number
  weight: number
  reverse: boolean
  ratio: number
  points: number
  met: boolean
}

export interface ScoreResult {
  domain: Domain
  score: number
  tier: TierName
  breakdown: ScoreBreakdownItem[]
  /** 统计窗口 */
  windowStart: string
  windowEnd: string
  eventCount: number
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function payloadOf(event: EventRow): JsonObject {
  return event.payload
}

/** 按 type 汇总某个数值字段 */
function sumField(events: readonly EventRow[], type: string, field: string): number {
  return events.reduce((acc, event) => {
    if (event.type !== type) return acc
    return acc + num(payloadOf(event)[field])
  }, 0)
}

function maxField(events: readonly EventRow[], type: string, field: string): number {
  return events.reduce((acc, event) => {
    if (event.type !== type) return acc
    return Math.max(acc, num(payloadOf(event)[field]))
  }, 0)
}

/** domain → metric 的取值方式（严格对应契约 §3 字段名） */
function extract(domain: Domain, events: readonly EventRow[]): Record<MetricKey, number> {
  const metrics: Record<MetricKey, number> = {
    water_ml: 0,
    sleep_h: 0,
    workout_min: 0,
    work_hours: 0,
    wage: 0,
    commute_min: 0,
    approach_count: 0,
    date_count: 0,
    chat_min: 0,
    stage: 0,
  }

  if (domain === 'health') {
    metrics.water_ml = sumField(events, 'water', 'ml')
    metrics.sleep_h = sumField(events, 'sleep', 'duration_h')
    metrics.workout_min = sumField(events, 'workout', 'duration_min')
  } else if (domain === 'work') {
    metrics.work_hours = sumField(events, 'work_log', 'hours')
    metrics.wage = sumField(events, 'work_log', 'wage')
    metrics.commute_min = sumField(events, 'work_log', 'commute_min')
  } else {
    metrics.approach_count = sumField(events, 'approach', 'count')
    metrics.date_count = sumField(events, 'date', 'count')
    metrics.chat_min = sumField(events, 'chat', 'duration_min')
    metrics.stage = maxField(events, 'stage', 'stage')
  }

  return metrics
}

function ratioFor(raw: number, rule: MetricRule): number {
  if (rule.threshold <= 0) return 0
  if (rule.reverse) {
    // 实际 ≤ 阈值 → 1；超出后按 (2 - actual/threshold) 线性递减到 0
    return Math.min(1, Math.max(0, 2 - raw / rule.threshold))
  }
  return Math.min(1, Math.max(0, raw / rule.threshold))
}

/** 计算某王在窗口内的评分（0–100）与段位 */
export function scoreDomain(domain: Domain, events: readonly EventRow[], options: ScoreOptions = {}): ScoreResult {
  const now = options.now ?? new Date()
  const windowEnd = now.getTime()
  const windowStart = windowEnd - WEEK_MS
  const expectedMonthlyWage = options.expectedMonthlyWage ?? DEFAULT_EXPECTED_MONTHLY_WAGE

  const inWindow = events.filter((event) => {
    if (event.domain !== domain) return false
    const ts = new Date(event.ts).getTime()
    return Number.isFinite(ts) && ts > windowStart && ts <= windowEnd
  })

  const metrics = extract(domain, inWindow)
  const breakdown: ScoreBreakdownItem[] = []
  let total = 0

  for (const rule of SCORE_RULES[domain]) {
    const threshold =
      rule.metric === 'wage' ? expectedMonthlyWage / 4 : rule.threshold
    const raw = metrics[rule.metric]
    const ratio = ratioFor(raw, { ...rule, threshold })
    const points = ratio * rule.weight * 100
    total += points
    breakdown.push({
      metric: rule.metric,
      label: rule.label,
      unit: rule.unit,
      raw,
      threshold,
      weight: rule.weight,
      reverse: rule.reverse === true,
      ratio,
      points,
      met: rule.reverse ? raw <= threshold && raw > 0 : raw >= threshold,
    })
  }

  const score = Math.round(Math.min(100, Math.max(0, total)))

  return {
    domain,
    score,
    tier: tierFor(score),
    breakdown,
    windowStart: new Date(windowStart).toISOString(),
    windowEnd: new Date(windowEnd).toISOString(),
    eventCount: inWindow.length,
  }
}

/** 三王一起算（看板用） */
export function scoreAll(
  events: readonly EventRow[],
  domains: readonly Domain[],
  options: ScoreOptions = {},
): ScoreResult[] {
  return domains.map((domain) => scoreDomain(domain, events, options))
}