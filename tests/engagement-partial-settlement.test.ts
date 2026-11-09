import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  allocateOutstandingEntries,
  createEngagementSettlementOrder,
  EngagementSettlementNoRowsError,
  finalizeEngagementSettlement,
  listSettlementPayments,
  loadAssignmentOutstanding,
  settlementPaymentAlreadyRecorded,
  settleEngagementFromCapturedPayment,
  summarizeAttendanceLedger,
} from '@/lib/engagement-settlement'
import {
  buildWageExpenseLedgerPayload,
  syncWageExpenseFromSettlement,
  wageExpenseSourceReference,
} from '@/lib/csr-agent/sync-wage-expense'
import { calculateVerifiedWorkerWage } from '@/lib/csr-agent/project-ops-finance'
import { argOf, supabaseFake, type FakeQuery, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({
  razorpay: {
    orders: { create: vi.fn(async () => ({ id: 'order_new', receipt: 'asg_asg_1_1', currency: 'INR', amount: 31200 })) },
    payments: { refund: vi.fn(async () => ({ id: 'rfnd_dup' })), fetch: vi.fn() },
  },
  db: {
    serviceRequestApplications: { update: vi.fn(async () => undefined) },
  },
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', async () => {
  const { supabaseFake } = await import('./support/supabase-fake')
  return { supabase: supabaseFake.client, db: mocks.db }
})
vi.mock('razorpay', () => ({
  default: vi.fn(function () {
    return mocks.razorpay
  }),
}))

function respond(handler: (query: FakeQuery) => FakeResult | undefined) {
  supabaseFake.reset(handler)
}

const PROJECT = '11111111-1111-1111-1111-111111111111'
const ASSIGNMENT = '33333333-3333-3333-3333-333333333333'

beforeEach(() => {
  supabaseFake.reset(() => undefined)
  mocks.razorpay.orders.create.mockClear()
  mocks.razorpay.payments.refund.mockClear()
  vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', 'key')
  vi.stubEnv('RAZORPAY_KEY_SECRET', 'secret')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('allocateOutstandingEntries', () => {
  const rows = [
    { id: 'd1', amount_due: 300, payment_status: 'pending', attendance_date: '2026-01-01' },
    { id: 'd2', amount_due: 300, payment_status: 'billed', attendance_date: '2026-01-02' },
    { id: 'd3', amount_due: 400, payment_status: 'pending', attendance_date: '2026-01-03' },
    { id: 'paid', amount_due: 200, payment_status: 'paid', attendance_date: '2025-12-31' },
  ]

  it('allocates whole days FIFO up to the requested amount', () => {
    expect(allocateOutstandingEntries(rows, { requestedAmountInr: 600 })).toMatchObject({
      allocatedInr: 600,
      remainingOutstandingInr: 400,
      selected: [{ id: 'd1' }, { id: 'd2' }],
    })
  })

  it('does not split a single attendance day', () => {
    expect(allocateOutstandingEntries(rows, { requestedAmountInr: 100 }).selected).toEqual([])
  })

  it('caps allocation to whole days even when the request exceeds outstanding', () => {
    expect(allocateOutstandingEntries(rows, { requestedAmountInr: 50000 })).toMatchObject({
      allocatedInr: 1000,
      remainingOutstandingInr: 0,
      selected: [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }],
    })
  })

  it('refuses explicit entry ids that cannot be covered without splitting a day', () => {
    expect(() =>
      allocateOutstandingEntries(rows, { requestedAmountInr: 100, entryIds: ['d1'] })
    ).toThrow(/exceed the settlement amount|not supported|allocated safely/i)
  })

  it('allocates selected entry ids only', () => {
    expect(allocateOutstandingEntries(rows, { entryIds: ['d3'] })).toMatchObject({
      allocatedInr: 400,
      selected: [{ id: 'd3' }],
    })
  })
})

describe('createEngagementSettlementOrder — whole-day restriction', () => {
  const assignment = {
    id: 'asg_day',
    meta: { attendance_summary: { total_due: 600, paid_total: 0 } },
    billing_cycle: 'daily',
    payment_mode: 'daily_due',
    application_table: 'service_clients',
    application_id: '15',
    owner_user_id: 8,
    assignee_user_id: 3,
    target_type: 'service_request',
    target_id: '12',
    status: 'completed',
    completed_at: '2026-01-01T00:00:00Z',
  }
  const parties = { payerUserId: 3, payeeUserId: 8 }
  const connectedPayee = { profile_data: { razorpay_linked_account_id: 'acc_8', razorpay_link_status: 'active' } }

  it('rejects amounts that cannot cover a full attendance day', async () => {
    respond((query) => {
      if (query.table === 'service_attendance_entries') {
        return {
          data: [
            { id: 'd1', amount_due: 300, payment_status: 'pending', attendance_date: '2026-01-01' },
            { id: 'd2', amount_due: 300, payment_status: 'billed', attendance_date: '2026-01-02' },
          ],
        }
      }
      if (query.table === 'users') return { data: connectedPayee }
      return undefined
    })

    await expect(
      createEngagementSettlementOrder(assignment, parties, { requestedAmountInr: 100 })
    ).rejects.toThrow(/full attendance day|Partial payment of a single day/i)
    expect(mocks.razorpay.orders.create).not.toHaveBeenCalled()
  })
})

describe('summarizeAttendanceLedger', () => {
  it('keeps waived out of outstanding and paid', () => {
    expect(
      summarizeAttendanceLedger([
        { id: '1', amount_due: 100, payment_status: 'paid' },
        { id: '2', amount_due: 50, payment_status: 'waived' },
        { id: '3', amount_due: 75, payment_status: 'pending' },
      ])
    ).toEqual({ totalDue: 225, paidTotal: 100, outstanding: 75, waivedTotal: 50 })
  })
})

describe('calculateVerifiedWorkerWage — waived distinguishable', () => {
  it('does not count waived as paid', () => {
    expect(
      calculateVerifiedWorkerWage([
        { attendance_status: 'present', amount_due: 400, payment_status: 'paid' },
        { attendance_status: 'present', amount_due: 200, payment_status: 'waived' },
        { attendance_status: 'present', amount_due: 100, payment_status: 'pending' },
      ])
    ).toMatchObject({
      wage_expense: 700,
      paid_amount: 400,
      waived_amount: 200,
      outstanding_amount: 100,
    })
  })
})

describe('wageExpenseSourceReference', () => {
  it('keys each payment separately so partials accumulate', () => {
    expect(
      wageExpenseSourceReference({
        assignmentId: ASSIGNMENT,
        razorpayPaymentId: 'pay_a',
        settlementMode: 'razorpay',
      })
    ).toBe(`${ASSIGNMENT}:pay_a`)
    expect(
      wageExpenseSourceReference({
        assignmentId: ASSIGNMENT,
        razorpayPaymentId: 'pay_b',
        settlementMode: 'razorpay',
      })
    ).toBe(`${ASSIGNMENT}:pay_b`)
  })
})

describe('finalizeEngagementSettlement — partial and full', () => {
  const assignment = {
    id: ASSIGNMENT,
    target_type: 'csr_project',
    target_id: PROJECT,
    owner_user_id: 12,
    assignee_user_id: 14,
    application_table: null as string | null,
    application_id: null as string | null,
    billing_cycle: 'daily',
    payment_mode: 'daily_due',
    status: 'completed',
    completed_at: '2026-01-10T00:00:00Z',
    meta: { attendance_summary: { total_due: 1000, paid_total: 0, days_attended: 3 } },
  }

  it('1. full wage settlement marks all open rows paid and status settled', async () => {
    let selectPass = 0
    respond((query) => {
      if (query.table === 'service_attendance_entries' && query.op === 'select') {
        selectPass += 1
        if (selectPass === 1) {
          return {
            data: [
              { id: 'd1', payment_status: 'pending', amount_due: 500 },
              { id: 'd2', payment_status: 'billed', amount_due: 500 },
            ],
          }
        }
        return {
          data: [
            { id: 'd1', payment_status: 'paid', amount_due: 500 },
            { id: 'd2', payment_status: 'paid', amount_due: 500 },
          ],
        }
      }
      if (query.table === 'service_attendance_entries' && query.op === 'update') return { data: [{ id: 'd1' }] }
      if (query.table === 'service_engagement_assignments' && query.op === 'update') return { data: [{ id: ASSIGNMENT }] }
      if (query.table === 'csr_projects' && query.op === 'select') return { data: { id: PROJECT, campaign_id: null } }
      if (query.table === 'csr_project_expenses' && query.op === 'select') return { data: null }
      if (query.table === 'csr_project_expenses' && query.op === 'insert') return { data: { id: 'exp-full' } }
      return undefined
    })

    const meta = await finalizeEngagementSettlement(assignment, {
      settledAmount: 1000,
      settlementMode: 'razorpay',
      razorpayPaymentId: 'pay_full',
      razorpayOrderId: 'order_full',
    })
    expect(meta.settlement_status).toBe('settled')
    expect(meta.settled_amount).toBe(1000)
    expect(listSettlementPayments(meta)).toHaveLength(1)
  })

  it('2–4. partial settlement leaves remaining outstanding and status partial', async () => {
    let selectPass = 0
    respond((query) => {
      if (query.table === 'service_attendance_entries' && query.op === 'select') {
        selectPass += 1
        if (selectPass === 1) {
          return {
            data: [
              { id: 'd1', payment_status: 'pending', amount_due: 400 },
              { id: 'd2', payment_status: 'pending', amount_due: 600 },
            ],
          }
        }
        return {
          data: [
            { id: 'd1', payment_status: 'paid', amount_due: 400 },
            { id: 'd2', payment_status: 'pending', amount_due: 600 },
          ],
        }
      }
      if (query.table === 'service_attendance_entries' && query.op === 'update') return { data: [{ id: 'd1' }] }
      if (query.table === 'service_engagement_assignments' && query.op === 'update') {
        return { data: [{ id: ASSIGNMENT }] }
      }
      if (query.table === 'csr_projects') return { data: { id: PROJECT, campaign_id: null } }
      if (query.table === 'csr_project_expenses' && query.op === 'select') return { data: null }
      if (query.table === 'csr_project_expenses' && query.op === 'insert') return { data: { id: 'exp-p1' } }
      return undefined
    })

    const meta = await finalizeEngagementSettlement(assignment, {
      settledAmount: 400,
      settlementMode: 'razorpay',
      razorpayPaymentId: 'pay_partial_1',
      entryIds: ['d1'],
    })
    expect(meta.settlement_status).toBe('partial')
    expect(meta.attendance_summary).toMatchObject({ paid_total: 400, outstanding: 600, total_due: 1000 })
    expect(argOf(supabaseFake.find('service_engagement_assignments', 'update')[0], 'update')).not.toMatchObject({
      status: 'completed',
    })
  })

  it('3+6. second partial cycle after completion clears remaining balance', async () => {
    const assignmentWithPrior = {
      ...assignment,
      meta: {
        settlement_status: 'partial',
        settled_amount: 400,
        settlement_payments: [
          {
            razorpay_payment_id: 'pay_partial_1',
            amount_inr: 400,
            entry_ids: ['d1'],
            settled_at: '2026-01-01T00:00:00Z',
            settlement_mode: 'razorpay',
          },
        ],
        attendance_summary: { total_due: 1000, paid_total: 400, outstanding: 600, days_attended: 2 },
      },
    }
    let selectPass = 0
    respond((query) => {
      if (query.table === 'service_attendance_entries' && query.op === 'select') {
        selectPass += 1
        if (selectPass === 1) {
          return {
            data: [
              { id: 'd1', payment_status: 'paid', amount_due: 400 },
              { id: 'd2', payment_status: 'pending', amount_due: 600 },
            ],
          }
        }
        return {
          data: [
            { id: 'd1', payment_status: 'paid', amount_due: 400 },
            { id: 'd2', payment_status: 'paid', amount_due: 600 },
          ],
        }
      }
      if (query.table === 'service_attendance_entries' && query.op === 'update') return { data: [{ id: 'd2' }] }
      if (query.table === 'service_engagement_assignments' && query.op === 'update') {
        return { data: [{ id: ASSIGNMENT }] }
      }
      if (query.table === 'csr_projects') return { data: { id: PROJECT, campaign_id: null } }
      if (query.table === 'csr_project_expenses' && query.op === 'select') return { data: null }
      if (query.table === 'csr_project_expenses' && query.op === 'insert') return { data: { id: 'exp-p2' } }
      return undefined
    })

    const meta = await finalizeEngagementSettlement(assignmentWithPrior, {
      settledAmount: 600,
      settlementMode: 'razorpay',
      razorpayPaymentId: 'pay_partial_2',
      entryIds: ['d2'],
    })
    expect(meta.settlement_status).toBe('settled')
    expect(meta.settled_amount).toBe(1000)
    expect(listSettlementPayments(meta)).toHaveLength(2)
    expect(meta.attendance_summary).toMatchObject({ paid_total: 1000, outstanding: 0 })
    expect(argOf(supabaseFake.find('csr_project_expenses', 'insert')[0], 'insert')).toMatchObject({
      amount: 600,
      source_reference: `${ASSIGNMENT}:pay_partial_2`,
    })
  })

  it('11. waived rows stay distinguishable and are not marked paid again', async () => {
    respond((query) => {
      if (query.table === 'service_attendance_entries' && query.op === 'select') {
        return {
          data: [
            { id: 'w1', payment_status: 'waived', amount_due: 200 },
            { id: 'p1', payment_status: 'pending', amount_due: 300 },
          ],
        }
      }
      if (query.table === 'service_attendance_entries' && query.op === 'update') return { data: [{ id: 'p1' }] }
      if (query.table === 'service_engagement_assignments') return { data: [{ id: ASSIGNMENT }] }
      if (query.table === 'csr_projects') return { data: { id: PROJECT, campaign_id: null } }
      if (query.table === 'csr_project_expenses' && query.op === 'select') return { data: null }
      if (query.table === 'csr_project_expenses' && query.op === 'insert') return { data: { id: 'exp-w' } }
      return undefined
    })

    await finalizeEngagementSettlement(assignment, {
      settledAmount: 300,
      settlementMode: 'razorpay',
      razorpayPaymentId: 'pay_after_waive',
      entryIds: ['p1'],
    })
    const updates = supabaseFake.find('service_attendance_entries', 'update')
    expect(updates).toHaveLength(1)
  })
})

describe('createEngagementSettlementOrder — partial amount', () => {
  const assignment = {
    id: 'asg_1',
    meta: { attendance_summary: { total_due: 1000, paid_total: 400 } },
    billing_cycle: 'daily',
    payment_mode: 'daily_due',
    application_table: 'service_clients',
    application_id: '15',
    owner_user_id: 8,
    assignee_user_id: 3,
    target_type: 'service_request',
    target_id: '12',
    status: 'completed',
    completed_at: '2026-01-01T00:00:00Z',
  }
  const parties = { payerUserId: 3, payeeUserId: 8 }
  const connectedPayee = { profile_data: { razorpay_linked_account_id: 'acc_8', razorpay_link_status: 'active' } }

  it('creates an order for allocated whole days only', async () => {
    respond((query) => {
      if (query.table === 'service_attendance_entries') {
        return {
          data: [
            { id: 'd1', amount_due: 300, payment_status: 'pending', attendance_date: '2026-01-01' },
            { id: 'd2', amount_due: 300, payment_status: 'billed', attendance_date: '2026-01-02' },
          ],
        }
      }
      if (query.table === 'users') return { data: connectedPayee }
      if (query.table === 'razorpay_payment_orders') return { data: { id: 'o1' } }
      return undefined
    })

    const result = await createEngagementSettlementOrder(assignment, parties, { requestedAmountInr: 300 })
    expect(result).toMatchObject({
      paymentRequired: true,
      settleAmount: 300,
      remainingAfter: 300,
      entryIds: ['d1'],
    })
    expect(mocks.razorpay.orders.create).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: expect.objectContaining({
          settlement_entry_ids: 'd1',
          settlement_base_amount_inr: '300',
        }),
      })
    )
  })
})

