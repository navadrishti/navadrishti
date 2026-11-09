import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => vi.resetModules())

function request() {
  const token = jwt.sign({ id: 12, email: 'employee@example.test', user_type: 'company' }, 'test-secret')
  return new NextRequest('http://localhost/api/campaigns', { headers: { cookie: `token=${token}` } })
}

describe('authoritative session overlay', () => {
  it('rejects a valid token when the authorization overlay is not registered', async () => {
    const { getTokenClaims, withAuth } = await import('@/lib/auth/session')
    await expect(getTokenClaims(request())).rejects.toMatchObject({ status: 503 })
    const handler = vi.fn(() => Response.json({ ok: true }))
    const response = await withAuth(handler)(request())
    expect(response.status).toBe(503)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not restore claims when the overlay rejects the account', async () => {
    const { AuthError, getTokenClaims, setLiveUserTypeOverlay, withAuth } = await import('@/lib/auth/session')
    setLiveUserTypeOverlay(async () => { throw new AuthError('Account unavailable', 403) })
    await expect(getTokenClaims(request())).rejects.toMatchObject({ status: 403 })
    const response = await withAuth(() => Response.json({ ok: true }))(request())
    expect(response.status).toBe(403)
  })

  it('maps unexpected overlay failures to a temporary authorization error', async () => {
    const { getTokenClaims, setLiveUserTypeOverlay, withAuth } = await import('@/lib/auth/session')
    setLiveUserTypeOverlay(async () => { throw new Error('test failure') })
    await expect(getTokenClaims(request())).rejects.toMatchObject({ status: 503 })
    const response = await withAuth(() => Response.json({ ok: true }))(request())
    expect(response.status).toBe(503)
    expect(response.headers.get('set-cookie')).toBeNull()
  })
})
