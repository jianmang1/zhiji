/**
 * plans.content 校验 —— 镜像 cloudbase-contract.md §5.1「generatePlan 统一输出 schema」。
 * LLM 只写 summary / actions / next_milestone；score / tier 由规则引擎算好传入。
 */
import { z } from 'zod'
import { DOMAINS } from '../types/contract'
import { TIERS } from '../scoring/thresholds'

export const planActionSchema = z.object({
  title: z.string().min(1),
  why: z.string().min(1),
  effort: z.enum(['low', 'mid', 'high']),
})

export const planContentSchema = z.object({
  domain: z.enum(DOMAINS),
  score: z.number().min(0).max(100),
  tier: z.enum(TIERS.map((t) => t.name) as [string, ...string[]]),
  summary: z.string().min(1),
  actions: z.array(planActionSchema).min(1),
  next_milestone: z.string().min(1),
})

export type PlanAction = z.infer<typeof planActionSchema>
export type PlanContent = z.infer<typeof planContentSchema>

/** 宽松解析：内容不符合 §5.1 时返回 null（页面显示"格式异常"而不是崩溃） */
export function parsePlanContent(raw: unknown): PlanContent | null {
  const result = planContentSchema.safeParse(raw)
  return result.success ? result.data : null
}