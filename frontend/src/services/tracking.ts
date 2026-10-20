/**
 * 埋点计划（模块 6 的纯逻辑）：把"用户动作"翻译成 analytics_events 行。
 *
 * 铁律：step 必须取自契约 §8 命名空间枚举（v1 取值），禁止自造。
 * 埋点零额外摩擦 —— 在既有打卡/分享动作里顺带发，不新增操作步骤。
 */
import type { AnalyticsEventInsert, Domain, FunnelStep, JsonObject } from '../types/contract'
import { STAGE_LABELS } from '../schemas/payload'

export interface TrackPlan {
  name: AnalyticsEventInsert['name']
  step: FunnelStep | null
  domain: Domain | null
  payload?: JsonObject
}

/** 打开小程序：获取 + 激活 */
export function plansForAppOpen(): TrackPlan[] {
  return [
    { name: 'app_open', step: 'product.acquire', domain: null },
    { name: 'app_open', step: 'product.activate', domain: null },
  ]
}

/** 浏览某王（按停留/进入触发）→ 激活；首次进入该王记 onboard */
export function plansForViewKing(domain: Domain, isFirstVisit: boolean): TrackPlan[] {
  const plans: TrackPlan[] = [{ name: 'view_king', step: 'product.activate', domain }]
  if (isFirstVisit) {
    plans.push({ name: 'view_king', step: `${domain}.onboard` as FunnelStep, domain })
  }
  return plans
}

/** 分享 → 产品级推荐 + 该王推荐 */
export function plansForShare(domain: Domain | null): TrackPlan[] {
  const plans: TrackPlan[] = [{ name: 'share', step: 'product.refer', domain }]
  if (domain) plans.push({ name: 'share', step: `${domain}.refer` as FunnelStep, domain })
  return plans
}

/** 召回/复活 */
export function plansForReactivate(): TrackPlan[] {
  return [{ name: 'reactivate', step: 'product.reactive', domain: null }]
}

export interface CheckinContext {
  /** 该王是否首次打卡 */
  isFirstCheckin: boolean
  /** 今天已完成的 health 类型（含本次），用于派生"综合打卡" */
  healthKindsToday?: readonly string[]
  /** 打卡前的脱单阶段（用于判断是否进阶） */
  previousStage?: number
}

function healthStepFor(type: string): FunnelStep | null {
  if (type === 'water') return 'health.water'
  if (type === 'sleep') return 'health.sleep'
  if (type === 'workout') return 'health.workout'
  return null
}

function workStepFor(type: string): FunnelStep | null {
  if (type === 'work_log') return 'work.wage'
  return null
}

function datingPlans(type: string, payload: JsonObject, ctx: CheckinContext): TrackPlan[] {
  if (type === 'approach') {
    const plans: TrackPlan[] = [{ name: 'complete_checkin', step: 'dating.approach', domain: 'dating' }]
    if (payload.got_response === true) {
      plans.push({ name: 'complete_checkin', step: 'dating.response', domain: 'dating' })
    }
    return plans
  }
  if (type === 'date') {
    return [{ name: 'complete_checkin', step: 'dating.date', domain: 'dating' }]
  }
  if (type === 'stage') {
    const stage = typeof payload.stage === 'number' ? payload.stage : 0
    const plans: TrackPlan[] = []
    const advanced = ctx.previousStage === undefined || stage > ctx.previousStage
    if (advanced || stage >= 3) {
      plans.push({
        name: 'stage_up',
        step: 'dating.stage_up',
        domain: 'dating',
        payload: { stage, label: STAGE_LABELS[stage] ?? String(stage) },
      })
    }
    if (stage === 5) {
      plans.push({ name: 'stage_up', step: 'dating.stage5', domain: 'dating', payload: { stage } })
    }
    return plans
  }
  // chat 不在 v1 漏斗步骤内（§15.1 黄毛王链路无 chat），仅记原始行为
  return [{ name: 'complete_checkin', step: null, domain: 'dating' }]
}

/**
 * 打卡 → 埋点计划。step 严格映射契约 §8；chat 等无漏斗步的类型 step 留空。
 */
export function plansForCheckin(
  domain: Domain,
  type: string,
  payload: JsonObject,
  ctx: CheckinContext,
): TrackPlan[] {
  const plans: TrackPlan[] = []

  if (ctx.isFirstCheckin) {
    plans.push({
      name: 'complete_checkin',
      step: `${domain}.onboard` as FunnelStep,
      domain,
    })
  }

  if (domain === 'health') {
    const step = healthStepFor(type)
    if (step) plans.push({ name: 'complete_checkin', step, domain })
    // 三件套齐 → 派生"综合打卡"（§15.3：综合打卡为派生步，零额外摩擦）
    const kinds = ctx.healthKindsToday ?? []
    const complete = ['water', 'sleep', 'workout'].every((kind) => kinds.includes(kind))
    if (complete) {
      plans.push({ name: 'complete_checkin', step: 'health.active_day', domain: 'health' })
    }
    return plans
  }

  if (domain === 'work') {
    const step = workStepFor(type)
    if (step) plans.push({ name: 'complete_checkin', step, domain })
    return plans
  }

  plans.push(...datingPlans(type, payload, ctx))
  return plans
}