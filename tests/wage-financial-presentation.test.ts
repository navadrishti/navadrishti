import { describe, expect, it } from 'vitest'
import {
  aggregateProjectExpenses,
  buildCompanyCaProjectFinanceReport,
  calculateVerifiedWorkerWage,
} from '@/lib/csr-agent/project-ops-finance'
import {
  presentWageFinancials,
  presentWageLedgerRows,
} from '@/lib/csr-agent/wage-financial-presentation'

const PROJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('wage financial presentation fixtures (isolated, non-persistent)', () => {
  it('1. all wages paid', () => {
    const view = presentWageFinancials({
      attendanceEntries: [
        { attendance_status: 'present', amount_due: 400, payment_status: 'paid' },
        { attendance_status: 'present', amount_due: 400, payment_status: 'paid' },
      ],
    })
    expect(view).toMatchObject({
      paid: 800,
      waived: 0,
      outstanding: 0,
      recognizedExpenditure: 800,
      unavailable: false,
      hasAttendance: true,
    })
  })

  it('2. all wages waived — never paid or outstanding', () => {
    const view = presentWageFinancials({
      attendanceEntries: [
        { attendance_status: 'present', amount_due: 300, payment_status: 'waived' },
        { attendance_status: 'present', amount_due: 200, payment_status: 'waived' },
      ],
    })
    expect(view).toMatchObject({
      paid: 0,
      waived: 500,
      outstanding: 0,
      recognizedExpenditure: 0,
      verifiedTotal: 500,
    })
  })

  it('3. paid and outstanding together', () => {
    const view = presentWageFinancials({
      attendanceEntries: [
        { attendance_status: 'present', amount_due: 500, payment_status: 'paid' },
        { attendance_status: 'present', amount_due: 250, payment_status: 'pending' },
        { attendance_status: 'present', amount_due: 250, payment_status: 'billed' },
      ],
    })
    expect(view).toMatchObject({
      paid: 500,
      waived: 0,
      outstanding: 500,
      recognizedExpenditure: 1000,
    })
  })

  it('4. paid, waived and outstanding together', () => {
    const workforce = calculateVerifiedWorkerWage([
      { attendance_status: 'present', amount_due: 400, payment_status: 'paid' },
      { attendance_status: 'present', amount_due: 150, payment_status: 'waived' },
      { attendance_status: 'present', amount_due: 350, payment_status: 'pending' },
    ])
    expect(workforce).toMatchObject({
      paid_amount: 400,
      waived_amount: 150,
      outstanding_amount: 350,
      wage_expense: 900,
    })

    const agg = aggregateProjectExpenses({
      totalBudget: 10000,
      expenses: [],
      attendanceWagePaid: workforce.paid_amount,
      attendanceWageOutstanding: workforce.outstanding_amount,
      attendanceWageWaived: workforce.waived_amount,
      attendanceWageExpense: workforce.wage_expense,
    })
    expect(agg.amount_paid).toBe(400)
    expect(agg.outstanding_amount).toBe(350)
    expect(agg.waived_amount).toBe(150)
    // Waived excluded from recognized/actual worker_wages.
    expect(agg.by_category_actual.worker_wages).toBe(750)
    expect(agg.actual_expenditure).toBe(750)
  })

  it('5. partial settlement with remaining balance', () => {
    const view = presentWageFinancials({
      attendanceEntries: [
        { attendance_status: 'present', amount_due: 600, payment_status: 'paid' },
        { attendance_status: 'present', amount_due: 400, payment_status: 'billed' },
      ],
    })
    expect(view.paid).toBe(600)
    expect(view.outstanding).toBe(400)
    expect(view.recognizedExpenditure).toBe(1000)
  })

  it('6. completed assignment with remaining wages', () => {
    const report = buildCompanyCaProjectFinanceReport({
      project: { id: PROJECT, title: 'Completed with wages due', total_budget: 50000 },
      milestones: [{ status: 'completed' }],
      attendanceEntries: [
        { attendance_status: 'present', amount_due: 700, payment_status: 'paid' },
        { attendance_status: 'present', amount_due: 300, payment_status: 'pending' },
      ],
      confirmedDisbursements: 10000,
    })
    expect(report.workforce).toMatchObject({
      paid_amount: 700,
      outstanding_amount: 300,
      waived_amount: 0,
    })
    expect(report.expenses.amount_paid).toBe(700)
    expect(report.expenses.outstanding_amount).toBe(300)
    expect(report.expenses.waived_amount).toBe(0)
    expect(report.expenses.by_category_actual.worker_wages).toBe(1000)
  })

  it('7. no attendance records', () => {
    const empty = presentWageFinancials({ attendanceEntries: [] })
    expect(empty).toMatchObject({
      paid: 0,
      waived: 0,
      outstanding: 0,
      hasAttendance: false,
      unavailable: false,
    })

    const missing = presentWageFinancials({ attendanceEntries: null })
    expect(missing.unavailable).toBe(true)
    expect(missing.unavailableReason).toMatch(/No attendance/i)
  })

  it('8. unavailable or unreconciled financial data', () => {
    const unavailable = presentWageFinancials({
      sourceUnavailable: true,
      unavailableReason: 'Expense ledger enrichment missing',
    })
    expect(unavailable).toMatchObject({
      unavailable: true,
      paid: 0,
      outstanding: 0,
      unavailableReason: 'Expense ledger enrichment missing',
    })

    const ledger = presentWageLedgerRows([
      {
        category: 'worker_wages',
        amount: 500,
        payment_status: 'paid',
        approval_status: 'approved',
      },
      {
        category: 'worker_wages',
        amount: 200,
        payment_status: 'waived',
        approval_status: 'approved',
      },
      {
        category: 'worker_wages',
        amount: 100,
        payment_status: 'unpaid',
        approval_status: 'approved',
      },
      {
        category: 'materials',
        amount: 999,
        payment_status: 'paid',
        approval_status: 'approved',
      },
    ])
    expect(ledger).toMatchObject({
      paid: 500,
      waived: 200,
      outstanding: 100,
      recognizedExpenditure: 600,
    })
  })

  it('ledger waived rows never count as paid expenditure', () => {
    const agg = aggregateProjectExpenses({
      totalBudget: 5000,
      expenses: [
        {
          project_id: PROJECT,
          category: 'worker_wages',
          amount: 400,
          approval_status: 'approved',
          payment_status: 'waived',
          source_type: 'engagement_settlement',
          source_reference: `${PROJECT}:waived`,
        },
        {
          project_id: PROJECT,
          category: 'worker_wages',
          amount: 600,
          approval_status: 'approved',
          payment_status: 'paid',
          source_type: 'engagement_settlement',
          source_reference: `${PROJECT}:pay_1`,
        },
      ],
    })
    expect(agg.waived_amount).toBe(400)
    expect(agg.amount_paid).toBe(600)
    expect(agg.outstanding_amount).toBe(0)
    expect(agg.by_category_actual.worker_wages).toBe(600)
    expect(agg.actual_expenditure).toBe(600)
  })
})
