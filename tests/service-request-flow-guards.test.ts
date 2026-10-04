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
  createShipment: vi.fn(),
  upsertWarehouse: vi.fn(),
  razorpay: { orders: { fetch: vi.fn(), create: vi.fn() }, payments: { fetch: vi.fn(), refund: vi.fn() } },
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
vi.mock('@/lib/delhivery', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/delhivery')>()),
  getDelhiveryTrackingSnapshot: mocks.snapshot,
  createDelhiveryShipment: mocks.createShipment,
  assertDelhiveryRouteServiceable: vi.fn(async () => undefined),
  upsertDelhiveryWarehouse: mocks.upsertWarehouse,
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
  const sync = (token = NGO, body: Record<string, unknown> = {}) =>
    syncDelivery(jsonRequest('http://localhost/api/service-requests/5/volunteers/9/delivery/sync', { token, body }), volunteerParams)
  const booked = (status: string, meta: Record<string, unknown> = { delivery_tracking_id: 'T1' }) =>
    application(status, { response_meta: meta })

  beforeEach(() => {
    mocks.snapshot.mockResolvedValue({ provider: 'delhivery', trackingId: 'T1', currentStatus: 'In Transit', statusType: 'UD', lastLocation: null, lastEventAt: null, events: [] })
  })

  it.each(['pending', 'rejected', 'completed'])('refuses to sync a %s application', async (status) => {
    volunteerDb(booked(status))
    const res = await sync()
    expect(res.status).toBe(409)
    expect(mocks.snapshot).not.toHaveBeenCalled()
  })

  it('fails when the shipment cannot be saved', async () => {
    volunteerDb(booked('accepted'), (query) =>
      query.table === 'service_request_shipments' && query.op === 'insert' ? { error: { code: '500', message: 'nope' } } : undefined
    )
    const res = await sync()
    expect(res.status).toBe(500)
    expect(mocks.db.serviceRequestApplications.update).not.toHaveBeenCalled()
  })

  it('ignores a tracking id typed into the request and only follows the booked shipment', async () => {
    volunteerDb(booked('accepted', {}))
    const res = await sync(INDIVIDUAL, { trackingId: 'SOMEONE-ELSES-AWB' })
    expect(res.status).toBe(400)
    expect(mocks.snapshot).not.toHaveBeenCalled()
  })

  it('records the status and completes the donation once delivered', async () => {
    mocks.snapshot.mockResolvedValue({ provider: 'delhivery', trackingId: 'T1', currentStatus: 'Delivered', statusType: 'DL', lastLocation: 'Pune', lastEventAt: '2026-10-01T10:00:00.000Z', events: [] })
    volunteerDb(booked('accepted'))
    const res = await sync()
    expect(res.status).toBe(200)
    const [insert] = supabaseFake.find('service_request_shipments', 'insert')
    expect(insert.payload).toMatchObject({ tracking_id: 'T1', shipment_status: 'delivered', application_id: 9 })
    expect(mocks.db.serviceRequestApplications.update).toHaveBeenCalledWith(9, expect.objectContaining({ status: 'completed', fulfilled_quantity: 3 }))
  })

  describe('booking', () => {
    const users: Record<number, Record<string, unknown>> = {
      14: { id: 14, name: 'Ravi', phone: '9876543210', profile_data: { home_address: { address_line: '7 Park St', city: 'Pune', state: 'Maharashtra', pincode: '411001' } } },
      12: { id: 12, name: 'Seva Trust', phone: '9123456789', profile_data: { ngo_headquarters: { address_line: 'NGO Office', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' } } },
    }
    const bookingDb = (app: Record<string, unknown>, project: Record<string, unknown> | null = null) =>
      volunteerDb(app, (query) => {
        if (query.table === 'service_requests') return { data: { ...materialNeed, project } }
        if (query.table === 'users' && query.op === 'select') return { data: users[Number(eqsOf(query).id)] ?? null }
        return undefined
      })

    beforeEach(() => {
      mocks.upsertWarehouse.mockResolvedValue(undefined)
      mocks.createShipment.mockResolvedValue({ success: true, waybill: 'AWB55', orderId: 'sr_5_9', status: 'Success', remark: null, raw: {} })
      mocks.snapshot.mockResolvedValue({ provider: 'delhivery', trackingId: 'AWB55', currentStatus: 'Manifested', statusType: 'UD', lastLocation: null, lastEventAt: null, events: [] })
    })

    it('books from the donor address to the NGO and stores the system-assigned AWB', async () => {
      bookingDb(application('accepted'))
      const res = await sync(INDIVIDUAL, { action: 'book' })
      expect(res.status).toBe(200)
      expect(mocks.createShipment).toHaveBeenCalledWith(expect.objectContaining({
        orderId: 'sr_5_9',
        pickupLocationName: 'Navadrishti-14',
        quantity: 3,
        seller: expect.objectContaining({ name: 'Ravi', address: '7 Park St', pincode: '411001' }),
        consignee: expect.objectContaining({ name: 'Seva Trust', address: 'NGO Office', pincode: '400001' }),
      }))
      expect(mocks.upsertWarehouse).toHaveBeenCalledWith(expect.objectContaining({ name: 'Navadrishti-14', pincode: '411001' }))
      expect(mocks.db.serviceRequestApplications.update).toHaveBeenCalledWith(9, expect.objectContaining({
        response_meta: expect.objectContaining({ delivery_tracking_id: 'AWB55', delivery_order_id: 'sr_5_9' }),
      }))
    })

    it('delivers to the project site when the need has a full address', async () => {
      bookingDb(application('accepted'), { exact_address: JSON.stringify({ address_line: 'School, Ward 4', city: 'Nashik', state: 'Maharashtra', pincode: '422001' }) })
      await sync(INDIVIDUAL, { action: 'book' })
      expect(mocks.createShipment).toHaveBeenCalledWith(expect.objectContaining({
        consignee: expect.objectContaining({ name: 'Seva Trust', phone: '9123456789', address: 'School, Ward 4', pincode: '422001' }),
      }))
    })

    it('only lets the donor book', async () => {
      bookingDb(application('accepted'))
      const res = await sync(NGO, { action: 'book' })
      expect(res.status).toBe(403)
      expect(mocks.createShipment).not.toHaveBeenCalled()
    })

    it('refuses to book twice', async () => {
      bookingDb(booked('accepted'))
      const res = await sync(INDIVIDUAL, { action: 'book' })
      expect(res.status).toBe(409)
      expect(mocks.createShipment).not.toHaveBeenCalled()
    })

    it('asks the donor to complete their address first', async () => {
      users[14] = { ...users[14], profile_data: {} }
      bookingDb(application('accepted'))
      const res = await sync(INDIVIDUAL, { action: 'book' })
      expect(res.status).toBe(422)
      expect((await res.json()).error).toBe('Add a street address to your profile before booking Delhivery')
      expect(mocks.createShipment).not.toHaveBeenCalled()
    })
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
  const connectedNgo = { profile_data: { razorpay_linked_account_id: 'acc_12', razorpay_link_status: 'active' } }
  const create = () =>
    createOrder(jsonRequest('http://localhost/api/service-requests/5/payments/create-order', { token: INDIVIDUAL, body: { amount: 1000 } }), idParams())

  beforeEach(() => {
    mocks.db.serviceRequests.getById.mockResolvedValue(financialNeed)
    mocks.razorpay.orders.create.mockResolvedValue({ id: 'order_1', currency: 'INR', receipt: 'r' })
  })

  it('fails instead of returning an order that was not recorded', async () => {
    useDb((query) => {
      if (query.table === 'users') return { data: connectedNgo }
      return query.table === 'razorpay_payment_orders' && query.op === 'upsert' ? { error: { code: '500', message: 'nope' } } : undefined
    })
    const res = await create()
    expect(res.status).toBe(500)
    expect(await res.json()).not.toHaveProperty('data')
  })

  it('refuses with a clear message when the NGO has not connected Razorpay', async () => {
    useDb((query) => (query.table === 'users' ? { data: { profile_data: {} } } : undefined))
    const res = await create()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('has not connected a Razorpay payout account')
    expect(mocks.razorpay.orders.create).not.toHaveBeenCalled()
  })

  it('adds the platform fee and GST on top of the contribution', async () => {
    useDb((query) => (query.table === 'users' ? { data: connectedNgo } : undefined))
    const res = await create()
    expect(res.status).toBe(200)
    const body = mocks.razorpay.orders.create.mock.calls[0][0]
    expect(body.amount).toBe(105900)
    expect(body.notes).toMatchObject({
      payment_kind: 'financial_need',
      service_request_id: '5',
      contributor_id: '14',
      base_amount_inr: 1000,
      gst_on_platform_fee_inr: 9,
    })
    const row = supabaseFake.find('razorpay_payment_orders', 'upsert')[0].payload as Record<string, unknown>
    expect(row).toMatchObject({ amount_paise: 105900, payer_user_id: 14, ngo_user_id: 12 })
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

  it('keeps a completed request completed when nobody is still working on it', async () => {
    mocks.db.serviceRequests.getById.mockResolvedValue({ ...materialNeed, status: 'completed' })
    useDb((query) => (query.table === 'service_request_applications' ? { data: [{ id: 1, status: 'rejected' }] } : undefined))
    const res = await refresh()
    expect(res.status).toBe(200)
    expect((await res.json()).data.newStatus).toBe('completed')
    expect(supabaseFake.find('service_requests', 'update')).toHaveLength(0)
  })

  it('reopens a completed request when a volunteer is still working', async () => {
    mocks.db.serviceRequests.getById.mockResolvedValue({ ...materialNeed, status: 'completed' })
    useDb((query) => (query.table === 'service_request_applications' ? { data: [{ id: 1, status: 'active' }] } : undefined))
    const res = await refresh()
    const [update] = supabaseFake.find('service_requests', 'update')
    expect(res.status).toBe(200)
    expect(update.payload).toMatchObject({ status: 'active' })
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
    assignee_user_id: 14,
    application_table: 'service_request_applications',
    application_id: '9',
    target_type: 'service_request',
    billing_cycle: 'daily',
    payment_mode: 'daily_due',
    meta: { attendance_summary: { total_due: 1000, paid_total: 400, days_attended: 4 } },
  }
  const order = { order_notes: { assignment_id: 'asg_1', base_amount_inr: 600 }, payer_user_id: 12, order_status: 'created' }

  function setup(
    orderRow: Record<string, unknown> | null,
    options: { claim?: FakeResult; current?: Record<string, unknown>; afterLostClaim?: Record<string, unknown> } = {}
  ) {
    mocks.razorpay.payments.fetch.mockResolvedValue({ id: 'pay_1', order_id: 'order_1', status: 'captured', amount: 63000 })
    mocks.razorpay.payments.refund.mockResolvedValue({ id: 'rfnd_1' })
    mocks.razorpay.orders.fetch.mockResolvedValue({ id: 'order_1', amount: 63000, notes: {} })
    let assignmentReads = 0
    useDb((query) => {
      if (query.table === 'service_engagement_assignments' && query.op === 'update') {
        return options.claim ?? { data: { ...assignment, meta: { ...assignment.meta, settlement_payment_id: 'pay_1' } } }
      }
      if (query.table === 'service_engagement_assignments') {
        assignmentReads += 1
        const row = assignmentReads > 2 && options.afterLostClaim ? options.afterLostClaim : options.current ?? assignment
        return { data: row }
      }
      if (query.table === 'razorpay_payment_orders' && query.op === 'select') return { data: orderRow }
      return undefined
    })
  }

  const settle = (token = NGO) =>
    settleAssignment(
      jsonRequest('http://localhost/api/service-assignments/asg_1/settle', {
        token,
        body: {
          action: 'verify',
          razorpay_order_id: 'order_1',
          razorpay_payment_id: 'pay_1',
          razorpay_signature: razorpaySignature('order_1', 'pay_1', 'rzp_secret'),
        },
      }),
      { params: Promise.resolve({ id: 'asg_1' }) }
    )

  const assignmentUpdates = () => supabaseFake.find('service_engagement_assignments', 'update')
  const completedUpdates = () =>
    assignmentUpdates().filter((query) => (query.payload as { status?: string }).status === 'completed')

  it.each([
    ['for another engagement', { ...order, order_notes: { assignment_id: 'asg_2', base_amount_inr: 600 } }, 403],
    ['paid by someone else', { ...order, payer_user_id: 13 }, 403],
    ['unknown', null, 404],
  ])('refuses an order %s', async (_label, orderRow, status) => {
    setup(orderRow)
    const res = await settle()
    expect(res.status).toBe(status)
    expect(completedUpdates()).toHaveLength(0)
    expect(assignmentUpdates()).toHaveLength(0)
  })

  it('refuses the payee', async () => {
    setup(order)
    const res = await settle(INDIVIDUAL)
    expect(res.status).toBe(403)
    expect(completedUpdates()).toHaveLength(0)
  })

  it('claims the engagement for this payment before finalizing', async () => {
    setup(order)
    const res = await settle()
    expect(res.status).toBe(200)
    const [claim, finalized] = assignmentUpdates()
    expect((claim.payload as { meta: Record<string, unknown> }).meta.settlement_payment_id).toBe('pay_1')
    expect(hasCall(claim, 'is', 'meta->>settlement_payment_id', null)).toBe(true)
    expect(finalized.payload).toMatchObject({
      status: 'completed',
      meta: expect.objectContaining({ settlement_status: 'settled', settlement_payment_id: 'pay_1', settled_amount: 600 }),
    })
    const [orderUpdate] = supabaseFake.find('razorpay_payment_orders', 'update')
    expect(orderUpdate.payload).toMatchObject({ order_status: 'paid' })
    expect(mocks.razorpay.payments.refund).not.toHaveBeenCalled()
  })

  it('reports success when the webhook already settled it with this payment', async () => {
    setup(order, {
      current: { ...assignment, meta: { ...assignment.meta, settlement_status: 'settled', settlement_payment_id: 'pay_1', settled_amount: 600 } },
    })
    const res = await settle()
    expect(res.status).toBe(200)
    expect((await res.json()).data).toMatchObject({ settled: true, alreadyProcessed: true, settledAmount: 600 })
    expect(completedUpdates()).toHaveLength(0)
    expect(mocks.razorpay.payments.refund).not.toHaveBeenCalled()
  })

  it('refunds a second payment for an engagement another payment settled', async () => {
    setup(order, {
      current: { ...assignment, meta: { ...assignment.meta, settlement_status: 'settled', settlement_payment_id: 'pay_0' } },
    })
    const res = await settle()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('duplicate payment has been refunded')
    expect(mocks.razorpay.payments.refund).toHaveBeenCalledWith('pay_1', expect.objectContaining({ amount: 63000 }))
    expect(completedUpdates()).toHaveLength(0)
  })

  it('refunds when a concurrent payment wins the claim', async () => {
    setup(order, {
      claim: { data: null },
      afterLostClaim: { ...assignment, meta: { ...assignment.meta, settlement_payment_id: 'pay_0' } },
    })
    const res = await settle()
    expect(res.status).toBe(409)
    expect(mocks.razorpay.payments.refund).toHaveBeenCalledOnce()
    expect(completedUpdates()).toHaveLength(0)
  })

  it('puts the engagement back as it was when finalizing fails', async () => {
    setup(order, { current: { ...assignment, status: 'active', completed_at: null } })
    mocks.db.serviceRequestApplications.update.mockRejectedValue(new Error('boom'))
    const res = await settle()
    expect(res.status).toBe(500)
    const updates = assignmentUpdates()
    const restored = updates[updates.length - 1].payload as Record<string, unknown>
    expect(restored).toMatchObject({ status: 'active', completed_at: null })
    expect(restored.meta).not.toHaveProperty('settlement_payment_id')
    expect(restored.meta).not.toHaveProperty('settlement_status')
    expect(supabaseFake.find('razorpay_payment_orders', 'update')).toHaveLength(0)
  })

  it('refuses to bill a CSR capability rental again', async () => {
    setup(order, { current: { ...assignment, meta: { ...assignment.meta, flow: 'csr_capability_rental' } } })
    const res = await settle()
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('paid upfront')
  })
})

describe('engagement settlement start', () => {
  const offerRental = {
    id: 'asg_2',
    status: 'active',
    owner_user_id: 30,
    assignee_user_id: 12,
    application_table: 'service_clients',
    application_id: '15',
    target_type: 'service_offer',
    target_id: '7',
    billing_cycle: 'daily',
    payment_mode: 'daily_due',
    meta: { attendance_summary: { total_due: 1000, paid_total: 0, days_attended: 2 } },
  }

  const start = (token: string) =>
    settleAssignment(
      jsonRequest('http://localhost/api/service-assignments/asg_2/settle', { token, body: { action: 'start' } }),
      { params: Promise.resolve({ id: 'asg_2' }) }
    )

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', 'key')
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'rzp_secret')
  })

  it('refuses the provider who owns the offer', async () => {
    useDb((query) => (query.table === 'service_engagement_assignments' ? { data: offerRental } : undefined))
    const res = await start(tokenFor(30, 'company'))
    expect(res.status).toBe(403)
  })

  it('refuses to settle an engagement that is no longer active', async () => {
    useDb((query) => (query.table === 'service_engagement_assignments' ? { data: { ...offerRental, status: 'cancelled' } } : undefined))
    const res = await start(NGO)
    expect(res.status).toBe(409)
    expect(mocks.razorpay.orders.create).not.toHaveBeenCalled()
  })

  it('returns a clear 409 when the provider has not connected Razorpay', async () => {
    useDb((query) => {
      if (query.table === 'service_engagement_assignments') return { data: offerRental }
      if (query.table === 'users') return { data: { profile_data: {} } }
      if (query.table === 'service_attendance_entries') return { data: [{ amount_due: 1000, payment_status: 'pending' }] }
      return undefined
    })
    const res = await start(NGO)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('has not connected a Razorpay payout account')
  })

  it('lets the client who hired the capability pay the provider', async () => {
    mocks.razorpay.orders.create.mockResolvedValue({ id: 'order_9', receipt: 'r', currency: 'INR' })
    useDb((query) => {
      if (query.table === 'service_engagement_assignments') return { data: offerRental }
      if (query.table === 'users') {
        return { data: { profile_data: { razorpay_linked_account_id: 'acc_30', razorpay_link_status: 'active' } } }
      }
      if (query.table === 'service_attendance_entries') {
        return { data: [{ amount_due: 500, payment_status: 'pending' }, { amount_due: 500, payment_status: 'pending' }] }
      }
      return undefined
    })
    const res = await start(NGO)
    expect(res.status).toBe(200)
    expect((await res.json()).data).toMatchObject({ paymentRequired: true, orderId: 'order_9' })
    const row = supabaseFake.find('razorpay_payment_orders', 'upsert')[0].payload as Record<string, unknown>
    expect(row).toMatchObject({ payer_user_id: 12, ngo_user_id: 30 })
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
