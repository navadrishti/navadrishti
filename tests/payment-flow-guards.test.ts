import crypto from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as webhookPost } from '@/app/api/webhooks/razorpay/route'
import { POST as verifyPayment } from '@/app/api/milestones/[id]/payments/verify/route'
import { POST as reviewMilestone } from '@/app/api/milestones/[id]/review/route'
import { POST as submitEvidence } from '@/app/api/milestones/[id]/evidence/route'
import { processAdminRefund } from '@/lib/admin-refund'
import { argOf, eqValue, fakeAdjustProgress, supabaseFake, type FakeQuery, type FakeResult } from './support/supabase-fake'
import { jsonRequest, razorpaySignature, tokenFor } from './support/requests'

const mocks = vi.hoisted(() => ({
  adjustProgress: vi.fn(),
  db: {
    serviceRequests: { getById: vi.fn(), update: vi.fn() },
    supportTicketMessages: { create: vi.fn() },
  },
  razorpay: {
    orders: { fetch: vi.fn() },
    payments: { fetch: vi.fn(), refund: vi.fn() },
  },
  approver: {
    current: { actorType: 'company_ca', reviewerUserId: 30, platformCAId: null, companyUserId: 13, companyCAIdentityId: 'ci_1' } as {
      actorType: 'platform_ca' | 'company_ca'
      reviewerUserId: number | null
      platformCAId: number | null
      companyUserId: number | null
      companyCAIdentityId: string | null
    },
  },
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', async () => {
  const { supabaseFake } = await import('./support/supabase-fake')
  return { supabase: supabaseFake.client, db: mocks.db, adjustServiceRequestProgress: mocks.adjustProgress }
})
vi.mock('razorpay', () => ({
  default: vi.fn(function () {
    return mocks.razorpay
  }),
}))
vi.mock('@/lib/server-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server-auth')>()),
  getEvidenceApproverContext: vi.fn(async () => mocks.approver.current),
  assertNgoLiveCsr1: vi.fn(async () => ({ ok: true })),
}))

const webhookSecret = 'whsec_test'
const keySecret = 'rzp_secret'
const context = { params: Promise.resolve({ id: 'm1' }) }
const project = { id: 'p1', company_user_id: 13, ngo_user_id: 12 }
const milestoneNotes = {
  payment_kind: 'csr_milestone',
  milestone_id: 'm1',
  project_id: 'p1',
  base_amount_inr: 1000,
  total_charge_inr: 1059,
}

function respond(handler: (query: FakeQuery) => FakeResult | undefined) {
  supabaseFake.reset(handler)
}

const writes = (table: string, op: 'insert' | 'update' | 'upsert') => supabaseFake.find(table, op)

beforeEach(() => {
  vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', webhookSecret)
  vi.stubEnv('RAZORPAY_KEY_SECRET', keySecret)
  vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', 'rzp_key')
  mocks.approver.current = { actorType: 'company_ca', reviewerUserId: 30, platformCAId: null, companyUserId: 13, companyCAIdentityId: 'ci_1' }
  mocks.db.serviceRequests.getById.mockReset()
  mocks.db.serviceRequests.update.mockReset()
  mocks.adjustProgress.mockReset().mockImplementation(fakeAdjustProgress)
  mocks.razorpay.payments.refund.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function webhookRequest(payload: unknown, eventId?: string) {
  const raw = JSON.stringify(payload)
  const headers: Record<string, string> = {
    'x-razorpay-signature': crypto.createHmac('sha256', webhookSecret).update(raw).digest('hex'),
  }
  if (eventId) headers['x-razorpay-event-id'] = eventId
  return new NextRequest('http://localhost/api/webhooks/razorpay', { method: 'POST', body: raw, headers })
}

const capturedEvent = (event = 'payment.captured') => ({
  event,
  payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 105900, method: 'upi', created_at: 1_700_000_000 } } },
})

const eventLookup = () => supabaseFake.find('provider_webhook_events', 'select')[0]

