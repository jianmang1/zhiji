/**
 * 本地存储（Taro.storage，双端一致）。
 *
 * 安全门 6：这里 **只** 存放非敏感快照（user_id 等），
 * access/refresh token 一律由 CloudBase SDK 自己持久化（auth({persistence:'local'})），
 * 应用代码不读写、不落盘、不进 Git。
 */
import Taro from '@tarojs/taro'

const PREFIX = 'zhiji:'

export const storage = {
  get<T>(key: string): T | null {
    try {
      const value: unknown = Taro.getStorageSync(PREFIX + key)
      if (value === '' || value === undefined || value === null) return null
      return value as T
    } catch {
      return null
    }
  },

  set<T>(key: string, value: T): void {
    try {
      Taro.setStorageSync(PREFIX + key, value as unknown as string)
    } catch {
      // 存储失败不应中断登录流程；调用方可按需重试
    }
  },

  remove(key: string): void {
    try {
      Taro.removeStorageSync(PREFIX + key)
    } catch {
      // ignore
    }
  },
}