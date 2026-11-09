import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseFake, eqsOf, unknownColumns, type FakeQuery } from './support/supabase-fake'
import { jsonRequest, tokenFor } from './support/requests'
import './support/install-test-auth'

vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({
  from: vi.fn(), ensure: vi.fn(), tracking: vi.fn(), rentals: vi.fn(), loadRental: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  supabase: { from: state.from },
  ensureCampaignVolunteerAssignment: state.ensure,
}))
vi.mock('@/lib/db/client', () => ({ supabase: { from: state.from } }))
vi.mock('@/lib/campaign-tracking', () => ({ buildCampaignTracking: state.tracking }))
vi.mock('@/lib/csr-agent/campaign', () => ({
  listCsrCapabilityRentalsForUser: state.rentals,
  loadCampaignRentalByOffer: state.loadRental,
  assertCsrCapabilityDeliveryAccess: vi.fn(),
  linkCsrCapabilityRentalTracking: vi.fn(),
  previewCsrCapabilityDelhiveryParties: vi.fn(),
  retryCsrCapabilityDelhiveryBooking: vi.fn(),
  syncCsrCapabilityRentalDelhivery: vi.fn(),
}))

import { GET as participation } from '@/app/api/ngo/project-participation/route'
import { GET as volunteerAssignments } from '@/app/api/campaigns/volunteer-assignments/route'
import { POST as registerVolunteer } from '@/app/api/campaigns/[id]/volunteer/route'
import { POST as submitEvidence } from '@/app/api/milestones/[id]/evidence/route'
import { GET as listAssignments } from '@/app/api/service-assignments/route'
import { GET as getAttendance } from '@/app/api/service-assignments/[id]/attendance/route'
import { GET as campaignTracking } from '@/app/api/campaigns/tracking/route'
import { GET as leadAssignments, POST as updateLeadAssignment } from '@/app/api/campaigns/lead-assignments/route'

const projectId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const campaignId = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'
const otherId = 'cccccccc-dddd-eeee-ffff-aaaaaaaaaaaa'
const project = {
  id: projectId, title: 'Water project', region: 'Region', project_status: 'active',
  ngo_user_id: 12, campaign_id: campaignId, updated_at: null,
  total_budget: 123456,
}

function request(query: string, userId = 12, role = 'ngo') {
  return jsonRequest(`http://localhost/api/ngo/project-participation?${query}`, { token: tokenFor(userId, role) })
}

function setup(options: { application?: boolean; status?: string; otherProject?: boolean; error?: string } = {}) {
  const fake = createSupabaseFake((query: FakeQuery) => {
    const eq = eqsOf(query)
    if (query.table === 'csr_projects') {
      if (options.otherProject || (eq.id && eq.id !== projectId)) return { data: [{ ...project, id: otherId, ngo_user_id: 80 }] }
      return { data: [project] }
    }
    if (query.table === 'campaigns') return {
      data: { id: campaignId, impact_metrics: { volunteer_applications: options.application ? [{ user_id: 22, user_type: 'ngo', applied_at: '2026-01-01' }] : [] } },
    }
    if (query.table === 'service_engagement_assignments') return {
      data: options.status ? [{ id: 'a1', target_id: campaignId, target_type: 'csr_project', meta: { engagement_kind: 'campaign_volunteer' }, status: options.status, assigned_at: '2026-01-02' }] : [],
    }
    if (query.table === 'csr_project_milestones') {
      if (options.error) return { error: { message: options.error } }
      return { data: [
        { id: 'm1', title: 'First', milestone_order: 1, status: 'completed', amount: 98765, updated_at: null },
        { id: 'm2', title: 'Second', milestone_order: 2, status: 'approved', amount: 99999, updated_at: null },
      ] }
    }
    if (query.table === 'csr_milestone_evidence') {
      expect(eq).toEqual({ project_id: projectId, ngo_user_id: Number(eq.ngo_user_id), uploaded_by: Number(eq.ngo_user_id) })
      return { data: [
        { id: 'e1', ngo_user_id: 12, uploaded_by: 12, milestone_id: 'm1', submission_status: 'submitted', uploaded_at: null, created_at: null, description: 'private' },
        { id: 'e2', ngo_user_id: 22, uploaded_by: 22, milestone_id: 'm2', submission_status: 'submitted', uploaded_at: null, created_at: null },
        { id: 'e3', ngo_user_id: 22, uploaded_by: 99, milestone_id: 'm2', submission_status: 'submitted', uploaded_at: null, created_at: null },
      ].filter((row) => row.ngo_user_id === eq.ngo_user_id && row.uploaded_by === eq.uploaded_by) }
    }
    return undefined
  })
  state.from.mockImplementation(fake.from)
  return fake
}

