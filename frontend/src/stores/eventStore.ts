/**
 * 事件集合状态：提交（Zod 校验 → 敏感域路由 → 顺带埋点）与看板数据加载。
 */
import { create } from 'zustand'
import { createEvent, loadDashboardData, type EventVia } from '../services/events'
import { plansForCheckin } from '../services/tracking'
import { parseEventDraft } from '../schemas/event'
import type { BigIntId, Domain, EventRow, GoalRow } from '../types/contract'
import { toMessage } from '../utils/error'
import { useAuthStore } from './authStore'
import { useAnalyticsStore } from './analyticsStore'

export type SubmitResult =
  | { ok: true; id: BigIntId; via: EventVia }
  | { ok: false; errors: Record<string, string> }

export interface EventState {
  events: EventRow[]
  goals: GoalRow[]
  unavailableDomains: Domain[]
  loading: boolean
  error: string | null
  lastCreatedId: BigIntId | null
  submit: (
    domain: Domain,
    type: string,
    draft: unknown,
    meta?: { entryDurationMs?: number },
  ) => Promise<SubmitResult>
  refresh: (limit?: number) => Promise<void>
  reset: () => void
}

function isToday(ts: string, now: Date = new Date()): boolean {
  const date = new Date(ts)
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

function healthKindsToday(events: readonly EventRow[], current: string): string[] {
  const kinds = new Set<string>([current])
  for (const event of events) {
    if (event.domain === 'health' && isToday(event.ts)) kinds.add(event.type)
  }
  return [...kinds]
}

function previousStage(events: readonly EventRow[]): number | undefined {
  let stage: number | undefined
  for (const event of events) {
    if (event.domain !== 'dating' || event.type !== 'stage') continue
    const value = event.payload.stage
    if (typeof value === 'number') {
      stage = stage === undefined ? value : Math.max(stage, value)
    }
  }
  return stage
}

export const useEventStore = create<EventState>((set, get) => ({
  events: [],
  goals: [],
  unavailableDomains: [],
  loading: false,
  error: null,
  lastCreatedId: null,

  async submit(domain, type, draft, meta) {
    // 1) 客户端校验（Zod 镜像契约，见 schemas/event.ts）
    const parsed = parseEventDraft(domain, type, draft)
    if (!parsed.ok) {
      return { ok: false, errors: parsed.errors }
    }

    const userId = useAuthStore.getState().userId
    if (!userId) {
      return { ok: false, errors: { root: '未登录，无法写入数据' } }
    }

    // 2) 按契约 §5 路由：health/dating → recordEvent 云函数；work → cloud.rdb()
    try {
      const result = await createEvent(parsed.value, userId)
      set({ lastCreatedId: result.id, error: null })

      // 3) 埋点零额外摩擦：打卡成功后顺带发聚合步（契约 §8，失败不影响主流程）
      const state = get()
      const plans = plansForCheckin(domain, parsed.value.type, parsed.value.payload, {
        isFirstCheckin: !state.events.some((event) => event.domain === domain),
        healthKindsToday: healthKindsToday(state.events, parsed.value.type),
        previousStage: previousStage(state.events),
      })
      const entryMs = meta?.entryDurationMs
      const tracked =
        typeof entryMs === 'number' && Number.isFinite(entryMs) && entryMs >= 0
          ? plans.map((plan) => ({
              ...plan,
              payload: { ...(plan.payload ?? {}), entry_ms: Math.round(entryMs) },
            }))
          : plans
      void useAnalyticsStore.getState().trackPlans(tracked)

      return { ok: true, id: result.id, via: result.via }
    } catch (error) {
      return { ok: false, errors: { root: toMessage(error, '写入失败') } }
    }
  },

  async refresh(limit = 200) {
    set({ loading: true, error: null })
    try {
      const data = await loadDashboardData(limit)
      set({
        events: data.events,
        goals: data.goals,
        unavailableDomains: data.unavailableDomains,
        loading: false,
      })
    } catch (error) {
      set({ loading: false, error: toMessage(error, '加载数据失败') })
    }
  },

  reset() {
    set({
      events: [],
      goals: [],
      unavailableDomains: [],
      loading: false,
      error: null,
      lastCreatedId: null,
    })
  },
}))