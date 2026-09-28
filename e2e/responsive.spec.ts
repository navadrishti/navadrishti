import { devices } from '@playwright/test'
import { test, expect } from './fixtures'

const phone = devices['Pixel 7']

test.use({
  viewport: phone.viewport,
  userAgent: phone.userAgent,
  deviceScaleFactor: phone.deviceScaleFactor,
  isMobile: phone.isMobile,
  hasTouch: phone.hasTouch,
})

for (const path of ['/login', '/register', '/forgot-password']) {
  test(`${path} has no horizontal overflow on mobile`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('button').first()).toBeVisible()

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })
}

test('login form stays usable on mobile', async ({ page }) => {
  await page.goto('/login')

  const submit = page.getByRole('button', { name: 'Sign In' })
  await expect(page.getByLabel('Email')).toBeInViewport()
  await expect(submit).toBeVisible()

  const box = await submit.boundingBox()
  const viewport = page.viewportSize()
  expect(box).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width)
})
