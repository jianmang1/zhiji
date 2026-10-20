import { defineConfig, devices } from '@playwright/test'

/**
 * e2e：关键路径（登录 → 录入 → 看板可见）跑在 H5 构建上。
 * 启动方式（README 有完整步骤）：
 *   pnpm dev:h5            # 另起一个终端，默认 http://127.0.0.1:10086
 *   E2E_BASE_URL=... pnpm e2e
 * 未提供 E2E_BASE_URL 时使用默认地址。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:10086',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium-h5', use: { ...devices['Pixel 5'] } }],
})