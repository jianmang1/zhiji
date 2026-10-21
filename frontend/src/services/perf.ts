/**
 * 体验指标采集（A7）。
 *
 * 约束：契约 §8 的 `step` 枚举 v1 已冻结，**禁止自造 step**（如 product.experience）。
 * 因此时长不新开漏斗步，而是放进既有事件的 `payload`（契约里 payload 是自由 jsonb）：
 *   - app_open.payload.load_ms      冷启动 → 登录态就绪
 *   - complete_checkin.payload.entry_ms 打卡页停留 → 提交成功
 */
const bootedAt = Date.now()

/** 冷启动至今的毫秒数 */
export function sinceBoot(): number {
  const value = Date.now() - bootedAt
  return value > 0 ? Math.round(value) : 0
}

/** 从某时间点起的毫秒数（取整；时钟回拨时归零） */
export function elapsedMs(from: number): number {
  const value = Date.now() - from
  return value > 0 ? Math.round(value) : 0
}