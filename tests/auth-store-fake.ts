export type AuthStoreRpcCall = { fn: string; args: Record<string, unknown> }

type CodeRow = {
  purpose: string
  subject: string
  user_id: number | null
  code_hash: string
  expires_at: number
  attempts: number
  consumed_at: number | null
  created_at: number
}

// Mirrors the Args of the auth_* entries in lib/database.types.ts.
type Args = {
  p_key: string
  p_limit: number
  p_window_seconds: number
  p_purpose: string
  p_subject: string
  p_code_hash: string
  p_ttl_seconds: number
  p_resend_seconds?: number
  p_user_id?: number | null
  p_max_attempts: number
}

type RpcResult = { data: unknown; error: { code: string; message: string } | null }

export const missingAuthStoreRpc = async (fn: string): Promise<RpcResult> => ({
  data: null,
  error: { code: 'PGRST202', message: `Could not find the function public.${fn} in the schema cache` },
})

/** In-memory stand-in for the auth_throttle_store SQL functions, following the migration's semantics. */
export function createAuthStoreFake() {
  const hits = new Map<string, number[]>()
  const codes = new Map<string, CodeRow>()
  const calls: AuthStoreRpcCall[] = []
  const ok = (data: unknown): RpcResult => ({ data, error: null })

  const handlers: Record<string, (args: Args) => RpcResult> = {
    auth_rate_limit_hit: ({ p_key, p_limit, p_window_seconds }) => {
      const now = Date.now()
      const windowMs = p_window_seconds * 1000
      const live = (hits.get(p_key) ?? []).filter((at) => at > now - windowMs)
      if (live.length >= p_limit) {
        hits.set(p_key, live)
        const retry = Math.max(1, Math.ceil((live[0] + windowMs - now) / 1000))
        return ok([{ allowed: false, remaining: 0, retry_after_seconds: retry }])
      }
      live.push(now)
      hits.set(p_key, live)
      return ok([{ allowed: true, remaining: p_limit - live.length, retry_after_seconds: 0 }])
    },
    auth_code_issue: ({ p_purpose, p_subject, p_code_hash, p_ttl_seconds, p_resend_seconds = 0, p_user_id = null }) => {
      const now = Date.now()
      const key = `${p_purpose}:${p_subject}`
      const existing = codes.get(key)
      const resendMs = p_resend_seconds * 1000
      if (existing && existing.consumed_at === null && existing.expires_at > now && existing.created_at > now - resendMs) {
        return ok([{ issued: false, retry_after_seconds: Math.max(1, Math.ceil((existing.created_at + resendMs - now) / 1000)) }])
      }
      codes.set(key, {
        purpose: p_purpose,
        subject: p_subject,
        user_id: p_user_id,
        code_hash: p_code_hash,
        expires_at: now + p_ttl_seconds * 1000,
        attempts: 0,
        consumed_at: null,
        created_at: now,
      })
      return ok([{ issued: true, retry_after_seconds: 0 }])
    },
    auth_code_attempt: ({ p_purpose, p_subject, p_code_hash, p_max_attempts }) => {
      const key = `${p_purpose}:${p_subject}`
      const row = codes.get(key)
      if (!row || row.consumed_at !== null) return ok([{ status: 'missing', attempts: 0, user_id: null }])
      if (row.expires_at <= Date.now()) {
        codes.delete(key)
        return ok([{ status: 'expired', attempts: row.attempts, user_id: row.user_id }])
      }
      if (row.code_hash === p_code_hash) {
        row.consumed_at = Date.now()
        return ok([{ status: 'ok', attempts: row.attempts, user_id: row.user_id }])
      }
      row.attempts += 1
      if (row.attempts >= p_max_attempts) {
        codes.delete(key)
        return ok([{ status: 'locked', attempts: row.attempts, user_id: row.user_id }])
      }
      return ok([{ status: 'invalid', attempts: row.attempts, user_id: row.user_id }])
    },
    auth_code_find: ({ p_purpose, p_code_hash }) => {
      const row = [...codes.values()].find(
        (code) => code.purpose === p_purpose && code.code_hash === p_code_hash && code.consumed_at === null
      )
      return ok(row ? [{ subject: row.subject, user_id: row.user_id, expires_at: new Date(row.expires_at).toISOString() }] : [])
    },
    auth_code_consume: ({ p_purpose, p_subject, p_code_hash }) => {
      const row = codes.get(`${p_purpose}:${p_subject}`)
      if (!row || row.code_hash !== p_code_hash || row.consumed_at !== null) return ok(false)
      row.consumed_at = Date.now()
      return ok(row.expires_at > Date.now())
    },
    auth_throttle_cleanup: () => ok(0),
  }

  const rpc = async (fn: string, args: Record<string, unknown> = {}): Promise<RpcResult> => {
    calls.push({ fn, args })
    const handler = handlers[fn]
    return handler ? handler(args as Args) : missingAuthStoreRpc(fn)
  }

  return { rpc, calls, codes, hits }
}
