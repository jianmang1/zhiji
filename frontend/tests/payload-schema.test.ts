import { describe, expect, it } from 'vitest'
import { DOMAINS, KING_LABELS } from '../src/types/contract'
import { EVENT_TYPES, getEventTypeSpec } from '../src/schemas/payload'

const CONTRACT_TYPES: Record<string, string[]> = {
  health: ['water', 'sleep', 'workout', 'body_sense', 'suppression'],
  work: ['work_log'],
  dating: ['approach', 'date', 'chat', 'stage'],
}

describe('payload 注册表与契约 v1.4 §3 一致', () => {
  it('恰好三王域，且各有中文名', () => {
    expect([...DOMAINS]).toEqual(['health', 'work', 'dating'])
    for (const domain of DOMAINS) {
      expect(EVENT_TYPES[domain].length).toBeGreaterThan(0)
      expect(KING_LABELS[domain]).toBeTruthy()
    }
  })

  it('type 集合与契约 §3 逐项对齐（无自造类型）', () => {
    for (const domain of DOMAINS) {
      const actual = EVENT_TYPES[domain].map((spec) => spec.type).sort()
      expect(actual).toEqual([...(CONTRACT_TYPES[domain] ?? [])].sort())
    }
  })

  it('字段名严格来自契约，不多不少', () => {
    const expected: Record<string, string[]> = {
      'health.water': ['ml'],
      'health.sleep': ['duration_h', 'quality'],
      'health.workout': ['type', 'duration_min', 'calorie'],
      'health.body_sense': ['waist_cm', 'feel', 'feel_score', 'note'],
      'health.suppression': ['score', 'note'],
      'work.work_log': ['hours', 'wage', 'salary', 'commute_min'],
      'dating.approach': ['count', 'channel', 'got_response'],
      'dating.date': ['count', 'duration_min', 'mood', 'spend_yuan'],
      'dating.chat': ['duration_min', 'platform', 'initiator'],
      'dating.stage': ['stage', 'label', 'note'],
    }
    for (const [key, fields] of Object.entries(expected)) {
      const [domain, type] = key.split('.') as [string, string]
      const spec = getEventTypeSpec(domain as never, type)
      if (!spec) throw new Error(`${key} 缺失`)
      expect([...spec.fields.map((f) => f.key)].sort()).toEqual([...fields].sort())
    }
  })
})

describe('payload 校验', () => {
  it('body_sense 允许只填围度或只填体感，但拒绝全空', () => {
    const spec = getEventTypeSpec('health', 'body_sense')
    if (!spec) throw new Error('body_sense 缺失')
    expect(spec.schema.safeParse({ waist_cm: 82 }).success).toBe(true)
    expect(spec.schema.safeParse({ feel: 'ok' }).success).toBe(true)
    expect(spec.schema.safeParse({ waist_cm: 82, feel: 'great', note: '腰带松了一格' }).success).toBe(true)
    expect(spec.schema.safeParse({}).success).toBe(false)
  })

  it('body_sense 拒绝非法体感与越界围度', () => {
    const spec = getEventTypeSpec('health', 'body_sense')
    if (!spec) throw new Error('body_sense 缺失')
    expect(spec.schema.safeParse({ feel: 'amazing' }).success).toBe(false)
    expect(spec.schema.safeParse({ waist_cm: 0 }).success).toBe(false)
    expect(spec.schema.safeParse({ waist_cm: 999 }).success).toBe(false)
    expect(spec.schema.safeParse({ waist_cm: 80, extra: 1 }).success).toBe(false)
  })

  it('body_sense.feel_score 接受 1–10 整数，拒绝越界（ADR-007）', () => {
    const spec = getEventTypeSpec('health', 'body_sense')
    if (!spec) throw new Error('body_sense 缺失')
    expect(spec.schema.safeParse({ feel_score: 7 }).success).toBe(true)
    expect(spec.schema.safeParse({ feel_score: 0 }).success).toBe(false)
    expect(spec.schema.safeParse({ feel_score: 11 }).success).toBe(false)
    expect(spec.schema.safeParse({ feel_score: 7.5 }).success).toBe(false)
  })

  it('suppression.score 接受 0–10 整数，且可独立成条（ADR-007）', () => {
    const spec = getEventTypeSpec('health', 'suppression')
    if (!spec) throw new Error('suppression 缺失')
    expect(spec.schema.safeParse({ score: 3 }).success).toBe(true)
    expect(spec.schema.safeParse({ score: 11 }).success).toBe(false)
    expect(spec.schema.safeParse({ score: -1 }).success).toBe(false)
    expect(spec.schema.safeParse({}).success).toBe(false) // score 为必填（压抑值是核心数据）
    expect(spec.schema.safeParse({ score: 3, note: '被安排加班' }).success).toBe(true)
  })
  it('接受合法的 health.water', () => {
    const spec = getEventTypeSpec('health', 'water')
    if (!spec) throw new Error('water 缺失')
    expect(spec.schema.safeParse({ ml: 2000 }).success).toBe(true)
  })

  it('拒绝多余字段（对齐后端 extra=forbid）', () => {
    const spec = getEventTypeSpec('health', 'water')
    if (!spec) throw new Error('water 缺失')
    expect(spec.schema.safeParse({ ml: 2000, extra: 1 }).success).toBe(false)
  })

  it('拒绝非法枚举（dating.approach.channel）', () => {
    const spec = getEventTypeSpec('dating', 'approach')
    if (!spec) throw new Error('approach 缺失')
    expect(
      spec.schema.safeParse({ count: 1, channel: 'tinder', got_response: true }).success,
    ).toBe(false)
    expect(
      spec.schema.safeParse({ count: 1, channel: 'online', got_response: true }).success,
    ).toBe(true)
  })

  it('可选字段缺省可通过（date.spend_yuan / stage.note）', () => {
    const dateSpec = getEventTypeSpec('dating', 'date')
    const stageSpec = getEventTypeSpec('dating', 'stage')
    if (!dateSpec || !stageSpec) throw new Error('spec 缺失')
    expect(
      dateSpec.schema.safeParse({ count: 1, duration_min: 120, mood: 'great' }).success,
    ).toBe(true)
    expect(stageSpec.schema.safeParse({ stage: 2, label: 'ambiguous' }).success).toBe(true)
  })

  it('拒绝越界（stage 必须 0..5，count ≥1）', () => {
    const stageSpec = getEventTypeSpec('dating', 'stage')
    const approachSpec = getEventTypeSpec('dating', 'approach')
    if (!stageSpec || !approachSpec) throw new Error('spec 缺失')
    expect(stageSpec.schema.safeParse({ stage: 6, label: 'in_love' }).success).toBe(false)
    expect(
      approachSpec.schema.safeParse({ count: 0, channel: 'online', got_response: false }).success,
    ).toBe(false)
  })
})