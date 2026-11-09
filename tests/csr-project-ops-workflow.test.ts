import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createSupabaseFake, type FakeResult } from './support/supabase-fake'
import { tokenFor, jsonRequest } from './support/requests'
import './support/install-test-auth'
import { generateAdminToken } from '@/lib/auth'
import {
  aggregateProjectExpenses,
  buildCompanyCaProjectFinanceReport,
  reconcileMaterialQuantities,
} from '@/lib/csr-agent/project-ops-finance'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getCompanyCAFromRequest: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  supabase: { from: mocks.from },
}))

vi.mock('@/lib/server-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server-auth')>()
  return {
    ...actual,
    getCompanyCAFromRequest: mocks.getCompanyCAFromRequest,
  }
})

import { POST as postExpense, GET as getExpenses } from '@/app/api/csr-projects/[id]/expenses/route'
import { POST as reviewExpense } from '@/app/api/csr-projects/[id]/expenses/[expenseId]/review/route'
import { POST as postMaterial } from '@/app/api/csr-projects/[id]/materials/route'
import { POST as resubmitExpense } from '@/app/api/csr-projects/[id]/expenses/[expenseId]/resubmit/route'
import {
  canReviewProjectOps,
  canSubmitProjectOps,
  type CsrProjectRow,
  type ProjectOpsActor,
} from '@/lib/csr-agent/project-ops-access'
import { submitNgoProjectExpense, reviewProjectExpense } from '@/lib/csr-agent/project-expense-write'
import { submitNgoProjectMaterial } from '@/lib/csr-agent/project-material-write'

const PROJECT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const OTHER_PROJECT = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'
const EXPENSE_ID = 'cccccccc-dddd-eeee-ffff-000000000001'
const MATERIAL_ID = 'dddddddd-eeee-ffff-0000-000000000002'

const ownProject: CsrProjectRow = {
  id: PROJECT,
  title: 'Own',
  company_user_id: 40,
  ngo_user_id: 12,
  campaign_id: 'eeeeeeee-ffff-0000-1111-222222222222',
  campaigns: { lead_ngo_user_id: 12 },
  total_budget: 100000,
}

const otherOrgProject: CsrProjectRow = {
  ...ownProject,
  id: OTHER_PROJECT,
  company_user_id: 99,
  ngo_user_id: 55,
}

function useDb(responses: Record<string, FakeResult[]> | ((query: { table: string; op: string }) => FakeResult | undefined)) {
  const fake = createSupabaseFake(typeof responses === 'function' ? responses : responses)
  mocks.from.mockImplementation(fake.from)
  return fake
}

