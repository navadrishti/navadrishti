import { beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonRequest, tokenFor } from './support/requests'
import { eqValue, hasCall, supabaseFake, type FakeQuery } from './support/supabase-fake'
import { respondToLeadNgoInvitation } from '@/lib/service-request-assignments/lead-ngo'
import { submitProjectApplication } from '@/lib/service-request-assignments/project-applications'
import { LEAD_NGO_INVITE_CONTRIBUTION_TYPE } from '@/lib/service-request-assignments/shared'

vi.mock('@/lib/db', async () => {
  const { supabaseFake: fake } = await import('./support/supabase-fake')
  return {
    supabase: fake.client,
    buildProjectLeadNgoPatch: (id: number) => ({ lead_ngo_user_id: id > 0 ? id : null }),
    getProjectLeadNgoId: (project: { lead_ngo_user_id?: number } | null) => Number(project?.lead_ngo_user_id || 0),
  }
})

vi.mock('@/lib/server-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server-auth')>()),
  assertNgoCsr1CoversProject: vi.fn(async () => ({ ok: true })),
}))

vi.mock('@/lib/service-request-assignments/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/service-request-assignments/shared')>()),
  isFullyVerifiedCompany: vi.fn(async () => true),
}))

const contributions = () => supabaseFake.queries.filter((query) => query.table === 'service_request_contributions')

beforeEach(() => {
  supabaseFake.reset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('revoke-lead-ngo', () => {
  let removed: unknown[] = []

  beforeEach(() => {
    removed = [{ id: 'inv1' }]
    supabaseFake.respondWith((query: FakeQuery) => {
      if (query.table === 'service_request_projects') return { data: { id: 'p1', ngo_id: 3, description: '' } }
      if (query.table === 'service_requests') return { data: [] }
      if (query.table === 'service_request_contributions' && query.op === 'delete') return { data: removed }
      return undefined
    })
  })

  const revoke = (body: Record<string, unknown>, token = tokenFor(10, 'company')) =>
    submitProjectApplication(
      jsonRequest('http://localhost/api/service-request-projects/p1', {
        token,
        body: { action: 'revoke-lead-ngo', projectId: 'p1', ...body },
      })
    )

  it('deletes only pending invites from this company', async () => {
    const response = await revoke({ ngoId: 6 })
    expect(response.status).toBe(200)
    const [remove] = contributions()
    expect(remove.op).toBe('delete')
    expect(eqValue(remove, 'contribution_type')).toBe(LEAD_NGO_INVITE_CONTRIBUTION_TYPE)
    expect(eqValue(remove, 'meta->>project_id')).toBe('p1')
    expect(eqValue(remove, 'meta->>inviting_company_id')).toBe('10')
    expect(eqValue(remove, 'contributor_id')).toBe(6)
    const statuses = remove.calls.find((call) => call[0] === 'in')?.[2]
    expect(statuses).toEqual(['pending', 'invited', 'pending_acceptance', 'awaiting_acceptance', 'offered'])
  })

  it('returns 409 when the invite was already answered', async () => {
    removed = []
    const response = await revoke({ ngoId: 6 })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'This invite has already been answered and can no longer be removed.' })
  })

  it.each([
    [{ ngoId: 0 }, 400],
    [{ ngoId: 'abc' }, 400],
    [{ projectId: '' , ngoId: 6 }, 400],
  ])('rejects %j', async (body, status) => {
    expect((await revoke(body)).status).toBe(status)
    expect(contributions()).toHaveLength(0)
  })

  it('only allows companies', async () => {
    expect((await revoke({ ngoId: 6 }, tokenFor(6, 'ngo'))).status).toBe(403)
    expect(supabaseFake.queries).toHaveLength(0)
  })

  it('requires a token', async () => {
    const response = await submitProjectApplication(
      jsonRequest('http://localhost/api/service-request-projects/p1', { body: { action: 'revoke-lead-ngo' } })
    )
    expect(response.status).toBe(401)
  })
})

