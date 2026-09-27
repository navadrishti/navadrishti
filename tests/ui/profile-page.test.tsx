import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ImpactProfilePage from '@/app/profile/[id]/page'
import type { UserProfile } from '@/app/profile/[id]/types'
import { navigationState } from './mocks/navigation'

const state = vi.hoisted(() => ({
  profile: null as UserProfile | null,
  loading: false,
  error: null as string | null,
}))

vi.mock('@/components/header', () => ({ Header: () => null }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: null }) }))
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
  })

  it('shows the error view', () => {
    state.profile = null
    state.error = 'Profile not found'
    render(<ImpactProfilePage />)
    expect(screen.getByText('Profile not found')).toBeInTheDocument()
  })
})
