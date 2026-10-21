import { describe, expect, it } from 'vitest'
import { median, percentile, summarizeExperience } from '../src/services/experience'
import type { AnalyticsEventRow, FunnelStep } from '../src/types/contract'

function row(payload: Record<string, unknown>, step: FunnelStep = 'health.water'): AnalyticsEventRow {
  return {
    id: Math.random(),
    user_id: 'u-1',
    name: 'complete_checkin',
    step,
    domain: 'health',
    channel: null,
    region: null,
    user_type: null,
    variant: null,
    payload: payload as AnalyticsEventRow['payload'],
    ts: '2026-10-21T00:00:00.000Z',
  }
}

describe('体验指标（A7）', () => {
  it('percentile 采用最近秩法', () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(20)
    expect(percentile([10, 20, 30, 40], 0.95)).toBe(40)
    expect(percentile([7], 0.5)).toBe(7)
    expect(percentile([], 0.5)).toBeNull()
  })

  it('median 对偶数样本取中点', () => {
    expect(median([10, 20, 30, 40])).toBe(25)
    expect(median([5, 15, 25])).toBe(15)
    expect(median([])).toBeNull()
  })

  it('从 payload 汇总冷启动与打卡时长', () => {
    const summary = summarizeExperience([
      row({ load_ms: 100 }),
      row({ load_ms: 300 }),
      row({ entry_ms: 5000 }),
      row({ entry_ms: 7000 }),
      row({}),
    ])
    expect(summary.loadSamples).toBe(2)
    expect(summary.loadP50).toBe(100)
    expect(summary.loadP95).toBe(300)
    expect(summary.entrySamples).toBe(2)
    expect(summary.entryMedian).toBe(6000)
  })

  it('忽略非法/负值，避免脏数据污染分位', () => {
    const summary = summarizeExperience([
      row({ load_ms: -1 }),
      row({ load_ms: 'abc' }),
      row({ load_ms: 50 }),
      row({ entry_ms: Number.NaN }),
    ])
    expect(summary.loadSamples).toBe(1)
    expect(summary.loadP50).toBe(50)
    expect(summary.entrySamples).toBe(0)
    expect(summary.entryMedian).toBeNull()
  })
})