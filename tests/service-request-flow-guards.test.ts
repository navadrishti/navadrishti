import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as createNeedOrVolunteer } from '@/app/api/service-requests/route'
import { PUT as updateNeed } from '@/app/api/service-requests/[id]/route'
import { POST as createOrder } from '@/app/api/service-requests/[id]/payments/create-order/route'
import { POST as verifyPayment } from '@/app/api/service-requests/[id]/payments/verify/route'
import { POST as refreshStatus } from '@/app/api/service-requests/[id]/refresh-status/route'
import { GET as listVolunteers, POST as applyToNeed } from '@/app/api/service-requests/[id]/volunteers/route'
import { PUT as updateVolunteer } from '@/app/api/service-requests/[id]/volunteers/[volunteerId]/route'
import { POST as syncDelivery } from '@/app/api/service-requests/[id]/volunteers/[volunteerId]/delivery/sync/route'
import { GET as getAttendance } from '@/app/api/service-assignments/[id]/attendance/route'
import { POST as settleAssignment } from '@/app/api/service-assignments/[id]/settle/route'
import { contributionOrderNotesError } from '@/lib/service-request-payments'
import { NeedCapacityExceededError } from '@/lib/service-requests/errors'
import { jsonRequest, razorpaySignature, tokenFor } from './support/requests'
import { eqsOf, hasCall, supabaseFake, type FakeQuery, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({
  db: {
    users: { findById: vi.fn() },
    serviceRequests: { getById: vi.fn(), update: vi.fn() },
    serviceRequestApplications: {
      update: vi.fn(),
      create: vi.fn(),
      findExisting: vi.fn(),
      getUserApplication: vi.fn(),
      getByRequestId: vi.fn(),
    },
  },
  applyAllocation: vi.fn(),
  releaseAllocation: vi.fn(),
  verification: vi.fn(),
  snapshot: vi.fn(),
  createStandardOrder: vi.fn(),
  razorpay: { orders: { fetch: vi.fn() }, payments: { fetch: vi.fn() } },
  finalizeSettlement: vi.fn(),
}))

vi.mock('@/lib/db', async () => {
  const { supabaseFake: fake } = await import('./support/supabase-fake')
  const shape = (row: Record<string, unknown> | null | undefined) => {
    if (!row) return row
    const { fulfillment, ...rest } = row
    const flat = Array.isArray(fulfillment) ? fulfillment[0] : fulfillment
    return { ...rest, ...(flat && typeof flat === 'object' ? flat : {}) }
  }
  return {
    supabase: fake.client,
    db: mocks.db,
    shapeApplicationForApi: shape,
    getApplicationApplicantUserId: (row: Record<string, unknown> | null | undefined) => Number(row?.applicant_user_id ?? 0) || 0,
    applyVolunteerAcceptanceAllocation: mocks.applyAllocation,
    releaseVolunteerAllocation: mocks.releaseAllocation,
  }
})
vi.mock('@/lib/server-auth', () => ({
  resolveEffectiveVerificationStatus: mocks.verification,
  assertNgoLiveCsr1: vi.fn(async () => ({ ok: true })),
  CSR_PAYMENT_REQUIRES_LIVE_CSR1_MESSAGE: 'csr1 required',
  ngoUserIsCsrEligible: vi.fn(async () => true),
  ngoUserIsCsrEligibleForProject: vi.fn(async () => true),
}))
vi.mock('@/lib/infrastructure-assignment-lock', () => ({
  canIndividualApplyToNeed: vi.fn(async () => ({ allowed: true, reason: null, blockingApplicationId: null })),
}))
vi.mock('@/lib/delhivery', () => ({ getDelhiveryTrackingSnapshot: mocks.snapshot }))
vi.mock('@/lib/razorpay-route', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/razorpay-route')>()),
  isRazorpayRouteEnabled: () => false,
  createStandardRazorpayOrder: mocks.createStandardOrder,
}))
vi.mock('@/lib/engagement-settlement', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/engagement-settlement')>()),
  finalizeEngagementSettlement: mocks.finalizeSettlement,
}))
vi.mock('razorpay', () => ({
  default: vi.fn(function () {
    return mocks.razorpay
  }),
}))

const NGO = tokenFor(12, 'ngo')
const INDIVIDUAL = tokenFor(14, 'individual')

const materialNeed = {
  id: 5,
  ngo_id: 12,
  title: 'Books',
  status: 'active',
  request_type: 'Material Need',
  target_quantity: 10,
  current_quantity: 4,
  remaining_quantity: 6,
  project_context: null,
  requirements: null,
}

