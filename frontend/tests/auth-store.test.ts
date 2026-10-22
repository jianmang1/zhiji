import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  signInWithOpenId: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
  store: new Map<string, unknown>(),
}))

vi.mock('@tarojs/taro', () => ({
  default: {
    getStorageSync: (key: string) => (h.store.has(key) ? h.store.get(key) : ''),
    setStorageSync: (key: string, value: unknown) => {
      h.store.set(key, value)
    },
    removeStorageSync: (key: string) => {
      h.store.delete(key)
    },
  },
}))

vi.mock('../src/services/cloudbase', () => ({
  getAuth: () => ({
    signInWithOpenId: h.signInWithOpenId,
    getSession: h.getSession,
    signOut: h.signOut,
  }),
}))

const { useAuthStore } = await import('../src/stores/authStore')

function reset(): void {
  useAuthStore.setState({ status: 'idle', userId: null, error: null })
  h.store.clear()
  h.signInWithOpenId.mockReset()
  h.getSession.mockReset()
  h.signOut.mockReset()
}

describe('authStore', () => {
  beforeEach(reset)

  it('微信登录成功后记录 user_id 并只缓存非敏感快照', async () => {
    h.signInWithOpenId.mockResolvedValue({
      data: { user: { id: 'u-1' }, session: { access_token: 'secret' } },
      error: null,
    })

    const ok = await useAuthStore.getState().login()

    expect(ok).toBe(true)
    expect(useAuthStore.getState().status).toBe('authenticated')
    expect(useAuthStore.getState().userId).toBe('u-1')
    // 只存 user_id；token 不进应用侧存储（安全门 6）
    expect([...h.store.keys()]).toEqual(['zhiji:userId'])
  })

  it('登录返回错误时进入 error 态并暴露文案', async () => {
    h.signInWithOpenId.mockResolvedValue({ data: {}, error: { message: '用户取消授权' } })

    const ok = await useAuthStore.getState().login()

    expect(ok).toBe(false)
    expect(useAuthStore.getState().status).toBe('error')
    expect(useAuthStore.getState().error).toContain('取消')
    expect(h.store.size).toBe(0)
  })

  it('signInWithOpenId 未回传用户时回退 getSession 读取 id', async () => {
    h.signInWithOpenId.mockResolvedValue({ data: { session: {} }, error: null })
    h.getSession.mockResolvedValue({ data: { user: { id: 'u-2' } }, error: null })

    const ok = await useAuthStore.getState().login()

    expect(ok).toBe(true)
    expect(useAuthStore.getState().userId).toBe('u-2')
  })

  it('登出后清空本地快照', async () => {
    h.signInWithOpenId.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null })
    h.signOut.mockResolvedValue({ error: null })
    await useAuthStore.getState().login()

    await useAuthStore.getState().logout()

    expect(useAuthStore.getState().status).toBe('unauthenticated')
    expect(useAuthStore.getState().userId).toBeNull()
    expect(h.store.size).toBe(0)
  })

  it('restore 读取 SDK 会话；无会话时清除残留快照', async () => {
    h.getSession.mockResolvedValue({ data: { user: { id: 'u-3' } }, error: null })
    await useAuthStore.getState().restore()
    expect(useAuthStore.getState().status).toBe('authenticated')
    expect(useAuthStore.getState().userId).toBe('u-3')

    h.store.set('zhiji:userId', 'stale')
    h.getSession.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } })
    await useAuthStore.getState().restore()

    expect(useAuthStore.getState().status).toBe('unauthenticated')
    expect(h.store.has('zhiji:userId')).toBe(false)
  })
})