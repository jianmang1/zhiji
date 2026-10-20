/**
 * 登录态（契约 §1：登录走 cloud.auth 微信登录集成，不签发/不存储 JWT）。
 *
 * 安全门 6：
 *   - token 由 SDK 持有（persistence: 'local'），应用侧不接触
 *   - 本地仅缓存 user_id 快照用于首屏渲染，且它本身不是凭证
 */
import { create } from 'zustand'
import { getAuth } from '../services/cloudbase'
import { storage } from '../utils/storage'
import { toMessage } from '../utils/error'

const USER_ID_KEY = 'userId'

export type AuthStatus = 'idle' | 'restoring' | 'authenticated' | 'unauthenticated' | 'error'

export interface AuthState {
  status: AuthStatus
  userId: string | null
  error: string | null
  login: () => Promise<boolean>
  logout: () => Promise<void>
  restore: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'idle',
  userId: null,
  error: null,

  async login() {
    set({ status: 'restoring', error: null })
    try {
      const auth = getAuth()
      const result = await auth.signInWithWechat()
      if (result.error) {
        set({ status: 'error', error: result.error.message ?? '微信登录失败' })
        return false
      }

      let userId = result.data.user?.uid ?? null
      if (!userId) {
        // signInWithWechat 可能只回写会话，补一次 getSession 取 uid
        const session = await auth.getSession()
        userId = session.error ? null : session.data.user?.uid ?? null
      }
      if (!userId) {
        set({ status: 'error', error: '登录成功但未取得 user id' })
        return false
      }

      storage.set(USER_ID_KEY, userId)
      set({ status: 'authenticated', userId, error: null })
      return true
    } catch (error) {
      set({ status: 'error', error: toMessage(error, '微信登录失败') })
      return false
    }
  },

  async logout() {
    try {
      await getAuth().signOut()
    } finally {
      storage.remove(USER_ID_KEY)
      set({ status: 'unauthenticated', userId: null, error: null })
    }
  },

  async restore() {
    set({ status: 'restoring', error: null })
    try {
      const auth = getAuth()
      const result = await auth.getSession()
      const userId = result.error ? null : result.data.user?.uid ?? null
      if (userId) {
        storage.set(USER_ID_KEY, userId)
        set({ status: 'authenticated', userId, error: null })
        return
      }
      // 没有有效会话：清掉残留快照，避免"看起来已登录"
      storage.remove(USER_ID_KEY)
      set({ status: 'unauthenticated', userId: null, error: null })
    } catch (error) {
      storage.remove(USER_ID_KEY)
      set({ status: 'unauthenticated', userId: null, error: toMessage(error, '恢复登录态失败') })
    }
  },

  clearError() {
    set({ error: null })
  },
}))

/** 供页面/Store 读取当前用户 id（未登录返回 null） */
export function currentUserId(): string | null {
  return useAuthStore.getState().userId
}