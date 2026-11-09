import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseFake, type FakeResult } from './support/supabase-fake'
import {
  captureDelhiveryFreightForLeg,
  extractDelhiveryFreightFromProviderPayload,
  extractDelhiveryQuotedFreightFromRateResponse,
  mergeDelhiveryFreightCaptureIntoLeg,
} from '@/lib/delhivery-freight'
import {
  LOGISTICS_EXPENSE_SOURCE_TYPE,
  logisticsExpenseSourceReference,
  resolveLogisticsAccounting,
  syncLogisticsExpenseFromCapabilityLeg,
} from '@/lib/csr-agent/sync-logistics-expense'
import { aggregateProjectExpenses } from '@/lib/csr-agent/project-ops-finance'
import type { CsrCapabilityRentalRecord } from '@/lib/service-engagement'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('@/lib/db', () => ({
  supabase: { from: mocks.from },
}))

function useDb(responses: Record<string, FakeResult[]>) {
  const fake = createSupabaseFake(responses)
  mocks.from.mockImplementation(fake.from)
  return fake
}

const PROJECT = '11111111-1111-1111-1111-111111111111'
const CAMPAIGN = '22222222-2222-2222-2222-222222222222'
const OUT_TRACK = 'OUTAWB100'
const RET_TRACK = 'RETAWB200'

/** Realistic tracking shape: weight + package money fields, optional freight key for capture tests. */
function trackingPayload(overrides: Record<string, unknown> = {}) {
  return {
    ShipmentData: [
      {
        Shipment: {
          AWB: OUT_TRACK,
          ChargedWeight: 1.2,
          CODAmount: 0,
          InvoiceAmount: 2000,
          ...overrides,
        },
      },
    ],
  }
}

function bookingPayload(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    packages: [
      {
        waybill: OUT_TRACK,
        status: 'Success',
        ...overrides,
      },
    ],
  }
}

