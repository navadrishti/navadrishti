import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withProjectMeta } from '@/lib/service-request-allocation'
import { getCompanyProjects } from '@/lib/service-request-assignments/company-projects'
import { getCsrTracking } from '@/lib/service-request-assignments/csr-tracking'
import { getNgoCompanyApplications } from '@/lib/service-request-assignments/ngo-company-applications'
import { getNgoLeadInvitations } from '@/lib/service-request-assignments/ngo-lead-invitations'
import {
  COMPANY_PROJECT_CONTRIBUTION_TYPE,
  LEAD_NGO_INVITE_CONTRIBUTION_TYPE,
} from '@/lib/service-request-assignments/shared'
import { callsOf, createDbFake, eqsOf, unknownColumns, type DbQuery, type DbResult } from './db-supabase-fake'

const mocks = vi.hoisted(() => ({ from: vi.fn(), eligible: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ supabase: { from: mocks.from } }))
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  ngoIsCsrEligibleForProject: mocks.eligible,
}))

let fake = createDbFake()

function useDb(responder: (query: DbQuery) => DbResult | undefined) {
  fake = createDbFake(responder)
  mocks.from.mockImplementation(fake.from)
  return fake
}

beforeEach(() => {
  useDb(() => undefined)
  mocks.eligible.mockReset().mockImplementation((status: unknown) => status === 'verified')
})

afterEach(() => {
  expect(unknownColumns(fake.queries)).toEqual([])
})

const ctx = (userId: number, userType: string) => ({ searchParams: new URLSearchParams(), userId, userType })

async function read(response: Response) {
  return { status: response.status, json: await response.json() }
}

const COMPANY = 5
const NGO = 1

function app(companyId: number, status = 'pending', extra: Record<string, unknown> = {}) {
  return { company_id: companyId, applicant_user_id: companyId, source: 'company_apply', applied_at: '2026-01-02', status, ...extra }
}

describe('getCompanyProjects', () => {
  const verifiedNgo = { id: NGO, name: 'Seva', email: 'seva@example.org', verification_status: 'verified', profile_data: {} }

  function project(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      ngo_id: NGO,
      title: `Project ${id}`,
      description: 'Build',
      location: 'Pune',
      exact_address: null,
      timeline: '3 months',
      status: 'active',
      csr_project_available_for_csr: true,
      assigned_company_user_id: null,
      assignment_status: 'pending',
      ngo: verifiedNgo,
      ...overrides,
    }
  }

  function companyDb(projects: unknown[], company = { email_verified: true, phone_verified: true, verification_status: 'verified' }) {
    return useDb((query) => {
      if (query.table === 'service_request_projects') return { data: projects }
      if (query.table === 'users') return { data: company }
      return undefined
    })
  }

  it.each(['ngo', 'individual', ''])('refuses %j users', async (userType) => {
    await expect(read(await getCompanyProjects(ctx(COMPANY, userType)))).resolves.toMatchObject({ status: 403 })
    expect(fake.queries).toHaveLength(0)
  })

  it('excludes own, cancelled and unavailable projects and ones taken by other companies', async () => {
    companyDb([
      project('open'),
      project('closed', { csr_project_available_for_csr: false }),
      project('taken', { assigned_company_user_id: 8, assignment_status: 'accepted' }),
      project('mine-accepted', { assigned_company_user_id: COMPANY, assignment_status: 'accepted' }),
      project('meta-taken', { description: withProjectMeta('Build', { pending_company_applications: [app(8, 'accepted')] }) }),
      project('ineligible', { ngo: [{ ...verifiedNgo, verification_status: 'pending' }] }),
      project('applied', { description: withProjectMeta('Build', { pending_company_applications: [app(COMPANY, 'pending', { note: 'Keen' })] }) }),
    ])

    const { status, json } = await read(await getCompanyProjects(ctx(COMPANY, 'company')))

    const [query] = fake.find('service_request_projects')
    expect(callsOf(query, 'neq')).toEqual([['ngo_id', COMPANY], ['status', 'cancelled']])
    expect(status).toBe(200)
    expect(json.meta).toEqual({ company_fully_verified: true })
    expect(json.data.map((item: { project_id: string; company_application_status: string; company_application_eligible: boolean }) => [
      item.project_id,
      item.company_application_status,
      item.company_application_eligible,
    ])).toEqual([
      ['open', 'none', true],
      ['applied', 'pending', false],
    ])
    expect(json.data[1]).toMatchObject({ note: 'Keen', latest_application_at: '2026-01-02', ngo_name: 'Seva', ngo_verified: true })
  })

  it('explains why an unverified company cannot apply', async () => {
    companyDb([project('open')], { email_verified: true, phone_verified: false, verification_status: 'verified' })
    const { json } = await read(await getCompanyProjects(ctx(COMPANY, 'company')))
    expect(json.meta).toEqual({ company_fully_verified: false })
    expect(json.data[0]).toMatchObject({
      company_application_eligible: false,
      company_application_reason: 'Complete email, phone, and document verification before applying for takeover.',
    })
  })

  it('throws project query errors', async () => {
    useDb((query) => (query.table === 'service_request_projects' ? { error: { message: 'down' } } : undefined))
    await expect(getCompanyProjects(ctx(COMPANY, 'company'))).rejects.toEqual({ message: 'down' })
  })
})

