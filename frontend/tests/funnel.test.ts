import { describe, expect, it } from 'vitest'
import {
  PRODUCT_FUNNEL,
  buildFunnelReports,
  computeFunnel,
  filterBySegment,
  reactiveCount,
  segmentOptions,
} from '../src/services/funnel'
import type { AnalyticsEventRow, FunnelStep } from '../src/types/contract'

function row(step: FunnelStep, extra: Partial<AnalyticsEventRow> = {}): AnalyticsEventRow {
  return {
    id: Math.random(),
    user_id: 'u-1',
    name: 'complete_checkin',
    step,
    domain: null,
    channel: null,
    region: null,
    user_type: null,
    variant: null,
    payload: {},
    ts: '2026-10-20T10:00:00.000Z',
    ...extra,
  }
}

function counts(entries: [FunnelStep, number][]): Map<FunnelStep, number> {
  return new Map(entries)
}

describe('computeFunnel', () => {
  it('计算每步计数、转化率与流失率，并定位瓶颈步', () => {
    const report = computeFunnel(
      'product',
      '产品级',
      PRODUCT_FUNNEL,
      counts([
        ['product.acquire', 100],
        ['product.activate', 80],
        ['product.retain', 40],
        ['product.habit', 30],
        ['product.value', 10],
        ['product.refer', 5],
      ]),
    )

    expect(report.steps[0]?.count).toBe(100)
    expect(report.steps[1]?.conversionFromPrev).toBeCloseTo(0.8)
    expect(report.steps[2]?.dropOffPct).toBeCloseTo(50)
    // 最大流失：retain→habit 25% / habit→value 66.7% / value→refer 50% → 瓶颈 habit→value 的下一步
    expect(report.bottleneck).toBe('product.value')
    expect(report.overallConversion).toBeCloseTo(0.05)
  })

  it('首步为 0 时不产生 NaN', () => {
    const report = computeFunnel('work', '力王', ['work.onboard', 'work.wage'], counts([]))
    expect(report.steps[0]?.conversionFromPrev).toBe(0)
    expect(report.overallConversion).toBe(0)
    expect(report.bottleneck).toBe('work.wage')
  })
})

describe('分群与两层结构', () => {
  const events = [
    row('product.acquire', { channel: 'wechat_search', user_type: 'new' }),
    row('product.acquire', { channel: 'friend_share', user_type: 'returning' }),
    row('product.activate', { channel: 'wechat_search', user_type: 'new' }),
    row('product.refer', { channel: 'friend_share', user_type: 'returning' }),
    row('product.reactive'),
  ]

  it('按 channel 过滤', () => {
    const filtered = filterBySegment(events, { channel: 'wechat_search' })
    expect(filtered).toHaveLength(2)
  })

  it('buildFunnelReports 返回 产品级 + 三王 四张漏斗', () => {
    const reports = buildFunnelReports(events)
    expect(reports.map((r) => r.key)).toEqual(['product', 'dating', 'health', 'work'])
  })

  it('召回环单独计数', () => {
    expect(reactiveCount(events)).toBe(1)
  })

  it('分群可选值去重排序', () => {
    const options = segmentOptions(events)
    expect(options.channels).toEqual(['friend_share', 'wechat_search'])
    expect(options.userTypes).toEqual(['new', 'returning'])
  })
})