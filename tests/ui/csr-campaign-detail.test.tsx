import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CSRCampaignDetailPage from '@/app/csr-campaigns/[id]/page'
import type { Campaign } from '@/app/csr-campaigns/[id]/types'
import type { User } from '@/lib/auth-context'
import { jsonResponse, mockFetch } from './helpers'
import { navigationState } from './mocks/navigation'

const auth = vi.hoisted(() => ({
  user: null as User | null,
  token: null as string | null,
  loading: false,
}))

vi.mock('@/components/header', () => ({ Header: () => null }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => auth }))

const ngoUser: User = {
  id: 21,
  email: 'ngo@example.org',
  name: 'Helping Hands',
  user_type: 'ngo',
  email_verified: true,
  phone_verified: true,
  verification_status: 'verified',
}

function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 'camp-1',
    title: 'Clean Water Drive',
    description: 'Install filters',
    category: 'Health',
    location: 'Pune',
    budget_inr: 500000,
    budget_breakdown: null,
    schedule_vii: null,
    sdg_alignment: null,
    impact_metrics: { volunteer_requirement: 10 },
    milestones: [],
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    start_date: '2099-01-01',
    end_date: '2099-06-01',
    company_id: 5,
    company_name: 'Acme',
    status: 'active',
    ...overrides,
  }
}

function serveCampaign(data: Campaign) {
  return mockFetch((url) => (url.startsWith('/api/campaigns/') ? jsonResponse({ success: true, data }) : jsonResponse({ success: true, data: {} })))
}

describe('CSRCampaignDetailPage', () => {
  beforeEach(() => {
    navigationState.params = { id: 'camp-1' }
    auth.user = ngoUser
    auth.token = 'tok'
    auth.loading = false
  })

  it('waits for auth to finish loading before fetching', async () => {
    auth.loading = true
    const fetchMock = serveCampaign(campaign())
    const { rerender } = render(<CSRCampaignDetailPage />)

    expect(fetchMock).not.toHaveBeenCalled()

    auth.loading = false
    rerender(<CSRCampaignDetailPage />)

    await screen.findByRole('button', { name: 'Volunteer' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/campaigns/camp-1', { headers: { Authorization: 'Bearer tok' } })
  })

  it('shows the volunteer button on an active campaign', async () => {
    serveCampaign(campaign())
    render(<CSRCampaignDetailPage />)

    expect(await screen.findByRole('button', { name: 'Volunteer' })).toBeEnabled()
    expect(screen.queryByText('Draft – not launched yet')).not.toBeInTheDocument()
  })

  it('shows a draft tag instead of the volunteer button', async () => {
    serveCampaign(campaign({ status: 'draft' }))
    render(<CSRCampaignDetailPage />)

    expect(await screen.findByText('Draft – not launched yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Volunteer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Not open yet' })).not.toBeInTheDocument()
  })

  it('lets an invited NGO accept the lead role on a draft', async () => {
    const alert = vi.fn()
    vi.stubGlobal('alert', alert)
    const draft = campaign({
      status: 'draft',
      impact_metrics: { lead_ngo_invites: [{ ngo_id: 21, name: 'Helping Hands', email: 'ngo@example.org', status: 'invited' }] },
    })
    const fetchMock = mockFetch((url) => {
      if (url === '/api/campaigns/accept-lead') {
        return jsonResponse({ success: true, data: { lead_ngo_user_id: 21, impact_metrics: { lead_ngo_accepted: true } } })
      }
      return jsonResponse({ success: true, data: draft })
    })
    render(<CSRCampaignDetailPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Accept Lead Role' }))

    expect(fetchMock).toHaveBeenCalledWith('/api/campaigns/accept-lead', expect.objectContaining({ method: 'POST', body: JSON.stringify({ campaign_id: 'camp-1' }) }))
    expect(await screen.findByText(/You accepted the lead NGO role/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accept Lead Role' })).not.toBeInTheDocument()
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('Accepted lead role'))
  })

  it('shows confirmation for an accepted draft lead', async () => {
    serveCampaign(campaign({ status: 'draft', lead_ngo_user_id: 21, impact_metrics: { lead_ngo_accepted: true } }))
    render(<CSRCampaignDetailPage />)

    expect(await screen.findByText(/You accepted the lead NGO role/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accept Lead Role' })).not.toBeInTheDocument()
    expect(screen.getByText('Draft – not launched yet')).toBeInTheDocument()
  })

  it('does not show the invite for an expired invitation', async () => {
    serveCampaign(campaign({
      status: 'draft',
      impact_metrics: { lead_ngo_invites: [{ ngo_id: 21, name: 'Helping Hands', email: 'ngo@example.org', status: 'expired' }] },
    }))
    render(<CSRCampaignDetailPage />)

    await screen.findByText('Draft – not launched yet')
    expect(screen.queryByRole('button', { name: 'Accept Lead Role' })).not.toBeInTheDocument()
  })

  it('shows an error when the campaign is missing', async () => {
    mockFetch(() => jsonResponse({ success: false, error: 'Campaign not found' }, 404))
    render(<CSRCampaignDetailPage />)

    await waitFor(() => expect(screen.getByText('Campaign not found')).toBeInTheDocument())
  })
})