function rentalWithLeg(
  leg: 'outbound' | 'return',
  legFields: Record<string, unknown>
): CsrCapabilityRentalRecord {
  const delivery = {
    provider: 'delhivery' as const,
    tracking_id: leg === 'outbound' ? OUT_TRACK : RET_TRACK,
    last_status: 'In Transit',
    ...legFields,
  }
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
    outbound_delivery: leg === 'outbound' ? (delivery as CsrCapabilityRentalRecord['outbound_delivery']) : null,
    return_delivery: leg === 'return' ? (delivery as CsrCapabilityRentalRecord['return_delivery']) : null,
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

describe('Delhivery freight extraction from mocked provider payloads', () => {
  it('1. extracts outbound confirmed freight from tracking FreightCharge', () => {
    const capture = extractDelhiveryFreightFromProviderPayload(
      trackingPayload({ FreightCharge: 185.5, AWB: OUT_TRACK })
    )
    expect(capture.confirmed_freight_inr).toBe(185.5)
    expect(capture.confirmed_source).toMatch(/FreightCharge/)
    expect(capture.quoted_freight_inr).toBeNull()

    const merged = captureDelhiveryFreightForLeg({
      existingLeg: { provider: 'delhivery', tracking_id: OUT_TRACK },
      trackingRaw: trackingPayload({ FreightCharge: 185.5 }),
    })
    expect(merged.leg.confirmed_freight_inr).toBe(185.5)
    expect(merged.leg.freight_capture?.confirmed_source).toMatch(/FreightCharge/)
  })

  it('2. extracts return confirmed freight from tracking ShippingCharge', async () => {
    const capture = extractDelhiveryFreightFromProviderPayload(
      trackingPayload({ AWB: RET_TRACK, ShippingCharge: 142 })
    )
    expect(capture.confirmed_freight_inr).toBe(142)

    const fake = useDb({
      'csr_projects.select': [{ data: { id: PROJECT, campaign_id: CAMPAIGN } }],
      'csr_project_expenses.select': [{ data: null }],
      'csr_project_expenses.insert': [{ data: { id: 'exp-ret' } }],
    })

    const captured = captureDelhiveryFreightForLeg({
      existingLeg: { provider: 'delhivery', tracking_id: RET_TRACK },
      trackingRaw: trackingPayload({ AWB: RET_TRACK, ShippingCharge: 142 }),
    })

    const result = await syncLogisticsExpenseFromCapabilityLeg({
      rental: rentalWithLeg('return', {
        tracking_id: RET_TRACK,
        confirmed_freight_inr: captured.leg.confirmed_freight_inr,
      }),
      leg: 'return',
      providerRaw: trackingPayload({ AWB: RET_TRACK, ShippingCharge: 142 }),
    })
    expect(result).toEqual({ synced: true, mode: 'inserted', expenseId: 'exp-ret' })
    expect(fake.writes('csr_project_expenses', 'insert')[0].payload).toEqual(
      expect.objectContaining({
        category: 'return_logistics',
        amount: 142,
        source_reference: logisticsExpenseSourceReference('return', RET_TRACK),
      })
    )
  })

  it('3. quoted freight (kinko approximate) does not become actual expenditure', async () => {
    const quote = extractDelhiveryQuotedFreightFromRateResponse([
      { gross_amount: 210, total_amount: 247.8 },
    ])
    expect(quote).toEqual({ quoted_freight_inr: 210, source: 'kinko.gross_amount' })

    const leg = mergeDelhiveryFreightCaptureIntoLeg(
      { provider: 'delhivery', tracking_id: OUT_TRACK },
      {
        confirmed_freight_inr: null,
        quoted_freight_inr: quote.quoted_freight_inr,
        confirmed_source: null,
        quoted_source: quote.source,
        charged_weight: null,
        saw_non_freight_amounts: false,
        evidence: null,
      }
    )
    expect(leg.confirmed_freight_inr).toBeUndefined()
    expect(leg.quoted_freight_inr).toBe(210)

    const fake = useDb({})
    const result = await syncLogisticsExpenseFromCapabilityLeg({
      rental: rentalWithLeg('outbound', { quoted_freight_inr: 210 }),
      leg: 'outbound',
    })
    expect(result).toEqual(expect.objectContaining({ synced: false, reason: 'quote_only' }))
    expect(fake.writes('csr_project_expenses')).toHaveLength(0)
  })

  it('4. declared package value is never interpreted as freight', () => {
    const fromBooking = extractDelhiveryFreightFromProviderPayload(
      bookingPayload({ total_amount: 5000 })
    )
    expect(fromBooking.confirmed_freight_inr).toBeNull()
    expect(fromBooking.saw_non_freight_amounts).toBe(true)

    const fromTracking = extractDelhiveryFreightFromProviderPayload(
      trackingPayload({ InvoiceAmount: 5000, CODAmount: 5000, total_amount: 5000 })
    )
    expect(fromTracking.confirmed_freight_inr).toBeNull()
    expect(fromTracking.saw_non_freight_amounts).toBe(true)
    expect(fromTracking.charged_weight).toBe(1.2)
  })

  it('5. missing freight fields do not create ledger entries', async () => {
    const capture = extractDelhiveryFreightFromProviderPayload(trackingPayload())
    expect(capture.confirmed_freight_inr).toBeNull()

    const fake = useDb({})
    const result = await syncLogisticsExpenseFromCapabilityLeg({
      rental: rentalWithLeg('outbound', {}),
      leg: 'outbound',
      providerRaw: trackingPayload(),
    })
    expect(result).toEqual(expect.objectContaining({ synced: false, reason: 'no_confirmed_charge' }))
    expect(fake.writes('csr_project_expenses')).toHaveLength(0)
  })

  it('6. repeated synchronization does not duplicate expenses', async () => {
    const fake = useDb({
      'csr_projects.select': [{ data: { id: PROJECT, campaign_id: CAMPAIGN } }],
      'csr_project_expenses.select': [
        {
          data: {
            id: 'exp-out',
            payment_status: 'unpaid',
            metadata: { confirmed_freight_inr: 185.5 },
          },
        },
      ],
      'csr_project_expenses.update': [{ data: { id: 'exp-out' } }],
    })

    const firstCapture = captureDelhiveryFreightForLeg({
      existingLeg: { provider: 'delhivery', tracking_id: OUT_TRACK },
      trackingRaw: trackingPayload({ FreightCharge: 185.5 }),
    })
    const secondCapture = captureDelhiveryFreightForLeg({
      existingLeg: firstCapture.leg,
      trackingRaw: trackingPayload({ FreightCharge: 185.5 }),
    })
    expect(secondCapture.leg.confirmed_freight_inr).toBe(185.5)

    const result = await syncLogisticsExpenseFromCapabilityLeg({
      rental: rentalWithLeg('outbound', { confirmed_freight_inr: 185.5 }),
      leg: 'outbound',
      providerRaw: trackingPayload({ FreightCharge: 185.5 }),
    })
    expect(result).toEqual({ synced: true, mode: 'updated', expenseId: 'exp-out' })
    expect(fake.writes('csr_project_expenses', 'insert')).toHaveLength(0)
    expect(fake.writes('csr_project_expenses', 'update')).toHaveLength(1)
    expect(fake.writes('csr_project_expenses', 'update')[0].payload).toEqual(
      expect.objectContaining({
        source_type: LOGISTICS_EXPENSE_SOURCE_TYPE,
        amount: 185.5,
      })
    )
  })

  it('7. existing refund accounting remains correct with captured freight', () => {
    const accounting = resolveLogisticsAccounting({
      legMeta: {
        freight_payment_status: 'paid',
        confirmed_freight_inr: 185.5,
        confirmed_refund_inr: 50,
      },
      cancelled: false,
      refundAmount: 50,
      chargeAmount: 185.5,
    })
    expect(accounting).toMatchObject({
      payment_status: 'paid',
      refund_status: 'confirmed',
      confirmed_refund_inr: 50,
      net_amount: 135.5,
    })

    const agg = aggregateProjectExpenses({
      totalBudget: 10000,
      expenses: [
        {
          project_id: PROJECT,
          category: 'outbound_logistics',
          amount: 185.5,
          approval_status: 'recorded',
          payment_status: 'paid',
          metadata: { confirmed_freight_inr: 185.5, confirmed_refund_inr: 50 },
        },
      ],
    })
    expect(agg.actual_expenditure).toBe(135.5)
    expect(agg.logistics_accounting).toEqual(
      expect.objectContaining({
        gross_confirmed: 185.5,
        confirmed_refunds: 50,
        net_expenditure: 135.5,
      })
    )
  })

  it('does not overwrite confirmed freight with a later quote', () => {
    const withConfirmed = mergeDelhiveryFreightCaptureIntoLeg(
      { provider: 'delhivery', tracking_id: OUT_TRACK, confirmed_freight_inr: 180 },
      {
        confirmed_freight_inr: null,
        quoted_freight_inr: 220,
        confirmed_source: null,
        quoted_source: 'kinko.gross_amount',
        charged_weight: null,
        saw_non_freight_amounts: false,
        evidence: null,
      }
    )
    expect(withConfirmed.confirmed_freight_inr).toBe(180)
    expect(withConfirmed.quoted_freight_inr).toBe(220)
  })
})
