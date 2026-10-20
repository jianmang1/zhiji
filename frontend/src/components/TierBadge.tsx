/**
 * 段位徽章（产品定义 §5.2 冻结段位；§7 粗野风 badge）。
 */
import { Text, View } from '@tarojs/components'
import type { TierName } from '../scoring/thresholds'
import { TIER_COLORS } from '../styles/kings'

export interface TierBadgeProps {
  tier: TierName
  score: number
}

export default function TierBadge({ tier, score }: TierBadgeProps) {
  return (
    <View className="tier-badge" style={{ background: TIER_COLORS[tier] }}>
      <Text className="tier-badge__name">{tier}</Text>
      <Text className="tier-badge__score">{score}</Text>
    </View>
  )
}