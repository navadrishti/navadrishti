import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import ForgotPasswordPage from '@/app/forgot-password/page'
import { jsonResponse, mockFetch, requestBody } from './helpers'

const user = userEvent.setup({ delay: null })

const supabase = vi.hoisted(() => ({ createClient: vi.fn() }))

const GENERIC_MESSAGE = 'If an account with that email exists, we have sent a password reset OTP.'

vi.mock('@/components/header', () => ({ AuthCardBackRow: () => null }))
vi.mock('@/lib/supabase', () => supabase)
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

async function requestOtp(email: string) {
  await user.type(screen.getByLabelText('Registered Email'), email)
  await user.click(screen.getByRole('button', { name: 'Send OTP' }))
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    supabase.createClient.mockImplementation(() => {
      throw new Error('the browser must not call Supabase auth for password resets')
    })
  })

  it.each(['asha@example.org', 'ghost@example.org'])('asks only the server to send the OTP for %s', async (email) => {
    const fetchMock = mockFetch(() => jsonResponse({ message: GENERIC_MESSAGE, success: true }))
    render(<ForgotPasswordPage />)

    await requestOtp(email)

    expect(await screen.findByText(/If an account exists for this email, an OTP has been sent/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/forgot-password')
    expect(requestBody(fetchMock.mock.calls[0][1])).toEqual({ email })
    expect(toast.success).toHaveBeenCalledWith(GENERIC_MESSAGE)
    expect(supabase.createClient).not.toHaveBeenCalled()
  })

  it('verifies the OTP on the server and moves on to the new password', async () => {
    const fetchMock = mockFetch((_url, init) =>
      requestBody(init).otp
        ? jsonResponse({ success: true, resetToken: 'a'.repeat(64), accountName: 'Asha', email: 'asha@example.org' })
        : jsonResponse({ message: GENERIC_MESSAGE, success: true })
    )
    render(<ForgotPasswordPage />)

    await requestOtp('asha@example.org')
    await user.type(await screen.findByLabelText('Email OTP'), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify OTP' }))

    expect(await screen.findByText('Set a new password for Asha')).toBeInTheDocument()
    expect(requestBody(fetchMock.mock.calls[1][1])).toEqual({ email: 'asha@example.org', otp: '123456' })
    expect(supabase.createClient).not.toHaveBeenCalled()
  })

  it('shows the throttle message from the server', async () => {
    mockFetch(() => jsonResponse({ error: 'Please wait 40s before requesting another email OTP' }, 429))
    render(<ForgotPasswordPage />)

    await requestOtp('asha@example.org')

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Please wait 40s before requesting another email OTP'))
    expect(screen.getByLabelText('Registered Email')).toBeInTheDocument()
  })
})
