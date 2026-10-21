import { describe, expect, it, vi } from 'vitest'

// services/events 会 import Taro 运行时；这里只需纯函数，给个轻量 mock 即可
vi.mock('@tarojs/taro', () => ({ default: { request: vi.fn() } }))

const { describeHttpFailure } = await import('../src/services/events')

describe('云函数失败的诊断文案（为 A6 端点绑定做准备）', () => {
  it('404 + INVALID_PATH → 明确指出"路径未绑定"并给出下一步', () => {
    const msg = describeHttpFailure(404, {
      code: 'INVALID_PATH',
      message: 'Invalid path. For more information...',
    })
    expect(msg).toContain('INVALID_PATH')
    expect(msg).toContain('HTTP 访问路径')
    expect(msg).toContain('TARO_APP_CLOUDBASE_FN_BASE_URL')
  })

  it('普通 404 → 函数不存在/路径错误', () => {
    expect(describeHttpFailure(404, {})).toContain('404')
  })

  it('401/403 → 未登录或无权限', () => {
    expect(describeHttpFailure(401, {})).toContain('未登录')
    expect(describeHttpFailure(403, {})).toContain('未登录')
  })

  it('5xx → 服务异常', () => {
    expect(describeHttpFailure(502, {})).toContain('服务异常')
  })

  it('业务错误优先透出后端 message（如校验失败）', () => {
    expect(describeHttpFailure(400, { message: 'Invalid function input' })).toBe(
      'Invalid function input',
    )
  })

  it('未知状态码也带上状态与网关错误码', () => {
    const msg = describeHttpFailure(418, { code: 'TEAPOT' })
    expect(msg).toContain('418')
    expect(msg).toContain('TEAPOT')
  })
})