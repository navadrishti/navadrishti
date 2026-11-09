import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  getCompanyCAFromRequest: vi.fn(),
  loadReport: vi.fn(),
}))

vi.mock('@/lib/db', async () => {
  const { supabaseFake: fake } = await import('./support/supabase-fake')
  return { supabase: fake.client, db: {} }
})

vi.mock('@/lib/server-auth', () => ({
  getCompanyCAFromRequest: mocks.getCompanyCAFromRequest,
  authErrorResponse: () => null,
}))

vi.mock('@/lib/csr-agent/load-project-ops-finance', () => ({
  loadCompanyCaProjectFinanceReport: mocks.loadReport,
}))

vi.mock('@/lib/company-ca', () => ({
  isCompanyCaAssignedToProject: vi.fn(async () => true),
}))

import { GET } from '@/app/api/evidence-verification/project-finance/[projectId]/route'
import { jsonRequest } from './support/requests'

const PROJECT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('Evidence Verifier project finance route', () => {
  beforeEach(() => {
    mocks.getCompanyCAFromRequest.mockReset()
    mocks.loadReport.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('requires Evidence Verifier auth', async () => {
    mocks.getCompanyCAFromRequest.mockRejectedValue(new Error('Evidence Verifier authentication required'))
    const res = await GET(jsonRequest('http://localhost/api/evidence-verification/project-finance/' + PROJECT), {
      params: Promise.resolve({ projectId: PROJECT }),
    })
    expect(res.status).toBe(401)
    expect(mocks.loadReport).not.toHaveBeenCalled()
  })

  it('scopes the report to the verifier company and hides other orgs', async () => {
    mocks.getCompanyCAFromRequest.mockResolvedValue({
      identity: { company_user_id: 40, id: 'ca-1' },
      user: { id: 99 },
    })
    mocks.loadReport.mockResolvedValue(null)
    const res = await GET(jsonRequest('http://localhost/api/evidence-verification/project-finance/' + PROJECT), {
      params: Promise.resolve({ projectId: PROJECT }),
    })
    expect(res.status).toBe(404)
    expect(mocks.loadReport).toHaveBeenCalledWith({ projectId: PROJECT, companyUserId: 40 })
  })

  it('returns the aggregated report for an in-scope project', async () => {
    mocks.getCompanyCAFromRequest.mockResolvedValue({
      identity: { company_user_id: 40, id: 'ca-1' },
      user: { id: 99 },
    })
    mocks.loadReport.mockResolvedValue({
      project_id: PROJECT,
      title: 'Demo',
      expenses: { actual_expenditure: 1000 },
    })
    const res = await GET(jsonRequest('http://localhost/api/evidence-verification/project-finance/' + PROJECT), {
      params: Promise.resolve({ projectId: PROJECT }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      success: true,
      data: { project_id: PROJECT, title: 'Demo' },
    })
  })
})
