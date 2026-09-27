import { NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as listEngagements } from '@/app/api/service-assignments/route'
import { GET, POST, PUT } from '@/app/api/service-request-assignments/route'
import { jsonRequest, tokenFor } from './campaign-supabase-fake'
import { callsOf, createDbFake, eqsOf, unknownColumns, type DbQuery, type DbResult } from './db-supabase-fake'

const mocks = vi.hoisted(() => {
  const handler = (name: string) => vi.fn(async () => NextResponse.json({ handler: name }))
  return {
    from: vi.fn(),
    getCompanyProjects: handler('company-projects'),
    getNgoCompanyApplications: handler('ngo-company-applications'),
    getProjectDetail: handler('project-detail'),
    getNgoLeadInvitations: handler('ngo-lead-invitations'),
    getCsrTracking: handler('csr-tracking'),
    submitProjectApplication: handler('submit'),
    respondToLeadNgoInvitation: handler('respond-lead-ngo-invitation'),
    selectLeadNgo: handler('select-lead-ngo'),
    reviewProjectApplication: handler('review-project-application'),
  }
})

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ supabase: { from: mocks.from } }))
vi.mock('@/lib/service-request-assignments/company-projects', () => ({ getCompanyProjects: mocks.getCompanyProjects }))
vi.mock('@/lib/service-request-assignments/ngo-company-applications', () => ({ getNgoCompanyApplications: mocks.getNgoCompanyApplications }))
vi.mock('@/lib/service-request-assignments/project-detail', () => ({ getProjectDetail: mocks.getProjectDetail }))
vi.mock('@/lib/service-request-assignments/ngo-lead-invitations', () => ({ getNgoLeadInvitations: mocks.getNgoLeadInvitations }))
vi.mock('@/lib/service-request-assignments/csr-tracking', () => ({ getCsrTracking: mocks.getCsrTracking }))
vi.mock('@/lib/service-request-assignments/project-applications', () => ({ submitProjectApplication: mocks.submitProjectApplication }))
vi.mock('@/lib/service-request-assignments/lead-ngo', () => ({
  respondToLeadNgoInvitation: mocks.respondToLeadNgoInvitation,
  selectLeadNgo: mocks.selectLeadNgo,
}))
vi.mock('@/lib/service-request-assignments/review-project-application', () => ({
  reviewProjectApplication: mocks.reviewProjectApplication,
}))

let fake = createDbFake()

function useDb(responder: (query: DbQuery) => DbResult | undefined = () => undefined) {
  fake = createDbFake(responder)
  mocks.from.mockImplementation(fake.from)
  return fake
}

beforeEach(() => {
  vi.clearAllMocks()
  useDb()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  expect(unknownColumns(fake.queries)).toEqual([])
})

const URL_BASE = 'http://localhost/api/service-request-assignments'

async function read(response: Response) {
  return { status: response.status, json: await response.json() }
}

