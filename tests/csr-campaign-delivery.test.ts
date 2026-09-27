import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  autoBookCsrCapabilityDelhivery,
  bookCsrCapabilityRentalDelhivery,
  retryCsrCapabilityDelhiveryBooking,
  syncAllCsrCapabilityRentalsDelhivery,
} from '@/lib/csr-agent/campaign/delhivery-booking'
import {
  assertCsrCapabilityDeliveryAccess,
  linkCsrCapabilityRentalTracking,
  listCsrCapabilityRentalsForUser,
  syncCsrCapabilityRentalDelhivery,
} from '@/lib/csr-agent/campaign/delivery-tracking'
import {
  getCsrCapabilityRentals,
  loadCampaignRentalByOffer,
  loadCompanyCampaign,
  saveCampaignRentals,
  updateCsrCapabilityRentalStatus,
} from '@/lib/csr-agent/campaign/rental-store'
import type { CsrCapabilityRentalRecord } from '@/lib/service-engagement'
import { eqValue, supabaseFake } from './campaign-supabase-fake'
import { createCampaignStore, rental, type Row } from './csr-campaign-fixtures'

vi.mock('@/lib/db', async () => {
  const { supabaseFake: fake } = await import('./campaign-supabase-fake')
  return { supabase: fake.client }
})

let db: ReturnType<typeof createCampaignStore>
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
let trackingPayload: unknown
let createPayload: unknown

function seed(rentals: CsrCapabilityRentalRecord[], campaign: Row = {}) {
  db.store.campaigns = [{
    id: 'c1',
    company_id: 3,
    title: 'Water',
    status: 'active',
    location: 'Village Road, Mulshi',
    impact_metrics: { pincode: '411045', city: 'Mulshi', csr_capability_rentals: rentals },
    ...campaign,
  }]
}

