import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabaseFake, type FakeQuery } from './support/supabase-fake'
import { buildCampaignTracking, campaignShowsFieldAttendance, resolveCampaignLifecycle } from '@/lib/campaign-tracking'

vi.mock('@/lib/db/client', async () => {
  const { supabaseFake: fake } = await import('./support/supabase-fake')
  return { supabase: fake.client }
})

const reference = new Date('2026-10-10T06:00:00Z')

const campaign = {
  id: 'c1',
  status: 'active',
  start_date: '2026-10-01',
  end_date: '2026-10-30',
  budget_inr: 100000,
  lead_ngo_user_id: 9,
  impact_metrics: {
    lead_ngo_accepted: true,
    volunteer_requirement: 10,
    volunteer_applications: [
      { user_id: 21, name: 'Ravi', user_type: 'individual', capacity: 4 },
      { user_id: 22, name: 'Meera', user_type: 'individual', capacity: 1 },
      { user_id: 9, capacity: 30 },
    ],
    csr_capability_rentals: [
      { id: 'c1:7', service_offer_id: 7, status: 'outbound_dispatched', payment_status: 'paid', offer_type: 'material' },
      { id: 'c1:8', service_offer_id: 8, status: 'project_active', payment_status: 'paid', assignment_id: 'x1', offer_type: 'skill' },
      { id: 'c1:9', service_offer_id: 9, status: 'refunded', payment_status: 'refunded' },
      {
        id: 'c1:10',
        service_offer_id: 10,
        status: 'return_delivered',
        payment_status: 'paid',
        offer_type: 'material',
        outbound_delivered_at: '2026-10-02T09:00:00.000Z',
        project_completed_at: '2026-10-07T18:00:00.000Z',
        return_dispatched_at: '2026-10-08T09:00:00.000Z',
        return_delivered_at: '2026-10-09T11:30:00.000Z',
        return_delivery: { tracking_id: 'RET-10' },
      },
    ],
  },
}

function respond(overrides: Partial<Record<string, unknown[]>> = {}) {
  const rows: Record<string, unknown[]> = {
    csr_projects: [{ id: 'p1', campaign_id: 'c1' }],
    csr_project_milestones: [
      { id: 'm1', campaign_id: 'c1', title: 'Survey', status: 'completed', amount: 20000, due_date: '2026-10-05', milestone_order: 1 },
      { id: 'm2', campaign_id: 'c1', title: 'Build', status: 'submitted', amount: 50000, due_date: '2026-10-20', milestone_order: 2 },
      { id: 'm3', campaign_id: 'c1', title: 'Handover', status: 'pending', amount: 30000, due_date: null, milestone_order: 3 },
    ],
    service_engagement_assignments: [
      { id: 'a1', target_id: 'c1', target_type: 'campaign', assignee_user_id: 21, meta: {} },
      { id: 'a2', target_id: 'c1', target_type: 'campaign', assignee_user_id: 22, meta: {} },
      {
        id: 'x1',
        target_id: 'c1',
        target_type: 'csr_project',
        assignee_user_id: 9,
        owner_user_id: 40,
        meta: { flow: 'csr_capability_rental', campaign_id: 'c1', service_offer_id: 8 },
      },
    ],
    users: [
      { id: 9, name: 'Green Earth', user_type: 'ngo' },
      { id: 21, name: 'Ravi', user_type: 'individual' },
      { id: 22, name: 'Meera', user_type: 'individual' },
      { id: 50, name: 'Priya CA' },
    ],
    csr_payment_confirmations: [
      { project_id: 'p1', milestone_id: 'm1', amount: 20000, payment_status: 'confirmed', confirmed_at: '2026-10-06T12:00:00.000Z' },
    ],
    csr_milestone_evidence: [
      { id: 'e1', milestone_id: 'm1', submission_status: 'submitted', uploaded_at: '2026-10-04T08:00:00.000Z' },
      { id: 'e2', milestone_id: 'm2', submission_status: 'submitted', uploaded_at: '2026-10-08T08:00:00.000Z' },
    ],
    csr_milestone_reviews: [
      {
        milestone_id: 'm1',
        evidence_id: 'e1',
        reviewer_id: 50,
        decision: 'approved',
        reviewed_at: '2026-10-05T10:00:00.000Z',
      },
    ],
    company_ca_action_log: [
      {
        milestone_id: 'm1',
        company_ca_identity_id: 'ca1',
        action_type: 'milestone_approved',
        created_at: '2026-10-05T10:00:00.000Z',
        payload: { evidence_id: 'e1' },
      },
    ],
    company_ca_identities: [{ id: 'ca1', user_id: 50, ca_id: 'CAID-6-001' }],
    service_attendance_entries: [
      { assignment_id: 'a1', attendance_date: '2026-10-02', units: 4 },
      { assignment_id: 'a1', attendance_date: '2026-10-03', units: 3 },
      { assignment_id: 'x1', attendance_date: '2026-10-03', units: 1 },
    ],
    service_offers: [
      { id: 7, title: 'Water tank', offer_type: 'material' },
      { id: 8, title: 'Site engineer', offer_type: 'skill' },
      { id: 9, title: 'Refunded kit', offer_type: 'material' },
      { id: 10, title: 'Generator', offer_type: 'material' },
    ],
    ...overrides,
  }
  supabaseFake.respondWith((query: FakeQuery) => ({ data: rows[query.table] ?? [] }))
}

