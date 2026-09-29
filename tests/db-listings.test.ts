import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildProjectLeadNgoPatch, getProjectLeadNgoId, requestProjects } from '@/lib/db/request-projects'
import { serviceClients, serviceOffers } from '@/lib/db/service-offers'
import {
  applyVolunteerAcceptanceAllocation,
  releaseVolunteerAllocation,
  serviceRequestContributions,
  serviceRequests,
} from '@/lib/db/service-requests'
import { NeedCapacityExceededError, ServiceRequestDeleteBlockedError } from '@/lib/service-requests/errors'
import type { Tables } from '@/lib/database.types'
import { callsOf, compact, createSupabaseFake, eqsOf, unknownColumns, type FakeQuery, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }))

let fake = createSupabaseFake()

function useDb(responder: Record<string, FakeResult[]> | ((query: FakeQuery) => FakeResult | undefined) = {}) {
  fake = createSupabaseFake(responder)
  mocks.from.mockImplementation(fake.from)
  mocks.rpc.mockImplementation(fake.rpc)
  return fake
}

beforeEach(() => {
  useDb()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  expect(unknownColumns(fake.queries)).toEqual([])
})

const past = '2020-01-01T00:00:00.000Z'
const future = '2999-01-01T00:00:00.000Z'

describe('serviceOffers', () => {
  it('filters by status and creator and counts accepted hires', async () => {
    useDb({
      'service_offers.select': [{
        data: [
          { id: 1, creator_id: 5, valid_until: null },
          { id: 2, creator_id: 5, valid_until: future },
          { id: 3, creator_id: 5, valid_until: past },
        ],
      }],
      'service_clients.select': [{ data: [{ service_offer_id: 1 }, { service_offer_id: 1 }] }],
    })

    const offers = await serviceOffers.getAll({ status: 'active', ngo_id: 5 })

    const [offerQuery, hireQuery] = fake.queries
    expect(eqsOf(offerQuery)).toEqual({ status: 'active', creator_id: 5 })
    expect(compact(offerQuery.columns)).toBe('*,ngo:users!creator_id(name,email,user_type,verification_status)')
    expect(callsOf(hireQuery, 'in')).toEqual([['service_offer_id', [1, 2]]])
    expect(eqsOf(hireQuery)).toEqual({ status: 'accepted' })
    expect(offers).toMatchObject([
      { id: 1, ngo_id: 5, applications_count: 2 },
      { id: 2, ngo_id: 5, applications_count: 0 },
    ])
  })

  it('keeps expired offers when asked', async () => {
    useDb({ 'service_offers.select': [{ data: [{ id: 3, creator_id: 5, valid_until: past }] }] })
    await expect(serviceOffers.getAll({ includeExpired: true })).resolves.toHaveLength(1)
  })

  it('throws list errors', async () => {
    useDb({ 'service_offers.select': [{ error: { message: 'down' } }] })
    await expect(serviceOffers.getAll()).rejects.toEqual({ message: 'down' })
  })

  it('maps creator_id to ngo_id on getById', async () => {
    useDb({ 'service_offers.select': [{ data: { id: 1, creator_id: 5 } }] })
    await expect(serviceOffers.getById(1)).resolves.toEqual({ id: 1, creator_id: 5, ngo_id: 5 })
  })

  it('returns null for a missing offer', async () => {
    useDb({ 'service_offers.select': [{ error: { code: 'PGRST116' } }] })
    await expect(serviceOffers.getById(1)).resolves.toBeNull()
  })

  it('scopes deletes to the owner', async () => {
    await serviceOffers.delete('7', 5)
    expect(fake.queries[0].op).toBe('delete')
    expect(eqsOf(fake.queries[0])).toEqual({ id: 7, creator_id: 5 })
  })

  it('updates by numeric id', async () => {
    useDb({ 'service_offers.update': [{ data: { id: 7 } }] })
    await serviceOffers.update('7', { title: 'New' })
    expect(eqsOf(fake.queries[0])).toEqual({ id: 7 })
  })

  it('lists clients newest first with the client profile', async () => {
    useDb({ 'service_clients.select': [{ data: [{ id: 1 }] }] })
    await expect(serviceClients.getByOfferId(4)).resolves.toEqual([{ id: 1 }])
    expect(compact(fake.queries[0].columns)).toBe('*,client:users!client_id(name,email,user_type)')
    expect(callsOf(fake.queries[0], 'order')).toEqual([['applied_at', { ascending: false }]])
  })
})

