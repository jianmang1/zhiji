/**
 * /funnel —— 两层漏斗看板（模块 7）。
 *
 * 产品定义 §15.1：① 产品级 AARRR ② 各王行为漏斗；
 * 契约 §8：step 为命名空间枚举，v1 由前端拉 analytics_events 本地算基础漏斗，
 * getFunnel 云函数属 Phase 3（未标「已实现」，不接真实调用）。
 *
 * 指标：每步 count、步间转化率、单步 drop-off%、瓶颈步（drop-off 最大）高亮。
 */
import { Button, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { useAnalyticsStore } from '../../stores/analyticsStore'
import type { Segment } from '../../services/funnel'
import { KING_COLORS } from '../../styles/kings'
import type { Domain } from '../../types/contract'
import { ensureAuthenticated } from '../../utils/guard'

import './index.scss'

function kingColor(key: 'product' | Domain): string {
  return key === 'product' ? '#FFFFFF' : KING_COLORS[key]
}

export default function FunnelPage() {
  const funnel = useAnalyticsStore((s) => s.funnel)
  const reactive = useAnalyticsStore((s) => s.reactive)
  const segments = useAnalyticsStore((s) => s.segments)
  const segment = useAnalyticsStore((s) => s.segment)
  const setSegment = useAnalyticsStore((s) => s.setSegment)
  const refreshFunnel = useAnalyticsStore((s) => s.refreshFunnel)
  const loading = useAnalyticsStore((s) => s.funnelLoading)
  const funnelSource = useAnalyticsStore((s) => s.funnelSource)

  useDidShow(() => {
    void (async () => {
      if (await ensureAuthenticated()) {
        await refreshFunnel()
      }
    })()
  })

  const update = (patch: Segment) => {
    const next: Segment = { ...segment, ...patch }
    // 选择"全部"时清掉该维度
    for (const key of Object.keys(patch) as (keyof Segment)[]) {
      if (!patch[key]) delete next[key]
    }
    setSegment(next)
  }

  return (
    <View className="funnel">
      <View className="funnel__head">
        <Text className="funnel__title">两层漏斗</Text>
        <Button className="funnel__btn" size="mini" loading={loading} onClick={() => void refreshFunnel()}>
          刷新
        </Button>
      </View>

      <Text className="funnel__note">
        {funnelSource === 'cloud'
          ? '数据来源：getFunnel 云函数（仅聚合 RLS 内当前用户可见事件）。'
          : '数据来源：前端本地计算（云函数端点未配置或不可用时的降级口径）。'}
        瓶颈步 = 单步流失率最大的那步，红框标出。
      </Text>

      <View className="funnel__segments">
        <Text className="funnel__segLabel">渠道</Text>
        <View className="funnel__chips">
          <View
            className={`funnel__chip ${!segment.channel ? 'funnel__chip--on' : ''}`}
            onClick={() => update({ channel: undefined })}
          >
            <Text>全部</Text>
          </View>
          {segments.channels.map((channel) => (
            <View
              key={channel}
              className={`funnel__chip ${segment.channel === channel ? 'funnel__chip--on' : ''}`}
              onClick={() => update({ channel })}
            >
              <Text>{channel}</Text>
            </View>
          ))}
        </View>

        <Text className="funnel__segLabel">地域</Text>
        <View className="funnel__chips">
          <View
            className={`funnel__chip ${!segment.region ? 'funnel__chip--on' : ''}`}
            onClick={() => update({ region: undefined })}
          >
            <Text>全部</Text>
          </View>
          {segments.regions.map((region) => (
            <View
              key={region}
              className={`funnel__chip ${segment.region === region ? 'funnel__chip--on' : ''}`}
              onClick={() => update({ region })}
            >
              <Text>{region}</Text>
            </View>
          ))}
        </View>

        <Text className="funnel__segLabel">用户类型</Text>
        <View className="funnel__chips">
          <View
            className={`funnel__chip ${!segment.user_type ? 'funnel__chip--on' : ''}`}
            onClick={() => update({ user_type: undefined })}
          >
            <Text>全部</Text>
          </View>
          {segments.userTypes.map((userType) => (
            <View
              key={userType}
              className={`funnel__chip ${segment.user_type === userType ? 'funnel__chip--on' : ''}`}
              onClick={() => update({ user_type: userType })}
            >
              <Text>{userType}</Text>
            </View>
          ))}
        </View>
      </View>

      {funnel.map((report) => (
        <View className="funnel__card" key={report.key}>
          <View
            className="funnel__cardHead"
            style={{ background: kingColor(report.key) }}
          >
            <Text className="funnel__cardTitle">{report.title}</Text>
            <Text className="funnel__overall">
              全链路 {Math.round(report.overallConversion * 100)}%
            </Text>
          </View>

          <View className="funnel__steps">
            {report.steps.map((step, index) => {
              const isBottleneck = report.bottleneck === step.step
              return (
                <View
                  className={`funnel__step ${isBottleneck ? 'funnel__step--bottleneck' : ''}`}
                  key={step.step}
                >
                  <View className="funnel__stepMain">
                    <Text className="funnel__stepIndex">{index + 1}</Text>
                    <Text className="funnel__stepLabel">{step.label}</Text>
                    {isBottleneck && <Text className="funnel__badge">瓶颈</Text>}
                  </View>
                  <View className="funnel__stepNums">
                    <Text className="funnel__count">{step.count}</Text>
                    {index > 0 && (
                      <Text className="funnel__conv">
                        转化 {Math.round(step.conversionFromPrev * 100)}% · 流失{' '}
                        {Math.round(step.dropOffPct)}%
                      </Text>
                    )}
                  </View>
                </View>
              )
            })}
          </View>

          {report.bottleneck && (
            <Text className="funnel__hint">
              瓶颈在「{report.steps.find((s) => s.step === report.bottleneck)?.label}」，优先补这里。
            </Text>
          )}
        </View>
      ))}

      <View className="funnel__card">
        <View className="funnel__cardHead" style={{ background: '#FFFFFF' }}>
          <Text className="funnel__cardTitle">召回环</Text>
          <Text className="funnel__overall">product.reactive</Text>
        </View>
        <View className="funnel__steps">
          <View className="funnel__step">
            <View className="funnel__stepMain">
              <Text className="funnel__stepLabel">召回/复活</Text>
            </View>
            <Text className="funnel__count">{reactive}</Text>
          </View>
        </View>
      </View>

      <Text className="funnel__foot">
        完整聚合（渠道质量分 / 体验指标 / A/B / 趋势）属 Phase 3，由 Codex 的 getFunnel 承担。
      </Text>
    </View>
  )
}