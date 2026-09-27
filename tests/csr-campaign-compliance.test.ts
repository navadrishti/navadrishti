import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchCompanyCsrCapabilityFines,
  markCsrProjectCompleted,
  processCsrCapabilityDailyCompliance,
} from '@/lib/csr-agent/campaign/compliance'
import type { CsrCapabilityRentalRecord } from '@/lib/service-engagement'
import { eqValue, supabaseFake } from './campaign-supabase-fake'
import { createCampaignStore, rental, type Row } from './csr-campaign-fixtures'

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  autoBook: vi.fn(),
  refund: vi.fn(),
}))

vi.mock('@/lib/db', async () => {
  const { supabaseFake: fake } = await import('./campaign-supabase-fake')
  return { supabase: fake.client }
})
vi.mock('@/lib/email', () => ({ emailService: { sendEmail: mocks.sendEmail } }))
vi.mock('@/lib/csr-agent/campaign/delhivery-booking', () => ({ autoBookCsrCapabilityDelhivery: mocks.autoBook }))
vi.mock('razorpay', () => ({
  default: vi.fn(function () {
    return { payments: { refund: mocks.refund } }
  }),
}))

const NOW = new Date('2026-09-27T00:00:00.000Z')
const hoursFrom = (hours: number, from = NOW) => new Date(from.getTime() + hours * 3600_000).toISOString()
const daysFrom = (days: number, from = NOW) => hoursFrom(days * 24, from)

type Fine = NonNullable<CsrCapabilityRentalRecord['fine']>
const fine = (overrides: Partial<Fine> = {}): Fine => ({
  base_amount_inr: 10000,
  accrued_fine_inr: 0,
  pending_total_inr: 10000,
  status: 'pending',
  created_at: daysFrom(-5),
  due_cleared_by: daysFrom(5),
  ...overrides,
})

let db: ReturnType<typeof createCampaignStore>

