import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRuntimeServiceFlags, requiredServicesReady } from '@/lib/runtime-services'

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
})
