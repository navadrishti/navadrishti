/**
 * Pure wage financial presentation helpers for NGO / Company / Company CA UIs.
 * Never invents amounts — unavailable when source data is missing.
 */

import {
  calculateVerifiedWorkerWage,
  type AttendanceWageEntry,
} from '@/lib/csr-agent/project-ops-finance'

function money(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0
}

export type WageFinancialPresentation = {
  paid: number
  waived: number
  outstanding: number
  /** Verified attendance dues (paid + waived + outstanding). */
  verifiedTotal: number
  /**
   * Recognized expenditure for project finance (paid + outstanding).
   * Waived is excluded — never treated as actual spend.
   */
  recognizedExpenditure: number
  hasAttendance: boolean
  unavailable: boolean
  unavailableReason: string | null
}

/**
 * Present paid / waived / outstanding wages from attendance rows.
 * When attendance is absent or explicitly unavailable, returns an unavailable state
 * (amounts stay 0 with unavailable=true — not a fake “fully settled” zero).
 */
export function presentWageFinancials(input: {
  attendanceEntries?: AttendanceWageEntry[] | null
  /** Force unavailable when the finance ledger/source cannot be loaded. */
  sourceUnavailable?: boolean
  unavailableReason?: string | null
}): WageFinancialPresentation {
  if (input.sourceUnavailable) {
    return {
      paid: 0,
      waived: 0,
      outstanding: 0,
      verifiedTotal: 0,
      recognizedExpenditure: 0,
      hasAttendance: false,
      unavailable: true,
      unavailableReason: input.unavailableReason || 'Wage financial data unavailable',
    }
  }

  const entries = Array.isArray(input.attendanceEntries) ? input.attendanceEntries : null
  if (entries == null) {
    return {
      paid: 0,
      waived: 0,
      outstanding: 0,
      verifiedTotal: 0,
      recognizedExpenditure: 0,
      hasAttendance: false,
      unavailable: true,
      unavailableReason: input.unavailableReason || 'No attendance wage records loaded',
    }
  }

  if (entries.length === 0) {
    return {
      paid: 0,
      waived: 0,
      outstanding: 0,
      verifiedTotal: 0,
      recognizedExpenditure: 0,
      hasAttendance: false,
      unavailable: false,
      unavailableReason: null,
    }
  }

  const workforce = calculateVerifiedWorkerWage(entries)
  return {
    paid: workforce.paid_amount,
    waived: workforce.waived_amount,
    outstanding: workforce.outstanding_amount,
    verifiedTotal: workforce.wage_expense,
    recognizedExpenditure: money(workforce.paid_amount + workforce.outstanding_amount),
    hasAttendance: true,
    unavailable: false,
    unavailableReason: null,
  }
}

/** Summarise worker_wages ledger rows for company / CA cards. */
export function presentWageLedgerRows(
  rows: Array<{
    category?: string | null
    amount?: number | null
    payment_status?: string | null
    approval_status?: string | null
  }> | null | undefined
): Pick<WageFinancialPresentation, 'paid' | 'waived' | 'outstanding' | 'recognizedExpenditure' | 'verifiedTotal'> {
  let paid = 0
  let waived = 0
  let outstanding = 0
  for (const row of rows || []) {
    if (String(row.category || '').toLowerCase() !== 'worker_wages') continue
    const amount = money(row.amount)
    const payment = String(row.payment_status || '').toLowerCase()
    if (payment === 'waived') waived = money(waived + amount)
    else if (payment === 'paid') paid = money(paid + amount)
    else outstanding = money(outstanding + amount)
  }
  return {
    paid,
    waived,
    outstanding,
    recognizedExpenditure: money(paid + outstanding),
    verifiedTotal: money(paid + waived + outstanding),
  }
}
