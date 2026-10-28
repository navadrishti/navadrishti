import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import IndividualRegister from '@/app/individuals/register/page'
import { router } from './mocks/navigation'
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

async function verifyEmail(email = 'ravi@example.org') {
  await user.type(screen.getByLabelText('Email'), email)
  await user.click(screen.getByRole('button', { name: 'Send OTP' }))
  await screen.findByText('OTP sent to your email')
  await user.type(screen.getByLabelText('Email OTP'), '123456')
  await user.click(screen.getByRole('button', { name: 'Verify OTP' }))
  await screen.findByText('Email OTP verified')
}

describe('IndividualRegister', () => {
  beforeEach(() => {
    auth.error = null
    auth.signup.mockReset().mockResolvedValue(undefined)
    supabaseAuth.signInWithOtp.mockResolvedValue({ error: null })
    supabaseAuth.verifyOtp.mockResolvedValue({ error: null })
  })

  it('keeps submit disabled until the email OTP is verified', async () => {
    mockFetch(() => jsonResponse({ success: true }))
    render(<IndividualRegister />)

    expect(screen.getByRole('button', { name: 'Create Account' })).toBeDisabled()
    await verifyEmail()
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeEnabled()
  })

  it('creates the account and opens the individual dashboard', async () => {
    mockFetch(() => jsonResponse({ success: true }))
    render(<IndividualRegister />)
    await verifyEmail()

    await user.type(screen.getByLabelText('Full Name'), 'Ravi Kumar')
    await user.type(screen.getByLabelText('Phone Number'), '9876543210')
    await user.type(screen.getByLabelText('Age'), '29')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.type(screen.getByLabelText('Confirm Password'), 'secret123')
    await user.type(screen.getByLabelText('City'), 'Mumbai')
    await user.type(screen.getByLabelText('State/Province'), 'Maharashtra')
    await user.type(screen.getByLabelText('Pincode'), '400001')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))

    expect(auth.signup).toHaveBeenCalledWith({
      email: 'ravi@example.org',
      password: 'secret123',
      name: 'Ravi Kumar',
      user_type: 'individual',
      phone: '9876543210',
      city: 'Mumbai',
      state_province: 'Maharashtra',
      pincode: '400001',
      country: 'India',
      profile_data: { age: 29 },
    })
    expect(router.push).toHaveBeenCalledWith('/individuals/dashboard')
  })

  it('does not sign up when required fields are missing', async () => {
    mockFetch(() => jsonResponse({ success: true }))
    render(<IndividualRegister />)
    await verifyEmail()
    await user.click(screen.getByRole('button', { name: 'Create Account' }))

    expect(await screen.findByText('Name is required')).toBeInTheDocument()
    expect(screen.getByText('Phone number is required')).toBeInTheDocument()
    expect(auth.signup).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })
})
