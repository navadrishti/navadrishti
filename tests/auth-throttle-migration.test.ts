import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Migrations are kept out of the repository, so the SQL checks only run where the local copy exists.
const migrationPath = path.resolve(import.meta.dirname, '../reference/navadrishti_pending_migrations.sql')
const migrationFile = fs.existsSync(migrationPath) ? migrationPath : null
const sql = migrationFile ? fs.readFileSync(migrationFile, 'utf8').toLowerCase() : ''
const types = fs.readFileSync(path.resolve(import.meta.dirname, '../lib/database.types.ts'), 'utf8')

const TABLES = ['auth_rate_limits', 'auth_one_time_codes']
const FUNCTIONS = [
  'auth_rate_limit_hit',
  'auth_code_issue',
  'auth_code_attempt',
  'auth_code_find',
  'auth_code_consume',
  'auth_throttle_cleanup',
]

describe.skipIf(!migrationFile)('auth throttle store migration', () => {

  it.each(TABLES)('enables row level security on %s without any policies', (table) => {
    expect(sql).toContain(`alter table public.${table} enable row level security;`)
    expect(sql).toMatch(new RegExp(`revoke all on table public\\.${table} from anon, authenticated;`))
    expect(sql).not.toMatch(/create policy/)
  })

  it('stores hashed codes only', () => {
    expect(sql).toMatch(/code_hash text not null check \(code_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/)
    expect(sql).not.toMatch(/\bcode text\b|\btoken text\b|\botp text\b/)
    expect(sql).toContain("check (purpose in ('phone_otp', 'password_reset'))")
  })

  it.each(FUNCTIONS)('makes %s a security definer callable only by service_role', (name) => {
    const definition = sql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`))?.[0] ?? ''
    expect(definition).toContain('security definer')
    expect(definition).toContain('set search_path = public')
    expect(sql).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated;`))
    expect(sql).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to service_role;`))
    expect(sql).not.toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to (anon|authenticated|public)`))
  })

  it('serialises rate-limit hits per key', () => {
    expect(sql).toContain('pg_advisory_xact_lock(hashtext(p_key))')
  })
})

describe('auth throttle store types', () => {
  it('are mirrored in lib/database.types.ts', () => {
    for (const table of TABLES) expect(types).toMatch(new RegExp(`^ {6}${table}: \\{$`, 'm'))
    for (const name of FUNCTIONS) expect(types).toMatch(new RegExp(`^ {6}${name}: \\{$`, 'm'))
  })
})
