import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseProjectMeta, withProjectMeta } from '@/lib/service-request-allocation'
import { reviewProjectApplication } from '@/lib/service-request-assignments/review-project-application'
import {
  isFullyVerifiedCompany,
  safeBoolean,
  safeNoteFromMeta,
  safeProjectIdFromMeta,
} from '@/lib/service-request-assignments/shared'
import { createSupabaseFake, type FakeResult } from './service-supabase-fake'

const mocks = vi.hoisted(() => ({ from: vi.fn(), assertCoverage: vi.fn() }))

vi.mock('@/lib/db', () => ({
  supabase: { from: mocks.from },
  db: {},
  buildProjectLeadNgoPatch: (ngoId: number) => ({ lead_ngo_id: ngoId }),
}))
vi.mock('@/lib/server-auth', () => ({ assertNgoCsr1CoversProject: mocks.assertCoverage }))

function useDb(responses: Record<string, FakeResult[]> = {}) {
  const fake = createSupabaseFake(responses)
  mocks.from.mockImplementation(fake.from)
  return fake
}

beforeEach(() => {
  mocks.from.mockReset()
  mocks.assertCoverage.mockReset().mockResolvedValue({ ok: true })
})

describe('assignment meta helpers', () => {
  it('reads project ids and notes from meta', () => {
    expect(safeProjectIdFromMeta({ project_id: ' p1 ' })).toBe('p1')
    expect(safeProjectIdFromMeta({ project_id: '' })).toBeNull()
    expect(safeProjectIdFromMeta('p1')).toBeNull()
    expect(safeNoteFromMeta({ note: ' thanks ' })).toBe('thanks')
    expect(safeNoteFromMeta(null)).toBe('')
  })

  it.each([
    [true, true],
    [1, true],
    [2, false],
    ['YES', true],
    ['1', true],
    ['no', false],
    [null, false],
  ])('reads %j as %s', (value, expected) => {
    expect(safeBoolean(value)).toBe(expected)
  })
})

describe('isFullyVerifiedCompany', () => {
  it.each([
    [{ email_verified: true, phone_verified: true, verification_status: 'Verified' }, true],
    [{ email_verified: true, phone_verified: false, verification_status: 'verified' }, false],
    [{ email_verified: true, phone_verified: true, verification_status: 'pending' }, false],
    [null, false],
  ])('checks %j', async (row, expected) => {
    useDb({ 'users.select': [{ data: row }] })
    await expect(isFullyVerifiedCompany(3)).resolves.toBe(expected)
  })

  it('treats lookup errors as unverified', async () => {
    useDb({ 'users.select': [{ error: { message: 'boom' } }] })
    await expect(isFullyVerifiedCompany(3)).resolves.toBe(false)
  })
})

const NGO_ID = 1
const COMPANY_ID = 5

function application(companyId: number, status = 'pending') {
  return { company_id: companyId, applicant_user_id: companyId, source: 'company_apply', applied_at: '2026-01-01', status }
}

function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    ngo_id: NGO_ID,
    description: withProjectMeta('Library', { pending_company_applications: [application(COMPANY_ID), application(9)] }),
    assigned_company_user_id: null,
    assignment_status: 'pending',
    volunteers_needed: 0,
    ...overrides,
  }
}

async function review(body: Record<string, unknown>, userType = 'ngo') {
  const response = await reviewProjectApplication({ body, userId: NGO_ID, userType })
  return { status: response.status, json: await response.json() }
}

const accept = { projectId: 'p1', companyId: COMPANY_ID, decision: 'accepted' }

