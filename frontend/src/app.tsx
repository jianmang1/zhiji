import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import { bootstrapCloud, isCloudConfigured } from './services/cloudbase'
import { plansForAppOpen } from './services/tracking'
import { useAnalyticsStore } from './stores/analyticsStore'
import { useAuthStore } from './stores/authStore'

import './app.scss'

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    if (!isCloudConfigured()) {
      // 未注入 env 时（e2e/离线构建），跳过远端初始化，避免白屏
      return
    }
    void (async () => {
      bootstrapCloud()
      // 复用 CloudBase 自身持久化的会话恢复登录态
      await useAuthStore.getState().restore()
      if (useAuthStore.getState().status !== 'authenticated') return

      const analytics = useAnalyticsStore.getState()
      await analytics.ensureProfile()
      // app_open → product.acquire + product.activate（契约 §8）
      await analytics.trackPlans(plansForAppOpen())
    })()
  })

  return children
}

export default App