describe('GET /api/service-request-assignments', () => {
  it.each(['', '?mode=company-projects', '?mode=ngo-company-applications', '?mode=ngo-lead-invitations', '?mode=csr-tracking'])(
    'requires a session for %j',
    async (query) => {
      await expect(read(await GET(jsonRequest(`${URL_BASE}${query}`)))).resolves.toEqual({
        status: 401,
        json: { error: 'Authentication required' },
      })
      expect(mocks.from).not.toHaveBeenCalled()
    }
  )

  it('rejects a forged token', async () => {
    const request = jsonRequest(`${URL_BASE}?mode=csr-tracking`, { token: `${tokenFor(5, 'company')}x` })
    await expect(read(await GET(request))).resolves.toMatchObject({ status: 401 })
    expect(mocks.getCsrTracking).not.toHaveBeenCalled()
  })

  it('serves project detail anonymously', async () => {
    const { json } = await read(await GET(jsonRequest(`${URL_BASE}?mode=project-detail&projectId=p1`)))
    expect(json).toEqual({ handler: 'project-detail' })
    expect(mocks.getProjectDetail).toHaveBeenCalledWith(expect.objectContaining({ userId: 0, userType: '' }))
  })

  it.each([
    ['company-projects', mocks.getCompanyProjects],
    ['ngo-company-applications', mocks.getNgoCompanyApplications],
    ['project-detail', mocks.getProjectDetail],
    ['ngo-lead-invitations', mocks.getNgoLeadInvitations],
    ['csr-tracking', mocks.getCsrTracking],
  ])('dispatches mode %s with the session', async (mode, handler) => {
    const { json } = await read(await GET(jsonRequest(`${URL_BASE}?mode=${mode}`, { token: tokenFor(5, 'company') })))
    expect(json).toEqual({ handler: mode })
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ userId: 5, userType: 'company' }))
  })

  it.each([
    ['ongoing', [['status', ['pending', 'accepted', 'active']]]],
    ['history', [['status', ['completed', 'rejected', 'cancelled']]]],
    ['all', []],
  ])('lists an individual %s applications only for themselves', async (view, statusFilter) => {
    useDb(() => ({ data: [{ id: 1 }] }))
    const { json } = await read(await GET(jsonRequest(`${URL_BASE}?view=${view}`, { token: tokenFor(7, 'individual') })))
    expect(json).toEqual({ success: true, data: [{ id: 1 }] })
    const [query] = fake.queries
    expect(query.table).toBe('service_request_applications')
    expect(eqsOf(query)).toEqual({ applicant_user_id: 7 })
    expect(callsOf(query, 'in')).toEqual(statusFilter)
  })

  it("groups an NGO's own needs with their applications", async () => {
    useDb((query) => {
      if (query.table === 'service_requests') {
        return { data: [{ id: 11, status: 'active' }, { id: 12, status: 'completed' }] }
      }
      return {
        data: [
          { id: 1, service_request_id: 11, status: 'accepted', application_message: 'hi', fulfillment: [] },
          { id: 2, service_request_id: 11, status: 'pending' },
          { id: 3, service_request_id: 11, status: 'accepted', fulfillment: { ngo_confirmed_at: '2026-01-01' } },
          { id: 4, service_request_id: 12, status: 'completed' },
        ],
      }
    })

    const { json } = await read(await GET(jsonRequest(URL_BASE, { token: tokenFor(1, 'ngo') })))

    const [requests, applications] = fake.queries
    expect(eqsOf(requests)).toEqual({ ngo_id: 1 })
    expect(callsOf(applications, 'in')).toEqual([['service_request_id', [11, 12]]])
    expect(json.data).toHaveLength(1)
    expect(json.data[0]).toMatchObject({ id: 11, accepted_count: 2, pending_count: 1, completed_count: 1 })
    expect(json.data[0].assignments[0]).toMatchObject({ message: 'hi' })
  })

  it('shows an NGO its finished needs in history', async () => {
    useDb((query) => ({ data: query.table === 'service_requests' ? [{ id: 11, status: 'active' }, { id: 12, status: 'cancelled' }] : [] }))
    const { json } = await read(await GET(jsonRequest(`${URL_BASE}?view=history`, { token: tokenFor(1, 'ngo') })))
    expect(json.data.map((item: { id: number }) => item.id)).toEqual([12])
  })

  it('skips the application lookup for an NGO without needs', async () => {
    useDb(() => ({ data: [] }))
    await GET(jsonRequest(URL_BASE, { token: tokenFor(1, 'ngo') }))
    expect(fake.queries.map((query) => query.table)).toEqual(['service_requests'])
  })

  it('refuses the default listing for companies', async () => {
    await expect(read(await GET(jsonRequest(URL_BASE, { token: tokenFor(5, 'company') })))).resolves.toEqual({
      status: 403,
      json: { error: 'Unsupported user type' },
    })
  })

  it('hides query errors', async () => {
    useDb(() => ({ error: { message: 'relation does not exist' } }))
    await expect(read(await GET(jsonRequest(URL_BASE, { token: tokenFor(7, 'individual') })))).resolves.toEqual({
      status: 500,
      json: { error: 'Failed to fetch assignments' },
    })
  })

  it('hides handler errors', async () => {
    mocks.getCsrTracking.mockRejectedValueOnce(new Error('secret detail'))
    const { status, json } = await read(await GET(jsonRequest(`${URL_BASE}?mode=csr-tracking`, { token: tokenFor(1, 'ngo') })))
    expect(status).toBe(500)
    expect(JSON.stringify(json)).not.toContain('secret detail')
  })
})

