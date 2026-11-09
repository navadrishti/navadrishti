import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  getTokenClaims: vi.fn(),
  fetchUserPaymentHistory: vi.fn(),
  fetchCompanyCsrCapabilityFines: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ supabase: {} }))
vi.mock('@/lib/auth', () => ({ getTokenClaims: mocks.getTokenClaims }))
vi.mock('@/lib/server-auth', () => ({
  authErrorResponse: (error: unknown) =>
    NextResponse.json({ error: error instanceof Error ? error.message : 'Authentication failed' }, { status: 401 }),
}))
vi.mock('@/lib/company-ca', () => ({ getCompanyCAUserIdSet: vi.fn(async () => new Set()) }))
vi.mock('@/lib/razorpay-route', () => ({
  fetchUserPaymentHistory: mocks.fetchUserPaymentHistory,
}))
vi.mock('@/lib/csr-agent/campaign', () => ({
  fetchCompanyCsrCapabilityFines: mocks.fetchCompanyCsrCapabilityFines,
}))

import { GET } from '@/app/api/users/route'

describe('payment history access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetchUserPaymentHistory.mockResolvedValue([{ id: 'pay-1' }])
    mocks.fetchCompanyCsrCapabilityFines.mockResolvedValue([])
  })

  it('allows individuals to load received payment history', async () => {
    mocks.getTokenClaims.mockResolvedValue({ id: 9, user_type: 'individual' })
    const request = new NextRequest('http://localhost/api/users?view=payment-history&role=received')
    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mocks.fetchUserPaymentHistory).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 9, userType: 'individual', role: 'received' })
    )
  })

  it('allows NGOs to load received payment history', async () => {
    mocks.getTokenClaims.mockResolvedValue({ id: 2, user_type: 'ngo' })
    const request = new NextRequest('http://localhost/api/users?view=payment-history&role=received')
    const response = await GET(request)
    expect(response.status).toBe(200)
    expect(mocks.fetchUserPaymentHistory).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 2, role: 'received' })
    )
  })

  it('loads company sent history with numeric user id', async () => {
    mocks.getTokenClaims.mockResolvedValue({ id: 1, user_type: 'company' })
    const request = new NextRequest('http://localhost/api/users?view=payment-history&role=sent')
    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.total).toBe(1)
    expect(mocks.fetchUserPaymentHistory).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, userType: 'company', role: 'sent' })
    )
    expect(mocks.fetchCompanyCsrCapabilityFines).toHaveBeenCalledWith(1)
  })
})
