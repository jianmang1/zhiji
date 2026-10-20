/**
 * 路由守卫：未登录跳 /pages/login/index（Taro 自带路由，不引入第三方路由库）。
 */
import Taro from '@tarojs/taro'
import { isCloudConfigured } from '../services/cloudbase'
import { useAuthStore } from '../stores/authStore'

export const LOGIN_ROUTE = '/pages/login/index'

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