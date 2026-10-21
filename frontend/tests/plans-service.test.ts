import { describe, expect, it, vi } from 'vitest'
import type { RdbClient, RdbQuery, RdbResult } from '../src/services/cloudbase'
import type { PlanRow } from '../src/types/contract'

const h = vi.hoisted(() => ({ call: vi.fn(), from: vi.fn() }))

vi.mock('../src/services/events', () => ({ callHttpFunction: h.call }))
vi.mock('../src/services/cloudbase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/cloudbase')>()
  return { ...actual, getRdb: () => ({ from: h.from }) as unknown as RdbClient }
})

const { generatePlanRemote, selectPlans, toPlanViews } = await import('../src/services/plans')
const { parsePlanContent } = await import('../src/schemas/plan')

class FakeQuery<T> implements RdbQuery<T> {
  readonly calls: string[] = []
  constructor(private readonly result: RdbResult<T>) {}
  private rec(m: string): this { this.calls.push(m); return this }
  select(): RdbQuery<T> { return this.rec('select') }
  insert(): RdbQuery<T> { return this.rec('insert') }
  upsert(): RdbQuery<T> { return this.rec('upsert') }
  update(): RdbQuery<T> { return this.rec('update') }
  delete(): RdbQuery<T> { return this.rec('delete') }
  eq(): RdbQuery<T> { return this.rec('eq') }
  in(): RdbQuery<T> { return this.rec('in') }
  gte(): RdbQuery<T> { return this.rec('gte') }
  lte(): RdbQuery<T> { return this.rec('lte') }
  order(): RdbQuery<T> { return this.rec('order') }
  limit(): RdbQuery<T> { return this.rec('limit') }
  single(): PromiseLike<{ data: T | null; error: RdbResult<T>['error'] }> {
    return Promise.resolve({ data: null, error: this.result.error })
  }
  then<R1, R2>(
    ok?: ((v: RdbResult<T>) => R1 | PromiseLike<R1>) | null,
    err?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.result).then(ok, err)
  }
}

const CONTENT = {
  domain: 'work',
  score: 72,
  tier: '荣耀黄金',
  summary: '本周专注度稳中有升',
  actions: [{ title: '把通勤砍到 30 分钟', why: '通勤反向指标拖分', effort: 'mid' }],
  next_milestone: '周收入稳定过线',
}

describe('plans.content 镜像契约 §5.1', () => {
  it('接受合法结构', () => {
    expect(parsePlanContent(CONTENT)).not.toBeNull()
  })

  it('缺少 actions / 非法 tier 时返回 null（页面不崩）', () => {
    expect(parsePlanContent({ ...CONTENT, actions: [] })).toBeNull()
    expect(parsePlanContent({ ...CONTENT, tier: '钻石' })).toBeNull()
    expect(parsePlanContent(null)).toBeNull()
  })

  it('容忍模型多给的字段（展示优先，不因多余键丢内容）', () => {
    const parsed = parsePlanContent({ ...CONTENT, extra_note: 'x' })
    expect(parsed?.summary).toBe(CONTENT.summary)
  })
})

describe('toPlanViews', () => {
  it('内容合法则解析，异常则保留行并标 null', () => {
    const base: PlanRow = {
      id: 'p1', user_id: 'u1', title: 't', generated_by: 'hy3',
      based_on: {}, content: {}, created_at: '2026-10-21T00:00:00.000Z',
    }
    const views = toPlanViews([
      { ...base, content: CONTENT as unknown as PlanRow['content'] },
      { ...base, id: 'p2', content: { broken: true } },
    ])
    expect(views[0]?.content?.tier).toBe('荣耀黄金')
    expect(views[1]?.content).toBeNull()
    expect(views[1]?.row.id).toBe('p2')
  })
})

describe('generatePlanRemote（已实现，契约 §5）', () => {
  it('based_on 只带 domain 与 range（后端 extra=forbid）', async () => {
    h.call.mockResolvedValue({ id: 99 })
    const range = { from: '2026-10-14T00:00:00.000Z', to: '2026-10-21T00:00:00.000Z' }

    const id = await generatePlanRemote({ domain: 'health', range })

    expect(id).toBe(99)
    expect(h.call).toHaveBeenCalledWith('generatePlan', {
      based_on: { domain: 'health', range },
    })
  })

  it('不传 range 时 based_on 只有 domain', async () => {
    h.call.mockResolvedValue({ id: 1 })
    await generatePlanRemote({ domain: 'work' })
    expect(h.call).toHaveBeenCalledWith('generatePlan', { based_on: { domain: 'work' } })
  })
})

describe('selectPlans（listPlans 未提供 → rdb）', () => {
  it('按 created_at 倒序查询 plans', async () => {
    const query = new FakeQuery<PlanRow>({ data: [], error: null })
    h.from.mockReturnValue(query)

    const rows = await selectPlans(5)

    expect(rows).toEqual([])
    expect(h.from).toHaveBeenCalledWith('plans')
    expect(query.calls).toEqual(['select', 'order', 'limit'])
  })
})