import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CompanyRegistration from '@/app/companies/register/page'
import { jsonResponse, mockFetch } from './helpers'

const user = userEvent.setup({ delay: null })

const auth = vi.hoisted(() => ({
  error: null as string | null,
  signup: vi.fn(),
  clearError: vi.fn(),
}))

const supabaseAuth = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
}))

vi.mock('@/components/header', () => ({ AuthCardBackRow: () => null }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => auth }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({ auth: supabaseAuth }) }))
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

async function verifyEmail(email = 'hr@acme.com') {
  await user.type(screen.getByLabelText('Email'), email)
  await user.click(screen.getByRole('button', { name: 'Send OTP' }))
  await screen.findByText('OTP sent to your email')
  await user.type(screen.getByLabelText('Email OTP'), '123456')
  await user.click(screen.getByRole('button', { name: 'Verify OTP' }))
  await screen.findByText('Email OTP verified')
}

describe('CompanyRegistration', () => {
  beforeEach(() => {
    auth.error = null
    supabaseAuth.signInWithOtp.mockResolvedValue({ error: null })
    supabaseAuth.verifyOtp.mockResolvedValue({ error: null })
  })

  it('keeps submit disabled until the email OTP is verified', async () => {
    mockFetch(() => jsonResponse({ success: true }))
    render(<CompanyRegistration />)

    const submit = screen.getByRole('button', { name: 'Create Company Account' })
    expect(submit).toBeDisabled()

    await verifyEmail()

    expect(submit).toBeEnabled()
    expect(supabaseAuth.verifyOtp).toHaveBeenCalledWith({ email: 'hr@acme.com', token: '123456', type: 'email' })
  })

  it('rejects an invalid email before sending OTP', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ success: true }))
    render(<CompanyRegistration />)

    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Send OTP' }))

    expect(await screen.findByText('Email is invalid')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/prepare-email-otp', expect.anything())
    expect(supabaseAuth.signInWithOtp).not.toHaveBeenCalled()
  })

  it('shows an OTP error when verification fails', async () => {
    mockFetch(() => jsonResponse({ success: true }))
    supabaseAuth.verifyOtp.mockResolvedValue({ error: new Error('Token has expired or is invalid') })
    render(<CompanyRegistration />)

    await user.type(screen.getByLabelText('Email'), 'hr@acme.com')
    await user.click(screen.getByRole('button', { name: 'Send OTP' }))
    await user.type(await screen.findByLabelText('Email OTP'), '000000')
    await user.click(screen.getByRole('button', { name: 'Verify OTP' }))

    expect(await screen.findByText('OTP has expired or is invalid')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Company Account' })).toBeDisabled()
  })

  it('shows validation errors and does not sign up', async () => {
    mockFetch(() => jsonResponse({ success: true }))
    render(<CompanyRegistration />)
    await verifyEmail()

    await user.type(screen.getByLabelText('Password'), 'short')
    await user.type(screen.getByLabelText('Confirm Password'), 'different')
    await user.click(screen.getByRole('button', { name: 'Create Company Account' }))

    expect(await screen.findByText('Company name is required')).toBeInTheDocument()
    expect(screen.getByText('Industry is required')).toBeInTheDocument()
    expect(screen.getByText('Phone number is required')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    expect(screen.getByText('Company size is required')).toBeInTheDocument()
    expect(auth.signup).not.toHaveBeenCalled()
  })

  it('clears a field error when the field changes', async () => {
    mockFetch(() => jsonResponse({ success: true }))
    render(<CompanyRegistration />)
    await verifyEmail()

    await user.click(screen.getByRole('button', { name: 'Create Company Account' }))
    await screen.findByText('Company name is required')

    await user.type(screen.getByLabelText('Company Name'), 'Acme')
    expect(screen.queryByText('Company name is required')).not.toBeInTheDocument()
  })

  it('resets verification when the email changes', async () => {
    mockFetch(() => jsonResponse({ success: true }))
    render(<CompanyRegistration />)
    await verifyEmail()

    await user.type(screen.getByLabelText('Email'), 'x')

    expect(screen.queryByText('Email OTP verified')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Company Account' })).toBeDisabled()
  })
})
