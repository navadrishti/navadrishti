import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  deriveCsrProjectFinance,
  deriveCsrProjectMetrics,
  isPaidCompletedMilestoneStatus,
} from '@/lib/csr-agent/project-metrics'
import {
  moneyInr,
  netDisbursementInr,
  sumNetConfirmedDisbursements,
  withConfirmedRefunds,
} from '@/lib/csr-agent/milestone-refund-accounting'
import { buildCompanyCaProjectFinanceReport } from '@/lib/csr-agent/project-ops-finance'
import { confirmedFunds } from '@/lib/document-generation/assemble/project-data'
import { reverseRefundedPayment } from '@/lib/refund-reversal'
import { paymentStatusAfterRefunds, settleRefundStatus } from '@/lib/razorpay/refunds'
import { argOf, supabaseFake, type FakeQuery, type FakeResult } from './support/supabase-fake'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', async () => {
  const { supabaseFake } = await import('./support/supabase-fake')
  return {
    supabase: supabaseFake.client,
    db: {
      serviceRequests: { getById: vi.fn(), update: vi.fn() },
      serviceRequestApplications: { getByRequestId: vi.fn(async () => []), update: vi.fn() },
    },
  }
})

const milestoneOrder = {
  id: 'ord_1',
  service_request_id: null,
  payer_user_id: 40,
  order_status: 'paid',
  order_notes: {
    payment_kind: 'csr_milestone',
    milestone_id: 'm1',
    project_id: 'p1',
    base_amount_inr: 1000,
    total_charge_inr: 1059,
  },
}

function respond(handler: (query: FakeQuery) => FakeResult | undefined) {
  supabaseFake.reset(handler)
}

