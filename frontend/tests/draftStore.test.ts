import { beforeEach, describe, expect, it, vi } from 'vitest'

const mem = new Map<string, unknown>()
vi.mock('../src/utils/storage', () => ({
  storage: {
    get: (key: string) => (mem.has(key) ? (mem.get(key) as unknown) : null),
    set: (key: string, value: unknown) => {
      mem.set(key, value)
    },
    remove: (key: string) => {
      mem.delete(key)
    },
  },
}))

const { useDraftStore } = await import('../src/stores/draftStore')

describe('打卡草稿本地持久化（UX 优化 Task1）', () => {
  beforeEach(() => {
    mem.clear()
    useDraftStore.setState({ lastRestored: null })
  })

  it('save 后 load 可还原，且标记 lastRestored', () => {
    useDraftStore.getState().save('health', 'water', { ml: 500 }, '2026-10-20T08:00')
    expect(useDraftStore.getState().hasDraft('health', 'water')).toBe(true)

    const entry = useDraftStore.getState().load('health', 'water')
    expect(entry?.values).toEqual({ ml: 500 })
    expect(entry?.tsText).toBe('2026-10-20T08:00')
    expect(useDraftStore.getState().lastRestored).toMatchObject({ domain: 'health', type: 'water' })
  })

  it('空值草稿 load 返回 null', () => {
    const entry = useDraftStore.getState().load('work', 'work_log')
    expect(entry).toBeNull()
    expect(useDraftStore.getState().hasDraft('work', 'work_log')).toBe(false)
  })

  it('clear 后草稿消失', () => {
    useDraftStore.getState().save('health', 'sleep', { duration_h: 7.5 }, '2026-10-20T08:00')
    useDraftStore.getState().clear('health', 'sleep')
    expect(useDraftStore.getState().hasDraft('health', 'sleep')).toBe(false)
    expect(useDraftStore.getState().load('health', 'sleep')).toBeNull()
  })

  it('不同 domain:type 草稿互不影响', () => {
    useDraftStore.getState().save('health', 'water', { ml: 300 }, 't1')
    useDraftStore.getState().save('dating', 'date', { count: 2 }, 't2')
    expect(useDraftStore.getState().load('health', 'water')?.values).toEqual({ ml: 300 })
    expect(useDraftStore.getState().load('dating', 'date')?.values).toEqual({ count: 2 })
  })
})