beforeEach(() => {
  mocks.from.mockReset()
  mocks.getCompanyCAFromRequest.mockReset()
  mocks.getCompanyCAFromRequest.mockRejectedValue(new Error('Evidence Verifier authentication required'))
  vi.stubEnv('JWT_SECRET', 'test-secret')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('project ops authorization helpers', () => {
  it('lets NGO submit only on its assigned project', () => {
    const ngo: ProjectOpsActor = { role: 'ngo', userId: 12 }
    expect(canSubmitProjectOps(ngo, ownProject)).toBe(true)
    expect(canSubmitProjectOps(ngo, otherOrgProject)).toBe(false)
    expect(canReviewProjectOps(ngo, ownProject)).toBe(false)
  })

  it('lets Company CA review only assigned company projects', () => {
    const ca: ProjectOpsActor = {
      role: 'company_ca',
      userId: 7,
      companyUserId: 40,
      companyCAIdentityId: 'ca-1',
      canReview: true,
      assignedProjectIds: [ownProject.id],
    }
    expect(canReviewProjectOps(ca, ownProject)).toBe(true)
    expect(canReviewProjectOps(ca, otherOrgProject)).toBe(false)
    expect(canSubmitProjectOps(ca, ownProject)).toBe(false)

    const unassigned: ProjectOpsActor = {
      ...ca,
      assignedProjectIds: [],
    }
    expect(canReviewProjectOps(unassigned, ownProject)).toBe(false)
  })
})

describe('NGO expense submission', () => {
  const flagged = {
    id: EXPENSE_ID, project_id: PROJECT, created_by: 12, source_type: 'ngo_submission',
    source_reference: 'ref', approval_status: 'unreconciled', payment_status: 'unpaid',
    updated_at: '2026-01-01T00:00:00Z', category: 'materials', amount: 25,
    description: 'Original', expense_date: '2026-01-01', receipt_url: 'https://example.test/old',
    metadata: { review_reason: 'Provide invoice', review_action: 'unreconciled', reviewed_by_user_id: 7 },
  }
  const correction = { category: 'materials', amount: 30, description: 'Corrected', expense_date: '2026-01-01', receipt_url: 'https://example.test/new' }
  const resubmitRequest = (id = 12) => jsonRequest(`http://localhost/api/csr-projects/${PROJECT}/expenses/${EXPENSE_ID}/resubmit`, {
    token: tokenFor(id, 'ngo'), body: correction,
  })
  const resubmitContext = { params: Promise.resolve({ id: PROJECT, expenseId: EXPENSE_ID }) }

  it('assigns distinct references to separate expenses with identical amounts and dates', async () => {
    const fake = useDb({ 'csr_project_expenses.insert': [{ data: { id: 'one' } }, { data: { id: 'two' } }] })
    const input = {
      project: ownProject,
      actor: { role: 'ngo' as const, userId: 12 },
      body: correction,
    }
    expect((await submitNgoProjectExpense(input)).ok).toBe(true)
    expect((await submitNgoProjectExpense(input)).ok).toBe(true)
    const writes = fake.writes('csr_project_expenses', 'insert')
    const first = writes[0].payload as { source_reference: string }
    const second = writes[1].payload as { source_reference: string }
    expect(first.source_reference).not.toBe(second.source_reference)
  })

  it('resubmits a flagged expense with the original submission and verifier decision preserved', async () => {
    const fake = useDb({
      'csr_projects.select': [{ data: ownProject }],
      'csr_project_expenses.select': [{ data: flagged }],
      'csr_project_expenses.update': [{ data: { ...flagged, approval_status: 'proposed' } }],
    })
    const response = await resubmitExpense(resubmitRequest(), resubmitContext)
    expect(response.status).toBe(200)
    const update = fake.writes('csr_project_expenses')[0]
    expect(update.payload).toMatchObject({
      approval_status: 'proposed', amount: 30, description: 'Corrected',
      metadata: { review_reason: null, resubmission_history: [
        { amount: 25, description: 'Original', review_reason: 'Provide invoice', reviewed_by_user_id: 7 },
      ] },
    })
    expect(update.filters).toContainEqual(['eq', 'updated_at', flagged.updated_at])
    expect(update.filters).toContainEqual(['eq', 'payment_status', 'unpaid'])
  })

  it('resubmits an unpaid rejected expense and preserves the rejection reason', async () => {
    const rejected = { ...flagged, approval_status: 'rejected', metadata: { ...flagged.metadata, review_action: 'reject', review_reason: 'Incorrect invoice' } }
    const fake = useDb({
      'csr_projects.select': [{ data: ownProject }],
      'csr_project_expenses.select': [{ data: rejected }],
      'csr_project_expenses.update': [{ data: { ...rejected, approval_status: 'proposed' } }],
    })
    expect((await resubmitExpense(resubmitRequest(), resubmitContext)).status).toBe(200)
    const update = fake.writes('csr_project_expenses')[0]
    expect(update.payload).toMatchObject({
      approval_status: 'proposed',
      metadata: { review_reason: null, resubmission_history: [
        { approval_status: 'rejected', review_reason: 'Incorrect invoice', amount: 25 },
      ] },
    })
    expect(update.filters).toContainEqual(['eq', 'approval_status', 'rejected'])
    expect(update.filters).toContainEqual(['eq', 'payment_status', 'unpaid'])
  })

  it.each([
    ['another NGO', { ...flagged, created_by: 99 }, 403],
    ['approved', { ...flagged, approval_status: 'approved' }, 409],
    ['paid', { ...flagged, payment_status: 'paid' }, 409],
    ['automatic record', { ...flagged, source_type: 'engagement_settlement' }, 403],
  ])('does not resubmit %s expenses', async (_label, row, expected) => {
    const fake = useDb({ 'csr_projects.select': [{ data: ownProject }], 'csr_project_expenses.select': [{ data: row }] })
    const response = await resubmitExpense(resubmitRequest(), resubmitContext)
    expect(response.status).toBe(expected)
    expect(fake.writes('csr_project_expenses')).toHaveLength(0)
  })

  it('does not allow a participating NGO to resubmit a lead expense', async () => {
    const fake = useDb({ 'csr_projects.select': [{ data: { ...ownProject, campaigns: { lead_ngo_user_id: 55 } } }] })
    expect((await resubmitExpense(resubmitRequest(), resubmitContext)).status).toBe(403)
    expect(fake.find('csr_project_expenses')).toHaveLength(0)
  })

  it('reports concurrent changes rather than overwriting them', async () => {
    const fake = useDb({ 'csr_projects.select': [{ data: ownProject }], 'csr_project_expenses.select': [{ data: flagged }], 'csr_project_expenses.update': [{ data: null }] })
    expect((await resubmitExpense(resubmitRequest(), resubmitContext)).status).toBe(409)
    expect(fake.writes('csr_project_expenses')[0].filters).toContainEqual(['eq', 'updated_at', flagged.updated_at])
  })

  it('preserves earlier reconciliation rounds on a later resubmission', async () => {
    const previous = { review_reason: 'Earlier reason', amount: 10 }
    const fake = useDb({
      'csr_projects.select': [{ data: ownProject }],
      'csr_project_expenses.select': [{ data: { ...flagged, metadata: { ...flagged.metadata, resubmission_history: [previous] } } }],
      'csr_project_expenses.update': [{ data: { id: EXPENSE_ID } }],
    })
    expect((await resubmitExpense(resubmitRequest(), resubmitContext)).status).toBe(200)
    expect(fake.writes('csr_project_expenses')[0].payload).toMatchObject({
      metadata: { resubmission_history: [previous, { review_reason: 'Provide invoice' }] },
    })
  })

  it.each(['unreconciled', 'rejected'])('requires the NGO to resubmit before a %s expense can be reviewed again', async (approval_status) => {
    const fake = useDb({ 'csr_project_expenses.select': [{ data: { ...flagged, approval_status } }] })
    const result = await reviewProjectExpense({
      project: ownProject, actor: { role: 'admin', userId: 1 }, expenseId: EXPENSE_ID, action: 'approve',
    })
    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(fake.writes('csr_project_expenses')).toHaveLength(0)
  })

  it('uses the lead NGO session for expense submissions even when an admin cookie is present', async () => {
    const fake = useDb({
      'csr_projects.select': [{ data: ownProject }],
      'csr_project_expenses.insert': [{ data: { id: EXPENSE_ID, project_id: PROJECT } }],
    })
    const request = new NextRequest(`http://localhost/api/csr-projects/${PROJECT}/expenses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenFor(12, 'ngo')}`,
        cookie: `admin-token=${generateAdminToken()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ category: 'materials', amount: 25, description: 'Timber', receipt_url: 'https://example.test/receipt' }),
    })
    const response = await postExpense(request, { params: Promise.resolve({ id: PROJECT }) })
    expect(response.status).toBe(201)
    expect(fake.writes('csr_project_expenses', 'insert')[0].payload).toMatchObject({ created_by: 12 })
  })

  it('does not allow a non-lead NGO to submit using an accompanying admin cookie', async () => {
    const fake = useDb({ 'csr_projects.select': [{ data: otherOrgProject }] })
    const request = new NextRequest(`http://localhost/api/csr-projects/${OTHER_PROJECT}/expenses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenFor(12, 'ngo')}`,
        cookie: `admin-token=${generateAdminToken()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ category: 'other', amount: 25, description: 'Expense', receipt_url: 'https://example.test/receipt' }),
    })
    const response = await postExpense(request, { params: Promise.resolve({ id: OTHER_PROJECT }) })
    expect(response.status).toBe(403)
    expect(fake.writes('csr_project_expenses', 'insert')).toHaveLength(0)
  })

  it('uses the cookie-only lead NGO session when an administrator session is also present', async () => {
    const fake = useDb({
      'csr_projects.select': [{ data: ownProject }],
      'csr_project_expenses.insert': [{ data: { id: EXPENSE_ID, project_id: PROJECT } }],
    })
    const request = new NextRequest(`http://localhost/api/csr-projects/${PROJECT}/expenses`, {
      method: 'POST',
      headers: {
        cookie: `token=${tokenFor(12, 'ngo')}; admin-token=${generateAdminToken()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ category: 'materials', amount: 25, description: 'Timber', receipt_url: 'https://example.test/receipt' }),
    })
    const response = await postExpense(request, { params: Promise.resolve({ id: PROJECT }) })
    expect(response.status).toBe(201)
    expect(fake.writes('csr_project_expenses', 'insert')[0].payload).toMatchObject({ created_by: 12 })
  })

  it('uses the lead NGO session rather than an accompanying verifier session for material submission', async () => {
    mocks.getCompanyCAFromRequest.mockResolvedValue({
      user: { id: 7 },
      identity: { id: 'ca-1', company_user_id: 40, permissions: { can_review_evidence: true } },
    })
    const fake = useDb({
      'csr_projects.select': [{ data: ownProject }],
      'csr_project_materials.insert': [{ data: { id: MATERIAL_ID, project_id: PROJECT } }],
    })
    const response = await postMaterial(
      jsonRequest(`http://localhost/api/csr-projects/${PROJECT}/materials`, {
        token: tokenFor(12, 'ngo'),
        body: { name: 'Timber', item_kind: 'consumable' },
      }),
      { params: Promise.resolve({ id: PROJECT }) }
    )
    expect(response.status).toBe(201)
    expect(fake.writes('csr_project_materials', 'insert')[0].payload).toMatchObject({ created_by: 12 })
  })

  it('uses the NGO session and scopes the own-expenses view despite an admin cookie', async () => {
    const fake = useDb({
      'csr_projects.select': [{ data: ownProject }],
      'csr_project_expenses.select': [{ data: [] }],
    })
    const request = new NextRequest(`http://localhost/api/csr-projects/${PROJECT}/expenses?mine=1`, {
      headers: { cookie: `token=${tokenFor(12, 'ngo')}; admin-token=${generateAdminToken()}` },
    })
    const response = await getExpenses(request, { params: Promise.resolve({ id: PROJECT }) })
    expect(response.status).toBe(200)
    expect(fake.find('csr_project_expenses')[0].filters).toContainEqual(['eq', 'created_by', 12])
  })

  it('does not return all expenses to an admin when an NGO session is missing from the own-expenses request', async () => {
    const fake = useDb({})
    const request = new NextRequest(`http://localhost/api/csr-projects/${PROJECT}/expenses?mine=1`, {
      headers: { cookie: `admin-token=${generateAdminToken()}` },
    })
    const response = await getExpenses(request, { params: Promise.resolve({ id: PROJECT }) })
    expect(response.status).toBe(403)
    expect(fake.find('csr_project_expenses')).toHaveLength(0)
  })

  it('denies an assigned non-lead NGO despite another active portal session', async () => {
    const fake = useDb({
      'csr_projects.select': [{ data: { ...ownProject, campaigns: { lead_ngo_user_id: 55 } } }],
    })
    const request = new NextRequest(`http://localhost/api/csr-projects/${PROJECT}/expenses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenFor(12, 'ngo')}`,
        cookie: `admin-token=${generateAdminToken()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ category: 'other', amount: 25, description: 'Expense', receipt_url: 'https://example.test/receipt' }),
    })
    const response = await postExpense(request, { params: Promise.resolve({ id: PROJECT }) })
    expect(response.status).toBe(403)
    expect(fake.writes('csr_project_expenses', 'insert')).toHaveLength(0)
  })

  it('scopes the own-expenses view to the authorized NGO account', async () => {
    const fake = useDb({
      'csr_projects.select': [{ data: ownProject }],
      'csr_project_expenses.select': [{ data: [] }],
    })
    const response = await getExpenses(
      jsonRequest(`http://localhost/api/csr-projects/${PROJECT}/expenses?mine=1`, { token: tokenFor(12, 'ngo') }),
      { params: Promise.resolve({ id: PROJECT }) }
    )
    expect(response.status).toBe(200)
    expect(fake.find('csr_project_expenses')[0].filters).toContainEqual(['eq', 'created_by', 12])
  })

  it('1. NGO can submit an expense for an authorized project', async () => {
    const fake = useDb({
      'csr_projects.select': [{ data: ownProject }],
      'csr_project_expenses.insert': [
        {
          data: {
            id: EXPENSE_ID,
            project_id: PROJECT,
            approval_status: 'proposed',
            payment_status: 'unpaid',
            amount: 2500,
            category: 'materials',
          },
        },
      ],
    })

    const res = await postExpense(
      jsonRequest(`http://localhost/api/csr-projects/${PROJECT}/expenses`, {
        token: tokenFor(12, 'ngo'),
        body: {
          category: 'materials',
          amount: 2500,
          description: 'Timber purchase',
          expense_date: '2026-03-01',
          receipt_url: 'https://example.test/r.pdf',
          source_type: 'ngo_submission',
          source_reference: 'ref-1',
        },
      }),
      { params: Promise.resolve({ id: PROJECT }) }
    )

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.data).toMatchObject({ approval_status: 'proposed', payment_status: 'unpaid' })
    expect(fake.writes('csr_project_expenses', 'insert')[0].payload).toMatchObject({
      approval_status: 'proposed',
      payment_status: 'unpaid',
      created_by: 12,
      category: 'materials',
      amount: 2500,
    })
  })

  it('2. NGO cannot submit against another organization project', async () => {
    useDb({
      'csr_projects.select': [{ data: otherOrgProject }],
    })

    const res = await postExpense(
      jsonRequest(`http://localhost/api/csr-projects/${OTHER_PROJECT}/expenses`, {
        token: tokenFor(12, 'ngo'),
        body: {
          category: 'other',
          amount: 100,
          description: 'x',
          receipt_url: 'https://example.test/r.pdf',
        },
      }),
      { params: Promise.resolve({ id: OTHER_PROJECT }) }
    )

    expect(res.status).toBe(403)
  })

  it('3. NGO cannot approve its own expense', async () => {
    useDb({
      'csr_projects.select': [{ data: ownProject }],
    })

    const res = await reviewExpense(
      jsonRequest(`http://localhost/api/csr-projects/${PROJECT}/expenses/${EXPENSE_ID}/review`, {
        token: tokenFor(12, 'ngo'),
        body: { action: 'approve' },
      }),
      { params: Promise.resolve({ id: PROJECT, expenseId: EXPENSE_ID }) }
    )

    expect(res.status).toBe(403)
  })
})