describe('POST and PUT /api/service-request-assignments', () => {
  it('hands POST to submitProjectApplication', async () => {
    const request = jsonRequest(URL_BASE, { token: tokenFor(5, 'company'), body: { projectId: 'p1' } })
    await expect(read(await POST(request))).resolves.toMatchObject({ json: { handler: 'submit' } })
    expect(mocks.submitProjectApplication).toHaveBeenCalledWith(request)
  })

  it('requires a session', async () => {
    await expect(read(await PUT(jsonRequest(URL_BASE, { method: 'PUT', body: { action: 'select-lead-ngo' } })))).resolves.toMatchObject({
      status: 401,
    })
    expect(mocks.selectLeadNgo).not.toHaveBeenCalled()
  })

  it.each(['', 'delete-project', 'revoke-lead-ngo'])('rejects action %j', async (action) => {
    const request = jsonRequest(URL_BASE, { method: 'PUT', token: tokenFor(5, 'company'), body: { action } })
    await expect(read(await PUT(request))).resolves.toEqual({ status: 400, json: { error: 'Invalid action' } })
  })

  it.each([
    ['review-project-application', mocks.reviewProjectApplication],
    ['respond-lead-ngo-invitation', mocks.respondToLeadNgoInvitation],
    ['select-lead-ngo', mocks.selectLeadNgo],
  ])('dispatches %s with the session', async (action, handler) => {
    const body = { action: ` ${action} `, projectId: 'p1' }
    const request = jsonRequest(URL_BASE, { method: 'PUT', token: tokenFor(1, 'ngo'), body })
    await expect(read(await PUT(request))).resolves.toMatchObject({ status: 200, json: { handler: action } })
    expect(handler).toHaveBeenCalledWith({ body, userId: 1, userType: 'ngo' })
  })

  it('hides handler errors', async () => {
    mocks.reviewProjectApplication.mockRejectedValueOnce(new Error('boom'))
    const request = jsonRequest(URL_BASE, { method: 'PUT', token: tokenFor(1, 'ngo'), body: { action: 'review-project-application' } })
    await expect(read(await PUT(request))).resolves.toEqual({ status: 500, json: { error: 'Failed to review project application' } })
  })
})

describe('GET /api/service-assignments', () => {
  const ENGAGEMENTS = 'http://localhost/api/service-assignments'

  it('requires a bearer token', async () => {
    await expect(read(await listEngagements(jsonRequest(ENGAGEMENTS)))).resolves.toEqual({
      status: 401,
      json: { error: 'Authentication required' },
    })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('rejects an invalid token', async () => {
    await expect(read(await listEngagements(jsonRequest(ENGAGEMENTS, { token: 'nope' })))).resolves.toMatchObject({ status: 401 })
  })

  it.each([
    ['', { assignee_user_id: 4 }, []],
    ['?role=assigned', { assignee_user_id: 4 }, []],
    ['?role=owned', { owner_user_id: 4 }, []],
    ['?role=all', {}, [['owner_user_id.eq.4,assignee_user_id.eq.4']]],
  ])('scopes %j to the caller', async (query, eqs, or) => {
    useDb(() => ({ data: [{ id: 'a1' }] }))
    const { json } = await read(await listEngagements(jsonRequest(`${ENGAGEMENTS}${query}`, { token: tokenFor(4, 'ngo') })))
    expect(json).toEqual({ success: true, data: [{ id: 'a1' }] })
    const [select] = fake.queries
    expect(select.table).toBe('service_engagement_assignments')
    expect(eqsOf(select)).toEqual(eqs)
    expect(callsOf(select, 'or')).toEqual(or)
    expect(callsOf(select, 'order')).toEqual([['assigned_at', { ascending: false }]])
    expect(callsOf(select, 'limit')).toEqual([[100]])
  })

  it('filters by target type', async () => {
    await listEngagements(jsonRequest(`${ENGAGEMENTS}?role=owned&targetType=campaign`, { token: tokenFor(4, 'company') }))
    expect(eqsOf(fake.queries[0])).toEqual({ owner_user_id: 4, target_type: 'campaign' })
  })

  it('returns a generic 500 on query errors and logs the detail', async () => {
    const error = { message: 'relation "service_engagement_assignments" does not exist', code: '42P01' }
    useDb(() => ({ error }))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(read(await listEngagements(jsonRequest(ENGAGEMENTS, { token: tokenFor(4, 'ngo') })))).resolves.toEqual({
      status: 500,
      json: { error: 'Failed to fetch assignments' },
    })
    expect(log).toHaveBeenCalledWith('Fetch assignments error:', error)
  })
})
