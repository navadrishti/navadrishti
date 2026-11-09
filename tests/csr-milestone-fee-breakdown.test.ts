import { describe, expect, it, vi, afterEach } from 'vitest'
import { calculatePlatformCheckoutPricing, buildPricingResponse } from '@/lib/utils'

describe('CSR milestone fee breakdown', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('explains recipient vs total using configured platform fee on top of milestone amount', () => {
    vi.stubEnv('NEXT_PUBLIC_PLATFORM_FEE_PERCENT', '4')
    vi.stubEnv('NEXT_PUBLIC_PLATFORM_FEE_MIN_INR', '10')
    vi.stubEnv('NEXT_PUBLIC_PLATFORM_GST_PERCENT', '18')

    const pricing = calculatePlatformCheckoutPricing(100000, { paymentKind: 'csr_milestone' })
    // 4% of 100000 = 4000 platform fee; GST 18% of fee = 720; total payable = 104720
    expect(pricing.baseAmountInr).toBe(100000)
    expect(pricing.platformFeeInr).toBe(4000)
    expect(pricing.platformFeePercent).toBe(4)
    expect(pricing.gstOnPlatformFeeInr).toBe(720)
    expect(pricing.totalChargeInr).toBe(104720)

    const response = buildPricingResponse(pricing)
    expect(response.ngoReceives).toBe(100000)
    expect(response.platformFee).toBe(4000)
    expect(response.gstOnPlatformFee).toBe(720)
    expect(response.totalCharge).toBe(104720)
  })

  it('matches Delivery Complete ₹4,00,000 under the 4% E2E fee policy', () => {
    vi.stubEnv('NEXT_PUBLIC_PLATFORM_FEE_PERCENT', '4')
    vi.stubEnv('NEXT_PUBLIC_PLATFORM_FEE_MIN_INR', '10')
    vi.stubEnv('NEXT_PUBLIC_PLATFORM_GST_PERCENT', '18')

    const pricing = calculatePlatformCheckoutPricing(400000, { paymentKind: 'csr_milestone' })
    expect(pricing.baseAmountInr).toBe(400000)
    expect(pricing.platformFeeInr).toBe(16000)
    expect(pricing.gstOnPlatformFeeInr).toBe(2880)
    expect(pricing.totalChargeInr).toBe(418880)

    const response = buildPricingResponse(pricing)
    expect(response.ngoReceives).toBe(400000)
    expect(response.totalCharge).toBe(418880)
  })

  it('matches the CA display case when GST is not applied (undefined payment kind)', () => {
    vi.stubEnv('NEXT_PUBLIC_PLATFORM_FEE_PERCENT', '4')
    vi.stubEnv('NEXT_PUBLIC_PLATFORM_FEE_MIN_INR', '10')

    // UI previously called getTotalChargeLabel without paymentKind → no GST → ₹4,16,000 on 4L
    const displayWithoutKind = calculatePlatformCheckoutPricing(400000)
    expect(displayWithoutKind.platformFeeInr).toBe(16000)
    expect(displayWithoutKind.gstOnPlatformFeeInr).toBe(0)
    expect(displayWithoutKind.totalChargeInr).toBe(416000)

    // Checkout must use csr_milestone so payer sees the same GST-inclusive total as create-order
    const checkout = calculatePlatformCheckoutPricing(400000, { paymentKind: 'csr_milestone' })
    expect(checkout.totalChargeInr).toBe(418880)
  })
})