describe('Razorpay webhook dedup key', () => {
  it('keys on the x-razorpay-event-id header', async () => {
    respond(() => undefined)
    await webhookPost(webhookRequest(capturedEvent(), 'evt_abc'))
    expect(eqValue(eventLookup(), 'provider_event_id')).toBe('evt_abc')
  })

  it('falls back to event type plus entity id so authorized does not swallow captured', async () => {
    respond(() => undefined)
    await webhookPost(webhookRequest(capturedEvent('payment.authorized')))
    const authorizedKey = eqValue(eventLookup(), 'provider_event_id')
    supabaseFake.reset(() => undefined)
    await webhookPost(webhookRequest(capturedEvent('payment.captured')))
    const capturedKey = eqValue(eventLookup(), 'provider_event_id')
    expect(authorizedKey).toBe('payment.authorized:pay_1')
    expect(capturedKey).toBe('payment.captured:pay_1')
  })

  it('returns 409 when a concurrent delivery already inserted the event', async () => {
    respond((query) =>
      query.table === 'provider_webhook_events' && query.op === 'insert' ? { error: { code: '23505' } } : undefined
    )
    const response = await webhookPost(webhookRequest(capturedEvent(), 'evt_dup'))
    expect(response.status).toBe(409)
  })
})

describe('Razorpay webhook milestone payments', () => {
  function milestoneDb(overrides: { milestoneStatus?: string; confirmed?: unknown[] } = {}) {
    respond((query) => {
      if (query.table === 'provider_webhook_events' && query.op === 'insert') return { data: { id: 'evt_row' } }
      if (query.table === 'razorpay_payment_orders' && query.op === 'select') {
        return { data: { id: 'ord_row', service_request_id: null, order_notes: milestoneNotes, amount_paise: 105900, receipt: 'csr_ms_m1' } }
      }
      if (query.table === 'razorpay_payment_orders' && query.op === 'upsert') return { data: { id: 'ord_row' } }
      if (query.table === 'csr_project_milestones' && query.op === 'select' && eqValue(query, 'id')) {
        return { data: { id: 'm1', project_id: 'p1', status: overrides.milestoneStatus ?? 'approved', amount: 1000 } }
      }
      if (query.table === 'csr_project_milestones' && query.op === 'select') return { data: [{ id: 'm1', status: 'completed' }] }
      if (query.table === 'csr_projects') return { data: project }
      if (query.table === 'csr_payment_confirmations' && query.op === 'select' && eqValue(query, 'milestone_id')) {
        return { data: overrides.confirmed ?? [] }
      }
      if (query.table === 'csr_payment_confirmations' && query.op === 'select') return { data: [{ amount: 1000, payment_status: 'confirmed' }] }
      if (query.table === 'csr_payment_confirmations' && query.op === 'insert') return { data: { id: 'pc_1' } }
      return undefined
    })
  }

  it('confirms the milestone when the browser never calls verify', async () => {
    milestoneDb()
    const response = await webhookPost(webhookRequest(capturedEvent(), 'evt_ms'))
    expect(response.status).toBe(200)
    expect(argOf(writes('csr_payment_confirmations', 'insert')[0], 'insert')).toMatchObject({
      milestone_id: 'm1',
      payment_reference: 'pay_1',
      amount: 1000,
      payment_status: 'confirmed',
    })
    expect(argOf(writes('csr_project_milestones', 'update')[0], 'update')).toMatchObject({ status: 'completed' })
    expect(argOf(writes('csr_projects', 'update')[0], 'update')).toMatchObject({ funds_utilized: 1000, progress_percentage: 100 })
    const statusUpdate = writes('provider_webhook_events', 'update').at(-1)
    expect(argOf(statusUpdate, 'update')).toMatchObject({ processing_status: 'processed' })
  })

  it('is idempotent when verify already confirmed the same payment', async () => {
    milestoneDb({ milestoneStatus: 'completed', confirmed: [{ id: 'pc_1', payment_reference: 'pay_1' }] })
    await webhookPost(webhookRequest(capturedEvent(), 'evt_ms2'))
    expect(writes('csr_payment_confirmations', 'insert')).toHaveLength(0)
    expect(argOf(writes('provider_webhook_events', 'update').at(-1), 'update')).toMatchObject({ processing_status: 'processed' })
  })

  it('marks the event failed when the milestone is not approved', async () => {
    milestoneDb({ milestoneStatus: 'submitted' })
    await webhookPost(webhookRequest(capturedEvent(), 'evt_ms3'))
    expect(writes('csr_payment_confirmations', 'insert')).toHaveLength(0)
    expect(argOf(writes('provider_webhook_events', 'update').at(-1), 'update')).toMatchObject({ processing_status: 'failed' })
  })
})

