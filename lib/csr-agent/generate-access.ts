import { rateLimit, rateLimitedResponse } from '@/lib/rate-limit'
import type { UserData } from '@/lib/auth'

/**
 * Abuse-protection limits for Catalyst generative milestone suggestions
 * (and related CSR agent generate endpoints).
 * These are NOT product quota / pricing tiers — those remain undefined.
 * Configure via env; defaults are conservative anti-abuse ceilings.
 */
export function csrGenerateAbuseLimitOptions() {
  const limit = Number(process.env.CSR_AGENT_GENERATE_ABUSE_LIMIT || 30)
  const windowMs = Number(process.env.CSR_AGENT_GENERATE_ABUSE_WINDOW_MS || 60 * 60 * 1000)
  return {
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 30,
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? Math.floor(windowMs) : 60 * 60 * 1000,
  }
}

/** Bind generation to the authenticated company. Reject client-supplied foreign company_id. */
export function resolveOwnedCompanyId(
  user: UserData,
  clientCompanyId: unknown
): { ok: true; companyId: string } | { ok: false; status: 400 | 403; error: string } {
  if (user.user_type !== 'company') {
    return { ok: false, status: 403, error: 'Only companies can generate campaigns' }
  }

  const sessionCompanyId = String(user.id)
  if (clientCompanyId === undefined || clientCompanyId === null || clientCompanyId === '') {
    return { ok: true, companyId: sessionCompanyId }
  }

  const provided = String(clientCompanyId).trim()
  if (!provided) {
    return { ok: true, companyId: sessionCompanyId }
  }

  if (provided !== sessionCompanyId) {
    return {
      ok: false,
      status: 403,
      error: 'company_id does not match the authenticated company',
    }
  }

  return { ok: true, companyId: sessionCompanyId }
}

export async function enforceCsrGenerateAbuseLimit(userId: number) {
  const options = csrGenerateAbuseLimitOptions()
  // Abuse ceilings must be shared across instances. Outside automated tests,
  // never fall open to per-process memory (that would multiply the limit by
  // instance count). Product entitlement quota remains a separate, undefined policy.
  // Local-only escape: CSR_AGENT_GENERATE_ALLOW_MEMORY_LIMIT=1 (never for multi-instance).
  const failClosed =
    process.env.NODE_ENV !== 'test' &&
    process.env.CSR_AGENT_GENERATE_ALLOW_MEMORY_LIMIT !== '1'
  const result = await rateLimit(`csr-agent-generate:user:${userId}`, {
    ...options,
    failClosed,
  })
  if (result.allowed) return null
  return rateLimitedResponse(
    result.retryAfterSeconds,
    'Catalyst suggestion rate limit exceeded. Please try again later.'
  )
}