describe('getNgoCompanyApplications', () => {
  it('refuses non-NGO users', async () => {
    await expect(read(await getNgoCompanyApplications(ctx(COMPANY, 'company')))).resolves.toMatchObject({ status: 403 })
    expect(fake.queries).toHaveLength(0)
  })

  it('lists reviewable meta and contribution applications on own projects only', async () => {
    useDb((query) => {
      if (query.table === 'service_request_projects') {
        return {
          data: [{
            id: 'p1',
            title: 'Library',
            description: withProjectMeta('Books', {
              pending_company_applications: [
                app(COMPANY, 'pending', { note: 'Applied from marketplace' }),
                app(6, 'accepted', { note: 'We fund', company_name: 'Beta' }),
                app(7, 'rejected'),
                app(0, 'pending'),
              ],
            }),
            location: 'Pune',
            exact_address: null,
            created_at: '2026-01-01',
            updated_at: '2026-01-03',
          }],
        }
      }
      if (query.table === 'service_requests') {
        return {
          data: [{ id: 11, title: 'Shelves', status: 'active', request_type: null, category: 'infra', project_id: 'p2', project: [{ id: 'p2', title: 'Legacy', location: 'Nashik' }] }],
        }
      }
      if (query.table === 'service_request_contributions') {
        return {
          data: [
            { id: 'c1', service_request_id: 11, contributor_id: 9, status: 'pending', meta: { note: 'Legacy pledge' }, contributor: { id: 9, name: 'Gamma', email: 'g@example.org' } },
            { id: 'c2', service_request_id: 99, contributor_id: 10, status: 'pending', meta: {} },
          ],
        }
      }
      if (query.table === 'users') {
        return {
          data: [
            { id: COMPANY, name: 'Acme', email: 'acme@example.org', city: 'Pune', state_province: 'MH', verification_status: 'verified', phone: '99' },
            { id: 6, name: 'Beta Corp', email: 'beta@example.org', location: 'Mumbai' },
          ],
        }
      }
      return undefined
    })

    const { json } = await read(await getNgoCompanyApplications(ctx(NGO, 'ngo')))

    const [projects] = fake.find('service_request_projects')
    expect(eqsOf(projects)).toEqual({ ngo_id: NGO })
    const [needs] = fake.find('service_requests')
    expect(eqsOf(needs)).toEqual({ ngo_id: NGO })
    expect(callsOf(needs, 'not')).toEqual([['project_id', 'is', null]])
    const [contributions] = fake.find('service_request_contributions')
    expect(callsOf(contributions, 'in')[0]).toEqual(['service_request_id', [11]])
    expect(eqsOf(contributions)).toEqual({ contribution_type: COMPANY_PROJECT_CONTRIBUTION_TYPE })
    expect(callsOf(fake.find('users')[0], 'in')).toEqual([['id', [COMPANY, 6, 9]]])

    expect(json.data.map((entry: { project_id: string; company_id: number; status: string; note: string }) => [
      entry.project_id, entry.company_id, entry.status, entry.note,
    ])).toEqual([
      ['p1', COMPANY, 'pending', ''],
      ['p1', 6, 'accepted', 'We fund'],
      ['p2', 9, 'pending', 'Legacy pledge'],
    ])
    expect(json.data[0]).toMatchObject({ company_name: 'Acme', company_email: 'acme@example.org', company_location: 'Pune, MH', company_verified: true })
    expect(json.data[1]).toMatchObject({ company_name: 'Beta', company_location: 'Mumbai', company_verified: false })
    expect(json.data[2]).toMatchObject({ company_name: 'Gamma', project_title: 'Legacy', needs: [{ id: 11, request_type: 'infra' }] })
  })

  it('skips the contribution lookup without legacy needs', async () => {
    useDb((query) => (query.table === 'service_request_projects' || query.table === 'service_requests' ? { data: [] } : undefined))
    await expect(read(await getNgoCompanyApplications(ctx(NGO, 'ngo')))).resolves.toEqual({ status: 200, json: { success: true, data: [] } })
    expect(fake.find('service_request_contributions')).toHaveLength(0)
    expect(fake.find('users')).toHaveLength(0)
  })

  it('throws query errors', async () => {
    useDb((query) => (query.table === 'service_requests' ? { error: { message: 'down' } } : { data: [] }))
    await expect(getNgoCompanyApplications(ctx(NGO, 'ngo'))).rejects.toEqual({ message: 'down' })
  })
})

