import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')

function read(file: string) {
  return fs.readFileSync(path.join(root, file), 'utf8')
}

function routeFiles(dir = 'app/api', files: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) routeFiles(rel, files)
    else if (entry.name === 'route.ts') files.push(rel)
  }
  return files
}

const routeName = (file: string) => file.replace(/^app\/api\//, '').replace(/\/route\.ts$/, '')

const AUTH_PATTERN = new RegExp(
  `\\b(${[
    'getAuthUserFromRequest',
    'findAuthUser',
    'assertUserType',
    'getAdminUser',
    'assertAdminUser',
    'getCompanyCAFromRequest',
    'getCAFromRequest',
    'isCARequest',
    'requireCA',
    'getPlatformCAFromRequest',
    'assertGovernmentAdmin',
    'getGovernmentAdminFromRequest',
    'getEvidenceApproverContext',
    'getTokenClaims',
    'withAuth',
  ].join('|')})\\b`
)

const PUBLIC_ROUTES = new Set([
  'admin/auth',
  'admin/logout',
  'auth/forgot-password',
  'auth/login',
  'auth/logout',
  'auth/prepare-email-otp',
  'auth/reset-password',
  'auth/signup',
  'auth/verify-reset-token',
  'ca/auth',
  'ca/auth/logout',
  'evidence-verification/auth',
  'evidence-verification/logout',
  'government-admin/auth',
  'government-admin/logout',
  'health',
  'platform-newsletter',
  'pwa/[...path]',
  'search/profiles',
])

const SECRET_GUARDED_ROUTES = new Map([
  ['webhooks/razorpay', /x-razorpay-signature/],
  ['cron/daily-cleanup', /CRON_SECRET/],
])

const routes = routeFiles()

describe('api route inventory', () => {
  it('finds the route files', () => {
    expect(routes.length).toBeGreaterThan(100)
  })

  it('protects every route that is not explicitly public', () => {
    const unprotected = routes
      .filter((file) => !AUTH_PATTERN.test(read(file)))
      .map(routeName)
      .filter((route) => !PUBLIC_ROUTES.has(route) && !SECRET_GUARDED_ROUTES.has(route))
    expect(unprotected).toEqual([])
  })

  it('keeps the allowlists free of stale or already protected entries', () => {
    const names = new Set(routes.map(routeName))
    for (const route of [...PUBLIC_ROUTES, ...SECRET_GUARDED_ROUTES.keys()]) {
      expect(names.has(route), route).toBe(true)
      expect(AUTH_PATTERN.test(read(`app/api/${route}/route.ts`)), route).toBe(false)
    }
  })

  it.each([...SECRET_GUARDED_ROUTES])('%s checks its shared secret', (route, pattern) => {
    expect(read(`app/api/${route}/route.ts`)).toMatch(pattern)
  })
})

describe('public routes', () => {
  it('public profile does not expose Aadhaar or PAN numbers', () => {
    expect(read('app/api/profile/[userId]/route.ts')).not.toMatch(/aadhaar_number|pan_number/)
  })
})

describe('razorpay webhook', () => {
  const source = read('app/api/webhooks/razorpay/route.ts')

  it('verifies an HMAC signature with a constant-time compare', () => {
    expect(source).toMatch(/createHmac\('sha256', secret\)/)
    expect(source).toContain('timingSafeEqual')
    expect(source).toContain('RAZORPAY_WEBHOOK_SECRET')
  })

  it('verifies the signature over the raw body before parsing or touching the db', () => {
    const verified = source.indexOf('if (!verifyWebhookSignature(rawBody')
    expect(verified).toBeGreaterThan(source.indexOf('await request.text()'))
    expect(verified).toBeLessThan(source.indexOf('JSON.parse(rawBody)'))
    expect(verified).toBeLessThan(source.indexOf('await supabase', source.indexOf('export async function POST')))
  })
})

describe('cron cleanup', () => {
  it('checks the cron secret before touching the db', () => {
    const source = read('app/api/cron/daily-cleanup/route.ts')
    const handler = source.indexOf('export async function GET')
    expect(source.indexOf('CRON_SECRET', handler)).toBeLessThan(source.indexOf('await supabase', handler))
    expect(source).toMatch(/cronSecret\s*\?\s*providedSecret === cronSecret\s*:\s*process\.env\.NODE_ENV === 'development'/)
  })
})

describe('route logging', () => {
  it('never logs environment variables or credential values', () => {
    const problems: string[] = []
    for (const file of routes) {
      const source = read(file)
      if (/console\.\w+\([^\n]*process\.env/.test(source)) problems.push(`${file}: logs process.env`)
      if (/console\.\w+\([^\n]*[,(]\s*(password|newPassword|currentPassword|token|otp|secret|webhookSecret|cronSecret)\s*[,)]/.test(source)) {
        problems.push(`${file}: logs a credential`)
      }
    }
    expect(problems).toEqual([])
  })

  it('never returns secret environment variables in responses', () => {
    const leaks = routes.filter((file) =>
      /Response\.json\(\s*\{[^}]*process\.env\.(?!NEXT_PUBLIC_)[A-Z0-9_]*(SECRET|KEY|PASSWORD|TOKEN)/.test(read(file))
    )
    expect(leaks).toEqual([])
  })
})
