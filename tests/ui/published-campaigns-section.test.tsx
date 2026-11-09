import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PublishedCampaignsSection } from '@/app/companies/dashboard/published-campaigns-section'
import type { PublishedCsrCampaign } from '@/app/companies/dashboard/types'

const draft = (overrides: Partial<PublishedCsrCampaign> = {}): PublishedCsrCampaign => ({
  id: 'd1',
  title: 'hiiiiiiiiiiii',
  description: 'Draft campaign pending lead NGO acceptance.',
  category: 'Education',
  location: 'Pune',
  budget_inr: 100000,
  schedule_vii: null,
  start_date: null,
  end_date: null,
  status: 'draft',
  impact_metrics: {},
  ...overrides,
})

describe('PublishedCampaignsSection drafts', () => {
  it('shows invite progress when no lead NGO has been invited', () => {
    render(<PublishedCampaignsSection campaigns={[]} drafts={[draft()]} loading={false} />)

    expect(screen.getByText('Lead NGO invite')).toBeInTheDocument()
    expect(screen.getByText('Invite an NGO')).toBeInTheDocument()
    expect(screen.queryByText('Draft campaign pending lead NGO acceptance.')).not.toBeInTheDocument()
  })

  it('shows pending while a lead invite is outstanding', () => {
    render(
      <PublishedCampaignsSection
        campaigns={[]}
        drafts={[
          draft({
            impact_metrics: {
              lead_ngo_invites: [{ ngo_id: 9, name: 'Hope Foundation NGO', email: 'hope@ngo.org', status: 'invited' }],
            },
          }),
        ]}
        loading={false}
      />
    )

    expect(screen.getByText('Waiting for lead NGO')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('shows the selected NGO once a lead has accepted', () => {
    render(
      <PublishedCampaignsSection
        campaigns={[]}
        drafts={[
          draft({
            lead_ngo_user_id: 9,
            impact_metrics: {
              lead_ngo_accepted: true,
              lead_ngo_invites: [{ ngo_id: 9, name: 'Hope Foundation NGO', email: 'hope@ngo.org', status: 'accepted' }],
            },
          }),
        ]}
        loading={false}
      />
    )

    expect(screen.getByText('Lead NGO selected · ready to publish')).toBeInTheDocument()
    expect(screen.getByText('Hope Foundation NGO')).toBeInTheDocument()
  })

  it('does not put draft invite progress on published campaign cards', () => {
    render(
      <PublishedCampaignsSection
        campaigns={[
          {
            id: 'c1',
            title: 'Published literacy drive',
            description: 'Live campaign',
            category: 'Education',
            location: 'Pune',
            budget_inr: 100000,
            schedule_vii: null,
            start_date: '2026-10-01',
            end_date: '2026-10-30',
            status: 'active',
          },
        ]}
        drafts={[]}
        loading={false}
      />
    )

    expect(screen.getByText('Published literacy drive')).toBeInTheDocument()
    expect(screen.queryByText('Invite an NGO')).not.toBeInTheDocument()
    expect(screen.queryByText('Lead NGO invite')).not.toBeInTheDocument()
  })
})
