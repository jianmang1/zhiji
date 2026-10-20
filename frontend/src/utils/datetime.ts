/**
 * 时间工具：契约 ts 为 timestamptz，统一以带时区的 ISO 8601 字符串传输。
 */

/** 当前时间（UTC ISO，含 Z → 满足后端 tz-aware 校验） */
export function nowIso(): string {
  return new Date().toISOString()
}

/** 转成 <input type="datetime-local"> / 表单默认值所需的本地时间串 */
export function toLocalInputValue(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 本地时间串 → 带时区的 ISO 字符串；非法输入返回 null */
export function fromLocalInput(value: string): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}