const financialNeed = {
  ...materialNeed,
  request_type: 'Financial Need',
  target_amount: 5000,
  current_amount: 0,
  remaining_amount: 5000,
  requester: { name: 'Asha' },
}

function application(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 9,
    service_request_id: 5,
    applicant_user_id: 14,
    status,
    response_meta: {},
    fulfillment: [{ fulfillment_quantity: 3, assigned_quantity: 3 }],
    ...overrides,
  }
}

type Responder = (query: FakeQuery) => FakeResult | undefined

function useDb(respond: Responder) {
  supabaseFake.reset(respond)
}

const idParams = (id = '5') => ({ params: Promise.resolve({ id }) })
const volunteerParams = { params: Promise.resolve({ id: '5', volunteerId: '9' }) }

function put(token: string, body: Record<string, unknown>) {
  return updateVolunteer(jsonRequest('http://localhost/api/service-requests/5/volunteers/9', { token, body, method: 'PUT' }), volunteerParams)
}

/** Answers the application lookup, the status claim and anything in `extra`. */
function volunteerDb(app: Record<string, unknown>, extra: Responder = () => undefined, claim: FakeResult = { data: { id: 9 } }) {
  useDb((query) => {
    const custom = extra(query)
    if (custom) return custom
    if (query.table === 'service_request_applications' && query.op === 'select' && hasCall(query, 'single')) return { data: app }
    if (query.table === 'service_request_applications' && query.op === 'update' && hasCall(query, 'maybeSingle')) return claim
    return undefined
  })
}

const claimQuery = () =>
  supabaseFake.find('service_request_applications', 'update').find((query) => hasCall(query, 'maybeSingle'))

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', 'key')
  vi.stubEnv('RAZORPAY_KEY_SECRET', 'rzp_secret')
  mocks.db.serviceRequests.getById.mockResolvedValue(materialNeed)
  mocks.db.serviceRequestApplications.update.mockImplementation(async (id: number, payload: Record<string, unknown>) => ({
    id,
    service_request_id: 5,
    applicant_user_id: 14,
    response_meta: {},
    ...payload,
  }))
  mocks.db.serviceRequestApplications.getByRequestId.mockResolvedValue([])
  mocks.applyAllocation.mockImplementation(async (request: Record<string, unknown>) => ({ ...request, current_quantity: 7, remaining_quantity: 3 }))
  mocks.verification.mockResolvedValue('verified')
  supabaseFake.reset()
})

afterEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})

describe('PUT volunteer status: individual', () => {
  it.each(['accepted', 'rejected', 'active', 'pending'])('refuses to let an applicant set %s', async (status) => {
    volunteerDb(application('pending'))
    const res = await put(INDIVIDUAL, { status })
    expect(res.status).toBe(403)
    expect(claimQuery()).toBeUndefined()
  })

  it('refuses to mark a pending application as done', async () => {
    volunteerDb(application('pending'))
    const res = await put(INDIVIDUAL, { status: 'completed' })
    expect(res.status).toBe(409)
    expect(mocks.db.serviceRequestApplications.update).not.toHaveBeenCalled()
  })

  it('refuses to withdraw an accepted application', async () => {
    volunteerDb(application('accepted'))
    const res = await put(INDIVIDUAL, { status: 'cancelled' })
    expect(res.status).toBe(409)
  })

  it('withdraws a pending application with a status-guarded update', async () => {
    volunteerDb(application('pending'))
    const res = await put(INDIVIDUAL, { status: 'cancelled' })
    expect(res.status).toBe(200)
    expect(eqsOf(claimQuery())).toEqual({ id: 9, service_request_id: 5, status: 'pending' })
    expect(supabaseFake.find('service_requests', 'update')).toHaveLength(0)
  })

  it('marks accepted work as done (active, awaiting NGO confirmation)', async () => {
    volunteerDb(application('accepted'))
    const res = await put(INDIVIDUAL, { status: 'completed' })
    expect(res.status).toBe(200)
    expect(claimQuery()?.payload).toMatchObject({ status: 'active' })
  })
})

