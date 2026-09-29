import { describe, expect, it } from 'vitest'
import {
  calculatePlatformCheckoutPricing,
  maskAccountNumber,
  parseAmountToInr,
  parseJsonObject,
  toSearchPattern,
  validateCapturedPaymentAmounts,
  validateNgoPayoutAccount,
} from '@/lib/utils'

describe('parseAmountToInr', () => {
  it('reads formatted rupee strings', () => {
    expect(parseAmountToInr('₹1,50,000')).toBe(150000)
    expect(parseAmountToInr(' 2500.50 ')).toBe(2500.5)
    expect(parseAmountToInr(750)).toBe(750)
  })

  it('treats empty, invalid and negative input as zero', () => {
    expect(parseAmountToInr(null)).toBe(0)
    expect(parseAmountToInr(undefined)).toBe(0)
    expect(parseAmountToInr('')).toBe(0)
    expect(parseAmountToInr('abc')).toBe(0)
    expect(parseAmountToInr(-40)).toBe(0)
  })
})

describe('parseJsonObject', () => {
  it('passes objects through and parses JSON strings', () => {
    const row = { a: 1 }
    expect(parseJsonObject(row)).toBe(row)
    expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 })
  })

  it('returns an empty object for anything that is not a plain object', () => {
    expect(parseJsonObject(null)).toEqual({})
    expect(parseJsonObject('not json')).toEqual({})
    expect(parseJsonObject('[1,2]')).toEqual({})
    expect(parseJsonObject([1, 2])).toEqual({})
    expect(parseJsonObject(42)).toEqual({})
  })
})

describe('toSearchPattern', () => {
  it('wraps plain text in LIKE wildcards', () => {
    expect(toSearchPattern('  clean water ')).toBe('%clean water%')
  })

  it('removes characters that would change a PostgREST or() filter', () => {
    expect(toSearchPattern('water,status.eq.draft')).toBe('%water status eq draft%')
    expect(toSearchPattern('a%b_c(d)*"e\\')).toBe('%a b c d e%')
  })

  it('returns an empty string when nothing searchable is left', () => {
    expect(toSearchPattern(null)).toBe('')
    expect(toSearchPattern(' ,.() ')).toBe('')
  })

  it('caps very long input', () => {
    expect(toSearchPattern('x'.repeat(500))).toHaveLength(102)
  })
})

describe('calculatePlatformCheckoutPricing', () => {
  it('adds a 5% fee on top of the base amount', () => {
    const pricing = calculatePlatformCheckoutPricing(1000)
    expect(pricing.platformFeeInr).toBe(50)
    expect(pricing.gstOnPlatformFeeInr).toBe(0)
    expect(pricing.totalChargeInr).toBe(1050)
    expect(pricing.transferAmountPaise).toBe(100000)
  })

  it('charges the minimum fee on small amounts', () => {
    expect(calculatePlatformCheckoutPricing(100).platformFeeInr).toBe(10)
  })

  it('charges nothing when there is no base amount', () => {
    const pricing = calculatePlatformCheckoutPricing(0)
    expect(pricing.platformFeeInr).toBe(0)
    expect(pricing.totalChargeInr).toBe(0)
  })

  it('adds GST on the fee for NGO network payments', () => {
    const pricing = calculatePlatformCheckoutPricing(1000, { paymentKind: 'ngo_network' })
    expect(pricing.gstOnPlatformFeeInr).toBe(9)
    expect(pricing.totalChargeInr).toBe(1059)
    expect(pricing.totalChargePaise).toBe(105900)
  })
})

describe('validateCapturedPaymentAmounts', () => {
  it('accepts a payment that matches the order total', () => {
    const result = validateCapturedPaymentAmounts({
      orderNotes: { total_charge_inr: 1059, base_amount_inr: 1000 },
      paidInr: 1059,
    })
    expect(result).toEqual({ ok: true, paidInr: 1059, baseAmountInr: 1000 })
  })

  it('rejects a payment that does not match the order total', () => {
    const result = validateCapturedPaymentAmounts({
      orderNotes: { total_charge_inr: 1059 },
      paidInr: 1000,
    })
    expect(result.ok).toBe(false)
  })

  it('falls back to the paid amount when the order has no notes', () => {
    expect(validateCapturedPaymentAmounts({ paidInr: 500 })).toEqual({
      ok: true,
      paidInr: 500,
      baseAmountInr: 500,
    })
  })
})

describe('NGO payout accounts', () => {
  const account = {
    account_holder_name: 'Asha Foundation',
    bank_name: 'HDFC Bank',
    account_number: '50100012345678',
    ifsc: 'hdfc0001234',
  }

  it('accepts a complete account and normalises the IFSC', () => {
    expect(validateNgoPayoutAccount(account)).toBeNull()
  })

  it('rejects a bad IFSC or a non-numeric account number', () => {
    expect(validateNgoPayoutAccount({ ...account, ifsc: 'HDFC1234' })).toMatch(/IFSC/)
    expect(validateNgoPayoutAccount({ ...account, account_number: '5010-0012' })).toMatch(/digits only/)
  })

  it('masks all but the last four digits', () => {
    expect(maskAccountNumber('50100012345678')).toBe('**********5678')
    expect(maskAccountNumber('1234')).toBe('1234')
  })
})