describe('Company CA expense review', () => {
  function asCa(companyUserId = 40) {
    mocks.getCompanyCAFromRequest.mockResolvedValue({
      user: { id: 7, email: 'ca@co.test', name: 'CA' },
      identity: {
        id: 'ca-identity-1',
        company_user_id: companyUserId,
        permissions: { can_review_evidence: true },
      },
    })
  }

  const assignedToProject = {
    'company_ca_project_assignments.select': [{ data: [{ project_id: PROJECT }] }],
  }

  it('4. Company CA can review expenses belonging to its company', async () => {
    asCa(40)
    const fake = useDb({
      ...assignedToProject,
      'csr_projects.select': [{ data: ownProject }],
      'csr_project_expenses.select': [
        {
          data: {
            id: EXPENSE_ID,
            project_id: PROJECT,
            approval_status: 'proposed',
            payment_status: 'unpaid',
            amount: 2500,
            category: 'materials',
            metadata: {},
          },
        },
      ],
      'csr_project_expenses.update': [
        {
          data: {
            id: EXPENSE_ID,
            approval_status: 'approved',
            payment_status: 'unpaid',
            approved_by: 7,
          },
        },
      ],
      'company_ca_action_log.insert': [{ data: { id: 'log-1' } }],
      'csr_audit_log.insert': [{ data: { id: 'aud-1' } }],
    })

    const res = await reviewExpense(
      jsonRequest(`http://localhost/api/csr-projects/${PROJECT}/expenses/${EXPENSE_ID}/review`, {
        body: { action: 'approve' },
      }),
      { params: Promise.resolve({ id: PROJECT, expenseId: EXPENSE_ID }) }
    )

    expect(res.status).toBe(200)
    expect((await res.json()).data.approval_status).toBe('approved')
    expect(fake.writes('csr_project_expenses', 'update')[0].payload).toMatchObject({
      approval_status: 'approved',
      approved_by: 7,
    })
  })

  it('5. Company CA cannot review another company project', async () => {
    asCa(40)
    useDb({
      'csr_projects.select': [{ data: otherOrgProject }],
    })

    const res = await reviewExpense(
      jsonRequest(`http://localhost/api/csr-projects/${OTHER_PROJECT}/expenses/${EXPENSE_ID}/review`, {
        body: { action: 'approve' },
      }),
      { params: Promise.resolve({ id: OTHER_PROJECT, expenseId: EXPENSE_ID }) }
    )

    expect(res.status).toBe(403)
  })

  it('6. Approval, rejection and unreconciled actions persist correctly', async () => {
    const proposed = {
      id: EXPENSE_ID,
      project_id: PROJECT,
      approval_status: 'proposed',
      payment_status: 'unpaid',
      amount: 100,
      category: 'other',
      metadata: {},
    }

    const actor = {
      role: 'company_ca' as const,
      userId: 7,
      companyUserId: 40,
      companyCAIdentityId: 'ca-1',
      canReview: true,
      assignedProjectIds: [PROJECT],
    }

    for (const [action, next] of [
      ['approve', 'approved'],
      ['reject', 'rejected'],
      ['unreconciled', 'unreconciled'],
    ] as const) {
      const fake = useDb({
        'csr_project_expenses.select': [{ data: { ...proposed } }],
        'csr_project_expenses.update': [{ data: { ...proposed, approval_status: next } }],
        'company_ca_action_log.insert': [{ data: { id: 'l' } }],
        'csr_audit_log.insert': [{ data: { id: 'a' } }],
      })
      const result = await reviewProjectExpense({
        project: ownProject,
        actor,
        expenseId: EXPENSE_ID,
        action,
        reason: action === 'approve' ? null : 'needs docs',
      })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.expense.approval_status).toBe(next)
      const updatePayload = fake.writes('csr_project_expenses', 'update')[0].payload as {
        approval_status?: string
      }
      expect(updatePayload.approval_status).toBe(next)
    }
  })

  it('7. Review actions create audit records', async () => {
    asCa(40)
    const fake = useDb({
      ...assignedToProject,
      'csr_projects.select': [{ data: ownProject }],
      'csr_project_expenses.select': [
        {
          data: {
            id: EXPENSE_ID,
            project_id: PROJECT,
            approval_status: 'proposed',
            payment_status: 'unpaid',
            amount: 500,
            category: 'equipment',
            metadata: {},
          },
        },
      ],
      'csr_project_expenses.update': [
        { data: { id: EXPENSE_ID, approval_status: 'rejected' } },
      ],
      'company_ca_action_log.insert': [{ data: { id: 'log-1' } }],
      'csr_audit_log.insert': [{ data: { id: 'aud-1' } }],
    })

    const res = await reviewExpense(
      jsonRequest(`http://localhost/api/csr-projects/${PROJECT}/expenses/${EXPENSE_ID}/review`, {
        body: { action: 'reject', reason: 'Missing invoice' },
      }),
      { params: Promise.resolve({ id: PROJECT, expenseId: EXPENSE_ID }) }
    )
    expect(res.status).toBe(200)

    expect(fake.writes('company_ca_action_log', 'insert')[0].payload).toMatchObject({
      company_ca_identity_id: 'ca-identity-1',
      project_id: PROJECT,
      action_type: 'expense_rejected',
    })
    expect(fake.writes('csr_audit_log', 'insert')[0].payload).toMatchObject({
      entity_type: 'csr_project_expense',
      entity_id: EXPENSE_ID,
      event_type: 'expense_rejected',
      created_by: 7,
    })
  })
})

