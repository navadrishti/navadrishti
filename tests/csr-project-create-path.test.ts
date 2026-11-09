/**
 * XR-C1 regression: CSR project creation must go through the Cycle 1.1 publish RPC path,
 * not a direct client insert API.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('XR-C1 CSR project create path', () => {
  it('keeps publishCampaignWithProject as the sole application create helper', () => {
    const helper = fs.readFileSync(
      path.join(process.cwd(), 'lib/csr-agent/campaign/create-project-on-publish.ts'),
      'utf8'
    )
    expect(helper).toMatch(/publish_campaign_with_project/)
    expect(helper).toMatch(/export async function publishCampaignWithProject/)
    // Direct table inserts must not reappear alongside the RPC.
    expect(helper).not.toMatch(/\.from\(\s*['"]csr_projects['"]\s*\)\s*\.insert/)
  })

  it('wires publish-campaign route to the RPC helper only', () => {
    const route = fs.readFileSync(
      path.join(process.cwd(), 'app/api/csr-agent/publish-campaign/route.ts'),
      'utf8'
    )
    expect(route).toMatch(/publishCampaignWithProject/)
    expect(route).not.toMatch(/\.from\(\s*['"]csr_projects['"]\s*\)\s*\.insert/)
  })

  it('requires Evidence Verifier before the atomic publication RPC', () => {
    const route = fs.readFileSync(
      path.join(process.cwd(), 'app/api/csr-agent/publish-campaign/route.ts'),
      'utf8'
    )
    expect(route).toMatch(/requireActiveEvidenceVerifierForPublish/)
    expect(route).not.toMatch(/materializeEvidenceVerifierAssignment/)
    expect(route).toMatch(/evidence_verifier_required/)
  })

  it('persists and validates the verifier in the publication RPC transaction', () => {
    const migration = fs.readFileSync(
      path.join(process.cwd(), 'sql/cycle-1.1/02_publish_campaign_with_project.up.sql'),
      'utf8'
    )
    expect(migration).toMatch(/permissions->'can_review_evidence'/)
    expect(migration).toMatch(/INSERT INTO public\.company_ca_project_assignments/)
    expect(migration).toMatch(/UPDATE public\.company_ca_project_assignments/)
    expect(migration).toMatch(/FOR UPDATE/)
  })
})
