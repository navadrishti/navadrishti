import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  fetchEvidence: vi.fn(),
  data: {
    csrProjects: [{
      id: 'project-1',
      title: 'Assigned project',
      region: 'Region',
      project_status: 'active',
      financial_access: false,
    }],
    csrTrackingAssignments: [],
    campaignLeadAssignments: [],
    campaignVolunteerAssignments: [],
    campaignLeadInvitations: [],
    projectLeadInvitations: [],
    companyProjectApplications: [],
    projectEvidenceById: {},
    csrCapabilityRentals: [],
    fetchProjectEvidenceTimeline: vi.fn(),
  },
}))
state.data.fetchProjectEvidenceTimeline = state.fetchEvidence

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

describe('direct NGO projects dashboard', () => {
  it('does not render financial details for an assigned non-lead NGO', async () => {
    render(<NGODashboard />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: /assignments/i }))
    await user.click(screen.getByRole('tab', { name: /active \(1\)/i }))

    expect(screen.getByText('Assigned project')).toBeInTheDocument()
    expect(screen.getByText(/financial and expense details are not available/i)).toBeInTheDocument()
    expect(screen.queryByText('Financial overview')).not.toBeInTheDocument()
    expect(screen.queryByText('Project expenses & materials')).not.toBeInTheDocument()
    expect(state.fetchEvidence).not.toHaveBeenCalled()
  })
})
