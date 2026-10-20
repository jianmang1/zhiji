import { describe, expect, it } from 'vitest'
import {
  plansForAppOpen,
  plansForCheckin,
  plansForReactivate,
  plansForShare,
  plansForViewKing,
} from '../src/services/tracking'

describe('埋点 step 严格取自契约 §8', () => {
  it('app_open → acquire + activate', () => {
    expect(plansForAppOpen().map((p) => p.step)).toEqual(['product.acquire', 'product.activate'])
  })

  it('首次进入某王记 onboard', () => {
    const steps = plansForViewKing('health', true).map((p) => p.step)
    expect(steps).toContain('health.onboard')
  })

  it('分享 → 产品级推荐 + 该王推荐', () => {
    expect(plansForShare('dating').map((p) => p.step)).toEqual(['product.refer', 'dating.refer'])
  })

  it('召回 → product.reactive', () => {
    expect(plansForReactivate()[0]?.step).toBe('product.reactive')
  })
})

describe('打卡埋点映射', () => {
  it('薄肌王首次饮水 → onboard + water', () => {
    const steps = plansForCheckin('health', 'water', { ml: 500 }, {
      isFirstCheckin: true,
      healthKindsToday: ['water'],
    }).map((p) => p.step)
    expect(steps).toEqual(['health.onboard', 'health.water'])
  })

  it('三件套齐 → 派生综合打卡', () => {
    const steps = plansForCheckin('health', 'workout', { duration_min: 30, calorie: 200, type: 'run' }, {
      isFirstCheckin: false,
      healthKindsToday: ['water', 'sleep', 'workout'],
    }).map((p) => p.step)
    expect(steps).toEqual(['health.workout', 'health.active_day'])
  })

  it('搭讪获得回应 → approach + response', () => {
    const steps = plansForCheckin('dating', 'approach', { count: 1, channel: 'online', got_response: true }, {
      isFirstCheckin: false,
    }).map((p) => p.step)
    expect(steps).toEqual(['dating.approach', 'dating.response'])
  })

  it('未获回应时不记破冰', () => {
    const steps = plansForCheckin('dating', 'approach', { count: 1, channel: 'online', got_response: false }, {
      isFirstCheckin: false,
    }).map((p) => p.step)
    expect(steps).toEqual(['dating.approach'])
  })

  it('脱单到 5 阶 → stage_up + stage5', () => {
    const steps = plansForCheckin('dating', 'stage', { stage: 5, label: 'in_love' }, {
      isFirstCheckin: false,
      previousStage: 2,
    }).map((p) => p.step)
    expect(steps).toEqual(['dating.stage_up', 'dating.stage5'])
  })

  it('力王打卡 → work.wage', () => {
    const steps = plansForCheckin('work', 'work_log', { hours: 8, wage: 500, commute_min: 40 }, {
      isFirstCheckin: false,
    }).map((p) => p.step)
    expect(steps).toEqual(['work.wage'])
  })

  it('聊天不在 v1 漏斗步骤内 → step 留空', () => {
    const plans = plansForCheckin('dating', 'chat', { duration_min: 30, platform: 'wechat', initiator: 'me' }, {
      isFirstCheckin: false,
    })
    expect(plans).toHaveLength(1)
    expect(plans[0]?.step).toBeNull()
  })
})