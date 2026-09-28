import { test, expect, expectNoPageProblems, fakeEmail } from './fixtures'

test.describe('login form', () => {
  test('empty submit is blocked by required-field validation', async ({ page }) => {
    const loginRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/auth/login')) loginRequests.push(request.url())
    })

    await page.goto('/login')
    const email = page.getByLabel('Email')
    const password = page.getByLabel('Password')

    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(email).toHaveJSProperty('validity.valueMissing', true)
    await expect(password).toHaveJSProperty('validity.valueMissing', true)
    expect(await email.evaluate((input: HTMLInputElement) => input.validationMessage)).not.toBe('')

    await email.fill('not-an-email')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(email).toHaveJSProperty('validity.typeMismatch', true)

    await expect(page).toHaveURL(/\/login$/)
    expect(loginRequests).toEqual([])
  })

  test('wrong credentials show a generic error and stay on login', async ({ page, pageProblems }) => {
    await page.goto('/login')

    await page.getByLabel('Email').fill(fakeEmail())
    await page.getByLabel('Password').fill('definitely-not-the-password-1!')

    const loginResponse = page.waitForResponse((response) => response.url().includes('/api/auth/login'))
    await page.getByRole('button', { name: 'Sign In' }).click()
    expect((await loginResponse).status()).toBe(401)

    await expect(page.getByRole('alert').filter({ hasText: 'Invalid email or password' })).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeEnabled()

    expectNoPageProblems(pageProblems)
  })
})

test.describe('forgot password', () => {
  test('unknown email gets the same generic confirmation as any account', async ({ page }) => {
    await page.goto('/forgot-password')

    await page.getByLabel('Registered Email').fill(fakeEmail())

    const forgotResponse = page.waitForResponse((response) => response.url().includes('/api/auth/forgot-password'))
    await page.getByRole('button', { name: 'Send OTP' }).click()

    const response = await forgotResponse
    expect(response.status()).toBe(200)
    expect(await response.json()).toEqual({
      message: 'If an account with that email exists, we have sent a password reset OTP.',
      success: true,
    })

    await expect(
      page.getByText('If an account exists for this email, an OTP has been sent. Check your inbox and spam folder.')
    ).toBeVisible()
    await expect(page.getByLabel('Email OTP')).toBeVisible()
    await expect(page.getByText('Account not found')).toHaveCount(0)
  })

  test('invalid email format is rejected client-side', async ({ page }) => {
    await page.goto('/forgot-password')

    const email = page.getByLabel('Registered Email')
    await email.fill('nope')
    await page.getByRole('button', { name: 'Send OTP' }).click()

    await expect(email).toHaveJSProperty('validity.typeMismatch', true)
    await expect(page.getByLabel('Email OTP')).toHaveCount(0)
  })
})
