/**
 * Live database integration regression: partial CSR milestone refunds reduce net disbursed via
 * razorpay_refunds without mutating confirmation amount or milestone progress.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 * in the process environment, pointing at the dedicated integration-test project.
 * Creates ephemeral payment/refund rows only; does not alter the confirmed ₹100 TEST refund.
 *
 * Ledger joins use this file's dedicated integration Supabase client (not @/lib/db)
 * so production env is never hit.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { deriveCsrProjectMetrics } from '@/lib/csr-agent/project-metrics'
import { moneyInr, withConfirmedRefunds } from '@/lib/csr-agent/milestone-refund-accounting'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ supabase: { from: vi.fn() }, db: {} }))

const EXPECTED_REF = 'czrwdchfkaayeplvnlxz'
const FIXTURE = 'integration_csr_partial_refund_acct'
const PAY_REF = `pay_${FIXTURE}`
const ORDER_RZ = `order_${FIXTURE}`
const RFND_A = `rfnd_${FIXTURE}_a`
const RFND_B = `rfnd_${FIXTURE}_b`
const RFND_PENDING = `rfnd_${FIXTURE}_pending`
const RFND_FAILED = `rfnd_${FIXTURE}_failed`

const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
const serviceKey = String(
  process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
)
const enabled = Boolean(supabaseUrl.includes(EXPECTED_REF) && serviceKey)

async function loadProcessedRefundsByRef(
  client: SupabaseClient,
  paymentReferences: string[]
): Promise<{
  processedByPaymentRef: Map<string, number>
  pendingByPaymentRef: Map<string, number>
  failedByPaymentRef: Map<string, number>
}> {
  const processedByPaymentRef = new Map<string, number>()
  const pendingByPaymentRef = new Map<string, number>()
  const failedByPaymentRef = new Map<string, number>()
  const refs = [...new Set(paymentReferences.filter(Boolean))]
  if (refs.length === 0) return { processedByPaymentRef, pendingByPaymentRef, failedByPaymentRef }

  const { data: payments, error: paymentError } = await client
    .from('razorpay_payments')
    .select('id, razorpay_payment_id')
    .in('razorpay_payment_id', refs)
  if (paymentError) throw paymentError

  const idToRef = new Map<string, string>()
  for (const row of payments || []) {
    idToRef.set(String(row.id), String(row.razorpay_payment_id))
  }
  const paymentIds = [...idToRef.keys()]
  if (paymentIds.length === 0) return { processedByPaymentRef, pendingByPaymentRef, failedByPaymentRef }

  const { data: refunds, error: refundError } = await client
    .from('razorpay_refunds')
    .select('payment_id, amount_inr, refund_status')
    .in('payment_id', paymentIds)
  if (refundError) throw refundError

  for (const row of refunds || []) {
    const ref = idToRef.get(String(row.payment_id || ''))
    if (!ref) continue
    const amount = moneyInr(row.amount_inr)
    const status = String(row.refund_status || '').toLowerCase()
    const target =
      status === 'processed'
        ? processedByPaymentRef
        : status === 'pending'
          ? pendingByPaymentRef
          : status === 'failed'
            ? failedByPaymentRef
            : null
    if (!target || amount <= 0) continue
    target.set(ref, moneyInr((target.get(ref) || 0) + amount))
  }

  return { processedByPaymentRef, pendingByPaymentRef, failedByPaymentRef }
}

describe.skipIf(!enabled)('Integration DB: CSR milestone partial refund accounting', () => {
  let supabase: SupabaseClient
  let orderId: string | null = null
  let paymentId: string | null = null
  let baselineHundredRefund: {
    id: string
    amount_inr: number
    refund_status: string
    updated_at: string
  } | null = null

  beforeAll(async () => {
    if (!supabaseUrl.includes(EXPECTED_REF)) {
      throw new Error(`Refusing integration DB test: URL must contain ${EXPECTED_REF}`)
    }
    supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: hundred } = await supabase
      .from('razorpay_refunds')
      .select('id, amount_inr, refund_status, updated_at')
      .eq('amount_inr', 100)
      .order('created_at', { ascending: true })
      .limit(5)
    baselineHundredRefund = (hundred || []).find((row) => Number(row.amount_inr) === 100) || null
  })

  afterAll(async () => {
    if (!supabase) return
    await supabase
      .from('razorpay_refunds')
      .delete()
      .in('razorpay_refund_id', [RFND_A, RFND_B, RFND_PENDING, RFND_FAILED])
    if (paymentId) await supabase.from('razorpay_payments').delete().eq('id', paymentId)
    if (orderId) await supabase.from('razorpay_payment_orders').delete().eq('id', orderId)
  })

  it('net disbursed uses cumulative processed refunds; pending/failed ignored; baseline ₹100 untouched', async () => {
    const nowIso = new Date().toISOString()

    const { data: order, error: orderError } = await supabase
      .from('razorpay_payment_orders')
      .insert({
        razorpay_order_id: ORDER_RZ,
        amount_inr: 1059,
        amount_paise: 105900,
        currency: 'INR',
        order_status: 'paid',
        payer_user_id: 1,
        ngo_user_id: 10,
        service_request_id: null,
        order_notes: {
          payment_kind: 'csr_milestone',
          fixture: FIXTURE,
          base_amount_inr: 1000,
          total_charge_inr: 1059,
        },
      })
      .select('id')
      .single()
    if (orderError) throw orderError
    orderId = order.id

    const { data: payment, error: paymentError } = await supabase
      .from('razorpay_payments')
      .insert({
        order_id: order.id,
        razorpay_order_id: ORDER_RZ,
        razorpay_payment_id: PAY_REF,
        amount_inr: 1059,
        amount_paise: 105900,
        currency: 'INR',
        payment_status: 'partially_refunded',
        paid_at: nowIso,
        provider_payload: { fixture: FIXTURE },
      })
      .select('id')
      .single()
    if (paymentError) throw paymentError
    paymentId = payment.id

    const refundRows = [
      {
        razorpay_refund_id: RFND_A,
        amount_inr: 200,
        amount_paise: 20000,
        refund_status: 'processed',
        processed_at: nowIso,
      },
      {
        razorpay_refund_id: RFND_B,
        amount_inr: 150,
        amount_paise: 15000,
        refund_status: 'processed',
        processed_at: nowIso,
      },
      {
        razorpay_refund_id: RFND_PENDING,
        amount_inr: 50,
        amount_paise: 5000,
        refund_status: 'pending',
        processed_at: null,
      },
      {
        razorpay_refund_id: RFND_FAILED,
        amount_inr: 75,
        amount_paise: 7500,
        refund_status: 'failed',
        processed_at: null,
      },
    ]
    for (const row of refundRows) {
      const { error } = await supabase.from('razorpay_refunds').insert({
        payment_id: payment.id,
        service_request_id: null,
        razorpay_refund_id: row.razorpay_refund_id,
        refund_reason: FIXTURE,
        amount_inr: row.amount_inr,
        amount_paise: row.amount_paise,
        refund_status: row.refund_status,
        processed_at: row.processed_at,
        provider_payload: { fixture: FIXTURE },
        initiated_at: nowIso,
      })
      if (error) throw error
    }

    const totals = await loadProcessedRefundsByRef(supabase, [PAY_REF])
    expect(totals.processedByPaymentRef.get(PAY_REF)).toBe(350)
    expect(totals.pendingByPaymentRef.get(PAY_REF)).toBe(50)
    expect(totals.failedByPaymentRef.get(PAY_REF)).toBe(75)

    const confirmation = {
      payment_status: 'confirmed',
      amount: 1000,
      payment_reference: PAY_REF,
      milestone_id: 'm_fixture',
    }
    const payments = withConfirmedRefunds([confirmation], totals.processedByPaymentRef)
    const metrics = deriveCsrProjectMetrics({
      milestones: [{ id: 'm_fixture', status: 'completed', milestone_order: 1, amount: 1000 }],
      payments,
    })

    expect(metrics.gross_confirmed_funds).toBe(1000)
    expect(metrics.confirmed_refund_funds).toBe(350)
    expect(metrics.confirmed_funds).toBe(650)
    expect(metrics.paid_completed_milestones_count).toBe(1)
    expect(payments[0].amount).toBe(1000)

    if (baselineHundredRefund) {
      const { data: after } = await supabase
        .from('razorpay_refunds')
        .select('id, amount_inr, refund_status, updated_at')
        .eq('id', baselineHundredRefund.id)
        .maybeSingle()
      expect(after).toMatchObject({
        id: baselineHundredRefund.id,
        amount_inr: 100,
        refund_status: baselineHundredRefund.refund_status,
        updated_at: baselineHundredRefund.updated_at,
      })
    }
  })
})
