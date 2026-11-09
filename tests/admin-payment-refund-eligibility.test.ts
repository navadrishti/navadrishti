import { describe, expect, it } from 'vitest'
import {
  computeRefundEligibility,
  matchesAdminPaymentStatusFilter,
} from '@/lib/admin-payment-refund-eligibility'

describe('computeRefundEligibility', () => {
  it('shows full remaining for a captured payment with no refunds', () => {
    const result = computeRefundEligibility({
      paymentStatus: 'captured',
      capturedAmountInr: 100,
      capturedAmountPaise: 10000,
    })
    expect(result).toMatchObject({
      captured_inr: 100,
      refunded_inr: 0,
      pending_refund_inr: 0,
      remaining_refundable_inr: 100,
      refundable: true,
    })
  })

  it('shows remaining after processed partial refunds', () => {
    const result = computeRefundEligibility({
      paymentStatus: 'partially_refunded',
      capturedAmountPaise: 10000,
      refunds: [{ amount_paise: 3000, refund_status: 'processed' }],
    })
    expect(result).toMatchObject({
      refunded_inr: 30,
      remaining_refundable_inr: 70,
      refundable: true,
    })
  })

  it('marks fully refunded payments as not refundable', () => {
    const result = computeRefundEligibility({
      paymentStatus: 'refunded',
      capturedAmountPaise: 10000,
      refunds: [
        { amount_paise: 3000, refund_status: 'processed' },
        { amount_paise: 7000, refund_status: 'processed' },
      ],
    })
    expect(result.refundable).toBe(false)
    expect(result.remaining_refundable_inr).toBe(0)
  })

  it('rejects failed and uncaptured payments', () => {
    expect(
      computeRefundEligibility({ paymentStatus: 'failed', capturedAmountPaise: 10000 }).refundable
    ).toBe(false)
    expect(
      computeRefundEligibility({ paymentStatus: 'authorized', capturedAmountPaise: 10000 }).refundable
    ).toBe(false)
    expect(
      computeRefundEligibility({ paymentStatus: 'created', capturedAmountPaise: 10000 }).refundable
    ).toBe(false)
  })

  it('reduces remaining when a refund is still pending', () => {
    const result = computeRefundEligibility({
      paymentStatus: 'captured',
      capturedAmountPaise: 10000,
      refunds: [{ amount_paise: 3000, refund_status: 'pending' }],
    })
    expect(result).toMatchObject({
      pending_refund_inr: 30,
      remaining_refundable_inr: 70,
      refundable: true,
    })
  })

  it('supports multiple partial refunds and uses the higher of provider vs ledger reserved', () => {
    const result = computeRefundEligibility({
      paymentStatus: 'partially_refunded',
      capturedAmountPaise: 10000,
      providerAmountRefundedPaise: 5000,
      refunds: [
        { amount_paise: 3000, refund_status: 'processed' },
        { amount_paise: 2000, refund_status: 'pending' },
      ],
    })
    expect(result.remaining_refundable_inr).toBe(50)
    expect(result.refundable).toBe(true)
  })

  it('prefers ledger reserved when provider lag leaves remaining too high', () => {
    const result = computeRefundEligibility({
      paymentStatus: 'partially_refunded',
      capturedAmountPaise: 10000,
      providerAmountRefundedPaise: 3000,
      refunds: [
        { amount_paise: 3000, refund_status: 'processed' },
        { amount_paise: 4000, refund_status: 'pending' },
      ],
    })
    expect(result.remaining_refundable_inr).toBe(30)
  })
})

describe('matchesAdminPaymentStatusFilter', () => {
  it('matches status filters used by the admin list', () => {
    expect(matchesAdminPaymentStatusFilter('captured', 'captured')).toBe(true)
    expect(matchesAdminPaymentStatusFilter('partially_refunded', 'partially_refunded')).toBe(true)
    expect(matchesAdminPaymentStatusFilter('refunded', 'refunded')).toBe(true)
    expect(matchesAdminPaymentStatusFilter('failed', 'failed')).toBe(true)
    expect(matchesAdminPaymentStatusFilter('pending', 'authorized')).toBe(true)
    expect(matchesAdminPaymentStatusFilter('pending', 'captured')).toBe(false)
    expect(matchesAdminPaymentStatusFilter('all', 'failed')).toBe(true)
  })
})
