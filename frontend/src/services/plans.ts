/**
 * 行动方案（契约 §5 / §5.1）。
 *
 * - generatePlan：已实现（E2E2 验证通过）→ 允许真实调用；返回新方案 id。
 * - listPlans：契约标注「未提供云函数」→ 不调用；改为经 cloud.rdb() 读 plans 表
 *   （plans 非敏感，受 RLS 按 user_id 隔离；§5 注仅限制 health/dating 的 *events* payload）。
 */
import { callHttpFunction } from './events'
import { getRdb } from './cloudbase'
import { CloudbaseQueryError } from './cloudbase'
import type { BigIntId, Domain, PlanRow } from '../types/contract'
import type { JsonObject } from '../types/contract'
import { parsePlanContent, type PlanContent } from '../schemas/plan'

export interface GeneratePlanInput {
  domain: Domain
  range?: { from: string; to: string }
}

/** 调 generatePlan 云函数，返回新方案 id */
export async function generatePlanRemote(input: GeneratePlanInput): Promise<BigIntId> {
  const basedOn: JsonObject = { domain: input.domain }
  if (input.range) {
    basedOn.range = { from: input.range.from, to: input.range.to }
  }
  const result = await callHttpFunction<{ id: BigIntId }>('generatePlan', { based_on: basedOn })
  return result.id
}

const PLAN_COLUMNS = 'id,user_id,title,generated_by,based_on,content,created_at'

/** 读 plans（按生成时间倒序）；内容用 §5.1 schema 解析，异常内容不丢行 */
export async function selectPlans(limit = 20): Promise<PlanRow[]> {
  const { data, error } = await getRdb()
    .from<PlanRow>('plans')
    .select(PLAN_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new CloudbaseQueryError(error.message ?? '查询 plans 失败', error.code)
  return data ?? []
}

export interface PlanView {
  row: PlanRow
  content: PlanContent | null
}

/** 合并行与解析后的内容，供页面直接渲染 */
export function toPlanViews(rows: readonly PlanRow[]): PlanView[] {
  return rows.map((row) => ({ row, content: parsePlanContent(row.content) }))
}