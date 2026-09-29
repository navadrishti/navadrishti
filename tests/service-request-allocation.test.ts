import { describe, expect, it } from 'vitest'
import {
  getFundingProgress,
  getNeedRemainingQuantity,
  getServiceRequestTarget,
  isServiceRequestExpired,
  parseBudgetUpperBound,
  resolveFundingTargetInr,
  validateAcceptanceAllocation,
} from '@/lib/service-request-allocation'

const financialNeed = {
  request_type: 'Financial Assistance',
  target_amount: 50000,
  current_amount: 20000,
}

const materialNeed = {
  category: 'Material Donation',
  requirements: JSON.stringify({ target_quantity: 100 }),
  current_quantity: 40,
}

describe('getServiceRequestTarget', () => {
  it('reads financial targets from the row', () => {
    expect(getServiceRequestTarget(financialNeed)).toMatchObject({
      amount: 50000,
      isFinancial: true,
      isDeliverable: false,
    })
  })

  it('reads quantity targets from stringified requirements', () => {
    expect(getServiceRequestTarget(materialNeed)).toMatchObject({
      quantity: 100,
      isFinancial: false,
      isDeliverable: true,
    })
  })
})

describe('getNeedRemainingQuantity', () => {
  it('subtracts what has already been raised or delivered', () => {
    expect(getNeedRemainingQuantity(financialNeed)).toBe(30000)
    expect(getNeedRemainingQuantity(materialNeed)).toBe(60)
  })

  it('prefers the stored remaining column when present', () => {
    expect(getNeedRemainingQuantity({ ...financialNeed, remaining_amount: 1234 })).toBe(1234)
  })
})

describe('validateAcceptanceAllocation', () => {
  it('rejects empty or oversized allocations', () => {
    expect(validateAcceptanceAllocation(financialNeed, { amount: 0 })).toMatch(/greater than zero/)
    expect(validateAcceptanceAllocation(financialNeed, { amount: 40000 })).toMatch(/remains/)
    expect(validateAcceptanceAllocation(materialNeed, { quantity: 61 })).toMatch(/units remain/)
  })

  it('accepts allocations within what remains', () => {
    expect(validateAcceptanceAllocation(financialNeed, { amount: 30000 })).toBeNull()
    expect(validateAcceptanceAllocation(materialNeed, { quantity: 60 })).toBeNull()
  })
})

describe('isServiceRequestExpired', () => {
  const now = new Date('2026-06-01T00:00:00Z')

  it('treats closed statuses and past deadlines as expired', () => {
    expect(isServiceRequestExpired({ status: 'completed' }, now)).toBe(true)
    expect(isServiceRequestExpired({ status: 'active', valid_until: '2026-05-01' }, now)).toBe(true)
    expect(
      isServiceRequestExpired({ status: 'active', project_context: { project_valid_until: '2026-05-31' } }, now)
    ).toBe(true)
  })

  it('keeps open requests with a future deadline', () => {
    expect(isServiceRequestExpired({ status: 'active', valid_until: '2026-07-01' }, now)).toBe(false)
  })
})

describe('funding helpers', () => {
  it('reads the upper bound of budget labels', () => {
    expect(parseBudgetUpperBound('₹50,000 - ₹1,00,000')).toBe(100000)
    expect(parseBudgetUpperBound('Under ₹10,000')).toBe(10000)
    expect(parseBudgetUpperBound('₹5,00,000+')).toBe(500000)
    expect(parseBudgetUpperBound('Negotiable')).toBe(0)
  })

  it('prefers an explicit funding target over the budget label', () => {
    expect(resolveFundingTargetInr({ funding_target_inr: 75000, budget: 'Under ₹10,000' })).toBe(75000)
    expect(resolveFundingTargetInr({ budget: '₹50,000 - ₹1,00,000' })).toBe(100000)
  })

  it('caps progress at 100%', () => {
    expect(getFundingProgress(1000, 250)).toEqual({ target: 1000, raised: 250, remaining: 750, progress: 25 })
    expect(getFundingProgress(1000, 1500).progress).toBe(100)
  })
})
