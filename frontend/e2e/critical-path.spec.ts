import { expect, test } from '@playwright/test'

/**
 * e2e 范围说明：
 * 完整「登录 → 打卡 → 看板」需要 CloudBase 开发环境与微信授权，且项目铁律禁止用本机 mock 后端，
 * 因此这里只覆盖真实构建产物上、不依赖后端的关键行为。
 *
 * 审核整改后（2026-10-26）关键回归点：
 *   - 首页 = 打卡页，**游客可浏览**，不再进页即强制跳登录（微信审核硬要求）
 *   - 登录页有「先逛逛 · 游客模式」出口，且登录按钮有失败反馈（避免"点击无响应"）
 */

test.describe('游客可浏览（不强制登录）', () => {
  test('打卡页直接可见三王', async ({ page }) => {
    await page.goto('/#/pages/entry/index')
    await expect(page.getByText('薄肌王')).toBeVisible()
    await expect(page.getByText('力王')).toBeVisible()
    await expect(page).not.toHaveURL(/pages\/login/)
  })

  test('看板页不会把游客弹到登录页', async ({ page }) => {
    await page.goto('/#/pages/dashboard/index')
    await expect(page.getByText('三王战报')).toBeVisible()
    await expect(page).not.toHaveURL(/pages\/login/)
  })

  test('方案页不会把游客弹到登录页', async ({ page }) => {
    await page.goto('/#/pages/plans/index')
    await expect(page.getByText('行动方案')).toBeVisible()
    await expect(page).not.toHaveURL(/pages\/login/)
  })
})

test.describe('登录页', () => {
  test('展示微信登录按钮与游客入口', async ({ page }) => {
    await page.goto('/#/pages/login/index')
    await expect(page.getByText('微信一键登录')).toBeVisible()
    await expect(page.getByText('先逛逛 · 游客模式')).toBeVisible()
  })
})