function seed(...rentals: CsrCapabilityRentalRecord[]) {
  db.store.campaigns = [{ id: 'c1', company_id: 3, title: 'Water', status: 'active', impact_metrics: { note: 'keep', csr_capability_rentals: rentals } }]
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  db = createCampaignStore()
  db.store.users[3] = { id: 3, email: 'csr@acme.com', name: 'Acme', verification_status: 'verified', profile_data: { city: 'Pune' } }
  supabaseFake.reset()
  supabaseFake.respondWith(db.respond)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('processCsrCapabilityDailyCompliance', () => {
  it('refunds rentals whose outbound dispatch deadline passed', async () => {
    seed(rental({ outbound_dispatch_due_at: hoursFrom(-1) }))
    await expect(processCsrCapabilityDailyCompliance()).resolves.toEqual({ refunds: 1, fines: 0, reminders: 0, suspended: 0 })
    expect(db.rentals()[0]).toMatchObject({ status: 'refunded', payment_status: 'refunded' })
    expect(db.store.campaigns[0].impact_metrics).toMatchObject({ note: 'keep' })
    expect(mocks.refund).not.toHaveBeenCalled()
  })

  it.each([
    ['already dispatched', { outbound_dispatched_at: hoursFrom(-30) }],
    ['picked up by courier', { outbound_delivery: { last_status: 'In Transit' } }],
    ['not yet due', { outbound_dispatch_due_at: hoursFrom(5) }],
    ['already active', { status: 'project_active' as const }],
  ])('does not refund rentals %s', async (_label, overrides) => {
    seed(rental({ outbound_dispatch_due_at: hoursFrom(-1), ...overrides }))
    await expect(processCsrCapabilityDailyCompliance()).resolves.toMatchObject({ refunds: 0 })
    expect(supabaseFake.find('campaigns', 'update')).toHaveLength(0)
  })

  it('refunds the Razorpay payment and releases the offer lock', async () => {
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'secret')
    vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', 'key')
    db.store.offers[7] = { id: 7, offer_details: { quantity: 2, csr_rental_lock: { campaign_id: 'c1' } } }
    seed(rental({ outbound_dispatch_due_at: hoursFrom(-1), razorpay_payment_id: 'pay_1', rental_amount_inr: 1234.5 }))
    await processCsrCapabilityDailyCompliance()
    await vi.waitFor(() => expect(supabaseFake.find('service_offers', 'update')).toHaveLength(1))
    expect(mocks.refund).toHaveBeenCalledWith('pay_1', { amount: 123450, notes: { reason: 'csr_outbound_dispatch_sla_missed' } })
    expect(supabaseFake.find('service_offers', 'update')[0].payload).toEqual({ status: 'active', offer_details: { quantity: 2 } })
  })

  it('opens a fine when a material return is late', async () => {
    const returnDue = daysFrom(-1)
    seed(rental({ status: 'return_pending', return_dispatch_due_at: returnDue }))
    await expect(processCsrCapabilityDailyCompliance()).resolves.toEqual({ refunds: 0, fines: 0, reminders: 1, suspended: 0 })
    expect(db.rentals()[0].fine).toMatchObject({
      base_amount_inr: 10000,
      pending_total_inr: 10000,
      accrued_fine_inr: 0,
      status: 'pending',
      due_cleared_by: daysFrom(10, new Date(returnDue)),
    })
    expect(db.rentals()[0].reminders).toEqual({ last_sent_at: NOW.toISOString(), count: 1 })
    await vi.waitFor(() => expect(mocks.sendEmail).toHaveBeenCalledTimes(1))
    expect(mocks.sendEmail.mock.calls[0][0]).toMatchObject({ to: 'csr@acme.com' })
    expect(mocks.sendEmail.mock.calls[0][0].text).toContain('INR 10,000')
  })

  it.each([
    ['service rentals', { offer_type: 'service' }],
    ['returned rentals', { return_delivered_at: hoursFrom(-2) }],
    ['returns not yet due', { return_dispatch_due_at: hoursFrom(3) }],
  ])('does not fine %s', async (_label, overrides) => {
    seed(rental({ status: 'return_pending', return_dispatch_due_at: daysFrom(-1), ...overrides }))
    await processCsrCapabilityDailyCompliance()
    expect(db.rentals()[0].fine).toBeUndefined()
  })

  it('does not reopen a cleared fine on a late return', async () => {
    const cleared = fine({ base_amount_inr: 0, pending_total_inr: 0, status: 'cleared', reason: 'Waived by provider' })
    seed(rental({ status: 'return_pending', return_dispatch_due_at: daysFrom(-3), fine: cleared }))
    await expect(processCsrCapabilityDailyCompliance()).resolves.toEqual({ refunds: 0, fines: 0, reminders: 0, suspended: 0 })
    expect(supabaseFake.find('campaigns', 'update')).toHaveLength(0)
    expect(db.rentals()[0].fine).toEqual(cleared)
  })

  it('keeps an overdue fine overdue when re-checking a late return', async () => {
    seed(rental({
      status: 'return_pending',
      return_dispatch_due_at: daysFrom(-12),
      fine: fine({ status: 'overdue', due_cleared_by: daysFrom(-2), last_accrual_at: hoursFrom(-2), pending_total_inr: 12000 }),
      reminders: { last_sent_at: hoursFrom(-1), count: 4 },
    }))
    await processCsrCapabilityDailyCompliance()
    expect(db.rentals()[0].fine).toMatchObject({ status: 'overdue', pending_total_inr: 12000 })
  })

  it('stops accruing once the return has been delivered', async () => {
    seed(rental({
      status: 'return_delivered',
      return_delivered_at: daysFrom(-3),
      fine: fine({ base_amount_inr: 0, accrued_fine_inr: 600, pending_total_inr: 600, last_accrual_at: daysFrom(-3) }),
      reminders: { last_sent_at: hoursFrom(-1), count: 4 },
    }))
    await expect(processCsrCapabilityDailyCompliance()).resolves.toMatchObject({ fines: 0 })
    expect(db.rentals()[0].fine).toMatchObject({ pending_total_inr: 600, accrued_fine_inr: 600, status: 'pending' })
  })

  it('refunds a rental whose shipment was only manifested', async () => {
    seed(rental({ outbound_dispatch_due_at: hoursFrom(-1), outbound_delivery: { tracking_id: 'AWB9', last_status: 'Manifested' } }))
    await expect(processCsrCapabilityDailyCompliance()).resolves.toMatchObject({ refunds: 1 })
    expect(db.rentals()[0]).toMatchObject({ status: 'refunded', payment_status: 'refunded' })
  })

  it('accrues 2% a day on pending fines', async () => {
    seed(rental({ status: 'project_active', fine: fine({ last_accrual_at: daysFrom(-2) }), reminders: { last_sent_at: hoursFrom(-1), count: 3 } }))
    await expect(processCsrCapabilityDailyCompliance()).resolves.toMatchObject({ fines: 1, reminders: 0 })
    expect(db.rentals()[0].fine).toMatchObject({ pending_total_inr: 10404, accrued_fine_inr: 404, last_accrual_at: NOW.toISOString() })
  })

  it('keeps the accrual clock when re-checking a late return', async () => {
    const lastAccrual = hoursFrom(-12)
    seed(rental({
      status: 'return_pending',
      return_dispatch_due_at: daysFrom(-5),
      fine: fine({ last_accrual_at: lastAccrual }),
      reminders: { last_sent_at: hoursFrom(-1), count: 1 },
    }))
    await processCsrCapabilityDailyCompliance()
    expect(db.rentals()[0].fine).toMatchObject({ last_accrual_at: lastAccrual, pending_total_inr: 10000 })

    vi.setSystemTime(new Date(hoursFrom(13)))
    await processCsrCapabilityDailyCompliance()
    expect(db.rentals()[0].fine?.pending_total_inr).toBe(10200)
  })

  it('marks fines overdue after the clearance date', async () => {
    seed(rental({ status: 'project_active', fine: fine({ due_cleared_by: hoursFrom(-1), last_accrual_at: hoursFrom(-2) }) }))
    await processCsrCapabilityDailyCompliance()
    expect(db.rentals()[0].fine?.status).toBe('overdue')
  })

  it('suspends companies with fines overdue beyond the clearance window', async () => {
    seed(rental({ status: 'project_active', fine: fine({ status: 'overdue', due_cleared_by: daysFrom(-11), last_accrual_at: hoursFrom(-2) }) }))
    await expect(processCsrCapabilityDailyCompliance()).resolves.toMatchObject({ suspended: 1 })
    const [update] = supabaseFake.find('users', 'update')
    expect(eqValue(update, 'id')).toBe(3)
    expect(update.payload).toMatchObject({
      verification_status: 'suspended',
      profile_data: { city: 'Pune', csr_capability_account: { status: 'suspended', suspended_at: NOW.toISOString() } },
    })
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: 'GRAM account suspended — CSR capability penalty overdue' }))
  })

  it.each([
    ['already suspended companies', { verification_status: 'suspended' }, daysFrom(-11)],
    ['fines inside the clearance window', {}, daysFrom(-3)],
  ])('does not suspend %s', async (_label, user, dueClearedBy) => {
    db.store.users[3] = { ...db.store.users[3], ...user }
    seed(rental({ status: 'project_active', fine: fine({ status: 'overdue', due_cleared_by: dueClearedBy, last_accrual_at: hoursFrom(-2) }) }))
    await expect(processCsrCapabilityDailyCompliance()).resolves.toMatchObject({ suspended: 0 })
    expect(supabaseFake.find('users', 'update')).toHaveLength(0)
  })

  it('sends at most one reminder a day', async () => {
    seed(rental({ status: 'project_active', fine: fine({ last_accrual_at: hoursFrom(-2) }), reminders: { last_sent_at: hoursFrom(-23), count: 2 } }))
    await expect(processCsrCapabilityDailyCompliance()).resolves.toMatchObject({ reminders: 0 })
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('skips campaigns without rentals', async () => {
    db.store.campaigns = [{ id: 'c1', impact_metrics: { note: 'x' } }, { id: 'c2', impact_metrics: null }]
    await expect(processCsrCapabilityDailyCompliance()).resolves.toEqual({ refunds: 0, fines: 0, reminders: 0, suspended: 0 })
    expect(supabaseFake.find('campaigns', 'update')).toHaveLength(0)
  })
})

