import { describe, expect, it, vi } from 'vitest'
import {
  deriveCsrProjectFinance,
  deriveCsrProjectMetrics,
} from '@/lib/csr-agent/project-metrics'
import {
  isPaymentRefundEnriched,
  sumNetConfirmedDisbursements,
  withConfirmedRefunds,
} from '@/lib/csr-agent/milestone-refund-accounting'
import { buildCompanyCaProjectFinanceReport } from '@/lib/csr-agent/project-ops-finance'
import { confirmedFunds, grossConfirmedFunds } from '@/lib/document-generation/assemble/project-data'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ supabase: { from: vi.fn() }, db: {} }))

describe('CSR refund enrichment consistency — fail-closed net', () => {
  it('caller with gross and processed refunds reports net', () => {
    const payments = withConfirmedRefunds(
      [{ payment_status: 'confirmed', amount: 1000, payment_reference: 'pay_1' }],
      new Map([['pay_1', 250]])
    )
    const metrics = deriveCsrProjectMetrics({ payments })
    expect(metrics).toMatchObject({
      gross_confirmed_funds: 1000,
      confirmed_refund_funds: 250,
      confirmed_funds: 750,
      confirmed_funds_available: true,
      refunds_reconciled: true,
    })
    expect(deriveCsrProjectFinance({
      confirmedFunds: metrics.confirmed_funds,
      pendingPaymentFunds: 0,
    }).disbursed).toBe(750)
  })

  it('caller with pending refunds only keeps full net (pending excluded)', () => {
    // Pending never lands in confirmed_refund_inr — enrichment still sets 0.
    const payments = withConfirmedRefunds(
      [{ payment_status: 'confirmed', amount: 1000, payment_reference: 'pay_1' }],
      new Map()
    )
    const metrics = deriveCsrProjectMetrics({ payments })
    expect(metrics.confirmed_funds).toBe(1000)
    expect(metrics.confirmed_refund_funds).toBe(0)
    expect(metrics.refunds_reconciled).toBe(true)
  })

  it('caller with multiple partial refunds accumulates', () => {
    const payments = withConfirmedRefunds(
      [{ payment_status: 'confirmed', amount: 1000, payment_reference: 'pay_1' }],
      { pay_1: 120 + 80 + 50 }
    )
    expect(sumNetConfirmedDisbursements(payments)).toEqual({
      available: true,
      gross: 1000,
      confirmed_refunds: 250,
      net: 750,
      unreconciled_count: 0,
    })
  })

  it('caller with full refund excludes confirmation from net', () => {
    const metrics = deriveCsrProjectMetrics({
      payments: [
        {
          payment_status: 'refunded',
          amount: 1000,
          payment_reference: 'pay_1',
          confirmed_refund_inr: 1000,
        },
      ],
    })
    expect(metrics.confirmed_funds).toBe(0)
    expect(metrics.confirmed_funds_available).toBe(true)
    expect(metrics.gross_confirmed_funds).toBe(0)
  })

  it('caller with no refund records still reconciles at net = gross', () => {
    const payments = withConfirmedRefunds(
      [{ payment_status: 'confirmed', amount: 500, payment_reference: 'pay_x' }],
      {}
    )
    expect(isPaymentRefundEnriched(payments[0])).toBe(true)
    expect(payments[0].confirmed_refund_inr).toBe(0)
    expect(deriveCsrProjectMetrics({ payments }).confirmed_funds).toBe(500)
  })

  it('missing enrichment never silently reports gross as net', () => {
    const metrics = deriveCsrProjectMetrics({
      payments: [{ payment_status: 'confirmed', amount: 1000, payment_reference: 'pay_1' }],
    })
    expect(metrics.gross_confirmed_funds).toBe(1000)
    expect(metrics.confirmed_funds).toBeNull()
    expect(metrics.confirmed_funds_available).toBe(false)
    expect(metrics.refunds_reconciled).toBe(false)
    expect(metrics.unreconciled_payment_count).toBe(1)

    const finance = deriveCsrProjectFinance({
      confirmedFunds: metrics.confirmed_funds,
      pendingPaymentFunds: 0,
    })
    expect(finance.disbursed).toBeNull()
    expect(finance.disbursed_available).toBe(false)

    expect(sumNetConfirmedDisbursements([
      { payment_status: 'confirmed', amount: 1000 },
    ])).toMatchObject({ available: false, net: null, gross: 1000, unreconciled_count: 1 })
  })

  it('document/export confirmedFunds returns null when unenriched', () => {
    expect(
      confirmedFunds({
        csr_payment_confirmations: [
          { amount: 1000, payment_status: 'confirmed', payment_reference: 'pay_1' } as never,
        ],
      })
    ).toBeNull()
    expect(
      grossConfirmedFunds({
        csr_payment_confirmations: [
          { amount: 1000, payment_status: 'confirmed', payment_reference: 'pay_1' } as never,
        ],
      })
    ).toBe(1000)
    expect(
      confirmedFunds({
        csr_payment_confirmations: [
          {
            amount: 1000,
            payment_status: 'confirmed',
            payment_reference: 'pay_1',
            confirmed_refund_inr: 200,
          } as never,
        ],
      })
    ).toBe(800)
  })

  it('NGO / Company / Company CA share the same net when enriched', () => {
    const payments = withConfirmedRefunds(
      [{ payment_status: 'confirmed', amount: 400000, payment_reference: 'pay_csr' }],
      new Map([['pay_csr', 40000]])
    )
    const metrics = deriveCsrProjectMetrics({ payments })
    const finance = deriveCsrProjectFinance({
      totalBudget: 500000,
      confirmedFunds: metrics.confirmed_funds,
      pendingPaymentFunds: 0,
    })
    const ca = buildCompanyCaProjectFinanceReport({
      project: { id: 'p1', title: 'CSR', total_budget: 500000 },
      confirmedDisbursements: metrics.confirmed_funds,
      grossConfirmedDisbursements: metrics.gross_confirmed_funds,
      confirmedMilestoneRefunds: metrics.confirmed_refund_funds,
      pendingMilestoneRefunds: 0,
    })

    expect(metrics.confirmed_funds).toBe(360000)
    expect(finance.disbursed).toBe(360000)
    expect(ca.milestone_payments).toMatchObject({
      gross_confirmed: 400000,
      confirmed_refunds: 40000,
      net_disbursed: 360000,
      net_disbursed_available: true,
    })
    expect(ca.expenses.finance.disbursed).toBe(360000)
    expect(confirmedFunds({ csr_payment_confirmations: payments as never })).toBe(360000)
  })

  it('Company CA marks net unavailable when enrichment is missing', () => {
    const ca = buildCompanyCaProjectFinanceReport({
      project: { id: 'p1', title: 'CSR', total_budget: 100000 },
      confirmedDisbursements: null,
      grossConfirmedDisbursements: 100000,
      confirmedMilestoneRefunds: 0,
    })
    expect(ca.milestone_payments.net_disbursed).toBeNull()
    expect(ca.milestone_payments.net_disbursed_available).toBe(false)
    expect(ca.notes.some((n) => /unreconciled/i.test(n))).toBe(true)
    expect(ca.expenses.finance.disbursed).toBeNull()
  })

  it('duplicate refund aggregation is prevented at the map layer (same ref summed once from caller totals)', () => {
    // Callers pass already-deduped ledger totals; withConfirmedRefunds must not invent extras.
    const once = withConfirmedRefunds(
      [{ payment_status: 'confirmed', amount: 1000, payment_reference: 'pay_1' }],
      new Map([['pay_1', 200]])
    )
    const twiceSameMap = withConfirmedRefunds(once, new Map([['pay_1', 200]]))
    expect(once[0].confirmed_refund_inr).toBe(200)
    expect(twiceSameMap[0].confirmed_refund_inr).toBe(200)
    expect(deriveCsrProjectMetrics({ payments: twiceSameMap }).confirmed_funds).toBe(800)
  })
})