describe('PUT volunteer status: NGO', () => {
  it.each([
    ['rejected', 'accepted'],
    ['completed', 'rejected'],
    ['cancelled', 'accepted'],
    ['pending', 'completed'],
  ])('refuses %s -> %s', async (from, to) => {
    volunteerDb(application(from))
    const res = await put(NGO, { status: to })
    expect(res.status).toBe(409)
    expect(claimQuery()).toBeUndefined()
  })

  it('claims the pending application before allocating capacity', async () => {
    volunteerDb(application('pending'))
    const res = await put(NGO, { status: 'accepted' })
    expect(res.status).toBe(200)
    expect(eqsOf(claimQuery())).toMatchObject({ status: 'pending' })
    expect(mocks.applyAllocation).toHaveBeenCalledWith(materialNeed, { amount: 0, quantity: 3 })
  })

  it('rolls the claim back with a 409 when a concurrent acceptance took the remaining capacity', async () => {
    mocks.applyAllocation.mockRejectedValue(new NeedCapacityExceededError())
    volunteerDb(application('pending'))
    const res = await put(NGO, { status: 'accepted' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: new NeedCapacityExceededError().message })
    const rollback = supabaseFake
      .find('service_request_applications', 'update')
      .find((query) => !hasCall(query, 'maybeSingle') && (query.payload as { status?: string })?.status === 'pending')
    expect(rollback).toBeDefined()
  })

  it('does not allocate when another request already moved the application', async () => {
    volunteerDb(application('pending'), undefined, { data: null })
    const res = await put(NGO, { status: 'accepted' })
    expect(res.status).toBe(409)
    expect(mocks.applyAllocation).not.toHaveBeenCalled()
    expect(mocks.db.serviceRequestApplications.update).not.toHaveBeenCalled()
  })

  it('surfaces a failed auto-reject of remaining applicants', async () => {
    mocks.applyAllocation.mockImplementation(async (request: Record<string, unknown>) => ({ ...request, current_quantity: 10, remaining_quantity: 0 }))
    volunteerDb(application('pending'), (query) => {
      if (query.table === 'service_request_applications' && query.op === 'select' && !hasCall(query, 'single')) return { data: [{ id: 10, response_meta: {} }] }
      if (query.table === 'service_request_applications' && query.op === 'update' && hasCall(query, 'eq', 'id', 10)) return { error: { code: '500', message: 'nope' } }
      return undefined
    })
    const res = await put(NGO, { status: 'accepted' })
    expect(res.status).toBe(500)
  })

  it('releases the allocation when an accepted applicant is rejected', async () => {
    volunteerDb(application('accepted'))
    const res = await put(NGO, { status: 'rejected' })
    expect(res.status).toBe(200)
    expect(mocks.releaseAllocation).toHaveBeenCalledWith(materialNeed, { amount: 0, quantity: 3 })

    const [closeAssignment] = supabaseFake.find('service_engagement_assignments', 'update')
    expect(closeAssignment.payload).toMatchObject({ status: 'cancelled' })
    expect(eqsOf(closeAssignment)).toMatchObject({ application_table: 'service_request_applications' })
  })

  it('does not touch the allocation when a pending applicant is rejected', async () => {
    volunteerDb(application('pending'))
    const res = await put(NGO, { status: 'rejected' })
    expect(res.status).toBe(200)
    expect(mocks.releaseAllocation).not.toHaveBeenCalled()
  })
})

describe('delivery sync', () => {
  const sync = () =>
    syncDelivery(jsonRequest('http://localhost/api/service-requests/5/volunteers/9/delivery/sync', { token: NGO, body: { trackingId: 'T1' } }), volunteerParams)

  beforeEach(() => {
    mocks.snapshot.mockResolvedValue({ provider: 'delhivery', trackingId: 'T1', currentStatus: 'In Transit', lastLocation: null, lastEventAt: null, events: [] })
  })

  it.each(['pending', 'rejected', 'completed'])('refuses to sync a %s application', async (status) => {
    volunteerDb(application(status))
    const res = await sync()
    expect(res.status).toBe(409)
    expect(mocks.snapshot).not.toHaveBeenCalled()
  })

  it('fails when the shipment upsert fails', async () => {
    volunteerDb(application('accepted'), (query) =>
      query.table === 'service_request_shipments' && query.op === 'upsert' ? { error: { code: '500', message: 'nope' } } : undefined
    )
    const res = await sync()
    expect(res.status).toBe(500)
    expect(mocks.db.serviceRequestApplications.update).not.toHaveBeenCalled()
  })
})

describe('legacy volunteer action', () => {
  it('no longer creates applications through POST /api/service-requests', async () => {
    const res = await createNeedOrVolunteer(jsonRequest('http://localhost/api/service-requests', { token: INDIVIDUAL, body: { action: 'volunteer', serviceRequestId: 5 } }))
    expect(res.status).toBe(400)
    expect(mocks.db.serviceRequestApplications.create).not.toHaveBeenCalled()
  })
})

