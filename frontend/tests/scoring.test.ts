import { describe, expect, it } from 'vitest'
import { scoreDomain } from '../src/scoring/engine'
import { tierFor } from '../src/scoring/thresholds'
import type { Domain, EventRow } from '../src/types/contract'

const NOW = new Date('2026-10-20T12:00:00.000Z')

function ev(domain: Domain, type: string, payload: Record<string, unknown>, ts = NOW.toISOString()): EventRow {
  return {
    id: 1,
    user_id: 'u-1',
    domain,
    type,
    ts,
    payload: payload as EventRow['payload'],
    source: 'manual',
    created_at: ts,
  }
}

describe('段位映射（产品定义 §5.2 冻结值）', () => {
  it('边界值逐档正确', () => {
    expect(tierFor(0)).toBe('倔强青铜')
    expect(tierFor(39)).toBe('倔强青铜')
    expect(tierFor(40)).toBe('秩序白银')
    expect(tierFor(69)).toBe('秩序白银')
    expect(tierFor(70)).toBe('荣耀黄金')
    expect(tierFor(89)).toBe('荣耀黄金')
    expect(tierFor(90)).toBe('最强王者')
    expect(tierFor(100)).toBe('最强王者')
  })

  it('越界输入被夹到 0–100', () => {
    expect(tierFor(-5)).toBe('倔强青铜')
    expect(tierFor(130)).toBe('最强王者')
  })
})

describe('薄肌王评分（阈值 §5.1）', () => {
  it('饮水/睡眠/训练按权重加总', () => {
    const result = scoreDomain(
      'health',
      [
        ev('health', 'water', { ml: 1000 }),
        ev('health', 'sleep', { duration_h: 49, quality: 'good' }),
        ev('health', 'workout', { duration_min: 105, calorie: 300 }),
      ],
      { now: NOW },
    )
    // 1000/2000*30 + 49/49*30 + 105/210*40 = 15 + 30 + 20
    expect(result.score).toBe(65)
    expect(result.tier).toBe('秩序白银')
  })

  it('同域多条记录按周聚合求和，并忽略窗口外/他域数据', () => {
    const old = new Date('2026-10-01T12:00:00.000Z').toISOString()
    const result = scoreDomain(
      'health',
      [
        ev('health', 'water', { ml: 1000 }),
        ev('health', 'water', { ml: 1000 }),
        ev('health', 'water', { ml: 9999 }, old),
        ev('work', 'work_log', { hours: 40, wage: 5000, commute_min: 0 }),
      ],
      { now: NOW },
    )
    const water = result.breakdown.find((item) => item.metric === 'water_ml')
    expect(water?.raw).toBe(2000)
    expect(result.eventCount).toBe(2)
  })

  it('超过阈值不加分（封顶 100）', () => {
    const result = scoreDomain(
      'health',
      [
        ev('health', 'water', { ml: 999999 }),
        ev('health', 'sleep', { duration_h: 999 }),
        ev('health', 'workout', { duration_min: 9999, calorie: 1 }),
      ],
      { now: NOW },
    )
    expect(result.score).toBe(100)
    expect(result.tier).toBe('最强王者')
  })
})

describe('力王评分', () => {
  it('通勤是反向指标：不超阈值满分，超出线性递减', () => {
    const good = scoreDomain('work', [ev('work', 'work_log', { hours: 0, wage: 0, commute_min: 350 })], { now: NOW })
    const bad = scoreDomain('work', [ev('work', 'work_log', { hours: 0, wage: 0, commute_min: 700 })], { now: NOW })
    expect(good.breakdown.find((i) => i.metric === 'commute_min')?.ratio).toBe(1)
    expect(bad.breakdown.find((i) => i.metric === 'commute_min')?.ratio).toBe(0)
  })

  it('工资阈值 = 预期月薪/4，可被 options 覆盖', () => {
    const events = [ev('work', 'work_log', { hours: 40, wage: 5000, commute_min: 700 })]
    const result = scoreDomain('work', events, { now: NOW, expectedMonthlyWage: 20000 })
    const wage = result.breakdown.find((i) => i.metric === 'wage')
    expect(wage?.threshold).toBe(5000)
    // 40/40*35 + 5000/5000*35 + 通勤 0 = 70
    expect(result.score).toBe(70)
    expect(result.tier).toBe('荣耀黄金')

    const rich = scoreDomain('work', events, { now: NOW, expectedMonthlyWage: 40000 })
    expect(rich.score).toBe(53)
  })
})

describe('黄毛王评分', () => {
  it('搭讪/约会/聊天求和，脱单进度取最高阶段', () => {
    const result = scoreDomain(
      'dating',
      [
        ev('dating', 'approach', { count: 8, channel: 'online', got_response: true }),
        ev('dating', 'date', { count: 2, duration_min: 120, mood: 'great' }),
        ev('dating', 'chat', { duration_min: 300, platform: 'wechat', initiator: 'both' }),
        ev('dating', 'stage', { stage: 2, label: 'ambiguous' }),
        ev('dating', 'stage', { stage: 5, label: 'in_love' }),
      ],
      { now: NOW },
    )
    // 25 + 12.5 + 20 + 30 = 87.5 → 88
    expect(result.score).toBe(88)
    expect(result.tier).toBe('荣耀黄金')
    expect(result.breakdown.find((i) => i.metric === 'stage')?.raw).toBe(5)
  })
})