import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  data: {
    csrProjects: [],
    csrTrackingAssignments: [],
    campaignLeadAssignments: [],
    campaignVolunteerAssignments: [{
      id: 'campaign-1', campaign_id: 'campaign-1', campaign_title: 'Participation campaign',
      campaign_location: 'Village', campaign_status: 'active', lifecycle: 'running',
    }],
    campaignLeadInvitations: [],
    projectLeadInvitations: [],
    companyProjectApplications: [],
    projectEvidenceById: {},
    csrCapabilityRentals: [],
    fetchProjectEvidenceTimeline: vi.fn(),
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams('tab=csr-projects'),
}))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('@/components/protected-route', () => ({ default: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/components/header', () => ({ Header: () => null }))
vi.mock('@/hooks/use-payout-connection', () => ({
  usePayoutConnection: () => ({ connected: false }),
  dashboardProfilePayoutHref: () => '#',
}))
vi.mock('@/app/ngos/dashboard/use-ngo-dashboard-data', () => ({ useNgoDashboardData: () => state.data }))
vi.mock('@/app/ngos/dashboard/use-ngo-dashboard-actions', () => ({ useNgoDashboardActions: () => ({}) }))
vi.mock('@/app/ngos/dashboard/field-officers/use-field-officers', () => ({ useFieldOfficers: () => ({}) }))

import NGODashboard from '@/app/ngos/dashboard/page'

afterEach(() => vi.unstubAllGlobals())

describe('direct participation dashboard access', () => {
  it('shows a participating NGO progress view rather than individual attendance or financial controls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {
        project: { title: 'Water project', location: 'Village', status: 'active', updated_at: null },
        participation: { association: 'campaign_registration', assignment_status: null, joined_at: null },
        progress: { total: 1, completed: 0, percentage: 0, current_milestone_id: 'm1' },
        milestones: [{ id: 'm1', title: 'First milestone', status: 'pending', updated_at: null }],
        own_evidence: [],
      } }),
    }))
    render(<NGODashboard />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: /assignments \(1\)/i }))
    await user.click(screen.getByRole('tab', { name: /active \(1\)/i }))
    expect(await screen.findByText('Water project')).toBeInTheDocument()
    expect(screen.getByText('Current milestone')).toBeInTheDocument()
    expect(screen.getByText('First milestone', { selector: 'p' })).toBeInTheDocument()
    expect(screen.queryByText(/check.in|actual expenditure|funds disbursed|financial overview/i)).not.toBeInTheDocument()
    expect(state.data.fetchProjectEvidenceTimeline).not.toHaveBeenCalled()
  })
})