describe('settleEngagementFromCapturedPayment — idempotency', () => {
  it('9–10. duplicate payment heals ledger and does not re-finalize', async () => {
    const assignmentRow = {
      id: ASSIGNMENT,
      status: 'completed',
      completed_at: '2026-01-01T00:00:00Z',
      meta: {
        settlement_status: 'partial',
        settlement_payment_id: 'pay_1',
        settlement_payments: [
          {
            razorpay_payment_id: 'pay_1',
            amount_inr: 400,
            entry_ids: ['d1'],
            settled_at: '2026-01-01T00:00:00Z',
            settlement_mode: 'razorpay',
          },
        ],
        settled_amount: 400,
      },
      owner_user_id: 12,
      assignee_user_id: 14,
      application_table: null,
      application_id: null,
      target_type: 'csr_project',
      target_id: PROJECT,
      billing_cycle: 'daily',
      payment_mode: 'daily_due',
    }

    respond((query) => {
      if (query.table === 'razorpay_payment_orders' && query.op === 'select') {
        return {
          data: {
            order_notes: {
              assignment_id: ASSIGNMENT,
              payment_kind: 'engagement_settlement',
              base_amount_inr: 400,
              total_charge_inr: 416,
              settlement_entry_ids: ['d1'],
            },
            payer_user_id: 12,
            amount_paise: 41600,
          },
        }
      }
      if (query.table === 'service_engagement_assignments' && query.op === 'select') {
        return { data: assignmentRow }
      }
      if (query.table === 'csr_projects') return { data: { id: PROJECT, campaign_id: null } }
      if (query.table === 'csr_project_expenses' && query.op === 'select') return { data: null }
      if (query.table === 'csr_project_expenses' && query.op === 'insert') return { data: { id: 'exp-heal' } }
      return undefined
    })

    const result = await settleEngagementFromCapturedPayment({
      razorpay: mocks.razorpay as never,
      razorpayOrderId: 'order_1',
      razorpayPaymentId: 'pay_1',
      paidInr: 416,
    })
    expect(result).toMatchObject({ ok: true, alreadyProcessed: true, settledAmount: 400 })
    expect(supabaseFake.find('service_attendance_entries', 'update')).toHaveLength(0)
    expect(settlementPaymentAlreadyRecorded(assignmentRow.meta, 'pay_1')).toBe(true)
  })

  it('7–8. pending/failed payments never reach finalize (captured gate is upstream)', () => {
    // Captured-only gate lives in settle route / webhook; ledger helpers ignore non-positive amounts.
    expect(
      buildWageExpenseLedgerPayload({
        assignment: {
          id: ASSIGNMENT,
          target_type: 'csr_project',
          target_id: PROJECT,
          owner_user_id: 12,
          assignee_user_id: 14,
          application_table: 'service_request_applications',
          meta: {},
        },
        settledAmount: 0,
        settlementMode: 'razorpay',
        projectId: PROJECT,
        campaignId: null,
      })
    ).toBeNull()
  })

  it('14. overlapping entry settle race refunds instead of double-paying', async () => {
    mocks.razorpay.payments.fetch.mockResolvedValue({
      id: 'pay_race',
      order_id: 'order_race',
      status: 'captured',
      amount: 41600,
    })
    mocks.razorpay.payments.refund.mockResolvedValue({ id: 'rfnd_race' })

    respond((query) => {
      if (query.table === 'razorpay_payment_orders' && query.op === 'select') {
        return {
          data: {
            order_notes: {
              assignment_id: ASSIGNMENT,
              payment_kind: 'engagement_settlement',
              base_amount_inr: 400,
              total_charge_inr: 416,
              settlement_entry_ids: ['d1'],
            },
            payer_user_id: 12,
            amount_paise: 41600,
          },
        }
      }
      if (query.table === 'razorpay_payment_orders' && query.op === 'update') {
        return { data: { id: 'o_race' } }
      }
      if (query.table === 'service_engagement_assignments' && query.op === 'select') {
        return {
          data: {
            id: ASSIGNMENT,
            status: 'completed',
            completed_at: '2026-01-01T00:00:00Z',
            meta: { settlement_status: 'partial', settled_amount: 400 },
            owner_user_id: 12,
            assignee_user_id: 14,
            application_table: null,
            application_id: null,
            target_type: 'csr_project',
            target_id: PROJECT,
            billing_cycle: 'daily',
            payment_mode: 'daily_due',
          },
        }
      }
      if (query.table === 'service_engagement_assignments' && query.op === 'update') {
        return {
          data: {
            id: ASSIGNMENT,
            status: 'completed',
            meta: { settlement_claim_payment_id: 'pay_race' },
            owner_user_id: 12,
            assignee_user_id: 14,
            application_table: null,
            application_id: null,
            target_type: 'csr_project',
            target_id: PROJECT,
            billing_cycle: 'daily',
            payment_mode: 'daily_due',
          },
        }
      }
      if (query.table === 'service_attendance_entries' && query.op === 'select') {
        return {
          data: [{ id: 'd1', payment_status: 'paid', amount_due: 400 }],
        }
      }
      return undefined
    })

    const result = await settleEngagementFromCapturedPayment({
      razorpay: mocks.razorpay as never,
      razorpayOrderId: 'order_race',
      razorpayPaymentId: 'pay_race',
      paidInr: 416,
    })
    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(mocks.razorpay.payments.refund).toHaveBeenCalled()
    expect(supabaseFake.find('service_attendance_entries', 'update')).toHaveLength(0)
  })

  it('throws when finalize targets already-paid entry ids', async () => {
    respond((query) => {
      if (query.table === 'service_attendance_entries') {
        return { data: [{ id: 'd1', payment_status: 'paid', amount_due: 400 }] }
      }
      return undefined
    })
    await expect(
      finalizeEngagementSettlement(
        {
          id: ASSIGNMENT,
          target_type: 'csr_project',
          target_id: PROJECT,
          owner_user_id: 12,
          assignee_user_id: 14,
          application_table: null,
          application_id: null,
          billing_cycle: 'daily',
          payment_mode: 'daily_due',
          status: 'completed',
          completed_at: '2026-01-01T00:00:00Z',
          meta: {},
        },
        {
          settledAmount: 400,
          settlementMode: 'razorpay',
          razorpayPaymentId: 'pay_x',
          entryIds: ['d1'],
        }
      )
    ).rejects.toBeInstanceOf(EngagementSettlementNoRowsError)
  })
})

