import { expect, test } from '@playwright/test'

/**
 * e2e 范围说明（诚实边界）：
 * 完整的「登录 → 录入 → 看板」需要 CloudBase 开发环境的微信授权，无法在无凭据的 CI 里跑通，
 * 且项目铁律禁止用本机 mock 后端绕过契约。
 * 因此这里只覆盖 **真实构建产物上、不依赖后端** 的关键行为：
 *   1) 未登录时受保护页面被守卫重定向到登录页
 *   2) 登录页渲染品牌与微信登录入口
 * 完整链路在 Phase 3 联调（Tech Lead weekly checkpoint）用真实环境补测。
 *
 * 运行：先 `pnpm dev:h5`（或部署 dist/h5），再 `pnpm e2e`。
 */

test.describe('未登录守卫', () => {
  test('访问录入页会落到登录页', async ({ page }) => {
    await page.goto('/#/pages/entry/index')
    await expect(page.getByText('微信一键登录')).toBeVisible()
    await expect(page.getByText('执己')).toBeVisible()
  })

  test('访问看板页会落到登录页', async ({ page }) => {
    await page.goto('/#/pages/dashboard/index')
    await expect(page.getByText('微信一键登录')).toBeVisible()
  })

  test('访问计划页会落到登录页', async ({ page }) => {
    await page.goto('/#/pages/plans/index')
    await expect(page.getByText('微信一键登录')).toBeVisible()
  })
})

test.describe('登录页渲染', () => {
  test('展示微信登录按钮与环境信息', async ({ page }) => {
    await page.goto('/#/pages/login/index')
    await expect(page.getByText('微信一键登录')).toBeVisible()
    await expect(page.getByText(/环境：/)).toBeVisible()
  })
})