import { describe, expect, it } from 'vitest'
import {
  CONFIRMED_PAYMENT_STATUS,
  deriveCsrProjectFinance,
  deriveCsrProjectMetrics,
  deriveMilestoneLifecycleStage,
  isTerminalMilestoneStatus,
  priorMilestonesArePaidComplete,
  resolveCurrentFieldMilestone,
  TERMINAL_MILESTONE_STATUSES,
} from '@/lib/csr-agent/project-metrics'

describe('isTerminalMilestoneStatus', () => {
  it.each([...TERMINAL_MILESTONE_STATUSES, 'Approved', 'COMPLETED'])(
    'treats %s as terminal (review-approved or fully completed)',
    (status) => {
      expect(isTerminalMilestoneStatus(status)).toBe(true)
    }
  )

  it.each(['pending', 'submitted', 'rejected', 'in_progress', '', null, undefined])(
    'does not treat %s as terminal',
    (status) => {
      expect(isTerminalMilestoneStatus(status as string | null | undefined)).toBe(false)
    }
  )
})

describe('deriveCsrProjectMetrics — milestone progress', () => {
  it('returns null progress when there are no milestones', () => {
    const metrics = deriveCsrProjectMetrics({ milestones: [], payments: [], impactRows: null })
    expect(metrics).toMatchObject({
      milestones_count: 0,
      completed_milestones_count: 0,
      milestone_progress_percentage: null,
      confirmed_funds: 0,
      impact_table: { available: false },
    })
  })

  it('treats all-pending milestones as 0% progress', () => {
    const metrics = deriveCsrProjectMetrics({
      milestones: [
        { status: 'pending', milestone_order: 1 },
        { status: 'pending', milestone_order: 2 },
      ],
    })
    expect(metrics.completed_milestones_count).toBe(0)
    expect(metrics.milestone_progress_percentage).toBe(0)
  })

  it('counts one approved milestone among mixed statuses (authoritative review status)', () => {
    const metrics = deriveCsrProjectMetrics({
      milestones: [
        { status: 'approved', milestone_order: 1 },
        { status: 'submitted', milestone_order: 2 },
        { status: 'pending', milestone_order: 3 },
        { status: 'rejected', milestone_order: 4 },
      ],
    })
    expect(metrics.milestones_count).toBe(4)
    expect(metrics.completed_milestones_count).toBe(1)
    expect(metrics.milestone_progress_percentage).toBe(25)
  })

  it('counts approved and completed equally for progress (not evidence-row counts)', () => {
    const metrics = deriveCsrProjectMetrics({
      milestones: [
        { status: 'approved', milestone_order: 1 },
        { status: 'submitted', milestone_order: 2 },
        { status: 'completed', milestone_order: 3 },
        { status: 'pending', milestone_order: 4 },
      ],
    })
    expect(metrics.completed_milestones_count).toBe(2)
    expect(metrics.milestone_progress_percentage).toBe(50)
  })

  it('returns 100% when every milestone is terminal', () => {
    const metrics = deriveCsrProjectMetrics({
      milestones: [
        { status: 'approved', milestone_order: 1 },
        { status: 'completed', milestone_order: 2 },
      ],
    })
    expect(metrics.milestone_progress_percentage).toBe(100)
  })

  it('does not treat rejected or submitted milestones as complete', () => {
    const metrics = deriveCsrProjectMetrics({
      milestones: [
        { status: 'rejected', milestone_order: 1 },
        { status: 'submitted', milestone_order: 2 },
      ],
    })
    expect(metrics.completed_milestones_count).toBe(0)
    expect(metrics.milestone_progress_percentage).toBe(0)
  })

  it('is stable when the same inputs are derived twice', () => {
    const input = {
      milestones: [
        { status: 'approved', milestone_order: 1 },
        { status: 'pending', milestone_order: 2 },
      ],
      payments: [{ payment_status: CONFIRMED_PAYMENT_STATUS, amount: 100 }],
    }
    expect(deriveCsrProjectMetrics(input)).toEqual(deriveCsrProjectMetrics(input))
  })

  it('does not invent progress from duplicate/missing target fields (status-only)', () => {
    // Milestone rows have no target amount in the derivation input; progress is status-only.
    const metrics = deriveCsrProjectMetrics({
      milestones: [{ status: 'pending', milestone_order: 1 }],
    })
    expect(metrics.milestone_progress_percentage).toBe(0)
  })
})

