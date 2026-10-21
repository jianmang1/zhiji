/**
 * 行动方案状态：生成（generatePlan 云函数，契约已标「已实现」）+ 读取（rdb.plans）。
 */
import { create } from 'zustand'
import { generatePlanRemote, selectPlans, toPlanViews, type PlanView } from '../services/plans'
import { funnelRange } from '../services/funnelApi'
import type { BigIntId, Domain } from '../types/contract'
import { toMessage } from '../utils/error'

export interface PlanState {
  plans: PlanView[]
  loading: boolean
  generating: boolean
  error: string | null
  lastGeneratedId: BigIntId | null
  load: (limit?: number) => Promise<void>
  generate: (domain: Domain) => Promise<boolean>
  reset: () => void
}

export const usePlanStore = create<PlanState>((set, get) => ({
  plans: [],
  loading: false,
  generating: false,
  error: null,
  lastGeneratedId: null,

  async load(limit = 20) {
    set({ loading: true })
    try {
      const rows = await selectPlans(limit)
      set({ plans: toPlanViews(rows), loading: false })
    } catch (error) {
      set({ loading: false, error: toMessage(error, '加载方案失败') })
    }
  },

  async generate(domain) {
    set({ generating: true, error: null })
    try {
      // based_on 只允许 domain / range（后端 GeneratePlanInput 校验 extra=forbid）
      const id = await generatePlanRemote({ domain, range: funnelRange(7) })
      set({ lastGeneratedId: id, generating: false })
      await get().load()
      return true
    } catch (error) {
      set({ generating: false, error: toMessage(error, '生成方案失败（可能 AI 能力未开通）') })
      return false
    }
  },

  reset() {
    set({ plans: [], loading: false, generating: false, error: null, lastGeneratedId: null })
  },
}))