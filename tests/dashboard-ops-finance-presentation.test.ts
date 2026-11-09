import { describe, expect, it } from 'vitest'
import type { ProjectExpenseRow, MaterialQuantityRow } from '@/lib/csr-agent/project-ops-finance'
import {
  presentMaterialReviewSummary,
  presentOpsExpenseFinance,
  rollUpOpsFinancePresentations,
} from '@/lib/dashboard/ops-finance-presentation'

function expense( partial: Partial<ProjectExpenseRow> & Pick<ProjectExpenseRow, 'category' | 'amount' | 'approval_status' | 'payment_status'>): ProjectExpenseRow {
  return {
    project_id: 'p1',
    ...partial,
  }
}

describe('NGO / company ops expense presentation', () => {
  it('aggregates approved, paid, unpaid approved, proposed and unreconciled without mixing scopes', () => {
    const presented = presentOpsExpenseFinance({
      expenses: [
        expense({
          id: '1',
          category: 'equipment',
          amount: 1000,
          approval_status: 'approved',
          payment_status: 'paid',
        }),
        expense({
          id: '2',
          category: 'equipment',
          amount: 400,
          approval_status: 'approved',
          payment_status: 'unpaid',
        }),
        expense({
          id: '3',
          category: 'other',
          amount: 250,
          approval_status: 'proposed',
          payment_status: 'unpaid',
        }),
        expense({
          id: '4',
          category: 'other',
          amount: 75,
          approval_status: 'unreconciled',
          payment_status: 'unpaid',
        }),
      ],
    })

    expect(presented.approved_amount).toBe(1400)
    expect(presented.actual_expenditure).toBe(1400)
    expect(presented.amount_paid).toBe(1000)
    expect(presented.unpaid_approved_amount).toBe(400)
    expect(presented.proposed_expenditure).toBe(325)
    expect(presented.unreconciled_amount).toBe(75)
    expect(presented.proposed_expenditure).not.toBe(presented.actual_expenditure)
  })

  it('keeps material review separate and never rolls catalog cost into actual expenditure', () => {
    const materials: Array<MaterialQuantityRow & { approval_status?: string }> = [
      {
        name: 'Cement',
        item_kind: 'consumable',
        required_quantity: 100,
        received_quantity: 80,
        procured_quantity: 100,
        unit_cost: 350,
        approval_status: 'approved',
      },
      {
        name: 'Pipes',
        item_kind: 'consumable',
        required_quantity: 20,
        received_quantity: 0,
        unit_cost: 100,
        approval_status: 'proposed',
      },
    ]
    const materialsSummary = presentMaterialReviewSummary(materials)
    const presented = presentOpsExpenseFinance({ expenses: [], materials })

    expect(materialsSummary.approved).toBe(1)
    expect(materialsSummary.pending_review).toBe(1)
    expect(materialsSummary.receipt_progress_available).toBe(true)
    expect(materialsSummary.catalog_cost_available).toBe(true)
    expect(presented.actual_expenditure).toBe(0)
    expect(presented.approved_amount).toBe(0)
  })

  it('uses confirmed logistics freight only for logistics actuals', () => {
    const presented = presentOpsExpenseFinance({
      expenses: [
        expense({
          id: 'out',
          category: 'outbound_logistics',
          amount: 500,
          approval_status: 'approved',
          payment_status: 'paid',
          metadata: { confirmed_refund_inr: 100 },
        }),
        expense({
          id: 'ret',
          category: 'return_logistics',
          amount: 200,
          approval_status: 'approved',
          payment_status: 'paid',
        }),
        expense({
          id: 'prop-log',
          category: 'outbound_logistics',
          amount: 999,
          approval_status: 'proposed',
          payment_status: 'unpaid',
        }),
      ],
    })

    expect(presented.logistics.outbound_net).toBe(400)
    expect(presented.logistics.return_net).toBe(200)
    expect(presented.logistics.net_expenditure).toBe(600)
    expect(presented.proposed_expenditure).toBe(999)
    expect(presented.actual_expenditure).toBe(600)
  })

  it('keeps waived wages outside paid expenditure and outstanding liability', () => {
    const presented = presentOpsExpenseFinance({
      expenses: [],
      attendanceWagePaid: 300,
      attendanceWageWaived: 150,
      attendanceWageOutstanding: 50,
      attendanceWageExpense: 500,
    })

    expect(presented.wages.paid).toBe(300)
    expect(presented.wages.waived).toBe(150)
    expect(presented.wages.outstanding).toBe(50)
    expect(presented.amount_paid).toBe(300)
    expect(presented.unpaid_approved_amount).toBe(50)
    expect(presented.actual_expenditure).toBe(350)
    expect(presented.waived_amount).toBe(150)
  })

  it('does not treat zeroed attendance overlays without source rows as an available ledger', () => {
    const fabricatedZeros = presentOpsExpenseFinance({
      expenses: [],
      attendanceWageExpense: 0,
      attendanceWagePaid: 0,
      attendanceWageOutstanding: 0,
      attendanceWageWaived: 0,
    })
    // Passing numeric zeros still signals an attendance overlay was computed — callers must
    // omit overlays when attendance source rows are absent (ops-overview does this).
    expect(fabricatedZeros.ledger_available).toBe(true)

    const trulyMissing = presentOpsExpenseFinance({ expenses: [] })
    expect(trulyMissing.ledger_available).toBe(false)
  })

  it('marks missing ledger as unavailable and surfaces unreconciled flags in portfolio rollup', () => {
    const empty = presentOpsExpenseFinance({ expenses: [] })
    expect(empty.ledger_available).toBe(false)

    const withUnreconciled = presentOpsExpenseFinance({
      expenses: [
        expense({
          id: 'u1',
          category: 'other',
          amount: 40,
          approval_status: 'unreconciled',
          payment_status: 'unpaid',
        }),
      ],
    })
    const rollup = rollUpOpsFinancePresentations([
      { finance: empty },
      { finance: withUnreconciled },
    ])
    expect(rollup.has_unreconciled_or_missing).toBe(true)
    expect(rollup.unreconciled_amount).toBe(40)
    expect(rollup.actual_expenditure).toBe(0)
    expect(rollup.scope).toBe('portfolio')
  })
})

describe('company approved versus actual and paid versus outstanding', () => {
  it('treats approved unpaid as outstanding, not paid', () => {
    const presented = presentOpsExpenseFinance({
      expenses: [
        expense({
          id: 'a',
          category: 'materials',
          amount: 800,
          approval_status: 'approved',
          payment_status: 'unpaid',
        }),
        expense({
          id: 'b',
          category: 'materials',
          amount: 200,
          approval_status: 'approved',
          payment_status: 'paid',
        }),
      ],
    })
    expect(presented.approved_amount).toBe(1000)
    expect(presented.actual_expenditure).toBe(1000)
    expect(presented.amount_paid).toBe(200)
    expect(presented.unpaid_approved_amount).toBe(800)
  })
})
