import { describe, expect, it } from 'vitest'
import {
  aggregateAdminPaymentTotals,
  withAdminPaymentTotalsScope,
} from '@/lib/dashboard/admin-payment-totals'

describe('admin global payment and refund totals', () => {
  it('aggregates captured, confirmed refunded, net, pending, failed and remaining refundable', () => {
    const totals = aggregateAdminPaymentTotals([
      {
        id: 'p1',
        amount_inr: 1000,
        payment_status: 'captured',
        refunds: [
          { id: 'r1', razorpay_refund_id: 'rfnd_1', amount_inr: 200, refund_status: 'processed' },
          { id: 'r2', razorpay_refund_id: 'rfnd_2', amount_inr: 50, refund_status: 'pending' },
          { id: 'r3', razorpay_refund_id: 'rfnd_3', amount_inr: 25, refund_status: 'failed' },
        ],
      },
      {
        id: 'p2',
        amount_inr: 500,
        payment_status: 'captured',
        refunds: [],
      },
    ])

    expect(totals.captured_amount).toBe(1500)
    expect(totals.confirmed_refunded_amount).toBe(200)
    expect(totals.net_captured_after_refunds).toBe(1300)
    expect(totals.pending_refund_amount).toBe(50)
    expect(totals.failed_refund_amount).toBe(25)
    // p1 remaining 1000−(200 processed + 50 pending)=750; p2 remaining 500
    expect(totals.remaining_refundable_amount).toBe(1250)
    expect(totals.refundable_payment_count).toBe(2)
  })

  it('deduplicates refund rows by razorpay_refund_id', () => {
    const totals = aggregateAdminPaymentTotals([
      {
        id: 'p1',
        amount_inr: 1000,
        payment_status: 'partially_refunded',
        refunds: [
          { id: 'db-1', razorpay_refund_id: 'rfnd_dup', amount_inr: 100, refund_status: 'processed' },
          { id: 'db-2', razorpay_refund_id: 'rfnd_dup', amount_inr: 100, refund_status: 'processed' },
        ],
      },
    ])

    expect(totals.confirmed_refunded_amount).toBe(100)
    expect(totals.duplicate_refunds_skipped).toBe(1)
    expect(totals.refund_rows_considered).toBe(1)
  })

  it('excludes pending and failed refunds from confirmed refunded totals', () => {
    const totals = aggregateAdminPaymentTotals([
      {
        id: 'p1',
        amount_inr: 400,
        payment_status: 'captured',
        refunds: [
          { razorpay_refund_id: 'a', amount_inr: 40, refund_status: 'pending' },
          { razorpay_refund_id: 'b', amount_inr: 60, refund_status: 'failed' },
          { razorpay_refund_id: 'c', amount_inr: 10, refund_status: 'processed' },
        ],
      },
    ])

    expect(totals.confirmed_refunded_amount).toBe(10)
    expect(totals.pending_refund_amount).toBe(40)
    expect(totals.failed_refund_amount).toBe(60)
    expect(totals.net_captured_after_refunds).toBe(390)
  })

  it('does not add refund records into payment captured totals', () => {
    const totals = aggregateAdminPaymentTotals([
      {
        id: 'p1',
        amount_inr: 100,
        payment_status: 'captured',
        refunds: [{ razorpay_refund_id: 'x', amount_inr: 100, refund_status: 'processed' }],
      },
    ])
    expect(totals.captured_amount).toBe(100)
    expect(totals.confirmed_refunded_amount).toBe(100)
    expect(totals.net_captured_after_refunds).toBe(0)
  })

  it('labels page versus global scope without claiming page as global', () => {
    const base = aggregateAdminPaymentTotals([
      { id: 'p1', amount_inr: 10, payment_status: 'captured', refunds: [] },
    ])
    const page = withAdminPaymentTotalsScope(base, { scope: 'page', total_matching: 1 })
    const global = withAdminPaymentTotalsScope(base, { scope: 'global', total_matching: 1 })
    const window = withAdminPaymentTotalsScope(base, {
      scope: 'fetched_window',
      window_cap: 1000,
      total_matching: 1,
    })

    expect(page.is_complete_global).toBe(false)
    expect(page.scope).toBe('page')
    expect(global.is_complete_global).toBe(true)
    expect(window.is_complete_global).toBe(false)
    expect(window.scope).toBe('fetched_window')
  })
})