describe('deriveCsrProjectMetrics — confirmed funds', () => {
  it('sums only payment_status=confirmed and excludes pending/failed/refunded/waived', () => {
    const metrics = deriveCsrProjectMetrics({
      payments: [
        { payment_status: 'confirmed', amount: 1000, confirmed_refund_inr: 0 },
        { payment_status: 'pending', amount: 500 },
        { payment_status: 'failed', amount: 9999 },
        { payment_status: 'refunded', amount: 400 },
        { payment_status: 'waived', amount: 50 },
        { payment_status: 'Confirmed', amount: 250, confirmed_refund_inr: 0 },
      ],
    })
    expect(metrics.confirmed_funds).toBe(1250)
    expect(metrics.gross_confirmed_funds).toBe(1250)
    expect(metrics.confirmed_refund_funds).toBe(0)
    expect(metrics.confirmed_funds_available).toBe(true)
  })

  it('does not treat unenriched confirmations as net = gross', () => {
    const metrics = deriveCsrProjectMetrics({
      payments: [{ payment_status: 'confirmed', amount: 1000 }],
    })
    expect(metrics.gross_confirmed_funds).toBe(1000)
    expect(metrics.confirmed_funds).toBeNull()
    expect(metrics.confirmed_funds_available).toBe(false)
    expect(metrics.refunds_reconciled).toBe(false)
  })

  it('subtracts processed refunds from confirmed disbursements', () => {
    const metrics = deriveCsrProjectMetrics({
      payments: [
        { payment_status: 'confirmed', amount: 1000, confirmed_refund_inr: 200 },
        { payment_status: 'confirmed', amount: 500, confirmed_refund_inr: 0 },
        { payment_status: 'refunded', amount: 300, confirmed_refund_inr: 300 },
      ],
    })
    expect(metrics.gross_confirmed_funds).toBe(1500)
    expect(metrics.confirmed_refund_funds).toBe(200)
    expect(metrics.confirmed_funds).toBe(1300)
  })

  it('treats missing/non-numeric amounts as zero', () => {
    const metrics = deriveCsrProjectMetrics({
      payments: [
        { payment_status: 'confirmed', amount: null as unknown as number, confirmed_refund_inr: 0 },
        { payment_status: 'confirmed', amount: 'abc' as unknown as number, confirmed_refund_inr: 0 },
        { payment_status: 'confirmed', amount: 10, confirmed_refund_inr: 0 },
      ],
    })
    expect(metrics.confirmed_funds).toBe(10)
  })

  it('returns 0 when there are no payments (not unavailable)', () => {
    expect(deriveCsrProjectMetrics({ payments: [] }).confirmed_funds).toBe(0)
    expect(deriveCsrProjectMetrics({ payments: null }).confirmed_funds).toBe(0)
  })

  it('sums duplicate confirmed rows if present (no silent dedupe at read time)', () => {
    // Deduplication belongs at payment write/webhook time; derivation is deterministic sum.
    const metrics = deriveCsrProjectMetrics({
      payments: [
        { payment_status: 'confirmed', amount: 100, confirmed_refund_inr: 0 },
        { payment_status: 'confirmed', amount: 100, confirmed_refund_inr: 0 },
      ],
    })
    expect(metrics.confirmed_funds).toBe(200)
  })
})

describe('deriveCsrProjectMetrics — impact table passthrough', () => {
  it('keeps beneficiaries and funds_utilized unavailable without a csr_impact_metrics row', () => {
    const metrics = deriveCsrProjectMetrics({
      milestones: [{ status: 'approved', milestone_order: 1 }],
      payments: [{ payment_status: 'confirmed', amount: 1, confirmed_refund_inr: 0 }],
      impactRows: [],
    })
    expect(metrics.impact_table).toEqual({
      available: false,
      beneficiaries: null,
      funds_utilized: null,
      progress_percentage: null,
      last_updated: null,
    })
  })

  it('passes through csr_impact_metrics when a row exists without inventing values', () => {
    const metrics = deriveCsrProjectMetrics({
      milestones: [{ status: 'approved', milestone_order: 1 }],
      payments: [{ payment_status: 'failed', amount: 9999 }],
      impactRows: [
        {
          beneficiaries: 40,
          funds_utilized: 12000,
          progress_percentage: 80,
          last_updated: '2026-11-01T00:00:00Z',
        },
      ],
    })

    expect(metrics.confirmed_funds).toBe(0)
    expect(metrics.milestone_progress_percentage).toBe(100)
    expect(metrics.impact_table).toEqual({
      available: true,
      beneficiaries: 40,
      funds_utilized: 12000,
      progress_percentage: 80,
      last_updated: '2026-11-01T00:00:00Z',
    })
  })
})