describe('markCsrProjectCompleted', () => {
  const completedAt = '2026-09-01T00:00:00.000Z'

  it('moves paid rentals to return and fines material ones', async () => {
    seed(
      rental({ service_offer_id: 7 }),
      rental({ service_offer_id: 8, offer_type: 'service' }),
      rental({ service_offer_id: 9, payment_status: 'pending', status: 'pending_payment' }),
      rental({ service_offer_id: 10, status: 'completed' })
    )
    await markCsrProjectCompleted({ campaignId: 'c1', completedAt })
    const byOffer = new Map(db.rentals().map((row) => [row.service_offer_id, row]))
    expect(byOffer.get(7)).toMatchObject({
      status: 'return_pending',
      project_completed_at: completedAt,
      return_dispatch_due_at: '2026-09-03T00:00:00.000Z',
      fine: { base_amount_inr: 10000, pending_total_inr: 10000, status: 'pending', due_cleared_by: '2026-09-11T00:00:00.000Z' },
    })
    expect(byOffer.get(8)).toMatchObject({ status: 'return_pending' })
    expect(byOffer.get(8)?.fine).toBeUndefined()
    expect(byOffer.get(9)?.status).toBe('pending_payment')
    expect(byOffer.get(10)?.status).toBe('completed')
    expect(mocks.autoBook).toHaveBeenCalledTimes(1)
    expect(mocks.autoBook).toHaveBeenCalledWith({ campaignId: 'c1', offerId: 7, leg: 'return', bookedByUserId: 12, companyId: 3 })
  })

  it.each([
    ['a return tracking id exists', { return_delivery: { tracking_id: 'AWB1' } }],
    ['there is no lead NGO', { lead_ngo_user_id: null }],
  ])('skips return booking when %s', async (_label, overrides) => {
    seed(rental(overrides))
    await markCsrProjectCompleted({ campaignId: 'c1', completedAt })
    expect(mocks.autoBook).not.toHaveBeenCalled()
  })

  it('throws for unknown campaigns', async () => {
    seed()
    await expect(markCsrProjectCompleted({ campaignId: 'nope' })).rejects.toThrow('Campaign not found')
  })
})

describe('fetchCompanyCsrCapabilityFines', () => {
  it('lists open fines for the company', async () => {
    seed(
      rental({ service_offer_id: 1, fine: fine({ status: 'pending' }) }),
      rental({ service_offer_id: 2, fine: fine({ status: 'overdue', pending_total_inr: 12000 }) }),
      rental({ service_offer_id: 3, fine: fine({ status: 'suspended' }) }),
      rental({ service_offer_id: 4, fine: fine({ status: 'cleared' }) }),
      rental({ service_offer_id: 5 })
    )
    const fines = await fetchCompanyCsrCapabilityFines(3)
    expect(eqValue(supabaseFake.find('campaigns')[0], 'company_id')).toBe(3)
    expect(fines.map((row: Row) => row.service_offer_id)).toEqual([1, 2, 3])
    expect(fines[1]).toMatchObject({ campaign_id: 'c1', campaign_title: 'Water', status: 'overdue', pending_total_inr: 12000 })
  })
})
