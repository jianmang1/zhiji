import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RdbClient, RdbQuery, RdbResult } from '../src/services/cloudbase'
import { CloudbaseQueryError } from '../src/services/cloudbase'

/** 可链式调用的假 RdbQuery：记录调用参数并按预设结果解析 */
class FakeQuery<T> implements RdbQuery<T> {
  readonly calls: { method: string; args: unknown[] }[] = []

  constructor(
    private readonly result: RdbResult<T>,
    private readonly singleValue?: T | null,
  ) {}

  private record(method: string, args: unknown[]): this {
    this.calls.push({ method, args })
    return this
  }

  select(columns?: string): RdbQuery<T> {
    return this.record('select', [columns])
  }
  insert(values: unknown): RdbQuery<T> {
    return this.record('insert', [values])
  }
  update(values: unknown): RdbQuery<T> {
    return this.record('update', [values])
  }
  upsert(values: unknown, options?: unknown): RdbQuery<T> {
    return this.record('upsert', [values, options])
  }
  delete(): RdbQuery<T> {
    return this.record('delete', [])
  }
  eq(column: string, value: unknown): RdbQuery<T> {
    return this.record('eq', [column, value])
  }
  in(column: string, values: readonly unknown[]): RdbQuery<T> {
    return this.record('in', [column, values])
  }
  gte(column: string, value: unknown): RdbQuery<T> {
    return this.record('gte', [column, value])
  }
  lte(column: string, value: unknown): RdbQuery<T> {
    return this.record('lte', [column, value])
  }
  order(column: string, options?: unknown): RdbQuery<T> {
    return this.record('order', [column, options])
  }
  limit(count: number): RdbQuery<T> {
    return this.record('limit', [count])
  }

  single(): PromiseLike<{ data: T | null; error: RdbResult<T>['error'] }> {
    return Promise.resolve({ data: this.singleValue ?? null, error: this.result.error })
  }

  then<R1, R2>(
    onfulfilled?: ((value: RdbResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected)
  }
}

const h = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('../src/services/cloudbase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/cloudbase')>()
  const client: Pick<RdbClient, 'from'> = { from: h.from }
  return { ...actual, getRdb: () => client as RdbClient }
})

const rdb = await import('../src/services/rdb')

function prime<T>(result: RdbResult<T>, single?: T | null): FakeQuery<T> {
  const query = new FakeQuery<T>(result, single)
  h.from.mockReturnValue(query)
  return query
}

describe('rdb 仓储层', () => {
  beforeEach(() => h.from.mockReset())

  it('selectEventsByDomains：按域 in + ts 倒序 + limit', async () => {
    const query = prime<{ id: number }>({ data: [{ id: 1 }], error: null })

    const rows = await rdb.selectEventsByDomains(['work'], 50)

    expect(rows).toEqual([{ id: 1 }])
    expect(h.from).toHaveBeenCalledWith('events')
    expect(query.calls.map((c) => c.method)).toContain('in')
    expect(query.calls.find((c) => c.method === 'in')?.args).toEqual(['domain', ['work']])
    expect(query.calls.find((c) => c.method === 'order')?.args).toEqual([
      'ts',
      { ascending: false },
    ])
    expect(query.calls.find((c) => c.method === 'limit')?.args).toEqual([50])
  })

  it('selectEventsByDomains：error 归一为 CloudbaseQueryError', async () => {
    prime({ data: null, error: { message: 'permission denied', code: '42501' } })
    await expect(rdb.selectEventsByDomains(['work'])).rejects.toBeInstanceOf(CloudbaseQueryError)
  })

  it('insertEvent：返回自增 id；缺 id 时抛错', async () => {
    prime({ data: null, error: null }, { id: 99 })
    await expect(rdb.insertEvent({ domain: 'work', type: 'work_log', ts: '2026-10-20T00:00:00.000Z', payload: {}, source: 'manual', user_id: 'u-1' })).resolves.toBe(99)

    prime({ data: null, error: null }, null)
    await expect(rdb.insertEvent({ domain: 'work', type: 'work_log', ts: '2026-10-20T00:00:00.000Z', payload: {}, source: 'manual', user_id: 'u-1' })).rejects.toBeInstanceOf(CloudbaseQueryError)
  })

  it('selectGoals：created_at 倒序', async () => {
    const query = prime<{ id: string }>({ data: [], error: null })
    await rdb.selectGoals(10)
    expect(h.from).toHaveBeenCalledWith('goals')
    expect(query.calls.find((c) => c.method === 'order')?.args).toEqual([
      'created_at',
      { ascending: false },
    ])
  })

  it('insertAnalyticsEvent / selectAnalyticsEvents 走 analytics_events 表', async () => {
    prime({ data: null, error: null }, { id: 1 })
    await expect(
      rdb.insertAnalyticsEvent({ user_id: 'u-1', name: 'app_open', step: 'product.acquire' }),
    ).resolves.toBe(1)
    expect(h.from).toHaveBeenCalledWith('analytics_events')

    prime({ data: [], error: null })
    await expect(rdb.selectAnalyticsEvents(10)).resolves.toEqual([])
  })

  it('selectProfile：无行时返回 null；upsertProfile 以 user_id 冲突键写入', async () => {
    prime<{ user_id: string }>({ data: [], error: null })
    await expect(rdb.selectProfile('u-1')).resolves.toBeNull()

    const query = prime<{ user_id: string }>({ data: null, error: null })
    await rdb.upsertProfile({ user_id: 'u-1', user_type: 'new', acquire_channel: 'organic' })
    expect(h.from).toHaveBeenCalledWith('profiles')
    expect(query.calls.find((c) => c.method === 'upsert')?.args[1]).toEqual({ onConflict: 'user_id' })
  })
})