describe('serviceRequests.getAll', () => {
  it('attaches requester, project and accepted volunteer counts', async () => {
    useDb({
      'service_requests.select': [{ data: [{ id: 1, ngo_id: 5, project_id: 'p1' }, { id: 2, ngo_id: 6, project_id: null }] }],
      'users.select': [{ data: [{ id: 5, name: 'NGO' }] }],
      'service_request_projects.select': [{ data: [{ id: 'p1', title: 'Library' }] }],
      'service_request_applications.select': [{ data: [{ service_request_id: 1 }, { service_request_id: 1 }] }],
    })

    const rows = await serviceRequests.getAll({ category: 'edu', status: 'active', ngo_id: 5, project_id: 'p1' })

    const [requestQuery, userQuery, projectQuery, applicationQuery] = fake.queries
    expect(eqsOf(requestQuery)).toEqual({ category: 'edu', status: 'active', ngo_id: 5, project_id: 'p1' })
    expect(callsOf(userQuery, 'in')).toEqual([['id', [5, 6]]])
    expect(userQuery.columns).not.toContain('password')
    expect(callsOf(projectQuery, 'in')).toEqual([['id', ['p1']]])
    expect(callsOf(applicationQuery, 'in')).toEqual([
      ['service_request_id', [1, 2]],
      ['status', ['accepted', 'active', 'completed']],
    ])
    expect(rows).toEqual([
      { id: 1, ngo_id: 5, project_id: 'p1', requester: { id: 5, name: 'NGO' }, project: { id: 'p1', title: 'Library' }, volunteers_count: 2 },
      { id: 2, ngo_id: 6, project_id: null, requester: undefined, project: null, volunteers_count: 0 },
    ])
  })

  it('skips the project lookup when no request has a project', async () => {
    useDb({ 'service_requests.select': [{ data: [{ id: 1, ngo_id: 5, project_id: null }] }] })
    await serviceRequests.getAll()
    expect(fake.find('service_request_projects')).toHaveLength(0)
  })

  it('throws list errors', async () => {
    useDb({ 'service_requests.select': [{ error: { message: 'down' } }] })
    await expect(serviceRequests.getAll()).rejects.toEqual({ message: 'down' })
  })
})

describe('serviceRequests.getById', () => {
  it('loads the requester without secrets and the project', async () => {
    useDb({
      'service_requests.select': [{ data: { id: 1, ngo_id: 5, project_id: 'p1' } }],
      'users.select': [{ data: { id: 5 } }],
      'service_request_projects.select': [{ data: { id: 'p1' } }],
    })
    await expect(serviceRequests.getById(1)).resolves.toEqual({
      id: 1, ngo_id: 5, project_id: 'p1', requester: { id: 5 }, project: { id: 'p1' },
    })
    const [userQuery] = fake.find('users')
    expect(userQuery.columns).not.toMatch(/password|two_factor/)
    expect(eqsOf(userQuery)).toEqual({ id: 5 })
  })

  it('returns null for a missing request', async () => {
    useDb({ 'service_requests.select': [{ error: { code: 'PGRST116' } }] })
    await expect(serviceRequests.getById(1)).resolves.toBeNull()
    expect(fake.queries).toHaveLength(1)
  })
})

