import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlanView } from '../src/services/plans'

const h = vi.hoisted(() => ({
  generatePlanRemote: vi.fn(),
  selectPlans: vi.fn(),
}))

// planStore -> services/plans -> services/events 会 import Taro 运行时；测试里用轻量 mock 顶替
vi.mock('@tarojs/taro', () => ({ default: { request: vi.fn() } }))

vi.mock('../src/services/plans', () => ({
  generatePlanRemote: h.generatePlanRemote,
  selectPlans: h.selectPlans,
  toPlanViews: (rows: unknown[]) => rows as PlanView[],
}))

const { usePlanStore } = await import('../src/stores/planStore')

const VIEW: PlanView = {
  row: {
    id: 'p1', user_id: 'u1', title: '本周方案', generated_by: 'hy3',
    based_on: {}, content: {}, created_at: '2026-10-21T00:00:00.000Z',
  },
  content: null,
}

describe('planStore', () => {
  beforeEach(() => {
    h.generatePlanRemote.mockReset()
    h.selectPlans.mockReset()
    usePlanStore.setState({ plans: [], loading: false, generating: false, error: null, lastGeneratedId: null })
  })

  it('load 读取方案列表', async () => {
    h.selectPlans.mockResolvedValue([VIEW])
    await usePlanStore.getState().load()
    expect(usePlanStore.getState().plans).toHaveLength(1)
    expect(usePlanStore.getState().error).toBeNull()
  })

  it('load 失败写入 error 而不是抛出', async () => {
    h.selectPlans.mockRejectedValue(new Error('rls denied'))
    await usePlanStore.getState().load()
    expect(usePlanStore.getState().error).toBe('rls denied')
    expect(usePlanStore.getState().loading).toBe(false)
  })

  it('generate 成功后记录 id 并刷新列表', async () => {
    h.generatePlanRemote.mockResolvedValue(7)
    h.selectPlans.mockResolvedValue([VIEW])

    const ok = await usePlanStore.getState().generate('work')

    expect(ok).toBe(true)
    expect(usePlanStore.getState().lastGeneratedId).toBe(7)
    expect(usePlanStore.getState().plans).toHaveLength(1)
    expect(h.generatePlanRemote).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'work' }),
    )
  })

  it('generate 失败（AI 未开通等）给出可读提示且不刷新', async () => {
    h.generatePlanRemote.mockRejectedValue(new Error('AI 能力未开通'))

    const ok = await usePlanStore.getState().generate('dating')

    expect(ok).toBe(false)
    expect(usePlanStore.getState().error).toContain('AI 能力未开通')
    expect(usePlanStore.getState().generating).toBe(false)
    expect(h.selectPlans).not.toHaveBeenCalled()
  })
})