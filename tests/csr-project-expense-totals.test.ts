import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseFake } from './support/supabase-fake'
import { deriveCsrProjectFinance } from '@/lib/csr-agent/project-metrics'

vi.mock('server-only', () => ({}))
const mocks = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/db', () => ({ supabase: { from: mocks.from } }))

import { loadProjectExpenseTotals } from '@/lib/csr-agent/project-expense-totals'

const row = (id: string, approval_status: string, amount: number, project_id = 'project-1') => ({
  id, project_id, category: 'materials', amount, approval_status, payment_status: 'unpaid',
})

beforeEach(() => mocks.from.mockReset())

describe('project expense totals', () => {
  it('counts approved and recorded expenditure, excluding pending, rejected and flagged submissions', async () => {
    const fake = createSupabaseFake({ 'csr_project_expenses.select': [{ data: [
      row('1', 'approved', 200), row('2', 'recorded', 50), row('3', 'proposed', 900),
      row('4', 'rejected', 800), row('5', 'unreconciled', 700),
      { ...row('6', 'approved', 100), category: 'outbound_logistics', metadata: { confirmed_refund_inr: 30 } },
      row('7', 'approved', 40, 'project-2'),
    ] }] })
    mocks.from.mockImplementation(fake.from)
    const totals = await loadProjectExpenseTotals(['project-1', 'project-2', 'empty'])
    expect(totals?.get('project-1')).toBe(320)
    expect(totals?.get('project-2')).toBe(40)
    expect(totals?.get('empty')).toBe(0)
    const finance = deriveCsrProjectFinance({
      totalBudget: 1000, verifiedExpenditure: totals?.get('project-1'),
      confirmedFunds: 0, pendingPaymentFunds: 0, approvedAwaitingPaymentFunds: 0,
    })
    expect(finance).toMatchObject({ budget: 1000, utilised: 320, remaining: 680 })
  })

  it('reads every page in a stable order', async () => {
    const fake = createSupabaseFake({ 'csr_project_expenses.select': [
      { data: Array.from({ length: 1000 }, (_, i) => row(String(i), 'approved', 1)) },
      { data: [row('1000', 'approved', 5)] },
    ] })
    mocks.from.mockImplementation(fake.from)
    expect((await loadProjectExpenseTotals(['project-1']))?.get('project-1')).toBe(1005)
    expect(fake.find('csr_project_expenses').map((query) => query.filters)).toEqual([
      expect.arrayContaining([['order', 'id', { ascending: true }], ['range', 0, 999]]),
      expect.arrayContaining([['order', 'id', { ascending: true }], ['range', 1000, 1999]]),
    ])
  })

  it('marks a missing ledger unavailable and surfaces other errors', async () => {
    const failure = { code: '42501', message: 'permission denied' }
    const fake = createSupabaseFake({ 'csr_project_expenses.select': [
      { error: { code: '42P01' } }, { error: failure }, { data: null },
    ] })
    mocks.from.mockImplementation(fake.from)
    expect(await loadProjectExpenseTotals(['project-1'])).toBeNull()
    await expect(loadProjectExpenseTotals(['project-1'])).rejects.toEqual(failure)
    await expect(loadProjectExpenseTotals(['project-1'])).rejects.toThrow('invalid response')
  })
})
