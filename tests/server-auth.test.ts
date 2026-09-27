import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'
import { findAuthUser, getAdminUser } from '@/lib/server-auth'

vi.mock('@/lib/db', () => ({ supabase: {}, db: {} }))

const userToken = jwt.sign({ id: 12, email: 'ngo@example.org', user_type: 'ngo' }, 'test-secret')
const adminToken = jwt.sign({ id: -1, email: 'admin@system.local', user_type: 'admin' }, 'test-secret')

function buildRequest(options: { header?: string; cookies?: Record<string, string> } = {}) {
  const headers: Record<string, string> = {}
  if (options.header) headers.authorization = options.header
  if (options.cookies) {
    headers.cookie = Object.entries(options.cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')
  }
  return new NextRequest('http://localhost/api/test', { headers })
}

describe('findAuthUser', () => {
  it('reads the user from a bearer token', () => {
    expect(findAuthUser(buildRequest({ header: `Bearer ${userToken}` }))).toMatchObject({ id: 12, user_type: 'ngo' })
  })

  it('ignores the session cookie unless allowCookie is set', () => {
    const request = buildRequest({ cookies: { token: userToken } })
    expect(findAuthUser(request)).toBeNull()
    expect(findAuthUser(request, { allowCookie: true })).toMatchObject({ id: 12 })
  })

  it('returns null for forged or missing tokens', () => {
    const forged = jwt.sign({ id: 12, email: 'ngo@example.org' }, 'other-secret')
    expect(findAuthUser(buildRequest({ header: `Bearer ${forged}` }))).toBeNull()
    expect(findAuthUser(buildRequest())).toBeNull()
  })
})

describe('getAdminUser', () => {
  it('accepts the admin cookie', () => {
    expect(getAdminUser(buildRequest({ cookies: { 'admin-token': adminToken } }))).toMatchObject({ id: -1 })
  })

  it('rejects a regular user token even when sent as the admin cookie', () => {
    expect(getAdminUser(buildRequest({ cookies: { 'admin-token': userToken } }))).toBeNull()
    expect(getAdminUser(buildRequest({ header: `Bearer ${userToken}` }))).toBeNull()
  })
})
