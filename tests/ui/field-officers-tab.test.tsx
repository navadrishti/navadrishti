import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FieldOfficersTab } from '@/app/ngos/dashboard/field-officers/field-officers-tab'
import type { FieldOfficersState } from '@/app/ngos/dashboard/field-officers/use-field-officers'
import type { FieldOfficerIdentity } from '@/app/ngos/dashboard/field-officers/types'

function officer(overrides: Partial<FieldOfficerIdentity> = {}): FieldOfficerIdentity {
  return {
    id: 'fo-1',
    user_id: 90,
    ngo_user_id: 21,
    status: 'active',
    permissions: { can_submit_field_evidence: true },
    must_change_password: true,
    created_by: 21,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    last_login_at: null,
    deactivated_at: null,
    users: { id: 90, name: 'Ravi Officer', email: 'ravi@example.org' },
    ...overrides,
  }
}

function buildState(overrides: Partial<FieldOfficersState> = {}): FieldOfficersState {
  const officers = [officer(), officer({
    id: 'fo-2',
    user_id: 91,
    status: 'inactive',
    must_change_password: false,
    deactivated_at: '2026-11-05T12:00:00.000Z',
    users: { id: 91, name: 'Inactive Officer', email: 'inactive@example.org' },
    permissions: { can_submit_field_evidence: false },
  })]

  return {
    officers,
    filteredOfficers: officers,
    metrics: {
      total: 2,
      active: 1,
      inactive: 1,
      passwordRequired: 1,
      passwordConfigured: 1,
      recentlyCreated: 2,
    },
    loading: false,
    loadError: null,
    creating: false,
    mutatingId: null,
    form: {
      name: '',
      email: '',
      password: '',
    },
    setForm: vi.fn(),
    formError: null,
    resetError: null,
    search: '',
    setSearch: vi.fn(),
    statusFilter: 'all',
    setStatusFilter: vi.fn(),
    passwordFilter: 'all',
    setPasswordFilter: vi.fn(),
    selectedId: null,
    setSelectedId: vi.fn(),
    detail: null,
    detailLoading: false,
    detailError: null,
    editName: '',
    setEditName: vi.fn(),
    resetDialogOpen: false,
    setResetDialogOpen: vi.fn(),
    resetTarget: null,
    resetPassword: '',
    setResetPassword: vi.fn(),
    resetConfirmPassword: '',
    setResetConfirmPassword: vi.fn(),
    resettingPassword: false,
    fetchOfficers: vi.fn(),
    createOfficer: vi.fn((e) => e.preventDefault()),
    updateStatus: vi.fn(),
    saveProfile: vi.fn(),
    openResetDialog: vi.fn(),
    closeResetDialog: vi.fn(),
    handleResetPassword: vi.fn(),
    assignments: [],
    assignmentsByOfficer: {},
    filteredAssignments: [],
    assignmentMetrics: { total: 0, active: 0, inactive: 0 },
    assignmentsLoading: false,
    assignmentsError: null,
    eligibleProjects: [],
    filteredEligibleProjects: [],
    eligibleLoading: false,
    eligibleError: null,
    projectSearch: '',
    setProjectSearch: vi.fn(),
    assignmentStatusFilter: 'all',
    setAssignmentStatusFilter: vi.fn(),
    selectedProjectIds: [],
    toggleProjectSelection: vi.fn(),
    assigningProjects: false,
    assignSelectedProjects: vi.fn(),
    assignProjectsToOfficer: vi.fn(),
    assignDraftByOfficer: {},
    setAssignDraftByOfficer: vi.fn(),
    saveAssignmentDraft: vi.fn(),
    mutatingAssignmentId: null,
    updateAssignmentStatus: vi.fn(),
    fetchAssignments: vi.fn(),
    fetchEligibleProjects: vi.fn(),
    verified: true,
    ...overrides,
  } as FieldOfficersState
}

