import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalystCta } from '@/app/csr-campaigns/catalyst-cta'
import { AGENT_NAMES, AGENT_ROUTES } from '@/lib/ai-agent-sessions'
import CreateCsrCampaignPage from '@/app/csr-campaigns/create/page'
import type { User } from '@/lib/auth-context'
import { jsonResponse, mockFetch } from './helpers'

const auth = vi.hoisted(() => ({
  user: {
    id: 8,
    email: 'company@example.com',
    name: 'TechCorp',
    user_type: 'company',
    email_verified: true,
    phone_verified: true,
    verification_status: 'verified',
  } as User,
  token: 'tok',
  loading: false,
}))

vi.mock('@/components/header', () => ({ Header: () => null }))
vi.mock('@/components/protected-route', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => auth }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

beforeEach(() => {
  mockFetch(() => jsonResponse({ success: true, data: [] }))
})

describe('company campaign create entry', () => {
  it('offers both a manual form and Catalyst', () => {
    render(<CatalystCta />)
    expect(screen.getByRole('link', { name: 'Create campaign' })).toHaveAttribute('href', '/csr-campaigns/create')
    expect(screen.getByRole('link', { name: `Use ${AGENT_NAMES.catalyst}` })).toHaveAttribute('href', AGENT_ROUTES.catalyst)
  })

  it('renders the manual campaign form with browsable catalogs', () => {
    render(<CreateCsrCampaignPage />)
    expect(screen.getByRole('heading', { name: 'Create a CSR campaign' })).toBeInTheDocument()
    expect(screen.getByLabelText('Campaign name *')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Get suggestions' })).toBeInTheDocument()
    expect(screen.getByText('NGO Projects')).toBeInTheDocument()
    expect(screen.getByText('Capability Offers')).toBeInTheDocument()
    expect(screen.getByText('NGOs')).toBeInTheDocument()
    expect(screen.getByLabelText('Search projects')).toBeInTheDocument()
    expect(screen.getByLabelText('Search offers')).toBeInTheDocument()
    expect(screen.getByLabelText('Search NGOs')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter NGO projects by city')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter NGO projects by budget')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter NGOs by city')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter NGOs by focus area')).toBeInTheDocument()
    expect(screen.queryByText('Existing project suggestions')).not.toBeInTheDocument()
    expect(screen.queryByText(`${AGENT_NAMES.pulse} matches`)).not.toBeInTheDocument()
    expect(screen.queryByText('Possible Lead NGOs')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: `Use ${AGENT_NAMES.catalyst} instead` })).toHaveAttribute('href', AGENT_ROUTES.catalyst)
  })
})