describe('NGO materials submission', () => {
  it('8. Material submissions preserve quantity and consumable/reusable distinctions', async () => {
    const fake = useDb({
      'csr_projects.select': [{ data: ownProject }],
      'csr_project_materials.insert': [
        {
          data: {
            id: MATERIAL_ID,
            item_kind: 'reusable_equipment',
            procured_quantity: 4,
            returned_quantity: 1,
          },
        },
      ],
    })

    const res = await postMaterial(
      jsonRequest(`http://localhost/api/csr-projects/${PROJECT}/materials`, {
        token: tokenFor(12, 'ngo'),
        body: {
          name: 'Generator',
          description: 'Site generator',
          item_kind: 'reusable_equipment',
          required_quantity: 4,
          procured_quantity: 4,
          dispatched_quantity: 4,
          received_quantity: 4,
          returned_quantity: 1,
          outbound_shipment_ref: 'OUT-1',
          return_shipment_ref: 'RET-1',
          invoice_url: 'https://example.test/m.pdf',
        },
      }),
      { params: Promise.resolve({ id: PROJECT }) }
    )

    expect(res.status).toBe(201)
    const payload = fake.writes('csr_project_materials', 'insert')[0].payload as Record<string, unknown>
    expect(payload).toMatchObject({
      item_kind: 'reusable_equipment',
      procured_quantity: 4,
      returned_quantity: 1,
      outbound_shipment_ref: 'OUT-1',
      return_shipment_ref: 'RET-1',
    })
    expect((payload.metadata as Record<string, unknown>).cost_is_not_expense).toBe(true)
  })

  it('9. Outbound and return shipment references remain distinct', async () => {
    useDb({
      'csr_projects.select': [{ data: ownProject }],
    })

    const res = await postMaterial(
      jsonRequest(`http://localhost/api/csr-projects/${PROJECT}/materials`, {
        token: tokenFor(12, 'ngo'),
        body: {
          name: 'Paint',
          item_kind: 'consumable',
          outbound_shipment_ref: 'SAME',
          return_shipment_ref: 'SAME',
        },
      }),
      { params: Promise.resolve({ id: PROJECT }) }
    )

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/distinct/i) })
  })

  it('10. Material costs are not automatically double-counted as expenses', async () => {
    const report = buildCompanyCaProjectFinanceReport({
      project: {
        id: PROJECT,
        title: 'Demo',
        total_budget: 50000,
        company_user_id: 40,
        ngo_user_id: 12,
      },
      materials: [
        {
          name: 'Cement',
          item_kind: 'consumable',
          procured_quantity: 100,
          unit_cost: 400,
          total_cost: 40000,
        },
      ],
      expenses: [
        {
          project_id: PROJECT,
          category: 'materials',
          amount: 40000,
          approval_status: 'approved',
          payment_status: 'paid',
          source_type: 'ngo_submission',
          source_reference: 'cement-po-1',
        },
      ],
    })

    // Material purchase_cost is informational; actual expenditure comes only from expense ledger.
    expect(report.materials[0].purchase_cost).toBe(40000)
    expect(report.expenses.actual_expenditure).toBe(40000)
    expect(report.expenses.by_category_actual.materials).toBe(40000)

    // Without a separate expense, material cost does not inflate actual expenditure.
    const materialsOnly = buildCompanyCaProjectFinanceReport({
      project: { id: PROJECT, title: 'Demo', total_budget: 50000 },
      materials: [
        {
          name: 'Cement',
          item_kind: 'consumable',
          procured_quantity: 100,
          unit_cost: 400,
          total_cost: 40000,
        },
      ],
      expenses: [],
    })
    expect(materialsOnly.materials[0].purchase_cost).toBe(40000)
    expect(materialsOnly.expenses.actual_expenditure).toBe(0)
  })
})

