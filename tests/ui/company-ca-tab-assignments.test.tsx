import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CompanyCaTab } from '@/app/companies/dashboard/company-ca-tab'
import type { CompanyCaAccountsState } from '@/app/companies/dashboard/use-company-ca-accounts'
import type { CompanyCaAccount } from '@/app/companies/dashboard/types'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

function buildState(overrides: Partial<CompanyCaAccountsState> = {}): CompanyCaAccountsState {
  const setAssignmentStatus = vi.fn()
  const account = {
    id: 'ev-1',
    ca_id: 'CAID-1-001',
    user_id: 22,
    company_user_id: 10,
    status: 'active',
    users: { id: 22, name: 'Verifier One', email: 'ev@test.com' },
    assignments: [
      {
        id: 'asg-active',
        company_ca_identity_id: 'ev-1',
        project_id: 'proj-1',
        status: 'active',
        project: { id: 'proj-1', title: 'Active CSR project', project_status: 'active' },
      },
      {
        id: 'asg-inactive',
        company_ca_identity_id: 'ev-1',
        project_id: 'proj-2',
        status: 'inactive',
        project: { id: 'proj-2', title: 'Removed CSR project', project_status: 'active' },
      },
    ],
  }

  return {
    companyCAForm: {
      name: '',
      email: '',
      password: '',
      ca_id: '',
      auto_generate_ca_id: true,
    },
    setCompanyCAForm: vi.fn(),
    reusableCompanyCaIds: [],
    fetchAvailableCompanyCaIds: vi.fn(),
    creatingCompanyCA: false,
    createCompanyCAAccount: vi.fn(),
    formError: null,
    lastCreatedCompanyCA: null,
    loadingCompanyCAAccounts: false,
    companyCAAccounts: [account],
    activeCompanyCAAccounts: [account],
    inactiveCompanyCAAccounts: [],
    fetchCompanyCAAccounts: vi.fn(),
    openCaResetPasswordDialog: vi.fn(),
    updateCompanyCAStatus: vi.fn(),
    deleteCompanyCAAccount: vi.fn(),
    eligibleProjects: [],
    assignDraftByVerifier: {},
    setAssignDraftByVerifier: vi.fn(),
    assigningProjects: false,
    mutatingAssignmentId: null,
    saveAssignmentDraft: vi.fn(),
    setAssignmentStatus,
    activeAssignments: (row: CompanyCaAccount) =>
      (row.assignments ?? []).filter((a) => String(a.status).toLowerCase() === 'active'),
    inactiveAssignments: (row: CompanyCaAccount) =>
      (row.assignments ?? []).filter((a) => String(a.status).toLowerCase() === 'inactive'),
    caResetDialogOpen: false,
    setCaResetDialogOpen: vi.fn(),
    caResetTarget: null,
    caResetPassword: '',
    setCaResetPassword: vi.fn(),
    caResetConfirmPassword: '',
    setCaResetConfirmPassword: vi.fn(),
    resettingCaPassword: false,
    closeCaResetPasswordDialog: vi.fn(),
    handleResetCaPassword: vi.fn(),
    resetError: null,
    ...overrides,
  } as unknown as CompanyCaAccountsState
}

describe('CompanyCaTab assignment lifecycle', () => {
  it('shows inactive assignments with a Restore action', async () => {
    const state = buildState()
    render(<CompanyCaTab ca={state} />)

    expect(screen.getByText('Active CSR project')).toBeInTheDocument()
    expect(screen.getByText('Removed CSR project')).toBeInTheDocument()
    expect(screen.getByText('Removed assignments')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(state.setAssignmentStatus).toHaveBeenCalledWith('ev-1', 'asg-inactive', 'active')
  })

  it('disables Restore when the Evidence Verifier is inactive', () => {
    const state = buildState()
    const inactiveAccount = {
      ...state.companyCAAccounts[0],
      status: 'inactive',
    }
    const next = buildState({
      companyCAAccounts: [inactiveAccount],
      activeCompanyCAAccounts: [],
      inactiveCompanyCAAccounts: [inactiveAccount],
    })
    render(<CompanyCaTab ca={next} />)
    expect(screen.getByRole('button', { name: 'Restore' })).toBeDisabled()
  })
})
