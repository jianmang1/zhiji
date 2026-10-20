/**
 * /plans —— v1 占位 UI（frontend-execution-plan §5 / 契约 §5.1）。
 *
 * 门禁：generatePlan / listPlans 在 cloudbase-contract.md 中尚未标注「已实现」，
 * 因此这里 **不发起任何真实调用**，也不放伪造数据；仅展示即将接入的结构。
 */
import { Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { ensureAuthenticated } from '../../utils/guard'

import './index.scss'

const PLAN_SCHEMA_FIELDS = [
  'domain：所属王（health / work / dating）',
  'score + tier：由前端规则引擎算好传入，LLM 不得编造',
  'summary：本周概览一句话',
  'actions[]：{ title, why, effort(low|mid|high) }，2–4 条',
  'next_milestone：下一阶段目标',
]

export default function PlansPage() {
  useDidShow(() => {
    void ensureAuthenticated()
  })

  return (
    <View className="plans">
      <View className="plans__card">
        <View className="plans__head">
          <Text className="plans__title">行动方案</Text>
          <Text className="plans__badge">占位</Text>
        </View>

        <Text className="plans__text">
          方案由分析 Agent 生成并写入 plans。前端已就位，但 generatePlan / listPlans
          还没在数据契约里标「已实现」，按门禁约定先不接真实调用。
        </Text>

        <Text className="plans__subtitle">接入后本页会展示（契约 §5.1）</Text>
        {PLAN_SCHEMA_FIELDS.map((item) => (
          <View className="plans__item" key={item}>
            <Text className="plans__dot">▍</Text>
            <Text className="plans__itemText">{item}</Text>
          </View>
        ))}

        <Text className="plans__note">本页没有任何模拟数据：接入后显示真实方案。</Text>
      </View>
    </View>
  )
}