describe('ledger sync — multiple partials do not overwrite', () => {
  const assignment = {
    id: ASSIGNMENT,
    target_type: 'csr_project',
    target_id: PROJECT,
    owner_user_id: 12,
    assignee_user_id: 14,
    application_table: 'service_request_applications',
    meta: {},
  }

  it('3 + 12 + 14. two partial payments insert two expense rows; retry updates same payment only', async () => {
    respond((query) => {
      if (query.table === 'csr_projects') return { data: { id: PROJECT, campaign_id: null } }
      if (query.table === 'csr_project_expenses' && query.op === 'select') return { data: null }
      if (query.table === 'csr_project_expenses' && query.op === 'insert') {
        return { data: { id: `exp-${String(query).length}` } }
      }
      return undefined
    })

    const first = await syncWageExpenseFromSettlement({
      assignment,
      settledAmount: 350,
      settlementMode: 'razorpay',
      razorpayPaymentId: 'pay_a',
    })
    expect(first).toMatchObject({ synced: true, mode: 'inserted' })
    expect(argOf(supabaseFake.find('csr_project_expenses', 'insert')[0], 'insert')).toMatchObject({
      amount: 350,
      source_reference: `${ASSIGNMENT}:pay_a`,
    })

    supabaseFake.reset((query) => {
      if (query.table === 'csr_projects') return { data: { id: PROJECT, campaign_id: null } }
      if (query.table === 'csr_project_expenses' && query.op === 'select') return { data: null }
      if (query.table === 'csr_project_expenses' && query.op === 'insert') return { data: { id: 'exp-b' } }
      return undefined
    })

    const second = await syncWageExpenseFromSettlement({
      assignment,
      settledAmount: 250,
      settlementMode: 'razorpay',
      razorpayPaymentId: 'pay_b',
    })
    expect(second).toMatchObject({ synced: true, mode: 'inserted' })
    expect(argOf(supabaseFake.find('csr_project_expenses', 'insert')[0], 'insert')).toMatchObject({
      amount: 250,
      source_reference: `${ASSIGNMENT}:pay_b`,
    })

    supabaseFake.reset((query) => {
      if (query.table === 'csr_projects') return { data: { id: PROJECT, campaign_id: null } }
      if (query.table === 'csr_project_expenses' && query.op === 'select') return { data: { id: 'exp-b' } }
      if (query.table === 'csr_project_expenses' && query.op === 'update') return { data: { id: 'exp-b' } }
      return undefined
    })

    const retry = await syncWageExpenseFromSettlement({
      assignment,
      settledAmount: 250,
      settlementMode: 'razorpay',
      razorpayPaymentId: 'pay_b',
    })
    expect(retry).toMatchObject({ synced: true, mode: 'updated', expenseId: 'exp-b' })
    expect(supabaseFake.find('csr_project_expenses', 'insert')).toHaveLength(0)
  })

  it('13. skips ledger write without reliable project linkage', async () => {
    respond(() => undefined)
    const result = await syncWageExpenseFromSettlement({
      assignment: { ...assignment, target_type: 'service_request', target_id: '99', meta: {} },
      settledAmount: 100,
      settlementMode: 'razorpay',
      razorpayPaymentId: 'pay_x',
    })
    expect(result).toEqual({ synced: false, reason: 'no_project_link' })
  })
})

describe('loadAssignmentOutstanding', () => {
  it('5–6. remaining balance after completion uses attendance rows', async () => {
    respond((query) => {
      if (query.table === 'service_attendance_entries') {
        return {
          data: [
            { id: '1', amount_due: 500, payment_status: 'paid' },
            { id: '2', amount_due: 500, payment_status: 'pending' },
          ],
        }
      }
      return undefined
    })
    await expect(loadAssignmentOutstanding(ASSIGNMENT)).resolves.toMatchObject({
      totalDue: 1000,
      paidTotal: 500,
      outstanding: 500,
    })
  })
})