describe('getNgoLeadInvitations', () => {
  it('refuses non-NGO users', async () => {
    await expect(read(await getNgoLeadInvitations(ctx(COMPANY, 'company')))).resolves.toMatchObject({ status: 403 })
    expect(fake.queries).toHaveLength(0)
  })

  it("lists the NGO's own invites with project and company details", async () => {
    useDb((query) => {
      if (query.table === 'service_request_contributions') {
        return {
          data: [
            { id: 'i1', status: 'pending', reference_text: null, created_at: '2026-01-05', meta: { project_id: 'p1', inviting_company_id: COMPANY, note: 'Lead us' } },
            { id: 'i2', status: 'expired', reference_text: 'Old', created_at: '2026-01-01', meta: {} },
          ],
        }
      }
      if (query.table === 'service_request_projects') return { data: [{ id: 'p1', title: 'Library', location: 'Pune', exact_address: 'Ward 4' }] }
      if (query.table === 'users') return { data: [{ id: COMPANY, name: 'Acme', email: 'acme@example.org' }] }
      return undefined
    })

    const { json } = await read(await getNgoLeadInvitations(ctx(NGO, 'ngo')))

    const [invites] = fake.find('service_request_contributions')
    expect(eqsOf(invites)).toEqual({ contribution_type: LEAD_NGO_INVITE_CONTRIBUTION_TYPE, contributor_id: NGO })
    expect(callsOf(fake.find('service_request_projects')[0], 'in')).toEqual([['id', ['p1']]])
    expect(fake.find('users')[0].columns).toBe('id, name, email')
    expect(json.data).toEqual([
      {
        id: 'i1', status: 'pending', note: 'Lead us', invited_at: '2026-01-05', project_id: 'p1', project_title: 'Library',
        project_location: 'Ward 4', project_timeline: '', company_id: COMPANY, company_name: 'Acme', company_email: 'acme@example.org',
      },
      {
        id: 'i2', status: 'expired', note: 'Old', invited_at: '2026-01-01', project_id: '', project_title: 'Project',
        project_location: '', project_timeline: '', company_id: 0, company_name: 'Company', company_email: '',
      },
    ])
  })

  it('makes no lookups without invites', async () => {
    useDb(() => ({ data: [] }))
    await getNgoLeadInvitations(ctx(NGO, 'ngo'))
    expect(fake.queries.map((query) => query.table)).toEqual(['service_request_contributions'])
  })

  it('throws invite query errors', async () => {
    useDb(() => ({ error: { message: 'down' } }))
    await expect(getNgoLeadInvitations(ctx(NGO, 'ngo'))).rejects.toEqual({ message: 'down' })
  })
})