describe('dashboard vs evidence timeline formula parity', () => {
  it('produces identical completed and confirmed_funds counts for the same rows', () => {
    const milestones = [
      { status: 'approved', milestone_order: 1 },
      { status: 'completed', milestone_order: 2 },
      { status: 'submitted', milestone_order: 3 },
    ]
    const payments = [
      { payment_status: 'confirmed', amount: 700, confirmed_refund_inr: 0 },
      { payment_status: 'pending', amount: 50 },
    ]
    const listView = deriveCsrProjectMetrics({ milestones, payments })
    const timelineView = deriveCsrProjectMetrics({ milestones, payments, impactRows: null })
    expect(timelineView.completed_milestones_count).toBe(listView.completed_milestones_count)
    expect(timelineView.confirmed_funds).toBe(listView.confirmed_funds)
    expect(timelineView.completed_milestones_count).toBe(2)
    expect(timelineView.confirmed_funds).toBe(700)
    expect(timelineView.pending_payment_funds).toBe(50)
    expect(timelineView.paid_completed_milestones_count).toBe(1)
    expect(timelineView.overall_completion_percentage).toBe(33)
  })
})

describe('payment-gated milestone progress', () => {
  const sequence = [
    { id: 'm1', status: 'approved', milestone_order: 1 },
    { id: 'm2', status: 'pending', milestone_order: 2 },
  ]

  it('keeps an approved milestone current until payment completes', () => {
    expect(resolveCurrentFieldMilestone(sequence)?.id).toBe('m1')
    expect(priorMilestonesArePaidComplete(sequence, 'm2')).toBe(false)
  })

  it('unlocks the next milestone only after the previous payment is completed', () => {
    const paid = [
      { id: 'm1', status: 'completed', milestone_order: 1 },
      { id: 'm2', status: 'pending', milestone_order: 2 },
    ]
    expect(resolveCurrentFieldMilestone(paid)?.id).toBe('m2')
    expect(priorMilestonesArePaidComplete(paid, 'm2')).toBe(true)
  })
})

describe('deriveMilestoneLifecycleStage', () => {
  it('keeps rejected milestones from advancing to payment', () => {
    const result = deriveMilestoneLifecycleStage({
      milestoneStatus: 'rejected',
      hasEvidence: true,
      reviewDecision: 'rejected',
    })
    expect(result.stage).toBe('rejected')
    expect(result.steps.map((s) => s.id)).toEqual([
      'awaiting_evidence',
      'awaiting_review',
      'rejected',
    ])
    expect(result.steps.find((s) => s.id === 'rejected')?.state).toBe('current')
  })

  it('labels approved without initiation separately from initiated pending payment', () => {
    expect(
      deriveMilestoneLifecycleStage({
        milestoneStatus: 'approved',
        hasEvidence: true,
        reviewDecision: 'approved',
      }).label
    ).toBe('Approved — payment not initiated')
    expect(
      deriveMilestoneLifecycleStage({
        milestoneStatus: 'approved',
        hasEvidence: true,
        reviewDecision: 'approved',
        paymentStatus: 'pending',
      }).label
    ).toBe('Payment initiated — awaiting confirmation')
  })

  it('treats approval as payment pending stage, not completed', () => {
    const result = deriveMilestoneLifecycleStage({
      milestoneStatus: 'approved',
      hasEvidence: true,
      reviewDecision: 'approved',
      paymentStatus: 'pending',
    })
    expect(result.stage).toBe('payment_pending')
    expect(result.steps.find((s) => s.id === 'completed')?.state).toBe('upcoming')
  })

  it('marks completed only after confirmed payment or completed status', () => {
    expect(
      deriveMilestoneLifecycleStage({
        milestoneStatus: 'approved',
        paymentStatus: 'confirmed',
      }).stage
    ).toBe('completed')
    expect(deriveMilestoneLifecycleStage({ milestoneStatus: 'completed' }).stage).toBe('completed')
  })
})

