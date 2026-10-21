/**
 * 各域 type 与 payload 子结构 —— 镜像 docs/cloudbase-contract.md v1.4 §3（三王）。
 *
 * 同一份 FIELD 描述同时驱动：
 *   1) Zod 校验（提交前）  2) 录入页动态表单渲染
 * 因此表单与校验不可能漂移。
 */
import { z } from 'zod'
import type { Domain } from '../types/contract'

export type FieldKind = 'number' | 'text' | 'boolean' | 'enum'

export interface FieldSpec {
  key: string
  label: string
  kind: FieldKind
  unit?: string
  min?: number
  max?: number
  integer?: boolean
  options?: readonly string[]
  /** 契约中标注 `?` 的字段（如 date.spend_yuan?、stage.note?） */
  optional?: boolean
  /** 枚举项中文展示 */
  optionLabels?: Readonly<Record<string, string>>
}

export interface EventTypeSpec {
  type: string
  label: string
  fields: readonly FieldSpec[]
  schema: z.ZodType<Record<string, unknown>>
}

function fieldSchema(field: FieldSpec): z.ZodTypeAny {
  let base: z.ZodTypeAny
  switch (field.kind) {
    case 'number': {
      let n = z.number({ invalid_type_error: '请输入数字' }).finite()
      if (typeof field.min === 'number') n = n.min(field.min)
      if (typeof field.max === 'number') n = n.max(field.max)
      if (field.integer) n = n.int()
      base = n
      break
    }
    case 'boolean':
      base = z.boolean()
      break
    case 'enum': {
      const options = field.options
      if (!options || options.length === 0) {
        throw new Error(`enum 字段 ${field.key} 缺少 options`)
      }
      base = z.enum(options as unknown as [string, ...string[]])
      break
    }
    case 'text':
    default:
      base = z.string().min(1).max(128)
      break
  }
  return field.optional ? base.optional() : base
}

/**
 * 由 FIELD 描述生成 payload schema。
 * .strict() 对齐后端 EventInput(extra="forbid")，避免拼错字段静默入库。
 */
export function buildPayloadSchema(fields: readonly FieldSpec[]): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const field of fields) {
    shape[field.key] = fieldSchema(field)
  }
  return z.object(shape).strict() as unknown as z.ZodType<Record<string, unknown>>
}

function defineType(
  type: string,
  label: string,
  fields: readonly FieldSpec[],
  refine?: (schema: z.ZodType<Record<string, unknown>>) => z.ZodType<Record<string, unknown>>,
): EventTypeSpec {
  const base = buildPayloadSchema(fields)
  return { type, label, fields, schema: refine ? refine(base) : base }
}


/* ───────────────────────── health（薄肌王）───────────────────────── */
/** 契约 v1.5 §3：water{ml} / sleep{duration_h,quality} / workout{type,duration_min,calorie} / body_sense{waist_cm?,feel?,note?} */
const HEALTH: readonly EventTypeSpec[] = [
  defineType('water', '喝大水', [{ key: 'ml', label: '饮水量', kind: 'number', unit: 'ml', min: 0, integer: true }]),
  defineType('sleep', '睡大觉', [
    { key: 'duration_h', label: '睡眠时长', kind: 'number', unit: '小时', min: 0, max: 24 },
    // 契约只规定字段名 quality，未冻结枚举 → 前端取最小语义集，待 PO 确认
    { key: 'quality', label: '睡眠质量', kind: 'enum', options: ['poor', 'fair', 'good', 'great'], optionLabels: { poor: '差', fair: '一般', good: '好', great: '极好' } },
  ]),
  defineType(
    'body_sense',
    '体感/围度',
    [
      { key: 'waist_cm', label: '围度', kind: 'number', unit: 'cm', min: 1, max: 300, optional: true },
      {
        key: 'feel',
        label: '体感',
        kind: 'enum',
        options: ['great', 'ok', 'tired'],
        optionLabels: { great: '很好', ok: '一般', tired: '疲惫' },
        optional: true,
      },
      { key: 'note', label: '备注（可选）', kind: 'text', optional: true },
    ],
    // 契约三个字段都可空，但空记录没有意义 → 客户端要求"体感与围度至少填一项"
    (schema) =>
      schema.refine((value) => value.waist_cm !== undefined || value.feel !== undefined, {
        message: '体感与围度至少填一项',
      }) as z.ZodType<Record<string, unknown>>,
  ),
  defineType('workout', '练薄肌', [
    { key: 'type', label: '训练类型', kind: 'text' },
    { key: 'duration_min', label: '训练时长', kind: 'number', unit: '分钟', min: 0, integer: true },
    { key: 'calorie', label: '消耗', kind: 'number', unit: '千卡', min: 0 },
  ]),
]

