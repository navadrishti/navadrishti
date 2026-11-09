import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NGORegister from '@/app/ngos/register/page'
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

async function verifyEmail(email = 'seva@example.org') {
  await user.type(screen.getByLabelText('Email'), email)
  await user.click(screen.getByRole('button', { name: 'Send OTP' }))
  await screen.findByText('OTP sent to your email')
  await user.type(screen.getByLabelText('Email OTP'), '123456')
  await user.click(screen.getByRole('button', { name: 'Verify OTP' }))
  await screen.findByText('Email OTP verified')
}

describe('NGORegister', () => {
  beforeEach(() => {
    auth.error = null
    auth.signup.mockReset().mockResolvedValue(undefined)
    supabaseAuth.signInWithOtp.mockResolvedValue({ error: null })
    supabaseAuth.verifyOtp.mockResolvedValue({ error: null })
  })

  it('keeps submit disabled until the email OTP is verified', async () => {
    mockFetch(() => jsonResponse({ success: true }))
    render(<NGORegister />)

    expect(screen.getByRole('button', { name: 'Create NGO Account' })).toBeDisabled()
    await verifyEmail()
    expect(screen.getByRole('button', { name: 'Create NGO Account' })).toBeEnabled()
  })

  it('creates the NGO account after OTP and required fields', async () => {
    mockFetch(() => jsonResponse({ success: true }))
    render(<NGORegister />)
    await verifyEmail()

    await user.type(screen.getByLabelText('NGO Name'), 'Seva Trust')
    await user.type(screen.getByLabelText('Phone Number'), '9876543210')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.type(screen.getByLabelText('Confirm Password'), 'secret123')
    await user.type(screen.getByLabelText('Registration Date'), '2015-04-01')
    await user.type(screen.getByLabelText('Exact NGO size'), '12')
    await user.click(screen.getByRole('button', { name: /Select Schedule VII sectors/ }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Education and Livelihood Enhancement' }))
    await user.keyboard('{Escape}')
    await user.type(screen.getByLabelText('Registered office address'), '1 MG Road')
    await user.type(screen.getByLabelText('City / Town'), 'Bengaluru')
    await user.click(document.getElementById('state')!)
    await user.click(await screen.findByRole('option', { name: 'Karnataka' }))
    await user.type(screen.getByLabelText('Pincode / Postal code'), '560001')
    await user.click(screen.getByRole('button', { name: 'Create NGO Account' }))

    expect(auth.signup).toHaveBeenCalledWith(expect.objectContaining({
      email: 'seva@example.org',
      name: 'Seva Trust',
      user_type: 'ngo',
      phone: '9876543210',
      city: 'Bengaluru',
      state_province: 'Karnataka',
      pincode: '560001',
      ngo_volunteer_capacity: 12,
      profile_data: expect.objectContaining({
        ngo_name: 'Seva Trust',
        registration_date: '2015-04-01',
        sectors_schedule_vii: ['Education and Livelihood Enhancement'],
        team_strength: '12',
      }),
    }))
    expect(router.push).toHaveBeenCalledWith('/ngos/dashboard')
  })

  it('shows validation errors and does not sign up', async () => {
    mockFetch(() => jsonResponse({ success: true }))
    render(<NGORegister />)
    await verifyEmail()
    await user.click(screen.getByRole('button', { name: 'Create NGO Account' }))

    expect(await screen.findByText('NGO name is required')).toBeInTheDocument()
    expect(screen.getByText('Phone number is required')).toBeInTheDocument()
    expect(auth.signup).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })
})