describe('Razorpay webhook refunds', () => {
  const refundEvent = (event: string, status: string, amount = 105900) => ({
    event,
    payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_1', amount, status } } },
  })

  function refundDb(order: unknown, previousRefund: unknown = null) {
    respond((query) => {
      if (query.table === 'provider_webhook_events' && query.op === 'insert') return { data: { id: 'evt_row' } }
      if (query.table === 'razorpay_payments' && query.op === 'select') return { data: { id: 9, order_id: 44, amount_inr: 1059 } }
      if (query.table === 'razorpay_payment_orders') return { data: order }
      if (query.table === 'razorpay_refunds' && query.op === 'select') return { data: previousRefund }
      return undefined
    })
  }

  it('marks the payment refunded for orders without a service request', async () => {
    refundDb({ service_request_id: null, order_notes: milestoneNotes })
    const response = await webhookPost(webhookRequest(refundEvent('refund.processed', 'processed'), 'evt_r1'))
    expect(response.status).toBe(200)
    expect(argOf(writes('razorpay_payments', 'update')[0], 'update')).toMatchObject({ payment_status: 'refunded' })
    expect(writes('razorpay_refunds', 'upsert')).toHaveLength(0)
    expect(mocks.adjustProgress).not.toHaveBeenCalled()
    expect(argOf(writes('provider_webhook_events', 'update').at(-1), 'update')).toMatchObject({ processing_status: 'processed' })
  })

  it('does not downgrade or re-debit a refund that was already processed', async () => {
    refundDb({ service_request_id: 12, order_notes: {} }, { refund_status: 'processed' })
    await webhookPost(webhookRequest(refundEvent('refund.created', 'pending'), 'evt_r2'))
    expect(argOf(writes('razorpay_refunds', 'update')[0], 'update')).toMatchObject({ refund_status: 'processed' })
    expect(writes('razorpay_refunds', 'upsert')).toHaveLength(0)
    expect(mocks.adjustProgress).not.toHaveBeenCalled()
  })

  it('leaves the payment status alone for a failed refund', async () => {
    refundDb({ service_request_id: 12, order_notes: {} })
    await webhookPost(webhookRequest(refundEvent('refund.failed', 'failed'), 'evt_r3'))
    expect(writes('razorpay_payments', 'update')).toHaveLength(0)
  })
})

describe('milestone payment verify', () => {
  function setup(overrides: { milestoneStatus?: string; confirmed?: unknown[]; insertError?: unknown; raced?: unknown[] } = {}) {
    mocks.razorpay.payments.fetch.mockResolvedValue({ id: 'pay_1', status: 'captured', amount: 105900, method: 'upi', created_at: 1_700_000_000 })
    mocks.razorpay.orders.fetch.mockResolvedValue({ id: 'order_1', amount: 105900, receipt: 'csr_ms_m1', notes: milestoneNotes })
    let confirmedLookups = 0
    respond((query) => {
      if (query.table === 'csr_project_milestones' && query.op === 'select' && eqValue(query, 'id')) {
        return { data: { id: 'm1', project_id: 'p1', status: overrides.milestoneStatus ?? 'approved', amount: 1000 } }
      }
      if (query.table === 'csr_project_milestones' && query.op === 'select') return { data: [{ id: 'm1', status: 'completed' }] }
      if (query.table === 'csr_projects') return { data: project }
      if (query.table === 'razorpay_payment_orders' && query.op === 'upsert') return { data: { id: 'ord_row' } }
      if (query.table === 'csr_payment_confirmations' && query.op === 'select' && eqValue(query, 'milestone_id')) {
        confirmedLookups += 1
        return { data: confirmedLookups === 1 ? overrides.confirmed ?? [] : overrides.raced ?? [] }
      }
      if (query.table === 'csr_payment_confirmations' && query.op === 'insert') {
        return overrides.insertError ? { error: overrides.insertError } : { data: { id: 'pc_1' } }
      }
      return undefined
    })
  }

  const verify = () =>
    verifyPayment(
      jsonRequest('http://localhost/api/milestones/m1/payments/verify', {
        body: {
          razorpay_order_id: 'order_1',
          razorpay_payment_id: 'pay_1',
          razorpay_signature: razorpaySignature('order_1', 'pay_1', keySecret),
        },
      }),
      context
    )

  it('rejects a milestone that is no longer approved', async () => {
    setup({ milestoneStatus: 'submitted' })
    const response = await verify()
    expect(response.status).toBe(409)
    expect(writes('csr_payment_confirmations', 'insert')).toHaveLength(0)
  })

  it('returns success without a second confirmation when already recorded', async () => {
    setup({ milestoneStatus: 'completed', confirmed: [{ id: 'pc_1', payment_reference: 'pay_1' }] })
    const response = await verify()
    expect(response.status).toBe(200)
    expect((await response.json()).data).toMatchObject({ message: 'Milestone payment already recorded', paymentConfirmationId: 'pc_1' })
    expect(writes('csr_payment_confirmations', 'insert')).toHaveLength(0)
  })

  it('treats a unique violation on insert as already recorded', async () => {
    setup({ insertError: { code: '23505' }, raced: [{ id: 'pc_race', payment_reference: 'pay_1' }] })
    const response = await verify()
    expect(response.status).toBe(200)
    expect((await response.json()).data).toMatchObject({ message: 'Milestone payment already recorded', paymentConfirmationId: 'pc_race' })
  })

  it('refuses a second payment for a milestone paid by another payment', async () => {
    setup({ milestoneStatus: 'completed', confirmed: [{ id: 'pc_1', payment_reference: 'pay_other' }] })
    const response = await verify()
    expect(response.status).toBe(409)
  })

  it('confirms an approved milestone once', async () => {
    setup()
    const response = await verify()
    expect(response.status).toBe(200)
    expect(writes('csr_payment_confirmations', 'insert')).toHaveLength(1)
    expect(argOf(writes('csr_audit_log', 'insert')[0], 'insert')).toMatchObject({ created_by: 30 })
  })
})

