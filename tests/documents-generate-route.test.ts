import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/documents/generate/route'
import { jsonRequest, tokenFor } from './support/requests'
import { supabaseFake } from './support/supabase-fake'
import { resetDb, respond } from './support/documents-fixtures'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', async () => {
  const { supabaseFake: fake } = await import('./support/supabase-fake')
  return { supabase: fake.client }
})

const URL = 'http://localhost/api/documents/generate'
const company = tokenFor(3, 'company')
const rival = tokenFor(40, 'company')
const ngo = tokenFor(12, 'ngo')

async function send(body: unknown, token?: string) {
  const response = await POST(jsonRequest(URL, { token, body }))
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

beforeEach(() => {
  supabaseFake.reset()
  supabaseFake.respondWith(respond)
  resetDb()
})

describe('POST /api/documents/generate', () => {
  it.each([
    ['no token', undefined, 401],
    ['an individual', tokenFor(5, 'individual'), 403],
  ])('rejects %s', async (_label, token, status) => {
    expect((await send({ documentType: 'impact_report' }, token)).status).toBe(status)
  })

  it.each([
    [{ documentType: 'board_minutes' }],
    [{}],
    [null],
    [{ documentType: 'impact_report', period: 'weekly' }],
    [{ documentType: 'impact_report', campaignId: '' }],
  ])('rejects invalid body %o', async (payload) => {
    const { status, body } = await send(payload, company)
    expect(status).toBe(400)
    expect(typeof body.error).toBe('string')
    expect(supabaseFake.queries).toHaveLength(0)
  })

  it.each([
    [ngo, 'csr_compliance_profile', 'This document type is available to companies only'],
    [ngo, 'board_csr_annexure_draft', 'This document type is available to companies only'],
    [company, 'ngo_compliance_pack', 'This document type is available to NGOs only'],
    [company, 'implementing_agency_report', 'This document type is available to NGOs only'],
  ])('%#: blocks %s', async (token, documentType, error) => {
    const { status, body } = await send({ documentType }, token)
    expect(status).toBe(403)
    expect(body.error).toBe(error)
  })

  it('returns the generated document', async () => {
    const { status, body } = await send({ documentType: 'csr_compliance_profile' }, company)
    expect(status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      documentType: 'csr_compliance_profile',
      filename: 'acme-industries-csr-compliance-profile.html',
      label: 'CSR Compliance Profile',
    })
    expect(body.entityTitle).toBeUndefined()
    expect(String(body.html)).toContain('<!DOCTYPE html>')
  })

  it('includes the entity title for impact reports', async () => {
    const { status, body } = await send({ documentType: 'impact_report', campaignId: 'c1', period: 'quarterly' }, company)
    expect(status).toBe(200)
    expect(body.entityTitle).toBe('Clean Water & Sanitation')
    expect(body.label).toBe('Quarterly Impact Report')
  })

  it.each([
    [rival, { documentType: 'impact_report', campaignId: 'c1' }, 'Campaign not found or not owned by this company'],
    [rival, { documentType: 'utilization_certificate', projectId: 'p1' }, 'Project not owned by this company'],
    [tokenFor(13, 'ngo'), { documentType: 'utilization_certificate', campaignId: 'c1' }, 'Campaign is not assigned to this NGO as lead'],
    [company, { documentType: 'impact_report' }, 'Select a campaign for the impact report'],
  ])('%#: refuses documents for other organizations', async (token, payload, error) => {
    const { status, body } = await send(payload, token)
    expect(status).toBe(400)
    expect(body.error).toBe(error)
  })

  it('returns 500 for unexpected failures', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { status, body } = await send({ documentType: 'csr_policy_document' }, tokenFor(999, 'company'))
    expect(status).toBe(500)
    expect(body.error).toBe('Unable to load organization profile')
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