describe('serviceRequests writes', () => {
  const parent = {
    id: 'p1',
    expected_beneficiaries: 40,
    location: 'Pune',
    exact_address: 'Ward 4, Pune',
    timeline: '3 months',
    description: 'Library',
    title: 'Library project',
    valid_until: future,
  }

  it('inherits project fields on create', async () => {
    useDb({
      'service_request_projects.select': [{ data: parent }],
      'service_requests.insert': [{ data: { id: 9 } }],
    })
    await serviceRequests.create({ ngo_id: 5, title: 'Books', description: 'd', category: 'edu', project_id: 'p1' })
    const [insert] = fake.find('service_requests', 'insert')
    expect(insert.payload).toMatchObject({
      beneficiary_count: 40,
      location: 'Ward 4, Pune',
      impact_description: 'Library',
      timeline: '3 months',
      project_context: { project: { id: 'p1', title: 'Library project', exact_address: 'Ward 4, Pune', valid_until: future } },
    })
  })

  it('throws insert errors', async () => {
    useDb({ 'service_requests.insert': [{ error: { message: 'bad' } }] })
    await expect(
      serviceRequests.create({ ngo_id: 5, title: 'Books', description: 'd', category: 'edu' })
    ).rejects.toEqual({ message: 'bad' })
  })

  it.each([
    ['a standalone need', { data: { id: 1, project_id: null } }, null],
    ['a need whose project is still valid', { data: { id: 1, project_id: 'p1' } }, { data: { id: 'p1', valid_until: future } }],
    ['a need whose project has no expiry', { data: { id: 1, project_id: 'p1' } }, { data: { id: 'p1', valid_until: null } }],
  ])('refuses to expire %s', async (_name, need, project) => {
    useDb({
      'service_requests.select': [need],
      'service_request_projects.select': project ? [project] : [],
    })
    await expect(serviceRequests.update(1, { status: 'expired' })).rejects.toThrow()
    await expect(serviceRequests.updateStatus(1, 'EXPIRED')).rejects.toThrow()
    expect(fake.find('service_requests', 'update')).toHaveLength(0)
  })

  it('expires a need once its project lapsed', async () => {
    useDb({
      'service_requests.select': [{ data: { id: 1, project_id: 'p1' } }],
      'service_request_projects.select': [{ data: { valid_until: past } }],
      'service_requests.update': [{ data: { id: 1, status: 'expired' } }],
    })
    await expect(serviceRequests.updateStatus(1, 'expired')).resolves.toEqual({ id: 1, status: 'expired' })
    const [update] = fake.find('service_requests', 'update')
    expect(update.payload).toMatchObject({ status: 'expired' })
    expect(eqsOf(update)).toEqual({ id: 1 })
  })

  it('propagates lookup errors while expiring', async () => {
    useDb({ 'service_requests.select': [{ error: { message: 'down' } }] })
    await expect(serviceRequests.updateStatus(1, 'expired')).rejects.toEqual({ message: 'down' })
  })

  describe('delete', () => {
    const writes = () =>
      fake.queries.filter((query) => query.op !== 'select').map((query) => [query.table, query.op])

    it('removes non-financial dependents in foreign key order before the owned request', async () => {
      useDb({
        'service_requests.select': [{ data: { id: 4 } }],
        'service_request_applications.select': [{ data: [{ id: 21 }, { id: 22 }] }],
        'service_request_contributions.select': [{ data: [{ id: 'c1', status: 'pledged' }] }],
        'razorpay_payment_orders.select': [
          { data: [{ id: 'o1', order_status: 'created' }] },
          { data: [{ id: 'o1', order_status: 'created' }, { id: 'o2', order_status: 'failed' }] },
          { data: [] },
        ],
        'razorpay_payments.select': [{ data: [] }],
        'service_request_shipments.select': [{ data: [{ id: 's1' }] }],
      })

      await expect(serviceRequests.delete('4', 5)).resolves.toBe(true)

      expect(eqsOf(fake.queries[0])).toEqual({ id: 4, ngo_id: 5 })
      const [bySelf, byApplication, byContribution] = fake.find('razorpay_payment_orders', 'select')
      expect(eqsOf(bySelf)).toEqual({ service_request_id: 4 })
      expect(callsOf(byApplication, 'in')).toEqual([['application_id', [21, 22]]])
      expect(callsOf(byContribution, 'in')).toEqual([['contribution_id', ['c1']]])
      expect(callsOf(fake.find('razorpay_payments')[0], 'in')).toEqual([['order_id', ['o1', 'o2']]])

      expect(writes()).toEqual([
        ['shipment_tracking_events', 'delete'],
        ['service_request_shipments', 'delete'],
        ['razorpay_payment_orders', 'delete'],
        ['service_request_fulfillments', 'delete'],
        ['service_request_contributions', 'delete'],
        ['service_request_applications', 'delete'],
        ['service_clients', 'update'],
        ['service_requests', 'delete'],
      ])
      expect(callsOf(fake.find('shipment_tracking_events')[0], 'in')).toEqual([['shipment_id', ['s1']]])
      expect(callsOf(fake.find('razorpay_payment_orders', 'delete')[0], 'in')).toEqual([['id', ['o1', 'o2']]])
      for (const table of ['service_request_fulfillments', 'service_request_contributions', 'service_request_applications']) {
        expect(eqsOf(fake.find(table, 'delete')[0])).toEqual({ service_request_id: 4 })
      }
      const [unlink] = fake.find('service_clients', 'update')
      expect(unlink.payload).toEqual({ service_request_id: null })
      expect(eqsOf(unlink)).toEqual({ service_request_id: 4 })
      expect(eqsOf(fake.find('service_requests', 'delete')[0])).toEqual({ id: 4, ngo_id: 5 })
    })

    it('skips the ownership check and optional lookups for an admin delete of a bare need', async () => {
      await expect(serviceRequests.delete(4)).resolves.toBe(true)
      expect(fake.find('service_requests', 'select')).toHaveLength(0)
      expect(fake.find('razorpay_payment_orders', 'select')).toHaveLength(1)
      expect(fake.find('razorpay_payments')).toHaveLength(0)
      expect(writes()).toEqual([
        ['service_request_fulfillments', 'delete'],
        ['service_request_contributions', 'delete'],
        ['service_request_applications', 'delete'],
        ['service_clients', 'update'],
        ['service_requests', 'delete'],
      ])
      expect(eqsOf(fake.find('service_requests', 'delete')[0])).toEqual({ id: 4 })
    })

    it('refuses to touch a need the requester does not own', async () => {
      useDb({ 'service_requests.select': [{ data: null }] })
      await expect(serviceRequests.delete(4, 5)).rejects.toThrow('Service request not found')
      expect(fake.queries).toHaveLength(1)
    })

    it.each([
      ['a paid contribution', { 'service_request_contributions.select': [{ data: [{ id: 'c1', status: 'PAID' }] }] }],
      ['a refund', { 'razorpay_refunds.select': [{ data: [{ id: 'r1' }] }] }],
      [
        'a paid order on one of its applications',
        {
          'service_request_applications.select': [{ data: [{ id: 21 }] }],
          'razorpay_payment_orders.select': [{ data: [] }, { data: [{ id: 'o1', order_status: 'paid' }] }],
        },
      ],
      [
        'a captured payment on an unsettled order',
        {
          'razorpay_payment_orders.select': [{ data: [{ id: 'o1', order_status: 'attempted' }] }],
          'razorpay_payments.select': [{ data: [{ id: 'p1' }] }],
        },
      ],
    ])('refuses to delete a need with %s', async (_label, responses: Record<string, FakeResult[]>) => {
      useDb(responses)
      const error = await serviceRequests.delete(4).catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(ServiceRequestDeleteBlockedError)
      expect(error).toMatchObject({ message: 'This need has payment records and cannot be deleted.' })
      expect(writes()).toEqual([])
    })

    it.each([
      ['service_request_applications.select'],
      ['service_request_contributions.select'],
      ['razorpay_refunds.select'],
      ['razorpay_payment_orders.select'],
      ['service_request_shipments.select'],
    ])('stops when %s fails', async (key) => {
      useDb({ [key]: [{ error: { message: 'down' } }] })
      await expect(serviceRequests.delete(4)).rejects.toEqual({ message: 'down' })
      expect(writes()).toEqual([])
    })

    it('throws dependent delete failures instead of deleting the need', async () => {
      useDb({ 'service_request_fulfillments.delete': [{ error: { message: 'violates foreign key constraint' } }] })
      await expect(serviceRequests.delete(4)).rejects.toEqual({ message: 'violates foreign key constraint' })
      expect(fake.find('service_requests', 'delete')).toHaveLength(0)
      expect(fake.find('service_request_applications', 'delete')).toHaveLength(0)
    })
  })

  it('lists contributions with the contributor profile', async () => {
    useDb({ 'service_request_contributions.select': [{ data: null }] })
    await expect(serviceRequestContributions.getByRequestId(3)).resolves.toEqual([])
    expect(compact(fake.queries[0].columns)).toBe('*,contributor:users!contributor_id(id,name,email,user_type,profile_image)')
  })
})

