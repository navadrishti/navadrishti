import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withProjectMeta } from '@/lib/service-request-allocation'
import { getProjectDetail } from '@/lib/service-request-assignments/project-detail'
import {
  COMPANY_PROJECT_CONTRIBUTION_TYPE,
  LEAD_NGO_INVITE_CONTRIBUTION_TYPE,
} from '@/lib/service-request-assignments/shared'
import { callsOf, createDbFake, eqsOf, unknownColumns, type DbQuery, type DbResult } from './db-supabase-fake'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ supabase: { from: mocks.from } }))

let fake = createDbFake()

function useDb(responder: (query: DbQuery) => DbResult | undefined) {
  fake = createDbFake(responder)
  mocks.from.mockImplementation(fake.from)
  return fake
}

afterEach(() => {
  expect(unknownColumns(fake.queries)).toEqual([])
})

const NGO = 1
const COMPANY = 5

const meta = withProjectMeta('Books for all', {
  contact_info: '+91 99999 00000',
  budget_inr: 50000,
  pending_company_applications: [
    { company_id: COMPANY, applicant_user_id: COMPANY, source: 'company_apply', status: 'pending', applied_at: '2026-01-02', note: 'Keen' },
    { company_id: 8, applicant_user_id: 8, source: 'company_apply', status: 'pending', applied_at: '2026-01-03' },
  ],
})

function project(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    ngo_id: NGO,
    title: 'Library',
    description: meta,
    location: 'Pune',
    status: 'active',
    assigned_company_user_id: null,
    assignment_status: 'pending',
    csr_project_available_for_csr: true,
    ngo: { id: NGO, name: 'Seva', email: 'seva@example.org' },
    ...overrides,
  }
}

type DetailOptions = {
  project?: unknown
  projectError?: unknown
  fallbackProject?: unknown
  needs?: unknown[]
  contributions?: unknown[]
  invites?: unknown[]
  fulfillments?: unknown[]
}

function detailDb(options: DetailOptions = {}) {
  let projectLookups = 0
  return useDb((query) => {
    if (query.table === 'service_request_projects') {
      projectLookups += 1
      if (projectLookups === 1) return { data: options.project ?? null, error: options.projectError }
      return { data: options.fallbackProject ?? null }
    }
    if (query.table === 'service_requests') return { data: options.needs ?? [] }
    if (query.table === 'service_request_contributions') {
      return { data: eqsOf(query).contribution_type === LEAD_NGO_INVITE_CONTRIBUTION_TYPE ? options.invites ?? [] : options.contributions ?? [] }
    }
    if (query.table === 'service_request_applications') return { data: options.fulfillments ?? [] }
    if (query.table === 'users') return { data: { id: NGO, name: 'Seva (direct)' } }
    return undefined
  })
}

async function detail(userId = 0, userType = '', projectId = 'p1') {
  const response = await getProjectDetail({
    searchParams: new URLSearchParams(projectId ? { projectId } : {}),
    userId,
    userType,
  })
  return { status: response.status, json: await response.json() }
}

beforeEach(() => {
  detailDb()
})