describe('financial history integrity', () => {
  it('11. Approved and paid records cannot be improperly overwritten', async () => {
    const actor = {
      role: 'company_ca' as const,
      userId: 7,
      companyUserId: 40,
      companyCAIdentityId: 'ca-1',
      canReview: true,
      assignedProjectIds: [PROJECT],
    }

    useDb({
      'csr_project_expenses.select': [
        {
          data: {
            id: EXPENSE_ID,
            project_id: PROJECT,
            approval_status: 'approved',
            payment_status: 'paid',
            amount: 900,
            category: 'materials',
            metadata: {},
          },
        },
      ],
    })

    const paid = await reviewProjectExpense({
      project: ownProject,
      actor,
      expenseId: EXPENSE_ID,
      action: 'reject',
      reason: 'too late',
    })
    expect(paid.ok).toBe(false)
    if (!paid.ok) expect(paid.status).toBe(409)

    useDb({
      'csr_project_expenses.select': [
        {
          data: {
            id: EXPENSE_ID,
            project_id: PROJECT,
            approval_status: 'approved',
            payment_status: 'unpaid',
            amount: 900,
            category: 'materials',
            metadata: {},
          },
        },
      ],
    })

    const approved = await reviewProjectExpense({
      project: ownProject,
      actor,
      expenseId: EXPENSE_ID,
      action: 'unreconciled',
      reason: 'reopen',
    })
    expect(approved.ok).toBe(false)
    if (!approved.ok) expect(approved.status).toBe(409)
  })

  it('12. Project finance aggregation reflects resulting records', () => {
    const agg = aggregateProjectExpenses({
      totalBudget: 100000,
      expenses: [
        {
          project_id: PROJECT,
          category: 'materials',
          amount: 2500,
          approval_status: 'approved',
          payment_status: 'unpaid',
        },
        {
          project_id: PROJECT,
          category: 'worker_wages',
          amount: 1500,
          approval_status: 'approved',
          payment_status: 'paid',
          source_type: 'engagement_settlement',
          source_reference: 'asg-1',
        },
        {
          project_id: PROJECT,
          category: 'other',
          amount: 300,
          approval_status: 'proposed',
          payment_status: 'unpaid',
        },
        {
          project_id: PROJECT,
          category: 'equipment',
          amount: 700,
          approval_status: 'unreconciled',
          payment_status: 'unpaid',
        },
      ],
    })

    expect(agg.actual_expenditure).toBe(4000)
    expect(agg.amount_paid).toBe(1500)
    expect(agg.outstanding_amount).toBe(2500)
    expect(agg.proposed_expenditure).toBe(1000)
    expect(agg.unreconciled_amount).toBe(700)
    expect(agg.budget_variance).toBe(96000)

    const consumable = reconcileMaterialQuantities({
      name: 'Paint',
      item_kind: 'consumable',
      procured_quantity: 10,
      dispatched_quantity: 10,
      received_quantity: 10,
      consumed_quantity: 6,
      damaged_quantity: 1,
      missing_quantity: 0,
      returned_quantity: 0,
    })
    expect(consumable.remaining_on_site).toBe(3)

    const reusable = reconcileMaterialQuantities({
      name: 'Drill',
      item_kind: 'reusable_equipment',
      procured_quantity: 2,
      dispatched_quantity: 2,
      received_quantity: 2,
      consumed_quantity: 2,
      returned_quantity: 1,
    })
    // Consumption does not erase reusable stock; returns do.
    expect(reusable.remaining_on_site).toBe(1)
  })
})