describe('applyVolunteerAcceptanceAllocation', () => {
  const request = {
    id: 1,
    request_type: 'Financial Need',
    target_amount: 1000,
    current_amount: 200,
    remaining_amount: 800,
    target_quantity: null,
    current_quantity: 0,
    remaining_quantity: null,
  } as unknown as Tables<'service_requests'>

  const missingFunction = { error: { code: 'PGRST202', message: 'missing' } }

  it('adds the amount in one guarded database call', async () => {
    useDb({ 'adjust_service_request_progress.rpc': [{ data: [{ id: 1, current_amount: 500 }] }] })
    await expect(applyVolunteerAcceptanceAllocation(request, { amount: 300 })).resolves.toEqual({ id: 1, current_amount: 500 })
    expect(fake.queries).toHaveLength(1)
    expect(fake.queries[0].payload).toEqual({
      p_request_id: 1,
      p_amount_delta: 300,
      p_quantity_delta: 0,
      p_target_amount: 1000,
      p_target_quantity: 0,
      p_enforce_capacity: true,
    })
  })

  it('reports lost capacity when the guarded call updates nothing', async () => {
    useDb({ 'adjust_service_request_progress.rpc': [{ data: [] }] })
    await expect(applyVolunteerAcceptanceAllocation(request, { amount: 300 })).rejects.toBeInstanceOf(NeedCapacityExceededError)
  })

  it('falls back to a fresh read when the function is not deployed', async () => {
    useDb({
      'adjust_service_request_progress.rpc': [missingFunction],
      'service_requests.select': [{ data: { ...request, current_amount: 400 } }],
      'service_requests.update': [{ data: { id: 1 } }],
    })
    await expect(applyVolunteerAcceptanceAllocation(request, { amount: 300 })).resolves.toEqual({ id: 1 })
    const [update] = fake.find('service_requests', 'update')
    expect(update.payload).toMatchObject({ current_amount: 700, remaining_amount: 300 })
    expect(update.payload).not.toHaveProperty('current_quantity')
    expect(eqsOf(update)).toEqual({ id: 1 })
  })

  it('refuses the fallback when the latest row has no room left', async () => {
    useDb({
      'adjust_service_request_progress.rpc': [missingFunction],
      'service_requests.select': [{ data: { ...request, current_amount: 900 } }],
    })
    await expect(applyVolunteerAcceptanceAllocation(request, { amount: 300 })).rejects.toBeInstanceOf(NeedCapacityExceededError)
    expect(fake.find('service_requests', 'update')).toHaveLength(0)
  })

  it('never takes a released allocation below zero', async () => {
    useDb({
      'adjust_service_request_progress.rpc': [missingFunction],
      'service_requests.select': [{ data: { ...request, current_amount: 100 } }],
      'service_requests.update': [{ data: { id: 1 } }],
    })
    await releaseVolunteerAllocation(request, { amount: 300 })
    const [update] = fake.find('service_requests', 'update')
    expect(update.payload).toMatchObject({ current_amount: 0, remaining_amount: 1000 })
  })

  it('surfaces other database errors', async () => {
    useDb({ 'adjust_service_request_progress.rpc': [{ error: { code: 'XX000', message: 'nope' } }] })
    await expect(applyVolunteerAcceptanceAllocation(request, { amount: 1 })).rejects.toMatchObject({ message: 'nope' })
  })
})

