import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalyticsEventRow, EventRow, GoalRow } from '../src/types/contract'

const h = vi.hoisted(() => ({
  loadDashboardData: vi.fn(),
  selectAnalyticsEvents: vi.fn(),
  insertAnalyticsEvent: vi.fn(),
  selectProfile: vi.fn(),
  upsertProfile: vi.fn(),
}))

vi.mock('../src/services/events', () => ({ loadDashboardData: h.loadDashboardData }))
vi.mock('../src/services/rdb', () => ({
  selectAnalyticsEvents: h.selectAnalyticsEvents,
  insertAnalyticsEvent: h.insertAnalyticsEvent,
  selectProfile: h.selectProfile,
  upsertProfile: h.upsertProfile,
}))
vi.mock('../src/stores/authStore', () => ({
  useAuthStore: { getState: () => ({ userId: 'u-1' }) },
}))

const { useAnalyticsStore } = await import('../src/stores/analyticsStore')

const DAY = 24 * 60 * 60 * 1000

function event(id: number, domain: EventRow['domain'], ts: string): EventRow {
  return { id, user_id: 'u-1', domain, type: 'water', ts, payload: {}, source: 'manual', created_at: ts }
}

function goal(id: string, status: GoalRow['status']): GoalRow {
  return { id, user_id: 'u-1', title: 'g', domain: 'work', status, created_at: new Date().toISOString() }
}

function analyticsRow(step: AnalyticsEventRow['step'], channel: AnalyticsEventRow['channel'] = null): AnalyticsEventRow {
  return {
    id: Math.random(),
    user_id: 'u-1',
    name: 'app_open',
    step,
    domain: null,
    channel,
    region: null,
    user_type: 'new',
    variant: null,
    payload: {},
    ts: new Date().toISOString(),
  }
}

describe('analyticsStore', () => {
  beforeEach(() => {
    h.loadDashboardData.mockReset()
    h.selectAnalyticsEvents.mockReset()
    h.insertAnalyticsEvent.mockReset()
    h.selectProfile.mockReset()
    h.upsertProfile.mockReset()
    useAnalyticsStore.setState({
      scores: [],
      total: 0,
      last7Days: 0,
      funnel: [],
      segment: {},
      analyticsEvents: [],
      profile: null,
      trackError: null,
      error: null,
    })
  })

  it('refresh 聚合三王事件并算出评分', async () => {
    const now = Date.now()
    h.loadDashboardData.mockResolvedValue({
      events: [
        event(1, 'work', new Date(now - DAY).toISOString()),
        event(2, 'work', new Date(now - 2 * DAY).toISOString()),
        event(3, 'health', new Date(now - 30 * DAY).toISOString()),
      ],
      goals: [goal('g1', 'active'), goal('g2', 'done')],
      unavailableDomains: ['health', 'dating'],
    })

    await useAnalyticsStore.getState().refresh()

    const state = useAnalyticsStore.getState()
    expect(state.total).toBe(3)
    expect(state.last7Days).toBe(2)
    expect(state.perDomain.work).toBe(2)
    expect(state.perDomain.health).toBe(1)
    expect(state.goalsByStatus.active).toBe(1)
    expect(state.scores.map((s) => s.domain)).toEqual(['health', 'work', 'dating'])
    expect(state.unavailableDomains).toEqual(['health', 'dating'])
    expect(state.error).toBeNull()
  })

  it('refresh 失败时写入 error 而不是抛给页面', async () => {
    h.loadDashboardData.mockRejectedValue(new Error('boom'))
    await useAnalyticsStore.getState().refresh()
    expect(useAnalyticsStore.getState().error).toBe('boom')
    expect(useAnalyticsStore.getState().loading).toBe(false)
  })

  it('track 写入 analytics_events 并带上画像维度', async () => {
    h.insertAnalyticsEvent.mockResolvedValue(1)
    useAnalyticsStore.setState({ profile: { user_id: 'u-1', region: '上海', user_type: 'returning', acquire_channel: 'organic', gender: null, created_at: '' } })

    await useAnalyticsStore.getState().track('app_open', 'product.acquire', { domain: 'work' })

    expect(h.insertAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u-1',
        name: 'app_open',
        step: 'product.acquire',
        domain: 'work',
        user_type: 'returning',
        region: '上海',
        channel: 'organic',
      }),
    )
  })

  it('埋点失败不抛出，但记录 trackError', async () => {
    h.insertAnalyticsEvent.mockRejectedValue(new Error('rls denied'))
    await useAnalyticsStore.getState().track('share', 'product.refer')
    expect(useAnalyticsStore.getState().trackError).toBe('rls denied')
  })

  it('refreshFunnel 生成四张漏斗，setSegment 本地重算', async () => {
    h.selectAnalyticsEvents.mockResolvedValue([
      analyticsRow('product.acquire', 'wechat_search'),
      analyticsRow('product.activate', 'wechat_search'),
      analyticsRow('product.acquire', 'friend_share'),
    ])

    await useAnalyticsStore.getState().refreshFunnel()
    expect(useAnalyticsStore.getState().funnel).toHaveLength(4)
    expect(useAnalyticsStore.getState().segments.channels).toEqual(['friend_share', 'wechat_search'])

    useAnalyticsStore.getState().setSegment({ channel: 'wechat_search' })
    const product = useAnalyticsStore.getState().funnel.find((r) => r.key === 'product')
    expect(product?.steps[0]?.count).toBe(1)
  })

  it('ensureProfile 在没有画像时写入默认分群', async () => {
    h.selectProfile.mockResolvedValueOnce(null).mockResolvedValueOnce({
      user_id: 'u-1', region: null, user_type: 'new', acquire_channel: 'organic', gender: null, created_at: '',
    })
    h.upsertProfile.mockResolvedValue(undefined)

    await useAnalyticsStore.getState().ensureProfile()

    expect(h.upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u-1', user_type: 'new', acquire_channel: 'organic' }),
    )
    expect(useAnalyticsStore.getState().profile?.user_type).toBe('new')
  })
})