import { test, expect } from './fixtures'

const protectedPages = [
  { path: '/companies/dashboard', redirectsTo: /\/$/ },
  { path: '/ngos/dashboard', redirectsTo: /\/$/ },
  { path: '/individuals/dashboard', redirectsTo: /\/$/ },
  { path: '/admin', redirectsTo: /\/admin\/login$/, loginHeading: 'Admin Console' },
  { path: '/ca', redirectsTo: /\/ca\/login$/, loginHeading: 'CA Portal' },
  { path: '/evidence-verification', redirectsTo: /\/evidence-verification\/login$/, loginHeading: 'CA Portal' },
]

test.describe('anonymous visitors are kept out of protected pages', () => {
  for (const { path, redirectsTo, loginHeading } of protectedPages) {
    test(path, async ({ page }) => {
      await page.goto(path)

      await expect(page).toHaveURL(redirectsTo)
      if (loginHeading) {
        await expect(page.getByRole('heading', { level: 1, name: loginHeading })).toBeVisible()
        await expect(page.getByRole('button', { name: /Sign In/ })).toBeVisible()
      } else {
        await expect(page.getByRole('heading', { level: 1, name: /What.s happening/ })).toBeVisible()
      }
    })
  }

})
