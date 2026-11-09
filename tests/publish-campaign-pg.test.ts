import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertPgTestUrlIdentity,
  callPublish,
  connectPgTest,
  PG_TEST_DATABASE_NAME,
  PG_TEST_FOREIGN_VERIFIER_IDENTITY_ID,
  PG_TEST_VERIFIER_IDENTITY_ID,
  pgTestUrl,
  pgTestsConfigured,
  resetPublishFixture,
  seedDraftCampaign,
  withPgTest,
} from './support/pg-test'

async function assertNoPublicationWrites(
  client: Awaited<ReturnType<typeof connectPgTest>>,
  campaignId: string,
  expectedStatus: 'draft' | 'active' = 'draft'
) {
  const { rows: campaigns } = await client.query(
    `SELECT status::text AS status FROM campaigns WHERE id = $1`,
    [campaignId]
  )
  expect(campaigns[0]?.status).toBe(expectedStatus)

  const { rows: counts } = await client.query(
    `SELECT
       (SELECT count(*)::int FROM csr_projects WHERE campaign_id = $1) AS projects,
       (SELECT count(*)::int FROM csr_project_milestones WHERE campaign_id = $1) AS milestones,
       (SELECT count(*)::int FROM csr_audit_log
        WHERE (entity_id = $1
               AND event_type IN ('campaign_published', 'campaign_publish_repaired'))
           OR (event_type = 'csr_project_created_on_publish'
               AND event_payload->>'campaign_id' = $1::text)
       ) AS publication_audits,
       (SELECT count(*)::int
        FROM company_ca_project_assignments a
        JOIN csr_projects p ON p.id = a.project_id
        WHERE p.campaign_id = $1
       ) AS assignments`,
    [campaignId]
  )
  expect(counts[0]).toEqual({
    projects: 0,
    milestones: 0,
    publication_audits: 0,
    assignments: 0,
  })
}

async function readCampaignAssignments(
  client: Awaited<ReturnType<typeof connectPgTest>>,
  campaignId: string
) {
  const { rows } = await client.query(
    `SELECT a.id, a.company_ca_identity_id, a.company_ca_user_id,
            a.company_user_id, a.project_id, a.status
     FROM company_ca_project_assignments a
     JOIN csr_projects p ON p.id = a.project_id
     WHERE p.campaign_id = $1
     ORDER BY a.created_at, a.id`,
    [campaignId]
  )
  return rows
}

describe('Postgres integration gate', () => {
  it('fails closed when PG tests are required but URL is unset', () => {
    if (process.env.NAVADRISHTI_PG_TEST_REQUIRED === '1' && !pgTestUrl()) {
      throw new Error('NAVADRISHTI_PG_TEST_URL is required when NAVADRISHTI_PG_TEST_REQUIRED=1')
    }
  })

  it('rejects URLs that are not the dedicated local test database', () => {
    expect(() => assertPgTestUrlIdentity('postgresql://nobody@127.0.0.1:5432/postgres')).toThrow(
      /must be exactly/
    )
    expect(() =>
      assertPgTestUrlIdentity(`postgresql://nobody@db.example.supabase.co:5432/${PG_TEST_DATABASE_NAME}`)
    ).toThrow(/shared Navadrishti\/Supabase|non-local host/)
    expect(() =>
      assertPgTestUrlIdentity(`postgresql://nobody@10.0.0.8:5432/${PG_TEST_DATABASE_NAME}`)
    ).toThrow(/non-local host/)
    expect(() =>
      assertPgTestUrlIdentity(`postgresql://nobody@127.0.0.1:5432/${PG_TEST_DATABASE_NAME}`)
    ).not.toThrow()
  })

  it('rejects an unreachable dedicated-test URL instead of skipping', async () => {
    const previous = process.env.NAVADRISHTI_PG_TEST_URL
    process.env.NAVADRISHTI_PG_TEST_URL = `postgresql://nobody@127.0.0.1:1/${PG_TEST_DATABASE_NAME}`
    try {
      await expect(connectPgTest()).rejects.toThrow(/Failed to connect to NAVADRISHTI_PG_TEST_URL/)
    } finally {
      if (previous === undefined) delete process.env.NAVADRISHTI_PG_TEST_URL
      else process.env.NAVADRISHTI_PG_TEST_URL = previous
    }
  })
})

const describePg = pgTestsConfigured()
  ? describe
  : describe.skip

if (!pgTestsConfigured()) {
  // Visible in Vitest output when the suite is skipped — do not treat as a green PG run.
  console.warn(
    `[publish-campaign-pg] SKIPPED: set NAVADRISHTI_PG_TEST_URL to a local ${PG_TEST_DATABASE_NAME} database (never navadrishti-dev/prod). Set NAVADRISHTI_PG_TEST_REQUIRED=1 to fail closed.`
  )
}

