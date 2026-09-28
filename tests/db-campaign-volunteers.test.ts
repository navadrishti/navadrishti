import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildCampaignVolunteerAttendanceSummary,
  ensureCampaignVolunteerAssignment,
  findCampaignVolunteerAssignment,
  listCompanyCampaignVolunteerAttendance,
  processCompletedCampaignVolunteerOutcomes,
} from '@/lib/db/campaign-volunteers'
import { callsOf, createSupabaseFake, eqsOf, unknownColumns, type FakeQuery, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ supabase: { from: mocks.from } }))

let fake = createSupabaseFake()

function useDb(responder: Record<string, FakeResult[]> | ((query: FakeQuery) => FakeResult | undefined) = {}) {
  fake = createSupabaseFake(responder)
  mocks.from.mockImplementation(fake.from)
  return fake
}

beforeEach(() => {
  useDb()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-03-10T12:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
  expect(unknownColumns(fake.queries)).toEqual([])
})

const volunteerMeta = { engagement_kind: 'campaign_volunteer' }

describe('campaign volunteer assignments', () => {
  it('finds only campaign volunteer assignments', async () => {
    useDb({
      'service_engagement_assignments.select': [{
        data: [
          { id: 'a1', target_type: 'csr_project', meta: {} },
          { id: 'a2', target_type: 'csr_project', meta: volunteerMeta },
        ],
      }],
    })
    await expect(findCampaignVolunteerAssignment('c1', 7)).resolves.toMatchObject({ id: 'a2' })
    expect(eqsOf(fake.queries[0])).toEqual({ target_id: 'c1', assignee_user_id: 7 })
  })

  it('reuses an existing assignment', async () => {
    useDb({ 'service_engagement_assignments.select': [{ data: [{ id: 'a1', target_type: 'campaign', meta: {} }] }] })
    await ensureCampaignVolunteerAssignment({ campaign: { id: 'c1' }, userId: 7, userType: 'individual', capacity: 1 })
    expect(fake.find('service_engagement_assignments', 'insert')).toHaveLength(0)
  })

  it('creates an assignment owned by the campaign company', async () => {
    useDb({ 'service_engagement_assignments.insert': [{ data: { id: 'a9', meta: {} } }] })
    await expect(
      ensureCampaignVolunteerAssignment({
        campaign: { id: 'c1', title: 'Clean-up', company_id: 3 },
        userId: 7,
        userType: 'individual',
        capacity: 2,
        appliedAt: '2026-03-01T00:00:00.000Z',
      })
    ).resolves.toEqual({ id: 'a9', meta: {} })
    const [insert] = fake.find('service_engagement_assignments', 'insert')
    expect(insert.payload).toMatchObject({
      target_type: 'csr_project',
      target_id: 'c1',
      owner_user_id: 3,
      assignee_user_id: 7,
      assigned_by_user_id: 7,
      status: 'active',
      meta: { engagement_kind: 'campaign_volunteer', campaign_title: 'Clean-up', volunteer_capacity: 2 },
    })
  })

  it('throws when the insert fails', async () => {
    useDb({ 'service_engagement_assignments.insert': [{ error: { message: 'denied' } }] })
    await expect(
      ensureCampaignVolunteerAssignment({ campaign: { id: 'c1' }, userId: 7, userType: 'individual', capacity: 1 })
    ).rejects.toThrow('denied')
  })
})

const campaign = {
  id: 'c1',
  title: 'Clean-up',
  company_id: 3,
  status: 'completed',
  start_date: '2026-03-01',
  end_date: '2026-03-10',
  lead_ngo_user_id: 23,
  impact_metrics: {
    volunteer_applications: [
      { user_id: 21, name: 'Asha', user_type: 'individual', capacity: 2 },
      { user_id: 22, name: 'Ravi', capacity: 1 },
      { user_id: 23, name: 'Lead NGO', capacity: 5 },
      { user_id: 24, name: 'Meena', capacity: 1 },
    ],
  },
}

const days = (count: number) => Array.from({ length: count }, (_, index) => `2026-03-${String(index + 1).padStart(2, '0')}`)

const entries = [
  ...days(9).map((date, index) => ({
    id: `e21-${date}`,
    assignment_id: 'a21',
    attendance_date: date,
    attendance_status: 'present',
    units: 0,
    meta: index === 0 ? { photos: ['p.jpg'] } : {},
  })),
  { id: 'e21-dup', assignment_id: 'a21', attendance_date: '2026-03-01', attendance_status: 'absent', units: 1, meta: {} },
  { id: 'e22', assignment_id: 'a22', attendance_date: '2026-03-02', attendance_status: 'present', units: 3, meta: {} },
  ...days(5).map((date) => ({ id: `e24-${date}`, assignment_id: 'a24', attendance_date: date, attendance_status: 'present', units: 1, meta: {} })),
]

