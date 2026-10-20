import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventRow } from '../src/types/contract'

const h = vi.hoisted(() => ({
  createEvent: vi.fn(),
  loadDashboardData: vi.fn(),
  trackPlans: vi.fn(),
  userId: 'u-1' as string | null,
}))

vi.mock('../src/services/events', () => ({
  createEvent: h.createEvent,
  loadDashboardData: h.loadDashboardData,
}))
vi.mock('../src/stores/authStore', () => ({
  useAuthStore: { getState: () => ({ userId: h.userId }) },
}))
vi.mock('../src/stores/analyticsStore', () => ({
  useAnalyticsStore: { getState: () => ({ trackPlans: h.trackPlans }) },
}))

const { useEventStore } = await import('../src/stores/eventStore')

const VALID = {
  domain: 'health',
  type: 'sleep',
  ts: '2026-10-20T08:00:00.000Z',
  payload: { duration_h: 7, quality: 'good' },
  source: 'manual',
}

function existing(domain: EventRow['domain'], type: string, payload: Record<string, unknown>, ts: string): EventRow {
  return { id: 1, user_id: 'u-1', domain, type, ts, payload: payload as EventRow['payload'], source: 'manual', created_at: ts }
}

describe('eventStore.submit', () => {
  beforeEach(() => {
    h.createEvent.mockReset()
    h.trackPlans.mockReset()
    h.userId = 'u-1'
    useEventStore.setState({ events: [], lastCreatedId: null, error: null })
  })

  it('校验失败时直接返回字段错误，不发起写入', async () => {
    const result = await useEventStore.getState().submit('health', 'sleep', {
      ...VALID,
      payload: { duration_h: 'x', quality: 'good' },
    })
    expect(result.ok).toBe(false)
    expect(h.createEvent).not.toHaveBeenCalled()
  })

  it('未登录时返回 root 错误', async () => {
    h.userId = null
    const result = await useEventStore.getState().submit('health', 'sleep', VALID)
    expect(result).toEqual({ ok: false, errors: { root: '未登录，无法写入数据' } })
  })

  it('写入成功后顺带发打卡埋点（首次 → onboard）', async () => {
    h.createEvent.mockResolvedValue({ id: 5, via: 'recordEvent' })

    const result = await useEventStore.getState().submit('health', 'sleep', VALID)

    expect(result).toEqual({ ok: true, id: 5, via: 'recordEvent' })
    const plans = h.trackPlans.mock.calls[0]?.[0] as { step: string | null }[]
    expect(plans.map((p) => p.step)).toEqual(['health.onboard', 'health.sleep'])
  })

  it('已有同域事件时不再记 onboard，三件套齐则派生综合打卡', async () => {
    h.createEvent.mockResolvedValue({ id: 6, via: 'rdb' })
    const today = new Date()
    const todayIso = today.toISOString()
    useEventStore.setState({
      events: [
        existing('health', 'water', { ml: 500 }, todayIso),
        existing('health', 'sleep', { duration_h: 7, quality: 'good' }, todayIso),
      ],
    })

    await useEventStore.getState().submit('health', 'workout', {
      ...VALID,
      type: 'workout',
      payload: { type: 'run', duration_min: 30, calorie: 200 },
    })

    const plans = h.trackPlans.mock.calls[0]?.[0] as { step: string | null }[]
    expect(plans.map((p) => p.step)).toEqual(['health.workout', 'health.active_day'])
  })

  it('写入失败时把错误转成 root 提示，且不发埋点', async () => {
    h.createEvent.mockRejectedValue(new Error('云函数不可用'))
    const result = await useEventStore.getState().submit('health', 'sleep', VALID)
    expect(result).toEqual({ ok: false, errors: { root: '云函数不可用' } })
    expect(h.trackPlans).not.toHaveBeenCalled()
  })
})