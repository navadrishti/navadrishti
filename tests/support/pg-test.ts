import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

/**
 * Dedicated disposable database for Cycle 1.1 Postgres integration tests.
 * Destructive fixture resets (DROP SCHEMA public CASCADE) are allowed only here.
 */
export const PG_TEST_DATABASE_NAME = 'navadrishti_cycle11_test'
export const PG_TEST_VERIFIER_IDENTITY_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
export const PG_TEST_FOREIGN_VERIFIER_IDENTITY_ID = '11111111-2222-4333-8444-555555555555'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])
const EXISTING_ASSIGNMENT_TABLE_SQL = `
  CREATE TABLE public.company_ca_project_assignments (
    id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    company_ca_identity_id uuid NOT NULL
      REFERENCES public.company_ca_identities(id) ON DELETE CASCADE,
    company_ca_user_id integer NOT NULL
      REFERENCES public.users(id) ON DELETE CASCADE,
    company_user_id integer NOT NULL
      REFERENCES public.users(id) ON DELETE CASCADE,
    project_id uuid NOT NULL
      REFERENCES public.csr_projects(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    assigned_by integer REFERENCES public.users(id) ON DELETE SET NULL,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    deactivated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT company_ca_project_assignments_identity_project_key
      UNIQUE (company_ca_identity_id, project_id)
  );
  ALTER TABLE public.company_ca_project_assignments ENABLE ROW LEVEL SECURITY;
`

function readPreviousPublishRpc(): string {
  const root = path.resolve(import.meta.dirname, '../..')
  const schemaSql = fs.readFileSync(
    path.join(root, 'tests/support/fixtures/pre-evidence-verifier-publish-campaign.sql'),
    'utf8'
  )
  const start = schemaSql.indexOf('CREATE FUNCTION public.publish_campaign_with_project(')
  const end = schemaSql.indexOf('\n$$;', start)
  if (start < 0 || end < 0) {
    throw new Error('Could not locate the pre-Evidence-Verifier publish RPC in the integration fixture')
  }
  return schemaSql.slice(start, end + '\n$$;'.length)
}

/**
 * Postgres integration tests require an explicit URL.
 * Never fall back to a hardcoded default (that allowed silent skip-pass).
 *
 * CI: set NAVADRISHTI_PG_TEST_URL and optionally NAVADRISHTI_PG_TEST_REQUIRED=1
 * so missing config fails the gate test.
 *
 * Keep NAVADRISHTI_PG_TEST_URL out of committed files. Never log the URL.
 */
export function pgTestUrl(): string | null {
  const url = process.env.NAVADRISHTI_PG_TEST_URL?.trim()
  return url || null
}

export function pgTestsConfigured(): boolean {
  return Boolean(pgTestUrl())
}

/**
 * Parse and validate the configured URL before connecting.
 * Returns only non-secret identity fields. Never returns password or full URL.
 */
