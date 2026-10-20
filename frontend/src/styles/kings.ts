/**
 * 设计 tokens（产品定义 §7 新粗野主义）：
 * 三王各一高饱和主色 + 统一撞黑 #000；段位徽章配色同源。
 * 同时以 CSS 变量（app.scss）暴露给 WXSS/CSS，两处保持一致。
 */
import type { Domain } from '../types/contract'
import type { TierName } from '../scoring/thresholds'

export const INK = '#000000'
export const PAPER = '#FFF9E8'

export const KING_COLORS: Readonly<Record<Domain, string>> = {
  health: '#39FF14',
  work: '#FF6B00',
  dating: '#FF2D95',
}

export const TIER_COLORS: Readonly<Record<TierName, string>> = {
  倔强青铜: '#CD7F32',
  秩序白银: '#C0C0C0',
  荣耀黄金: '#FFD700',
  最强王者: '#7B2FF7',
}