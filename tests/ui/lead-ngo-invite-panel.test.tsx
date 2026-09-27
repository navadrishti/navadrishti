import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CSRTrackingAssignment } from '@/components/csr-tracking-project-details'
import { LeadNgoInvitePanel } from '@/app/companies/dashboard/lead-ngo-invite-panel'
import type { LeadNgoInvite, NgoDirectoryItem } from '@/app/companies/dashboard/types'

const directory: NgoDirectoryItem[] = [
  { id: 1, name: 'Pending NGO', email: 'pending@example.org', csr1_valid_until: '2030-01-01' },
  { id: 2, name: 'Accepted NGO', email: 'accepted@example.org', csr1_valid_until: '2030-01-01' },
  { id: 3, name: 'Declined NGO', email: 'declined@example.org', csr1_valid_until: '2030-01-01' },
  { id: 4, name: 'Fresh NGO', email: 'fresh@example.org', csr1_valid_until: '2030-01-01' },
  { id: 5, name: 'Expiring NGO', email: 'expiring@example.org', csr1_valid_until: '2026-01-01' },
]

function invite(ngoId: number, name: string, status: string, extra: Partial<LeadNgoInvite> = {}): LeadNgoInvite {
  return { id: `inv-${ngoId}`, ngo_id: ngoId, ngo_name: name, status, ...extra }
}

function assignment(invites: LeadNgoInvite[]): CSRTrackingAssignment {
  return {
    project_id: 'proj-1',
    project_title: 'School repair',
    project_valid_until: '2027-06-30',
    lead_ngo_id: 99,
    lead_ngo_name: 'Owner NGO',
    assigned_company_id: 5,
    assigned_company_name: 'Acme',
    assignment_status: 'accepted',
    lead_ngo_invites: invites,
    needs: [],
  }
}

function renderPanel(invites: LeadNgoInvite[], overrides: Partial<Parameters<typeof LeadNgoInvitePanel>[0]> = {}) {
  const props = {
    assignment: assignment(invites),
    ngoDirectory: directory,
    loadingNgoDirectory: false,
    searchValue: '',
    onSearchChange: vi.fn(),
    allVerified: true,
    invitingProjectId: null,
    onInvite: vi.fn(),
    onRevokeInvite: vi.fn(),
    ...overrides,
  }
  render(<LeadNgoInvitePanel {...props} />)
  return props
}

function row(name: string) {
  const link = screen.getByText(name).closest('a')
  const container = link?.parentElement
  if (!container) throw new Error(`row for ${name} not found`)
  return within(container)
}

describe('LeadNgoInvitePanel', () => {
  it('shows Remove only for removable invite statuses', () => {
    renderPanel([
      invite(1, 'Pending NGO', 'invited'),
      invite(2, 'Accepted NGO', 'accepted'),
      invite(3, 'Declined NGO', 'rejected'),
    ])

    expect(row('Pending NGO').getByRole('button', { name: 'Remove' })).toBeInTheDocument()
    expect(row('Pending NGO').getByText('Pending')).toBeInTheDocument()
    expect(row('Accepted NGO').queryByRole('button')).not.toBeInTheDocument()
    expect(row('Declined NGO').queryByRole('button')).not.toBeInTheDocument()
    expect(row('Fresh NGO').getByRole('button', { name: 'Invite' })).toBeInTheDocument()
  })

  it('hides Remove for an invite selected as lead', () => {
    renderPanel([invite(1, 'Pending NGO', 'pending', { selected_as_lead: true })])

    expect(row('Pending NGO').getByText('Lead NGO')).toBeInTheDocument()
    expect(row('Pending NGO').queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })

  it('calls onRevokeInvite and onInvite with project and ngo ids', async () => {
    const props = renderPanel([invite(1, 'Pending NGO', 'invited')])

    await userEvent.click(row('Pending NGO').getByRole('button', { name: 'Remove' }))
    expect(props.onRevokeInvite).toHaveBeenCalledWith('proj-1', 1)

    await userEvent.click(row('Fresh NGO').getByRole('button', { name: 'Invite' }))
    expect(props.onInvite).toHaveBeenCalledWith('proj-1', [4])
  })

  it('excludes NGOs whose CSR-1 expires before the project ends', () => {
    renderPanel([])
    expect(screen.queryByText('Expiring NGO')).not.toBeInTheDocument()
  })

  it('disables Invite until the company is verified', () => {
    renderPanel([], { allVerified: false })
    for (const button of screen.getAllByRole('button', { name: 'Invite' })) {
      expect(button).toBeDisabled()
    }
  })

  it('shows busy labels while updating this project', () => {
    renderPanel([invite(1, 'Pending NGO', 'invited')], { invitingProjectId: 'proj-1' })
    expect(row('Pending NGO').getByRole('button', { name: 'Updating...' })).toBeDisabled()
    expect(row('Fresh NGO').getByRole('button', { name: 'Inviting...' })).toBeDisabled()
  })

  it('filters by search term', () => {
    renderPanel([], { searchValue: 'fresh' })
    expect(screen.getByText('Search Results (1)')).toBeInTheDocument()
    expect(screen.getByText('Fresh NGO')).toBeInTheDocument()
    expect(screen.queryByText('Pending NGO')).not.toBeInTheDocument()
  })
})
