import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')
const types = fs.readFileSync(path.join(root, 'lib/database.types.ts'), 'utf8')
const sqlDir = path.join(root, 'sql/cycle-1.1')

function loadPgUrlFromEnvLocal() {
  const envPath = path.join(root, '.env.local')
  if (!fs.existsSync(envPath)) return process.env.NAVADRISHTI_PG_TEST_URL?.trim() || ''
  if (process.env.NAVADRISHTI_PG_TEST_URL?.trim()) return process.env.NAVADRISHTI_PG_TEST_URL.trim()
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('NAVADRISHTI_PG_TEST_URL=')) continue
    let value = trimmed.slice('NAVADRISHTI_PG_TEST_URL='.length).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    return value
  }
  return ''
}

const pgUrl = loadPgUrlFromEnvLocal()
const localPgEnabled =
  Boolean(pgUrl) &&
  !/supabase/i.test(pgUrl) &&
  (() => {
    try {
      const u = new URL(pgUrl)
      return (
        ['localhost', '127.0.0.1', '::1'].includes(u.hostname) &&
        u.pathname.replace(/^\//, '') === 'navadrishti_cycle11_test'
      )
    } catch {
      return false
    }
  })()

describe('Cycle 1.2 publish migration artifacts', () => {
  it('ships up/down SQL for the RPC, uniques, and audit hash index', () => {
    for (const name of [
      '01_duplicate_detection.sql',
      '02_publish_campaign_with_project.up.sql',
      '02_publish_campaign_with_project.down.sql',
      '03_csr_integrity_uniques.up.sql',
      '03_csr_integrity_uniques.down.sql',
      '03a_csr_projects_campaign_id_uidx.concurrent.up.sql',
      '03b_csr_project_milestones_project_order_uidx.concurrent.up.sql',
      '03c_service_attendance_assignment_date_uidx.concurrent.up.sql',
      '04_csr_audit_publish_event_hash_uidx.up.sql',
      '04_csr_audit_publish_event_hash_uidx.down.sql',
      '04a_csr_audit_publish_event_hash_uidx.concurrent.up.sql',
      '06_publish_campaign_with_ev_assignment.up.sql',
      '06_publish_campaign_with_ev_assignment.down.sql',
    ]) {
      expect(fs.existsSync(path.join(sqlDir, name))).toBe(true)
    }
  })

  it('defines publish_campaign_with_project in database.types.ts', () => {
    expect(types).toMatch(/^\s{6}publish_campaign_with_project: \{/m)
  })

  it('keeps one CONCURRENTLY statement per independently executable file', () => {
    for (const name of [
      '03a_csr_projects_campaign_id_uidx.concurrent.up.sql',
      '03b_csr_project_milestones_project_order_uidx.concurrent.up.sql',
      '03c_service_attendance_assignment_date_uidx.concurrent.up.sql',
      '04a_csr_audit_publish_event_hash_uidx.concurrent.up.sql',
    ]) {
      const sql = fs.readFileSync(path.join(sqlDir, name), 'utf8')
      expect(sql).toMatch(/CREATE UNIQUE INDEX CONCURRENTLY/i)
      expect(sql).toMatch(/outside a transaction|autocommit/i)
      const creates = sql.match(/CREATE UNIQUE INDEX CONCURRENTLY/gi) || []
      expect(creates).toHaveLength(1)
    }
  })

  it('documents safe merge for NOT NULL + UNIQUE campaign_id', () => {
    const detection = fs.readFileSync(path.join(sqlDir, '01_duplicate_detection.sql'), 'utf8')
    expect(detection).toMatch(/archive campaign/i)
    expect(detection).toMatch(/UNIQUE\(campaign_id\)/i)
    expect(detection).toMatch(/Do NOT DELETE/i)
  })

  it('includes read-only duplicate detection queries', () => {
    const detection = fs.readFileSync(path.join(sqlDir, '01_duplicate_detection.sql'), 'utf8')
    expect(detection).toMatch(/GROUP BY campaign_id/)
    expect(detection).toMatch(/GROUP BY project_id, milestone_order/)
    expect(detection).toMatch(/GROUP BY assignment_id, attendance_date/)
    expect(detection).toMatch(/campaign_publish_failed:%/)
    const statements = detection
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .toLowerCase()
    expect(statements).not.toMatch(/\bdelete\b/)
    expect(statements).not.toMatch(/\btruncate\b/)
    expect(statements).not.toMatch(/\bupdate\b/)
  })

  it('pins SECURITY DEFINER ownership from an existing RPC when available', () => {
    const fn = fs.readFileSync(path.join(sqlDir, '02_publish_campaign_with_project.up.sql'), 'utf8')
    expect(fn).toMatch(/SET search_path = public/)
    expect(fn).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC/)
    expect(fn).toMatch(/OWNER TO/)
    expect(fn).toMatch(/aclexplode[\s\S]*REVOKE ALL ON FUNCTION/)
    expect(fn).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM anon/)
    expect(fn).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM authenticated/)
    expect(fn).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/)
    expect(fn).toMatch(/lead_ngo_not_accepted/)
    expect(fn).toMatch(/invalid_milestone_amount/)
  })

  it('captures the prior RPC for rollback and retains assignment history', () => {
    const up = fs.readFileSync(
      path.join(sqlDir, '06_publish_campaign_with_ev_assignment.up.sql'),
      'utf8'
    )
    const down = fs.readFileSync(
      path.join(sqlDir, '06_publish_campaign_with_ev_assignment.down.sql'),
      'utf8'
    )
    expect(up).toMatch(/pg_get_functiondef\(v_function\)/)
    expect(up).toMatch(/cycle_1_3_rpc_definition_backup/)
    expect(up).toMatch(/function_owner name NOT NULL/)
    expect(up).toMatch(/function_acl aclitem\[\] NOT NULL/)
    expect(up).toMatch(/function_security_definer boolean NOT NULL/)
    expect(up).toMatch(/p\.oid = to_regprocedure\(/)
    expect(up).toMatch(/aclexplode[\s\S]*REVOKE ALL ON FUNCTION/)
    expect(down).toMatch(/EXECUTE v_definition/)
    expect(down).toMatch(/OWNER TO %I/)
    expect(down).toMatch(/aclexplode\(v_acl\)/)
    expect(down).toMatch(/p\.proconfig IS NOT DISTINCT FROM v_config/)
    expect(down).not.toMatch(/DROP TABLE[^;]*company_ca_project_assignments/i)
    expect(down).not.toMatch(/DELETE FROM public\.company_ca_project_assignments/i)
    expect(down).toMatch(/before rolling back Cycle 1\.2/i)
  })

  it('documents that sql/cycle-1.1 is untracked provenance (not Git-sourced)', () => {
    const note = fs.readFileSync(path.join(sqlDir, 'RESTORE_NOTE.md'), 'utf8')
    expect(note).toMatch(/not\*?\*? restored from Git|never tracked/i)
    expect(note).toMatch(/pg_get_functiondef|compaction|transcript/i)
  })
})