describePg('publish_campaign_with_project (real Postgres)', () => {
  afterEach(() => {
    // no shared client
  })

  it.each([
    ['fresh assignment table', false],
    ['pre-existing assignment table', true],
  ])('installs the forward migration over a %s and persists one assignment', async (_label, existingAssignmentTable) => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client, { existingAssignmentTable })
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId)

      const { rows: functionRows } = await client.query(`
        SELECT pg_get_functiondef(p.oid) AS definition,
               pg_get_function_result(p.oid) AS return_type,
               p.pronargs AS argument_count,
               owner.rolname AS function_owner
        FROM pg_proc p
        JOIN pg_roles owner ON owner.oid = p.proowner
        WHERE p.oid = 'public.publish_campaign_with_project(uuid,integer,integer,text,text,text,text,numeric,jsonb,text,integer[],integer,jsonb,jsonb,date,date,text,numeric,integer,timestamptz,text)'::regprocedure
      `)
      expect(functionRows[0].return_type).toBe('jsonb')
      expect(functionRows[0].argument_count).toBe(21)
      expect(functionRows[0].function_owner).toBe('postgres')
      expect(functionRows[0].definition).toContain('evidence_verifier_assignment_failed')
      const { rows: triggerRows } = await client.query(`
        SELECT count(*)::int AS count, c.relrowsecurity AS rls_enabled
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        WHERE t.tgrelid = 'public.company_ca_project_assignments'::regclass
          AND t.tgname = 'trg_company_ca_project_assignment_eligibility'
          AND NOT t.tgisinternal
        GROUP BY c.relrowsecurity
      `)
      expect(triggerRows[0].count).toBe(1)
      expect(triggerRows[0].rls_enabled).toBe(true)

      const result = await callPublish(client, campaignId)
      expect(result.ok).toBe(true)
      expect(await readCampaignAssignments(client, campaignId)).toMatchObject([
        {
          company_ca_identity_id: PG_TEST_VERIFIER_IDENTITY_ID,
          company_user_id: 3,
          status: 'active',
        },
      ])
    })
  })

  it.each([
    ['inactive identity', "UPDATE company_ca_identities SET status = 'inactive' WHERE id = $1", null],
    ['cross-company identity', null, PG_TEST_FOREIGN_VERIFIER_IDENTITY_ID],
    ['missing permission', "UPDATE company_ca_identities SET permissions = '{}'::jsonb WHERE id = $1", null],
    ['false permission', "UPDATE company_ca_identities SET permissions = '{\"can_review_evidence\":false}'::jsonb WHERE id = $1", null],
    ['malformed permission', "UPDATE company_ca_identities SET permissions = '{\"can_review_evidence\":\"true\"}'::jsonb WHERE id = $1", null],
  ])('database trigger rejects an active assignment for an %s', async (_label, identityUpdate, identityId) => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId)
      if (identityUpdate) {
        await client.query(identityUpdate, [PG_TEST_VERIFIER_IDENTITY_ID])
      }

      const { rows } = await client.query(
        `INSERT INTO csr_projects (campaign_id, company_user_id, ngo_user_id, title, project_status)
         VALUES ($1, 3, 12, 'Assignment target', 'active') RETURNING id`,
        [campaignId]
      )
      const selectedIdentityId = identityId || PG_TEST_VERIFIER_IDENTITY_ID
      const companyCaUserId = identityId ? 23 : 22

      await expect(
        client.query(
          `INSERT INTO company_ca_project_assignments (
             company_ca_identity_id, company_ca_user_id, company_user_id, project_id, status, assigned_by
           ) VALUES ($1, $2, 3, $3, 'active', 3)`,
          [selectedIdentityId, companyCaUserId, rows[0].id]
        )
      ).rejects.toMatchObject({ code: 'P0001' })
      await expect(readCampaignAssignments(client, campaignId)).resolves.toHaveLength(0)
    })
  })

  it('database trigger rejects reactivation after evidence-review permission is removed', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId)
      const { rows } = await client.query(
        `INSERT INTO csr_projects (campaign_id, company_user_id, ngo_user_id, title, project_status)
         VALUES ($1, 3, 12, 'Assignment target', 'active') RETURNING id`,
        [campaignId]
      )
      await client.query(
        `INSERT INTO company_ca_project_assignments (
           company_ca_identity_id, company_ca_user_id, company_user_id, project_id,
           status, assigned_by, deactivated_at
         ) VALUES ($1, 22, 3, $2, 'inactive', 3, now())`,
        [PG_TEST_VERIFIER_IDENTITY_ID, rows[0].id]
      )
      await client.query(
        `UPDATE company_ca_identities
         SET permissions = '{"can_review_evidence": false}'::jsonb
         WHERE id = $1`,
        [PG_TEST_VERIFIER_IDENTITY_ID]
      )

      await expect(
        client.query(
          `UPDATE company_ca_project_assignments
           SET status = 'active', deactivated_at = NULL
           WHERE company_ca_identity_id = $1 AND project_id = $2`,
          [PG_TEST_VERIFIER_IDENTITY_ID, rows[0].id]
        )
      ).rejects.toMatchObject({ code: 'P0001' })

      const { rows: assignmentRows } = await client.query(
        `SELECT status FROM company_ca_project_assignments
         WHERE company_ca_identity_id = $1 AND project_id = $2`,
        [PG_TEST_VERIFIER_IDENTITY_ID, rows[0].id]
      )
      expect(assignmentRows).toEqual([{ status: 'inactive' }])
    })
  })

  it('matches canonical RPC behavior after installing the migration function in Postgres', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const migratedCampaignId = randomUUID()
      await seedDraftCampaign(client, migratedCampaignId)
      const migratedResult = await callPublish(client, migratedCampaignId)
      const migratedAssignments = await readCampaignAssignments(client, migratedCampaignId)

      await resetPublishFixture(client, { existingAssignmentTable: true })
      const root = path.resolve(import.meta.dirname, '..')
      const canonicalRpc = fs.readFileSync(
        path.join(root, 'sql/cycle-1.1/02_publish_campaign_with_project.up.sql'),
        'utf8'
      )
      await client.query(canonicalRpc)
      const canonicalCampaignId = randomUUID()
      await seedDraftCampaign(client, canonicalCampaignId)
      const canonicalResult = await callPublish(client, canonicalCampaignId)
      const canonicalAssignments = await readCampaignAssignments(client, canonicalCampaignId)

      expect(canonicalResult).toMatchObject({
        ok: migratedResult.ok,
        outcome: migratedResult.outcome,
        created: migratedResult.created,
        milestones_created: migratedResult.milestones_created,
        campaign_status: migratedResult.campaign_status,
      })
      expect(canonicalAssignments).toHaveLength(1)
      expect(migratedAssignments).toHaveLength(1)
      expect(canonicalAssignments[0]).toMatchObject({
        company_ca_identity_id: migratedAssignments[0].company_ca_identity_id,
        company_ca_user_id: migratedAssignments[0].company_ca_user_id,
        company_user_id: migratedAssignments[0].company_user_id,
        status: migratedAssignments[0].status,
      })
    })
  })

  it('rolls back the RPC definition without deleting assignment history', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId)
      await callPublish(client, campaignId)
      const assignmentsBefore = await readCampaignAssignments(client, campaignId)
      expect(assignmentsBefore).toHaveLength(1)

      const root = path.resolve(import.meta.dirname, '..')
      const rollback = fs.readFileSync(
        path.join(root, 'sql/cycle-1.1/06_publish_campaign_with_ev_assignment.down.sql'),
        'utf8'
      )
      const migration = fs.readFileSync(
        path.join(root, 'sql/cycle-1.1/06_publish_campaign_with_ev_assignment.up.sql'),
        'utf8'
      )
      const { rows: savedRows } = await client.query(`
        SELECT function_definition,
               function_owner::text AS function_owner,
               function_security_definer,
               function_config,
               ARRAY(
                 SELECT concat(
                   CASE WHEN saved_acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END,
                   ':', saved_acl.privilege_type,
                   ':', saved_acl.is_grantable
                 )
                 FROM aclexplode(backup.function_acl) AS saved_acl
                 LEFT JOIN pg_roles AS grantee_role ON grantee_role.oid = saved_acl.grantee
                 ORDER BY 1
               ) AS function_grants
        FROM public.cycle_1_3_rpc_definition_backup AS backup
        WHERE migration_name = '06_publish_campaign_with_ev_assignment'
      `)
      expect(savedRows).toHaveLength(1)

      await client.query(rollback)

      const { rows: functionRows } = await client.query(`
        SELECT pg_get_functiondef(p.oid) AS definition,
               owner.rolname AS function_owner,
               p.prosecdef AS function_security_definer,
               p.proconfig AS function_config,
               ARRAY(
                 SELECT concat(
                   CASE WHEN current_acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END,
                   ':', current_acl.privilege_type,
                   ':', current_acl.is_grantable
                 )
                 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS current_acl
                 LEFT JOIN pg_roles AS grantee_role ON grantee_role.oid = current_acl.grantee
                 ORDER BY 1
               ) AS function_grants
        FROM pg_proc p
        JOIN pg_roles owner ON owner.oid = p.proowner
        WHERE p.oid = 'public.publish_campaign_with_project(uuid,integer,integer,text,text,text,text,numeric,jsonb,text,integer[],integer,jsonb,jsonb,date,date,text,numeric,integer,timestamptz,text)'::regprocedure
      `)
      expect(functionRows).toHaveLength(1)
      expect(functionRows[0]).toMatchObject({
        definition: savedRows[0].function_definition,
        function_owner: savedRows[0].function_owner,
        function_security_definer: savedRows[0].function_security_definer,
        function_config: savedRows[0].function_config,
        function_grants: savedRows[0].function_grants,
      })
      expect(await readCampaignAssignments(client, campaignId)).toMatchObject(assignmentsBefore)
      expect(await client.query(
        `SELECT to_regclass('public.company_ca_project_assignments') AS assignment_table`
      ).then(({ rows }) => rows[0].assignment_table)).toBe('company_ca_project_assignments')

      await client.query(migration)
      const { rows: reappliedRows } = await client.query(`
        SELECT pg_get_functiondef(
          'public.publish_campaign_with_project(uuid,integer,integer,text,text,text,text,numeric,jsonb,text,integer[],integer,jsonb,jsonb,date,date,text,numeric,integer,timestamptz,text)'::regprocedure
        ) AS definition
      `)
      expect(reappliedRows[0].definition).toContain('evidence_verifier_assignment_failed')
      expect(await readCampaignAssignments(client, campaignId)).toMatchObject(assignmentsBefore)
    })
  })

  it('publishes a draft campaign atomically with project and milestones', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId)

      const ok = await callPublish(client, campaignId)
      expect(ok.ok).toBe(true)
      expect(ok.created).toBe(true)
      expect(ok.milestones_created).toBe(2)

      const { rows: projects } = await client.query(
        'SELECT id FROM csr_projects WHERE campaign_id = $1',
        [campaignId]
      )
      expect(projects).toHaveLength(1)

      const { rows: milestones } = await client.query(
        'SELECT milestone_order FROM csr_project_milestones WHERE project_id = $1 ORDER BY milestone_order',
        [projects[0].id]
      )
      expect(milestones.map((row) => row.milestone_order)).toEqual([1, 2])

      const assignments = await readCampaignAssignments(client, campaignId)
      expect(assignments).toHaveLength(1)
      expect(assignments[0]).toMatchObject({
        company_ca_identity_id: PG_TEST_VERIFIER_IDENTITY_ID,
        company_ca_user_id: 22,
        company_user_id: 3,
        project_id: projects[0].id,
        status: 'active',
      })
    })
  })

  it('accepts the legacy camelCase verifier key during draft publication', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId)

      const result = await callPublish(client, campaignId, undefined, {
        lead_ngo_accepted: true,
        evidenceVerifierIdentityId: PG_TEST_VERIFIER_IDENTITY_ID,
      })

      expect(result.ok).toBe(true)
      expect(await readCampaignAssignments(client, campaignId)).toMatchObject([
        {
          company_ca_identity_id: PG_TEST_VERIFIER_IDENTITY_ID,
          company_user_id: 3,
          status: 'active',
        },
      ])
    })
  })

  it('rolls back a draft publication when the verifier is missing', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId, undefined, { verifierIdentityId: null })

      await expect(
        callPublish(client, campaignId, undefined, { lead_ngo_accepted: true })
      ).rejects.toThrow(/evidence_verifier_required/)
      await assertNoPublicationWrites(client, campaignId)
    })
  })

  it('rolls back a draft publication when the verifier is inactive', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId)
      await client.query(
        `UPDATE company_ca_identities SET status = 'inactive' WHERE id = $1`,
        [PG_TEST_VERIFIER_IDENTITY_ID]
      )

      await expect(callPublish(client, campaignId)).rejects.toThrow(/evidence_verifier_inactive/)
      await assertNoPublicationWrites(client, campaignId)
    })
  })

  it('rolls back a draft publication when the verifier belongs to another company', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId)

      await expect(
        callPublish(client, campaignId, undefined, {
          lead_ngo_accepted: true,
          evidence_verifier_identity_id: PG_TEST_FOREIGN_VERIFIER_IDENTITY_ID,
        })
      ).rejects.toThrow(/evidence_verifier_cross_company/)
      await assertNoPublicationWrites(client, campaignId)
    })
  })

  it('rolls back a draft publication when can_review_evidence is false', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId)
      await client.query(
        `UPDATE company_ca_identities
         SET permissions = '{"can_review_evidence": false}'::jsonb
         WHERE id = $1`,
        [PG_TEST_VERIFIER_IDENTITY_ID]
      )

      await expect(callPublish(client, campaignId)).rejects.toThrow(/evidence_verifier_permission/)
      await assertNoPublicationWrites(client, campaignId)
    })
  })

  it.each([
    ['missing', {}],
    ['null', { can_review_evidence: null }],
    ['string', { can_review_evidence: 'true' }],
    ['number', { can_review_evidence: 1 }],
  ])('rolls back when can_review_evidence is %s instead of JSON true', async (_label, permissions) => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId)
      await client.query(
        'UPDATE company_ca_identities SET permissions = $1::jsonb WHERE id = $2',
        [JSON.stringify(permissions), PG_TEST_VERIFIER_IDENTITY_ID]
      )

      await expect(callPublish(client, campaignId)).rejects.toThrow(/evidence_verifier_permission/)
      await assertNoPublicationWrites(client, campaignId)
    })
  })

  it('rolls back campaign, project, milestones, assignment, and audits when assignment insert fails', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId)

      await client.query(`
        CREATE FUNCTION reject_verifier_assignment() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'verifier assignment forced failure' USING ERRCODE = 'P0001';
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER reject_verifier_assignment
          BEFORE INSERT ON company_ca_project_assignments
          FOR EACH ROW EXECUTE FUNCTION reject_verifier_assignment();
      `)

      await expect(callPublish(client, campaignId)).rejects.toThrow(/verifier assignment forced failure/)
      await assertNoPublicationWrites(client, campaignId)
    })
  })

  it('fails closed and rolls back when a trigger suppresses the assignment insert', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId)

      await client.query('BEGIN')
      try {
        await client.query(`
          CREATE FUNCTION suppress_verifier_assignment() RETURNS trigger AS $$
          BEGIN
            RETURN NULL;
          END;
          $$ LANGUAGE plpgsql;
          CREATE TRIGGER suppress_verifier_assignment
            BEFORE INSERT ON company_ca_project_assignments
            FOR EACH ROW EXECUTE FUNCTION suppress_verifier_assignment();
        `)

        await expect(callPublish(client, campaignId)).rejects.toThrow(
          /evidence_verifier_assignment_failed/
        )
      } finally {
        await client.query('ROLLBACK')
      }

      await assertNoPublicationWrites(client, campaignId)
    })
  })

  it('does not create an assignment when project creation fails', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId)

      await client.query(`
        CREATE FUNCTION reject_csr_project_insert() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'project creation forced failure' USING ERRCODE = 'P0001';
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER reject_csr_project_insert
          BEFORE INSERT ON csr_projects
          FOR EACH ROW EXECUTE FUNCTION reject_csr_project_insert();
      `)

      await expect(callPublish(client, campaignId)).rejects.toThrow(/project creation forced failure/)
      await assertNoPublicationWrites(client, campaignId)
    })
  })

  it('rolls back the whole transaction when audit insert fails mid-publish', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId)

      await client.query(`
        CREATE OR REPLACE FUNCTION reject_audit() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'audit forced failure' USING ERRCODE = 'P0001';
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER csr_audit_log_reject
          BEFORE INSERT ON csr_audit_log
          FOR EACH ROW EXECUTE FUNCTION reject_audit();
      `)

      await expect(callPublish(client, campaignId)).rejects.toThrow(/audit forced failure/)

      const { rows: campaigns } = await client.query(
        `SELECT status::text AS status FROM campaigns WHERE id = $1`,
        [campaignId]
      )
      expect(campaigns[0].status).toBe('draft')

      const { rows: projects } = await client.query(
        `SELECT count(*)::int AS c FROM csr_projects WHERE campaign_id = $1`,
        [campaignId]
      )
      expect(projects[0].c).toBe(0)

      const { rows: milestones } = await client.query(
        `SELECT count(*)::int AS c FROM csr_project_milestones WHERE campaign_id = $1`,
        [campaignId]
      )
      expect(milestones[0].c).toBe(0)
      expect(await readCampaignAssignments(client, campaignId)).toHaveLength(0)
    })
  })

  it('handles concurrent publish requests with one project and one success audit', async () => {
    await withPgTest(async (setup) => {
      await resetPublishFixture(setup)
      const campaignId = randomUUID()
      await seedDraftCampaign(setup, campaignId)

      const run = async () => {
        const client = await connectPgTest()
        try {
          return await callPublish(client, campaignId)
        } finally {
          await client.end()
        }
      }

      const results = await Promise.all([run(), run(), run(), run()])
      expect(results.every((row) => row.ok === true)).toBe(true)
      expect(results.filter((row) => row.created === true)).toHaveLength(1)
      expect(new Set(results.map((row) => row.project_id)).size).toBe(1)

      const { rows: projects } = await setup.query(
        'SELECT count(*)::int AS c FROM csr_projects WHERE campaign_id = $1',
        [campaignId]
      )
      expect(projects[0].c).toBe(1)

      const { rows: audits } = await setup.query(
        `SELECT count(*)::int AS c FROM csr_audit_log WHERE event_hash = $1`,
        [`campaign_published:${campaignId}`]
      )
      expect(audits[0].c).toBe(1)
      expect(await readCampaignAssignments(setup, campaignId)).toMatchObject([
        {
          company_ca_identity_id: PG_TEST_VERIFIER_IDENTITY_ID,
          company_user_id: 3,
          status: 'active',
        },
      ])
      expect(await readCampaignAssignments(setup, campaignId)).toHaveLength(1)
    })
  })

  it('repairs an active campaign that has no project', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId, undefined, { status: 'active' })

      const result = await callPublish(client, campaignId)
      expect(result.ok).toBe(true)
      expect(result.repaired).toBe(true)
      expect(result.created).toBe(true)
      expect(result.outcome).toBe('repaired_active_without_project')

      const { rows: campaigns } = await client.query(
        `SELECT title, status::text AS status FROM campaigns WHERE id = $1`,
        [campaignId]
      )
      expect(campaigns[0].status).toBe('active')
      expect(campaigns[0].title).toBe('Clean Water')

      const { rows: audits } = await client.query(
        `SELECT event_type FROM csr_audit_log WHERE event_hash = $1`,
        [`campaign_publish_repaired:${campaignId}`]
      )
      expect(audits[0].event_type).toBe('campaign_publish_repaired')

      const assignments = await readCampaignAssignments(client, campaignId)
      expect(assignments).toHaveLength(1)
      expect(assignments[0]).toMatchObject({
        company_ca_identity_id: PG_TEST_VERIFIER_IDENTITY_ID,
        company_user_id: 3,
        status: 'active',
      })
    })
  })

  it('accepts the legacy camelCase verifier key during active repair', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId, undefined, { status: 'active' })
      await client.query(
        `UPDATE campaigns
         SET impact_metrics = jsonb_build_object(
           'lead_ngo_accepted', true,
           'evidenceVerifierIdentityId', $2::text
         )
         WHERE id = $1`,
        [campaignId, PG_TEST_VERIFIER_IDENTITY_ID]
      )

      const result = await callPublish(client, campaignId)

      expect(result.ok).toBe(true)
      expect(await readCampaignAssignments(client, campaignId)).toMatchObject([
        {
          company_ca_identity_id: PG_TEST_VERIFIER_IDENTITY_ID,
          company_user_id: 3,
          status: 'active',
        },
      ])
    })
  })

  it('repairs an existing active project with no Evidence Verifier assignment', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId, undefined, { status: 'active' })
      const { rows: projectRows } = await client.query(
        `INSERT INTO csr_projects (campaign_id, company_user_id, ngo_user_id, title, project_status)
         VALUES ($1, 3, 12, 'Existing project', 'active') RETURNING id`,
        [campaignId]
      )

      const result = await callPublish(client, campaignId)
      expect(result.ok).toBe(true)
      const assignments = await readCampaignAssignments(client, campaignId)
      expect(assignments).toHaveLength(1)
      expect(assignments[0]).toMatchObject({
        company_ca_identity_id: PG_TEST_VERIFIER_IDENTITY_ID,
        company_user_id: 3,
        project_id: projectRows[0].id,
        status: 'active',
      })
    })
  })

  it('rejects active-project repair when the stored campaign has no verifier', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId, undefined, {
        status: 'active',
        verifierIdentityId: null,
      })

      await expect(callPublish(client, campaignId)).rejects.toThrow(/evidence_verifier_required/)
      await assertNoPublicationWrites(client, campaignId, 'active')
    })
  })

  it('keeps an existing active assignment idempotent during active-project repair', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId, undefined, { status: 'active' })
      const { rows: projectRows } = await client.query(
        `INSERT INTO csr_projects (campaign_id, company_user_id, ngo_user_id, title, project_status)
         VALUES ($1, 3, 12, 'Existing project', 'active') RETURNING id`,
        [campaignId]
      )
      const projectId = projectRows[0].id as string
      const { rows: assignmentRows } = await client.query(
        `INSERT INTO company_ca_project_assignments (
           company_ca_identity_id, company_ca_user_id, company_user_id, project_id, status, assigned_by
         ) VALUES ($1, 22, 3, $2, 'active', 3) RETURNING id`,
        [PG_TEST_VERIFIER_IDENTITY_ID, projectId]
      )
      const assignmentId = assignmentRows[0].id

      const result = await callPublish(client, campaignId)
      expect(result.ok).toBe(true)
      const assignments = await readCampaignAssignments(client, campaignId)
      expect(assignments).toHaveLength(1)
      expect(assignments[0]).toMatchObject({ id: assignmentId, status: 'active' })
    })
  })

  it('reactivates an eligible inactive assignment in the publication transaction', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId, undefined, { status: 'active' })
      const { rows: projectRows } = await client.query(
        `INSERT INTO csr_projects (campaign_id, company_user_id, ngo_user_id, title, project_status)
         VALUES ($1, 3, 12, 'Existing project', 'active') RETURNING id`,
        [campaignId]
      )
      await client.query(
        `INSERT INTO company_ca_project_assignments (
           company_ca_identity_id, company_ca_user_id, company_user_id, project_id, status,
           assigned_by, deactivated_at
         ) VALUES ($1, 22, 3, $2, 'inactive', 3, now())`,
        [PG_TEST_VERIFIER_IDENTITY_ID, projectRows[0].id]
      )

      const result = await callPublish(client, campaignId)
      expect(result.ok).toBe(true)
      const assignments = await readCampaignAssignments(client, campaignId)
      expect(assignments).toHaveLength(1)
      expect(assignments[0]).toMatchObject({
        company_ca_identity_id: PG_TEST_VERIFIER_IDENTITY_ID,
        company_user_id: 3,
        status: 'active',
      })
    })
  })

  it('is idempotent for an active campaign that already has a project', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId)
      const first = await callPublish(client, campaignId)
      expect(first.created).toBe(true)

      const second = await callPublish(client, campaignId)
      expect(second.ok).toBe(true)
      expect(second.created).toBe(false)
      expect(second.repaired).toBe(false)
      expect(second.project_id).toBe(first.project_id)
      expect(second.outcome).toBe('already_published')

      const { rows: projects } = await client.query(
        'SELECT count(*)::int AS c FROM csr_projects WHERE campaign_id = $1',
        [campaignId]
      )
      expect(projects[0].c).toBe(1)
      expect(await readCampaignAssignments(client, campaignId)).toHaveLength(1)
    })
  })

  it('rejects an existing project with a conflicting assignment and rolls back repair writes', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId, undefined, { status: 'active' })
      const { rows: projectRows } = await client.query(
        `INSERT INTO csr_projects (campaign_id, company_user_id, ngo_user_id, title, project_status)
         VALUES ($1, 3, 12, 'Existing project', 'active') RETURNING id`,
        [campaignId]
      )
      await client.query(
        'ALTER TABLE company_ca_project_assignments DISABLE TRIGGER trg_company_ca_project_assignment_eligibility'
      )
      try {
        await client.query(
          `INSERT INTO company_ca_project_assignments (
             company_ca_identity_id, company_ca_user_id, company_user_id, project_id, status, assigned_by
           ) VALUES ($1, 22, 40, $2, 'active', 40)`,
          [PG_TEST_VERIFIER_IDENTITY_ID, projectRows[0].id]
        )
      } finally {
        await client.query(
          'ALTER TABLE company_ca_project_assignments ENABLE TRIGGER trg_company_ca_project_assignment_eligibility'
        )
      }

      await expect(callPublish(client, campaignId)).rejects.toThrow(/evidence_verifier_assignment_conflict/)

      const { rows: state } = await client.query(
        `SELECT c.status::text AS campaign_status,
                (SELECT count(*)::int FROM csr_projects WHERE campaign_id = c.id) AS projects,
                (SELECT count(*)::int FROM csr_project_milestones WHERE campaign_id = c.id) AS milestones,
                (SELECT count(*)::int FROM csr_audit_log
                 WHERE entity_id = c.id AND event_type IN ('campaign_published', 'campaign_publish_repaired')) AS audits
         FROM campaigns c WHERE c.id = $1`,
        [campaignId]
      )
      expect(state[0]).toEqual({
        campaign_status: 'active',
        projects: 1,
        milestones: 0,
        audits: 0,
      })
      expect(await readCampaignAssignments(client, campaignId)).toMatchObject([
        { company_user_id: 40, status: 'active' },
      ])
    })
  })

  it('rejects an ineligible existing project without creating an assignment', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId, undefined, { status: 'active' })
      await client.query(
        `INSERT INTO csr_projects (campaign_id, company_user_id, ngo_user_id, title, project_status)
         VALUES ($1, 3, 12, 'Completed project', 'completed')`,
        [campaignId]
      )

      await expect(callPublish(client, campaignId)).rejects.toThrow(/project_ineligible/)

      const { rows: state } = await client.query(
        `SELECT c.status::text AS campaign_status,
                (SELECT count(*)::int FROM csr_projects WHERE campaign_id = c.id) AS projects,
                (SELECT count(*)::int FROM company_ca_project_assignments a
                 JOIN csr_projects p ON p.id = a.project_id WHERE p.campaign_id = c.id) AS assignments,
                (SELECT count(*)::int FROM csr_audit_log
                 WHERE entity_id = c.id AND event_type IN ('campaign_published', 'campaign_publish_repaired')) AS audits
         FROM campaigns c WHERE c.id = $1`,
        [campaignId]
      )
      expect(state[0]).toEqual({
        campaign_status: 'active',
        projects: 1,
        assignments: 0,
        audits: 0,
      })
    })
  })

  it.each([
    ['company', 40, 12],
    ['lead NGO', 3, 40],
  ])('rejects an existing project with mismatched %s ownership', async (_label, companyUserId, ngoUserId) => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId, undefined, { status: 'active' })
      await client.query(
        `INSERT INTO csr_projects (campaign_id, company_user_id, ngo_user_id, title, project_status)
         VALUES ($1, $2, $3, 'Mismatched project', 'active')`,
        [campaignId, companyUserId, ngoUserId]
      )

      await expect(callPublish(client, campaignId)).rejects.toThrow(/project_scope_conflict/)
      expect(await readCampaignAssignments(client, campaignId)).toHaveLength(0)
      const { rows: auditRows } = await client.query(
        `SELECT count(*)::int AS c FROM csr_audit_log
         WHERE entity_id = $1 AND event_type IN ('campaign_published', 'campaign_publish_repaired')`,
        [campaignId]
      )
      expect(auditRows[0].c).toBe(0)
    })
  })

  it('reconciles only missing milestone orders on a partial project', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      const milestones = [
        { title: 'A', budget_allocated: 1 },
        { title: 'B', budget_allocated: 2 },
        { title: 'C', budget_allocated: 3 },
      ]
      await seedDraftCampaign(client, campaignId, milestones)
      const first = await callPublish(client, campaignId, milestones)
      expect(first.ok).toBe(true)

      await client.query(
        `DELETE FROM csr_project_milestones WHERE project_id = $1 AND milestone_order = 2`,
        [first.project_id]
      )

      const before = await client.query(
        `SELECT title, amount FROM csr_project_milestones WHERE project_id = $1 AND milestone_order = 1`,
        [first.project_id]
      )
      const originalTitle = before.rows[0].title

      const reconciled = await callPublish(client, campaignId, milestones)
      expect(reconciled.ok).toBe(true)
      expect(reconciled.milestones_created).toBe(1)
      expect(reconciled.outcome).toBe('milestones_reconciled')

      const { rows } = await client.query(
        `SELECT milestone_order, title, amount FROM csr_project_milestones
         WHERE project_id = $1 ORDER BY milestone_order`,
        [first.project_id]
      )
      expect(rows).toHaveLength(3)
      expect(rows[0].title).toBe(originalTitle)
      expect(rows.map((row) => row.milestone_order)).toEqual([1, 2, 3])
    })
  })

  it('rejects conflicting duplicate milestone orders without leaving a partial publish', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      // Drop unique so we can seed a conflict that the RPC must detect.
      await client.query(`DROP INDEX IF EXISTS csr_project_milestones_project_order_uidx`)

      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId, [{ title: 'Only', budget_allocated: 1 }], {
        status: 'active',
      })
      const { rows: projectRows } = await client.query(
        `INSERT INTO csr_projects (campaign_id, company_user_id, ngo_user_id, title)
         VALUES ($1, 3, 12, 'Partial') RETURNING id`,
        [campaignId]
      )
      const projectId = projectRows[0].id
      await client.query(
        `INSERT INTO csr_project_milestones (project_id, campaign_id, title, milestone_order, amount)
         VALUES ($1, $2, 'Dup A', 1, 10), ($1, $2, 'Dup B', 1, 20)`,
        [projectId, campaignId]
      )

      await expect(
        callPublish(client, campaignId, [
          { title: 'A', budget_allocated: 1 },
          { title: 'B', budget_allocated: 2 },
        ])
      ).rejects.toThrow(/milestone_conflict/)

      const { rows: campaigns } = await client.query(
        `SELECT status::text AS status, title FROM campaigns WHERE id = $1`,
        [campaignId]
      )
      expect(campaigns[0].status).toBe('active')
      expect(campaigns[0].title).toBe('Clean Water')
    })
  })

  it('reconciles missing milestones concurrently without duplicates', async () => {
    await withPgTest(async (setup) => {
      await resetPublishFixture(setup)
      const campaignId = randomUUID()
      const milestones = [
        { title: 'A', budget_allocated: 1 },
        { title: 'B', budget_allocated: 2 },
        { title: 'C', budget_allocated: 3 },
      ]
      await seedDraftCampaign(setup, campaignId, milestones)
      const first = await callPublish(setup, campaignId, milestones)
      await setup.query('DELETE FROM csr_project_milestones WHERE project_id = $1', [first.project_id])

      const run = async () => {
        const client = await connectPgTest()
        try {
          return await callPublish(client, campaignId, milestones)
        } finally {
          await client.end()
        }
      }

      const results = await Promise.all([run(), run(), run()])
      expect(results.every((row) => row.ok === true)).toBe(true)

      const { rows } = await setup.query(
        `SELECT milestone_order, count(*)::int AS c
         FROM csr_project_milestones WHERE project_id = $1
         GROUP BY milestone_order ORDER BY milestone_order`,
        [first.project_id]
      )
      expect(rows).toEqual([
        { milestone_order: 1, c: 1 },
        { milestone_order: 2, c: 1 },
        { milestone_order: 3, c: 1 },
      ])
    })
  })

  it('rejects invalid milestone amounts without writing', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId)

      const result = await callPublish(client, campaignId, [
        { title: 'Bad', budget_allocated: 'not-a-number' },
      ])
      expect(result.ok).toBe(false)
      expect(result.error_code).toBe('invalid_milestone_amount')

      const { rows: campaigns } = await client.query(
        `SELECT status::text AS status FROM campaigns WHERE id = $1`,
        [campaignId]
      )
      expect(campaigns[0].status).toBe('draft')
      const { rows: projects } = await client.query(
        `SELECT count(*)::int AS c FROM csr_projects WHERE campaign_id = $1`,
        [campaignId]
      )
      expect(projects[0].c).toBe(0)
    })
  })

  it('rejects publish when lead NGO has not accepted', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId, undefined, { leadAccepted: false })

      const result = await callPublish(client, campaignId)
      expect(result.ok).toBe(false)
      expect(result.error_code).toBe('lead_ngo_not_accepted')
    })
  })

  it('enforces unique constraints for projects, milestones, attendance, and failure audits', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const campaignId = randomUUID()
      await seedDraftCampaign(client, campaignId)
      const published = await callPublish(client, campaignId)
      const projectId = String(published.project_id)

      await expect(
        client.query(
          `INSERT INTO csr_projects (campaign_id, company_user_id, ngo_user_id, title)
           VALUES ($1, 3, 12, 'dup project')`,
          [campaignId]
        )
      ).rejects.toMatchObject({ code: '23505' })

      await expect(
        client.query(
          `INSERT INTO csr_project_milestones
             (project_id, campaign_id, title, milestone_order, amount)
           VALUES ($1, $2, 'dup order', 1, 10)`,
          [projectId, campaignId]
        )
      ).rejects.toMatchObject({ code: '23505' })

      const assignmentId = randomUUID()
      await client.query(
        `INSERT INTO service_attendance_entries
           (assignment_id, target_type, target_id, attendance_date, marked_by_user_id, marked_for_user_id)
         VALUES ($1, 'campaign', $2, '2026-11-04', 3, 12)`,
        [assignmentId, campaignId]
      )
      await expect(
        client.query(
          `INSERT INTO service_attendance_entries
             (assignment_id, target_type, target_id, attendance_date, marked_by_user_id, marked_for_user_id)
           VALUES ($1, 'campaign', $2, '2026-11-04', 3, 12)`,
          [assignmentId, campaignId]
        )
      ).rejects.toMatchObject({ code: '23505' })

      const failHash = `campaign_publish_failed:${campaignId}:rpc_error`
      await client.query(
        `INSERT INTO csr_audit_log (entity_type, entity_id, event_type, event_hash, event_payload, created_by)
         VALUES ('campaign', $1, 'campaign_publish_failed', $2, '{}'::jsonb, 3)`,
        [campaignId, failHash]
      )

      const insertFail = async () => {
        const c = await connectPgTest()
        try {
          return await c.query(
            `INSERT INTO csr_audit_log (entity_type, entity_id, event_type, event_hash, event_payload, created_by)
             VALUES ('campaign', $1, 'campaign_publish_failed', $2, '{"n":1}'::jsonb, 3)`,
            [campaignId, failHash]
          )
        } finally {
          await c.end()
        }
      }

      const failures = await Promise.allSettled([insertFail(), insertFail(), insertFail()])
      expect(failures.filter((row) => row.status === 'rejected').length).toBeGreaterThanOrEqual(2)

      const { rows } = await client.query(
        `SELECT count(*)::int AS c FROM csr_audit_log WHERE event_hash = $1`,
        [failHash]
      )
      expect(rows[0].c).toBe(1)
    })
  })

  it('restricts RPC execution to the service role and function owner', async () => {
    await withPgTest(async (client) => {
      await resetPublishFixture(client)
      const { rows } = await client.query(
        `SELECT grantee
         FROM information_schema.role_routine_grants
         WHERE specific_schema = 'public'
           AND routine_name = 'publish_campaign_with_project'
           AND privilege_type = 'EXECUTE'
           AND grantee IN ('PUBLIC', 'anon', 'authenticated')
         ORDER BY grantee`
      )
      expect(rows).toEqual([])

      const { rows: roleRows } = await client.query(
        `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') AS service_role_exists`
      )
      if (roleRows[0].service_role_exists) {
        expect(
          await client.query(
            `SELECT has_function_privilege(
              'service_role',
              'publish_campaign_with_project(uuid,integer,integer,text,text,text,text,numeric,jsonb,text,integer[],integer,jsonb,jsonb,date,date,text,numeric,integer,timestamptz,text)',
              'EXECUTE'
            ) AS can_execute`
          ).then(({ rows: privileges }) => privileges[0].can_execute)
        ).toBe(true)
      }
    })
  })
})