describe('FieldOfficersTab', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('shows verification gate for unverified NGOs', () => {
    render(<FieldOfficersTab fo={buildState({ verified: false })} />)
    expect(screen.getByText(/Verification required/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Create Field Officer/i })).not.toBeInTheDocument()
  })

  it('renders metrics and officer rows from provided data', () => {
    render(<FieldOfficersTab fo={buildState()} />)
    expect(screen.getByText('Total officers')).toBeInTheDocument()
    expect(screen.getByText('Ravi Officer')).toBeInTheDocument()
    expect(screen.getByText('Inactive Officer')).toBeInTheDocument()
    expect(screen.getAllByText('Password change required').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Password configured').length).toBeGreaterThan(0)
  })

  it('shows empty state when filters yield no officers', () => {
    render(
      <FieldOfficersTab
        fo={buildState({
          filteredOfficers: [],
          officers: [officer()],
        })}
      />
    )
    expect(screen.getByText(/No field officers match these filters/i)).toBeInTheDocument()
  })

  it('shows load error with retry', async () => {
    const user = userEvent.setup()
    const fetchOfficers = vi.fn()
    render(
      <FieldOfficersTab
        fo={buildState({
          loadError: 'Unable to load field officers.',
          filteredOfficers: [],
          officers: [],
          fetchOfficers,
        })}
      />
    )
    expect(screen.getByText(/Could not load officers/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Try again/i }))
    expect(fetchOfficers).toHaveBeenCalled()
  })

  it('submits create form through the hook handler', async () => {
    const user = userEvent.setup()
    const createOfficer = vi.fn(async (e: { preventDefault: () => void }) => {
      e.preventDefault()
    })
    const setForm = vi.fn()
    render(
      <FieldOfficersTab
        fo={buildState({
          createOfficer,
          setForm,
          form: {
            name: 'New Officer',
            email: 'new@example.org',
            password: 'Password1!',
          },
        })}
      />
    )
    expect(screen.getByLabelText(/Full name/i)).toHaveValue('New Officer')
    expect(screen.queryByText(/Submit field evidence/i)).not.toBeInTheDocument()
    expect(setForm).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Create Field Officer/i }))
    expect(createOfficer).toHaveBeenCalled()
  })

  it('opens detail selection and triggers status toggle', async () => {
    const user = userEvent.setup()
    const setSelectedId = vi.fn()
    const updateStatus = vi.fn()
    render(<FieldOfficersTab fo={buildState({ setSelectedId, updateStatus })} />)

    await user.click(screen.getByText('Ravi Officer'))
    expect(setSelectedId).toHaveBeenCalledWith('fo-1')

    const row = screen.getByText('Ravi Officer').closest('tr')
    expect(row).toBeTruthy()
    const deactivate = within(row as HTMLElement).getByTitle('Deactivate')
    await user.click(deactivate)
    expect(updateStatus).toHaveBeenCalledWith('fo-1', 'inactive')
  })

  it('shows detail sections for selected officer activity', () => {
    render(
      <FieldOfficersTab
        fo={buildState({
          selectedId: 'fo-1',
          detail: officer({
            activity: [
              {
                id: 'a1',
                event_type: 'ngo_field_officer_created',
                event_payload: {},
                created_at: '2026-11-01T10:00:00.000Z',
                created_by: 21,
              },
            ],
          }),
          editName: 'Ravi Officer',
          assignmentsByOfficer: {},
          assignments: [
            {
              id: 'asg-1',
              field_officer_identity_id: 'fo-1',
              field_officer_user_id: 90,
              ngo_user_id: 21,
              project_id: 'proj-1',
              status: 'active',
              assigned_by: 21,
              assigned_at: '2026-11-02T10:00:00.000Z',
              deactivated_at: null,
              created_at: '2026-11-02T10:00:00.000Z',
              updated_at: '2026-11-02T10:00:00.000Z',
              project: {
                id: 'proj-1',
                title: 'Clean Water Drive',
                project_status: 'active',
                region: 'Pune',
              },
            },
          ],
          filteredAssignments: [
            {
              id: 'asg-1',
              field_officer_identity_id: 'fo-1',
              field_officer_user_id: 90,
              ngo_user_id: 21,
              project_id: 'proj-1',
              status: 'active',
              assigned_by: 21,
              assigned_at: '2026-11-02T10:00:00.000Z',
              deactivated_at: null,
              created_at: '2026-11-02T10:00:00.000Z',
              updated_at: '2026-11-02T10:00:00.000Z',
              project: {
                id: 'proj-1',
                title: 'Clean Water Drive',
                project_status: 'active',
                region: 'Pune',
              },
            },
          ],
          assignmentMetrics: { total: 1, active: 1, inactive: 0 },
          eligibleProjects: [
            {
              id: 'proj-2',
              title: 'School Kits',
              project_status: 'planning',
              region: 'Nashik',
            },
          ],
          filteredEligibleProjects: [
            {
              id: 'proj-2',
              title: 'School Kits',
              project_status: 'planning',
              region: 'Nashik',
            },
          ],
        })}
      />
    )
    expect(screen.getByText('Officer detail')).toBeInTheDocument()
    expect(screen.getByText('Account activity')).toBeInTheDocument()
    expect(screen.getByText('Account created')).toBeInTheDocument()
    expect(screen.getByText('Project assignments')).toBeInTheDocument()
    expect(screen.getAllByText('Clean Water Drive').length).toBeGreaterThan(0)
    expect(screen.getAllByText('School Kits').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Save permissions/i })).not.toBeInTheDocument()
    expect(screen.getByText(/Evidence submission enabled/i)).toBeInTheDocument()
    expect(screen.queryByText(/Register device/i)).not.toBeInTheDocument()
  })

  it('hides select project and remove when the officer is locked into a project', () => {
    const lockedAssignment = {
      id: 'asg-locked',
      field_officer_identity_id: 'fo-1',
      field_officer_user_id: 90,
      ngo_user_id: 21,
      project_id: 'proj-locked',
      status: 'active',
      assigned_by: 21,
      assigned_at: '2026-10-01T10:00:00.000Z',
      deactivated_at: null,
      created_at: '2026-10-01T10:00:00.000Z',
      updated_at: '2026-10-01T10:00:00.000Z',
      assignment_editable: false,
      assignment_lock: {
        startDate: '2026-10-29',
        startAt: '2026-10-28T18:30:00.000Z',
        lockAt: '2026-10-26T18:30:00.000Z',
        locked: true,
        timeZone: 'Asia/Kolkata',
      },
      project: {
        id: 'proj-locked',
        title: 'E2E Synthetic CSR Project',
        project_status: 'active',
        region: 'Pune',
        start_date: '2026-10-29',
      },
    }

    render(
      <FieldOfficersTab
        fo={buildState({
          assignmentsByOfficer: { 'fo-1': [lockedAssignment] },
          eligibleProjects: [
            {
              id: 'proj-2',
              title: 'School Kits',
              project_status: 'planning',
              region: 'Nashik',
              start_date: '2026-12-01',
              assignment_editable: true,
              assignment_lock: {
                startDate: '2026-12-01',
                startAt: '2026-11-30T18:30:00.000Z',
                lockAt: '2026-11-28T18:30:00.000Z',
                locked: false,
                timeZone: 'Asia/Kolkata',
              },
            },
          ],
        })}
      />
    )

    const row = screen.getByText('Ravi Officer').closest('tr')
    expect(row).toBeTruthy()
    expect(within(row as HTMLElement).getByText(/E2E Synthetic CSR Project/i)).toBeInTheDocument()
    expect(within(row as HTMLElement).getByText(/locked/i)).toBeInTheDocument()
    expect(within(row as HTMLElement).queryByRole('button', { name: /Remove/i })).not.toBeInTheDocument()
    expect(
      within(row as HTMLElement).queryByRole('combobox', {
        name: /Assign project to Ravi Officer/i,
      })
    ).not.toBeInTheDocument()
    expect(within(row as HTMLElement).queryByRole('button', { name: /^Save$/i })).not.toBeInTheDocument()
    expect(
      within(row as HTMLElement).queryByText(/No eligible projects available to assign/i)
    ).not.toBeInTheDocument()
  })
})
