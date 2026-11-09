import { describe, expect, it } from 'vitest'
import {
  aggregateProjectExpenses,
  assertSeparateShipmentLegs,
  buildCompanyCaProjectFinanceReport,
  calculateVerifiedWorkerWage,
  dedupeExpenseRows,
  reconcileMaterialQuantities,
} from '@/lib/csr-agent/project-ops-finance'

describe('calculateVerifiedWorkerWage', () => {
  it('uses verified attendance units × rate and skips unverified rows', () => {
    const result = calculateVerifiedWorkerWage([
      { attendance_status: 'present', wage_rate: 500, payment_status: 'pending' },
      { attendance_status: 'absent', wage_rate: 500, payment_status: 'pending' },
      { attendance_status: 'partial', wage_rate: 500, payment_status: 'pending' },
      { attendance_status: 'present', amount_due: 450, payment_status: 'paid' },
    ])
    expect(result.skipped_unverified).toBe(1)
    expect(result.verified_units).toBe(2.5)
    expect(result.wage_expense).toBe(500 + 250 + 450)
    expect(result.paid_amount).toBe(450)
    expect(result.outstanding_amount).toBe(750)
  })

  it('does not invent wages when present but rate and amount are missing', () => {
    const result = calculateVerifiedWorkerWage([
      { attendance_status: 'present', payment_status: 'pending' },
    ])
    expect(result.verified_units).toBe(1)
    expect(result.wage_expense).toBe(0)
  })
})

describe('reconcileMaterialQuantities', () => {
  it('tracks consumable remaining after consumption', () => {
    const result = reconcileMaterialQuantities({
      name: 'Cement bags',
      item_kind: 'consumable',
      procured_quantity: 100,
      dispatched_quantity: 100,
      received_quantity: 98,
      consumed_quantity: 80,
      damaged_quantity: 2,
      missing_quantity: 1,
      returned_quantity: 0,
      unit_cost: 350,
    })
    expect(result.remaining_on_site).toBe(15)
    expect(result.purchase_cost).toBe(35000)
    expect(result.variance_flags).toEqual([])
  })

  it('keeps reusable equipment until returned and flags shipment collision', () => {
    const result = reconcileMaterialQuantities({
      name: 'Water pump',
      item_kind: 'reusable_equipment',
      procured_quantity: 2,
      dispatched_quantity: 2,
      received_quantity: 2,
      consumed_quantity: 2,
      returned_quantity: 1,
      outbound_shipment_ref: 'WAYBILL-1',
      return_shipment_ref: 'WAYBILL-1',
    })
    expect(result.remaining_on_site).toBe(1)
    expect(result.shipment_legs_ok).toBe(false)
    expect(result.variance_flags).toContain('outbound_return_tracking_collision')
  })
})

describe('assertSeparateShipmentLegs', () => {
  it('accepts distinct outbound and return tracking ids', () => {
    expect(
      assertSeparateShipmentLegs([
        { leg: 'outbound', tracking_id: 'OUT-1' },
        { leg: 'return', tracking_id: 'RET-1' },
      ]).ok
    ).toBe(true)
  })

  it('rejects identical tracking numbers across legs', () => {
    const result = assertSeparateShipmentLegs([
      { leg: 'outbound', tracking_id: 'SAME' },
      { leg: 'return', tracking_id: 'SAME' },
    ])
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/separate tracking/i)
  })
})

