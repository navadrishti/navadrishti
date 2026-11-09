import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { generateToken, type UserData } from '@/lib/auth'
import { resetRateLimits } from '@/lib/rate-limit'

const mocks = vi.hoisted(() => ({
  assembleCampaigns: vi.fn(),
  generateCampaigns: vi.fn(),
  liveUserType: 'company',
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/csr-agent/llm', () => {
  const generateCampaignsInputSchema = z.object({
    company_id: z.string().min(1).optional(),
    budget: z.number().positive(),
    milestones: z.number().int().min(1).max(10),
    category: z.string().min(1),
    city: z.string().min(1),
    state_province: z.string().min(1),
    start_date: z.string().min(1),
    end_date: z.string().min(1),
    beneficiaries: z.string().trim().optional(),
    volunteerRequirement: z.string().trim().optional(),
    milestone_info: z.array(z.any()).optional(),
    requirementDetails: z.string().trim().optional(),
  })

  return {
    generateCampaignsInputSchema,
    assembleCampaigns: mocks.assembleCampaigns,
    generateCampaigns: mocks.generateCampaigns,
    buildFallbackCampaigns: (input: unknown) => mocks.assembleCampaigns(input),
  }
})

vi.mock('@/lib/db', async () => {
  const { createSupabaseFake, eqValue } = await import('./support/supabase-fake')
  const fake = createSupabaseFake((query) => {
    if (query.table === 'users' && query.columns?.includes('account_status')) {
      return { data: { id: eqValue(query, 'id'), user_type: mocks.liveUserType, account_status: 'active', verification_status: 'verified', profile_data: {} } }
    }
    return { data: null }
  })
  return { supabase: { from: fake.from, rpc: vi.fn(async () => ({ data: null, error: { message: 'unavailable' } })) }, db: {} }
})

vi.mock('@/lib/auth-store', () => ({
  authStoreAvailable: () => false,
  switchToMemoryIfMissing: () => true,
}))

import { resolveOwnedCompanyId } from '@/lib/csr-agent/generate-access'
import { POST } from '@/app/api/csr-agent/generate-campaigns/route'

const company: UserData = {
  id: 42,
  email: 'co@example.org',
  name: 'Co',
  user_type: 'company',
  verification_status: 'verified',
  email_verified: true,
  phone_verified: false,
}

const other: UserData = { ...company, id: 99, email: 'other@example.org' }

const validBody = {
  budget: 100000,
  milestones: 2,
  category: 'Education',
  city: 'Mumbai',
  state_province: 'MH',
  start_date: '2026-01-01',
  end_date: '2026-06-30',
  requirementDetails: 'School kits',
}

function request(body: unknown, user?: UserData | null) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (user) headers.authorization = `Bearer ${generateToken(user)}`
  return new NextRequest('http://localhost/api/csr-agent/generate-campaigns', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  mocks.liveUserType = 'company'
  vi.stubEnv('JWT_SECRET', process.env.JWT_SECRET || 'test-secret-key-at-least-32-characters-long')
  vi.stubEnv('NODE_ENV', 'test')
  resetRateLimits()
  mocks.assembleCampaigns.mockReset().mockReturnValue([
    {
      title: 'Draft',
      description: 'd',
      category: 'Education',
      location: 'Mumbai, MH',
      budget_inr: 100000,
      budget_breakdown: { infrastructure: 0, training: 0, materials: 0, monitoring: 0, contingency: 0 },
      schedule_vii: 'ii',
      sdg_alignment: [4],
      start_date: '2026-01-01',
      end_date: '2026-06-30',
      impact_metrics: { beneficiaries: 10, duration: '2026-01-01 to 2026-06-30' },
      milestones: [],
    },
  ])
  mocks.generateCampaigns
    .mockReset()
    .mockImplementation(async (input: unknown) => mocks.assembleCampaigns(input))
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('resolveOwnedCompanyId', () => {
  it('binds missing company_id to the session company', () => {
    expect(resolveOwnedCompanyId(company, undefined)).toEqual({ ok: true, companyId: '42' })
  })

  it('accepts a matching company_id', () => {
    expect(resolveOwnedCompanyId(company, '42')).toEqual({ ok: true, companyId: '42' })
  })

  it('rejects a tampered foreign company_id', () => {
    expect(resolveOwnedCompanyId(company, '99')).toMatchObject({ ok: false, status: 403 })
  })

  it('rejects non-company actors', () => {
    expect(resolveOwnedCompanyId({ ...company, user_type: 'ngo' }, '42')).toMatchObject({
      ok: false,
      status: 403,
    })
  })
})

describe('POST /api/csr-agent/generate-campaigns ownership', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await POST(request(validBody, null))
    expect(res.status).toBe(401)
    expect(mocks.assembleCampaigns).not.toHaveBeenCalled()
  })

  it('rejects unauthorized user types', async () => {
    mocks.liveUserType = 'ngo'
    const res = await POST(request(validBody, { ...company, user_type: 'ngo' }))
    expect(res.status).toBe(403)
    expect(mocks.assembleCampaigns).not.toHaveBeenCalled()
  })

  it('allows a valid company request and rebinds company_id', async () => {
    const res = await POST(request({ ...validBody, company_id: '42' }, company))
    expect(res.status).toBe(200)
    expect(mocks.assembleCampaigns).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: '42', budget: 100000 })
    )
  })

  it('marks fallback drafts as degraded when Gemini is unavailable', async () => {
    mocks.generateCampaigns.mockRejectedValue(new Error('Campaign drafting is currently unavailable.'))

    const res = await POST(request(validBody, company))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toMatchObject({
      success: true,
      degraded: true,
      warning: expect.stringMatching(/fallback drafts/i),
      data: expect.any(Array),
    })
    expect(mocks.generateCampaigns).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: '42', budget: 100000 })
    )
    expect(mocks.assembleCampaigns).toHaveBeenCalledTimes(1)
  })

  it('does not convert unexpected generation errors into fallback success', async () => {
    mocks.generateCampaigns.mockRejectedValue(new Error('unexpected internal failure'))

    const res = await POST(request(validBody, company))
    const json = await res.json()

    expect(res.status).toBe(502)
    expect(json).toMatchObject({ success: false })
    expect(mocks.assembleCampaigns).not.toHaveBeenCalled()
  })

  it('denies cross-company company_id tampering', async () => {
    const res = await POST(request({ ...validBody, company_id: String(other.id) }, company))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toMatch(/company_id/i)
    expect(mocks.assembleCampaigns).not.toHaveBeenCalled()
  })

  it('enforces per-company abuse rate limits', async () => {
    vi.stubEnv('CSR_AGENT_GENERATE_ABUSE_LIMIT', '2')
    vi.stubEnv('CSR_AGENT_GENERATE_ABUSE_WINDOW_MS', '60000')
    expect((await POST(request(validBody, company))).status).toBe(200)
    expect((await POST(request(validBody, company))).status).toBe(200)
    const limited = await POST(request(validBody, company))
    expect(limited.status).toBe(429)
  })

  it('fails closed for CSR abuse limits outside test when the shared store is missing', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('CSR_AGENT_GENERATE_ALLOW_MEMORY_LIMIT', '0')
    const blocked = await POST(request(validBody, company))
    expect(blocked.status).toBe(429)
    expect(mocks.assembleCampaigns).not.toHaveBeenCalled()
  })
})