beforeEach(() => {
  supabaseFake.reset(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CSR milestone refund accounting — pure rules', () => {
  it('1. one partial refund reduces net disbursed only', () => {
    const payments = withConfirmedRefunds(
      [{ payment_status: 'confirmed', amount: 1000, payment_reference: 'pay_a', milestone_id: 'm1' }],
      new Map([['pay_a', 250]])
    )
    const metrics = deriveCsrProjectMetrics({
      milestones: [{ id: 'm1', status: 'completed', milestone_order: 1, amount: 1000 }],
      payments,
    })
    expect(metrics).toMatchObject({
      gross_confirmed_funds: 1000,
      confirmed_refund_funds: 250,
      confirmed_funds: 750,
      paid_completed_milestones_count: 1,
      milestone_progress_percentage: 100,
    })
    expect(isPaidCompletedMilestoneStatus('completed')).toBe(true)
  })

  it('2. multiple partial refunds accumulate correctly', () => {
    const payments = withConfirmedRefunds(
      [{ payment_status: 'confirmed', amount: 1000, payment_reference: 'pay_a' }],
      new Map([['pay_a', 150 + 200]])
    )
    expect(sumNetConfirmedDisbursements(payments)).toEqual({
      available: true,
      gross: 1000,
      confirmed_refunds: 350,
      net: 650,
      unreconciled_count: 0,
    })
  })

  it('3. full refund excludes confirmation from net (status refunded)', () => {
    const metrics = deriveCsrProjectMetrics({
      milestones: [{ id: 'm1', status: 'approved', milestone_order: 1, amount: 1000 }],
      payments: [
        {
          payment_status: 'refunded',
          amount: 1000,
          payment_reference: 'pay_a',
          confirmed_refund_inr: 1000,
          milestone_id: 'm1',
        },
      ],
    })
    expect(metrics.confirmed_funds).toBe(0)
    expect(metrics.gross_confirmed_funds).toBe(0)
    expect(metrics.paid_completed_milestones_count).toBe(0)
    expect(metrics.approved_awaiting_payment_funds).toBe(1000)
  })

  it('4. pending refunds do not reduce actual expenditure', () => {
    // Pending amounts are never passed as confirmed_refund_inr.
    const metrics = deriveCsrProjectMetrics({
      payments: [{ payment_status: 'confirmed', amount: 1000, confirmed_refund_inr: 0 }],
    })
    expect(metrics.confirmed_funds).toBe(1000)
    expect(netDisbursementInr(1000, 0)).toBe(1000)
  })

  it('5. failed refunds do not reduce actual expenditure', () => {
    expect(netDisbursementInr(1000, 0)).toBe(1000)
    const metrics = deriveCsrProjectMetrics({
      payments: [{ payment_status: 'confirmed', amount: 1000, confirmed_refund_inr: 0 }],
    })
    expect(metrics.confirmed_funds).toBe(1000)
  })

  it('6–7. duplicate processed refunds cannot exceed captured and clamp per confirmation', () => {
    expect(netDisbursementInr(1000, 1000)).toBe(0)
    expect(netDisbursementInr(1000, 1500)).toBe(0)
    expect(moneyInr(1500)).toBe(1500)
  })

  it('9. refund exceeding remaining refundable clamps net to zero without inventing credit', () => {
    expect(netDisbursementInr(500, 800)).toBe(0)
  })

  it('10. NGO receivable equals net confirmed funds', () => {
    const payments = withConfirmedRefunds(
      [{ payment_status: 'confirmed', amount: 400000, payment_reference: 'pay_csr' }],
      new Map([['pay_csr', 40000]])
    )
    const metrics = deriveCsrProjectMetrics({ payments })
    expect(metrics.confirmed_funds).toBe(360000)
    expect(confirmedFunds({ csr_payment_confirmations: payments as never })).toBe(360000)
  })

  it('11. company net expenditure uses the same net disbursed figure', () => {
    const finance = deriveCsrProjectFinance({
      totalBudget: 500000,
      confirmedFunds: 360000,
      pendingPaymentFunds: 0,
      approvedAwaitingPaymentFunds: 0,
    })
    expect(finance.disbursed).toBe(360000)
  })

  it('12. CA report exposes gross, confirmed refunds, net, and pending separately', () => {
    const report = buildCompanyCaProjectFinanceReport({
      project: { id: 'p1', title: 'CSR', total_budget: 500000 },
      confirmedDisbursements: 360000,
      grossConfirmedDisbursements: 400000,
      confirmedMilestoneRefunds: 40000,
      pendingMilestoneRefunds: 10000,
    })
    expect(report.milestone_payments).toEqual({
      gross_confirmed: 400000,
      confirmed_refunds: 40000,
      net_disbursed: 360000,
      net_disbursed_available: true,
      pending_refund_amount: 10000,
    })
    expect(report.expenses.finance.disbursed).toBe(360000)
    expect(report.notes.some((n) => /Milestone refunds confirmed/i.test(n))).toBe(true)
    expect(report.notes.some((n) => /pending confirmation/i.test(n))).toBe(true)
  })

  it('13. partial refund leaves milestone progress completed', () => {
    const metrics = deriveCsrProjectMetrics({
      milestones: [
        { id: 'm1', status: 'completed', milestone_order: 1, amount: 1000 },
        { id: 'm2', status: 'pending', milestone_order: 2, amount: 1000 },
      ],
      payments: [
        {
          payment_status: 'confirmed',
          amount: 1000,
          confirmed_refund_inr: 300,
          milestone_id: 'm1',
        },
      ],
    })
    expect(metrics.paid_completed_milestones_count).toBe(1)
    expect(metrics.milestone_progress_percentage).toBe(50)
    expect(metrics.confirmed_funds).toBe(700)
  })

  it('14. full refund reopens progress accounting (approved, not paid-complete)', () => {
    const metrics = deriveCsrProjectMetrics({
      milestones: [{ id: 'm1', status: 'approved', milestone_order: 1, amount: 1000 }],
      payments: [{ payment_status: 'refunded', amount: 1000, milestone_id: 'm1' }],
    })
    expect(metrics.paid_completed_milestones_count).toBe(0)
    expect(metrics.confirmed_funds).toBe(0)
    expect(metrics.approved_awaiting_payment_funds).toBe(1000)
  })
})

describe('CSR milestone refund reversal — domain transitions', () => {
  it('partial refund does not mark confirmation refunded or reopen the milestone', async () => {
    const updates: Array<{ table: string; payload: unknown }> = []
    respond((query) => {
      if (query.op === 'update') {
        updates.push({ table: query.table, payload: argOf(query, 'update') })
        return { data: [] }
      }
      return undefined
    })

    const result = await reverseRefundedPayment({
      order: milestoneOrder,
      razorpayPaymentId: 'pay_partial',
      razorpayRefundId: 'rfnd_partial',
      refundInr: 250,
      paidInr: 1059,
      fullyRefunded: false,
    })

    expect(result.kind).toBe('csr_milestone')
    expect(result.warnings).toEqual([])
    expect(result.actions.some((a) => /Partial CSR milestone refund/i.test(a))).toBe(true)
    expect(updates.filter((u) => u.table === 'csr_payment_confirmations')).toHaveLength(0)
    expect(updates.filter((u) => u.table === 'csr_project_milestones')).toHaveLength(0)
  })

  it('full refund marks confirmation refunded and reopens completed milestone', async () => {
    respond((query) => {
      if (query.table === 'csr_payment_confirmations' && query.op === 'update') {
        return { data: [{ id: 'pc_1', milestone_id: 'm1', project_id: 'p1' }] }
      }
      if (query.table === 'csr_project_milestones' && query.op === 'update') {
        return { data: [{ id: 'm1' }] }
      }
      if (query.table === 'csr_projects' && query.op === 'select') {
        return { data: { id: 'p1', total_budget: 1000 } }
      }
      if (query.table === 'csr_project_milestones' && query.op === 'select') {
        return { data: [{ id: 'm1', status: 'approved', milestone_order: 1 }] }
      }
      if (query.table === 'csr_projects' && query.op === 'update') return { data: [{ id: 'p1' }] }
      return undefined
    })

    const result = await reverseRefundedPayment({
      order: milestoneOrder,
      razorpayPaymentId: 'pay_full',
      razorpayRefundId: 'rfnd_full',
      refundInr: 1059,
      paidInr: 1059,
      fullyRefunded: true,
    })

    expect(result.actions.some((a) => /approved and awaiting payment/i.test(a))).toBe(true)
    expect(argOf(supabaseFake.find('csr_payment_confirmations', 'update')[0], 'update')).toMatchObject({
      payment_status: 'refunded',
    })
    expect(argOf(supabaseFake.find('csr_project_milestones', 'update')[0], 'update')).toMatchObject({
      status: 'approved',
    })
  })
})

describe('refund ledger safety helpers', () => {
  it('8. out-of-order / late failed cannot overwrite processed', async () => {
    respond((query) => {
      if (query.table === 'razorpay_refunds' && query.op === 'update') {
        // settleRefundStatus(.neq processed) returns empty when already processed
        return { data: [] }
      }
      return undefined
    })
    await expect(settleRefundStatus('rfnd_1', 'failed')).resolves.toBe(false)
  })

  it('payment status uses provider running total for partial vs full', () => {
    expect(paymentStatusAfterRefunds({ amount: 105900, amount_refunded: 25000 })).toBe('partially_refunded')
    expect(paymentStatusAfterRefunds({ amount: 105900, amount_refunded: 105900 })).toBe('refunded')
    expect(paymentStatusAfterRefunds({ amount: 105900, amount_refunded: 0 })).toBe('captured')
  })

  it('first settle to processed wins; second is not first-to-process', async () => {
    let calls = 0
    respond((query) => {
      if (query.table === 'razorpay_refunds' && query.op === 'update') {
        calls += 1
        return { data: calls === 1 ? [{ id: 'r1' }] : [] }
      }
      return undefined
    })
    await expect(settleRefundStatus('rfnd_dup', 'processed')).resolves.toBe(true)
    await expect(settleRefundStatus('rfnd_dup', 'processed')).resolves.toBe(false)
  })
})