describe('reviewProjectApplication', () => {
  it('only lets NGOs review', async () => {
    useDb()
    await expect(review(accept, 'company')).resolves.toMatchObject({ status: 403 })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it.each([
    [{ ...accept, projectId: ' ' }],
    [{ ...accept, companyId: 'abc' }],
    [{ ...accept, decision: 'maybe' }],
  ])('requires project, company and decision: %j', async (body) => {
    useDb()
    await expect(review(body)).resolves.toMatchObject({ status: 400 })
  })

  it('rejects projects that do not belong to the NGO', async () => {
    const fake = useDb({ 'service_request_projects.select': [{ data: null }] })
    await expect(review(accept)).resolves.toMatchObject({ status: 404, json: { error: 'Project not found under your NGO' } })
    expect(fake.calls[0].filters).toContainEqual(['eq', 'ngo_id', NGO_ID])
  })

  it('requires CSR-1 coverage before accepting', async () => {
    useDb({ 'service_request_projects.select': [{ data: projectRow() }] })
    mocks.assertCoverage.mockResolvedValue({ ok: false, error: 'CSR-1 expires before project end' })
    await expect(review(accept)).resolves.toMatchObject({ status: 403, json: { error: 'CSR-1 expires before project end' } })
  })

  it('refuses a second company once one is accepted on the project', async () => {
    const fake = useDb({
      'service_request_projects.select': [{ data: projectRow({ assigned_company_user_id: 8, assignment_status: 'accepted' }) }],
    })
    await expect(review(accept)).resolves.toMatchObject({ status: 409 })
    expect(fake.writes('service_request_projects')).toHaveLength(0)
  })

  it('refuses a second company when the meta already has an accepted application', async () => {
    const row = projectRow({
      description: withProjectMeta('Library', { pending_company_applications: [application(8, 'accepted'), application(COMPANY_ID)] }),
    })
    const fake = useDb({
      'service_request_projects.select': [{ data: row }, { data: row }],
      'service_requests.select': [{ data: [] }],
    })
    await expect(review(accept)).resolves.toMatchObject({ status: 409 })
    expect(fake.writes('service_request_projects')).toHaveLength(0)
  })

  it('refuses a second company when another contribution is already accepted', async () => {
    const row = projectRow({ description: 'Library' })
    const fake = useDb({
      'service_request_projects.select': [{ data: row }, { data: row }],
      'service_requests.select': [{ data: [{ id: 11, project_context: {} }] }],
      'service_request_contributions.select': [
        { data: [{ id: 100, service_request_id: 11, meta: {} }] },
        { data: [{ id: 200, contributor_id: 8, service_request_id: 11 }] },
      ],
    })
    await expect(review(accept)).resolves.toMatchObject({ status: 409 })
    expect(fake.writes('service_request_contributions')).toHaveLength(0)
  })

  it('returns 404 when the company never applied', async () => {
    const row = projectRow({ description: 'Library' })
    useDb({
      'service_request_projects.select': [{ data: row }, { data: row }],
      'service_requests.select': [{ data: [] }],
    })
    await expect(review(accept)).resolves.toMatchObject({ status: 404 })
  })

  it('rejects applications that did not come through the marketplace', async () => {
    const row = projectRow({
      description: withProjectMeta('Library', { pending_company_applications: [{ ...application(COMPANY_ID), source: 'ngo_added' }] }),
    })
    useDb({
      'service_request_projects.select': [{ data: row }, { data: row }],
      'service_requests.select': [{ data: [] }],
    })
    await expect(review(accept)).resolves.toMatchObject({ status: 403 })
  })

  it('accepts a company and expires the other pending applications', async () => {
    const row = projectRow()
    const fake = useDb({
      'service_request_projects.select': [{ data: row }, { data: row }],
      'service_requests.select': [{ data: [] }],
      'users.select': [{ data: { id: NGO_ID, ngo_volunteer_capacity: 10 } }],
    })

    await expect(review({ ...accept, note: 'Welcome' })).resolves.toEqual({
      status: 200,
      json: { success: true, data: { projectId: 'p1', companyId: COMPANY_ID, decision: 'accepted', affectedNeeds: 0 } },
    })

    const [update] = fake.writes('service_request_projects')
    expect(update.payload).toMatchObject({
      status: 'in_progress',
      lead_ngo_id: NGO_ID,
      assigned_company_user_id: COMPANY_ID,
      assignment_status: 'accepted',
    })
    const apps = parseProjectMeta((update.payload as { description: string }).description).pending_company_applications
    expect(apps?.map((app) => [app.company_id, app.status])).toEqual([[COMPANY_ID, 'accepted'], [9, 'expired']])
  })

  it('rejects a company without touching the others', async () => {
    const row = projectRow()
    const fake = useDb({
      'service_request_projects.select': [{ data: row }],
      'service_requests.select': [{ data: [] }],
    })

    await expect(review({ ...accept, decision: 'REJECTED' })).resolves.toMatchObject({ status: 200 })

    const [update] = fake.writes('service_request_projects')
    expect(update.payload).toMatchObject({ assignment_status: 'pending' })
    expect(update.payload).not.toHaveProperty('assigned_company_user_id')
    const apps = parseProjectMeta((update.payload as { description: string }).description).pending_company_applications
    expect(apps?.map((app) => [app.company_id, app.status])).toEqual([[COMPANY_ID, 'rejected'], [9, 'pending']])
  })

  it('marks matching need contributions and hands the needs to the company', async () => {
    const row = projectRow({ description: 'Library' })
    const fake = useDb({
      'service_request_projects.select': [{ data: row }, { data: row }],
      'service_requests.select': [{ data: [{ id: 11, project_context: { note: 'x' } }] }, { data: [{ volunteers_needed: 2 }] }],
      'service_request_contributions.select': [{ data: [{ id: 100, service_request_id: 11, meta: {} }] }, { data: [] }],
      'users.select': [{ data: { id: NGO_ID, ngo_volunteer_capacity: 10 } }],
      'service_request_projects.update': [{ data: { id: 'p1' } }],
    })

    await expect(review(accept)).resolves.toMatchObject({ status: 200, json: { data: { affectedNeeds: 1 } } })

    const contributionUpdates = fake.writes('service_request_contributions')
    expect(contributionUpdates[0].payload).toMatchObject({ status: 'accepted', meta: { application_status: 'accepted' } })
    expect(contributionUpdates[1].payload).toMatchObject({ status: 'expired' })
    expect(fake.writes('service_requests')[0].payload).toMatchObject({
      status: 'in_progress',
      project_context: { note: 'x', csr_assignment: { mode: 'company_project_handoff', assigned_company_id: COMPANY_ID } },
    })
    expect(fake.writes('service_request_projects')[0].filters).toContainEqual(['is', 'assigned_company_user_id', null])
  })

  it('does not persist the acceptance when NGO volunteer capacity is exceeded', async () => {
    const row = projectRow({ volunteers_needed: 20 })
    const fake = useDb({
      'service_request_projects.select': [{ data: row }, { data: row }],
      'service_requests.select': [{ data: [] }],
      'users.select': [{ data: { id: NGO_ID, ngo_volunteer_capacity: 5 } }],
    })
    await expect(review(accept)).resolves.toMatchObject({ status: 409 })
    expect(fake.writes('service_request_projects')).toHaveLength(0)
  })

  it('does not touch need contributions when capacity from child needs is exceeded', async () => {
    const row = projectRow({ description: 'Library' })
    const fake = useDb({
      'service_request_projects.select': [{ data: row }, { data: row }],
      'service_requests.select': [{ data: [{ id: 11, project_context: {} }] }, { data: [{ volunteers_needed: 12 }] }],
      'service_request_contributions.select': [{ data: [{ id: 100, service_request_id: 11, meta: {} }] }, { data: [] }],
      'users.select': [{ data: { id: NGO_ID, ngo_volunteer_capacity: 10 } }],
    })
    await expect(review(accept)).resolves.toMatchObject({ status: 409 })
    expect(fake.writes('service_request_contributions')).toHaveLength(0)
    expect(fake.writes('service_request_projects')).toHaveLength(0)
    expect(fake.writes('service_requests')).toHaveLength(0)
  })
})
