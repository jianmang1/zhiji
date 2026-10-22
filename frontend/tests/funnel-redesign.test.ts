import { describe, expect, it } from 'vitest'
import {
  buildFunnelReports,
  buildHealthKingFunnel,
  buildWangBaiKouFunnel,
} from '../src/services/funnel'
import type { AnalyticsEventRow, EventRow, FunnelStep } from '../src/types/contract'

function aRow(step: FunnelStep, name: AnalyticsEventRow['name'], ts: string): AnalyticsEventRow {
  return {
    id: Math.random(),
    user_id: 'u-1',
    name,
    step,
    domain: null,
    channel: null,
    region: null,
    user_type: null,
    variant: null,
    payload: {},
    ts,
  }
}

function hRow(type: string, ts: string): EventRow {
  return {
    id: Math.random(),
    user_id: 'u-1',
    domain: 'health',
    type,
    ts,
    payload: {},
    source: 'manual',
    created_at: ts,
  }
}

describe('王败寇（ADR-007 Task1）', () => {
  it('五层阶梯 + 阈值达成标记', () => {
    const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}T10:00:00.000Z`
    const events = [
      aRow('product.acquire', 'app_open', day(1)),
      aRow('product.acquire', 'app_open', day(2)),
      aRow('product.activate', 'view_king', day(1)),
      aRow('product.reactive', 'reactivate', day(3)), // 召回应不计入主漏斗
      aRow('product.value' as FunnelStep, 'complete_checkin', day(1)),
      aRow('product.value' as FunnelStep, 'complete_checkin', day(2)),
    ]
    const report = buildWangBaiKouFunnel(events)
    expect(report.key).toBe('product')
    expect(report.title).toBe('王败寇')
    expect(report.steps.map((s) => s.step)).toEqual([
      'product.acquire',
      'product.activate',
      'product.retain',
      'product.habit',
      'product.value',
    ])
    expect(report.steps[0]?.count).toBe(2) // 2 次进站
    expect(report.steps[1]?.count).toBe(1) // 1 次激活
    expect(report.steps[2]?.count).toBe(3) // 3 个活跃日（day1/2/3）
    expect(report.steps[2]?.achieved).toBe(false) // 3 天未跨过 >3
    expect(report.steps[3]?.achieved).toBe(false) // 3 天未跨过 >10
    expect(report.steps[4]?.count).toBe(2) // 2 次到达底部
    expect(report.steps[4]?.achieved).toBe(false) // 2 次未跨过 >10
  })

  it('记录天数与到底次数越过阈值后标记达成', () => {
    const day = (n: number) => `2026-09-${String(n).padStart(2, '0')}T10:00:00.000Z`
    const events = [
      aRow('product.acquire', 'app_open', day(1)),
      ...Array.from({ length: 12 }, (_, i) => aRow('product.acquire', 'app_open', day(i + 1))),
      ...Array.from({ length: 12 }, (_, i) => aRow('product.value' as FunnelStep, 'complete_checkin', day(i + 1))),
    ]
    const report = buildWangBaiKouFunnel(events)
    const retain = report.steps.find((s) => s.step === 'product.retain')
    const habit = report.steps.find((s) => s.step === 'product.habit')
    const value = report.steps.find((s) => s.step === 'product.value')
    expect(report.steps[2]?.count).toBe(12) // 12 个活跃日
    expect(retain?.achieved).toBe(true) // 12 > 3
    expect(habit?.achieved).toBe(true) // 12 > 10
    expect(value?.achieved).toBe(true) // 12 > 10
  })
})

describe('薄肌王四层真实事件漏斗（ADR-007 Task2）', () => {
  it('按类型出现的天数分层，最终层=体感', () => {
    const d = (n: number) => `2026-10-${String(n).padStart(2, '0')}T08:00:00.000Z`
    const events = [
      hRow('water', d(1)),
      hRow('sleep', d(1)), // 与 water 同一天 → L1 只算 1 天
      hRow('workout', d(2)),
      hRow('suppression', d(3)),
      hRow('body_sense', d(4)),
    ]
    const report = buildHealthKingFunnel(events)
    expect(report.key).toBe('health')
    expect(report.title).toBe('薄肌王')
    expect(report.steps.map((s) => s.label)).toEqual([
      '喝大水和睡大觉',
      '运动',
      '压抑指标',
      '体感',
    ])
    expect(report.steps.map((s) => s.count)).toEqual([1, 1, 1, 1])
    expect(report.steps.every((s) => s.achieved)).toBe(true)
  })

  it('空数据各层为 0 且未达成', () => {
    const report = buildHealthKingFunnel([])
    expect(report.steps.every((s) => s.count === 0 && !s.achieved)).toBe(true)
  })

  it('buildFunnelReports 在传入 healthEvents 时用真实事件漏斗替换 analytics 版', () => {
    const d = (n: number) => `2026-10-${String(n).padStart(2, '0')}T08:00:00.000Z`
    const healthEvents = [hRow('water', d(1)), hRow('body_sense', d(2))]
    const reports = buildFunnelReports([], {}, healthEvents)
    const health = reports.find((r) => r.key === 'health')
    expect(health?.steps.map((s) => s.label)).toEqual([
      '喝大水和睡大觉',
      '运动',
      '压抑指标',
      '体感',
    ])
    expect(health?.steps[0]?.count).toBe(1)
  })

  it('未传入 healthEvents 时薄肌王回落到 analytics 版', () => {
    const reports = buildFunnelReports([])
    const health = reports.find((r) => r.key === 'health')
    // 回落版基于 health.* 命名空间枚举，步数更多
    expect(health?.steps.length).toBeGreaterThan(4)
  })
})