describe('milestone review', () => {
  function setup(overrides: { milestoneStatus?: string; evidence?: unknown; claimed?: unknown[]; reviewInserts?: FakeResult[] } = {}) {
    const reviewInserts = [...(overrides.reviewInserts ?? [])]
    respond((query) => {
      if (query.table === 'csr_project_milestones' && query.op === 'select') {
        return { data: { id: 'm1', project_id: 'p1', status: overrides.milestoneStatus ?? 'submitted', amount: 1000 } }
      }
      if (query.table === 'csr_project_milestones' && query.op === 'update') return { data: overrides.claimed ?? [{ id: 'm1' }] }
      if (query.table === 'csr_projects') return { data: project }
      if (query.table === 'csr_milestone_evidence') return { data: overrides.evidence === undefined ? { id: 'ev_1' } : overrides.evidence }
      if (query.table === 'csr_milestone_reviews') return reviewInserts.shift() ?? { data: { id: 'rv_1' } }
      return undefined
    })
  }

  const platformCA = { actorType: 'platform_ca' as const, reviewerUserId: null, platformCAId: 4, companyUserId: null, companyCAIdentityId: null }

  const review = (body: Record<string, unknown> = { decision: 'approved', evidence_id: 'ev_1' }) =>
    reviewMilestone(jsonRequest('http://localhost/api/milestones/m1/review', { body }), context)

  it.each(['pending', 'approved', 'completed'])('rejects a %s milestone', async (status) => {
    setup({ milestoneStatus: status })
    expect((await review()).status).toBe(409)
    expect(writes('csr_milestone_reviews', 'insert')).toHaveLength(0)
    expect(writes('csr_project_milestones', 'update')).toHaveLength(0)
  })

  it('rejects evidence that belongs to another milestone', async () => {
    setup({ evidence: null })
    expect((await review()).status).toBe(404)
    const evidenceQuery = supabaseFake.find('csr_milestone_evidence')[0]
    expect(eqValue(evidenceQuery, 'milestone_id')).toBe('m1')
    expect(writes('csr_milestone_reviews', 'insert')).toHaveLength(0)
  })

  it('returns 409 when another reviewer won the race', async () => {
    setup({ claimed: [] })
    expect((await review()).status).toBe(409)
    expect(writes('csr_milestone_reviews', 'insert')).toHaveLength(0)
  })

  it('conditionally moves a submitted milestone and records the review', async () => {
    setup()
    expect((await review()).status).toBe(200)
    const update = writes('csr_project_milestones', 'update')[0]
    expect(argOf(update, 'update')).toMatchObject({ status: 'approved' })
    expect(update.calls).toContainEqual(['in', 'status', ['submitted']])
    expect(writes('csr_milestone_reviews', 'insert')).toHaveLength(1)
  })

  it('does not attribute a platform CA audit entry to the company', async () => {
    mocks.approver.current = platformCA
    setup()
    await review()
    expect(argOf(writes('csr_audit_log', 'insert')[0], 'insert')).toMatchObject({
      created_by: null,
      event_payload: { actor_type: 'platform_ca', platform_ca_id: 4 },
    })
  })

  it('records the platform CA as the reviewer', async () => {
    mocks.approver.current = platformCA
    setup()
    expect((await review()).status).toBe(200)
    const inserts = writes('csr_milestone_reviews', 'insert')
    expect(inserts).toHaveLength(1)
    expect(argOf(inserts[0], 'insert')).toMatchObject({ reviewer_id: null, reviewer_platform_ca_id: 4 })
  })

  it('falls back to the company reviewer id before the attribution migration is applied', async () => {
    mocks.approver.current = platformCA
    setup({ reviewInserts: [{ error: { code: 'PGRST204', message: 'column not found' } }] })
    expect((await review()).status).toBe(200)
    const inserts = writes('csr_milestone_reviews', 'insert')
    expect(inserts).toHaveLength(2)
    expect(argOf(inserts[1], 'insert')).toMatchObject({ reviewer_id: 13 })
    expect(argOf(inserts[1], 'insert')).not.toHaveProperty('reviewer_platform_ca_id')
  })
})

