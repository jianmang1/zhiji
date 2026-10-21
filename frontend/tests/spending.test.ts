import { describe, expect, it } from 'vitest'
import { SPEND_CATEGORIES, spendingSchema } from '../src/schemas/spending'
import { plansForSpending } from '../src/services/tracking'

describe('力王支出（契约 §8 log_spending）', () => {
  it('category 枚举严格等于契约四类', () => {
    expect([...SPEND_CATEGORIES]).toEqual(['rent', 'hedonic', 'for_others', 'other'])
  })

  it('接受合法输入', () => {
    expect(spendingSchema.safeParse({ category: 'rent', amount: 3000 }).success).toBe(true)
  })

  it('拒绝非法 category 与非正金额', () => {
    expect(spendingSchema.safeParse({ category: 'food', amount: 10 }).success).toBe(false)
    expect(spendingSchema.safeParse({ category: 'hedonic', amount: 0 }).success).toBe(false)
    expect(spendingSchema.safeParse({ category: 'hedonic', amount: -5 }).success).toBe(false)
  })

  it('映射为 name=log_spending / step=work.spend / domain=work（不写 events 表）', () => {
    const plans = plansForSpending({ category: 'hedonic', amount: 28 })
    expect(plans).toHaveLength(1)
    expect(plans[0]?.name).toBe('log_spending')
    expect(plans[0]?.step).toBe('work.spend')
    expect(plans[0]?.domain).toBe('work')
    expect(plans[0]?.payload).toEqual({ category: 'hedonic', amount: 28 })
  })
})