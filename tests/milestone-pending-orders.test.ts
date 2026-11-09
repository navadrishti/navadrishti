import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isReusableCsrMilestonePendingOrder,
  pendingOrdersToInvalidate,
  selectReusableCsrMilestonePendingOrder,
  withMilestonePaymentCreateLock,
  type MilestonePendingOrderRow,
} from '@/lib/milestone-pending-order-match'
import { calculatePlatformCheckoutPricing } from '@/lib/utils'

function pricingAt(feePercent: string, base = 400000) {
  vi.stubEnv('NEXT_PUBLIC_PLATFORM_FEE_PERCENT', feePercent)
  vi.stubEnv('NEXT_PUBLIC_PLATFORM_FEE_MIN_INR', '10')
  vi.stubEnv('NEXT_PUBLIC_PLATFORM_GST_PERCENT', '18')
  return calculatePlatformCheckoutPricing(base, { paymentKind: 'csr_milestone' })
}

function orderRow(
  overrides: Partial<MilestonePendingOrderRow> & {
    feePercent?: number
    baseAmount?: number
    platformFee?: number
    gst?: number
    total?: number
    milestoneId?: string
    projectId?: string
    companyUserId?: number
  } = {}
): MilestonePendingOrderRow {
  const feePercent = overrides.feePercent ?? 4
  const baseAmount = overrides.baseAmount ?? 400000
  const platformFee = overrides.platformFee ?? 16000
  const gst = overrides.gst ?? 2880
  const total = overrides.total ?? 418880
  const milestoneId = overrides.milestoneId ?? '11111111-1111-4111-8111-111111111104'
  const projectId = overrides.projectId ?? '11111111-1111-4111-8111-111111111102'
  const companyUserId = overrides.companyUserId ?? 1

  return {
    id: overrides.id ?? 'ord_row_1',
    razorpay_order_id: overrides.razorpay_order_id ?? 'order_pending_1',
    payer_user_id: overrides.payer_user_id ?? 1,
    ngo_user_id: overrides.ngo_user_id ?? 2,
    amount_inr: overrides.amount_inr ?? total,
    amount_paise: overrides.amount_paise ?? total * 100,
    currency: overrides.currency ?? 'INR',
    order_status: overrides.order_status ?? 'created',
    expires_at: overrides.expires_at ?? null,
    created_at: overrides.created_at ?? '2026-11-06T10:00:00.000Z',
    order_notes: overrides.order_notes ?? {
      source: 'csr_milestone_payment',
      payment_kind: 'csr_milestone',
      milestone_id: milestoneId,
      project_id: projectId,
      company_user_id: String(companyUserId),
      pricing_model: 'fee_on_top',
      base_amount_inr: baseAmount,
      platform_fee_inr: platformFee,
      platform_fee_percent: feePercent,
      gst_on_platform_fee_inr: gst,
      gst_rate_percent: 18,
      total_charge_inr: total,
    },
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('CSR milestone 4% fee_on_top pricing', () => {
  it('charges 4% fee + 18% GST on fee and keeps full NGO receivable', () => {
    const pricing = pricingAt('4', 400000)
    expect(pricing.baseAmountInr).toBe(400000)
    expect(pricing.platformFeePercent).toBe(4)
    expect(pricing.platformFeeInr).toBe(16000)
    expect(pricing.gstOnPlatformFeeInr).toBe(2880)
    expect(pricing.totalChargeInr).toBe(418880)
    expect(pricing.transferAmountPaise).toBe(40000000)
  })
})

describe('pending CSR milestone order reuse', () => {
  it('reuses a matching pending order under the current 4% pricing', () => {
    const pricing = pricingAt('4')
    const row = orderRow({ feePercent: 4, platformFee: 16000, gst: 2880, total: 418880 })
    expect(
      isReusableCsrMilestonePendingOrder(row, {
        milestoneId: '11111111-1111-4111-8111-111111111104',
        projectId: '11111111-1111-4111-8111-111111111102',
        payerUserId: 1,
        ngoUserId: 2,
        pricing,
      })
    ).toBe(true)
  })

  it('does not reuse an old 2% pending order after config moves to 4%', () => {
    const pricing = pricingAt('4')
    const oldTwoPercent = orderRow({
      feePercent: 2,
      platformFee: 8000,
      gst: 1440,
      total: 409440,
      amount_inr: 409440,
      amount_paise: 40944000,
    })
    expect(
      isReusableCsrMilestonePendingOrder(oldTwoPercent, {
        milestoneId: '11111111-1111-4111-8111-111111111104',
        projectId: '11111111-1111-4111-8111-111111111102',
        payerUserId: 1,
        ngoUserId: 2,
        pricing,
      })
    ).toBe(false)
  })

  it('does not share orders across milestones, companies or NGOs', () => {
    const pricing = pricingAt('4')
    const baseInput = {
      milestoneId: '11111111-1111-4111-8111-111111111104',
      projectId: '11111111-1111-4111-8111-111111111102',
      payerUserId: 1,
      ngoUserId: 2,
      pricing,
    }
    expect(
      isReusableCsrMilestonePendingOrder(orderRow({ milestoneId: 'other-milestone' }), baseInput)
    ).toBe(false)
    expect(isReusableCsrMilestonePendingOrder(orderRow({ payer_user_id: 99 }), baseInput)).toBe(false)
    expect(isReusableCsrMilestonePendingOrder(orderRow({ ngo_user_id: 99 }), baseInput)).toBe(false)
  })

  it('rejects failed, expired, or wrong-amount pending orders', () => {
    const pricing = pricingAt('4')
    const input = {
      milestoneId: '11111111-1111-4111-8111-111111111104',
      projectId: '11111111-1111-4111-8111-111111111102',
      payerUserId: 1,
      ngoUserId: 2,
      pricing,
      now: new Date('2026-11-06T12:00:00.000Z'),
    }
    expect(isReusableCsrMilestonePendingOrder(orderRow({ order_status: 'failed' }), input)).toBe(false)
    expect(isReusableCsrMilestonePendingOrder(orderRow({ order_status: 'paid' }), input)).toBe(false)
    expect(
      isReusableCsrMilestonePendingOrder(
        orderRow({ expires_at: '2026-11-06T11:00:00.000Z' }),
        input
      )
    ).toBe(false)
    expect(
      isReusableCsrMilestonePendingOrder(orderRow({ amount_paise: 999 }), input)
    ).toBe(false)
  })

  it('selects the oldest reusable pending order and invalidates the rest', () => {
    const pricing = pricingAt('4')
    const input = {
      milestoneId: '11111111-1111-4111-8111-111111111104',
      projectId: '11111111-1111-4111-8111-111111111102',
      payerUserId: 1,
      ngoUserId: 2,
      pricing,
    }
    const older = orderRow({
      id: 'older',
      razorpay_order_id: 'order_old',
      created_at: '2026-11-06T10:00:00.000Z',
    })
    const newer = orderRow({
      id: 'newer',
      razorpay_order_id: 'order_new',
      created_at: '2026-11-06T11:00:00.000Z',
    })
    const mismatched = orderRow({
      id: 'old2pct',
      feePercent: 2,
      platformFee: 8000,
      gst: 1440,
      total: 409440,
      amount_inr: 409440,
      amount_paise: 40944000,
      created_at: '2026-11-06T09:00:00.000Z',
    })
    const keeper = selectReusableCsrMilestonePendingOrder([newer, mismatched, older], input)
    expect(keeper?.id).toBe('older')
    const invalidate = pendingOrdersToInvalidate([newer, mismatched, older], keeper, input)
    expect(invalidate.map((row) => row.id).sort()).toEqual(['newer', 'old2pct'])
  })

  it('serializes concurrent create locks for the same milestone', async () => {
    const events: string[] = []
    await Promise.all([
      withMilestonePaymentCreateLock('m1', async () => {
        events.push('a-start')
        await new Promise((resolve) => setTimeout(resolve, 30))
        events.push('a-end')
      }),
      withMilestonePaymentCreateLock('m1', async () => {
        events.push('b-start')
        events.push('b-end')
      }),
    ])
    expect(events).toEqual(['a-start', 'a-end', 'b-start', 'b-end'])
  })

  it('allows concurrent locks across different milestones', async () => {
    const events: string[] = []
    await Promise.all([
      withMilestonePaymentCreateLock('m1', async () => {
        events.push('m1-start')
        await new Promise((resolve) => setTimeout(resolve, 30))
        events.push('m1-end')
      }),
      withMilestonePaymentCreateLock('m2', async () => {
        events.push('m2-start')
        events.push('m2-end')
      }),
    ])
    expect(events.indexOf('m2-start')).toBeLessThan(events.indexOf('m1-end'))
  })
})
