import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CsrProjectsTab } from '@/app/companies/dashboard/csr-projects-tab'
import { takenInShowsWorkTracking } from '@/components/csr-tracking-project-details'
import type { CompanyDashboardData } from '@/app/companies/dashboard/use-company-dashboard-data'
import type { CsrProjectActions } from '@/app/companies/dashboard/use-csr-project-actions'

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

const data = {
  projectOpportunities: [{
    project_id: 'p1',
    project_title: 'Rural classroom setup',
    ngo_id: 3,
    ngo_name: 'Hope Foundation NGO',
    needs: [],
    company_application_status: 'none',
  }],
  loadingProjectOpportunities: false,
  fetchProjectOpportunities: vi.fn(),
  csrTrackingAssignments: [{
    project_id: 'p1',
    project_title: 'Rural classroom setup',
    lead_ngo_id: 3,
    lead_ngo_name: 'Hope Foundation NGO',
    assigned_company_id: 10,
    assigned_company_name: 'TechCorp',
    assignment_status: 'accepted',
    selected_lead_ngo_id: 3,
    selected_lead_ngo_name: 'Hope Foundation NGO',
    needs: [],
  }, {
    project_id: 'p2',
    project_title: 'Finished well repair',
    lead_ngo_id: 3,
    lead_ngo_name: 'Hope Foundation NGO',
    assigned_company_id: 10,
    assigned_company_name: 'TechCorp',
    assignment_status: 'completed',
    project_status: 'completed',
    needs: [],
  }],
  loadingCSRTrackingAssignments: false,
  fetchCSRTrackingAssignments: vi.fn(),
  publishedCsrCampaigns: [{
    id: 'c1',
    title: 'Company literacy drive',
    description: 'Created in-house',
    category: 'Education',
    location: 'Pune',
    budget_inr: 100000,
    schedule_vii: null,
    start_date: null,
    end_date: null,
    status: 'active',
  }],
  draftCsrCampaigns: [],
  loadingPublishedCsrCampaigns: false,
  fetchPublishedCsrCampaigns: vi.fn(),
  ngoDirectory: [],
  loadingNgoDirectory: false,
  refreshCsrProjects: vi.fn(),
} as unknown as CompanyDashboardData

const actions = {
  projectApplicationNote: '',
  setProjectApplicationNote: vi.fn(),
  applyingProjectId: null,
  applyToProjectOpportunity: vi.fn(),
  inviteSearchByProject: {},
  setInviteSearchByProject: vi.fn(),
  invitingProjectId: null,
  inviteLeadNgos: vi.fn(),
  revokeLeadNgoInvite: vi.fn(),
} as unknown as CsrProjectActions

describe('company CSR projects tab', () => {
  it('switches taken-in cards from listing meters to work tracking once the project is ongoing', () => {
    expect(takenInShowsWorkTracking({ assignment_status: 'accepted', project_status: 'active', needs: [] })).toBe(false)
    expect(takenInShowsWorkTracking({ assignment_status: 'accepted', project_status: 'in_progress', needs: [] })).toBe(true)
    expect(takenInShowsWorkTracking({
      assignment_status: 'accepted',
      project_status: 'active',
      needs: [{ id: 1, title: 'Desks', status: 'in_progress' }],
    })).toBe(true)
  })

  it('keeps takeover handoffs apart from company-created campaigns', async () => {
    render(<CsrProjectsTab data={data} actions={actions} allVerified />)

    expect(screen.getByRole('tab', { name: 'Takeover projects (3)' })).toHaveAttribute('data-state', 'active')
    expect(screen.getAllByText('Rural classroom setup').length).toBeGreaterThan(0)
    expect(screen.getByText('Open takeover opportunities')).toBeInTheDocument()
    expect(screen.getByText('Takeover tracking')).toBeInTheDocument()
    expect(screen.getAllByText('Owner NGO:').length).toBeGreaterThan(0)
    expect(screen.queryByText('Selected Lead NGO:')).not.toBeInTheDocument()
    expect(screen.queryByText('Finished well repair')).not.toBeInTheDocument()
    expect(screen.queryByText('Company literacy drive')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'History (1)' }))
    expect(screen.getByText('Finished well repair')).toBeInTheDocument()
    expect(screen.getByText('Currently')).toBeInTheDocument()
    expect(screen.queryByText('Invite Lead NGOs')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Made by company (1)' }))

    expect(screen.getByText('Company literacy drive')).toBeInTheDocument()
    expect(screen.getByText('Published campaigns')).toBeInTheDocument()
    expect(screen.queryByText('Open takeover opportunities')).not.toBeInTheDocument()
  })
})