describe('milestone evidence submission', () => {
  it.each(['approved', 'completed'])('rejects evidence for a %s milestone', async (status) => {
    respond((query) => {
      if (query.table === 'csr_project_milestones') return { data: { id: 'm1', project_id: 'p1', status } }
      if (query.table === 'csr_projects') return { data: project }
      return undefined
    })
    const response = await submitEvidence(
      jsonRequest('http://localhost/api/milestones/m1/evidence', {
        token: tokenFor(12, 'ngo'),
        body: { device_id: 'dev_1', captured_at: '2026-09-01T00:00:00Z' },
      }),
      context
    )
    expect(response.status).toBe(409)
    expect(writes('csr_milestone_evidence', 'insert')).toHaveLength(0)
    expect(writes('csr_project_milestones', 'update')).toHaveLength(0)
  })
})

describe('admin refund recording', () => {
  const paymentRow = {
    id: 9,
    amount_inr: 1059,
    payment_status: 'captured',
    order: { service_request_id: 12, order_notes: { service_request_id: '12', payment_kind: 'financial_need' } },
  }

  function setup(previousRefund: unknown) {
    mocks.db.serviceRequests.getById.mockResolvedValue({ request_type: 'financial', current_amount: 5000, target_amount: 10000, requirements: {} })
    mocks.razorpay.payments.refund.mockResolvedValue({ id: 'rfnd_1', status: 'processed' })
    respond((query) => {
      if (query.table === 'razorpay_payments' && query.op === 'select') return { data: paymentRow }
      if (query.table === 'razorpay_refunds' && query.op === 'select' && eqValue(query, 'razorpay_refund_id')) return { data: previousRefund }
      return undefined
    })
  }

  const refund = () => processAdminRefund({ admin: { id: 1 }, serviceRequestId: 12, refundPaymentId: 'pay_1' })

  it('does not debit again when the webhook already processed the refund', async () => {
    setup({ refund_status: 'processed' })
    await refund()
    expect(argOf(writes('razorpay_refunds', 'upsert')[0], 'upsert')).toMatchObject({ razorpay_refund_id: 'rfnd_1', refund_status: 'processed' })
    expect(writes('razorpay_refunds', 'upsert')[0].options).toMatchObject({ onConflict: 'razorpay_refund_id' })
    expect(mocks.adjustProgress).not.toHaveBeenCalled()
  })

  it('debits once when the refund moves to processed', async () => {
    setup({ refund_status: 'pending' })
    await refund()
    expect(mocks.adjustProgress).toHaveBeenCalledTimes(1)
  })

  it('skips the debit when the refund row could not be recorded', async () => {
    setup(null)
    supabaseFake.queue('razorpay_refunds.upsert', { error: { message: 'boom' } })
    await refund()
    expect(mocks.adjustProgress).not.toHaveBeenCalled()
  })
})
