import { describe, expect, it } from 'vitest'
import { formatMeterInr, meterPercent } from '@/components/info-meter'

describe('info meter helpers', () => {
  it('returns null percent when the denominator is missing or zero', () => {
    expect(meterPercent(3, 0)).toBeNull()
    expect(meterPercent(3, Number.NaN)).toBeNull()
    expect(meterPercent(Number.NaN, 10)).toBeNull()
  })

  it('clamps percent between 0 and 100', () => {
    expect(meterPercent(5, 10)).toBe(50)
    expect(meterPercent(0, 10)).toBe(0)
    expect(meterPercent(15, 10)).toBe(100)
  })

  it('formats INR without exposing fractional noise', () => {
    expect(formatMeterInr(1059.4)).toMatch(/1,059/)
  })
})
