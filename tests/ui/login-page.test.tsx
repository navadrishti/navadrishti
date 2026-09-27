import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '@/app/login/page'
import type { User } from '@/lib/auth-context'
import { router } from './mocks/navigation'

const auth = vi.hoisted(() => ({
  user: null as User | null,
  error: null as string | null,
  login: vi.fn(),
  clearError: vi.fn(),
}))

vi.mock('@/components/header', () => ({ AuthCardBackRow: () => null }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => auth }))

describe('LoginPage', () => {
  beforeEach(() => {
    auth.user = null
    auth.error = null
    auth.login.mockResolvedValue(undefined)
  })

  it('submits email and password', async () => {
    render(<LoginPage />)

    await userEvent.type(screen.getByLabelText('Email'), 'alice@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    expect(auth.clearError).toHaveBeenCalled()
    expect(auth.login).toHaveBeenCalledWith('alice@example.com', 'secret123')
  })

  it('marks both fields as required', () => {
    render(<LoginPage />)
    expect(screen.getByLabelText('Email')).toBeRequired()
    expect(screen.getByLabelText('Password')).toBeRequired()
  })

  it('shows Signing In while the request is pending', async () => {
    let finish: () => void = () => {}
    auth.login.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
    render(<LoginPage />)

    await userEvent.type(screen.getByLabelText('Email'), 'alice@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    expect(screen.getByRole('button', { name: 'Signing In...' })).toBeDisabled()
    finish()
    expect(await screen.findByRole('button', { name: 'Sign In' })).toBeEnabled()
  })

  it('shows the auth error', () => {
    auth.error = 'Invalid email or password'
    render(<LoginPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password')
  })

  it('redirects a signed-in NGO to its dashboard', async () => {
    auth.user = { id: 1, email: 'n@example.org', name: 'NGO', user_type: 'ngo' }
    render(<LoginPage />)
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/ngos/dashboard'))
  })

  it('links to forgot password and register', () => {
    render(<LoginPage />)
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password')
    expect(screen.getByRole('link', { name: 'Create one' })).toHaveAttribute('href', '/register')
  })
})
