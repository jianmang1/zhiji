/**
 * 打卡草稿本地持久化（Tech Lead 派发 · UX 优化 Task1 · 2026-10-22）。
 *
 * 痛点：PO 反馈"有时会忘记点记下这一笔，点进其他地方时希望等于保存"。
 * 方案：打卡录入页的表单状态按 `domain:type` 存进 Taro 本地存储；
 *   - 字段变动即存（entry 页 debounce）
 *   - 离开页面 / 切换王·type 前兜底存
 *   - 回到该页恢复并提示"已恢复上次未提交的草稿"
 *   - 显式提交成功后清空
 *
 * 注意：**仅存本地草稿，绝不自动提交 recordEvent**——避免误写密文。
 * 安全门 6 同 storage.ts：这里只存非敏感的表单草稿（数值/选项），不碰 token。
 */
import { create } from 'zustand'
import { storage } from '../utils/storage'
import type { Domain } from '../types/contract'

export type DraftValue = string | boolean | number

export interface DraftEntry {
  values: Record<string, DraftValue>
  tsText: string
}

interface DraftState {
  /** 上次恢复的草稿定位（供页面短暂显示"已恢复"横幅） */
  lastRestored: { domain: Domain; type: string; at: number } | null
  save: (domain: Domain, type: string, values: Record<string, DraftValue>, tsText: string) => void
  load: (domain: Domain, type: string) => DraftEntry | null
  clear: (domain: Domain, type: string) => void
  hasDraft: (domain: Domain, type: string) => boolean
  consumeRestored: () => void
}

function draftKey(domain: Domain, type: string): string {
  return `draft:${domain}:${type}`
}

function isNonEmpty(entry: DraftEntry | null): entry is DraftEntry {
  return !!entry && !!entry.values && Object.keys(entry.values).length > 0
}

export const useDraftStore = create<DraftState>((set, get) => ({
  lastRestored: null,

  save(domain, type, values, tsText) {
    storage.set<DraftEntry>(draftKey(domain, type), { values, tsText })
  },

  load(domain, type) {
    const entry = storage.get<DraftEntry>(draftKey(domain, type))
    if (isNonEmpty(entry)) {
      set({ lastRestored: { domain, type, at: Date.now() } })
      return entry
    }
    return null
  },

  clear(domain, type) {
    storage.remove(draftKey(domain, type))
    const current = get().lastRestored
    if (current && current.domain === domain && current.type === type) {
      set({ lastRestored: null })
    }
  },

  hasDraft(domain, type) {
    return isNonEmpty(storage.get<DraftEntry>(draftKey(domain, type)))
  },

  consumeRestored() {
    set({ lastRestored: null })
  },
}))