describe('GET own application', () => {
  const get = (url: string, token?: string) => listVolunteers(jsonRequest(url, { token }), idParams())

  it('requires a token', async () => {
    const res = await get('http://localhost/api/service-requests/5/volunteers?userId=14')
    expect(res.status).toBe(401)
    expect(mocks.db.serviceRequestApplications.getUserApplication).not.toHaveBeenCalled()
  })

  it("refuses to show another user's application", async () => {
    const res = await get('http://localhost/api/service-requests/5/volunteers?userId=99', INDIVIDUAL)
    expect(res.status).toBe(403)
    expect(mocks.db.serviceRequestApplications.getUserApplication).not.toHaveBeenCalled()
  })

  it('returns the caller their own application', async () => {
    mocks.db.serviceRequestApplications.getUserApplication.mockResolvedValue({ id: 9 })
    const res = await get('http://localhost/api/service-requests/5/volunteers?userId=14', INDIVIDUAL)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: 9 }])
    expect(mocks.db.serviceRequestApplications.getUserApplication).toHaveBeenCalledWith(5, 14)
  })
})

describe('POST application', () => {
  const apply = () =>
    applyToNeed(jsonRequest('http://localhost/api/service-requests/5/volunteers', { token: INDIVIDUAL, body: { fulfillment_quantity: 2 } }), idParams())

  beforeEach(() => {
    mocks.db.users.findById.mockResolvedValue({ id: 14, user_type: 'individual', name: 'Ravi' })
    mocks.db.serviceRequestApplications.findExisting.mockResolvedValue(null)
    mocks.db.serviceRequestApplications.create.mockResolvedValue({ id: 30 })
  })

  it.each([
    ['completed', { status: 'completed' }],
    ['fully allocated', { current_quantity: 10, remaining_quantity: 0 }],
    ['expired', { valid_until: '2020-01-01' }],
    ['CSR-locked', { project_context: { csr_assignment: { assigned_company_id: 4 } } }],
  ])('rejects a %s need with 409', async (_label, overrides) => {
    mocks.db.serviceRequests.getById.mockResolvedValue({ ...materialNeed, ...overrides })
    const res = await apply()
    expect(res.status).toBe(409)
    expect(mocks.db.serviceRequestApplications.create).not.toHaveBeenCalled()
  })

  it('creates an application for an open need', async () => {
    const res = await apply()
    expect(res.status).toBe(200)
    expect(mocks.db.serviceRequestApplications.create).toHaveBeenCalledOnce()
  })

  it('maps a unique-index violation to 409', async () => {
    mocks.db.serviceRequestApplications.create.mockRejectedValue({ code: '23505', message: 'duplicate key' })
    const res = await apply()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'You have already applied for this service request' })
  })
})

describe('contribution payment verify', () => {
  const verification = {
    razorpay_order_id: 'order_1',
    razorpay_payment_id: 'pay_1',
    razorpay_signature: razorpaySignature('order_1', 'pay_1', 'rzp_secret'),
  }

  function provider(notes: Record<string, unknown>) {
    mocks.razorpay.payments.fetch.mockResolvedValue({ id: 'pay_1', order_id: 'order_1', status: 'captured', currency: 'INR', amount: 100000, created_at: 1780000000 })
    mocks.razorpay.orders.fetch.mockResolvedValue({ id: 'order_1', amount: 100000, notes, receipt: 'r' })
  }

  const verify = () =>
    verifyPayment(jsonRequest('http://localhost/api/service-requests/5/payments/verify', { token: INDIVIDUAL, body: verification }), idParams())

  beforeEach(() => {
    mocks.db.serviceRequests.getById.mockResolvedValue(financialNeed)
  })

  it.each([
    ['no payment kind', { service_request_id: '5', contributor_id: '14' }],
    ['a different payment kind', { service_request_id: '5', contributor_id: '14', payment_kind: 'company_ca' }],
    ['no contributor', { service_request_id: '5', payment_kind: 'financial_need' }],
    ['another contributor', { service_request_id: '5', contributor_id: '15', payment_kind: 'financial_need' }],
    ['another request', { service_request_id: '6', contributor_id: '14', payment_kind: 'financial_need' }],
  ])('refuses an order with %s', async (_label, notes) => {
    provider(notes)
    const res = await verify()
    expect(res.status).toBe(403)
    expect(supabaseFake.find('razorpay_payment_orders')).toHaveLength(0)
  })

  it('accepts matching contribution notes', () => {
    expect(contributionOrderNotesError({ service_request_id: '5', contributor_id: '14', payment_kind: 'ngo_network' }, { serviceRequestId: 5, contributorId: 14 })).toBeNull()
  })
})

