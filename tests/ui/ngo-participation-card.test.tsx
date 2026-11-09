import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NgoParticipationCard } from '@/app/ngos/dashboard/ngo-participation-card'

afterEach(() => vi.unstubAllGlobals())

describe('participating NGO project experience', () => {
  it('displays real progress and own evidence without finance or attendance controls', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {
        project: { title: 'Water project', location: 'Village', status: 'active', updated_at: null },
        participation: { association: 'campaign_participation', assignment_status: 'active', joined_at: null },
        progress: { total: 2, completed: 1, percentage: 50, current_milestone_id: 'm2' },
        milestones: [
          { id: 'm1', title: 'First', status: 'completed', updated_at: null },
          { id: 'm2', title: 'Second', status: 'review_complete', updated_at: null },
        ],
        own_evidence: [{ id: 'e1', milestone_id: 'm1', submission_status: 'submitted', created_at: null }],
      } }),
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<NgoParticipationCard lookup={{ campaignId: 'campaign-1' }} title="Campaign" />)
    expect(await screen.findByText('Water project')).toBeInTheDocument()
    expect(screen.getByText('1/2 completed · 50%')).toBeInTheDocument()
    expect(screen.getByText('Current milestone')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
    expect(screen.getByText(/Second — Review complete/)).toBeInTheDocument()
    expect(screen.getByText(/First — Submitted/)).toBeInTheDocument()
    expect(screen.getByText(/announcements and assigned activity history are not available/i)).toBeInTheDocument()
    expect(screen.queryByText(/check.in|attendance|actual expenditure|funds disbursed|milestone payment/i)).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/ngo/project-participation?campaign_id=campaign-1', expect.any(Object))
  })

  it('shows an explicit unavailable state if the participation API denies access', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    render(<NgoParticipationCard lookup={{ projectId: 'project-1' }} title="Assigned project" />)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Project participation details are unavailable.'))
    expect(screen.getByText('Assigned project')).toBeInTheDocument()
  })

  it('shows promised volunteers as a daily commitment, not as verified attendance', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-11-09T12:00:00Z'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    try {
      render(<NgoParticipationCard lookup={{ campaignId: 'campaign-1' }} title="Campaign" status="active"
        assignment={{ id: 'a', campaign_id: 'campaign-1', campaign_title: 'Campaign', lifecycle: 'started',
          campaign_status: 'active', start_date: '2026-11-09', end_date: '2026-11-10',
          volunteer_capacity: 8, assignment_status: 'active' }} />)
      expect(screen.getByText('You are a participating NGO')).toBeInTheDocument()
      expect(screen.getAllByText('Status unconfirmed')).toHaveLength(2)
      expect(screen.getByText('Volunteers promised')).toBeInTheDocument()
      expect(screen.getByText('8')).toBeInTheDocument()
      expect(screen.getByText(/Commitment active today/)).toBeInTheDocument()
      expect(screen.getByText(/not verified attendance/i)).toBeInTheDocument()
      expect(screen.queryByText('Financial overview')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Submit expense' })).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
