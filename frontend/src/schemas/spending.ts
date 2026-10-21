/**
 * 力王「消费」轻量行为事件 —— 契约 §8 明确定义：
 *   analytics_events(name=`log_spending`, domain=`work`, payload={category, amount})
 * **不复活 consumption 域**（该域已按 product-definition §4 取消），也不写 events 表。
 */
import { z } from 'zod'

/** 契约 §8 category 枚举（rent 正比 / hedonic 反比 / for_others 正比） */
export const SPEND_CATEGORIES = ['rent', 'hedonic', 'for_others', 'other'] as const
export type SpendCategory = (typeof SPEND_CATEGORIES)[number]

export const SPEND_CATEGORY_LABELS: Readonly<Record<SpendCategory, string>> = {
  rent: '房租',
  hedonic: '享乐（奶茶/烧烤/小吃）',
  for_others: '花在别人身上',
  other: '其他',
}

export const spendingSchema = z.object({
  category: z.enum(SPEND_CATEGORIES),
  amount: z.number().finite().positive(),
})

export type SpendingInput = z.infer<typeof spendingSchema>