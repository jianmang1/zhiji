import { describe, expect, it } from 'vitest'
import {
  DATING_ADVANCED_STAGE,
  DATING_KING_LAYERS,
  HEALTH_KING_LAYERS,
  WORK_COMMUTE_LIMIT_MIN,
  WORK_HOURS_TARGET_H,
  WORK_KING_LAYERS,
  buildDatingKingFunnel,
  buildFunnelReports,
  buildHealthKingFunnel,
  buildWorkKingFunnel,
} from '../src/services/funnel'
import type { Domain, EventRow } from '../src/types/contract'

const day = (n: number, hour = 8) => `2026-10-${String(n).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`

function ev(domain: Domain, type: string, payload: Record<string, unknown>, ts: string): EventRow {
  return {
    id: Math.random(),
    user_id: 'u-1',
    domain,
    type,
    ts,
    payload: payload as EventRow['payload'],
    source: 'manual',
    created_at: ts,
  }
}

describe('力王分层漏斗（真实 work_log，ADR-007 模式）', () => {
  it('四层顺序与阈值常量一致', () => {
    expect(WORK_KING_LAYERS.map((l) => l.label)).toEqual([
      '打卡记录',
      `工时达标（≥${WORK_HOURS_TARGET_H}h）`,
      '收入入账',
      `通勤可控（≤${WORK_COMMUTE_LIMIT_MIN}min）`,
    ])
  })

  it('按天计数：达标日进相应层，不达标只进首层', () => {
    const events = [
      // 第 1 天：工时 8、有收入、通勤 60 → 四层都算
      ev('work', 'work_log', { hours: 8, wage: 500, commute_min: 60 }, day(1)),
      // 第 2 天：工时 4、无收入、通勤 120 → 只算 L1
      ev('work', 'work_log', { hours: 4, wage: 0, commute_min: 120 }, day(2)),
      // 第 3 天：工时 9、有收入、通勤 45 → 四层都算
      ev('work', 'work_log', { hours: 9, wage: 300, commute_min: 45 }, day(3)),
    ]

    const report = buildWorkKingFunnel(events)

    expect(report.key).toBe('work')
    expect(report.title).toBe('力王')
    expect(report.steps.map((s) => s.count)).toEqual([3, 2, 2, 2])
    expect(report.steps.map((s) => s.achieved)).toEqual([true, true, true, true])
  })

  it('同一天多条 work_log 只计 1 天', () => {
    const events = [
      ev('work', 'work_log', { hours: 3, wage: 0, commute_min: 10 }, day(5, 9)),
      ev('work', 'work_log', { hours: 3, wage: 0, commute_min: 10 }, day(5, 18)),
    ]
    const report = buildWorkKingFunnel(events)
    expect(report.steps[0]?.count).toBe(1)
    expect(report.steps[1]?.count).toBe(0) // 单条未达 8h
  })

  it('空数据全 0 且未达成', () => {
    const report = buildWorkKingFunnel([])
    expect(report.steps.every((s) => s.count === 0 && !s.achieved)).toBe(true)
    expect(report.overallConversion).toBe(0)
  })
})

describe('黄毛王分层漏斗（真实 approach/date/stage）', () => {
  it('四层顺序：首触→破冰→约见→进阶', () => {
    expect(DATING_KING_LAYERS.map((l) => l.label)).toEqual([
      '首触',
      '破冰',
      '约见',
      '进阶（≥稳定约会）',
    ])
  })

  it('按天计数并区分"有回应/无回应"', () => {
    const events = [
      ev('dating', 'approach', { count: 1, channel: 'online', got_response: true }, day(1)),
      ev('dating', 'approach', { count: 1, channel: 'offline', got_response: false }, day(2)),
      ev('dating', 'date', { count: 1, duration_min: 120, mood: 'great' }, day(3)),
      ev('dating', 'stage', { stage: 3, label: 'dating_steady' }, day(4)),
      ev('dating', 'stage', { stage: 2, label: 'ambiguous' }, day(5)), // 未达阈值
    ]

    const report = buildDatingKingFunnel(events)

    expect(report.key).toBe('dating')
    expect(report.title).toBe('黄毛王')
    expect(report.steps.map((s) => s.count)).toEqual([2, 1, 1, 1])
    expect(report.steps[0]?.count).toBe(2) // 两天都有 approach
    expect(report.steps[1]?.count).toBe(1) // 只有一天 got_response=true
  })

  it('进阶层阈值为稳定约会及以上', () => {
    const events = [
      ev('dating', 'stage', { stage: DATING_ADVANCED_STAGE - 1, label: 'ambiguous' }, day(1)),
      ev('dating', 'stage', { stage: DATING_ADVANCED_STAGE, label: 'dating_steady' }, day(2)),
    ]
    const report = buildDatingKingFunnel(events)
    expect(report.steps[3]?.count).toBe(1)
  })
})

describe('分层漏斗的稳健性', () => {
  it('某层覆盖天数多于上一层时，转化率钳在 100%、流失率不为负', () => {
    // 只有约见、没有搭讪：L3 > L2
    const events = [
      ev('dating', 'date', { count: 1, duration_min: 60, mood: 'ok' }, day(1)),
      ev('dating', 'date', { count: 1, duration_min: 60, mood: 'ok' }, day(2)),
    ]
    const report = buildDatingKingFunnel(events)
    expect(report.steps[2]?.count).toBe(2)
    expect(report.steps[2]?.conversionFromPrev).toBeLessThanOrEqual(1)
    expect(report.steps[2]?.dropOffPct).toBeGreaterThanOrEqual(0)
  })

  it('薄肌王重构后与既有口径一致（回归）', () => {
    const events = [
      ev('health', 'water', { ml: 500 }, day(1)),
      ev('health', 'sleep', { duration_h: 7, quality: 'good' }, day(1)),
      ev('health', 'workout', { type: 'run', duration_min: 30, calorie: 200 }, day(2)),
      ev('health', 'suppression', { score: 3 }, day(3)),
      ev('health', 'body_sense', { feel_score: 8 }, day(4)),
    ]
    const report = buildHealthKingFunnel(events)
    expect(report.steps.map((s) => s.label)).toEqual(HEALTH_KING_LAYERS.map((l) => l.label))
    expect(report.steps.map((s) => s.count)).toEqual([1, 1, 1, 1])
  })
})

describe('buildFunnelReports 接入三王真实事件', () => {
  it('传入 kingEvents 时三王都用分层版（4 层）', () => {
    const kingEvents = {
      health: [ev('health', 'water', { ml: 500 }, day(1))],
      work: [ev('work', 'work_log', { hours: 8, wage: 100, commute_min: 30 }, day(2))],
      dating: [ev('dating', 'approach', { count: 1, channel: 'online', got_response: true }, day(3))],
    }
    const reports = buildFunnelReports([], {}, kingEvents)
    const byKey = Object.fromEntries(reports.map((r) => [r.key, r]))
    expect(byKey.health?.steps.map((s) => s.label)).toEqual(HEALTH_KING_LAYERS.map((l) => l.label))
    expect(byKey.work?.steps.map((s) => s.label)).toEqual(WORK_KING_LAYERS.map((l) => l.label))
    expect(byKey.dating?.steps.map((s) => s.label)).toEqual(DATING_KING_LAYERS.map((l) => l.label))
  })

  it('未传 kingEvents 时三王回落到 analytics 埋点版（步数更多）', () => {
    const reports = buildFunnelReports([])
    for (const key of ['health', 'work', 'dating'] as const) {
      const report = reports.find((r) => r.key === key)
      expect(report?.steps.length).toBeGreaterThan(4)
    }
  })
})