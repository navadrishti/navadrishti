import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseFake, type FakeResult } from './support/supabase-fake'
import {
  aggregateProjectExpenses,
  computeExpenseNetAmounts,
} from '@/lib/csr-agent/project-ops-finance'
import {
  buildLogisticsExpenseLedgerPayload,
  extractConfirmedLogisticsCharge,
  findAutomatedLogisticsDuplicate,
  logisticsExpenseSourceReference,
  LOGISTICS_EXPENSE_SOURCE_TYPE,
  resolveLogisticsAccounting,
  syncLogisticsExpenseFromCapabilityLeg,
} from '@/lib/csr-agent/sync-logistics-expense'
import type { CsrCapabilityRentalRecord } from '@/lib/service-engagement'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('@/lib/db', () => ({
  supabase: { from: mocks.from },
}))

function useDb(
  responses: Record<string, FakeResult[]> | ((query: { table: string; op: string }) => FakeResult | undefined)
) {
  const fake = createSupabaseFake(typeof responses === 'function' ? responses : responses)
  mocks.from.mockImplementation(fake.from)
  return fake
}

const PROJECT = '11111111-1111-1111-1111-111111111111'
const CAMPAIGN = '22222222-2222-2222-2222-222222222222'
const OUT_TRACK = 'OUTWAYBILL001'
const RET_TRACK = 'RETWAYBILL002'

function baseRental(overrides: Partial<CsrCapabilityRentalRecord> = {}): CsrCapabilityRentalRecord {
  return {
    id: 'rental-1',
    campaign_id: CAMPAIGN,
    csr_project_id: PROJECT,
    service_offer_id: 88,
    company_user_id: 40,
    provider_user_id: 50,
    offer_type: 'material_capability',
    material_total_worth_inr: 5000,
    rental_amount_inr: 2000,
    status: 'outbound_dispatched',
    payment_status: 'paid',
    logistics_provider: 'delhivery',
    outbound_delivery: {
      provider: 'delhivery',
      tracking_id: OUT_TRACK,
      last_status: 'In Transit',
      confirmed_freight_inr: 350,
    } as CsrCapabilityRentalRecord['outbound_delivery'],
    return_delivery: {
      provider: 'delhivery',
      tracking_id: RET_TRACK,
      last_status: 'Manifested',
      confirmed_freight_inr: 280,
    } as CsrCapabilityRentalRecord['return_delivery'],
    ...overrides,
  }
}