describe('requestProjects', () => {
  it.each([
    [0, null],
    [-3, null],
    [7, 7],
    [undefined, null],
  ])('builds the lead patch for %j', (input, expected) => {
    expect(buildProjectLeadNgoPatch(input)).toEqual({ lead_ngo_user_id: expected })
  })

  it.each([
    [{ lead_ngo_user_id: 4 }, 4],
    [{ lead_ngo_user_id: 'x' }, 0],
    [null, 0],
  ])('reads the lead from %j', (project, expected) => {
    expect(getProjectLeadNgoId(project)).toBe(expected)
  })

  it('filters and limits the list', async () => {
    useDb({ 'service_request_projects.select': [{ data: null }] })
    await expect(requestProjects.getAll({ ngo_id: 5, status: 'active', limit: 3 })).resolves.toEqual([])
    const [query] = fake.queries
    expect(eqsOf(query)).toEqual({ ngo_id: 5, status: 'active' })
    expect(callsOf(query, 'limit')).toEqual([[3]])
    expect(callsOf(query, 'or')).toEqual([])
  })

  it('mirrors project fields into open needs', async () => {
    useDb({
      'service_request_projects.update': [{ data: { id: 'p1' } }],
      'service_requests.select': [{
        data: [
          { id: 11, project_context: { note: 'keep', project: { title: 'Library' } } },
          { id: 12, project_context: '{"project":{}}' },
        ],
      }],
    })

    await requestProjects.update('p1', { valid_until: future, exact_address: 'Ward 9', expected_beneficiaries: 10 })

    const [select] = fake.find('service_requests', 'select')
    expect(eqsOf(select)).toEqual({ project_id: 'p1' })
    expect(callsOf(select, 'not')).toEqual([['status', 'in', '(completed,cancelled)']])
    const [first, second] = fake.find('service_requests', 'update')
    expect(first.payload).toMatchObject({
      project_context: {
        note: 'keep',
        project_valid_until: future,
        project_location: 'Ward 9',
        project_expected_beneficiaries: 10,
        project: { title: 'Library', valid_until: future, exact_address: 'Ward 9', expected_beneficiaries: 10 },
      },
    })
    expect(eqsOf(first)).toEqual({ id: 11 })
    expect(eqsOf(second)).toEqual({ id: 12 })
  })

  it('does not touch needs for unrelated fields', async () => {
    useDb({ 'service_request_projects.update': [{ data: { id: 'p1' } }] })
    await requestProjects.update('p1', { title: 'New' })
    expect(fake.find('service_requests')).toHaveLength(0)
  })

  it('deletes linked needs before the project', async () => {
    useDb({ 'service_requests.select': [{ data: [{ id: 11 }] }] })
    await expect(requestProjects.delete('p1')).resolves.toBe(true)
    expect(fake.queries.filter((query) => query.op !== 'select').map((query) => [query.table, query.op])).toEqual([
      ['service_request_fulfillments', 'delete'],
      ['service_request_contributions', 'delete'],
      ['service_request_applications', 'delete'],
      ['service_clients', 'update'],
      ['service_requests', 'delete'],
      ['service_request_projects', 'delete'],
    ])
  })

  it('keeps the project when a linked need has payment records', async () => {
    useDb({
      'service_requests.select': [{ data: [{ id: 11 }] }],
      'service_request_contributions.select': [{ data: [{ id: 'c1', status: 'paid' }] }],
    })
    await expect(requestProjects.delete('p1')).rejects.toBeInstanceOf(ServiceRequestDeleteBlockedError)
    expect(fake.find('service_request_projects')).toHaveLength(0)
  })

  it('deletes nothing when a later need has payment records', async () => {
    useDb({
      'service_requests.select': [{ data: [{ id: 11 }, { id: 12 }] }],
      'service_request_contributions.select': [{ data: [] }, { data: [{ id: 'c2', status: 'paid' }] }],
    })
    await expect(requestProjects.delete('p1')).rejects.toBeInstanceOf(ServiceRequestDeleteBlockedError)
    expect(fake.queries.filter((query) => query.op !== 'select')).toEqual([])
  })

  it('stops when linked needs cannot be loaded', async () => {
    useDb({ 'service_requests.select': [{ error: { message: 'down' } }] })
    await expect(requestProjects.delete('p1')).rejects.toEqual({ message: 'down' })
    expect(fake.find('service_request_projects')).toHaveLength(0)
  })
})
