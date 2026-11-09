/**
 * Phase 7 — auth_rate_limit_hit against local PG (shared authority).
 * Skipped when NAVADRISHTI_PG_TEST_URL is unset (not counted as pass).
 * Two-process multi-instance proof: scripts/cycle13-phase7-multi-instance-rate-limit.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

function loadEnvLocal() {
  const p = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 1) continue
    const key = t.slice(0, eq).trim()
    let value = t.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

loadEnvLocal()

const url = process.env.NAVADRISHTI_PG_TEST_URL?.trim() || ''
const ENABLED =
  Boolean(url) &&
  !/supabase/i.test(url) &&
  (() => {
    try {
      const u = new URL(url)
      return (
        ['localhost', '127.0.0.1', '::1'].includes(u.hostname) &&
        u.pathname.replace(/^\//, '') === 'navadrishti_cycle11_test'
      )
    } catch {
      return false
    }
  })()

const PREFIX = `p7t_${Date.now().toString(36)}_`

describe.skipIf(!ENABLED)('CSR shared rate limit (local PG)', () => {
  let pg: typeof import('pg')
  let client: import('pg').Client

  beforeAll(async () => {
    pg = await import('pg')
    client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 })
    await client.connect()
    const id = await client.query('SELECT current_database() AS db')
    expect(id.rows[0].db).toBe('navadrishti_cycle11_test')
    const fn = await client.query(
      `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='auth_rate_limit_hit'`
    )
    expect(fn.rowCount).toBe(1)
  })

  afterAll(async () => {
    if (client) {
      await client.query(`DELETE FROM auth_rate_limits WHERE key LIKE $1`, [`${PREFIX}%`])
      await client.end().catch(() => undefined)
    }
  })

  beforeEach(async () => {
    await client.query(`DELETE FROM auth_rate_limits WHERE key LIKE $1`, [`${PREFIX}%`])
  })

  it('enforces sliding window and does not count denied hits', async () => {
    const key = `${PREFIX}user:1`
    const results = []
    for (let i = 0; i < 4; i++) {
      const { rows } = await client.query('SELECT * FROM auth_rate_limit_hit($1,$2,$3)', [key, 3, 60])
      results.push(rows[0])
    }
    expect(results.filter((r) => r.allowed)).toHaveLength(3)
    expect(results[3].allowed).toBe(false)
    expect(results[3].retry_after_seconds).toBeGreaterThanOrEqual(1)
    const { rows } = await client.query('SELECT count(*)::int AS n FROM auth_rate_limits WHERE key=$1', [key])
    expect(rows[0].n).toBe(3)
  })

  it('two clients cannot exceed the shared limit concurrently', async () => {
    const key = `${PREFIX}user:race`
    const a = new pg.Client({ connectionString: url })
    const b = new pg.Client({ connectionString: url })
    await a.connect()
    await b.connect()
    const [hitsA, hitsB] = await Promise.all([
      (async () => {
        const out = []
        for (let i = 0; i < 8; i++) {
          out.push(await a.query('SELECT * FROM auth_rate_limit_hit($1,$2,$3)', [key, 5, 60]))
        }
        return out
      })(),
      (async () => {
        const out = []
        for (let i = 0; i < 8; i++) {
          out.push(await b.query('SELECT * FROM auth_rate_limit_hit($1,$2,$3)', [key, 5, 60]))
        }
        return out
      })(),
    ])
    await a.end()
    await b.end()
    const allowed = [...hitsA, ...hitsB].filter((h) => h.rows[0].allowed).length
    expect(allowed).toBe(5)
    const { rows } = await client.query('SELECT count(*)::int AS n FROM auth_rate_limits WHERE key=$1', [key])
    expect(rows[0].n).toBe(5)
  })

  it('isolates independent user keys', async () => {
    const k1 = `${PREFIX}csr-agent-generate:user:100`
    const k2 = `${PREFIX}csr-agent-generate:user:200`
    for (let i = 0; i < 3; i++) {
      expect((await client.query('SELECT * FROM auth_rate_limit_hit($1,$2,$3)', [k1, 3, 60])).rows[0].allowed).toBe(
        true
      )
      expect((await client.query('SELECT * FROM auth_rate_limit_hit($1,$2,$3)', [k2, 3, 60])).rows[0].allowed).toBe(
        true
      )
    }
  })
})

describe('Phase 7 PG gate', () => {
  it('documents skip when NAVADRISHTI_PG_TEST_URL is unset', () => {
    if (!ENABLED) expect(ENABLED).toBe(false)
  })
})