describe('getProjectDetail', () => {
  it.each(['', '   '])('requires a projectId (%j)', async (projectId) => {
    await expect(detail(0, '', projectId)).resolves.toMatchObject({ status: 400 })
    expect(fake.queries).toHaveLength(0)
  })

  it('redacts contact and applicant meta for anonymous viewers', async () => {
    detailDb({ project: project(), invites: [{ id: 'i1' }] })
    const { json } = await detail()
    expect(json.data.project).toMatchObject({ description: 'Books for all', budget_inr: 50000, contact_info: null, pending_company_applications: [] })
    expect(json.data.project).not.toHaveProperty('_raw_description')
    expect(json.data.company_applications).toEqual([])
    expect(json.data.lead_ngo_invites).toEqual([])
  })

  const contactNgo = {
    id: NGO,
    name: 'Seva',
    email: 'seva@example.org',
    phone: '+91 98765 43210',
    city: 'Pune',
    verification_status: 'verified',
    profile_data: {
      bio: 'Libraries for all',
      website: 'https://seva.example.org',
      cover_image: 'https://img/cover.png',
      ca_badge_number: 'ND-CA-1',
      payout_account: { account_number: '123456789012' },
      verification_documents: { ngo: { pan: 'https://x/pan.pdf' } },
      contact_person: 'Meera',
    },
  }

  it.each([
    ['anonymous viewers', 0, ''],
    ['other signed-in users', 2, 'ngo'],
    ['applicant companies', COMPANY, 'company'],
  ])('hides NGO contact details and private profile data from %s', async (_label, userId, userType) => {
    detailDb({ project: project({ ngo: contactNgo }) })
    const { json } = await detail(userId, userType)
    expect(json.data.project.ngo).toEqual({
      id: NGO,
      name: 'Seva',
      city: 'Pune',
      verification_status: 'verified',
      profile_data: {
        bio: 'Libraries for all',
        website: 'https://seva.example.org',
        cover_image: 'https://img/cover.png',
        ca_badge_number: 'ND-CA-1',
      },
    })
    expect(JSON.stringify(json)).not.toMatch(/seva@example\.org|98765|123456789012|pan\.pdf|Meera/)
  })

  it.each([
    ['the owner NGO', NGO, 'ngo', {}],
    ['the assigned company', COMPANY, 'company', { assigned_company_user_id: COMPANY, assignment_status: 'accepted' }],
  ])('shows %s the NGO contact details', async (_label, userId, userType, overrides) => {
    detailDb({ project: project({ ngo: contactNgo, ...overrides }) })
    const { json } = await detail(userId, userType)
    expect(json.data.project.ngo).toEqual(contactNgo)
  })

  it('redacts the NGO loaded separately when the join fails', async () => {
    useDb((query) => {
      if (query.table === 'service_request_projects') {
        return fake.find('service_request_projects').length === 1 ? { error: { message: 'join failed' } } : { data: project({ ngo: undefined }) }
      }
      if (query.table === 'users') return { data: contactNgo }
      return { data: [] }
    })
    const { json } = await detail()
    expect(json.data.project.ngo).not.toHaveProperty('email')
    expect(json.data.project.ngo).not.toHaveProperty('phone')
    expect(json.data.project.ngo.profile_data).not.toHaveProperty('payout_account')
  })

  it('shows the owner NGO every application and invite', async () => {
    detailDb({ project: project(), invites: [{ id: 'i1' }] })
    const { json } = await detail(NGO, 'ngo')
    expect(json.data.project).toMatchObject({ contact_info: '+91 99999 00000' })
    expect(json.data.project.pending_company_applications).toHaveLength(2)
    expect(json.data.company_applications.map((item: { company_id: number }) => item.company_id)).toEqual([COMPANY, 8])
    expect(json.data.lead_ngo_invites).toEqual([{ id: 'i1' }])
    const invites = fake.find('service_request_contributions').at(-1)
    expect(eqsOf(invites)).toEqual({ contribution_type: LEAD_NGO_INVITE_CONTRIBUTION_TYPE, 'meta->>project_id': 'p1' })
  })

  it.each([
    ['an applicant company', COMPANY, 'company'],
    ['another NGO', 2, 'ngo'],
    ['a company session with the owner id', NGO, 'company'],
  ])('shows %s only its own application', async (_name, userId, userType) => {
    detailDb({ project: project(), invites: [{ id: 'i1' }] })
    const { json } = await detail(userId, userType)
    expect(json.data.project.contact_info).toBeNull()
    const own = json.data.project.pending_company_applications.map((item: { company_id: number }) => item.company_id)
    expect(own).toEqual(userId === COMPANY ? [COMPANY] : [])
    expect(json.data.company_applications.every((item: { company_id: number }) => item.company_id === userId)).toBe(true)
    expect(json.data.lead_ngo_invites).toEqual([])
  })

  it('shows the assigned company the full project and locks new applications', async () => {
    detailDb({ project: project({ assigned_company_user_id: COMPANY, assignment_status: 'accepted' }) })
    const { json } = await detail(COMPANY, 'company')
    expect(json.data.project.contact_info).toBe('+91 99999 00000')
    expect(json.data.csr_project_eligible_for_company_apply).toBe(false)
    expect(json.data.csr_project_ineligible_reason).toBe('This project has already been accepted by a company.')
  })

  it('keeps the assignment lock when the NGO join fails', async () => {
    detailDb({
      projectError: { message: 'join failed' },
      fallbackProject: project({ ngo: undefined, assigned_company_user_id: COMPANY, assignment_status: 'accepted' }),
    })
    const { json } = await detail(COMPANY, 'company')
    const fallback = fake.find('service_request_projects')[1]
    expect(fallback.columns).toContain('assigned_company_user_id')
    expect(fallback.columns).toContain('assignment_status')
    expect(json.data.csr_project_eligible_for_company_apply).toBe(false)
    expect(json.data.project.contact_info).toBe('+91 99999 00000')
    expect(json.data.project.ngo).toEqual({ id: NGO, name: 'Seva (direct)' })
  })

  it('synthesizes the project from its first need when the row is missing', async () => {
    detailDb({
      needs: [{ id: 11, ngo_id: NGO, title: 'Shelves', description: 'Wood', location: 'Nashik', status: 'active', project_context: { project_title: 'Legacy library', project_category: 'Education' } }],
    })
    const { json } = await detail(NGO, 'ngo')
    expect(json.data.project).toMatchObject({
      id: 'p1',
      ngo_id: NGO,
      title: 'Legacy library',
      location: 'Nashik',
      category: 'Education',
      ngo: { name: 'Seva (direct)' },
    })
    expect(json.data.anchor_need_id).toBe(11)
  })

  it('groups legacy contributions per company with accepted winning', async () => {
    detailDb({
      project: project({ description: 'Plain' }),
      needs: [{ id: 11, status: 'active' }, { id: 12, status: 'completed' }, { id: 13, status: 'cancelled' }],
      contributions: [
        { id: 'c1', service_request_id: 11, contributor_id: 9, status: 'pending' },
        { id: 'c2', service_request_id: 12, contributor_id: 9, status: 'accepted' },
        { id: 'c3', service_request_id: 11, contributor_id: 10, status: 'rejected' },
      ],
    })
    const { json } = await detail(NGO, 'ngo')
    const [contributions] = fake.find('service_request_contributions')
    expect(eqsOf(contributions)).toEqual({ contribution_type: COMPANY_PROJECT_CONTRIBUTION_TYPE })
    expect(callsOf(contributions, 'in')).toEqual([['service_request_id', [11, 12, 13]]])
    expect(json.data.company_applications.map((item: { company_id: number; status: string; needs: unknown[] }) => [item.company_id, item.status, item.needs.length])).toEqual([
      [9, 'accepted', 2],
      [10, 'rejected', 1],
    ])
    expect(json.data.need_breakdown.ongoing.map((need: { id: number }) => need.id)).toEqual([11])
    expect(json.data.need_breakdown.fulfilled.map((need: { id: number }) => need.id)).toEqual([12])
    expect(json.data.need_breakdown.removed.map((need: { id: number }) => need.id)).toEqual([13])
  })

  it.each([
    [{ status: 'completed', volunteer: { user_type: 'individual' }, fulfillment: null }, false],
    [{ status: 'accepted', volunteer: { user_type: 'individual' }, fulfillment: [{ fulfilled_amount: 5 }] }, false],
    [{ status: 'completed', volunteer: { user_type: 'company' }, fulfillment: null }, true],
    [{ status: 'accepted', volunteer: { user_type: 'individual' }, fulfillment: {} }, true],
  ])('company apply eligibility with fulfillment %j is %s', async (row, eligible) => {
    detailDb({ project: project({ description: 'Plain' }), needs: [{ id: 11, status: 'active' }], fulfillments: [row] })
    const { json } = await detail(NGO, 'ngo')
    expect(json.data.csr_project_eligible_for_company_apply).toBe(eligible)
  })

  it('skips need-scoped lookups for standalone projects', async () => {
    detailDb({ project: project() })
    await detail(NGO, 'ngo')
    expect(fake.find('service_request_applications')).toHaveLength(0)
    expect(fake.find('service_request_contributions')).toHaveLength(1)
  })

  it('throws need lookup errors', async () => {
    useDb((query) => (query.table === 'service_requests' ? { error: { message: 'down' } } : { data: project() }))
    await expect(getProjectDetail({ searchParams: new URLSearchParams({ projectId: 'p1' }), userId: 0, userType: '' })).rejects.toEqual({ message: 'down' })
  })
})
