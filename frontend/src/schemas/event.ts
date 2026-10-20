/**
 * 事件提交校验 —— 镜像 docs/cloudbase-contract.md §2 (events) 与 §3 (payload)。
 * 服务端校验/RLS 仍由 CloudBase + 云函数负责，前端只做提交前校验（计划 §6）。
 */
import { z } from 'zod'
import { DOMAINS, KING_LABELS, type Domain, type EventInsert, type JsonObject, type JsonValue } from '../types/contract'
import { getEventTypeSpec } from './payload'

/** timestamptz：必须携带时区，镜像后端 EventInput.timestamp_must_include_timezone */
export const isoTimestampSchema = z
  .string()
  .datetime({ offset: true, message: '时间必须是带时区的 ISO 8601 字符串' })

export const DEFAULT_SOURCE = 'manual'

/** 契约 §2：source NOT NULL（manual / wechat_sport / bank_csv ...） */
export const sourceSchema = z.string().min(1).max(128).default(DEFAULT_SOURCE)

/** 契约 §2：domain 五域枚举 */
export const domainSchema = z.enum(DOMAINS)

/** 契约 §2：type NOT NULL，长度对齐后端 Field(min_length=1, max_length=128) */
export const eventTypeSchema = z.string().min(1).max(128)

/**
 * 通用镜像 schema：字段名/枚举与 events 表逐项对齐。
 * payload 在这里只约束为"对象"，具体子结构由 eventSchemaFor(domain, type) 收紧。
 */
export const eventMirrorSchema = z.object({
  domain: domainSchema,
  type: eventTypeSchema,
  ts: isoTimestampSchema,
  payload: z.record(z.string(), z.unknown()),
  source: sourceSchema,
})

export type EventDraftInput = z.input<typeof eventMirrorSchema>

/**
 * 按 domain + type 生成强校验 schema：payload 用该 type 的字段 schema 严格校验。
 */
export function eventSchemaFor(domain: Domain, type: string) {
  const spec = getEventTypeSpec(domain, type)
  if (!spec) {
    throw new Error(`${KING_LABELS[domain]} 域不支持事件类型 "${type}"`)
  }
  return z.object({
    domain: z.literal(domain),
    type: z.literal(type),
    ts: isoTimestampSchema,
    payload: spec.schema,
    source: sourceSchema,
  })
}

export interface ParseSuccess {
  ok: true
  value: EventInsert
}

export interface ParseFailure {
  ok: false
  /** 字段路径 → 错误信息，便于表单逐项标红 */
  errors: Record<string, string>
}

export type ParseResult = ParseSuccess | ParseFailure

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
      return true
    case 'object': {
      if (Array.isArray(value)) return value.every(isJsonValue)
      return Object.values(value as Record<string, unknown>).every(isJsonValue)
    }
    default:
      return false
  }
}

function toJsonObject(value: Record<string, unknown>): JsonObject | null {
  const entries = Object.entries(value)
  if (!entries.every(([, v]) => isJsonValue(v))) return null
  return Object.fromEntries(entries) as JsonObject
}

/** 提交前解析：成功返回契约形状的 EventInsert，失败返回逐字段错误 */
export function parseEventDraft(domain: Domain, type: string, draft: unknown): ParseResult {
  const schema = eventSchemaFor(domain, type)
  const result = schema.safeParse(draft)
  if (!result.success) {
    const errors: Record<string, string> = {}
    for (const issue of result.error.issues) {
      const path = issue.path.join('.') || 'root'
      if (!errors[path]) errors[path] = issue.message
    }
    return { ok: false, errors }
  }

  const payload = toJsonObject(result.data.payload)
  if (!payload) {
    return { ok: false, errors: { payload: 'payload 必须是可序列化为 JSON 的对象' } }
  }

  return {
    ok: true,
    value: {
      domain: result.data.domain,
      type: result.data.type,
      ts: result.data.ts,
      payload,
      source: result.data.source,
    },
  }
}