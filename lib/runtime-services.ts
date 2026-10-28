const PLACEHOLDER = /your_|changeme|replace.?me|example|xxxxxxxx/i

function present(key: string) {
  return Boolean(String(process.env[key] || '').trim())
}

function env(key: string) {
  return String(process.env[key] || '').trim()
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const json =
      typeof Buffer === 'undefined'
        ? globalThis.atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8')
    const payload = JSON.parse(json)
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function supabaseKeyKind(key: string): 'publishable' | 'secret' | 'unknown' {
  const value = String(key || '').trim()
  if (!value) return 'unknown'
  if (value.startsWith('sb_publishable_') || value.startsWith('sb_anon_')) return 'publishable'
  if (value.startsWith('sb_secret_') || value.startsWith('sb_service_')) return 'secret'
  const role = decodeJwtPayload(value)?.role
  if (role === 'anon') return 'publishable'
  if (role === 'service_role') return 'secret'
  return 'unknown'
}

export function isProductionRuntime() {
  if (process.env.VITEST) return false
  if (process.env.NEXT_PHASE === 'phase-production-build') return false
  if (process.env.NODE_ENV !== 'production') return false
  return process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview' || !process.env.CI
}

export function assertPublishableKey(key: string) {
  if (supabaseKeyKind(key) === 'secret') {
    throw new Error('Refusing to create a browser Supabase client with the secret key.')
  }
}

export function assertSecretKey(url: string, secretKey: string, options: { live?: boolean } = {}) {
  if (!(options.live ?? isProductionRuntime())) return
  if (!String(url || '').trim() || !String(secretKey || '').trim()) {
    throw new Error('Production requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.')
  }
  if (supabaseKeyKind(secretKey) === 'publishable') {
    throw new Error('SUPABASE_SECRET_KEY is a publishable key. Use the project secret key on the server.')
  }
}

export type RuntimeServiceFlags = {
  supabase: boolean
  jwt: boolean
  uploads: boolean
  payments: boolean
  webhook: boolean
  cron: boolean
  ocr: boolean
  shipping: boolean
  app_url: boolean
  admin: boolean
}

export function getRuntimeServiceFlags(): RuntimeServiceFlags {
  return {
    supabase:
      present('NEXT_PUBLIC_SUPABASE_URL') &&
      present('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') &&
      present('SUPABASE_SECRET_KEY'),
    jwt: present('JWT_SECRET'),
    uploads:
      present('CLOUDINARY_CLOUD_NAME') &&
      present('CLOUDINARY_API_KEY') &&
      present('CLOUDINARY_API_SECRET'),
    payments: present('NEXT_PUBLIC_RAZORPAY_KEY_ID') && present('RAZORPAY_KEY_SECRET'),
    webhook: present('RAZORPAY_WEBHOOK_SECRET'),
    cron: present('CRON_SECRET'),
    ocr: present('GEMINI_API_KEY'),
    shipping: present('DELHIVERY_API_TOKEN'),
    app_url: present('NEXT_PUBLIC_APP_URL') || present('APP_URL'),
    admin: present('ADMIN_USERNAME') && present('ADMIN_PASSWORD'),
  }
}

export function requiredServicesReady(flags: RuntimeServiceFlags) {
  if (process.env.NODE_ENV === 'production') {
    return flags.supabase && flags.jwt && flags.uploads && flags.payments && flags.webhook && flags.cron && flags.app_url && flags.admin
  }
  return flags.supabase && flags.jwt
}

function requireValue(key: string, issues: string[]) {
  const value = env(key)
  if (!value || PLACEHOLDER.test(value)) issues.push(`${key} is missing or still a placeholder`)
  return value
}

function requireHttpsUrl(key: string, issues: string[]) {
  const value = requireValue(key, issues)
  if (!value) return
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') issues.push(`${key} must be https in production`)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      issues.push(`${key} must not be localhost in production`)
    }
  } catch {
    issues.push(`${key} is not a valid URL`)
  }
}

export function productionConfigIssues(): string[] {
  const issues: string[] = []
  requireHttpsUrl('NEXT_PUBLIC_SUPABASE_URL', issues)
  const publishable = requireValue('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', issues)
  const secret = requireValue('SUPABASE_SECRET_KEY', issues)

  if (publishable) {
    const kind = supabaseKeyKind(publishable)
    if (kind === 'secret') issues.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is the secret key')
    else if (kind === 'unknown') issues.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not a publishable/anon key')
  }
  if (secret) {
    const kind = supabaseKeyKind(secret)
    if (kind === 'publishable') issues.push('SUPABASE_SECRET_KEY is a publishable key')
    else if (kind === 'unknown') issues.push('SUPABASE_SECRET_KEY is not a service-role/secret key')
  }
  if (publishable && secret && publishable === secret) {
    issues.push('Publishable and secret Supabase keys must be different')
  }

  const jwt = requireValue('JWT_SECRET', issues)
  if (jwt && jwt.length < 32) issues.push('JWT_SECRET must be at least 32 characters')

  requireValue('ADMIN_USERNAME', issues)
  const adminPassword = requireValue('ADMIN_PASSWORD', issues)
  if (adminPassword && adminPassword.length < 12) issues.push('ADMIN_PASSWORD must be at least 12 characters')
  if (adminPassword && adminPassword.toLowerCase() === 'admin') issues.push('ADMIN_PASSWORD must not be "admin"')

  requireHttpsUrl('NEXT_PUBLIC_APP_URL', issues)
  requireValue('CRON_SECRET', issues)
  requireValue('CLOUDINARY_CLOUD_NAME', issues)
  requireValue('CLOUDINARY_API_KEY', issues)
  requireValue('CLOUDINARY_API_SECRET', issues)
  requireValue('NEXT_PUBLIC_RAZORPAY_KEY_ID', issues)
  requireValue('RAZORPAY_KEY_SECRET', issues)
  requireValue('RAZORPAY_WEBHOOK_SECRET', issues)

  const razorpayKey = env('NEXT_PUBLIC_RAZORPAY_KEY_ID')
  if (process.env.VERCEL_ENV === 'production' && razorpayKey.startsWith('rzp_test_')) {
    issues.push('NEXT_PUBLIC_RAZORPAY_KEY_ID is a test key; use the live key for production')
  }

  return issues
}

export function assertProductionConfig() {
  if (!isProductionRuntime()) return
  const issues = productionConfigIssues()
  if (issues.length === 0) return
  throw new Error(`Production configuration is incomplete:\n- ${issues.join('\n- ')}`)
}