describe.skipIf(!localPgEnabled)('Cycle 1.1 publish RPC vs local disposable PG', () => {
  it('matches SECURITY DEFINER and critical error markers on navadrishti_cycle11_test', async () => {
    const pg = await import('pg')
    const client = new pg.Client({ connectionString: pgUrl })
    await client.connect()
    try {
      const { rows } = await client.query(`
        SELECT p.prosecdef AS security_definer,
               pg_get_functiondef(p.oid) AS def
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'publish_campaign_with_project'
      `)
      expect(rows).toHaveLength(1)
      expect(rows[0].security_definer).toBe(true)
      expect(String(rows[0].def)).toMatch(/lead_ngo_not_accepted/)
      expect(String(rows[0].def)).toMatch(/invalid_milestone_amount/)
      expect(String(rows[0].def)).toMatch(/SET search_path/i)

      const { rows: indexes } = await client.query(`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN (
            'csr_projects_campaign_id_uidx',
            'csr_project_milestones_project_order_uidx',
            'service_attendance_assignment_date_uidx',
            'csr_audit_log_publish_event_hash_uidx'
          )
        ORDER BY 1
      `)
      expect(indexes.map((r) => r.indexname)).toEqual([
        'csr_audit_log_publish_event_hash_uidx',
        'csr_project_milestones_project_order_uidx',
        'csr_projects_campaign_id_uidx',
        'service_attendance_assignment_date_uidx',
      ])
    } finally {
      await client.end()
    }
  }, 30_000)
})

describe('Cycle 1.1 publish RPC local PG gate', () => {
  it('documents skip unless NAVADRISHTI_PG_TEST_URL targets navadrishti_cycle11_test', () => {
    if (!localPgEnabled) expect(localPgEnabled).toBe(false)
    else expect(pgUrl).toMatch(/navadrishti_cycle11_test/)
  })
})
