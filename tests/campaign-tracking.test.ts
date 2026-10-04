import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabaseFake, type FakeQuery } from './support/supabase-fake'
import { buildCampaignTracking, resolveCampaignLifecycle } from '@/lib/campaign-tracking'

vi.mock('@/lib/db', async () => {
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
      { user_id: 21, capacity: 4 },
      { user_id: 22, capacity: 1 },
      { user_id: 9, capacity: 30 },
    ],
    csr_capability_rentals: [
      { id: 'c1:7', service_offer_id: 7, status: 'outbound_dispatched', payment_status: 'paid' },
      { id: 'c1:8', service_offer_id: 8, status: 'project_active', payment_status: 'paid' },
      { id: 'c1:9', service_offer_id: 9, status: 'refunded', payment_status: 'refunded' },
    ],
  },
}

function respond(overrides: Partial<Record<string, unknown[]>> = {}) {
  const rows: Record<string, unknown[]> = {
    csr_projects: [{ id: 'p1', campaign_id: 'c1' }],
    csr_project_milestones: [
      { campaign_id: 'c1', title: 'Survey', status: 'completed', amount: 20000, due_date: '2026-10-05', milestone_order: 1 },
      { campaign_id: 'c1', title: 'Build', status: 'submitted', amount: 50000, due_date: '2026-10-20', milestone_order: 2 },
      { campaign_id: 'c1', title: 'Handover', status: 'pending', amount: 30000, due_date: null, milestone_order: 3 },
    ],
    service_engagement_assignments: [
      { id: 'a1', target_id: 'c1', target_type: 'campaign', meta: {} },
      { id: 'a2', target_id: 'c1', target_type: 'campaign', meta: {} },
      { id: 'x1', target_id: 'c1', target_type: 'service_offer', meta: {} },
    ],
    users: [{ id: 9, name: 'Green Earth' }],
    csr_payment_confirmations: [{ project_id: 'p1', amount: 20000 }],
    service_attendance_entries: [
      { assignment_id: 'a1', attendance_date: '2026-10-02', units: 4 },
      { assignment_id: 'a1', attendance_date: '2026-10-03', units: 3 },
      { assignment_id: 'x1', attendance_date: '2026-10-03', units: 1 },
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
      rentals: { total: 3, in_transit: 1, on_site: 1, refunded: 1, awaiting_payment: 0 },
    })
  })

  it('only counts confirmed milestone payments and present attendance', async () => {
    respond()
    await buildCampaignTracking([campaign], reference)
    const confirmations = supabaseFake.queries.find((query) => query.table === 'csr_payment_confirmations')
    const entries = supabaseFake.queries.find((query) => query.table === 'service_attendance_entries')
    expect(confirmations?.calls).toContainEqual(['eq', 'payment_status', 'confirmed'])
    expect(entries?.calls).toContainEqual(['eq', 'attendance_status', 'present'])
    expect(entries?.calls).toContainEqual(['in', 'assignment_id', ['a1', 'a2']])
  })

  it('skips follow-up queries when the campaign has no projects or volunteers', async () => {
    respond({ csr_projects: [], service_engagement_assignments: [] })
    const tracking = (await buildCampaignTracking([{ ...campaign, lead_ngo_user_id: null }], reference)).get('c1')
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
