/**
 * /plans —— 行动方案（契约 §5 / §5.1）。
 *
 * generatePlan：契约标「已实现（E2E2 验证通过）」→ 真实调用。
 * listPlans：契约标「未提供云函数」→ 不调用，改经 cloud.rdb() 读 plans（非敏感、RLS 隔离）。
 * 内容按 §5.1 schema 解析；不符合格式时保留原始行并标注，不吞数据、不编造。
 */
import { Button, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { usePlanStore } from '../../stores/planStore'
import { KING_COLORS } from '../../styles/kings'
import { DOMAINS, KING_LABELS, type Domain } from '../../types/contract'
import { ensureAuthenticated } from '../../utils/guard'

import './index.scss'

const EFFORT_LABELS: Readonly<Record<string, string>> = {
  low: '容易',
  mid: '一般',
  high: '偏难',
}

function formatTs(ts: string): string {
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ts
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function PlansPage() {
  const plans = usePlanStore((s) => s.plans)
  const loading = usePlanStore((s) => s.loading)
  const generating = usePlanStore((s) => s.generating)
  const error = usePlanStore((s) => s.error)
  const load = usePlanStore((s) => s.load)
  const generate = usePlanStore((s) => s.generate)
  const [domain, setDomain] = useState<Domain>('work')

  useDidShow(() => {
    void (async () => {
      if (await ensureAuthenticated()) {
        await load()
      }
    })()
  })

  const handleGenerate = async () => {
    await generate(domain)
  }

  return (
    <View className="plans">
      <View className="plans__head">
        <Text className="plans__title">行动方案</Text>
        <Button className="plans__btn" size="mini" loading={loading} onClick={() => void load()}>
          刷新
        </Button>
      </View>

      <View className="plans__card">
        <Text className="plans__label">为哪位王生成方案</Text>
        <View className="plans__kings">
          {DOMAINS.map((item) => (
            <View
              key={item}
              className={`plans__king ${item === domain ? 'plans__king--on' : ''}`}
              style={item === domain ? { background: KING_COLORS[item] } : undefined}
              onClick={() => setDomain(item)}
            >
              <Text>{KING_LABELS[item]}</Text>
            </View>
          ))}
        </View>

        <Text className="plans__hint">
          基于最近 7 天该王的事件，由规则引擎算好 score/tier 后交给 LLM 生成 summary、actions 与
          next_milestone（契约 §5.1）。score 不由模型编造。
        </Text>

        <Button
          className="plans__generate"
          style={{ background: KING_COLORS[domain] }}
          loading={generating}
          disabled={generating}
          onClick={handleGenerate}
        >
          {generating ? '生成中…' : `为${KING_LABELS[domain]}生成方案`}
        </Button>

        {error && <Text className="plans__error">{error}</Text>}
      </View>

      {plans.length === 0 && !loading && (
        <View className="plans__empty">
          <Text className="plans__emptyText">
            还没有方案。选一位王，点上面的按钮生成第一条。
          </Text>
        </View>
      )}

      {plans.map(({ row, content }) => (
        <View className="plans__item" key={row.id}>
          <View className="plans__itemHead">
            <Text className="plans__itemTitle">{row.title}</Text>
            {content && (
              <Text className="plans__tier" style={{ background: KING_COLORS[content.domain] }}>
                {content.tier} · {content.score}
              </Text>
            )}
          </View>

          <Text className="plans__meta">
            {formatTs(row.created_at)} · {row.generated_by}
          </Text>

          {content ? (
            <>
              <Text className="plans__summary">{content.summary}</Text>
              <View className="plans__actions">
                {content.actions.map((action) => (
                  <View className="plans__action" key={`${row.id}-${action.title}`}>
                    <Text className="plans__actionTitle">
                      ▍{action.title}
                      <Text className="plans__effort">（{EFFORT_LABELS[action.effort] ?? action.effort}）</Text>
                    </Text>
                    <Text className="plans__actionWhy">{action.why}</Text>
                  </View>
                ))}
              </View>
              <Text className="plans__milestone">下一里程碑：{content.next_milestone}</Text>
            </>
          ) : (
            <Text className="plans__bad">
              该方案内容不符合契约 §5.1 结构，已保留原始记录但不渲染（疑似模型输出格式异常）。
            </Text>
          )}
        </View>
      ))}

      <Text className="plans__foot">
        listPlans 云函数尚未提供（契约 §5 标注），列表改为经 cloud.rdb() 读 plans 表；plans 非敏感、受 RLS 隔离。
      </Text>
    </View>
  )
}