export function assertPgTestUrlIdentity(rawUrl: string): {
  database: string
  host: string
  port: string
} {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error(
      'NAVADRISHTI_PG_TEST_URL is not a valid URL. Expected a postgresql:// URL to the dedicated test database.'
    )
  }

  if (!/^postgres(ql)?:$/i.test(parsed.protocol)) {
    throw new Error(
      `NAVADRISHTI_PG_TEST_URL protocol must be postgresql: (received ${parsed.protocol || 'empty'})`
    )
  }

  const database = decodeURIComponent((parsed.pathname || '').replace(/^\//, '')).trim()
  const host = (parsed.hostname || '').toLowerCase()
  const port = parsed.port || '5432'

  if (!database) {
    throw new Error('NAVADRISHTI_PG_TEST_URL must include a database name in the path.')
  }

  if (database !== PG_TEST_DATABASE_NAME) {
    throw new Error(
      `Refusing Postgres integration target: database name must be exactly "${PG_TEST_DATABASE_NAME}" (received a different name).`
    )
  }

  // Deny cloud / shared project hosts even if the path were renamed.
  if (
    host.includes('supabase.co') ||
    host.includes('supabase.com') ||
    host.includes('pooler.supabase') ||
    /navadrishti-(dev|prod)/i.test(host) ||
    /navadrishti-(dev|prod)/i.test(database)
  ) {
    throw new Error(
      'Refusing Postgres integration target: host looks like a shared Navadrishti/Supabase project. Use a local dedicated test database.'
    )
  }

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing Postgres integration target: host must be localhost / 127.0.0.1 / ::1 for destructive fixture resets (received a non-local host).`
    )
  }

  return { database, host, port }
}

export async function assertConnectedPgTestIdentity(client: pg.Client): Promise<void> {
  const { rows } = await client.query<{
    current_database: string
  }>(`SELECT current_database() AS current_database`)

  const currentDatabase = rows[0]?.current_database
  if (currentDatabase !== PG_TEST_DATABASE_NAME) {
    throw new Error(
      `Refusing destructive Postgres work: connected database must be "${PG_TEST_DATABASE_NAME}" (identity check failed).`
    )
  }
}

export async function connectPgTest(): Promise<pg.Client> {
  const url = pgTestUrl()
  if (!url) {
    throw new Error(
      'NAVADRISHTI_PG_TEST_URL is not set. Postgres integration tests require an explicit database URL.'
    )
  }

  // Validate identity from the URL before opening a socket.
  assertPgTestUrlIdentity(url)

  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 })
  try {
    await client.connect()
    await assertConnectedPgTestIdentity(client)
  } catch (error) {
    await client.end().catch(() => undefined)
    if (error instanceof Error && /Refusing Postgres|must be exactly|identity check/i.test(error.message)) {
      throw error
    }
    throw new Error(
      `Failed to connect to NAVADRISHTI_PG_TEST_URL: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  return client
}

export async function withPgTest<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = await connectPgTest()
  try {
    return await run(client)
  } finally {
    await client.end().catch(() => undefined)
  }
}

export async function resetPublishFixture(
  client: pg.Client,
  options: { existingAssignmentTable?: boolean } = {}
) {
  // Hard stop: never DROP SCHEMA unless this session is the dedicated test DB.
  await assertConnectedPgTestIdentity(client)

  const root = path.resolve(import.meta.dirname, '../..')
  const fixture = fs.readFileSync(path.join(root, 'sql/cycle-1.1/test_fixture_minimal_schema.sql'), 'utf8')
  const migration = fs.readFileSync(
    path.join(root, 'sql/cycle-1.1/06_publish_campaign_with_ev_assignment.up.sql'),
    'utf8'
  )
  const uniques = fs.readFileSync(path.join(root, 'sql/cycle-1.1/03_csr_integrity_uniques.up.sql'), 'utf8')
  const auditUnique = fs.readFileSync(
    path.join(root, 'sql/cycle-1.1/04_csr_audit_publish_event_hash_uidx.up.sql'),
    'utf8'
  )

  await client.query(`
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO PUBLIC;
  `)
  await client.query(fixture)
  if (options.existingAssignmentTable) {
    await client.query(EXISTING_ASSIGNMENT_TABLE_SQL)
  }
  await client.query(readPreviousPublishRpc())
  await client.query(uniques)
  await client.query(auditUnique)
  await client.query(migration)
  await client.query(`
    INSERT INTO public.users (id, email) VALUES
      (3, 'company@example.com'),
      (12, 'ngo@example.com'),
      (22, 'verifier@example.com'),
      (23, 'foreign-verifier@example.com'),
      (40, 'other-company@example.com')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.company_ca_identities (
      id, user_id, company_user_id, status, permissions
    ) VALUES
      (
        '${PG_TEST_VERIFIER_IDENTITY_ID}',
        22,
        3,
        'active',
        '{"can_review_evidence": true}'::jsonb
      ),
      (
        '${PG_TEST_FOREIGN_VERIFIER_IDENTITY_ID}',
        23,
        40,
        'active',
        '{"can_review_evidence": true}'::jsonb
      );
  `)
}