function campaignDb(profiles: Record<number, unknown> = {}) {
  return useDb((query) => {
    if (query.table === 'campaigns') return { data: campaign }
    if (query.table === 'service_engagement_assignments') {
      return {
        data: [21, 22, 24].map((userId) => ({ id: `a${userId}`, assignee_user_id: userId, target_type: 'csr_project', meta: volunteerMeta })),
      }
    }
    if (query.table === 'service_attendance_entries') return { data: entries }
    if (query.table === 'users' && query.op === 'select') {
      const id = Number(eqsOf(query).id)
      return { data: { id, name: `User ${id}`, profile_data: profiles[id] ?? {} } }
    }
    return undefined
  })
}

describe('buildCampaignVolunteerAttendanceSummary', () => {
  it('returns null for an unknown campaign', async () => {
    await expect(buildCampaignVolunteerAttendanceSummary('c1')).resolves.toBeNull()
  })

  it('summarises attendance per volunteer and skips the lead NGO', async () => {
    campaignDb()
    const summary = await buildCampaignVolunteerAttendanceSummary('c1')

    expect(callsOf(fake.find('service_attendance_entries')[0], 'in')).toEqual([['assignment_id', ['a21', 'a22', 'a24']]])
    expect(summary).toMatchObject({
      campaign_id: 'c1',
      company_id: 3,
      project_days: 10,
      elapsed_days: 10,
      volunteer_count: 3,
      volunteers_checked_in: 3,
      volunteers_never_checked_in: 0,
      total_capacity: 4,
      total_person_days_checked_in: 18 + 3 + 5,
    })
    expect(summary?.roster.map((row) => [row.user_id, row.days_present, row.days_absent, row.photo_sealed_days, row.last_attendance_at])).toEqual([
      [21, 9, 1, 1, '2026-03-09'],
      [22, 1, 9, 0, '2026-03-02'],
      [24, 5, 5, 0, '2026-03-05'],
    ])
  })
})

describe('processCompletedCampaignVolunteerOutcomes', () => {
  it('bans low attendance and records high attendance history', async () => {
    campaignDb({ 21: { volunteering_history: [{ campaign_id: 'other' }] } })

    await expect(processCompletedCampaignVolunteerOutcomes('c1')).resolves.toMatchObject({ banned: 1, historyWritten: 1 })

    const updates = fake.find('users', 'update')
    expect(updates.map((query) => eqsOf(query).id)).toEqual([21, 22])
    expect(updates[0].payload).toMatchObject({
      profile_data: { volunteering_history: [{ campaign_id: 'other' }, { campaign_id: 'c1', days_present: 9, attendance_rate: 90 }] },
    })
    expect(updates[1].payload).toMatchObject({
      profile_data: { volunteering_ban: { banned: true, campaign_id: 'c1', days_present: 1, project_days: 10, attendance_rate: 10 } },
    })
  })

  it('does not write history twice', async () => {
    campaignDb({ 21: { volunteering_history: [{ campaign_id: 'c1' }] } })
    await expect(processCompletedCampaignVolunteerOutcomes('c1')).resolves.toMatchObject({ historyWritten: 0 })
  })

  it('leaves active campaigns alone', async () => {
    useDb((query) => (query.table === 'campaigns' ? { data: { ...campaign, status: 'active' } } : undefined))
    await expect(processCompletedCampaignVolunteerOutcomes('c1')).resolves.toMatchObject({ banned: 0, historyWritten: 0 })
    expect(fake.find('users')).toHaveLength(0)
  })
})

describe('listCompanyCampaignVolunteerAttendance', () => {
  it('lists recent company campaigns that have volunteers', async () => {
    useDb((query) => {
      if (query.table !== 'campaigns') return undefined
      if (eqsOf(query).company_id) return { data: [{ id: 'c1' }, { id: 'c2' }] }
      return { data: eqsOf(query).id === 'c1' ? campaign : { ...campaign, id: 'c2', impact_metrics: {} } }
    })
    const summaries = await listCompanyCampaignVolunteerAttendance(3)
    expect(summaries.map((summary) => summary.campaign_id)).toEqual(['c1'])
    const [list] = fake.queries
    expect(eqsOf(list)).toEqual({ company_id: 3 })
    expect(callsOf(list, 'order')).toEqual([['updated_at', { ascending: false }]])
    expect(callsOf(list, 'limit')).toEqual([[40]])
  })
})
