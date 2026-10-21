import { describe, expect, it } from 'vitest'
import {
  SEGMENT_DIMENSIONS,
  UNKNOWN_SEGMENT,
  segmentValues,
  summarizeSegments,
} from '../src/services/segments'
import type { AnalyticsEventRow, Channel, FunnelStep } from '../src/types/contract'

function row(
  step: FunnelStep,
  channel: Channel | null,
  domain: AnalyticsEventRow['domain'] = null,
): AnalyticsEventRow {
  return {
    id: Math.random(),
    user_id: 'u-1',
    name: 'complete_checkin',
    step,
    domain,
    channel,
    region: null,
    user_type: null,
    variant: null,
    payload: {},
    ts: '2026-10-21T00:00:00.000Z',
  }
}

describe('分群汇总（A8）', () => {
  it('维度集合与契约 §8 一致', () => {
    expect([...SEGMENT_DIMENSIONS]).toEqual(['channel', 'region', 'user_type'])
  })

  it('按 channel 分组并计算激活率/各王计数', () => {
    const rows = [
      row('product.acquire', 'organic'),
      row('product.activate', 'organic'),
      row('health.water', 'organic', 'health'),
      row('product.acquire', 'friend_share'),
    ]
    const groups = summarizeSegments(rows, 'channel')

    expect(groups.map((g) => g.value)).toEqual(['organic', 'friend_share'])
    const organic = groups[0]
    expect(organic?.events).toBe(3)
    expect(organic?.acquire).toBe(1)
    expect(organic?.activate).toBe(1)
    expect(organic?.activationRate).toBe(1)
    expect(organic?.perKing.health).toBe(1)
    const share = groups[1]
    expect(share?.activationRate).toBe(0)
  })

  it('缺失维度值归入「(未标注)」，不丢数据', () => {
    const groups = summarizeSegments([row('product.acquire', null)], 'channel')
    expect(groups[0]?.value).toBe(UNKNOWN_SEGMENT)
    expect(groups[0]?.events).toBe(1)
  })

  it('按事件量倒序', () => {
    const rows = [
      row('product.acquire', 'organic'),
      row('product.acquire', 'moments_ad'),
      row('product.activate', 'moments_ad'),
    ]
    const groups = summarizeSegments(rows, 'channel')
    expect(groups[0]?.value).toBe('moments_ad')
  })

  it('segmentValues 去重排序', () => {
    const rows = [row('product.acquire', 'organic'), row('product.acquire', 'friend_share'), row('product.acquire', null)]
    expect(segmentValues(rows, 'channel')).toEqual(['friend_share', 'organic', UNKNOWN_SEGMENT].sort())
  })
})