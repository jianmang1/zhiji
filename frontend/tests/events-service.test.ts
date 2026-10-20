import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventInsert, EventRow } from '../src/types/contract'
import { CloudFunctionUnavailableError } from '../src/services/cloudbase'

const h = vi.hoisted(() => ({
  request: vi.fn(),
  getAccessToken: vi.fn(),
  insertEvent: vi.fn(),
  selectEventsByDomains: vi.fn(),
  selectGoals: vi.fn(),
}))

vi.mock('@tarojs/taro', () => ({ default: { request: h.request } }))

vi.mock('../src/services/cloudbase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/cloudbase')>()
  return { ...actual, getAuth: () => ({ getAccessToken: h.getAccessToken }) }
})

vi.mock('../src/services/rdb', () => ({
  insertEvent: h.insertEvent,
  selectEventsByDomains: h.selectEventsByDomains,
  selectGoals: h.selectGoals,
}))

const HEALTH_DRAFT: EventInsert = {
  domain: 'health',
  type: 'sleep',
  ts: '2026-10-20T08:00:00.000Z',
  payload: { duration_h: 7, quality: 'good' },
  source: 'manual',
}

const DATING_DRAFT: EventInsert = {
  domain: 'dating',
  type: 'approach',
  ts: '2026-10-20T08:00:00.000Z',
  payload: { count: 1, channel: 'online', got_response: true },
  source: 'manual',
}

const WORK_DRAFT: EventInsert = {
  domain: 'work',
  type: 'work_log',
  ts: '2026-10-20T02:00:00.000Z',
  payload: { hours: 8, wage: 500, commute_min: 45 },
  source: 'manual',
}

function row(id: number, domain: EventRow['domain'], ts: string): EventRow {
  return { id, user_id: 'u-1', domain, type: 't', ts, payload: {}, source: 'manual', created_at: ts }
}

async function service() {
  return await import('../src/services/events')
}

describe('事件写入路由（契约 §5 注）', () => {
  beforeEach(() => {
    vi.resetModules()
    h.request.mockReset()
    h.getAccessToken.mockReset()
    h.insertEvent.mockReset()
    h.selectEventsByDomains.mockReset()
    h.selectGoals.mockReset()
    h.getAccessToken.mockResolvedValue({ accessToken: 'tok', env: 'zhiji' })
  })

  it('health 必须走 recordEvent 云函数，不走 rdb', async () => {
    vi.stubEnv('TARO_APP_CLOUDBASE_FN_BASE_URL', 'https://fn.test/')
    h.request.mockResolvedValue({ statusCode: 201, data: { id: 42 } })
    const { createEvent } = await service()

    const result = await createEvent(HEALTH_DRAFT, 'u-1')

    expect(result).toEqual({ id: 42, via: 'recordEvent' })
    expect(h.insertEvent).not.toHaveBeenCalled()
    const call = h.request.mock.calls[0]?.[0]
    expect(call?.url).toBe('https://fn.test/recordEvent')
    expect(call?.header.Authorization).toBe('Bearer tok')
    expect(call?.data).toMatchObject({ domain: 'health', type: 'sleep', source: 'manual' })
  })

  it('dating 同样走云函数', async () => {
    vi.stubEnv('TARO_APP_CLOUDBASE_FN_BASE_URL', 'https://fn.test')
    h.request.mockResolvedValue({ statusCode: 201, data: { id: 43 } })
    const { createEvent } = await service()

    const result = await createEvent(DATING_DRAFT, 'u-1')

    expect(result.via).toBe('recordEvent')
    expect(h.insertEvent).not.toHaveBeenCalled()
  })

  it('端点未配置时抛 CloudFunctionUnavailableError，而不是伪造写入', async () => {
    const { createEvent } = await service()
    await expect(createEvent(HEALTH_DRAFT, 'u-1')).rejects.toBeInstanceOf(CloudFunctionUnavailableError)
    expect(h.insertEvent).not.toHaveBeenCalled()
  })

  it('work 直连 rdb 且显式带 user_id（由 RLS 校验）', async () => {
    h.insertEvent.mockResolvedValue(7)
    const { createEvent } = await service()

    const result = await createEvent(WORK_DRAFT, 'u-1')

    expect(result).toEqual({ id: 7, via: 'rdb' })
    expect(h.request).not.toHaveBeenCalled()
    expect(h.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'work', type: 'work_log', user_id: 'u-1' }),
    )
  })

  it('云函数非 2xx 时冒泡可读错误', async () => {
    vi.stubEnv('TARO_APP_CLOUDBASE_FN_BASE_URL', 'https://fn.test')
    h.request.mockResolvedValue({ statusCode: 400, data: { message: 'Invalid function input' } })
    const { createEvent } = await service()
    await expect(createEvent(DATING_DRAFT, 'u-1')).rejects.toThrow('Invalid function input')
  })
})

describe('loadDashboardData', () => {
  beforeEach(() => {
    vi.resetModules()
    h.request.mockReset()
    h.getAccessToken.mockReset()
    h.selectEventsByDomains.mockReset()
    h.selectGoals.mockReset()
    h.getAccessToken.mockResolvedValue({ accessToken: 'tok', env: 'zhiji' })
  })

  it('端点缺失时只读 work 域，并上报不可用的敏感域', async () => {
    h.selectEventsByDomains.mockResolvedValue([row(1, 'work', '2026-10-20T02:00:00.000Z')])
    h.selectGoals.mockResolvedValue([])
    const { loadDashboardData } = await service()

    const data = await loadDashboardData()

    expect(data.events).toHaveLength(1)
    expect(data.unavailableDomains).toEqual(['health', 'dating'])
    expect(h.request).not.toHaveBeenCalled()
    expect(h.selectEventsByDomains.mock.calls[0]?.[0]).toEqual(['work'])
  })

  it('端点就绪时合并敏感域并按 ts 倒序', async () => {
    vi.stubEnv('TARO_APP_CLOUDBASE_FN_BASE_URL', 'https://fn.test')
    h.selectEventsByDomains.mockResolvedValue([row(1, 'work', '2026-10-20T02:00:00.000Z')])
    h.selectGoals.mockResolvedValue([])
    h.request.mockImplementation((options: { data: { domain?: string } }) => {
      const domain = options.data.domain
      return Promise.resolve({
        statusCode: 200,
        data: [row(domain === 'health' ? 2 : 3, domain === 'health' ? 'health' : 'dating', '2026-10-20T09:00:00.000Z')],
      })
    })
    const { loadDashboardData } = await service()

    const data = await loadDashboardData()

    expect(h.request).toHaveBeenCalledTimes(2)
    expect(data.unavailableDomains).toEqual([])
    expect(data.events.map((e) => e.id)).toEqual([2, 3, 1])
  })
})