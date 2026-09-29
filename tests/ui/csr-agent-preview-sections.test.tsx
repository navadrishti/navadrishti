import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  LeadNgoSection,
  PublishStatusSection,
  ServiceMatchesSection,
} from '@/app/companies/csr-agent/preview-sections'
import type {
  LeadNgoInvite,
  NgoDirectoryItem,
  ServiceSuggestion,
} from '@/app/companies/csr-agent/session'

const ngos: NgoDirectoryItem[] = [
  { id: 1, name: 'Green Earth', email: 'green@example.org', score: 90 },
  { id: 2, name: 'Blue Water', email: 'blue@example.org', score: 70 },
]

const suggestion: ServiceSuggestion = {
  capability_id: 10,
  capability_name: 'Water tanker',
  similarity: 0.9,
  service_offer_id: 55,
  offer_type: 'equipment',
  transaction_type: 'rent',
  impact_area: [],
  city: 'Pune',
  state_province: 'MH',
  price_amount: 1000,
  price_type: 'fixed',
  score: 88,
}

function ngoRow(name: string) {
  const row = screen.getByText(name).closest('div.rounded-xl')
  if (!(row instanceof HTMLElement)) throw new Error(`row for ${name} not found`)
  return row
}

describe('LeadNgoSection', () => {
  it('shows Invited tag and red Remove button for pending invites', () => {
    const invites: LeadNgoInvite[] = [{ ngoId: 1, name: 'Green Earth', email: 'green@example.org', status: 'invited' }]
    render(<LeadNgoSection ngos={ngos} loading={false} invites={invites} actionsEnabled onToggleInvite={vi.fn()} />)

    const invited = within(ngoRow('Green Earth'))
    expect(invited.getByText('Invited')).toBeInTheDocument()
    const remove = invited.getByRole('button', { name: 'Remove' })
    expect(remove).toHaveClass('text-red-600')

    const other = within(ngoRow('Blue Water'))
    expect(other.queryByText('Invited')).not.toBeInTheDocument()
    expect(other.getByRole('button', { name: 'Invite' })).not.toHaveClass('text-red-600')
  })

  it('treats expired invites as not invited', () => {
    const invites: LeadNgoInvite[] = [{ ngoId: 1, name: 'Green Earth', email: 'green@example.org', status: 'expired' }]
    render(<LeadNgoSection ngos={ngos} loading={false} invites={invites} actionsEnabled onToggleInvite={vi.fn()} />)

    expect(screen.queryByText('Invited')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Invite' })).toHaveLength(2)
  })

  it('calls onToggleInvite with the ngo', async () => {
    const onToggleInvite = vi.fn()
    render(<LeadNgoSection ngos={ngos} loading={false} invites={[]} actionsEnabled onToggleInvite={onToggleInvite} />)

    await userEvent.click(within(ngoRow('Blue Water')).getByRole('button', { name: 'Invite' }))
    expect(onToggleInvite).toHaveBeenCalledWith(ngos[1])
  })

  it('disables buttons when actions are disabled', () => {
    render(<LeadNgoSection ngos={ngos} loading={false} invites={[]} actionsEnabled={false} onToggleInvite={vi.fn()} />)
    for (const button of screen.getAllByRole('button', { name: 'Invite' })) {
      expect(button).toBeDisabled()
    }
  })

  it('shows empty and loading messages', () => {
    const { rerender } = render(<LeadNgoSection ngos={[]} loading={false} invites={[]} actionsEnabled onToggleInvite={vi.fn()} />)
    expect(screen.getByText('No NGOs are registered on the platform yet.')).toBeInTheDocument()
    rerender(<LeadNgoSection ngos={[]} loading invites={[]} actionsEnabled onToggleInvite={vi.fn()} />)
    expect(screen.getByText('Loading lead NGO suggestions...')).toBeInTheDocument()
  })
})

describe('PublishStatusSection', () => {
  const base = {
    generating: false,
    campaigns: [],
    error: null,
    acceptedLead: null,
    leadLocked: false,
    questionnaireComplete: true,
    actionsEnabled: true,
    onPublish: vi.fn(),
  }
  const waiting = 'Waiting for a lead NGO to accept the invite from their dashboard.'

  it('shows waiting status when a pending invite exists', () => {
    render(<PublishStatusSection {...base} invites={[{ ngoId: 1, name: 'A', email: 'a@x.org', status: 'invited' }]} />)
    expect(screen.getByText(waiting)).toBeInTheDocument()
  })

  it('does not show waiting status without a pending invite', () => {
    render(<PublishStatusSection {...base} invites={[{ ngoId: 1, name: 'A', email: 'a@x.org', status: 'expired' }]} />)
    expect(screen.queryByText(waiting)).not.toBeInTheDocument()
    expect(screen.getByText(/Invite at least one lead NGO above/)).toBeInTheDocument()
  })

  it('explains the next step while the questionnaire is still in progress', () => {
    render(<PublishStatusSection {...base} questionnaireComplete={false} invites={[]} />)
    expect(screen.getByText('Publish')).toBeInTheDocument()
    expect(screen.getByText(/Answer the remaining questions in the chat/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()
  })

  it('shows publish button once lead accepted and drafts exist', async () => {
    const onPublish = vi.fn()
    const campaign = {
      title: 'T',
      description: '',
      category: '',
      location: '',
      budget_inr: 0,
      budget_breakdown: { infrastructure: 0, training: 0, materials: 0, monitoring: 0, contingency: 0 },
      schedule_vii: '',
      sdg_alignment: [],
      start_date: '',
      end_date: '',
      impact_metrics: { beneficiaries: 0, duration: '' },
      milestones: [],
    }
    render(
      <PublishStatusSection
        {...base}
        onPublish={onPublish}
        campaigns={[campaign]}
        invites={[]}
        acceptedLead={{ ngoId: 1, name: 'A', email: 'a@x.org', status: 'accepted' }}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }))
    expect(onPublish).toHaveBeenCalled()
  })

  it('shows generating message after lead accepted without drafts', () => {
    render(
      <PublishStatusSection
        {...base}
        invites={[]}
        acceptedLead={{ ngoId: 1, name: 'Green Earth', email: 'a@x.org', status: 'accepted' }}
      />,
    )
    expect(screen.getByText(/Green Earth accepted\. Generating your campaign draft/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()
  })

  it('replaces the spinner with the error and a retry when generation failed', async () => {
    const onRetry = vi.fn()
    render(
      <PublishStatusSection
        {...base}
        error="Budget is required before generating campaign drafts."
        invites={[]}
        acceptedLead={{ ngoId: 1, name: 'Green Earth', email: 'a@x.org', status: 'accepted' }}
        onRetry={onRetry}
      />,
    )
    expect(screen.queryByText(/Generating your campaign draft/)).not.toBeInTheDocument()
    expect(screen.getAllByText('Budget is required before generating campaign drafts.')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('locks the publish button while publishing and links to the campaign once live', () => {
    const accepted = { ngoId: 1, name: 'A', email: 'a@x.org', status: 'accepted' as const }
    const campaign = {
      title: 'T', description: '', category: '', location: '', budget_inr: 0,
      budget_breakdown: { infrastructure: 0, training: 0, materials: 0, monitoring: 0, contingency: 0 },
      schedule_vii: '', sdg_alignment: [], start_date: '', end_date: '',
      impact_metrics: { beneficiaries: 0, duration: '' }, milestones: [],
    }
    const { rerender } = render(
      <PublishStatusSection {...base} campaigns={[campaign]} invites={[]} acceptedLead={accepted} publishing />,
    )
    expect(screen.getByRole('button', { name: /Publishing/ })).toBeDisabled()

    rerender(
      <PublishStatusSection {...base} campaigns={[campaign]} invites={[]} acceptedLead={accepted} publishedCampaignId="c-9" />,
    )
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View campaign' })).toHaveAttribute('href', '/csr-campaigns/c-9')
  })
})

describe('ServiceMatchesSection', () => {
  const base = {
    suggestions: [suggestion],
    loading: false,
    error: null,
    actionsEnabled: true,
    payingOfferId: null,
    paidOfferIds: [],
    paidRentals: {},
    rentalCampaignId: 'c1',
    onRentalUpdated: vi.fn(),
  }
  const hint = 'You can pay and reserve these offers once a lead NGO accepts the campaign.'

  it('disables Pay & reserve and shows hint until lead accepted', () => {
    render(<ServiceMatchesSection {...base} leadAccepted={false} onPayAndReserve={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Pay & reserve' })).toBeDisabled()
    expect(screen.getByText(hint)).toBeInTheDocument()
  })

  it('enables Pay & reserve once lead accepted', async () => {
    const onPayAndReserve = vi.fn()
    render(<ServiceMatchesSection {...base} leadAccepted onPayAndReserve={onPayAndReserve} />)
    expect(screen.queryByText(hint)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Pay & reserve' }))
    expect(onPayAndReserve).toHaveBeenCalledWith(55, 'equipment')
  })

  it('shows Reserved for paid offers', () => {
    render(<ServiceMatchesSection {...base} leadAccepted paidOfferIds={[55]} onPayAndReserve={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Reserved' })).toBeDisabled()
  })

  it('shows Paying... while paying', () => {
    render(<ServiceMatchesSection {...base} leadAccepted payingOfferId={55} onPayAndReserve={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Paying/ })).toBeDisabled()
  })

  it('shows error instead of matches', () => {
    render(<ServiceMatchesSection {...base} error="Boom" leadAccepted onPayAndReserve={vi.fn()} />)
    expect(screen.getByText('Boom')).toBeInTheDocument()
    expect(screen.queryByText('Water tanker')).not.toBeInTheDocument()
  })
})
