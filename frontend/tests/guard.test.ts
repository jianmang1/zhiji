import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  isCloudConfigured: vi.fn(() => true),
  restore: vi.fn(),
  getState: vi.fn(),
  showToast: vi.fn(),
  navigateTo: vi.fn(),
  redirectTo: vi.fn(),
  navigateBack: vi.fn(),
  switchTab: vi.fn(),
  getCurrentPages: vi.fn(() => [] as unknown[]),
}))

vi.mock('@tarojs/taro', () => ({
  default: {
    showToast: h.showToast,
    navigateTo: h.navigateTo,
    redirectTo: h.redirectTo,
    navigateBack: h.navigateBack,
    switchTab: h.switchTab,
    getCurrentPages: h.getCurrentPages,
  },
}))
vi.mock('../src/services/cloudbase', () => ({ isCloudConfigured: h.isCloudConfigured }))
vi.mock('../src/stores/authStore', () => ({ useAuthStore: { getState: h.getState } }))

const { ENTRY_ROUTE, LOGIN_ROUTE, leaveLogin, requireLogin, restoreSession } = await import(
  '../src/utils/guard'
)

type Status = 'idle' | 'restoring' | 'authenticated' | 'unauthenticated' | 'error'

/** 造一个可变登录态，restore() 会把状态推进到 unauthenticated（模拟无会话） */
function authState(status: Status): { status: Status; restore: () => Promise<void> } {
  const state = {
    status,
    restore: async () => {
      state.status = 'unauthenticated'
    },
  }
  h.getState.mockReturnValue(state)
  return state
}

describe('游客模式守卫（微信审核整改）', () => {
  beforeEach(() => {
    h.isCloudConfigured.mockReset().mockReturnValue(true)
    h.restore.mockReset()
    h.getState.mockReset()
    h.showToast.mockReset()
    h.navigateTo.mockReset()
    h.redirectTo.mockReset()
    h.navigateBack.mockReset()
    h.switchTab.mockReset()
    h.getCurrentPages.mockReset().mockReturnValue([])
  })

  it('restoreSession：离线/e2e 模式直接放行，不碰远端', async () => {
    h.isCloudConfigured.mockReturnValue(false)
    authState('idle')
    await expect(restoreSession()).resolves.toBe(true)
    expect(h.navigateTo).not.toHaveBeenCalled()
    expect(h.redirectTo).not.toHaveBeenCalled()
  })

  it('restoreSession：已登录直接放行且不重复恢复', async () => {
    authState('authenticated')
    await expect(restoreSession()).resolves.toBe(true)
    expect(h.restore).not.toHaveBeenCalled()
  })

  it('restoreSession：未登录返回 false，但不跳转（页面可继续浏览）', async () => {
    authState('idle')
    await expect(restoreSession()).resolves.toBe(false)
    expect(h.navigateTo).not.toHaveBeenCalled()
    expect(h.redirectTo).not.toHaveBeenCalled()
    expect(h.showToast).not.toHaveBeenCalled()
  })

  it('requireLogin：已登录放行，不提示不跳转', async () => {
    authState('authenticated')
    await expect(requireLogin('记录打卡')).resolves.toBe(true)
    expect(h.showToast).not.toHaveBeenCalled()
    expect(h.navigateTo).not.toHaveBeenCalled()
  })

  it('requireLogin：未登录 → 提示 + navigateTo 登录页（不用 redirectTo，保留当前页）', async () => {
    authState('idle')
    await expect(requireLogin('记录打卡')).resolves.toBe(false)
    expect(h.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: '登录后才能记录打卡' }),
    )
    expect(h.navigateTo).toHaveBeenCalledWith({ url: LOGIN_ROUTE })
    expect(h.redirectTo).not.toHaveBeenCalled()
  })

  it('leaveLogin：栈内还有上一页 → 返回（保留用户填写内容）', async () => {
    h.getCurrentPages.mockReturnValue([{}, {}])
    await leaveLogin()
    expect(h.navigateBack).toHaveBeenCalled()
    expect(h.switchTab).not.toHaveBeenCalled()
  })

  it('leaveLogin：直接进入登录页（栈内只有它）→ 回打卡首页', async () => {
    h.getCurrentPages.mockReturnValue([{}])
    await leaveLogin()
    expect(h.switchTab).toHaveBeenCalledWith({ url: ENTRY_ROUTE })
    expect(h.navigateBack).not.toHaveBeenCalled()
  })

  it('leaveLogin：getCurrentPages 异常返回时兜底回打卡首页', async () => {
    h.getCurrentPages.mockReturnValue(undefined as unknown as unknown[])
    await leaveLogin()
    expect(h.switchTab).toHaveBeenCalledWith({ url: ENTRY_ROUTE })
  })
})