describe('create-order', () => {
  it('fails instead of returning an order that was not recorded', async () => {
    mocks.db.serviceRequests.getById.mockResolvedValue(financialNeed)
    mocks.createStandardOrder.mockResolvedValue({ id: 'order_1', currency: 'INR', receipt: 'r' })
    useDb((query) =>
      query.table === 'razorpay_payment_orders' && query.op === 'upsert' ? { error: { code: '500', message: 'nope' } } : undefined
    )
    const res = await createOrder(jsonRequest('http://localhost/api/service-requests/5/payments/create-order', { token: INDIVIDUAL, body: { amount: 1000 } }), idParams())
    expect(res.status).toBe(500)
    expect(await res.json()).not.toHaveProperty('data')
  })
})

describe('refresh-status', () => {
  const refresh = () =>
    refreshStatus(jsonRequest('http://localhost/api/service-requests/5/refresh-status', { token: NGO, body: { serviceRequestId: 5 } }))

  it.each(['cancelled', 'expired'])('does not revive a %s request', async (status) => {
    mocks.db.serviceRequests.getById.mockResolvedValue({ ...materialNeed, status })
    useDb((query) => (query.table === 'service_request_applications' ? { data: [{ id: 1, status: 'accepted' }] } : undefined))
    const res = await refresh()
    expect(res.status).toBe(409)
    expect(supabaseFake.find('service_requests', 'update')).toHaveLength(0)
  })

  it('reports a failed status update', async () => {
    useDb((query) => {
      if (query.table === 'service_request_applications') return { data: [{ id: 1, status: 'completed' }] }
      if (query.table === 'service_requests' && query.op === 'update') return { error: { code: '500', message: 'nope' } }
      return undefined
    })
    const res = await refresh()
    expect(res.status).toBe(500)
  })

  it('completes an active request once all working volunteers are done', async () => {
    useDb((query) => (query.table === 'service_request_applications' ? { data: [{ id: 1, status: 'completed' }] } : undefined))
    const res = await refresh()
    expect(res.status).toBe(200)
    const [update] = supabaseFake.find('service_requests', 'update')
    expect(update.payload).toMatchObject({ status: 'completed' })
    expect(eqsOf(update)).toEqual({ id: 5, status: 'active' })
  })
})

describe('PUT service request', () => {
  const body = {
    title: 'Books',
    description: 'Library books',
    location: 'Pune',
    timeline: '3 months',
    impact_description: 'Children read more',
    request_type: 'Material Need',
    project_category: 'Education and Livelihood Enhancement',
    beneficiary_count: 10,
    target_quantity: 10,
  }
  const update = (overrides: Record<string, unknown> = {}) =>
    updateNeed(jsonRequest('http://localhost/api/service-requests/5', { token: NGO, body: { ...body, ...overrides }, method: 'PUT' }), idParams())

  it('ignores client-supplied progress counters', async () => {
    const res = await update({ current_quantity: 0, current_amount: 99999 })
    expect(res.status).toBe(200)
    expect(mocks.db.serviceRequests.update.mock.calls[0][1]).toMatchObject({ current_quantity: 4, remaining_quantity: 6, current_amount: 0 })
  })

  it('blocks changing the target after an applicant was accepted', async () => {
    mocks.db.serviceRequestApplications.getByRequestId.mockResolvedValue([{ id: 9, status: 'accepted' }])
    const res = await update({ target_quantity: 20 })
    expect(res.status).toBe(409)
    expect(mocks.db.serviceRequests.update).not.toHaveBeenCalled()
  })

  it('blocks changing the need type once the need is no longer active', async () => {
    mocks.db.serviceRequests.getById.mockResolvedValue({ ...materialNeed, status: 'in_progress' })
    const res = await update({ request_type: 'Skill / Service Need' })
    expect(res.status).toBe(409)
    expect(mocks.db.serviceRequests.update).not.toHaveBeenCalled()
  })

  it('allows editing other fields when the type and target are unchanged', async () => {
    mocks.db.serviceRequestApplications.getByRequestId.mockResolvedValue([{ id: 9, status: 'accepted' }])
    const res = await update({ title: 'More books' })
    expect(res.status).toBe(200)
  })
})