beforeEach(() => {
  mocks.from.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('extractConfirmedLogisticsCharge', () => {
  it('4. quoted charges do not become confirmed amounts', () => {
    const result = extractConfirmedLogisticsCharge({
      legMeta: { quoted_freight_inr: 400, estimated_freight_inr: 390 },
    })
    expect(result.amount).toBeNull()
    expect(result.isQuoteOnly).toBe(true)
    expect(result.quotedAmount).toBe(400)
  })

  it('never treats Delhivery package total_amount as freight', () => {
    const result = extractConfirmedLogisticsCharge({
      providerRaw: { total_amount: 2000, InvoiceAmount: 2000 },
      legMeta: {},
    })
    expect(result.amount).toBeNull()
  })

  it('accepts explicit confirmed freight and provider freight keys', () => {
    expect(
      extractConfirmedLogisticsCharge({
        legMeta: { confirmed_freight_inr: 125.5 },
      }).amount
    ).toBe(125.5)

    expect(
      extractConfirmedLogisticsCharge({
        providerRaw: { ShipmentData: [{ Shipment: { FreightCharge: 99 } }] },
      }).amount
    ).toBe(99)
  })
})

describe('syncLogisticsExpenseFromCapabilityLeg', () => {
  it('1. confirmed outbound charge creates one ledger entry', async () => {
    const fake = useDb({
      'csr_projects.select': [{ data: { id: PROJECT, campaign_id: CAMPAIGN } }],
      'csr_project_expenses.select': [{ data: null }],
      'csr_project_expenses.insert': [{ data: { id: 'exp-out' } }],
    })

    const result = await syncLogisticsExpenseFromCapabilityLeg({
      rental: baseRental(),
      leg: 'outbound',
    })

    expect(result).toEqual({ synced: true, mode: 'inserted', expenseId: 'exp-out' })
    expect(fake.writes('csr_project_expenses', 'insert')).toHaveLength(1)
    expect(fake.writes('csr_project_expenses', 'insert')[0].payload).toEqual(
      expect.objectContaining({
        project_id: PROJECT,
        category: 'outbound_logistics',
        amount: 350,
        source_type: LOGISTICS_EXPENSE_SOURCE_TYPE,
        source_reference: logisticsExpenseSourceReference('outbound', OUT_TRACK),
        approval_status: 'recorded',
        payment_status: 'unpaid',
      })
    )
  })

  it('2. confirmed return charge creates a separate ledger entry', async () => {
    const fake = useDb({
      'csr_projects.select': [{ data: { id: PROJECT, campaign_id: CAMPAIGN } }],
      'csr_project_expenses.select': [{ data: null }],
      'csr_project_expenses.insert': [{ data: { id: 'exp-ret' } }],
    })

    const result = await syncLogisticsExpenseFromCapabilityLeg({
      rental: baseRental(),
      leg: 'return',
    })

    expect(result.synced).toBe(true)
    expect(fake.writes('csr_project_expenses', 'insert')[0].payload).toEqual(
      expect.objectContaining({
        category: 'return_logistics',
        amount: 280,
        source_reference: logisticsExpenseSourceReference('return', RET_TRACK),
      })
    )
  })

  it('3. repeated webhook processing does not duplicate expenses', async () => {
    const fake = useDb({
      'csr_projects.select': [{ data: { id: PROJECT, campaign_id: CAMPAIGN } }],
      'csr_project_expenses.select': [{ data: { id: 'exp-out', payment_status: 'unpaid', metadata: {} } }],
      'csr_project_expenses.update': [{ data: { id: 'exp-out' } }],
    })

    const result = await syncLogisticsExpenseFromCapabilityLeg({
      rental: baseRental({
        outbound_delivery: {
          provider: 'delhivery',
          tracking_id: OUT_TRACK,
          confirmed_freight_inr: 360,
          freight_payment_status: 'paid',
        } as CsrCapabilityRentalRecord['outbound_delivery'],
      }),
      leg: 'outbound',
    })

    expect(result).toEqual({ synced: true, mode: 'updated', expenseId: 'exp-out' })
    expect(fake.writes('csr_project_expenses', 'insert')).toHaveLength(0)
    expect(fake.writes('csr_project_expenses', 'update')).toHaveLength(1)
    expect(fake.writes('csr_project_expenses', 'update')[0].payload).toEqual(
      expect.objectContaining({ amount: 360, payment_status: 'paid' })
    )
  })

  it('4b. quote-only legs do not insert ledger rows', async () => {
    const fake = useDb({})
    const result = await syncLogisticsExpenseFromCapabilityLeg({
      rental: baseRental({
        outbound_delivery: {
          provider: 'delhivery',
          tracking_id: OUT_TRACK,
          quoted_freight_inr: 500,
        } as CsrCapabilityRentalRecord['outbound_delivery'],
      }),
      leg: 'outbound',
    })
    expect(result).toEqual(expect.objectContaining({ synced: false, reason: 'quote_only' }))
    expect(fake.writes('csr_project_expenses')).toHaveLength(0)
  })

  it('5. cancellation without refund confirmation keeps paid charge and flags pending', async () => {
    const fake = useDb({
      'csr_projects.select': [{ data: { id: PROJECT, campaign_id: CAMPAIGN } }],
      'csr_project_expenses.select': [
        { data: { id: 'exp-out', payment_status: 'paid', approval_status: 'recorded', metadata: {} } },
      ],
      'csr_project_expenses.update': [{ data: { id: 'exp-out' } }],
    })

    const result = await syncLogisticsExpenseFromCapabilityLeg({
      rental: baseRental({
        outbound_delivery: {
          provider: 'delhivery',
          tracking_id: OUT_TRACK,
          last_status: 'Cancelled',
          confirmed_freight_inr: 350,
          freight_payment_status: 'paid',
        } as CsrCapabilityRentalRecord['outbound_delivery'],
      }),
      leg: 'outbound',
    })

    expect(result.synced).toBe(true)
    const payload = fake.writes('csr_project_expenses', 'update')[0].payload as Record<string, unknown>
    expect(payload).toEqual(
      expect.objectContaining({
        amount: 350,
        payment_status: 'paid',
        approval_status: 'recorded',
      })
    )
    expect(payload.metadata).toEqual(
      expect.objectContaining({
        cancelled: true,
        refund_pending: true,
        refund_status: 'pending',
        confirmed_refund_inr: 0,
      })
    )
  })

  it('6. full confirmed refund zeros net while preserving gross charge', () => {
    const payload = buildLogisticsExpenseLedgerPayload({
      projectId: PROJECT,
      campaignId: CAMPAIGN,
      leg: 'outbound',
      trackingId: OUT_TRACK,
      chargeAmount: 350,
      refundAmount: 350,
      chargeSource: 'leg_confirmed_field',
      cancelled: true,
      legMeta: {
        confirmed_freight_inr: 350,
        confirmed_refund_inr: 350,
        freight_payment_status: 'paid',
      },
    })
    expect(payload).toMatchObject({
      amount: 350,
      payment_status: 'refunded',
      approval_status: 'recorded',
      metadata: expect.objectContaining({
        confirmed_refund_inr: 350,
        net_freight_inr: 0,
        refund_status: 'confirmed',
      }),
    })

    const agg = aggregateProjectExpenses({
      totalBudget: 10000,
      expenses: [
        {
          project_id: PROJECT,
          category: 'outbound_logistics',
          amount: 350,
          approval_status: 'recorded',
          payment_status: 'refunded',
          metadata: { confirmed_freight_inr: 350, confirmed_refund_inr: 350 },
        },
        {
          project_id: PROJECT,
          category: 'return_logistics',
          amount: 280,
          approval_status: 'recorded',
          payment_status: 'paid',
        },
      ],
    })
    expect(agg.actual_expenditure).toBe(280)
    expect(agg.amount_paid).toBe(280)
    expect(agg.logistics_accounting).toEqual({
      gross_confirmed: 630,
      confirmed_refunds: 350,
      net_expenditure: 280,
      refund_pending_amount: 0,
      reconciliation_errors: 0,
    })
  })

  it('7. missing project linkage does not create an incorrectly assigned expense', async () => {
    const fake = useDb({
      'csr_projects.select': [{ data: null }],
    })

    const result = await syncLogisticsExpenseFromCapabilityLeg({
      rental: baseRental({ csr_project_id: null, campaign_id: 'not-a-linked-campaign' as unknown as string }),
      leg: 'outbound',
    })

    expect(result).toEqual(expect.objectContaining({ synced: false, reason: 'no_project_link' }))
    expect(fake.writes('csr_project_expenses')).toHaveLength(0)
  })

  it('8. manual NGO expenses do not duplicate automated shipment charges', async () => {
    useDb({
      'csr_project_expenses.select': [
        {
          data: [
            {
              id: 'exp-out',
              source_type: LOGISTICS_EXPENSE_SOURCE_TYPE,
              source_reference: logisticsExpenseSourceReference('outbound', OUT_TRACK),
              metadata: { tracking_id: OUT_TRACK },
            },
          ],
        },
      ],
    })

    const duplicate = await findAutomatedLogisticsDuplicate({
      projectId: PROJECT,
      category: 'outbound_logistics',
      trackingHint: OUT_TRACK,
      sourceReference: OUT_TRACK,
    })
    expect(duplicate).toEqual({
      id: 'exp-out',
      source_reference: logisticsExpenseSourceReference('outbound', OUT_TRACK),
    })
  })

  it('9. finance aggregation includes the correct logistics totals', () => {
    const agg = aggregateProjectExpenses({
      totalBudget: 50000,
      expenses: [
        {
          project_id: PROJECT,
          category: 'outbound_logistics',
          amount: 350,
          approval_status: 'recorded',
          payment_status: 'paid',
          source_type: LOGISTICS_EXPENSE_SOURCE_TYPE,
          source_reference: logisticsExpenseSourceReference('outbound', OUT_TRACK),
        },
        {
          project_id: PROJECT,
          category: 'return_logistics',
          amount: 280,
          approval_status: 'recorded',
          payment_status: 'unpaid',
          source_type: LOGISTICS_EXPENSE_SOURCE_TYPE,
          source_reference: logisticsExpenseSourceReference('return', RET_TRACK),
        },
        {
          project_id: PROJECT,
          category: 'outbound_logistics',
          amount: 350,
          approval_status: 'proposed',
          payment_status: 'unpaid',
          source_type: 'ngo_submission',
          source_reference: 'manual-should-not-matter-here',
        },
      ],
    })

    expect(agg.by_category_actual.outbound_logistics).toBe(350)
    expect(agg.by_category_actual.return_logistics).toBe(280)
    expect(agg.actual_expenditure).toBe(630)
    expect(agg.amount_paid).toBe(350)
    expect(agg.outstanding_amount).toBe(280)
    expect(agg.proposed_expenditure).toBe(350)
    expect(agg.logistics_accounting.net_expenditure).toBe(630)
  })
})

describe('logistics refund accounting corrections', () => {
  it('1. cancellation without refund confirmation does not mark refunded', () => {
    const accounting = resolveLogisticsAccounting({
      legMeta: { freight_payment_status: 'paid', confirmed_freight_inr: 350 },
      cancelled: true,
      refundAmount: null,
      chargeAmount: 350,
    })
    expect(accounting).toMatchObject({
      payment_status: 'paid',
      approval_status: 'recorded',
      refund_status: 'pending',
      refund_pending: true,
      confirmed_refund_inr: 0,
      net_amount: 350,
      reconciliation_error: null,
    })
  })

  it('2. full refund confirmation marks refunded and zeros net', () => {
    const accounting = resolveLogisticsAccounting({
      legMeta: { freight_payment_status: 'paid', confirmed_refund_inr: 350 },
      cancelled: true,
      refundAmount: 350,
      chargeAmount: 350,
    })
    expect(accounting).toMatchObject({
      payment_status: 'refunded',
      refund_status: 'confirmed',
      refund_pending: false,
      confirmed_refund_inr: 350,
      net_amount: 0,
    })
  })

  it('3. partial refund confirmation keeps residual net expenditure', () => {
    const accounting = resolveLogisticsAccounting({
      legMeta: { freight_payment_status: 'paid' },
      cancelled: false,
      refundAmount: 100,
      chargeAmount: 350,
    })
    expect(accounting).toMatchObject({
      payment_status: 'paid',
      refund_status: 'confirmed',
      confirmed_refund_inr: 100,
      net_amount: 250,
    })

    const nets = computeExpenseNetAmounts({
      project_id: PROJECT,
      category: 'outbound_logistics',
      amount: 350,
      approval_status: 'recorded',
      payment_status: 'paid',
      metadata: { confirmed_refund_inr: 100 },
    })
    expect(nets).toMatchObject({ gross: 350, confirmed_refund: 100, net: 250 })
  })

  it('4. duplicate refund webhook does not inflate confirmed refund', async () => {
    const fake = useDb({
      'csr_projects.select': [{ data: { id: PROJECT, campaign_id: CAMPAIGN } }],
      'csr_project_expenses.select': [
        {
          data: {
            id: 'exp-out',
            payment_status: 'paid',
            approval_status: 'recorded',
            amount: 350,
            metadata: { confirmed_freight_inr: 350, confirmed_refund_inr: 100, refund_status: 'confirmed' },
          },
        },
      ],
      'csr_project_expenses.update': [{ data: { id: 'exp-out' } }],
    })

    const result = await syncLogisticsExpenseFromCapabilityLeg({
      rental: baseRental({
        outbound_delivery: {
          provider: 'delhivery',
          tracking_id: OUT_TRACK,
          confirmed_freight_inr: 350,
          confirmed_refund_inr: 100,
          freight_payment_status: 'paid',
        } as CsrCapabilityRentalRecord['outbound_delivery'],
      }),
      leg: 'outbound',
    })

    expect(result.synced).toBe(true)
    expect(fake.writes('csr_project_expenses', 'insert')).toHaveLength(0)
    expect(fake.writes('csr_project_expenses', 'update')[0].payload).toEqual(
      expect.objectContaining({
        amount: 350,
        payment_status: 'paid',
        metadata: expect.objectContaining({
          confirmed_refund_inr: 100,
          net_freight_inr: 250,
        }),
      })
    )
  })

  it('5. refund amount exceeding original charge is flagged', () => {
    const accounting = resolveLogisticsAccounting({
      legMeta: { freight_payment_status: 'paid' },
      cancelled: false,
      refundAmount: 500,
      chargeAmount: 350,
    })
    expect(accounting).toMatchObject({
      reconciliation_error: 'confirmed_refund_exceeds_charge',
      approval_status: 'unreconciled',
      confirmed_refund_inr: 350,
      reported_refund_inr: 500,
      net_amount: 0,
      payment_status: 'paid',
    })

    const nets = computeExpenseNetAmounts({
      project_id: PROJECT,
      category: 'outbound_logistics',
      amount: 350,
      approval_status: 'unreconciled',
      payment_status: 'paid',
      metadata: {
        confirmed_refund_inr: 350,
        reported_refund_inr: 500,
        reconciliation_error: 'confirmed_refund_exceeds_charge',
      },
    })
    expect(nets.refund_exceeds_charge).toBe(true)
    expect(nets.reconciliation_error).toBe('confirmed_refund_exceeds_charge')
  })

  it('6. repeated shipment cancellation stays pending and does not invent a refund', async () => {
    const responses = {
      'csr_projects.select': [
        { data: { id: PROJECT, campaign_id: CAMPAIGN } },
        { data: { id: PROJECT, campaign_id: CAMPAIGN } },
      ],
      'csr_project_expenses.select': [
        {
          data: {
            id: 'exp-out',
            payment_status: 'paid',
            metadata: { confirmed_freight_inr: 350, refund_pending: true, refund_status: 'pending' },
          },
        },
        {
          data: {
            id: 'exp-out',
            payment_status: 'paid',
            metadata: { confirmed_freight_inr: 350, refund_pending: true, refund_status: 'pending' },
          },
        },
      ],
      'csr_project_expenses.update': [{ data: { id: 'exp-out' } }, { data: { id: 'exp-out' } }],
    }
    const fake = useDb(responses)

    const cancelledLeg = {
      provider: 'delhivery' as const,
      tracking_id: OUT_TRACK,
      last_status: 'Cancelled',
      confirmed_freight_inr: 350,
      freight_payment_status: 'paid' as const,
    }

    const first = await syncLogisticsExpenseFromCapabilityLeg({
      rental: baseRental({ outbound_delivery: cancelledLeg as CsrCapabilityRentalRecord['outbound_delivery'] }),
      leg: 'outbound',
    })
    const second = await syncLogisticsExpenseFromCapabilityLeg({
      rental: baseRental({ outbound_delivery: cancelledLeg as CsrCapabilityRentalRecord['outbound_delivery'] }),
      leg: 'outbound',
    })

    expect(first.synced).toBe(true)
    expect(second.synced).toBe(true)
    for (const write of fake.writes('csr_project_expenses', 'update')) {
      expect(write.payload).toEqual(
        expect.objectContaining({
          amount: 350,
          payment_status: 'paid',
          metadata: expect.objectContaining({
            refund_status: 'pending',
            refund_pending: true,
            confirmed_refund_inr: 0,
          }),
        })
      )
    }
  })

  it('7. gross, refund and net finance aggregation are correct', () => {
    const agg = aggregateProjectExpenses({
      totalBudget: 20000,
      expenses: [
        {
          project_id: PROJECT,
          category: 'outbound_logistics',
          amount: 350,
          approval_status: 'recorded',
          payment_status: 'paid',
          metadata: {
            confirmed_freight_inr: 350,
            confirmed_refund_inr: 100,
            refund_status: 'confirmed',
          },
        },
        {
          project_id: PROJECT,
          category: 'return_logistics',
          amount: 280,
          approval_status: 'recorded',
          payment_status: 'refunded',
          metadata: {
            confirmed_freight_inr: 280,
            confirmed_refund_inr: 280,
            refund_status: 'confirmed',
          },
        },
        {
          project_id: PROJECT,
          category: 'outbound_logistics',
          amount: 150,
          approval_status: 'recorded',
          payment_status: 'paid',
          metadata: {
            confirmed_freight_inr: 150,
            refund_pending: true,
            refund_status: 'pending',
            cancelled: true,
          },
        },
      ],
    })

    expect(agg.logistics_accounting).toEqual({
      gross_confirmed: 780,
      confirmed_refunds: 380,
      net_expenditure: 400,
      refund_pending_amount: 150,
      reconciliation_errors: 0,
    })
    // Net actual: outbound residual 250 + pending cancel still charged 150 + return 0.
    expect(agg.by_category_actual.outbound_logistics).toBe(400)
    expect(agg.by_category_actual.return_logistics).toBe(0)
    expect(agg.actual_expenditure).toBe(400)
    expect(agg.amount_paid).toBe(400)
  })
})