/* ───────────────────────── work（力王）───────────────────────── */
/** 契约 §3：work_log{hours,wage,salary,commute_min} */
const WORK: readonly EventTypeSpec[] = [
  defineType('work_log', '力王打卡', [
    { key: 'hours', label: '工作时长', kind: 'number', unit: '小时', min: 0, max: 24 },
    { key: 'wage', label: '本次收入', kind: 'number', unit: '元', min: 0 },
    // 月薪是常量，逐条重复录入摩擦高 → 设为可选；缺失时评分用 wage 周聚合
    { key: 'salary', label: '月薪（可选）', kind: 'number', unit: '元', min: 0, optional: true },
    { key: 'commute_min', label: '通勤时长', kind: 'number', unit: '分钟', min: 0, integer: true },
  ]),
]

/* ───────────────────────── dating（黄毛王）───────────────────────── */
/** 契约 §3：approach / date / chat / stage 四类热点 */
const DATING: readonly EventTypeSpec[] = [
  defineType('approach', '主动搭讪', [
    { key: 'count', label: '次数', kind: 'number', min: 1, integer: true },
    { key: 'channel', label: '渠道', kind: 'enum', options: ['online', 'offline', 'social'], optionLabels: { online: '线上', offline: '线下', social: '社交' } },
    { key: 'got_response', label: '获得正向回应', kind: 'boolean' },
  ]),
  defineType('date', '约会', [
    { key: 'count', label: '次数', kind: 'number', min: 1, integer: true },
    { key: 'duration_min', label: '时长', kind: 'number', unit: '分钟', min: 0, integer: true },
    { key: 'mood', label: '氛围', kind: 'enum', options: ['great', 'ok', 'awkward'], optionLabels: { great: '开心', ok: '平淡', awkward: '尴尬' } },
    { key: 'spend_yuan', label: '花费（可选）', kind: 'number', unit: '元', min: 0, optional: true },
  ]),
  defineType('chat', '聊天', [
    { key: 'duration_min', label: '时长', kind: 'number', unit: '分钟', min: 0, integer: true },
    { key: 'platform', label: '平台', kind: 'enum', options: ['wechat', 'app', 'phone', 'face'], optionLabels: { wechat: '微信', app: 'App', phone: '电话', face: '当面' } },
    { key: 'initiator', label: '发起方', kind: 'enum', options: ['me', 'them', 'both'], optionLabels: { me: '我', them: '对方', both: '互动' } },
  ]),
  defineType('stage', '脱单进度', [
    { key: 'stage', label: '阶段', kind: 'number', min: 0, max: 5, integer: true },
    {
      key: 'label',
      label: '阶段标签',
      kind: 'enum',
      options: ['solo', 'talking', 'ambiguous', 'dating_steady', 'exclusive', 'in_love'],
      optionLabels: {
        solo: '母胎solo',
        talking: '有接触',
        ambiguous: '暧昧中',
        dating_steady: '稳定约会',
        exclusive: '确定关系',
        in_love: '恋爱中',
      },
    },
    { key: 'note', label: '备注（可选）', kind: 'text', optional: true },
  ]),
]

export const EVENT_TYPES: Readonly<Record<Domain, readonly EventTypeSpec[]>> = {
  health: HEALTH,
  work: WORK,
  dating: DATING,
}

/** 阶段数值 → 中文（产品定义 §4 阶段定义） */
export const STAGE_LABELS: Readonly<Record<number, string>> = {
  0: '母胎solo',
  1: '有接触',
  2: '暧昧中',
  3: '稳定约会',
  4: '确定关系',
  5: '恋爱中',
}

export function getEventTypeSpec(domain: Domain, type: string): EventTypeSpec | undefined {
  return EVENT_TYPES[domain].find((spec) => spec.type === type)
}