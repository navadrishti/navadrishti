import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertProductionConfig,
  assertPublishableKey,
  assertSecretKey,
  getRuntimeServiceFlags,
  productionConfigIssues,
  requiredServicesReady,
  supabaseKeyKind,
} from '@/lib/runtime-services'

function jwtKey(role: string) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ role })).toString('base64url')
  return `${header}.${payload}.sig`
}

function stubProductionEnv(overrides: Record<string, string> = {}) {
  const base: Record<string, string> = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwtKey('anon'),
    SUPABASE_SECRET_KEY: jwtKey('service_role'),
    JWT_SECRET: 'a-production-jwt-secret-that-is-long-enough',
    ADMIN_USERNAME: 'navadrishti-admin',
    ADMIN_PASSWORD: 'not-a-weak-pass',
    NEXT_PUBLIC_APP_URL: 'https://app.navadrishti.in',
    CRON_SECRET: 'cron-secret-value',
    CLOUDINARY_CLOUD_NAME: 'navadrishti',
    CLOUDINARY_API_KEY: 'cloud-key',
    CLOUDINARY_API_SECRET: 'cloud-secret',
    NEXT_PUBLIC_RAZORPAY_KEY_ID: 'rzp_live_abc123',
    RAZORPAY_KEY_SECRET: 'rzp-secret',
    RAZORPAY_WEBHOOK_SECRET: 'whsec',
    ...overrides,
  }
  for (const [key, value] of Object.entries(base)) vi.stubEnv(key, value)
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getRuntimeServiceFlags', () => {
  it('reports unset services as false without reading secret values', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '')
    vi.stubEnv('SUPABASE_SECRET_KEY', '')
    vi.stubEnv('JWT_SECRET', '')
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', '')
    vi.stubEnv('CLOUDINARY_API_KEY', '')
    vi.stubEnv('CLOUDINARY_API_SECRET', '')
    vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', '')
    vi.stubEnv('RAZORPAY_KEY_SECRET', '')
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', '')
    vi.stubEnv('CRON_SECRET', '')
    vi.stubEnv('GEMINI_API_KEY', '')
    vi.stubEnv('DELHIVERY_API_TOKEN', '')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    vi.stubEnv('APP_URL', '')

    const flags = getRuntimeServiceFlags()
    expect(flags).toEqual({
      supabase: false,
      jwt: false,
      uploads: false,
      payments: false,
      webhook: false,
      cron: false,
      ocr: false,
      shipping: false,
      app_url: false,
      admin: false,
    })
    expect(requiredServicesReady(flags)).toBe(false)
  })

  it('treats whitespace-only values as missing', () => {
    vi.stubEnv('JWT_SECRET', '   ')
    expect(getRuntimeServiceFlags().jwt).toBe(false)
  })

  it('marks core services ready when supabase and jwt are set', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'pub')
    vi.stubEnv('SUPABASE_SECRET_KEY', 'secret')
    vi.stubEnv('JWT_SECRET', 'jwt-secret-at-least-32-characters-long')
    expect(requiredServicesReady(getRuntimeServiceFlags())).toBe(true)
  })

  it('requires marketplace secrets in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'pub')
    vi.stubEnv('SUPABASE_SECRET_KEY', 'secret')
    vi.stubEnv('JWT_SECRET', 'jwt-secret-at-least-32-characters-long')
    expect(requiredServicesReady(getRuntimeServiceFlags())).toBe(false)
  })
})

describe('supabase key kinds', () => {
  it('classifies legacy JWTs and new key prefixes', () => {
    expect(supabaseKeyKind(jwtKey('anon'))).toBe('publishable')
    expect(supabaseKeyKind(jwtKey('service_role'))).toBe('secret')
    expect(supabaseKeyKind('sb_publishable_abc')).toBe('publishable')
    expect(supabaseKeyKind('sb_secret_abc')).toBe('secret')
    expect(supabaseKeyKind('not-a-key')).toBe('unknown')
  })

  it('refuses a service-role key in the browser client', () => {
    expect(() => assertPublishableKey(jwtKey('service_role'))).toThrow(/secret key/)
    expect(() => assertPublishableKey(jwtKey('anon'))).not.toThrow()
  })

  it('rejects a publishable key as the server secret', () => {
    expect(() => assertSecretKey('https://db.example.supabase.co', jwtKey('anon'), { live: true })).toThrow(
      /publishable key/
    )
    expect(() => assertSecretKey('https://db.example.supabase.co', 'secret-key')).not.toThrow()
  })
})

describe('productionConfigIssues', () => {
  it('is empty when live keys are correctly typed', () => {
    stubProductionEnv()
    expect(productionConfigIssues()).toEqual([])
  })

  it('rejects swapped supabase keys', () => {
    stubProductionEnv({
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwtKey('service_role'),
      SUPABASE_SECRET_KEY: jwtKey('anon'),
    })
    expect(productionConfigIssues().join('\n')).toMatch(/secret key/)
    expect(productionConfigIssues().join('\n')).toMatch(/publishable key/)
  })

  it('rejects placeholder jwt and localhost app url', () => {
    stubProductionEnv({
      JWT_SECRET: 'your_jwt_secret_here_at_least_32_characters_long',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    })
    const issues = productionConfigIssues()
    expect(issues.some((issue) => issue.includes('JWT_SECRET'))).toBe(true)
    expect(issues.some((issue) => issue.includes('NEXT_PUBLIC_APP_URL'))).toBe(true)
  })

  it('rejects Razorpay test keys on Vercel production', () => {
    stubProductionEnv({ NEXT_PUBLIC_RAZORPAY_KEY_ID: 'rzp_test_abc' })
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(productionConfigIssues().join('\n')).toMatch(/test key/)
  })

  it('does not throw under vitest even with empty env', () => {
    expect(() => assertProductionConfig()).not.toThrow()
  })
})
