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
import { Button, Input, Slider, Text, View } from '@tarojs/components'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import { useMemo, useRef, useState } from 'react'
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
import { elapsedMs } from '../../services/perf'
import { DOMAINS, KING_LABELS, isSensitiveDomain, type Domain } from '../../types/contract'
import { useEventStore } from '../../stores/eventStore'
import { useAuthStore } from '../../stores/authStore'
import { useAnalyticsStore } from '../../stores/analyticsStore'
import { useDraftStore } from '../../stores/draftStore'
import { KING_COLORS } from '../../styles/kings'
import { fromLocalInput, toLocalInputValue } from '../../utils/datetime'
import { requireLogin, restoreSession } from '../../utils/guard'

import './index.scss'

type FieldValue = string | boolean | number

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
      // 必填拖条（如 suppression.score）未拖动时回落到 min，避免提交 NaN；
      // 可选拖条（如 body_sense.feel_score）留空则省略，保留"只填围度"的合法性
      if (field.control === 'slider' && raw === undefined && !field.optional) {
        payload[field.key] = field.min ?? 0
      } else if (typeof raw === 'number') {
        payload[field.key] = raw
      } else if (typeof raw === 'string' && raw.trim() !== '') {
        payload[field.key] = Number(raw)
      } else {
        payload[field.key] = Number.NaN
      }
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
  const shownAtRef = useRef(Date.now())
  const [spendCategory, setSpendCategory] = useState<SpendCategory>('hedonic')
  const [spendAmount, setSpendAmount] = useState('')
  const [spendError, setSpendError] = useState<string | null>(null)
  const [spendSaving, setSpendSaving] = useState(false)
  /** UX 优化 Task1：恢复草稿后短暂提示 */
  const [restored, setRestored] = useState(false)
  /** 审核整改：游客可浏览 —— 是否已登录（未登录渲染游客横幅） */
  const [authed, setAuthed] = useState(() => useAuthStore.getState().status === 'authenticated')
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const submit = useEventStore((s) => s.submit)
  const refresh = useEventStore((s) => s.refresh)
  const track = useAnalyticsStore((s) => s.track)
  const trackPlans = useAnalyticsStore((s) => s.trackPlans)
  const draftSave = useDraftStore((s) => s.save)
  const draftLoad = useDraftStore((s) => s.load)
  const draftClear = useDraftStore((s) => s.clear)

  /** 把当前表单状态存进草稿（不触发提交） */
  const persistDraft = (nextValues: Record<string, FieldValue>, nextTs: string) => {
    draftSave(domain, type, nextValues, nextTs)
  }

  const restoreDraft = (targetDomain: Domain, targetType: string) => {
    const entry = draftLoad(targetDomain, targetType)
    if (entry) {
      setValues(entry.values)
      setTsText(entry.tsText)
      setRestored(true)
      return true
    }
    setRestored(false)
    return false
  }

  useDidShow(() => {
    shownAtRef.current = Date.now()
    // 进入即尝试恢复上次未提交的草稿
    restoreDraft(domain, type)
    void (async () => {
      // 审核整改：只恢复登录态，不强制跳登录页（游客可浏览，提交时才引导登录）
      const ok = await restoreSession()
      setAuthed(ok)
      if (ok) {
        // 供埋点判定"首次打卡"与"综合打卡"，同时给看板一份最新数据
        await refresh()
      }
    })()
  })

  /** 离开页面兜底存一次草稿（防止"点进其他地方"丢数据） */
  useDidHide(() => {
    if (Object.keys(values).length > 0) {
      persistDraft(values, tsText)
    }
  })

  const spec = useMemo(() => getEventTypeSpec(domain, type), [domain, type])
  const sensitiveBlocked = isSensitiveDomain(domain) && !isCloudFunctionConfigured()

  const selectDomain = (next: Domain) => {
    // 切换王前先存当前草稿，再切到目标王并恢复其草稿
    if (Object.keys(values).length > 0) persistDraft(values, tsText)
    setDomain(next)
    setType(firstTypeOf(next))
    setValues({})
    setErrors({})
    setVia(null)
    setRestored(false)
    restoreDraft(next, firstTypeOf(next))
    void track('view_king', 'product.activate', { domain: next })
  }

  const selectType = (next: string) => {
    if (Object.keys(values).length > 0) persistDraft(values, tsText)
    setType(next)
    setValues({})
    setErrors({})
    setVia(null)
    setRestored(false)
    restoreDraft(domain, next)
  }

  const setField = (key: string, value: FieldValue) => {
    const next = { ...values, [key]: value }
    setValues(next)
    if (restored) setRestored(false)
    // 字段变动即存草稿（debounce，避免拖条拖动高频写盘）
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current)
    draftSaveTimer.current = setTimeout(() => persistDraft(next, tsText), 300)
  }

  const fieldError = (key: string): string | undefined => errors[`payload.${key}`] ?? errors[key]

  const handleSubmit = async () => {
    if (!spec || sensitiveBlocked || submitting) return
    // 审核整改：登录只挡在"真正写入"这一步，浏览/填表全程不强制
    if (!(await requireLogin('记录打卡'))) return
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
      }, { entryDurationMs: elapsedMs(shownAtRef.current) })
      if (result.ok) {
        setValues({})
        // 提交成功后清空该草稿（草稿仅用于"未提交"的防丢场景）
        draftClear(domain, type)
        setRestored(false)
        if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current)
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
    if (!(await requireLogin('记录支出'))) return
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
      {!authed && (
        <View className="entry__guest">
          <Text className="entry__guestText">
            游客浏览中——随便看随便填；提交时才需要登录，数据按账号隔离保存。
          </Text>
          <Button
            className="entry__guestBtn"
            size="mini"
            onClick={() => void Taro.navigateTo({ url: '/pages/login/index' })}
          >
            去登录
          </Button>
        </View>
      )}
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
          {restored && (
            <View className="entry__restored" onClick={() => setRestored(false)}>
              <Text className="entry__restoredText">已恢复上次未提交的草稿（点此忽略）</Text>
            </View>
          )}
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

              {field.control === 'slider' ? (
                <View className="entry__slider">
                  <Slider
                    min={field.min ?? 0}
                    max={field.max ?? 10}
                    step={field.integer ? 1 : 1}
                    value={
                      typeof values[field.key] === 'number'
                        ? (values[field.key] as number)
                        : (field.min ?? 0)
                    }
                    activeColor={KING_COLORS[domain]}
                    backgroundColor="#E6E6E6"
                    blockColor={KING_COLORS[domain]}
                    onChanging={(e) => setField(field.key, e.detail.value)}
                    onChange={(e) => setField(field.key, e.detail.value)}
                  />
                  <Text className="entry__sliderVal">
                    {typeof values[field.key] === 'number'
                      ? (values[field.key] as number)
                      : (field.min ?? 0)}
                    {field.unit ? ` ${field.unit}` : ''}
                    {field.lowerIsBetter ? '（越低越好）' : ''}
                  </Text>
                </View>
              ) : (field.kind === 'number' || field.kind === 'text') && (
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
          {Object.keys(values).length > 0 && !restored && (
            <Text className="entry__draft">草稿已自动保存（提交前不会写入云端）</Text>
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