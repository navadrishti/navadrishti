import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CampaignTrackingPanel } from '@/components/campaign-tracking-panel'
import type { CampaignTracking } from '@/lib/campaign-tracking-types'

function tracking(overrides: Partial<CampaignTracking> = {}): CampaignTracking {
  return {
    campaign_id: 'c1',
    lifecycle: 'upcoming',
    days_total: 93,
    days_elapsed: 0,
    lead_ngo: { id: 9, name: 'Hope Foundation NGO', accepted: true },
    volunteers: {
      required: 200,
      enrolled: 0,
      people_committed: 0,
      checked_in: 0,
      person_days: 0,
      last_attendance_at: null,
    },
    milestones: { total: 0, submitted: 0, approved: 0, paid: 0, next: null },
    budget: { budget_inr: 100000, milestone_value_inr: 0, paid_inr: 0 },
    rentals: {
      total: 0,
      awaiting_payment: 0,
      in_transit: 0,
      on_site: 0,
      returning: 0,
      closed: 0,
      refunded: 0,
    },
    attendance: {
      as_of: '2026-10-10',
      expected_volunteers: 0,
      present_volunteers_today: 0,
      expected_capabilities: 0,
      present_capabilities_today: 0,
      volunteer_days: [],
      ngo_days: [],
      capability_days: [],
      volunteers: [],
      capabilities: [],
    },
    ...overrides,
  }
}