describe('engagement settlement verify', () => {
  const assignment = {
    id: 'asg_1',
    owner_user_id: 12,
    billing_cycle: 'daily',
    payment_mode: 'daily_due',
    meta: { attendance_summary: { total_due: 1000, paid_total: 400, days_attended: 4 } },
  }
  const order = { order_notes: { assignment_id: 'asg_1', base_amount_inr: 600 }, payer_user_id: 12, order_status: 'created' }

  function setup(orderRow: Record<string, unknown> | null, claim: FakeResult = { data: { id: 1 } }) {
    mocks.razorpay.payments.fetch.mockResolvedValue({ id: 'pay_1', order_id: 'order_1', status: 'captured', amount: 63000 })
    mocks.razorpay.orders.fetch.mockResolvedValue({ id: 'order_1', amount: 63000, notes: {} })
    mocks.finalizeSettlement.mockResolvedValue({ settled: true })
    useDb((query) => {
      if (query.table === 'service_engagement_assignments') return { data: assignment }
      if (query.table === 'razorpay_payment_orders' && query.op === 'select') return { data: orderRow }
      if (query.table === 'razorpay_payment_orders' && query.op === 'update') return claim
      return undefined
    })
  }

  const settle = () =>
    settleAssignment(
      jsonRequest('http://localhost/api/service-assignments/asg_1/settle', {
        token: NGO,
        body: {
          action: 'verify',
          razorpay_order_id: 'order_1',
          razorpay_payment_id: 'pay_1',
          razorpay_signature: razorpaySignature('order_1', 'pay_1', 'rzp_secret'),
        },
      }),
      { params: Promise.resolve({ id: 'asg_1' }) }
    )

  it.each([
    ['for another engagement', { ...order, order_notes: { assignment_id: 'asg_2', base_amount_inr: 600 } }, 403],
    ['paid by someone else', { ...order, payer_user_id: 13 }, 403],
    ['already paid', { ...order, order_status: 'paid' }, 409],
    ['unknown', null, 404],
  ])('refuses an order %s', async (_label, orderRow, status) => {
    setup(orderRow)
    const res = await settle()
    expect(res.status).toBe(status)
    expect(mocks.finalizeSettlement).not.toHaveBeenCalled()
    expect(supabaseFake.find('razorpay_payment_orders', 'update')).toHaveLength(0)
  })

  it('does not settle twice when a concurrent request claimed the order first', async () => {
    setup(order, { data: null })
    const res = await settle()
    expect(res.status).toBe(409)
    expect(mocks.finalizeSettlement).not.toHaveBeenCalled()
  })

  it('claims the order before finalizing', async () => {
    setup(order)
    const res = await settle()
    expect(res.status).toBe(200)
    const [claim] = supabaseFake.find('razorpay_payment_orders', 'update')
    expect(claim.payload).toMatchObject({ order_status: 'paid' })
    expect(hasCall(claim, 'neq', 'order_status', 'paid')).toBe(true)
    expect(mocks.finalizeSettlement).toHaveBeenCalledOnce()
  })

  it('releases the claim when finalizing fails', async () => {
    setup(order)
    mocks.finalizeSettlement.mockRejectedValue(new Error('boom'))
    const res = await settle()
    expect(res.status).toBe(500)
    const updates = supabaseFake.find('razorpay_payment_orders', 'update')
    expect(updates.map((query) => (query.payload as { order_status: string }).order_status)).toEqual(['paid', 'created'])
  })
})

describe('assignment attendance', () => {
  const assignment = { id: 'asg_1', owner_user_id: 12, assignee_user_id: 14, meta: {} }
  const get = (token: string) =>
    getAttendance(jsonRequest('http://localhost/api/service-assignments/asg_1/attendance', { token }), { params: Promise.resolve({ id: 'asg_1' }) })

  beforeEach(() => {
    useDb((query) => (query.table === 'service_engagement_assignments' ? { data: assignment } : { data: [] }))
  })

  it('refuses callers who are neither owner nor assignee', async () => {
    const res = await get(tokenFor(99, 'individual'))
    expect(res.status).toBe(403)
    expect(supabaseFake.find('service_attendance_entries')).toHaveLength(0)
  })

  it.each([
    ['owner', NGO],
    ['assignee', INDIVIDUAL],
  ])('lets the %s read attendance', async (_label, token) => {
    const res = await get(token)
    expect(res.status).toBe(200)
  })
})