describe('NGO submit write helpers reject invalid payloads', () => {
  it('rejects NGO worker_wages category (system-owned)', async () => {
    const result = await submitNgoProjectExpense({
      project: ownProject,
      actor: { role: 'ngo', userId: 12 },
      body: {
        category: 'worker_wages',
        amount: 100,
        description: 'wages',
        receipt_url: 'https://example.test/r.pdf',
      },
    })
    expect(result.ok).toBe(false)
  })

  it('rejects material without name', async () => {
    const result = await submitNgoProjectMaterial({
      project: ownProject,
      actor: { role: 'ngo', userId: 12 },
      body: { name: '', item_kind: 'consumable' },
    })
    expect(result.ok).toBe(false)
  })
})

describe('list expenses auth', () => {
  it('company CA can list expenses for in-scope project', async () => {
    mocks.getCompanyCAFromRequest.mockResolvedValue({
      user: { id: 7, email: 'ca@co.test', name: 'CA' },
      identity: {
        id: 'ca-identity-1',
        company_user_id: 40,
        permissions: { can_review_evidence: true },
      },
    })
    useDb({
      'company_ca_project_assignments.select': [{ data: [{ project_id: PROJECT }] }],
      'csr_projects.select': [{ data: ownProject }],
      'csr_project_expenses.select': [{ data: [{ id: EXPENSE_ID, approval_status: 'proposed' }] }],
    })

    const res = await getExpenses(
      new NextRequest(`http://localhost/api/csr-projects/${PROJECT}/expenses`),
      { params: Promise.resolve({ id: PROJECT }) }
    )
    expect(res.status).toBe(200)
    expect((await res.json()).data).toHaveLength(1)
  })
})