beforeEach(() => {
  vi.stubEnv('JWT_SECRET', 'test-secret')
  state.from.mockReset()
  state.ensure.mockReset()
  state.tracking.mockReset().mockResolvedValue(new Map())
  state.rentals.mockReset()
  state.loadRental.mockReset()
})

describe('NGO participation API', () => {
  it('returns an allowlisted project view with payment-complete milestone progress and only own evidence', async () => {
    const fake = setup()
    const response = await participation(request(`project_id=${projectId}`))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.progress).toEqual({ completed: 1, total: 2, percentage: 50, current_milestone_id: 'm2' })
    expect(body.data.milestones.map((row: { status: string }) => row.status)).toEqual(['completed', 'review_complete'])
    expect(body.data.own_evidence).toEqual([{ id: 'e1', milestone_id: 'm1', submission_status: 'submitted', uploaded_at: null, created_at: null }])
    expect(JSON.stringify(body)).not.toMatch(/123456|98765|99999|private/)
    expect(fake.queries.every((query) => query.op === 'select')).toBe(true)
    expect(fake.find('service_attendance_entries')).toHaveLength(0)
    expect(unknownColumns(fake.queries)).toEqual([])
  })

  it('allows a campaign participant using its own application and active legacy assignment', async () => {
    const fake = setup({ application: true, status: 'active' })
    const response = await participation(request(`campaign_id=${campaignId}`, 22))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.participation).toMatchObject({ association: 'campaign_participation', assignment_status: 'active' })
    expect(body.data.own_evidence.map((row: { id: string }) => row.id)).toEqual(['e2'])
    expect(eqsOf(fake.find('service_engagement_assignments')[0]).assignee_user_id).toBe(22)
  })

  it('permits a registered participant without inventing an assignment', async () => {
    const fake = setup({ application: true })
    const response = await participation(request(`campaign_id=${campaignId}`, 22))
    expect(response.status).toBe(200)
    expect((await response.json()).data.participation).toMatchObject({ association: 'campaign_registration', assignment_status: null })
    expect(fake.queries.every((query) => query.op === 'select')).toBe(true)
  })

  it.each([{ application: false, status: 'active' }, { application: true, status: 'cancelled' }])(
    'does not grant access for an unregistered or revoked assignment: %o', async (options) => {
      const fake = setup(options)
      const response = await participation(request(`campaign_id=${campaignId}`, 22))
      expect(response.status).toBe(404)
      expect(fake.find('csr_project_milestones')).toHaveLength(0)
      expect(fake.find('csr_milestone_evidence')).toHaveLength(0)
    }
  )

  it('does not expose another NGO participation by changing project ID', async () => {
    const fake = setup({ otherProject: true })
    const response = await participation(request(`project_id=${otherId}`))
    expect(response.status).toBe(404)
    expect(fake.find('csr_milestone_evidence')).toHaveLength(0)
  })

  it.each(['individual', 'company', 'field_officer'])('rejects role %s', async (role) => {
    const fake = setup()
    const response = await participation(request(`project_id=${projectId}`, 22, role))
    expect([401, 403]).toContain(response.status)
    expect(fake.queries).toHaveLength(0)
  })

  it('surfaces a database error rather than reporting empty progress', async () => {
    setup({ error: 'query failed' })
    const response = await participation(request(`project_id=${projectId}`))
    expect(response.status).toBe(500)
  })
})

