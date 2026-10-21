import { describe, expect, it, vi } from 'vitest'
import {
  KING_FUNNELS,
  PRODUCT_FUNNEL,
  adaptRemoteFunnel,
  toPercent,
  type RemoteFunnelPayload,
} from '../src/services/funnel'

const h = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('../src/services/events', () => ({ callHttpFunction: h.call }))

const { fetchRemoteFunnel, fetchRemoteFunnels, funnelRange } = await import('../src/services/funnelApi')

describe('getFunnel 单位归一', () => {
  it('比例(0–1)转百分数', () => {
    expect(toPercent(0.25)).toBeCloseTo(25)
    expect(toPercent(1)).toBeCloseTo(100)
  })
  it('已是百分数则原样返回', () => {
    expect(toPercent(25)).toBeCloseTo(25)
    expect(toPercent(100)).toBeCloseTo(100)
  })
  it('非法值归零', () => {
    expect(toPercent(Number.NaN)).toBe(0)
    expect(toPercent(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('adaptRemoteFunnel', () => {
  const remote: RemoteFunnelPayload = {
    steps: [
      { step: 'product.acquire', count: 100, conv_rate: 1, drop_off: 0 },
      { step: 'product.activate', count: 80, conv_rate: 0.8, drop_off: 0.2 },
      { step: 'product.retain', count: 40, conv_rate: 50, drop_off: 50 },
      { step: 'product.refer', count: 10, conv_rate: 0.25, drop_off: 0.75 },
    ],
    bottleneck_step: 'product.retain',
  }

  it('按契约步骤顺序输出，缺失步补 0', () => {
    const report = adaptRemoteFunnel('product', '产品级', remote, PRODUCT_FUNNEL)
    expect(report.steps.map((s) => s.step)).toEqual([...PRODUCT_FUNNEL])
    expect(report.steps).toHaveLength(PRODUCT_FUNNEL.length)
    const habit = report.steps.find((s) => s.step === 'product.habit')
    expect(habit?.count).toBe(0)
  })

  it('转化率与流失率同时兼容比例/百分数两种云端口径', () => {
    const report = adaptRemoteFunnel('product', '产品级', remote, PRODUCT_FUNNEL)
    const activate = report.steps.find((s) => s.step === 'product.activate')
    const retain = report.steps.find((s) => s.step === 'product.retain')
    expect(activate?.conversionFromPrev).toBeCloseTo(0.8)
    expect(activate?.dropOffPct).toBeCloseTo(20)
    expect(retain?.conversionFromPrev).toBeCloseTo(0.5)
    expect(retain?.dropOffPct).toBeCloseTo(50)
  })

  it('优先采用云端的瓶颈结论', () => {
    const report = adaptRemoteFunnel('product', '产品级', remote, PRODUCT_FUNNEL)
    expect(report.bottleneck).toBe('product.retain')
  })

  it('云端未给瓶颈时按最大 drop-off 自算', () => {
    const noBottleneck: RemoteFunnelPayload = { steps: remote.steps, bottleneck_step: null }
    const report = adaptRemoteFunnel('product', '产品级', noBottleneck, PRODUCT_FUNNEL)
    // retain→refer 流失 75% 最大，应压过 activate→retain 的 50%
    expect(report.bottleneck).toBe('product.refer')
  })

  it('整链路转化率 = 末步 / 首步', () => {
    const report = adaptRemoteFunnel('product', '产品级', remote, PRODUCT_FUNNEL)
    expect(report.overallConversion).toBeCloseTo(0.1)
  })
})

describe('fetchRemoteFunnel(s)', () => {
  it('product 级不传 domain；segment 只传已选维度', async () => {
    h.call.mockResolvedValue({ steps: [], bottleneck_step: null })
    const range = { from: '2026-09-21T00:00:00.000Z', to: '2026-10-21T00:00:00.000Z' }

    await fetchRemoteFunnel({ range, segment: { channel: 'organic', region: undefined } })

    expect(h.call).toHaveBeenCalledWith('getFunnel', {
      range,
      segment: { channel: 'organic' },
    })
  })

  it('某王请求带 domain', async () => {
    h.call.mockResolvedValue({ steps: [], bottleneck_step: null })
    await fetchRemoteFunnel({ domain: 'health', range: funnelRange(7) })
    const body = h.call.mock.calls[0]?.[1] as { domain?: string }
    expect(body.domain).toBe('health')
  })

  it('两层看板 = 4 次请求并适配成 4 张漏斗', async () => {
    h.call.mockResolvedValue({ steps: [], bottleneck_step: null })
    const reports = await fetchRemoteFunnels({}, funnelRange(30))
    expect(h.call).toHaveBeenCalledTimes(4)
    expect(reports.map((r) => r.key)).toEqual(['product', 'dating', 'health', 'work'])
    expect(reports[1]?.steps.map((s) => s.step)).toEqual([...KING_FUNNELS.dating])
  })

  it('funnelRange 返回 ISO 时间窗', () => {
    const range = funnelRange(30, new Date('2026-10-21T00:00:00.000Z'))
    expect(range.to).toBe('2026-10-21T00:00:00.000Z')
    expect(range.from).toBe('2026-09-21T00:00:00.000Z')
  })
})