/**
 * /entry —— 三王动态打卡（契约 §2/§3）。
 *
 * 表单字段来自 schemas/payload.ts 的 FIELD 注册表，与 Zod 校验共用同一份定义，
 * 因此"能填的字段"与"能过的校验"永远一致。
 *
 * 写入路由见 services/events.ts：
 *   health / dating → recordEvent 云函数（payload 敏感，服务端加解密）
 *   work            → cloud.rdb()
 * 打卡成功后顺带发漏斗埋点（模块 6，零额外摩擦）。
 */
import { Button, Input, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useMemo, useState } from 'react'
import { EVENT_TYPES, getEventTypeSpec, type FieldSpec } from '../../schemas/payload'
import { DEFAULT_SOURCE } from '../../schemas/event'
import {
  SPEND_CATEGORIES,
  SPEND_CATEGORY_LABELS,
  spendingSchema,
  type SpendCategory,
} from '../../schemas/spending'
import { isCloudFunctionConfigured } from '../../services/events'
import { plansForSpending } from '../../services/tracking'
import { DOMAINS, KING_LABELS, isSensitiveDomain, type Domain } from '../../types/contract'
import { useEventStore } from '../../stores/eventStore'
import { useAnalyticsStore } from '../../stores/analyticsStore'
import { KING_COLORS } from '../../styles/kings'
import { fromLocalInput, toLocalInputValue } from '../../utils/datetime'
import { ensureAuthenticated } from '../../utils/guard'

import './index.scss'

type FieldValue = string | boolean

function firstTypeOf(domain: Domain): string {
  const spec = EVENT_TYPES[domain][0]
  return spec ? spec.type : ''
}

function buildPayload(fields: readonly FieldSpec[], values: Record<string, FieldValue>): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const field of fields) {
    const raw = values[field.key]
    if (field.optional && (raw === undefined || raw === '')) {
      continue
    }
    if (field.kind === 'number') {
      // 空值保持 NaN，让 Zod 报"请输入数字"而不是静默变 0
      payload[field.key] = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN
    } else if (field.kind === 'boolean') {
      payload[field.key] = raw === true
    } else {
      payload[field.key] = typeof raw === 'string' ? raw.trim() : ''
    }
  }
  return payload
}

