import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  buildWageExpenseLedgerPayload,
  extractExplicitCsrProjectHints,
  syncWageExpenseFromSettlement,
  WAGE_EXPENSE_SOURCE_TYPE,
} from '@/lib/csr-agent/sync-wage-expense'
import { finalizeEngagementSettlement } from '@/lib/engagement-settlement'
import { calculateVerifiedWorkerWage } from '@/lib/csr-agent/project-ops-finance'
import { createSupabaseFake, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('@/lib/db', () => ({
  supabase: { from: mocks.from },
  db: {
    serviceRequestApplications: { update: vi.fn(async () => undefined) },
  },
}))

function useDb(responses: Record<string, FakeResult[]> | ((query: { table: string; op: string }) => FakeResult | undefined)) {
  const fake = createSupabaseFake(typeof responses === 'function' ? responses : responses)
  mocks.from.mockImplementation(fake.from)
  return fake
}

const PROJECT = '11111111-1111-1111-1111-111111111111'
const CAMPAIGN = '22222222-2222-2222-2222-222222222222'
const ASSIGNMENT = '33333333-3333-3333-3333-333333333333'

beforeEach(() => {
  mocks.from.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('extractExplicitCsrProjectHints', () => {
  it('reads csr_project target and meta campaign without guessing', () => {
    expect(
      extractExplicitCsrProjectHints({
        id: ASSIGNMENT,
        target_type: 'csr_project',
        target_id: PROJECT,
        owner_user_id: 12,
        assignee_user_id: 14,
        application_table: 'service_request_applications',
        meta: { campaign_id: CAMPAIGN },
      })
    ).toEqual({ projectIdHint: PROJECT, campaignIdHint: CAMPAIGN })
  })

  it('does not invent a project from a marketplace need assignment', () => {
    expect(
      extractExplicitCsrProjectHints({
        id: ASSIGNMENT,
        target_type: 'service_request',
        target_id: '99',
        owner_user_id: 12,
        assignee_user_id: 14,
        application_table: 'service_request_applications',
        meta: {},
      })
    ).toEqual({ projectIdHint: null, campaignIdHint: null })
  })
})

describe('buildWageExpenseLedgerPayload', () => {
  const assignment = {
    id: ASSIGNMENT,
    target_type: 'csr_project' as const,
    target_id: PROJECT,
    owner_user_id: 12,
    assignee_user_id: 14,
    application_table: 'service_request_applications' as const,
    meta: {},
  }

  it('maps a paid settlement to approved + paid worker_wages', () => {
    const payload = buildWageExpenseLedgerPayload({
      assignment,
      settledAmount: 1500,
      settlementMode: 'razorpay',
      razorpayOrderId: 'order_1',
      razorpayPaymentId: 'pay_1',
      payerUserId: 12,
      payeeUserId: 14,
      projectId: PROJECT,
      campaignId: CAMPAIGN,
    })
    expect(payload).toMatchObject({
      project_id: PROJECT,
      campaign_id: CAMPAIGN,
      category: 'worker_wages',
      amount: 1500,
      source_type: WAGE_EXPENSE_SOURCE_TYPE,
      source_reference: `${ASSIGNMENT}:pay_1`,
      approval_status: 'approved',
      payment_status: 'paid',
      vendor_or_recipient: 'worker:14',
    })
  })

  it('maps waived settlements to payment_status waived, not paid', () => {
    const payload = buildWageExpenseLedgerPayload({
      assignment,
      settledAmount: 400,
      settlementMode: 'waived',
      projectId: PROJECT,
      campaignId: null,
      payeeUserId: 14,
    })
    expect(payload?.payment_status).toBe('waived')
    expect(payload?.approval_status).toBe('approved')
  })

  it('skips zero-amount settlements', () => {
    expect(
      buildWageExpenseLedgerPayload({
        assignment,
        settledAmount: 0,
        settlementMode: 'waived',
        projectId: PROJECT,
        campaignId: null,
      })
    ).toBeNull()
  })
})

describe('calculateVerifiedWorkerWage gate', () => {
  it('does not generate wages from unverified attendance alone', () => {
    const wage = calculateVerifiedWorkerWage([
      { attendance_status: 'absent', wage_rate: 500, payment_status: 'pending' },
      { attendance_status: 'present', payment_status: 'pending' },
    ])
    expect(wage.wage_expense).toBe(0)
  })
})

describe('syncWageExpenseFromSettlement', () => {
  const assignment = {
    id: ASSIGNMENT,
    target_type: 'csr_project',
    target_id: PROJECT,
    owner_user_id: 12,
    assignee_user_id: 14,
    application_table: 'service_request_applications',
    meta: { campaign_id: CAMPAIGN },
  }

  it('creates one project expense for a verified wage settlement', async () => {
    const fake = useDb({
      'csr_projects.select': [{ data: { id: PROJECT, campaign_id: CAMPAIGN } }],
      'csr_project_expenses.select': [{ data: null }],
      'csr_project_expenses.insert': [{ data: { id: 'exp-1' } }],
    })

    const result = await syncWageExpenseFromSettlement({
      assignment,
      settledAmount: 1200,
      settlementMode: 'razorpay',
      razorpayPaymentId: 'pay_1',
      payerUserId: 12,
      payeeUserId: 14,
    })

    expect(result).toEqual({ synced: true, mode: 'inserted', expenseId: 'exp-1' })
    const [insert] = fake.writes('csr_project_expenses', 'insert')
    expect(insert.payload).toEqual(
      expect.objectContaining({
        project_id: PROJECT,
        category: 'worker_wages',
        amount: 1200,
        source_type: WAGE_EXPENSE_SOURCE_TYPE,
        source_reference: `${ASSIGNMENT}:pay_1`,
        approval_status: 'approved',
        payment_status: 'paid',
      })
    )
  })

  it('updates the same source row on reprocessing instead of inserting a duplicate', async () => {
    const fake = useDb({
      'csr_projects.select': [{ data: { id: PROJECT, campaign_id: CAMPAIGN } }],
      'csr_project_expenses.select': [{ data: { id: 'exp-1' } }],
      'csr_project_expenses.update': [{ data: { id: 'exp-1' } }],
    })

    const first = await syncWageExpenseFromSettlement({
      assignment,
      settledAmount: 800,
      settlementMode: 'razorpay',
      razorpayPaymentId: 'pay_same',
      payeeUserId: 14,
    })
    expect(first).toMatchObject({ synced: true, mode: 'updated' })

    // Second call with same payment source: still update path (select finds existing).
    useDb({
      'csr_projects.select': [{ data: { id: PROJECT, campaign_id: CAMPAIGN } }],
      'csr_project_expenses.select': [{ data: { id: 'exp-1' } }],
      'csr_project_expenses.update': [{ data: { id: 'exp-1' } }],
    })
    const second = await syncWageExpenseFromSettlement({
      assignment,
      settledAmount: 800,
      settlementMode: 'razorpay',
      razorpayPaymentId: 'pay_same',
      payeeUserId: 14,
    })
    expect(second).toMatchObject({ synced: true, mode: 'updated', expenseId: 'exp-1' })
    expect(fake.writes('csr_project_expenses', 'insert')).toHaveLength(0)
  })

  it('records only the settled amount for a partial settlement', async () => {
    const fake = useDb({
      'csr_projects.select': [{ data: { id: PROJECT, campaign_id: CAMPAIGN } }],
      'csr_project_expenses.select': [{ data: null }],
      'csr_project_expenses.insert': [{ data: { id: 'exp-partial' } }],
    })

    await syncWageExpenseFromSettlement({
      assignment,
      settledAmount: 350,
      settlementMode: 'razorpay',
      razorpayPaymentId: 'pay_partial',
      payeeUserId: 14,
    })

    expect(fake.writes('csr_project_expenses', 'insert')[0].payload).toEqual(
      expect.objectContaining({
        amount: 350,
        source_reference: `${ASSIGNMENT}:pay_partial`,
      })
    )
  })

  it('does not mark unpaid when settlement was only waived with no payment capture', async () => {
    const fake = useDb({
      'csr_projects.select': [{ data: { id: PROJECT, campaign_id: CAMPAIGN } }],
      'csr_project_expenses.select': [{ data: null }],
      'csr_project_expenses.insert': [{ data: { id: 'exp-w' } }],
    })

    await syncWageExpenseFromSettlement({
      assignment,
      settledAmount: 200,
      settlementMode: 'waived',
      payeeUserId: 14,
    })

    expect(fake.writes('csr_project_expenses', 'insert')[0].payload).toEqual(
      expect.objectContaining({ payment_status: 'waived', approval_status: 'approved' })
    )
  })

  it('does not invent a project expense when linkage is missing', async () => {
    const fake = useDb({})
    const result = await syncWageExpenseFromSettlement({
      assignment: {
        ...assignment,
        target_type: 'service_request',
        target_id: '99',
        meta: {},
      },
      settledAmount: 900,
      settlementMode: 'razorpay',
    })
    expect(result).toEqual({ synced: false, reason: 'no_project_link' })
    expect(fake.writes('csr_project_expenses')).toHaveLength(0)
  })

  it('replaces amount on update so reprocessing does not double-count', async () => {
    const fake = useDb({
      'csr_projects.select': [{ data: { id: PROJECT, campaign_id: CAMPAIGN } }],
      'csr_project_expenses.select': [{ data: { id: 'exp-1' } }],
      'csr_project_expenses.update': [{ data: { id: 'exp-1' } }],
    })

    await syncWageExpenseFromSettlement({
      assignment,
      settledAmount: 1000,
      settlementMode: 'razorpay',
      razorpayPaymentId: 'pay_retry',
      payeeUserId: 14,
    })

    expect(fake.writes('csr_project_expenses', 'update')[0].payload).toEqual(
      expect.objectContaining({ amount: 1000, source_reference: `${ASSIGNMENT}:pay_retry` })
    )
    expect(fake.writes('csr_project_expenses', 'insert')).toHaveLength(0)
  })
})

describe('finalizeEngagementSettlement ledger hook', () => {
  it('writes a wage expense after a CSR-linked settlement finalizes', async () => {
    const assignment = {
      id: ASSIGNMENT,
      target_type: 'csr_project',
      target_id: PROJECT,
      owner_user_id: 12,
      assignee_user_id: 14,
      application_table: 'service_request_applications',
      application_id: '9',
      billing_cycle: 'daily',
      payment_mode: 'daily_due',
      meta: { attendance_summary: { total_due: 500, paid_total: 0, days_attended: 1 } },
    }

    const fake = useDb({
      'service_attendance_entries.select': [{ data: [{ id: 'a1', payment_status: 'pending', amount_due: 500 }] }],
      'service_attendance_entries.update': [{ data: { id: 'a1' } }],
      'service_engagement_assignments.update': [{ data: { id: ASSIGNMENT } }],
      'service_request_applications.select': [{ data: { response_meta: {} } }],
      'csr_projects.select': [{ data: { id: PROJECT, campaign_id: CAMPAIGN } }],
      'csr_project_expenses.select': [{ data: null }],
      'csr_project_expenses.insert': [{ data: { id: 'exp-final' } }],
    })

    await finalizeEngagementSettlement(assignment, {
      settledAmount: 500,
      settlementMode: 'razorpay',
      razorpayPaymentId: 'pay_9',
      razorpayOrderId: 'order_9',
    })

    expect(fake.writes('csr_project_expenses', 'insert')).toHaveLength(1)
    expect(fake.writes('csr_project_expenses', 'insert')[0].payload).toEqual(
      expect.objectContaining({
        amount: 500,
        payment_status: 'paid',
        source_reference: `${ASSIGNMENT}:pay_9`,
      })
    )
  })

  it('keeps settlement success when ledger sync fails', async () => {
    const assignment = {
      id: ASSIGNMENT,
      target_type: 'csr_project',
      target_id: PROJECT,
      owner_user_id: 12,
      assignee_user_id: 14,
      application_table: null,
      application_id: null,
      billing_cycle: 'daily',
      payment_mode: 'daily_due',
      meta: { attendance_summary: { total_due: 100, paid_total: 0 } },
    }

    useDb({
      'service_attendance_entries.select': [
        { data: [{ id: 'a1', payment_status: 'pending', amount_due: 100 }] },
        { data: [{ id: 'a1', payment_status: 'paid', amount_due: 100 }] },
      ],
      'service_attendance_entries.update': [{ data: { id: 'a1' } }],
      'service_engagement_assignments.update': [{ data: { id: ASSIGNMENT } }],
      'csr_projects.select': [{ data: { id: PROJECT, campaign_id: CAMPAIGN } }],
      'csr_project_expenses.select': [{ error: { code: '57014', message: 'ledger down' } }],
    })

    await expect(
      finalizeEngagementSettlement(assignment, {
        settledAmount: 100,
        settlementMode: 'razorpay',
        razorpayPaymentId: 'pay_x',
      })
    ).resolves.toMatchObject({ settlement_status: 'settled', settled_amount: 100 })
  })
})
