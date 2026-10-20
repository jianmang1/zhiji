import { describe, expect, it } from 'vitest'
import { eventSchemaFor, parseEventDraft } from '../src/schemas/event'

const SLEEP_DRAFT = {
  domain: 'health',
  type: 'sleep',
  ts: '2026-10-20T08:00:00.000Z',
  payload: { duration_h: 7.5, quality: 'good' },
  source: 'manual',
}

describe('events schema 镜像契约 v1.4 §2', () => {
  it('接受带时区的 ISO 时间与合法 payload', () => {
    expect(eventSchemaFor('health', 'sleep').safeParse(SLEEP_DRAFT).success).toBe(true)
  })

  it('拒绝不带时区的 ts（对齐后端 tz-aware 校验）', () => {
    const result = eventSchemaFor('health', 'sleep').safeParse({
      ...SLEEP_DRAFT,
      ts: '2026-10-20T08:00:00',
    })
    expect(result.success).toBe(false)
  })

  it('source 缺省时补 manual', () => {
    const result = eventSchemaFor('work', 'work_log').safeParse({
      domain: 'work',
      type: 'work_log',
      ts: '2026-10-20T02:00:00.000Z',
      payload: { hours: 8, wage: 500, commute_min: 60 },
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.source).toBe('manual')
  })

  it('未知 type 直接抛错，避免写入契约外类型', () => {
    expect(() => eventSchemaFor('health', 'steps')).toThrow()
  })

  it('拒绝已废弃的 consumption 域', () => {
    expect(() => eventSchemaFor('consumption' as never, 'expense')).toThrow()
  })
})

describe('parseEventDraft', () => {
  it('成功时返回契约形状的 EventInsert', () => {
    const result = parseEventDraft('health', 'sleep', SLEEP_DRAFT)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.domain).toBe('health')
      expect(result.value.payload.duration_h).toBe(7.5)
      expect(result.value.source).toBe('manual')
    }
  })

  it('失败时给出可定位到 payload 子字段的错误', () => {
    const result = parseEventDraft('health', 'sleep', {
      ...SLEEP_DRAFT,
      payload: { duration_h: 'eight', quality: 'good' },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(Object.keys(result.errors).some((key) => key.startsWith('payload'))).toBe(true)
    }
  })

  it('ts 为空时报告 ts 错误', () => {
    const result = parseEventDraft('health', 'sleep', { ...SLEEP_DRAFT, ts: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.ts).toBeTruthy()
  })
})