describe('getCsrTracking', () => {
  const trackedProject = {
    id: 'p1',
    ngo_id: NGO,
    title: 'Library',
    status: 'in_progress',
    lead_ngo_user_id: 2,
    assigned_company_user_id: COMPANY,
    assignment_status: 'accepted',
    updated_at: '2026-02-01',
  }

  type TrackingOptions = {
    contributions?: unknown[]
    needs?: unknown[]
    assigned?: unknown[]
    projects?: unknown[]
    invites?: unknown[]
    repaired?: unknown
  }

  function trackingDb(options: TrackingOptions) {
    return useDb((query) => {
      const eqs = eqsOf(query)
      if (query.table === 'service_request_contributions') {
        return { data: eqs.contribution_type === LEAD_NGO_INVITE_CONTRIBUTION_TYPE ? options.invites ?? [] : options.contributions ?? [] }
      }
      if (query.table === 'service_requests') return { data: options.needs ?? [] }
      if (query.table === 'service_request_projects') {
        if (query.op === 'update') return { data: options.repaired ?? null }
        if (callsOf(query, 'not').length > 0) return { data: options.assigned ?? [] }
        return { data: options.projects ?? [] }
      }
      if (query.table === 'users') {
        return {
          data: [
            { id: NGO, name: 'Seva', email: 'seva@example.org', verification_status: 'verified' },
            { id: 2, name: 'Lead', email: 'lead@example.org', verification_status: 'verified' },
            { id: 3, name: 'Invitee', email: 'inv@example.org', verification_status: 'pending' },
            { id: COMPANY, name: 'Acme', email: 'acme@example.org', verification_status: 'verified' },
          ],
        }
      }
      return undefined
    })
  }

  it('refuses individuals', async () => {
    await expect(read(await getCsrTracking(ctx(9, 'individual')))).resolves.toMatchObject({ status: 403 })
    expect(fake.queries).toHaveLength(0)
  })

  it('returns nothing when the company has no handoffs', async () => {
    trackingDb({})
    await expect(read(await getCsrTracking(ctx(COMPANY, 'company')))).resolves.toEqual({ status: 200, json: { success: true, data: [] } })
    const [contributions] = fake.find('service_request_contributions')
    expect(eqsOf(contributions)).toEqual({ contribution_type: COMPANY_PROJECT_CONTRIBUTION_TYPE, contributor_id: COMPANY })
    expect(callsOf(contributions, 'in')).toEqual([['status', ['accepted', 'in_progress', 'completed']]])
    const [assigned] = fake.find('service_request_projects')
    expect(eqsOf(assigned)).toEqual({ assigned_company_user_id: COMPANY })
  })

  it("shows the company its assigned project with only that pair's lead invites", async () => {
    trackingDb({
      assigned: [trackedProject],
      projects: [trackedProject],
      needs: [{ id: 11, project_id: 'p1', title: 'Shelves', status: 'active', request_type: 'Infrastructure Project', project_context: {} }],
      invites: [
        { id: 'i1', contributor_id: 3, status: 'pending', meta: { project_id: 'p1', inviting_company_id: COMPANY, selected_as_lead: 'yes' } },
        { id: 'i2', contributor_id: 3, status: 'pending', meta: { project_id: 'p1', inviting_company_id: 8 } },
        { id: 'i3', contributor_id: 3, status: 'pending', meta: { project_id: 'p9', inviting_company_id: COMPANY } },
      ],
    })

    const { json } = await read(await getCsrTracking(ctx(COMPANY, 'company')))

    expect(fake.find('service_request_projects', 'update')).toHaveLength(0)
    expect(json.data).toHaveLength(1)
    expect(json.data[0]).toMatchObject({
      project_id: 'p1',
      project_category: 'Infrastructure Project',
      lead_ngo_id: NGO,
      lead_ngo_name: 'Seva',
      assigned_company_id: COMPANY,
      assigned_company_name: 'Acme',
      selected_lead_ngo_id: 2,
      selected_lead_ngo_name: 'Lead',
      ngo_dashboard_role: 'viewer',
      assignment_status: 'accepted',
      needs: [{ id: 11, title: 'Shelves', status: 'active', request_type: 'Infrastructure Project' }],
    })
    expect(json.data[0].lead_ngo_invites).toEqual([
      expect.objectContaining({ id: 'i1', ngo_id: 3, ngo_name: 'Invitee', ngo_verified: false, selected_as_lead: true }),
    ])
  })

  it('only loads lead invites for the tracked projects', async () => {
    trackingDb({ assigned: [trackedProject, { ...trackedProject, id: 'p2' }], projects: [trackedProject, { ...trackedProject, id: 'p2' }] })
    await getCsrTracking(ctx(COMPANY, 'company'))
    const invites = fake.find('service_request_contributions').find((query) => eqsOf(query).contribution_type === LEAD_NGO_INVITE_CONTRIBUTION_TYPE)
    expect(callsOf(invites, 'in')).toEqual([['meta->>project_id', ['p1', 'p2']]])
  })

  it('limits NGOs to projects they own or lead', async () => {
    trackingDb({
      contributions: [
        { id: 'c1', service_request_id: 11, contributor_id: COMPANY, status: 'accepted', meta: {} },
        { id: 'c2', service_request_id: 12, contributor_id: COMPANY, status: 'accepted', meta: {} },
      ],
      needs: [
        { id: 11, project_id: 'p1', ngo_id: NGO },
        { id: 12, project_id: 'p2', ngo_id: 44 },
      ],
      projects: [{ ...trackedProject, lead_ngo_user_id: null }],
    })

    const { json } = await read(await getCsrTracking(ctx(NGO, 'ngo')))

    const assigned = fake.find('service_request_projects').find((query) => callsOf(query, 'not').length > 0)
    expect(callsOf(assigned, 'or')).toEqual([[`ngo_id.eq.${NGO},lead_ngo_user_id.eq.${NGO}`]])
    const final = fake.find('service_request_projects').at(-1)
    expect(callsOf(final, 'in')).toEqual([['id', ['p1']]])
    expect(json.data.map((row: { project_id: string; ngo_dashboard_role: string }) => [row.project_id, row.ngo_dashboard_role])).toEqual([
      ['p1', 'request_owner'],
    ])
  })

  it('lets the selected lead NGO see the project', async () => {
    trackingDb({
      contributions: [{ id: 'c2', service_request_id: 12, contributor_id: COMPANY, status: 'accepted', meta: {} }],
      needs: [{ id: 12, project_id: 'p1', ngo_id: 44 }],
      projects: [{ ...trackedProject, ngo_id: 44, lead_ngo_user_id: 2 }],
    })
    const { json } = await read(await getCsrTracking(ctx(2, 'ngo')))
    const leadLookup = fake.find('service_request_projects').find((query) => query.columns === 'id, lead_ngo_user_id')
    expect(callsOf(leadLookup, 'in')).toEqual([['id', ['p1']]])
    expect(json.data.map((row: { ngo_dashboard_role: string }) => row.ngo_dashboard_role)).toEqual(['selected_lead'])
  })

  it('repairs a project whose accepted handoff never set the assigned company', async () => {
    const unassigned = { ...trackedProject, assigned_company_user_id: null, assignment_status: null, lead_ngo_user_id: null, status: 'active' }
    trackingDb({
      contributions: [{ id: 'c1', service_request_id: 11, contributor_id: COMPANY, status: 'accepted', meta: { review_note: 'Welcome' } }],
      needs: [{ id: 11, project_id: 'p1', ngo_id: NGO }],
      projects: [unassigned],
      repaired: { ...unassigned, assigned_company_user_id: COMPANY, assignment_status: 'accepted', lead_ngo_user_id: NGO, status: 'in_progress' },
    })

    const { json } = await read(await getCsrTracking(ctx(COMPANY, 'company')))

    const [repair] = fake.find('service_request_projects', 'update')
    expect(repair.payload).toMatchObject({
      assigned_company_user_id: COMPANY,
      assignment_status: 'accepted',
      lead_ngo_user_id: NGO,
      status: 'in_progress',
    })
    expect(eqsOf(repair)).toEqual({ id: 'p1' })
    expect(callsOf(repair, 'is')).toEqual([['assigned_company_user_id', null]])
    expect(json.data[0]).toMatchObject({ assigned_company_id: COMPANY, review_note: 'Welcome', selected_lead_ngo_id: NGO })
  })
})
