/**
 * /dashboard —— 三王评分 + 概览 + 近期记录。
 *
 * 评分：模块 5 的规则引擎（客户端算、不调 LLM，产品定义 §5）。
 * 数据：work 走 cloud.rdb()；health/dating 只能走 listEvents 云函数，
 *       端点未配置时明确提示并标注"未计入"，绝不展示假数据。
 */
import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import TierBadge from '../../components/TierBadge'
import { useAnalyticsStore } from '../../stores/analyticsStore'
import { usePlanStore } from '../../stores/planStore'
import { useAuthStore } from '../../stores/authStore'
import { useEventStore } from '../../stores/eventStore'
import { getEventTypeSpec } from '../../schemas/payload'
import { KING_COLORS } from '../../styles/kings'
import { DOMAINS, KING_LABELS, type Domain } from '../../types/contract'
import { restoreSession } from '../../utils/guard'

import '../../components/index.scss'
import './index.scss'

function formatTs(ts: string): string {
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ts
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function DashboardPage() {
  const scores = useAnalyticsStore((s) => s.scores)
  const goalsByStatus = useAnalyticsStore((s) => s.goalsByStatus)
  const recent = useAnalyticsStore((s) => s.recent)
  const unavailableDomains = useAnalyticsStore((s) => s.unavailableDomains)
  const loading = useAnalyticsStore((s) => s.loading)
  const error = useAnalyticsStore((s) => s.error)
  const refresh = useAnalyticsStore((s) => s.refresh)
  const experience = useAnalyticsStore((s) => s.experience)
  const plans = usePlanStore((s) => s.plans)
  const loadPlans = usePlanStore((s) => s.load)
  const refreshExperience = useAnalyticsStore((s) => s.refreshExperience)
  const [expanded, setExpanded] = useState<Domain | null>(null)
  /** 审核整改：游客可浏览（未登录显示横幅，数据为空态） */
  const [authed, setAuthed] = useState(() => useAuthStore.getState().status === 'authenticated')

  useDidShow(() => {
    void (async () => {
      const ok = await restoreSession()
      setAuthed(ok)
      if (ok) {
        await refresh()
        await refreshExperience()
        await loadPlans()
        await useEventStore.getState().refresh()
      }
    })()
  })

  const latestPlan = plans[0]

  return (
    <View className="dash">
      <View className="dash__head">
        <Text className="dash__title">三王战报</Text>
        <Button
          className="dash__link"
          size="mini"
          onClick={() => void Taro.navigateTo({ url: '/pages/funnel/index' })}
        >
          看漏斗 →
        </Button>
      </View>

      {unavailableDomains.length > 0 && (
        <View className="dash__warn">
          <Text className="dash__warnText">
            {unavailableDomains.map((d) => KING_LABELS[d]).join(' / ')}
            {' '}的明细要经 listEvents 云函数解密读取，端点还没配好 —— 这两王的评分暂按 0 计，不编数。
          </Text>
        </View>
      )}

      {!authed && (
        <View className="dash__guest">
          <Text className="dash__guestText">游客浏览中——登录后这里显示你的三王评分与近期记录。</Text>
          <Button
            className="dash__guestBtn"
            size="mini"
            onClick={() => void Taro.navigateTo({ url: '/pages/login/index' })}
          >
            去登录
          </Button>
        </View>
      )}

      {error && <Text className="dash__error">{error}</Text>}

      {DOMAINS.map((domain) => {
        const score = scores.find((item) => item.domain === domain)
        const weakest = score
          ? [...score.breakdown].sort((a, b) => a.ratio - b.ratio)[0]
          : undefined
        return (
          <View key={domain} className="dash__king" style={{ borderColor: 'var(--ink)' }}>
            <View className="dash__kingHead" style={{ background: KING_COLORS[domain] }}>
              <Text className="dash__kingName">{KING_LABELS[domain]}</Text>
              {score && <TierBadge tier={score.tier} score={score.score} />}
            </View>

            <View className="dash__kingBody">
              <View className="dash__metrics">
                {(score?.breakdown ?? []).map((item) => (
                  <View className="dash__metric" key={item.metric}>
                    <Text className="dash__metricLabel">{item.label}</Text>
                    <Text className="dash__metricValue">
                      {item.raw}
                      <Text className="dash__metricUnit">/{item.threshold}</Text>
                    </Text>
                    <View className="dash__bar">
                      <View
                        className="dash__barFill"
                        style={{
                          width: `${Math.round(item.ratio * 100)}%`,
                          background: KING_COLORS[domain],
                        }}
                      />
                    </View>
                  </View>
                ))}
              </View>

              {weakest && (
                <Text className="dash__weakest">
                  拖后腿：{weakest.label}（{weakest.raw}/{weakest.threshold}
                  {weakest.unit}）→ 先把这块补上
                </Text>
              )}

              <Text
                className="dash__toggle"
                onClick={() => setExpanded(expanded === domain ? null : domain)}
              >
                {expanded === domain ? '收起明细' : '展开明细'}
              </Text>

              {expanded === domain && (
                <View className="dash__detail">
                  {(score?.breakdown ?? []).map((item) => (
                    <Text className="dash__detailRow" key={item.metric}>
                      {item.label}：{Math.round(item.points)} 分（权重 {Math.round(item.weight * 100)}%，
                      阈值 {item.threshold}
                      {item.unit}
                      {item.reverse ? '，越低越优' : ''}）
                    </Text>
                  ))}
                  <Text className="dash__detailRow">
                    窗口：{formatTs(score?.windowStart ?? '')} ~ {formatTs(score?.windowEnd ?? '')}
                    ，样本 {score?.eventCount ?? 0} 条
                  </Text>
                </View>
              )}
            </View>
          </View>
        )
      })}

      <View className="dash__exp">
        <View className="dash__expHead">
          <Text className="dash__expTitle">体验</Text>
          <Text className="dash__expBadge">A7</Text>
        </View>
        {experience.loadSamples + experience.entrySamples === 0 ? (
          <Text className="dash__expEmpty">
            还没有体验样本。产生 app_open 与一次打卡后，这里会显示冷启动与打卡耗时。
          </Text>
        ) : (
          <View className="dash__expRows">
            <Text className="dash__expRow">
              冷启动 P50 {experience.loadP50 ?? '—'} ms · P95 {experience.loadP95 ?? '—'} ms（
              {experience.loadSamples} 样本）
            </Text>
            <Text className="dash__expRow">
              打卡完成时长中位数 {experience.entryMedian ?? '—'} ms（{experience.entrySamples} 样本）
            </Text>
          </View>
        )}
        <Text className="dash__expNote">
          时长记在既有事件的 payload 里（load_ms / entry_ms），不新增漏斗步（契约 §8 step 枚举已冻结）。
        </Text>
      </View>

      <View className="dash__ai">
        <View className="dash__aiHead">
          <Text className="dash__aiTitle">AI 意见</Text>
          <Text className="dash__aiBadge">{latestPlan ? '最新' : '尚未生成'}</Text>
        </View>
        <Text className="dash__aiText">
          {latestPlan && latestPlan.content
            ? `${latestPlan.content.summary}（${latestPlan.content.actions.length} 条行动 · 下一里程碑：${latestPlan.content.next_milestone}）`
            : '还没有方案。去「方案」页为某位王生成第一条：generatePlan 已标「已实现」，listPlans 未提供故列表走 cloud.rdb()。'}
        </Text>
      </View>

      <View className="dash__recent">
        <View className="dash__recentHead">
          <Text className="dash__recentTitle">近期记录</Text>
          <Button className="dash__refresh" size="mini" loading={loading} onClick={() => void refresh()}>
            刷新
          </Button>
        </View>

        <Text className="dash__goalLine">
          目标：进行中 {goalsByStatus.active} / 完成 {goalsByStatus.done} / 放弃 {goalsByStatus.dropped}
        </Text>

        {recent.length === 0 && !error && (
          <Text className="dash__empty">还没有记录。去「打卡」页记第一笔。</Text>
        )}

        {recent.map((event) => (
          <View className="dash__row" key={String(event.id)}>
            <View className="dash__rowLeft">
              <Text className="dash__rowKing" style={{ background: KING_COLORS[event.domain] }}>
                {KING_LABELS[event.domain]}
              </Text>
              <Text className="dash__rowType">{getEventTypeSpec(event.domain, event.type)?.label ?? event.type}</Text>
            </View>
            <Text className="dash__rowTs">{formatTs(event.ts)}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}