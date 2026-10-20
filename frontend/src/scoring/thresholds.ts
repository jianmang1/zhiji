/**
 * 评分阈值与段位 —— 镜像 docs/product-definition.md §5.1（已冻结）/ §5.2（已冻结）。
 *
 * 公式（产品定义 §5）：单项得分 = min(实际 / 满分阈值, 1) × 权重 × 100，加总即周评分。
 * 反向指标（通勤）：实际 ≤ 阈值给满分，超出后按比例递减到 0（= max(0, 2 - 实际/阈值)）。
 */
import type { Domain } from '../types/contract'

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export type MetricKey =
  | 'water_ml'
  | 'sleep_h'
  | 'workout_min'
  | 'work_hours'
  | 'wage'
  | 'commute_min'
  | 'approach_count'
  | 'date_count'
  | 'chat_min'
  | 'stage'

export interface MetricRule {
  metric: MetricKey
  label: string
  unit: string
  /** 满分阈值（周）；wage 由预期月薪动态推导 */
  threshold: number
  weight: number
  /** 越低越优（通勤） */
  reverse?: boolean
  /** 聚合方式：求和 / 取最大（脱单进度取当前最高阶段） */
  aggregate: 'sum' | 'max'
}

/**
 * 力王工资阈值 = 预期月薪 / 4（产品定义 §5.1「≥预期薪资/4」）。
 * PO 尚未给出个人预期薪资 → 用可配置常量占位，`scoreDomain` 可传入覆盖。
 */
export const DEFAULT_EXPECTED_MONTHLY_WAGE = 20000

/** 契约 §5.1 冻结阈值（工资项由 options 注入，此处用默认值占位） */
export const SCORE_RULES: Readonly<Record<Domain, readonly MetricRule[]>> = {
  health: [
    { metric: 'water_ml', label: '饮水', unit: 'ml', threshold: 2000, weight: 0.3, aggregate: 'sum' },
    { metric: 'sleep_h', label: '睡眠', unit: 'h', threshold: 49, weight: 0.3, aggregate: 'sum' },
    { metric: 'workout_min', label: '训练', unit: 'min', threshold: 210, weight: 0.4, aggregate: 'sum' },
  ],
  work: [
    { metric: 'work_hours', label: '工作时长', unit: 'h', threshold: 40, weight: 0.35, aggregate: 'sum' },
    { metric: 'wage', label: '收入', unit: '元', threshold: DEFAULT_EXPECTED_MONTHLY_WAGE / 4, weight: 0.35, aggregate: 'sum' },
    { metric: 'commute_min', label: '通勤', unit: 'min', threshold: 350, weight: 0.3, aggregate: 'sum', reverse: true },
  ],
  dating: [
    { metric: 'approach_count', label: '主动搭讪', unit: '次', threshold: 8, weight: 0.25, aggregate: 'sum' },
    { metric: 'date_count', label: '约会', unit: '次', threshold: 4, weight: 0.25, aggregate: 'sum' },
    { metric: 'chat_min', label: '聊天', unit: 'min', threshold: 300, weight: 0.2, aggregate: 'sum' },
    { metric: 'stage', label: '脱单进度', unit: '阶', threshold: 5, weight: 0.3, aggregate: 'max' },
  ],
}

/** 产品定义 §5.2 冻结段位（LOL 梗风） */
export const TIERS = [
  { min: 90, name: '最强王者' },
  { min: 70, name: '荣耀黄金' },
  { min: 40, name: '秩序白银' },
  { min: 0, name: '倔强青铜' },
] as const

export type TierName = (typeof TIERS)[number]['name']

export function tierFor(score: number): TierName {
  const clamped = Math.min(100, Math.max(0, score))
  for (const tier of TIERS) {
    if (clamped >= tier.min) return tier.name
  }
  return '倔强青铜'
}