export default function EntryPage() {
  const [domain, setDomain] = useState<Domain>('health')
  const [type, setType] = useState<string>(firstTypeOf('health'))
  const [values, setValues] = useState<Record<string, FieldValue>>({})
  const [tsText, setTsText] = useState<string>(toLocalInputValue())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [via, setVia] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [spendCategory, setSpendCategory] = useState<SpendCategory>('hedonic')
  const [spendAmount, setSpendAmount] = useState('')
  const [spendError, setSpendError] = useState<string | null>(null)
  const [spendSaving, setSpendSaving] = useState(false)
  const submit = useEventStore((s) => s.submit)
  const refresh = useEventStore((s) => s.refresh)
  const track = useAnalyticsStore((s) => s.track)
  const trackPlans = useAnalyticsStore((s) => s.trackPlans)

  useDidShow(() => {
    void (async () => {
      if (await ensureAuthenticated()) {
        // 供埋点判定"首次打卡"与"综合打卡"，同时给看板一份最新数据
        await refresh()
      }
    })()
  })

  const spec = useMemo(() => getEventTypeSpec(domain, type), [domain, type])
  const sensitiveBlocked = isSensitiveDomain(domain) && !isCloudFunctionConfigured()

  const selectDomain = (next: Domain) => {
    setDomain(next)
    setType(firstTypeOf(next))
    setValues({})
    setErrors({})
    setVia(null)
    void track('view_king', 'product.activate', { domain: next })
  }

  const selectType = (next: string) => {
    setType(next)
    setValues({})
    setErrors({})
    setVia(null)
  }

  const setField = (key: string, value: FieldValue) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const fieldError = (key: string): string | undefined => errors[`payload.${key}`] ?? errors[key]

  const handleSubmit = async () => {
    if (!spec || sensitiveBlocked || submitting) return
    setSubmitting(true)
    setErrors({})
    setVia(null)
    try {
      const result = await submit(domain, type, {
        domain,
        type,
        ts: fromLocalInput(tsText) ?? tsText,
        payload: buildPayload(spec.fields, values),
        source: DEFAULT_SOURCE,
      })
      if (result.ok) {
        setValues({})
        setVia(result.via)
        await Taro.showToast({ title: '记下了', icon: 'success' })
      } else {
        setErrors(result.errors)
      }
    } finally {
      setSubmitting(false)
    }
  }

  /** 力王支出：只发 log_spending 埋点（契约 §8），不写 events 表 */
  const handleSpending = async () => {
    const parsed = spendingSchema.safeParse({
      category: spendCategory,
      amount: Number(spendAmount),
    })
    if (!parsed.success) {
      setSpendError('金额需要是大于 0 的数字')
      return
    }
    setSpendSaving(true)
    setSpendError(null)
    try {
      await trackPlans(plansForSpending(parsed.data))
      setSpendAmount('')
      await Taro.showToast({ title: '已记支出', icon: 'success' })
    } finally {
      setSpendSaving(false)
    }
  }

  return (
    <View className="entry">
      <View className="entry__kings">
        {DOMAINS.map((d) => (
          <View
            key={d}
            className={`entry__king ${d === domain ? 'entry__king--active' : ''}`}
            style={{ background: d === domain ? KING_COLORS[d] : '#FFFFFF' }}
            onClick={() => selectDomain(d)}
          >
            <Text>{KING_LABELS[d]}</Text>
          </View>
        ))}
      </View>

      <View className="entry__panel">
        <Text className="entry__label">练什么</Text>
        <View className="entry__chips">
          {EVENT_TYPES[domain].map((item) => (
            <View
              key={item.type}
              className={`entry__chip ${item.type === type ? 'entry__chip--on' : ''}`}
              style={item.type === type ? { background: KING_COLORS[domain] } : undefined}
              onClick={() => selectType(item.type)}
            >
              <Text>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {sensitiveBlocked && (
        <View className="entry__warn">
          <Text className="entry__warnTitle">这条暂时记不了</Text>
          <Text className="entry__warnText">
            {KING_LABELS[domain]}的明细属敏感数据，契约要求经 recordEvent 云函数加密写入。
            该云函数尚在云端联调、端点未配置，所以先别提交明文。换「力王」可以先玩起来。
          </Text>
        </View>
      )}

      {spec && (
        <View className="entry__form">
          {spec.fields.map((field) => (
            <View className="entry__field" key={field.key}>
              <Text className="entry__fieldLabel">
                {field.label}
                {field.unit ? ` / ${field.unit}` : ''}
                {field.optional ? '（可空）' : ''}
              </Text>

              {field.kind === 'enum' && (
                <View className="entry__chips">
                  {(field.options ?? []).map((option) => (
                    <View
                      key={option}
                      className={`entry__chip ${values[field.key] === option ? 'entry__chip--on' : ''}`}
                      style={values[field.key] === option ? { background: KING_COLORS[domain] } : undefined}
                      onClick={() => setField(field.key, option)}
                    >
                      <Text>{field.optionLabels?.[option] ?? option}</Text>
                    </View>
                  ))}
                </View>
              )}

              {field.kind === 'boolean' && (
                <View className="entry__chips">
                  {[true, false].map((option) => (
                    <View
                      key={String(option)}
                      className={`entry__chip ${values[field.key] === option ? 'entry__chip--on' : ''}`}
                      style={values[field.key] === option ? { background: KING_COLORS[domain] } : undefined}
                      onClick={() => setField(field.key, option)}
                    >
                      <Text>{option ? '有' : '没有'}</Text>
                    </View>
                  ))}
                </View>
              )}

              {(field.kind === 'number' || field.kind === 'text') && (
                <Input
                  className="entry__input"
                  type={field.kind === 'number' ? 'digit' : 'text'}
                  value={typeof values[field.key] === 'string' ? (values[field.key] as string) : ''}
                  placeholder={field.kind === 'number' ? '数字' : '写点什么'}
                  onInput={(e) => setField(field.key, e.detail.value)}
                />
              )}

              {fieldError(field.key) && <Text className="entry__error">{fieldError(field.key)}</Text>}
            </View>
          ))}

          <View className="entry__field">
            <Text className="entry__fieldLabel">什么时候</Text>
            <Input className="entry__input" value={tsText} onInput={(e) => setTsText(e.detail.value)} />
            {errors.ts && <Text className="entry__error">{errors.ts}</Text>}
          </View>

          {errors.root && <Text className="entry__error">{errors.root}</Text>}
          {via && (
            <Text className="entry__ok">
              已入账 · {via === 'rdb' ? 'cloud.rdb() 直写' : 'recordEvent 云函数加密'}
            </Text>
          )}

          <Button
            className="entry__submit"
            style={{ background: KING_COLORS[domain] }}
            loading={submitting}
            disabled={submitting || sensitiveBlocked}
            onClick={handleSubmit}
          >
            {submitting ? '提交中…' : '记下这一笔'}
          </Button>
        </View>
      )}

      {domain === 'work' && (
        <View className="entry__spend">
          <Text className="entry__spendTitle">记一笔支出</Text>
          <Text className="entry__spendNote">力王的「消费」步，按契约 §8 只记行为事件。</Text>
          <View className="entry__chips">
            {SPEND_CATEGORIES.map((category) => (
              <View
                key={category}
                className={`entry__chip ${spendCategory === category ? 'entry__chip--on' : ''}`}
                style={spendCategory === category ? { background: KING_COLORS.work } : undefined}
                onClick={() => setSpendCategory(category)}
              >
                <Text>{SPEND_CATEGORY_LABELS[category]}</Text>
              </View>
            ))}
          </View>
          <Input
            className="entry__input"
            type="digit"
            value={spendAmount}
            placeholder="金额（元）"
            onInput={(e) => setSpendAmount(e.detail.value)}
          />
          {spendError && <Text className="entry__error">{spendError}</Text>}
          <Button
            className="entry__submit"
            style={{ background: KING_COLORS.work }}
            loading={spendSaving}
            onClick={handleSpending}
          >
            {spendSaving ? '记录中…' : '记下这笔支出'}
          </Button>
        </View>
      )}
    </View>
  )
}