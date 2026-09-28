import { test, expect, expectNoPageProblems } from './fixtures'

const publicPages = [
  { path: '/', heading: /What.s happening/ },
  { path: '/login', title: 'Sign In' },
  { path: '/register', title: 'Create an Account' },
  { path: '/ngos/register', title: 'Register as NGO' },
  { path: '/companies/register', title: 'Register as Company' },
  { path: '/individuals/register', title: 'Register as Individual' },
  { path: '/forgot-password', title: 'Forgot Password' },
  { path: '/service-offers', heading: 'Capability Offers' },
  { path: '/service-requests', heading: 'NGO Requests' },
  { path: '/csr-campaigns', heading: 'CSR Campaigns' },
  { path: '/ngo-network', heading: 'NGO Network' },
]

for (const { path, heading, title } of publicPages) {
  test(`${path} renders without page errors`, async ({ page, pageProblems }) => {
    const response = await page.goto(path)
    expect(response?.status()).toBeLessThan(400)

    if (heading) {
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    } else if (title) {
      await expect(page.getByText(title, { exact: true }).first()).toBeVisible()
    }

    await page.waitForLoadState('networkidle')
    expectNoPageProblems(pageProblems)
  })
}

test('register page links to every account type', async ({ page }) => {
  await page.goto('/register')

  await expect(page.getByRole('link', { name: /Register as Individual/ })).toHaveAttribute('href', '/individuals/register')
  await expect(page.getByRole('link', { name: /Register as NGO/ })).toHaveAttribute('href', '/ngos/register')
  await expect(page.getByRole('link', { name: /Register as Company/ })).toHaveAttribute('href', '/companies/register')
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
})