describe('respondToLeadNgoInvitation', () => {
  type Options = {
    invite?: Record<string, unknown> | null
    existingAccepted?: Record<string, unknown> | null
    inviteUpdated?: boolean
    projectClaimed?: boolean
  }

  function setup(options: Options = {}) {
    const invite =
      options.invite === undefined
        ? { id: 'inv1', contributor_id: 5, status: 'pending', meta: { project_id: 'p1', inviting_company_id: 10 } }
        : options.invite
    supabaseFake.respondWith((query) => {
      if (query.table === 'service_request_projects') {
        if (query.op === 'update') return { data: options.projectClaimed === false ? null : { id: 'p1' } }
        return { data: { valid_until: null, timeline: null } }
      }
      if (query.table !== 'service_request_contributions') return undefined
      if (query.op === 'update') {
        return { data: eqValue(query, 'id') === 'inv1' && options.inviteUpdated === false ? null : { id: 'inv1' } }
      }
      if (hasCall(query, 'eq', 'status', 'accepted')) return { data: options.existingAccepted ?? null }
      return { data: invite }
    })
  }

  const respond = (body: Record<string, unknown>, userId = 5, userType = 'ngo') =>
    respondToLeadNgoInvitation({ body: { inviteId: 'inv1', ...body }, userId, userType })

  const updates = () => contributions().filter((query) => query.op === 'update')

  it('only lets NGOs respond', async () => {
    setup()
    expect((await respond({ decision: 'accepted' }, 10, 'company')).status).toBe(403)
  })

  it.each([[{ decision: 'maybe' }], [{ inviteId: '', decision: 'accepted' }]])('rejects %j', async (body) => {
    setup()
    expect((await respond(body)).status).toBe(400)
  })

  it("hides other NGOs' invites", async () => {
    setup()
    expect((await respond({ decision: 'accepted' }, 6)).status).toBe(404)
    expect(updates()).toHaveLength(0)
  })

  it.each(['accepted', 'rejected', 'expired'])('returns 409 for an invite already %s', async (status) => {
    setup({ invite: { id: 'inv1', contributor_id: 5, status, meta: { project_id: 'p1' } } })
    expect((await respond({ decision: 'accepted' })).status).toBe(409)
    expect(updates()).toHaveLength(0)
  })

  it('claims the lead conditionally and expires other invites', async () => {
    setup()
    const response = await respond({ decision: 'accepted' })
    expect(response.status).toBe(200)

    const [own, others] = updates()
    expect(own.payload).toMatchObject({ status: 'accepted', meta: { selected_as_lead: true } })
    expect(own.calls.find((call) => call[0] === 'in')?.[1]).toBe('status')

    const [claim] = supabaseFake.find('service_request_projects', 'update')
    expect(claim.payload).toMatchObject({ lead_ngo_user_id: 5, assignment_status: 'lead_selected' })
    expect(claim.calls).toContainEqual(['or', 'lead_ngo_user_id.is.null,lead_ngo_user_id.eq.5'])

    expect(others.payload).toMatchObject({ status: 'expired' })
    expect(others.calls).toContainEqual(['neq', 'id', 'inv1'])
    expect(eqValue(others, 'meta->>project_id')).toBe('p1')
    expect(eqValue(others, 'meta->>inviting_company_id')).toBe('10')
  })

  it('expires its own invite when another lead already accepted', async () => {
    setup({ existingAccepted: { id: 'inv2', contributor_id: 6 } })
    const response = await respond({ decision: 'accepted' })
    expect(response.status).toBe(409)
    expect(updates().map((query) => [eqValue(query, 'id'), (query.payload as { status: string }).status])).toEqual([
      ['inv1', 'expired'],
    ])
    expect(supabaseFake.find('service_request_projects', 'update')).toHaveLength(0)
  })

  it('expires its own invite when it loses the race for the project', async () => {
    setup({ projectClaimed: false })
    const response = await respond({ decision: 'accepted' })
    expect(response.status).toBe(409)
    const [accept, expire] = updates()
    expect(accept.payload).toMatchObject({ status: 'accepted' })
    expect(expire.payload).toMatchObject({ status: 'expired', meta: { selected_as_lead: false } })
    expect(eqValue(expire, 'id')).toBe('inv1')
    expect(updates()).toHaveLength(2)
  })

  it('returns 409 when the invite changed before the update', async () => {
    setup({ inviteUpdated: false })
    expect((await respond({ decision: 'accepted' })).status).toBe(409)
    expect(supabaseFake.find('service_request_projects', 'update')).toHaveLength(0)
  })

  it('rejecting does not touch the project', async () => {
    setup()
    const response = await respond({ decision: 'Rejected' })
    expect(response.status).toBe(200)
    expect(updates()[0].payload).toMatchObject({ status: 'rejected', meta: { selected_as_lead: false } })
    expect(supabaseFake.find('service_request_projects', 'update')).toHaveLength(0)
  })
})