describe('participation attendance and evidence guards', () => {
  it('retains the individual volunteer attendance-assignment workflow', async () => {
    const fake = createSupabaseFake(() => ({ data: {
      id: campaignId, lead_ngo_user_id: 80,
      impact_metrics: { volunteer_applications: [{ user_id: 22, user_type: 'individual', capacity: 1 }] },
    } }))
    state.from.mockImplementation(fake.from)
    state.ensure.mockResolvedValue({ id: 'a1' })
    const response = await registerVolunteer(
      jsonRequest(`http://localhost/api/campaigns/${campaignId}/volunteer`, { token: tokenFor(22, 'individual'), method: 'POST' }),
      { params: Promise.resolve({ id: campaignId }) }
    )
    expect(response.status).toBe(200)
    expect(state.ensure).toHaveBeenCalledOnce()
  })

  it('records an NGO campaign registration without creating a daily attendance assignment', async () => {
    const campaign = {
      id: campaignId, title: 'Campaign', status: 'active', lead_ngo_user_id: 80,
      start_date: '2099-01-01', end_date: '2099-01-02', impact_metrics: {}, updated_at: null,
    }
    const fake = createSupabaseFake((query) => {
      if (query.table === 'campaigns' && query.op === 'update') {
        return { data: [{ ...campaign, impact_metrics: (query.payload as { impact_metrics: unknown }).impact_metrics }] }
      }
      if (query.table === 'campaigns' && query.calls.some(([method]) => method === 'maybeSingle')) return { data: campaign }
      if (query.table === 'campaigns') return { data: [] }
      if (query.table === 'users') return { data: { id: 22, name: 'NGO', user_type: 'ngo', verification_status: 'verified', profile_data: {} } }
      return undefined
    })
    state.from.mockImplementation(fake.from)
    const response = await registerVolunteer(
      jsonRequest(`http://localhost/api/campaigns/${campaignId}/volunteer`, { token: tokenFor(22, 'ngo'), method: 'POST' }),
      { params: Promise.resolve({ id: campaignId }) }
    )
    expect(response.status).toBe(200)
    expect(fake.find('campaigns', 'update')).toHaveLength(1)
    expect(state.ensure).not.toHaveBeenCalled()
    expect(fake.find('service_engagement_assignments', 'insert')).toHaveLength(0)
    expect(fake.find('service_attendance_entries')).toHaveLength(0)
  })

  it('does not create NGO assignments or query attendance when listing registrations', async () => {
    const fake = createSupabaseFake((query) => {
      if (query.table === 'campaigns') return { data: [{
        id: campaignId, title: 'Campaign', status: 'active', lead_ngo_user_id: 80,
        impact_metrics: { volunteer_applications: [{ user_id: 22, user_type: 'ngo' }] },
      }] }
      return { data: [] }
    })
    state.from.mockImplementation(fake.from)
    const response = await volunteerAssignments(jsonRequest('http://localhost/api/campaigns/volunteer-assignments', { token: tokenFor(22, 'ngo') }))
    expect(response.status).toBe(200)
    const result = (await response.json()).data[0]
    expect(result).not.toHaveProperty('attendance_summary')
    expect(result.volunteer_capacity).toBeNull()
    expect(state.ensure).not.toHaveBeenCalled()
    expect(fake.find('service_attendance_entries')).toHaveLength(0)
    expect(fake.queries.every((query) => query.op === 'select')).toBe(true)
  })

  it('denies a non-lead NGO from submitting project milestone evidence', async () => {
    const fake = createSupabaseFake((query) => {
      if (query.table === 'csr_project_milestones') return { data: { id: 'm1', project_id: projectId, status: 'pending' } }
      if (query.table === 'csr_projects') return { data: { ...project, campaigns: { lead_ngo_user_id: 80 } } }
      return undefined
    })
    state.from.mockImplementation(fake.from)
    const response = await submitEvidence(
      jsonRequest('http://localhost/api/milestones/m1/evidence', { token: tokenFor(12, 'ngo'), body: {} }),
      { params: Promise.resolve({ id: 'm1' }) }
    )
    expect(response.status).toBe(403)
    expect(fake.queries.every((query) => query.op === 'select')).toBe(true)
  })

  it('does not expose campaign volunteer assignment finance to the participating NGO', async () => {
    const volunteer = { id: 'a1', target_type: 'csr_project', assignee_user_id: 22, owner_user_id: 80, meta: { engagement_kind: 'campaign_volunteer' }, amount: 123456 }
    const rental = { id: 'a2', target_type: 'campaign', assignee_user_id: 22, owner_user_id: 80, meta: { flow: 'csr_capability_rental' } }
    const fake = createSupabaseFake(() => ({ data: [volunteer, rental] }))
    state.from.mockImplementation(fake.from)
    const response = await listAssignments(jsonRequest('http://localhost/api/service-assignments', { token: tokenFor(22, 'ngo') }))
    const body = await response.json()
    expect(body.data).toEqual([rental])
    expect(JSON.stringify(body)).not.toContain('123456')
  })

  it('denies direct attendance access for NGO campaign participants', async () => {
    const fake = createSupabaseFake(() => ({ data: {
      id: 'a1', target_type: 'csr_project', assignee_user_id: 22, owner_user_id: 80,
      meta: { engagement_kind: 'campaign_volunteer' },
    } }))
    state.from.mockImplementation(fake.from)
    const response = await getAttendance(
      jsonRequest('http://localhost/api/service-assignments/a1/attendance', { token: tokenFor(22, 'ngo') }),
      { params: Promise.resolve({ id: 'a1' }) }
    )
    expect(response.status).toBe(403)
    expect(fake.find('service_attendance_entries')).toHaveLength(0)
  })

  it.each([
    ['ngo', 12, 12, 1],
    ['ngo', 12, 80, 0],
    ['company', 80, 12, 1],
  ])('limits tracking for %s with project NGO %s/%s', async (role, userId, projectNgo, expected) => {
    const campaign = { id: campaignId, lead_ngo_user_id: 12, impact_metrics: {} }
    const fake = createSupabaseFake((query) => {
      if (query.table === 'campaigns') return { data: [campaign] }
      if (query.table === 'csr_projects') return { data: [{ id: projectId, campaign_id: campaignId, ngo_user_id: projectNgo }] }
      return undefined
    })
    state.from.mockImplementation(fake.from)
    const response = await campaignTracking(jsonRequest('http://localhost/api/campaigns/tracking', { token: tokenFor(userId, role) }))
    expect(response.status).toBe(200)
    expect(state.tracking.mock.calls[0][0]).toHaveLength(expected)
  })

  it('hides rental details from an NGO without matching project lead authority while retaining provider access', async () => {
    state.rentals.mockResolvedValue([
      { campaign_id: campaignId, role: 'lead_ngo', rental: { rental_amount_inr: 10000 } },
      { campaign_id: otherId, role: 'provider', rental: { id: 'own-rental' } },
    ])
    const fake = createSupabaseFake(() => ({ data: [{
      campaign_id: campaignId, ngo_user_id: 80, campaigns: { lead_ngo_user_id: 22 },
    }] }))
    state.from.mockImplementation(fake.from)
    const response = await leadAssignments(jsonRequest('http://localhost/api/campaigns/lead-assignments?rentals=1', { token: tokenFor(22, 'ngo') }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data).toEqual([{ campaign_id: otherId, role: 'provider', rental: { id: 'own-rental' } }])
    expect(JSON.stringify(body)).not.toContain('10000')
  })

  it('retains rental access for the verified project lead', async () => {
    const rental = { campaign_id: campaignId, role: 'lead_ngo', rental: { id: 'lead-rental' } }
    state.rentals.mockResolvedValue([rental])
    const fake = createSupabaseFake(() => ({ data: [{
      campaign_id: campaignId, ngo_user_id: 22, campaigns: { lead_ngo_user_id: 22 },
    }] }))
    state.from.mockImplementation(fake.from)
    const response = await leadAssignments(jsonRequest('http://localhost/api/campaigns/lead-assignments?rentals=1', { token: tokenFor(22, 'ngo') }))
    expect(response.status).toBe(200)
    expect((await response.json()).data).toEqual([rental])
  })

  it('denies a rental management action when campaign and project lead identities disagree', async () => {
    state.loadRental.mockResolvedValue({ rental: { lead_ngo_user_id: 22, company_user_id: 80, provider_user_id: 81 } })
    const fake = createSupabaseFake(() => ({ data: [{
      campaign_id: campaignId, ngo_user_id: 80, campaigns: { lead_ngo_user_id: 22 },
    }] }))
    state.from.mockImplementation(fake.from)
    const response = await updateLeadAssignment(
      jsonRequest('http://localhost/api/campaigns/lead-assignments', {
        token: tokenFor(22, 'ngo'),
        body: { action: 'capability_rental_link_tracking', campaign_id: campaignId, offer_id: 1, leg: 'return', tracking_id: 'T1' },
      })
    )
    expect(response.status).toBe(403)
    expect(fake.queries.every((query) => query.op === 'select')).toBe(true)
  })
})
