import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createUser: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  createServerClient: () => ({
    auth: { admin: { createUser: mocks.createUser } },
  }),
}))

describe('prepareEmailOtpSession', () => {
  beforeEach(() => {
    mocks.createUser.mockReset().mockResolvedValue({ error: null })
    vi.resetModules()
  })

  it('pre-creates a confirmed auth user so signup OTP can be sent', async () => {
    const { prepareEmailOtpSession } = await import('@/lib/email')
    await expect(prepareEmailOtpSession('  New@Example.ORG ')).resolves.toEqual({ ok: true })
    expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'new@example.org',
      email_confirm: true,
    }))
  })

  it('treats an already-registered auth user as prepared', async () => {
    mocks.createUser.mockResolvedValueOnce({
      error: { message: 'User already registered', code: 'email_exists' },
    })
    const { prepareEmailOtpSession } = await import('@/lib/email')
    await expect(prepareEmailOtpSession('asha@example.org')).resolves.toEqual({ ok: true })
  })

  it('fails closed when auth user creation fails for another reason', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.createUser.mockResolvedValueOnce({ error: { message: 'service unavailable' } })
    const { prepareEmailOtpSession } = await import('@/lib/email')
    await expect(prepareEmailOtpSession('asha@example.org')).resolves.toEqual({
      ok: false,
      status: 500,
      error: 'Failed to prepare email OTP session',
    })
  })
})
