import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { getTokenClaims, normalizeExpiryDate, normalizePincode } from '@/lib/auth'

function requestWithAuth(header?: string) {
  return new NextRequest('http://localhost/api/test', {
    headers: header ? { authorization: header } : {},
  })
}

describe('getTokenClaims', () => {
  it('returns the claims from a valid bearer token', () => {
    const token = jwt.sign({ id: 7, user_type: 'ngo' }, 'test-secret')
    expect(getTokenClaims(requestWithAuth(`Bearer ${token}`))).toMatchObject({ id: 7, user_type: 'ngo' })
  })

  it('returns null without a bearer token', () => {
    expect(getTokenClaims(requestWithAuth())).toBeNull()
    expect(getTokenClaims(requestWithAuth('Basic abc'))).toBeNull()
  })

  it('returns null for tokens signed with another secret or already expired', () => {
    const forged = jwt.sign({ id: 7, user_type: 'ngo' }, 'other-secret')
    const expired = jwt.sign({ id: 7, user_type: 'ngo', exp: Math.floor(Date.now() / 1000) - 60 }, 'test-secret')
    expect(getTokenClaims(requestWithAuth(`Bearer ${forged}`))).toBeNull()
    expect(getTokenClaims(requestWithAuth(`Bearer ${expired}`))).toBeNull()
  })
})

describe('normalizeExpiryDate', () => {
  it('reads ISO, day-first and written dates', () => {
    expect(normalizeExpiryDate('2027-03-05')).toBe('2027-03-05')
    expect(normalizeExpiryDate('05/03/2027')).toBe('2027-03-05')
    expect(normalizeExpiryDate('5th March 2027')).toBe('2027-03-05')
  })

  it('rejects impossible dates and non-strings', () => {
    expect(normalizeExpiryDate('31/02/2027')).toBeNull()
    expect(normalizeExpiryDate('soon')).toBeNull()
    expect(normalizeExpiryDate(20270305)).toBeNull()
  })
})

describe('normalizePincode', () => {
  it('keeps six digits for India and up to twelve elsewhere', () => {
    expect(normalizePincode('560 001')).toBe('560001')
    expect(normalizePincode('5600011')).toBe('560001')
    expect(normalizePincode('SW1A-1AA 12', 'United Kingdom')).toBe('1112')
  })
})
