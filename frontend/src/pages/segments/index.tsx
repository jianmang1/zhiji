/**
 * /segments —— 分群运营看板（A8）。
 *
 * 契约 §8 的三个分群维度 channel / region / user_type；
 * 数据来自 analytics_events（与 /funnel 同源），纯前端聚合。
 * v1 为单用户，分群值来自 profiles 回填与埋点字段；缺值为「(未标注)」，不臆造。
 */
import { Button, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import {
  SEGMENT_DIMENSIONS,
  SEGMENT_DIMENSION_LABELS,
  summarizeSegments,
  type SegmentDimension,
} from '../../services/segments'
import { useAnalyticsStore } from '../../stores/analyticsStore'
import { KING_COLORS } from '../../styles/kings'
import { DOMAINS, KING_LABELS } from '../../types/contract'
import { ensureAuthenticated } from '../../utils/guard'

import './index.scss'

export default function SegmentsPage() {
  const analyticsEvents = useAnalyticsStore((s) => s.analyticsEvents)
  const refreshFunnel = useAnalyticsStore((s) => s.refreshFunnel)
  const loading = useAnalyticsStore((s) => s.funnelLoading)
  const [dimension, setDimension] = useState<SegmentDimension>('channel')

  useDidShow(() => {
    void (async () => {
      if (await ensureAuthenticated()) {
        await refreshFunnel()
      }
    })()
  })

  useEffect(() => {
    // 首次进入若还没有埋点数据，主动拉一次（refreshFunnel 会写 analyticsEvents）
    if (analyticsEvents.length === 0) {
      void refreshFunnel()
    }
  }, [analyticsEvents.length, refreshFunnel])

  const rows = useMemo(
    () => summarizeSegments(analyticsEvents, dimension),
    [analyticsEvents, dimension],
  )
  const maxEvents = rows.length > 0 ? rows[0]?.events ?? 0 : 0

  return (
    <View className="seg">
      <View className="seg__head">
        <Text className="seg__title">分群运营</Text>
        <Button className="seg__btn" size="mini" loading={loading} onClick={() => void refreshFunnel()}>
          刷新
        </Button>
      </View>

      <Text className="seg__note">
        按契约 §8 的分群维度拆分埋点。v1 单用户，维度值来自 profiles 回填；缺失项归入「(未标注)」，不臆造。
      </Text>

      <View className="seg__dims">
        {SEGMENT_DIMENSIONS.map((item) => (
          <View
            key={item}
            className={`seg__dim ${item === dimension ? 'seg__dim--on' : ''}`}
            onClick={() => setDimension(item)}
          >
            <Text>{SEGMENT_DIMENSION_LABELS[item]}</Text>
          </View>
        ))}
      </View>

      {rows.length === 0 && (
        <View className="seg__empty">
          <Text className="seg__emptyText">
            还没有埋点数据。去「打卡」记一笔，或点右上「刷新」重新拉取。
          </Text>
        </View>
      )}

      {rows.map((row) => (
        <View className="seg__card" key={row.value}>
          <View className="seg__cardHead">
            <Text className="seg__value">{row.value}</Text>
            <Text className="seg__events">{row.events} 事件</Text>
          </View>

          <View className="seg__bar">
            <View
              className="seg__barFill"
              style={{ width: `${maxEvents > 0 ? Math.round((row.events / maxEvents) * 100) : 0}%` }}
            />
          </View>

          <View className="seg__stats">
            <Text className="seg__stat">激活率 {Math.round(row.activationRate * 100)}%</Text>
            <Text className="seg__stat">获取 {row.acquire}</Text>
            <Text className="seg__stat">激活 {row.activate}</Text>
            <Text className="seg__stat">推荐 {row.refer}</Text>
          </View>

          <View className="seg__kings">
            {DOMAINS.map((domain) => (
              <View className="seg__king" key={domain} style={{ background: KING_COLORS[domain] }}>
                <Text className="seg__kingName">{KING_LABELS[domain]}</Text>
                <Text className="seg__kingValue">{row.perKing[domain]}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}

      <Text className="seg__foot">
        渠道质量分 / 趋势 / A/B 属 Phase 3（Codex A1，getFunnel 增强），本页只做 v1 基础拆分。
      </Text>
    </View>
  )
}