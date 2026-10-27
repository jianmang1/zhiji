/**
 * /login —— 微信登录入口（契约 §1：走 cloud.auth 的微信登录集成，前端不签发 token）。
 */
import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { CLOUDBASE_ENV, isCloudConfigured } from '../../services/cloudbase'
import { leaveLogin } from '../../utils/guard'
import { useAuthStore } from '../../stores/authStore'
import { DOMAINS, KING_LABELS } from '../../types/contract'
import { KING_COLORS } from '../../styles/kings'

import './index.scss'

export default function LoginPage() {
  const status = useAuthStore((s) => s.status)
  const error = useAuthStore((s) => s.error)
  const login = useAuthStore((s) => s.login)

  useDidShow(() => {
    if (useAuthStore.getState().status === 'authenticated') {
      void leaveLogin()
    }
  })

  const handleLogin = async () => {
    const ok = await login()
    if (ok) {
      await leaveLogin()
      return
    }
    // 审核整改：失败必须有明确反馈，杜绝"点击无响应"
    const msg = useAuthStore.getState().error ?? '登录失败，请稍后重试'
    await Taro.showToast({ title: msg, icon: 'none', duration: 3000 })
  }

  const handleBrowse = () => {
    void leaveLogin()
  }

  const loading = status === 'restoring'

  return (
    <View className="login">
      <View className="login__brand">
        <Text className="login__title">执己</Text>
        <Text className="login__slogan">从认知到执行 · 三王养成</Text>
      </View>

      <View className="login__kings">
        {DOMAINS.map((domain) => (
          <View className="login__king" key={domain} style={{ background: KING_COLORS[domain] }}>
            <Text>{KING_LABELS[domain]}</Text>
          </View>
        ))}
      </View>

      <View className="login__card">
        <Text className="login__hint">
          登录后数据按账号隔离（CloudBase RLS），别人看不见你的记录。
        </Text>

        {!isCloudConfigured() && (
          <Text className="login__warn">
            当前构建未启用 CloudBase（TARO_APP_CLOUDBASE_DISABLED=true），登录不可用。
          </Text>
        )}

        <Button className="login__button" loading={loading} disabled={loading} onClick={handleLogin}>
          {loading ? '登录中…' : '微信一键登录'}
        </Button>

        <Button className="login__browse" plain onClick={handleBrowse}>
          先逛逛 · 游客模式
        </Button>

        {error && <Text className="login__error">{error}</Text>}

        <Text className="login__env">环境：{CLOUDBASE_ENV || '未配置'}</Text>
      </View>
    </View>
  )
}