beforeEach(() => {
  supabaseFake.reset()
})

describe('resolveCampaignLifecycle', () => {
  it.each([
    [{ status: 'draft', impact_metrics: {} }, 'awaiting_lead'],
    [{ status: 'draft', impact_metrics: { lead_ngo_accepted: true } }, 'draft'],
    [{ status: 'active', start_date: '2026-11-01' }, 'upcoming'],
    [{ status: 'active', start_date: '2026-10-01', end_date: '2026-10-05' }, 'ended'],
    [{ status: 'active', start_date: '2026-10-01', end_date: '2026-10-30' }, 'running'],
    [{ status: 'completed' }, 'completed'],
    [{ status: 'cancelled' }, 'cancelled'],
  ])('%j is %s', (row, expected) => {
    expect(resolveCampaignLifecycle({ id: 'c1', ...row }, reference)).toBe(expected)
  })
})

describe('buildCampaignTracking', () => {
  it('summarises volunteers, milestones, spend and rentals for a campaign', async () => {
    respond()
    const tracking = (await buildCampaignTracking([campaign], reference)).get('c1')

    expect(tracking).toMatchObject({
      lifecycle: 'running',
      days_total: 30,
      days_elapsed: 10,
      lead_ngo: { id: 9, name: 'Green Earth', accepted: true },
      volunteers: { required: 10, enrolled: 2, people_committed: 5, checked_in: 1, person_days: 7, last_attendance_at: '2026-10-03' },
      milestones: { total: 3, submitted: 1, approved: 0, paid: 1, next: { title: 'Build', status: 'submitted', due_date: '2026-10-20' } },
      budget: { budget_inr: 100000, milestone_value_inr: 100000, paid_inr: 20000 },
      rentals: { total: 4, in_transit: 1, on_site: 1, refunded: 1, awaiting_payment: 0, closed: 1 },
      attendance: {
        as_of: '2026-10-10',
        expected_volunteers: 5,
        present_volunteers_today: 0,
        expected_capabilities: 3,
        present_capabilities_today: 0,
      },
    })
    expect(tracking?.attendance?.volunteers.map((row) => [row.name, row.today, row.days_present, row.days_absent])).toEqual([
      ['Ravi', 'absent', 2, 8],
      ['Meera', 'absent', 0, 10],
    ])
    expect(tracking?.attendance?.volunteers.some((row) => row.user_id === 9)).toBe(false)
    expect(tracking?.attendance?.capabilities.map((row) => [row.title, row.today, row.on_site, row.returned_to_owner, row.return_delivered_at])).toEqual([
      ['Water tank', 'absent', false, false, null],
      ['Site engineer', 'absent', true, false, null],
      ['Refunded kit', 'not_due', false, false, null],
      ['Generator', 'absent', false, true, '2026-10-09T11:30:00.000Z'],
    ])
    expect(tracking?.milestone_trail?.map((row) => [row.title, row.status, row.payment_done, row.paid_at])).toEqual([
      ['Survey', 'completed', true, '2026-10-06T12:00:00.000Z'],
      ['Build', 'submitted', false, null],
      ['Handover', 'pending', false, null],
    ])
    expect(tracking?.milestone_trail?.[0].evidence[0]).toMatchObject({
      id: 'e1',
      submitted_at: '2026-10-04T08:00:00.000Z',
      review: {
        decision: 'approved',
        reviewed_at: '2026-10-05T10:00:00.000Z',
        reviewer_name: 'Priya CA',
        reviewer_ca_id: 'CAID-6-001',
        reviewer_kind: 'company_ca',
      },
    })
    expect(tracking?.milestone_trail?.[1].evidence[0].review).toBeNull()
    expect(tracking?.attendance?.volunteer_days).toHaveLength(30)
    expect(tracking?.attendance?.volunteer_days[0]).toEqual({
      date: '2026-10-01',
      present_people: 0,
      expected_people: 5,
      due: true,
    })
    expect(tracking?.attendance?.volunteer_days.find((day) => day.date === '2026-10-02')).toEqual({
      date: '2026-10-02',
      present_people: 4,
      expected_people: 5,
      due: true,
    })
    expect(tracking?.attendance?.volunteer_days.at(-1)).toEqual({
      date: '2026-10-30',
      present_people: 0,
      expected_people: 5,
      due: false,
    })
    expect(tracking?.attendance?.capability_days).toHaveLength(30)
    expect(tracking?.attendance?.capability_days.find((day) => day.date === '2026-10-03')).toEqual({
      date: '2026-10-03',
      present_people: 1,
      expected_people: 3,
      due: true,
    })
  })

  it('counts every start-to-end day for volunteers, NGOs and capabilities', async () => {
    const longCampaign = {
      ...campaign,
      status: 'completed',
      start_date: '2026-07-01',
      end_date: '2026-10-01',
      impact_metrics: {
        ...campaign.impact_metrics,
        volunteer_applications: [
          { user_id: 21, name: 'Ravi', user_type: 'individual', capacity: 1 },
          { user_id: 24, name: 'Hope Foundation NGO', user_type: 'ngo', capacity: 1 },
        ],
      },
    }
    respond({
      service_engagement_assignments: [
        { id: 'a1', target_id: 'c1', target_type: 'campaign', assignee_user_id: 21, meta: {} },
        {
          id: 'a24',
          target_id: 'c1',
          target_type: 'campaign',
          assignee_user_id: 24,
          meta: { volunteer_user_type: 'ngo' },
        },
        {
          id: 'x1',
          target_id: 'c1',
          target_type: 'csr_project',
          assignee_user_id: 9,
          owner_user_id: 40,
          meta: { flow: 'csr_capability_rental', campaign_id: 'c1', service_offer_id: 8 },
        },
      ],
      users: [
        { id: 9, name: 'Green Earth', user_type: 'ngo' },
        { id: 21, name: 'Ravi', user_type: 'individual' },
        { id: 24, name: 'Hope Foundation NGO', user_type: 'ngo' },
      ],
      service_attendance_entries: [
        { assignment_id: 'a1', attendance_date: '2026-07-01', units: 1 },
        { assignment_id: 'a24', attendance_date: '2026-09-18', units: 1 },
        { assignment_id: 'x1', attendance_date: '2026-10-01', units: 1 },
      ],
    })

    const tracking = (await buildCampaignTracking([longCampaign], reference)).get('c1')
    expect(tracking?.attendance?.volunteer_days).toHaveLength(93)
    expect(tracking?.attendance?.ngo_days).toHaveLength(93)
    expect(tracking?.attendance?.capability_days).toHaveLength(93)
    expect(tracking?.attendance?.volunteer_days[0]).toMatchObject({ date: '2026-07-01', present_people: 1, expected_people: 1, due: true })
    expect(tracking?.attendance?.volunteer_days.at(-1)).toMatchObject({ date: '2026-10-01', present_people: 0, expected_people: 1, due: true })
    expect(tracking?.attendance?.ngo_days.find((day) => day.date === '2026-09-18')).toEqual({
      date: '2026-09-18',
      present_people: 1,
      expected_people: 1,
      due: true,
    })
    expect(tracking?.attendance?.capability_days.at(-1)).toEqual({
      date: '2026-10-01',
      present_people: 1,
      expected_people: 3,
      due: true,
    })
  })

  it('does not count the lead NGO as a volunteer even if they have an assignment', async () => {
    respond({
      service_engagement_assignments: [
        { id: 'a1', target_id: 'c1', target_type: 'campaign', assignee_user_id: 21, meta: {} },
        { id: 'a-lead', target_id: 'c1', target_type: 'campaign', assignee_user_id: 9, meta: { volunteer_user_type: 'ngo' } },
        {
          id: 'x1',
          target_id: 'c1',
          target_type: 'csr_project',
          assignee_user_id: 9,
          owner_user_id: 40,
          meta: { flow: 'csr_capability_rental', campaign_id: 'c1', service_offer_id: 8 },
        },
      ],
      users: [
        { id: 9, name: 'Hope Foundation NGO', user_type: 'ngo' },
        { id: 21, name: 'Ravi', user_type: 'individual' },
      ],
      service_attendance_entries: [
        { assignment_id: 'a1', attendance_date: '2026-10-02', units: 4 },
      ],
    })

    const tracking = (await buildCampaignTracking([campaign], reference)).get('c1')
    expect(tracking?.attendance?.volunteers.map((row) => row.name)).toEqual(['Ravi', 'Meera'])
    expect(tracking?.attendance?.ngo_days.every((day) => day.expected_people === 0)).toBe(true)
    expect(tracking?.volunteers.enrolled).toBe(2)
  })

  it('only counts confirmed milestone payments and present attendance', async () => {
    respond()
    await buildCampaignTracking([campaign], reference)
    const confirmations = supabaseFake.queries.find((query) => query.table === 'csr_payment_confirmations')
    const entries = supabaseFake.queries.find((query) => query.table === 'service_attendance_entries')
    expect(confirmations?.calls).toContainEqual(['eq', 'payment_status', 'confirmed'])
    expect(entries?.calls).toContainEqual(['eq', 'attendance_status', 'present'])
    expect(entries?.calls).toContainEqual(['in', 'assignment_id', ['a1', 'a2', 'x1']])
  })

  it('keeps planning meters before start and field attendance after start', () => {
    expect(campaignShowsFieldAttendance('upcoming')).toBe(false)
    expect(campaignShowsFieldAttendance('running')).toBe(true)
    expect(campaignShowsFieldAttendance('completed')).toBe(true)
  })

  it('skips follow-up queries when the campaign has no projects or volunteers', async () => {
    respond({ csr_projects: [], service_engagement_assignments: [] })
    const tracking = (
      await buildCampaignTracking(
        [
          {
            ...campaign,
            lead_ngo_user_id: null,
            impact_metrics: { lead_ngo_accepted: true, volunteer_requirement: 10 },
          },
        ],
        reference
      )
    ).get('c1')
    expect(tracking?.budget.paid_inr).toBe(0)
    expect(tracking?.lead_ngo).toBeNull()
    expect(supabaseFake.queries.map((query) => query.table)).not.toContain('csr_payment_confirmations')
    expect(supabaseFake.queries.map((query) => query.table)).not.toContain('service_attendance_entries')
  })

  it('returns nothing without campaigns', async () => {
    respond()
    await expect(buildCampaignTracking([], reference)).resolves.toEqual(new Map())
    expect(supabaseFake.queries).toHaveLength(0)
  })
})
