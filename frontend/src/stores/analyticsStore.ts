/**
 * 分析层状态：三王评分（模块 5 数据的展示侧）、两层漏斗（模块 7）、埋点（模块 6）。
 */
import { create } from 'zustand'
import {
  insertAnalyticsEvent,
  selectAnalyticsEvents,
  selectProfile,
  upsertProfile,
} from '../services/rdb'
import { isCloudFunctionConfigured, loadDashboardData } from '../services/events'
import { fetchRemoteFunnels, funnelRange } from '../services/funnelApi'
import {
  buildFunnelReports,
  reactiveCount,
  segmentOptions,
  type FunnelReport,
  type Segment,
} from '../services/funnel'
import type { TrackPlan } from '../services/tracking'
import { scoreAll, type ScoreResult } from '../scoring/engine'
import type {
  AnalyticsEventInsert,
  AnalyticsEventRow,
  AnalyticsName,
  Domain,
  EventRow,
  FunnelStep,
  GoalStatus,
  ProfileRow,
} from '../types/contract'
import { DOMAINS, GOAL_STATUSES } from '../types/contract'
import { toMessage } from '../utils/error'
import { useAuthStore } from './authStore'

const DAY_MS = 24 * 60 * 60 * 1000

export type DomainCounts = Record<Domain, number>
export type StatusCounts = Record<GoalStatus, number>

export interface TrackOptions {
  domain?: Domain
  channel?: AnalyticsEventInsert['channel']
  region?: string
  user_type?: AnalyticsEventInsert['user_type']
  variant?: string
  payload?: AnalyticsEventInsert['payload']
}

export interface SegmentOptionsResult {
  channels: string[]
  regions: string[]
  userTypes: string[]
}

function emptyDomainCounts(): DomainCounts {
  return DOMAINS.reduce((acc, domain) => {
    acc[domain] = 0
    return acc
  }, {} as DomainCounts)
}

function emptyStatusCounts(): StatusCounts {
  return GOAL_STATUSES.reduce((acc, status) => {
    acc[status] = 0
    return acc
  }, {} as StatusCounts)
}

export interface AnalyticsState {
  events: EventRow[]
  scores: ScoreResult[]
  perDomain: DomainCounts
  total: number
  last7Days: number
  goalsByStatus: StatusCounts
  recent: EventRow[]
  unavailableDomains: Domain[]
  funnel: FunnelReport[]
  /** 漏斗数据来源：cloud = getFunnel 云函数，local = 前端本地计算 */
  funnelSource: 'local' | 'cloud'
  reactive: number
  segments: SegmentOptionsResult
  segment: Segment
  analyticsEvents: AnalyticsEventRow[]
  profile: ProfileRow | null
  loading: boolean
  funnelLoading: boolean
  error: string | null
  trackError: string | null
  refresh: (limit?: number) => Promise<void>
  refreshFunnel: () => Promise<void>
  setSegment: (segment: Segment) => void
  track: (name: AnalyticsName, step: FunnelStep | null, options?: TrackOptions) => Promise<void>
  trackPlans: (plans: readonly TrackPlan[]) => Promise<void>
  ensureProfile: () => Promise<void>
}

export const useAnalyticsStore = create<AnalyticsState>((set, get) => ({
  events: [],
  scores: [],
  perDomain: emptyDomainCounts(),
  total: 0,
  last7Days: 0,
  goalsByStatus: emptyStatusCounts(),
  recent: [],
  unavailableDomains: [],
  funnel: [],
  funnelSource: 'local',
  reactive: 0,
  segments: { channels: [], regions: [], userTypes: [] },
  segment: {},
  analyticsEvents: [],
  profile: null,
  loading: false,
  funnelLoading: false,
  error: null,
  trackError: null,

  async refresh(limit = 200) {
    set({ loading: true, error: null })
    try {
      const data = await loadDashboardData(limit)
      const perDomain = emptyDomainCounts()
      const goalsByStatus = emptyStatusCounts()
      const since = Date.now() - 7 * DAY_MS

      for (const event of data.events) {
        perDomain[event.domain] += 1
      }
      for (const goal of data.goals) {
        goalsByStatus[goal.status] += 1
      }

      set({
        events: data.events,
        scores: scoreAll(data.events, DOMAINS),
        perDomain,
        total: data.events.length,
        last7Days: data.events.filter((event) => new Date(event.ts).getTime() >= since).length,
        goalsByStatus,
        recent: data.events.slice(0, 20),
        unavailableDomains: data.unavailableDomains,
        loading: false,
      })
    } catch (error) {
      set({ loading: false, error: toMessage(error, '加载看板数据失败') })
    }
  },

  async refreshFunnel() {
    set({ funnelLoading: true })
    try {
      const rows = await selectAnalyticsEvents(500)
      const { segment } = get()
      let funnel = buildFunnelReports(rows, segment)
      let funnelSource: 'local' | 'cloud' = 'local'

      if (isCloudFunctionConfigured()) {
        try {
          funnel = await fetchRemoteFunnels(segment, funnelRange())
          funnelSource = 'cloud'
        } catch {
          // 云函数不可用（未部署 / 网络 / 鉴权）→ 回退本地计算；不伪造数据
          funnel = buildFunnelReports(rows, segment)
        }
      }

      set({
        analyticsEvents: rows,
        funnel,
        funnelSource,
        reactive: reactiveCount(rows),
        segments: segmentOptions(rows),
        funnelLoading: false,
      })
    } catch (error) {
      set({ funnelLoading: false, error: toMessage(error, '加载漏斗数据失败') })
    }
  },

  setSegment(segment) {
    const { analyticsEvents } = get()
    set({
      segment,
      funnel: buildFunnelReports(analyticsEvents, segment),
      reactive: reactiveCount(analyticsEvents),
    })
    // 云端模式下分群需要重新向 getFunnel 聚合
    if (isCloudFunctionConfigured()) {
      void get().refreshFunnel()
    }
  },

  async track(name, step, options = {}) {
    const userId = useAuthStore.getState().userId
    if (!userId) return
    const { profile } = get()
    const row: AnalyticsEventInsert = {
      user_id: userId,
      name,
      step,
      domain: options.domain ?? null,
      channel: options.channel ?? profile?.acquire_channel ?? null,
      region: options.region ?? profile?.region ?? null,
      user_type: options.user_type ?? profile?.user_type ?? null,
      variant: options.variant ?? null,
      payload: options.payload ?? {},
    }
    try {
      await insertAnalyticsEvent(row)
      set({ trackError: null })
    } catch (error) {
      // 埋点失败不阻断用户主流程，但要留下可诊断信息
      set({ trackError: toMessage(error, '埋点写入失败') })
    }
  },

  async trackPlans(plans) {
    for (const plan of plans) {
      await get().track(plan.name, plan.step, {
        domain: plan.domain ?? undefined,
        payload: plan.payload,
      })
    }
  },

  async ensureProfile() {
    const userId = useAuthStore.getState().userId
    if (!userId) return
    try {
      const existing = await selectProfile(userId)
      if (existing) {
        set({ profile: existing })
        return
      }
      // v1 先落最小画像：新用户 + 自然量（渠道由分享链路后续修正）
      await upsertProfile({ user_id: userId, user_type: 'new', acquire_channel: 'organic' })
      set({ profile: await selectProfile(userId) })
    } catch (error) {
      set({ error: toMessage(error, '初始化用户画像失败') })
    }
  },
}))