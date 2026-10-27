/**
 * 路由守卫：未登录跳 /pages/login/index（Taro 自带路由，不引入第三方路由库）。
 */
import Taro from '@tarojs/taro'
import { isCloudConfigured } from '../services/cloudbase'
import { useAuthStore } from '../stores/authStore'

export const LOGIN_ROUTE = '/pages/login/index'

/**
 * 仅恢复登录态，不跳转 —— 供页面"游客可浏览"使用。
 * 返回 true = 已登录（或离线/e2e 模式）。
 */
export async function restoreSession(): Promise<boolean> {
  if (!isCloudConfigured()) {
    // 离线/e2e 模式：不做远端校验，交给页面自行提示
    return true
  }
  const state = useAuthStore.getState()
  if (state.status !== 'authenticated') {
    await state.restore()
  }
  return useAuthStore.getState().status === 'authenticated'
}

/**
 * 需要登录的动作（提交打卡 / 生成方案等）：未登录则提示并跳登录页。
 * 登录成功后登录页会自动 switchTab 回打卡页，流程闭环。
 */
export async function requireLogin(action = '继续操作'): Promise<boolean> {
  const ok = await restoreSession()
  if (ok) {
    return true
  }
  await Taro.showToast({ title: `登录后才能${action}`, icon: 'none', duration: 2000 })
  await Taro.redirectTo({ url: LOGIN_ROUTE })
  return false
}

export async function ensureAuthenticated(): Promise<boolean> {
  if (!isCloudConfigured()) {
    // 离线/e2e 模式：不做远端校验，交给页面自行提示
    return true
  }
  const state = useAuthStore.getState()
  if (state.status !== 'authenticated') {
    await state.restore()
  }
  if (useAuthStore.getState().status === 'authenticated') {
    return true
  }
  await Taro.redirectTo({ url: LOGIN_ROUTE })
  return false
}