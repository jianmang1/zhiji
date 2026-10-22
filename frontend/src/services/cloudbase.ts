/**
 * CloudBase 接入层（唯一允许触碰 @cloudbase/js-sdk 的地方）。
 *
 * ⚠️ 已核验的 SDK 类型缺陷：
 *   @cloudbase/js-sdk@3.10.3 的 core.d.ts 把 `auth` / `rdb` / `mysql` 声明为 **属性**
 *   (`rdb: IMySqlClient`)，但运行时注册的是 **函数**
 *   （dist/index.cjs.js: `{ name: "rdb", entity: { rdb: function (e) { ... } } }`）。
 *   因此 `cloud.rdb()` / `cloud.auth()` 才是正确调用方式，而 TS 会误报 "not callable"。
 *   本文件通过一次 `unknown` 断言把运行时形状收敛为 `CloudbaseRuntime`，
 *   其余业务代码只依赖这些自建接口 —— 不引入 any，也不手写 fetch 绕过 SDK。
 */
import cloudbase from '@cloudbase/js-sdk'
import type { TableName } from '../types/contract'

/** envId 以 ADR-002 / frontend-execution-plan §2 为准；可用 TARO_APP_CLOUDBASE_ENV 覆盖。 */
export const CLOUDBASE_ENV: string = process.env.TARO_APP_CLOUDBASE_ENV ?? 'zhiji-d3gd1k9j43e7c20ac'

/** e2e / 离线构建可置 true 关闭远端初始化。 */
const DISABLED: boolean = process.env.TARO_APP_CLOUDBASE_DISABLED === 'true'

export function isCloudConfigured(): boolean {
  return !DISABLED && CLOUDBASE_ENV.length > 0
}

/* ─────────────────────────────── 错误类型 ─────────────────────────────── */

export class CloudbaseNotReadyError extends Error {
  constructor() {
    super('CloudBase 尚未初始化：请在页面加载前调用 bootstrapCloud()')
    this.name = 'CloudbaseNotReadyError'
  }
}

/** 统一的 SDK 调用失败（来自 RdbQuery 的 error 字段） */
export class CloudbaseQueryError extends Error {
  readonly code: string | undefined

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'CloudbaseQueryError'
    this.code = code
  }
}

/** 云函数未部署 / 未配置端点（Codex 侧「待云端联调」期间应当抛出） */
export class CloudFunctionUnavailableError extends Error {
  constructor(fnName: string) {
    super(`云函数 ${fnName} 尚未配置端点（等 Codex 云端联调），该域数据暂不可用`)
    this.name = 'CloudFunctionUnavailableError'
  }
}

/* ─────────────────────────────── 运行时接口 ─────────────────────────────── */

export interface AuthUser {
  /** CloudBase SDK User.id maps to auth.uid(). */
  id?: string
  /** Legacy compatibility for auth responses exposing uid. */
  uid?: string
  openid?: string
  name?: string
}

export interface RdbErrorLike {
  message?: string
  code?: string
}

export interface AuthErrorLike {
  message?: string
  code?: string
}

export interface AuthResultLike {
  data: { user?: AuthUser | null }
  error: AuthErrorLike | null
}

export interface SignInResultLike {
  data: { user?: AuthUser | null; session?: { access_token?: string } | null }
  error: AuthErrorLike | null
}

export interface AuthRuntime {
  /** 微信登录集成（契约 §1：登录走 cloud.auth，不签发/不存储 JWT） */
  signInWithOpenId(options?: { useWxCloud?: boolean }): Promise<SignInResultLike>
  /** 读取 SDK 自己持久化的会话 */
  getSession(): Promise<SignInResultLike>
  getUser(): Promise<AuthResultLike>
  signOut(): Promise<{ error: AuthErrorLike | null }>
  getAccessToken(): Promise<{ accessToken: string; env: string }>
}

export interface RdbResult<T> {
  data: T[] | null
  error: RdbErrorLike | null
}

/** Supabase/PostgREST 风格链式查询（cloud.rdb() 的返回物） */
export interface RdbQuery<T> extends PromiseLike<RdbResult<T>> {
  select(columns?: string): RdbQuery<T>
  insert(values: unknown): RdbQuery<T>
  upsert(values: unknown, options?: { onConflict?: string; ignoreDuplicates?: boolean }): RdbQuery<T>
  update(values: unknown): RdbQuery<T>
  delete(): RdbQuery<T>
  eq(column: string, value: unknown): RdbQuery<T>
  in(column: string, values: readonly unknown[]): RdbQuery<T>
  gte(column: string, value: unknown): RdbQuery<T>
  lte(column: string, value: unknown): RdbQuery<T>
  order(column: string, options?: { ascending?: boolean }): RdbQuery<T>
  limit(count: number): RdbQuery<T>
  single(): PromiseLike<{ data: T | null; error: RdbErrorLike | null }>
}

export interface RdbClient {
  from<T>(table: TableName): RdbQuery<T>
}

/** SDK 实例的实际运行时形状（见文件头说明） */
export interface CloudbaseRuntime {
  auth(options?: { persistence?: 'local' | 'session' | 'none' }): AuthRuntime
  rdb(): RdbClient
}

/* ─────────────────────────────── 单例 ─────────────────────────────── */

let app: CloudbaseRuntime | null = null

export function bootstrapCloud(): CloudbaseRuntime {
  if (app) return app
  app = cloudbase.init({ env: CLOUDBASE_ENV }) as unknown as CloudbaseRuntime
  return app
}

export function getCloud(): CloudbaseRuntime {
  if (!app) throw new CloudbaseNotReadyError()
  return app
}

/** 登录态由 SDK 持久化在本地（persistence: 'local'）；我们不自己存 token。 */
export function getAuth(): AuthRuntime {
  return getCloud().auth({ persistence: 'local' })
}

export function getRdb(): RdbClient {
  return getCloud().rdb()
}

/** 仅供测试使用 */
export function resetCloudForTests(): void {
  app = null
}