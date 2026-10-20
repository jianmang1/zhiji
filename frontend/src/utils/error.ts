/** 把 unknown 异常收敛成可展示文案（组件层不出现 any） */
export function toMessage(error: unknown, fallback = '操作失败，请稍后重试'): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
}