describe('CampaignTrackingPanel', () => {
  it('keeps planning meters before the campaign starts', () => {
    render(<CampaignTrackingPanel tracking={tracking()} />)

    expect(screen.getByText('Timeline')).toBeInTheDocument()
    expect(screen.getByText('Volunteers')).toBeInTheDocument()
    expect(screen.getByText('Milestones')).toBeInTheDocument()
    expect(screen.getByText('Spend')).toBeInTheDocument()
    expect(screen.getByText('Capability rentals')).toBeInTheDocument()
    expect(screen.queryByText('Volunteer attendance')).not.toBeInTheDocument()
  })

  it('shows daily volunteer and capability attendance once the campaign has started', () => {
    render(
      <CampaignTrackingPanel
        tracking={tracking({
          lifecycle: 'running',
          days_elapsed: 10,
          attendance: {
            as_of: '2026-10-10',
            expected_volunteers: 5,
            present_volunteers_today: 4,
            expected_capabilities: 2,
            present_capabilities_today: 1,
            volunteer_days: [
              { date: '2026-07-01', present_people: 0, expected_people: 5, due: true },
              { date: '2026-09-18', present_people: 0, expected_people: 5, due: true },
              { date: '2026-10-01', present_people: 4, expected_people: 5, due: true },
            ],
            ngo_days: [
              { date: '2026-07-01', present_people: 0, expected_people: 1, due: true },
              { date: '2026-09-18', present_people: 0, expected_people: 1, due: true },
              { date: '2026-10-01', present_people: 0, expected_people: 1, due: true },
            ],
            capability_days: [
              { date: '2026-07-01', present_people: 0, expected_people: 2, due: true },
              { date: '2026-09-18', present_people: 1, expected_people: 2, due: true },
              { date: '2026-10-01', present_people: 1, expected_people: 2, due: true },
            ],
            volunteers: [
              {
                user_id: 21,
                name: 'Ravi',
                user_type: 'individual',
                capacity: 4,
                today: 'present',
                days_present: 2,
                days_absent: 8,
                person_days: 7,
                last_attendance_at: '2026-10-10',
              },
              {
                user_id: 22,
                name: 'Meera',
                user_type: 'individual',
                capacity: 1,
                today: 'absent',
                days_present: 0,
                days_absent: 10,
                person_days: 0,
                last_attendance_at: null,
              },
            ],
            capabilities: [
              {
                id: 'c1:8',
                title: 'Site engineer',
                offer_type: 'skill',
                status: 'project_active',
                today: 'present',
                days_present: 3,
                days_absent: 7,
                last_attendance_at: '2026-10-10',
                on_site: true,
                outbound_delivered_at: '2026-10-02T09:00:00.000Z',
                project_completed_at: null,
                return_dispatched_at: null,
                return_delivered_at: null,
                returned_to_owner: false,
                return_tracking_id: null,
              },
              {
                id: 'c1:7',
                title: 'Water tank',
                offer_type: 'material',
                status: 'return_delivered',
                today: 'absent',
                days_present: 0,
                days_absent: 10,
                last_attendance_at: null,
                on_site: false,
                outbound_delivered_at: '2026-10-03T09:00:00.000Z',
                project_completed_at: '2026-10-08T18:00:00.000Z',
                return_dispatched_at: '2026-10-09T09:00:00.000Z',
                return_delivered_at: '2026-10-10T11:30:00.000Z',
                returned_to_owner: true,
                return_tracking_id: 'RET-7',
              },
            ],
          },
          milestone_trail: [
            {
              id: 'm1',
              title: 'Survey',
              status: 'completed',
              amount_inr: 20000,
              due_date: '2026-10-05',
              payment_done: true,
              paid_inr: 20000,
              paid_at: '2026-10-06T12:00:00.000Z',
              evidence: [
                {
                  id: 'e1',
                  submitted_at: '2026-10-04T08:00:00.000Z',
                  status: 'submitted',
                  review: {
                    decision: 'approved',
                    reviewed_at: '2026-10-05T10:00:00.000Z',
                    reviewer_name: 'Priya CA',
                    reviewer_ca_id: 'CAID-6-001',
                    reviewer_kind: 'company_ca',
                  },
                },
              ],
            },
          ],
        })}
      />
    )

    expect(screen.queryByText('Timeline')).not.toBeInTheDocument()
    expect(screen.queryByText('Capability rentals')).not.toBeInTheDocument()
    expect(screen.getByText('Today · volunteers')).toBeInTheDocument()
    expect(screen.getByText('4 of 5 people')).toBeInTheDocument()
    expect(screen.getByText('Today · capabilities')).toBeInTheDocument()
    expect(screen.getByText('1 of 2 on site')).toBeInTheDocument()
    expect(screen.getByText('Daily volunteer count')).toBeInTheDocument()
    expect(screen.getByText('Daily NGO count')).toBeInTheDocument()
    expect(screen.getByText('Daily capability count')).toBeInTheDocument()
    expect(screen.getAllByText('01/07/2026')).toHaveLength(3)
    expect(screen.getAllByText('01/10/2026')).toHaveLength(3)
    expect(screen.getByText('4/5')).toBeInTheDocument()
    expect(screen.getAllByText('0/1')).toHaveLength(3)
    expect(screen.getAllByText('1/2')).toHaveLength(2)
    expect(screen.getByText('Volunteer attendance')).toBeInTheDocument()
    expect(screen.getByText(/Ravi/)).toBeInTheDocument()
    expect(screen.getByText(/Meera/)).toBeInTheDocument()
    expect(screen.getByText(/Site engineer/)).toBeInTheDocument()
    expect(screen.getByText(/Water tank/)).toBeInTheDocument()
    expect(screen.getAllByText('Attended')).toHaveLength(2)
    expect(screen.getAllByText('Absent')).toHaveLength(2)
    expect(screen.getByText('Milestones, evidence and payment')).toBeInTheDocument()
    expect(screen.getByText('Survey')).toBeInTheDocument()
    expect(screen.getByText(/Approved by Company CA CAID-6-001/)).toBeInTheDocument()
    expect(screen.getByText(/Returned to owner/)).toBeInTheDocument()
  })

  it('shows volunteer and capability attendance to the lead NGO without listing themselves as lead', () => {
    render(
      <CampaignTrackingPanel
        viewer="lead_ngo"
        tracking={tracking({
          lifecycle: 'completed',
          attendance: {
            as_of: '2026-10-01',
            expected_volunteers: 1,
            present_volunteers_today: 0,
            expected_capabilities: 0,
            present_capabilities_today: 0,
            volunteer_days: [],
            ngo_days: [],
            capability_days: [],
            volunteers: [
              {
                user_id: 21,
                name: 'Ravi',
                user_type: 'individual',
                capacity: 1,
                today: 'absent',
                days_present: 0,
                days_absent: 93,
                person_days: 0,
                last_attendance_at: null,
              },
            ],
            capabilities: [],
          },
        })}
      />
    )

    expect(screen.getByText('You are the lead NGO')).toBeInTheDocument()
    expect(screen.queryByText('Lead NGO: Hope Foundation NGO')).not.toBeInTheDocument()
    expect(screen.getByText('Volunteer attendance')).toBeInTheDocument()
    expect(screen.getByText('Capability attendance')).toBeInTheDocument()
    expect(screen.getByText(/Ravi/)).toBeInTheDocument()
    expect(screen.getByText('No capabilities rented for this campaign.')).toBeInTheDocument()
    expect(screen.getByText('Mark each rented capability present or absent')).toBeInTheDocument()
  })
})