export async function seedDraftCampaign(
  client: pg.Client,
  campaignId: string,
  milestones: unknown[] = [
    { title: 'Survey', budget_allocated: 100000 },
    { title: 'Build', budget_allocated: 50000 },
  ],
  opts: {
    status?: 'draft' | 'active'
    leadAccepted?: boolean
    verifierIdentityId?: string | null
  } = {}
) {
  const status = opts.status ?? 'draft'
  const leadAccepted = opts.leadAccepted ?? true
  const impactMetrics: Record<string, unknown> = { lead_ngo_accepted: leadAccepted }
  const verifierIdentityId = opts.verifierIdentityId === undefined
    ? PG_TEST_VERIFIER_IDENTITY_ID
    : opts.verifierIdentityId
  if (verifierIdentityId) {
    impactMetrics.evidence_verifier_identity_id = verifierIdentityId
  }
  await client.query(
    `INSERT INTO public.campaigns (
      id, company_id, category, location, budget_inr, title, description,
      budget_breakdown, schedule_vii, sdg_alignment, impact_metrics, milestones,
      start_date, end_date, status, lead_ngo_user_id
    ) VALUES (
      $1, 3, 'Water', 'Pune', 150000, 'Clean Water', 'Wells',
      '{}'::jsonb, 'Water', '{}'::integer[], $3::jsonb, $2::jsonb,
      '2026-11-01', '2026-12-31', $4::campaign_status_enum, 12
    )`,
    [
      campaignId,
      JSON.stringify(milestones),
      JSON.stringify(impactMetrics),
      status,
    ]
  )
}

export function publishArgs(
  campaignId: string,
  milestones: unknown[] = [
    { title: 'Survey', budget_allocated: 100000 },
    { title: 'Build', budget_allocated: 50000 },
  ],
  impactMetrics: Record<string, unknown> = {
    lead_ngo_accepted: true,
    evidence_verifier_identity_id: PG_TEST_VERIFIER_IDENTITY_ID,
    published_at: new Date().toISOString(),
  }
) {
  return {
    p_campaign_id: campaignId,
    p_company_user_id: 3,
    p_actor_user_id: 3,
    p_title: 'Clean Water',
    p_description: 'Wells',
    p_category: 'Water',
    p_location: 'Pune',
    p_budget_inr: 150000,
    p_budget_breakdown: {},
    p_schedule_vii: 'Water',
    p_sdg_alignment: [] as number[],
    p_lead_ngo_user_id: 12,
    p_impact_metrics: impactMetrics,
    p_milestones: milestones,
    p_start_date: '2026-11-01',
    p_end_date: '2026-12-31',
    p_region: 'Pune',
    p_total_budget: 150000,
    p_expected_beneficiaries: 200,
    p_published_at: new Date().toISOString(),
    p_campaign_url: `https://gram.test/csr-campaigns/${campaignId}`,
  }
}

export async function callPublish(
  client: pg.Client,
  campaignId: string,
  milestones?: unknown[],
  impactMetrics?: Record<string, unknown>
) {
  const args = publishArgs(campaignId, milestones, impactMetrics)
  const { rows } = await client.query(
    `SELECT public.publish_campaign_with_project(
      $1::uuid, $2::int, $3::int, $4::text, $5::text, $6::text, $7::text, $8::numeric,
      $9::jsonb, $10::text, $11::integer[], $12::int, $13::jsonb, $14::jsonb,
      $15::date, $16::date, $17::text, $18::numeric, $19::int, $20::timestamptz, $21::text
    ) AS result`,
    [
      args.p_campaign_id,
      args.p_company_user_id,
      args.p_actor_user_id,
      args.p_title,
      args.p_description,
      args.p_category,
      args.p_location,
      args.p_budget_inr,
      JSON.stringify(args.p_budget_breakdown),
      args.p_schedule_vii,
      args.p_sdg_alignment,
      args.p_lead_ngo_user_id,
      JSON.stringify(args.p_impact_metrics),
      JSON.stringify(args.p_milestones),
      args.p_start_date,
      args.p_end_date,
      args.p_region,
      args.p_total_budget,
      args.p_expected_beneficiaries,
      args.p_published_at,
      args.p_campaign_url,
    ]
  )
  return rows[0].result as Record<string, unknown>
}