describe('deriveCsrProjectMetrics — approved awaiting vs pending payment', () => {
  it('does not count approved-unpaid milestones as initiated pending payments', () => {
    const metrics = deriveCsrProjectMetrics({
      milestones: [
        { id: 'm1', status: 'approved', milestone_order: 1, amount: 100000 },
        { id: 'm2', status: 'pending', milestone_order: 2, amount: 50000 },
      ],
      payments: [],
    })
    expect(metrics.approved_awaiting_payment_funds).toBe(100000)
    expect(metrics.pending_payment_funds).toBe(0)
    expect(metrics.confirmed_funds).toBe(0)
  })

  it('keeps initiated pending payment rows separate from approved-awaiting', () => {
    const metrics = deriveCsrProjectMetrics({
      milestones: [{ id: 'm1', status: 'approved', milestone_order: 1, amount: 100000 }],
      payments: [{ payment_status: 'pending', amount: 100000, milestone_id: 'm1' }],
    })
    expect(metrics.approved_awaiting_payment_funds).toBe(100000)
    expect(metrics.pending_payment_funds).toBe(100000)
    expect(metrics.confirmed_funds).toBe(0)
  })

  it('moves funds to disbursed only after confirmation and clears awaiting when paid', () => {
    const metrics = deriveCsrProjectMetrics({
      milestones: [{ id: 'm1', status: 'completed', milestone_order: 1, amount: 100000 }],
      payments: [{ payment_status: 'confirmed', amount: 100000, milestone_id: 'm1', confirmed_refund_inr: 0 }],
    })
    expect(metrics.confirmed_funds).toBe(100000)
    expect(metrics.approved_awaiting_payment_funds).toBe(0)
    expect(metrics.pending_payment_funds).toBe(0)
  })

  it('ignores failed and cancelled payments for disbursed and pending', () => {
    const metrics = deriveCsrProjectMetrics({
      milestones: [{ id: 'm1', status: 'approved', milestone_order: 1, amount: 100000 }],
      payments: [
        { payment_status: 'failed', amount: 100000, milestone_id: 'm1' },
        { payment_status: 'cancelled', amount: 100000, milestone_id: 'm1' },
      ],
    })
    expect(metrics.confirmed_funds).toBe(0)
    expect(metrics.pending_payment_funds).toBe(0)
    expect(metrics.approved_awaiting_payment_funds).toBe(100000)
  })
})

describe('deriveCsrProjectFinance', () => {
  it('keeps approved budget and treats confirmed disbursements as disbursed only', () => {
    expect(
      deriveCsrProjectFinance({
        totalBudget: 500000,
        projectFundsUtilized: 25000,
        impactFundsUtilized: 25000,
        confirmedFunds: 25000,
        pendingPaymentFunds: 5000,
        approvedAwaitingPaymentFunds: 100000,
      })
    ).toMatchObject({
      budget: 500000,
      disbursed: 25000,
      disbursed_available: true,
      pending_payments: 5000,
      approved_awaiting_payment: 100000,
      utilised: null,
      utilised_available: false,
      allocated: null,
      allocated_available: false,
      remaining: null,
      utilisation_percentage: null,
    })
  })

  it('marks disbursed unavailable when confirmedFunds is null', () => {
    expect(
      deriveCsrProjectFinance({
        totalBudget: 100000,
        confirmedFunds: null,
        pendingPaymentFunds: 0,
      })
    ).toMatchObject({
      disbursed: null,
      disbursed_available: false,
    })
  })

  it('keeps expenditure unavailable after disbursement', () => {
    const finance = deriveCsrProjectFinance({
      totalBudget: 500000,
      confirmedFunds: 100000,
      pendingPaymentFunds: 0,
      approvedAwaitingPaymentFunds: 0,
    })
    expect(finance.disbursed).toBe(100000)
    expect(finance.utilised_available).toBe(false)
    expect(finance.utilisation_percentage).toBeNull()
  })

  it('does not count disbursement as expenditure even when project.funds_utilized mirrors payments', () => {
    const finance = deriveCsrProjectFinance({
      totalBudget: 100000,
      projectFundsUtilized: 45000,
      confirmedFunds: 45000,
      pendingPaymentFunds: 0,
    })
    expect(finance.disbursed).toBe(45000)
    expect(finance.utilised_available).toBe(false)
    expect(finance.utilised).toBeNull()
    expect(finance.utilisation_percentage).toBeNull()
    expect(finance.budget).toBe(100000)
  })

  it('shows allocation and expenditure unavailable without verified records', () => {
    const finance = deriveCsrProjectFinance({
      totalBudget: 100000,
      confirmedFunds: 0,
      pendingPaymentFunds: 1200,
    })
    expect(finance.allocated_available).toBe(false)
    expect(finance.utilised_available).toBe(false)
    expect(finance.pending_payments).toBe(1200)
    expect(finance.disbursed).toBe(0)
  })

  it('keeps pending payments separate from disbursed and expenditure', () => {
    const finance = deriveCsrProjectFinance({
      totalBudget: 200000,
      confirmedFunds: 80000,
      pendingPaymentFunds: 15000,
    })
    expect(finance.disbursed).toBe(80000)
    expect(finance.pending_payments).toBe(15000)
    expect(finance.utilised).toBeNull()
  })

  it('uses verified expenditure only when explicitly provided', () => {
    expect(
      deriveCsrProjectFinance({
        totalBudget: 100000,
        confirmedFunds: 45000,
        pendingPaymentFunds: 0,
        verifiedExpenditure: 40000,
        allocatedFunds: 90000,
      })
    ).toMatchObject({
      budget: 100000,
      allocated: 90000,
      allocated_available: true,
      disbursed: 45000,
      utilised: 40000,
      utilised_available: true,
      remaining: 60000,
      utilisation_percentage: 40,
    })
  })
})