describe('dedupeExpenseRows + aggregateProjectExpenses', () => {
  it('prevents duplicate expense counting for the same source reference', () => {
    const rows = dedupeExpenseRows([
      {
        project_id: 'p1',
        category: 'materials',
        amount: 1000,
        approval_status: 'proposed',
        payment_status: 'unpaid',
        source_type: 'invoice',
        source_reference: 'INV-9',
      },
      {
        project_id: 'p1',
        category: 'materials',
        amount: 1000,
        approval_status: 'approved',
        payment_status: 'paid',
        source_type: 'invoice',
        source_reference: 'INV-9',
      },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].approval_status).toBe('approved')

    const agg = aggregateProjectExpenses({
      totalBudget: 10000,
      expenses: rows,
      confirmedDisbursements: 5000,
    })
    expect(agg.actual_expenditure).toBe(1000)
    expect(agg.by_category_actual.materials).toBe(1000)
    expect(agg.amount_paid).toBe(1000)
    expect(agg.finance.utilised).toBe(1000)
    expect(agg.budget_variance).toBe(9000)
  })

  it('keeps proposed and unreconciled out of actual expenditure', () => {
    const agg = aggregateProjectExpenses({
      totalBudget: 5000,
      expenses: [
        {
          project_id: 'p1',
          category: 'other',
          amount: 200,
          approval_status: 'proposed',
          payment_status: 'unpaid',
        },
        {
          project_id: 'p1',
          category: 'outbound_logistics',
          amount: 300,
          approval_status: 'unreconciled',
          payment_status: 'unpaid',
        },
        {
          project_id: 'p1',
          category: 'worker_wages',
          amount: 1000,
          approval_status: 'approved',
          payment_status: 'unpaid',
        },
      ],
    })
    expect(agg.actual_expenditure).toBe(1000)
    expect(agg.proposed_expenditure).toBe(500)
    expect(agg.unreconciled_amount).toBe(300)
    expect(agg.outstanding_amount).toBe(1000)
  })

  it('overlays attendance wages when wage ledger rows are absent', () => {
    const agg = aggregateProjectExpenses({
      totalBudget: 8000,
      expenses: [],
      attendanceWageExpense: 1200,
      attendanceWagePaid: 400,
      attendanceWageOutstanding: 800,
    })
    expect(agg.by_category_actual.worker_wages).toBe(1200)
    expect(agg.amount_paid).toBe(400)
    expect(agg.outstanding_amount).toBe(800)
  })
})

describe('buildCompanyCaProjectFinanceReport', () => {
  it('aggregates workforce, materials, logistics and budget variance for CA review', () => {
    const report = buildCompanyCaProjectFinanceReport({
      project: {
        id: '11111111-1111-1111-1111-111111111111',
        title: 'School renovation',
        ngo_user_id: 12,
        company_user_id: 40,
        total_budget: 100000,
      },
      milestones: [{ status: 'completed' }, { status: 'approved' }, { status: 'pending' }],
      attendanceEntries: [
        { attendance_status: 'present', wage_rate: 600, payment_status: 'paid' },
        { attendance_status: 'present', wage_rate: 600, payment_status: 'pending' },
      ],
      materials: [
        {
          name: 'Timber',
          item_kind: 'consumable',
          procured_quantity: 50,
          dispatched_quantity: 50,
          received_quantity: 50,
          consumed_quantity: 40,
          unit_cost: 100,
        },
      ],
      shipmentLegs: [
        { leg: 'outbound', tracking_id: 'OUT-22' },
        { leg: 'return', tracking_id: 'RET-9' },
      ],
      expenses: [
        {
          project_id: '11111111-1111-1111-1111-111111111111',
          category: 'materials',
          amount: 5000,
          approval_status: 'approved',
          payment_status: 'paid',
          invoice_url: 'https://example.test/inv.pdf',
          source_type: 'invoice',
          source_reference: 'INV-1',
        },
      ],
      evidenceCount: 4,
      confirmedDisbursements: 25000,
    })

    expect(report.milestones).toEqual({ total: 3, completed: 2, progress_percentage: 67 })
    expect(report.workforce.wage_expense).toBe(1200)
    expect(report.materials[0].remaining_on_site).toBe(10)
    expect(report.logistics.legs_ok).toBe(true)
    // Materials ledger 5000 + attendance wages 1200 (no wage ledger rows yet).
    expect(report.expenses.actual_expenditure).toBe(6200)
    expect(report.expenses.by_category_actual.worker_wages).toBe(1200)
    expect(report.expenses.budget_variance).toBe(93800)
    expect(report.invoice_urls).toEqual(['https://example.test/inv.pdf'])
    expect(report.evidence_count).toBe(4)
  })

  it('does not mark proposed expenses as approved actual spend', () => {
    const report = buildCompanyCaProjectFinanceReport({
      project: {
        id: '22222222-2222-2222-2222-222222222222',
        title: 'Well dig',
        total_budget: 20000,
      },
      expenses: [
        {
          project_id: '22222222-2222-2222-2222-222222222222',
          category: 'other',
          amount: 1500,
          approval_status: 'proposed',
          payment_status: 'unpaid',
        },
      ],
    })
    expect(report.expenses.actual_expenditure).toBe(0)
    expect(report.expenses.proposed_expenditure).toBe(1500)
    expect(report.expenses.finance.utilised).toBe(0)
  })
})