function shipment(status: string, scan: Row = {}) {
  return {
    ShipmentData: [{
      Shipment: {
        AWB: 'AWB9',
        Status: { Status: status },
        Scans: [{ ScanDetail: { Scan: status, ScanDateTime: '2026-09-26T10:00:00Z', ScannedLocation: 'Pune Hub', ...scan } }],
      },
    }],
  }
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

function createRequestBody() {
  const call = fetchMock.mock.calls.find(([url]) => url.includes('/api/cmu/create.json'))
  const body = String(call?.[1]?.body ?? '')
  return JSON.parse(body.slice('format=json&data='.length)) as { pickup_location: Row; shipments: Row[] }
}

beforeEach(() => {
  vi.resetAllMocks()
  db = createCampaignStore()
  db.store.users = {
    12: { id: 12, name: 'Seva Trust', phone: '9123456789', pincode: '560001', location: 'NGO Office, MG Road', city: 'Bengaluru', state_province: 'KA', profile_data: {} },
    40: { id: 40, name: 'Tank Co', phone: '+91 98765 43210', pincode: '411001', location: 'Warehouse Rd', city: 'Pune', state_province: 'MH', profile_data: { delhivery_pickup_location: 'GRAM-WH' } },
  }
  db.store.offers = { 7: { id: 7, creator_id: 40, title: 'Water tanks', offer_details: { quantity: 3, weight_grams: 2000 } } }
  supabaseFake.reset()
  supabaseFake.respondWith(db.respond)
  trackingPayload = shipment('Manifested')
  createPayload = { success: true, packages: [{ waybill: 'AWB9', status: 'Success' }] }
  fetchMock.mockImplementation(async (url) => jsonResponse(url.includes('/api/cmu/create.json') ? createPayload : trackingPayload))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('DELHIVERY_API_TOKEN', 'dl-token')
  vi.stubEnv('DELHIVERY_API_BASE_URL', 'https://delhivery.test')
  vi.stubEnv('DELHIVERY_PICKUP_LOCATION_NAME', '')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('rental store', () => {
  it('loads only campaigns owned by the company', async () => {
    seed([rental()])
    await expect(loadCompanyCampaign('c1', 3)).resolves.toMatchObject({ id: 'c1' })
    await expect(loadCompanyCampaign('c1', 99)).rejects.toThrow('Campaign not found')
    await expect(getCsrCapabilityRentals('c1', 3)).resolves.toHaveLength(1)
  })

  it('saves rentals without dropping other impact metrics', async () => {
    seed([rental()])
    await saveCampaignRentals('c1', 3, [rental({ service_offer_id: 8 })])
    const [update] = supabaseFake.find('campaigns', 'update')
    expect(eqValue(update, 'company_id')).toBe(3)
    expect(db.store.campaigns[0].impact_metrics).toMatchObject({ pincode: '411045' })
    expect(db.rentals().map((row) => row.service_offer_id)).toEqual([8])
  })

  it('surfaces save errors', async () => {
    seed([rental()])
    supabaseFake.respondWith((query) => (query.op === 'update' ? { error: { message: 'write failed' } } : db.respond(query)))
    await expect(saveCampaignRentals('c1', 3, [])).rejects.toThrow('write failed')
  })

  it('patches a single rental by offer', async () => {
    seed([rental({ service_offer_id: 7 }), rental({ service_offer_id: 8 })])
    const updated = await updateCsrCapabilityRentalStatus({ campaignId: 'c1', offerId: 7, companyId: 3, patch: { status: 'attached', id: 'forged' } })
    expect(updated).toMatchObject({ id: 'c1:7', status: 'attached', rental_amount_inr: 1000 })
    expect(db.rentals()).toHaveLength(2)
    expect(db.rentals().find((row) => row.service_offer_id === 8)?.status).toBe('paid')
  })

  it.each([
    ['another company', { campaignId: 'c1', offerId: 7, companyId: 99 }, 'Campaign not found'],
    ['an unknown offer', { campaignId: 'c1', offerId: 70 }, 'CSR capability rental not found'],
  ])('refuses to patch for %s', async (_label, input, error) => {
    seed([rental()])
    await expect(updateCsrCapabilityRentalStatus({ ...input, patch: {} })).rejects.toThrow(error)
  })

  it('finds a rental by offer id', async () => {
    seed([rental({ service_offer_id: 7 })])
    await expect(loadCampaignRentalByOffer('c1', 7)).resolves.toMatchObject({ rental: { service_offer_id: 7 } })
    await expect(loadCampaignRentalByOffer('c1', 8)).rejects.toThrow('CSR capability rental not found')
    await expect(loadCampaignRentalByOffer('c9', 7)).rejects.toThrow('Campaign not found')
  })
})

describe('assertCsrCapabilityDeliveryAccess', () => {
  const record = rental()

  it.each([
    [3, 'outbound', null],
    [40, 'outbound', null],
    [12, 'outbound', 'Only the capability owner or company can manage outbound Delhivery tracking'],
    [3, 'return', null],
    [12, 'return', null],
    [40, 'return', 'Only the lead NGO or company can manage return Delhivery tracking'],
    [99, 'outbound', 'Insufficient permissions'],
  ] as const)('user %d on %s leg', (userId, leg, error) => {
    const check = () => assertCsrCapabilityDeliveryAccess({ userId, rental: record, leg })
    if (error) expect(check).toThrow(error)
    else expect(check).not.toThrow()
  })
})

describe('Delhivery tracking', () => {
  it('links a tracking id to a leg', async () => {
    seed([rental({ outbound_delivery: { last_status: 'Manifested' } })])
    const updated = await linkCsrCapabilityRentalTracking({ campaignId: 'c1', offerId: 7, leg: 'outbound', trackingId: '  AWB1 ' })
    expect(updated).toMatchObject({
      logistics_provider: 'delhivery',
      outbound_delivery: { provider: 'delhivery', tracking_id: 'AWB1', last_status: 'Manifested' },
    })
  })

  it.each([
    ['service rentals', rental({ offer_type: 'service' }), 'AWB1', 'Delhivery tracking applies to material capability rentals only'],
    ['a blank tracking id', rental(), '   ', 'Delhivery tracking ID is required'],
  ])('rejects linking %s', async (_label, record, trackingId, error) => {
    seed([record])
    await expect(linkCsrCapabilityRentalTracking({ campaignId: 'c1', offerId: 7, leg: 'return', trackingId })).rejects.toThrow(error)
  })

  it('marks an outbound pickup as dispatched', async () => {
    trackingPayload = shipment('In Transit')
    seed([rental({ outbound_delivery: { tracking_id: 'AWB9' } })])
    const updated = await syncCsrCapabilityRentalDelhivery({ campaignId: 'c1', offerId: 7, leg: 'outbound' })
    expect(fetchMock.mock.calls[0][0]).toBe('https://delhivery.test/api/v1/packages/json/?waybill=AWB9')
    expect(updated).toMatchObject({
      status: 'outbound_dispatched',
      outbound_dispatched_at: '2026-09-26T10:00:00.000Z',
      outbound_delivery: { provider: 'delhivery', tracking_id: 'AWB9', last_status: 'In Transit', last_location: 'Pune Hub' },
    })
  })

  it.each([
    ['active', 'project_active'],
    ['draft', 'outbound_delivered'],
  ])('marks outbound delivery on a %s campaign as %s', async (campaignStatus, status) => {
    trackingPayload = shipment('Delivered')
    seed([rental({ outbound_delivery: { tracking_id: 'AWB9' } })], { status: campaignStatus })
    const updated = await syncCsrCapabilityRentalDelhivery({ campaignId: 'c1', offerId: 7, leg: 'outbound' })
    expect(updated).toMatchObject({ status, outbound_delivered_at: '2026-09-26T10:00:00.000Z' })
  })

  it('clears the fine when the return is delivered', async () => {
    trackingPayload = shipment('Delivered')
    seed([rental({ status: 'return_pending', return_delivery: { tracking_id: 'AWB9' }, fine: { base_amount_inr: 10000, accrued_fine_inr: 0, pending_total_inr: 10000, status: 'pending' } })])
    const updated = await syncCsrCapabilityRentalDelhivery({ campaignId: 'c1', offerId: 7, leg: 'return' })
    expect(updated).toMatchObject({
      status: 'return_delivered',
      return_delivered_at: '2026-09-26T10:00:00.000Z',
      return_dispatched_at: '2026-09-26T10:00:00.000Z',
      fine: { status: 'cleared', pending_total_inr: 0 },
    })
  })

  it('keeps late-return penalties outstanding after the return is delivered', async () => {
    trackingPayload = shipment('Delivered')
    seed([rental({
      status: 'return_pending',
      return_dispatch_due_at: '2026-09-20T00:00:00.000Z',
      return_delivery: { tracking_id: 'AWB9' },
      fine: { base_amount_inr: 10000, accrued_fine_inr: 1262.48, pending_total_inr: 11262.48, status: 'overdue', due_cleared_by: '2026-09-25T00:00:00.000Z' },
    })])
    const updated = await syncCsrCapabilityRentalDelhivery({ campaignId: 'c1', offerId: 7, leg: 'return' })
    expect(updated).toMatchObject({
      status: 'return_delivered',
      return_delivered_at: '2026-09-26T10:00:00.000Z',
      fine: {
        base_amount_inr: 0,
        accrued_fine_inr: 1262.48,
        pending_total_inr: 1262.48,
        status: 'overdue',
        due_cleared_by: '2026-09-25T00:00:00.000Z',
      },
    })
  })

  it('clears the fine for a return dispatched on time', async () => {
    trackingPayload = shipment('Delivered')
    seed([rental({
      status: 'return_pending',
      return_dispatch_due_at: '2026-09-27T00:00:00.000Z',
      return_delivery: { tracking_id: 'AWB9' },
      fine: { base_amount_inr: 10000, accrued_fine_inr: 200, pending_total_inr: 10200, status: 'pending' },
    })])
    const updated = await syncCsrCapabilityRentalDelhivery({ campaignId: 'c1', offerId: 7, leg: 'return' })
    expect(updated.fine).toMatchObject({ status: 'cleared', pending_total_inr: 0, accrued_fine_inr: 0 })
  })

  it('leaves an already cleared fine alone on return delivery', async () => {
    trackingPayload = shipment('Delivered')
    const paidFine = { base_amount_inr: 0, accrued_fine_inr: 0, pending_total_inr: 0, status: 'cleared' as const, reason: 'Paid' }
    seed([rental({ status: 'return_pending', return_dispatch_due_at: '2026-09-20T00:00:00.000Z', return_delivery: { tracking_id: 'AWB9' }, fine: paidFine })])
    const updated = await syncCsrCapabilityRentalDelhivery({ campaignId: 'c1', offerId: 7, leg: 'return' })
    expect(updated.fine).toEqual(paidFine)
  })

  it('does not treat a manifested outbound shipment as dispatched', async () => {
    seed([rental({ outbound_delivery: { tracking_id: 'AWB9' } })])
    const updated = await syncCsrCapabilityRentalDelhivery({ campaignId: 'c1', offerId: 7, leg: 'outbound' })
    expect(updated).toMatchObject({ status: 'paid', outbound_delivery: { last_status: 'Manifested' } })
    expect(updated.outbound_dispatched_at).toBeUndefined()
  })

  it('does not mark an outbound shipment returned to origin as delivered', async () => {
    trackingPayload = shipment('RTO Delivered')
    seed([rental({ outbound_delivery: { tracking_id: 'AWB9' } })])
    const updated = await syncCsrCapabilityRentalDelhivery({ campaignId: 'c1', offerId: 7, leg: 'outbound' })
    expect(updated.outbound_delivered_at).toBeUndefined()
    expect(updated.status).not.toBe('project_active')
  })

  it('does not mark a return leg that came back to origin as delivered', async () => {
    trackingPayload = shipment('RTO')
    const openFine = { base_amount_inr: 10000, accrued_fine_inr: 0, pending_total_inr: 10000, status: 'pending' as const }
    seed([rental({ status: 'return_pending', return_delivery: { tracking_id: 'AWB9' }, fine: openFine })])
    const updated = await syncCsrCapabilityRentalDelhivery({ campaignId: 'c1', offerId: 7, leg: 'return' })
    expect(updated).toMatchObject({ status: 'return_pending', fine: openFine })
    expect(updated.return_delivered_at).toBeUndefined()
  })

  it('requires a tracking id to sync', async () => {
    seed([rental()])
    await expect(syncCsrCapabilityRentalDelhivery({ campaignId: 'c1', offerId: 7, leg: 'return' })).rejects.toThrow('Delhivery tracking ID is required')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lists paid material rentals for each role', async () => {
    seed([
      rental({ service_offer_id: 7 }),
      rental({ service_offer_id: 8, lead_ngo_user_id: 55 }),
      rental({ service_offer_id: 9, payment_status: 'pending' }),
      rental({ service_offer_id: 10, offer_type: 'service' }),
    ])
    const forLead = await listCsrCapabilityRentalsForUser(12)
    expect(forLead.map((row) => [row.rental.service_offer_id, row.role, row.offer_title])).toEqual([[7, 'lead_ngo', 'Water tanks']])
    const forCompany = await listCsrCapabilityRentalsForUser(3)
    expect(forCompany.map((row) => [row.rental.service_offer_id, row.role, row.offer_title])).toEqual([
      [7, 'company', 'Water tanks'],
      [8, 'company', 'Offer #8'],
    ])
    await expect(listCsrCapabilityRentalsForUser(999)).resolves.toEqual([])
  })
})

describe('Delhivery booking', () => {
  const input = { campaignId: 'c1', offerId: 7, leg: 'outbound' as const, bookedByUserId: 40 }

  it('books an outbound shipment from the provider to the campaign site', async () => {
    seed([rental()])
    const updated = await bookCsrCapabilityRentalDelhivery(input)
    const body = createRequestBody()
    expect(body.pickup_location).toEqual({ name: 'GRAM-WH' })
    expect(body.shipments[0]).toMatchObject({
      name: 'Seva Trust',
      add: 'Village Road, Mulshi',
      pin: '411045',
      phone: '9123456789',
      city: 'Mulshi',
      seller_name: 'Water tanks',
      return_pin: '411001',
      return_phone: '9876543210',
      weight: '6000',
      total_amount: 1000,
      payment_mode: 'Prepaid',
    })
    expect(updated.outbound_delivery).toMatchObject({ tracking_id: 'AWB9', last_status: 'Manifested', booking_error: null })
    expect(updated.outbound_delivery?.delhivery_order_id).toMatch(/^csr_c1_7_outbound_\d+$/)
    expect(db.rentals()[0].logistics_provider).toBe('delhivery')
  })

  it('books the return leg back to the provider', async () => {
    db.store.users[12] = { ...db.store.users[12], profile_data: { delhivery_pickup_location: 'NGO-WH' } }
    seed([rental({ status: 'return_pending' })])
    await bookCsrCapabilityRentalDelhivery({ ...input, leg: 'return', bookedByUserId: 12 })
    expect(createRequestBody().shipments[0]).toMatchObject({ pin: '411001', phone: '9876543210', return_pin: '411045' })
    expect(createRequestBody().pickup_location).toEqual({ name: 'NGO-WH' })
  })

  it('uses the configured pickup warehouse when the profile has none', async () => {
    vi.stubEnv('DELHIVERY_PICKUP_LOCATION_NAME', 'ENV-WH')
    seed([rental({ status: 'return_pending' })])
    await bookCsrCapabilityRentalDelhivery({ ...input, leg: 'return', bookedByUserId: 12 })
    expect(createRequestBody().pickup_location).toEqual({ name: 'ENV-WH' })
  })

  it.each([
    ['service rentals', rental({ offer_type: 'service' }), input, 'Delhivery booking applies to material capability rentals only'],
    ['a leg that is already booked', rental({ outbound_delivery: { tracking_id: 'AWB1', last_status: 'In Transit' } }), input, 'Delhivery shipment is already booked for this leg'],
    ['a missing pickup warehouse', rental(), { ...input, bookedByUserId: 12 }, 'Delhivery pickup warehouse is not configured'],
    ['a missing lead NGO', rental({ lead_ngo_user_id: null }), input, 'Lead NGO phone number is required on profile for Delhivery delivery'],
  ])('rejects %s', async (_label, record, bookingInput, error) => {
    seed([record])
    await expect(bookCsrCapabilityRentalDelhivery(bookingInput)).rejects.toThrow(error)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['phone', { phone: '12345' }, 'Add a valid phone number on the NGO profile before booking Delhivery'],
    ['pincode', { pincode: '4110' }, 'Add a valid 6-digit pincode on the NGO profile before booking Delhivery'],
    ['address', { location: ' ' }, 'Add a pickup/delivery address on the NGO profile before booking Delhivery'],
  ])('requires a valid provider %s', async (_label, overrides, error) => {
    db.store.users[40] = { ...db.store.users[40], ...overrides }
    db.store.offers[7] = { ...db.store.offers[7], coverage_area: (overrides as Row).location }
    seed([rental()])
    await expect(bookCsrCapabilityRentalDelhivery(input)).rejects.toThrow(error)
  })

  it('allows rebooking a cancelled shipment', async () => {
    seed([rental({ outbound_delivery: { tracking_id: 'AWB1', last_status: 'Cancelled' } })])
    await expect(bookCsrCapabilityRentalDelhivery(input)).resolves.toMatchObject({ outbound_delivery: { tracking_id: 'AWB9' } })
  })

  it('records a failed automatic booking on the rental', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    createPayload = { success: false, rmk: 'Pincode not serviceable' }
    seed([rental()])
    const updated = await autoBookCsrCapabilityDelhivery(input)
    expect(updated.outbound_delivery).toMatchObject({ provider: 'delhivery', booking_error: 'Pincode not serviceable' })
    expect(updated.outbound_delivery?.tracking_id).toBeUndefined()
    consoleError.mockRestore()
  })

  it('records a missing booking profile without calling Delhivery', async () => {
    seed([rental()])
    const updated = await autoBookCsrCapabilityDelhivery({ ...input, bookedByUserId: 0 })
    expect(updated.outbound_delivery?.booking_error).toBe('Profile missing for automatic Delhivery booking')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leaves service rentals alone', async () => {
    const record = rental({ offer_type: 'service' })
    seed([record])
    await expect(autoBookCsrCapabilityDelhivery(input)).resolves.toEqual(record)
    expect(supabaseFake.find('campaigns', 'update')).toHaveLength(0)
  })

  it('retries by syncing when a tracking id already exists', async () => {
    seed([rental({ outbound_delivery: { tracking_id: 'AWB9' } })])
    await retryCsrCapabilityDelhiveryBooking(input)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/packages/json/')
  })

  it('syncs tracked rentals and retries failed bookings', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    seed([
      rental({ service_offer_id: 7, outbound_delivery: { tracking_id: 'AWB9' } }),
      rental({ service_offer_id: 8, outbound_delivery: { booking_error: 'timeout' } }),
      rental({ service_offer_id: 9, outbound_delivery: { tracking_id: 'AWB3' }, outbound_delivered_at: '2026-09-01' }),
      rental({ service_offer_id: 10, payment_status: 'pending', outbound_delivery: { tracking_id: 'AWB4' } }),
    ])
    await expect(syncAllCsrCapabilityRentalsDelhivery()).resolves.toEqual({ synced: 1, retried: 1 })
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('/packages/json/')).length).toBeGreaterThanOrEqual(1)
    consoleError.mockRestore()
  })
})
