/**
 * 体验指标汇总（A7 的看板侧）：从 analytics_events.payload 读 load_ms / entry_ms，
 * 输出 P50 / P95 与中位数（产品定义 §15.2 C 类"产品体验"指标的 v1 轻量版）。
 */
import type { AnalyticsEventRow } from '../types/contract'

export interface ExperienceSummary {
  /** 冷启动耗时（ms） */
  loadP50: number | null
  loadP95: number | null
  /** 打卡完成时长（ms）中位数 */
  entryMedian: number | null
  loadSamples: number
  entrySamples: number
}

function numericPayload(rows: readonly AnalyticsEventRow[], key: string): number[] {
  const values: number[] = []
  for (const row of rows) {
    const raw = row.payload[key]
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) values.push(raw)
  }
  return values.sort((a, b) => a - b)
}

/** 最近秩法分位数（样本 < 2 时退化为唯一值） */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null
  const clamped = Math.min(1, Math.max(0, p))
  const index = Math.ceil(clamped * values.length) - 1
  return values[Math.min(values.length - 1, Math.max(0, index))] ?? null
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const mid = Math.floor(values.length / 2)
  if (values.length % 2 === 1) return values[mid] ?? null
  const left = values[mid - 1]
  const right = values[mid]
  if (left === undefined || right === undefined) return null
  return Math.round((left + right) / 2)
}

export function summarizeExperience(rows: readonly AnalyticsEventRow[]): ExperienceSummary {
  const load = numericPayload(rows, 'load_ms')
  const entry = numericPayload(rows, 'entry_ms')
  return {
    loadP50: percentile(load, 0.5),
    loadP95: percentile(load, 0.95),
    entryMedian: median(entry),
    loadSamples: load.length,
    entrySamples: entry.length,
  }
}