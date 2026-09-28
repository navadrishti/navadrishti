import { test, expect } from './fixtures'

type Campaign = { id: number | string; status?: string | null; company_id?: number | null }

test.describe('protected API routes reject anonymous requests', () => {
  const routes = [
    { method: 'GET', path: '/api/admin/overview' },
    { method: 'GET', path: '/api/admin/service-offers' },
    { method: 'POST', path: '/api/csr-agent/generate-campaigns' },
    { method: 'POST', path: '/api/service-requests/recommend' },
    { method: 'PATCH', path: '/api/profile/update' },
    { method: 'POST', path: '/api/profile/update' },
    { method: 'GET', path: '/api/profile/update?scope=payout' },
  ] as const

  for (const { method, path } of routes) {
    test(`${method} ${path} -> 401`, async ({ request }) => {
      const response = await request.fetch(path, {
        method,
        data: method === 'GET' ? undefined : {},
      })
      expect(response.status()).toBe(401)
    })
  }

  test('a forged bearer token is rejected', async ({ request }) => {
    const response = await request.get('/api/admin/overview', {
      headers: { Authorization: 'Bearer not.a.real.token' },
    })
    expect(response.status()).toBe(401)
  })
})

test('public NGO profile hides contact details from anonymous visitors', async ({ request }) => {
  const list = await request.get('/api/ngos/list?limit=5')
  expect(list.ok()).toBeTruthy()
  const { data } = (await list.json()) as { data: Array<{ id: number; email: string | null }> }

  for (const ngo of data) {
    expect(ngo.email, `NGO ${ngo.id} email in anonymous list`).toBeNull()
  }

  test.skip(data.length === 0, 'no public NGOs in this database')

  const response = await request.get(`/api/profile/${data[0].id}`)
  expect(response.ok()).toBeTruthy()
  const { profile } = (await response.json()) as {
    profile: { email: string | null; phone: string | null; profile_data: Record<string, unknown> }
  }

  expect(profile.email).toBeNull()
  expect(profile.phone).toBeNull()
  for (const key of Object.keys(profile.profile_data)) {
    expect(['bio', 'ca_badge_number', 'cover_image', 'website']).toContain(key)
  }
})

test('pages are served with security headers', async ({ request }) => {
  for (const path of ['/', '/login']) {
    const response = await request.get(path)
    const headers = response.headers()

    expect(headers['x-frame-options'], path).toBe('DENY')
    expect(headers['x-content-type-options'], path).toBe('nosniff')
    expect(headers['content-security-policy'], path).toContain("frame-ancestors 'none'")
    expect(headers['content-security-policy'], path).toContain("object-src 'none'")
    expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin')
    expect(headers['x-powered-by'], path).toBeUndefined()
  }
})

test.describe('draft campaigns stay hidden from anonymous visitors', () => {
  test('public campaign list has no drafts', async ({ request }) => {
    const response = await request.get('/api/campaigns')
    expect(response.ok()).toBeTruthy()
    const { data } = (await response.json()) as { data: Campaign[] }

    expect(data.filter((campaign) => campaign.status === 'draft')).toEqual([])
  })

  test('company-filtered campaign list has no drafts', async ({ request }) => {
    const list = await request.get('/api/campaigns')
    const { data } = (await list.json()) as { data: Campaign[] }
    const companyIds = [...new Set(data.map((campaign) => Number(campaign.company_id)).filter((id) => id > 0))]
    test.skip(companyIds.length === 0, 'no public campaigns in this database')

    for (const companyId of companyIds) {
      const response = await request.get(`/api/campaigns?company_id=${companyId}`)
      const body = (await response.json()) as { data?: Campaign[] }
      expect(
        (body.data ?? []).filter((campaign) => campaign.status === 'draft'),
        `drafts for company ${companyId}`
      ).toEqual([])
    }
  })
})
