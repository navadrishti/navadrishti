import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ImpactProfilePage from '@/app/profile/[id]/page'
import type { UserProfile } from '@/app/profile/[id]/types'
import { navigationState } from './mocks/navigation'

const state = vi.hoisted(() => ({
  profile: null as UserProfile | null,
  loading: false,
  error: null as string | null,
  user: null as { id: number; user_type: string } | null,
  authLoading: false,
}))

vi.mock('@/components/header', () => ({ Header: () => null }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: state.user, loading: state.authLoading }) }))
vi.mock('@/app/profile/[id]/use-public-profile', () => ({
  usePublicProfile: () => ({
    profile: state.profile,
    loading: state.loading,
    error: state.error,
    viewingDoc: null,
    setViewingDoc: vi.fn(),
  }),
}))

const baseProfile: UserProfile = {
  id: 3,
  name: 'Ravi Kumar',
  email: null,
  phone: null,
  user_type: 'individual',
  location: 'Pune',
  profile_image: '',
  city: 'Pune',
  created_at: '2025-01-15T00:00:00Z',
}

describe('ImpactProfilePage', () => {
  beforeEach(() => {
    navigationState.params = { id: '3' }
    state.profile = { ...baseProfile }
    state.loading = false
    state.error = null
    state.user = null
    state.authLoading = false
  })

  it('hides contact rows when email is null', () => {
    render(<ImpactProfilePage />)

    expect(screen.getByRole('heading', { name: 'Ravi Kumar' })).toBeInTheDocument()
    expect(screen.queryByText('Contact email')).not.toBeInTheDocument()
    expect(screen.queryByText('Contact phone')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /@/ })).not.toBeInTheDocument()
  })

  it('shows contact rows when email is present', () => {
    state.profile = { ...baseProfile, email: 'ravi@example.com', phone: '+91 98765 43210' }
    render(<ImpactProfilePage />)

    expect(screen.getByText('Contact email')).toBeInTheDocument()
    expect(screen.getByText('Contact phone')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ravi@example.com' })).toHaveAttribute('href', 'mailto:ravi@example.com')
    expect(screen.getByRole('link', { name: '+91 98765 43210' })).toHaveAttribute('href', 'tel:+919876543210')
    expect(screen.queryByText('Log in to see contact details')).not.toBeInTheDocument()
  })

  it('hides the phone row when only the email is present', () => {
    state.profile = { ...baseProfile, email: 'ravi@example.com' }
    render(<ImpactProfilePage />)

    expect(screen.getByText('Contact email')).toBeInTheDocument()
    expect(screen.queryByText('Contact phone')).not.toBeInTheDocument()
  })

  it.each(['ngo', 'company'])('asks anonymous visitors to log in for %s contact details', (userType) => {
    state.profile = { ...baseProfile, name: 'Seva Trust', user_type: userType }
    render(<ImpactProfilePage />)

    expect(screen.getByRole('link', { name: 'Log in to see contact details' })).toHaveAttribute('href', '/login')
    expect(screen.queryByText('Contact email')).not.toBeInTheDocument()
  })

  it('shows organisation contact details to signed-in visitors', () => {
    state.user = { id: 8, user_type: 'individual' }
    state.profile = { ...baseProfile, user_type: 'company', email: 'csr@acme.com', phone: '+91 90000 00000' }
    render(<ImpactProfilePage />)

    expect(screen.getByText('Contact email')).toBeInTheDocument()
    expect(screen.getByText('Contact phone')).toBeInTheDocument()
    expect(screen.queryByText('Log in to see contact details')).not.toBeInTheDocument()
  })

  it.each([
    ['an individual profile', 'individual', null, false],
    ['a signed-in visitor', 'ngo', { id: 8, user_type: 'company' }, false],
    ['a visitor while auth is loading', 'ngo', null, true],
  ])('does not show the login hint for %s', (_label, userType, user, authLoading) => {
    state.user = user
    state.authLoading = authLoading
    state.profile = { ...baseProfile, user_type: userType }
    render(<ImpactProfilePage />)

    expect(screen.queryByText('Log in to see contact details')).not.toBeInTheDocument()
  })

  it('shows the error view', () => {
    state.profile = null
    state.error = 'Profile not found'
    render(<ImpactProfilePage />)
    expect(screen.getByText('Profile not found')).toBeInTheDocument()
  })
})
