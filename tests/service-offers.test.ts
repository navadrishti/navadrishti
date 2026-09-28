import { describe, expect, it } from 'vitest'
import {
  buildSelectedNeedSummary,
  buildUsageRecordFromClient,
  classifyCapabilityOffer,
  dedupeSelectedNeedSummaries,
  formatCapabilityRentalRateLabel,
  formatCapabilityTransactionLabel,
  formatImpactAreaLabel,
  formatOfferInrAmount,
  formatUsageStatusLabel,
  getCapabilityNeedRequestTypes,
  impactAreaMatchesFilter,
  isCapabilityOfferAvailableForListing,
  isOfferExpired,
  normalizeCapabilityTransactionType,
  normalizeDateOnlyToEndOfDayIso,
  normalizeImpactAreas,
  resolveCapabilityRentalRate,
  toNullableNumber,
  toNullablePositiveNumber,
  type OfferType,
} from '@/lib/service-offers'
import {
  buildOfferCapabilityRow,
  buildOfferRow,
  coerceOfferBody,
  toOfferResponse,
  validateOfferBody,
} from '@/lib/service-offer-payload'
import {
  formatInrAmount,
  formatSelectedNeeds,
  getOfferRequestBillingDetails,
  getOfferRequestBucket,
  toOfferRentalApplication,
  type OfferRequestItem,
} from '@/lib/offer-requests'
import type { Json } from '@/lib/database.types'

const EDUCATION = 'Education and Livelihood Enhancement'
const HEALTH = 'Promoting Healthcare and Sanitation'

function offerBody(overrides: Record<string, Json | undefined> = {}) {
  return coerceOfferBody({
    title: 'School desks',
    description: 'Wooden desks',
    offer_type: 'material',
    transaction_type: 'donate',
    impact_area: 'education',
    valid_until: '2099-12-31',
    ...overrides,
  })
}

describe('coerceOfferBody', () => {
  it('normalises CSV impact areas and tags', () => {
    const body = offerBody({ impact_area: 'education, Healthcare, education', tags: 'desks, , furniture' })
    expect(body.impact_area).toEqual([EDUCATION, HEALTH])
    expect(body.tags).toEqual(['desks', 'furniture'])
  })

  it('folds object requirements into offer details', () => {
    const body = offerBody({ offer_details: { unit: 'desk' }, requirements: { quantity: 40 } })
    expect(body.offer_details).toEqual({ unit: 'desk', quantity: 40 })
    expect(body.requirements).toBeNull()
  })

  it('trims string requirements and copies the legacy state field', () => {
    const body = offerBody({ requirements: '   ', 'state/province': 'Kerala' })
    expect(body.requirements).toBeNull()
    expect(body.state_province).toBe('Kerala')
  })
})

describe('validateOfferBody', () => {
  it('accepts a complete donation offer', () => {
    expect(validateOfferBody(offerBody())).toBeNull()
  })

  it.each([
    ['missing title', { title: '' }, /Missing required fields/],
    ['unknown offer type', { offer_type: 'land' }, /offer_type must be one of/],
    ['unknown transaction type', { transaction_type: 'lease' }, /transaction_type must be one of/],
    ['no valid impact area', { impact_area: 'astronomy' }, /at least one impact area/],
    ['no expiry', { valid_until: null }, /valid_until is required/],
    ['unparseable expiry', { valid_until: 'soon' }, /must be a valid date/],
    ['past expiry', { valid_until: '2020-01-01' }, /must be in the future/],
    ['rental without a rate', { transaction_type: 'rent' }, /Daily rental rate must be a positive number/],
    ['rental with a free price type', { transaction_type: 'rent', unit_rate: 500, price_type: 'free' }, /price_type must be fixed or negotiable/],
    ['legacy sale of a financial offer', { offer_type: 'financial', transaction_type: 'sell' }, /Permanent sale is not supported/],
    ['legacy sale of a material offer', { transaction_type: 'sell', unit_rate: 300 }, /Permanent sale is not supported/],
    ['rental of a financial offer', { offer_type: 'financial', transaction_type: 'rent', unit_rate: 300 }, /transaction_type rent is not allowed for offer_type financial/],
    ['volunteering a material offer', { transaction_type: 'volunteer' }, /transaction_type volunteer is not allowed for offer_type material/],
    ['donating infrastructure', { offer_type: 'infrastructure', transaction_type: 'donate' }, /transaction_type donate is not allowed for offer_type infrastructure/],
  ])('rejects %s', (_label, overrides, message) => {
    expect(validateOfferBody(offerBody(overrides))).toMatch(message)
  })

  it('reads the expiry from offer details', () => {
    expect(validateOfferBody(offerBody({ valid_until: null, offer_details: { valid_until: '2099-01-01' } }))).toBeNull()
  })

  it('accepts a rental with a positive daily rate', () => {
    expect(validateOfferBody(offerBody({ transaction_type: 'rent', unit_rate: 500 }))).toBeNull()
  })

  it('does not rewrite the requested transaction type', () => {
    const body = offerBody({ offer_type: 'financial', transaction_type: 'rent' })
    expect(validateOfferBody(body)).not.toBeNull()
    expect(body.transaction_type).toBe('rent')
  })

  it.each([
    ['financial', 'donate'],
    ['service', 'volunteer'],
    ['service', 'rent'],
    ['material', 'donate'],
    ['material', 'rent'],
    ['infrastructure', 'rent'],
  ])('accepts a %s offer with transaction type %s', (offer_type, transaction_type) => {
    expect(validateOfferBody(offerBody({ offer_type, transaction_type, unit_rate: 300 }))).toBeNull()
  })
})

describe('buildOfferRow', () => {
  it('stores donations as free with no rental fields', () => {
    const row = buildOfferRow(offerBody({ requirements: ' Pickup from Pune ', city: '  ' }))
    expect(row).toMatchObject({
      title: 'School desks',
      transaction_type: 'donate',
      impact_area: [EDUCATION],
      requirements: ['Pickup from Pune'],
      city: null,
      price_type: 'free',
      price_amount: 0,
      price_description: 'Donation support',
      unit_rate: null,
      billing_cycle: null,
      payment_mode: null,
      rate_currency: 'INR',
      valid_until: '2099-12-31T23:59:59.999Z',
    })
    expect(row.offer_details).toMatchObject({ billing_cycle: 'daily', unit_rate: null, available_to: null })
  })

  it('stores rentals with a daily rate and billing defaults', () => {
    const row = buildOfferRow(offerBody({ transaction_type: 'rent', unit_rate: 750, price_type: 'negotiable' }))
    expect(row).toMatchObject({
      transaction_type: 'rent',
      price_type: 'negotiable',
      price_amount: 750,
      price_description: 'per day',
      unit_rate: 750,
      billing_cycle: 'daily',
      payment_mode: 'daily_due',
    })
  })

  it('labels volunteer and funding offers', () => {
    expect(buildOfferRow(offerBody({ offer_type: 'service', transaction_type: 'volunteer' })).price_description).toBe('Volunteer support')
    expect(buildOfferRow(offerBody({ offer_type: 'financial' })).price_description).toBe('Donation support')
  })
})

describe('buildOfferCapabilityRow', () => {
  it.each([
    ['financial', 'financial', 'offer'],
    ['service', 'skill', 'service'],
    ['material', 'item', 'item'],
    ['infrastructure', 'asset', 'asset'],
  ])('maps %s offers to %s capabilities', (offerType, kind, unit) => {
    const row = buildOfferCapabilityRow({ id: 4, offer_type: offerType, title: ' Desks ', tags: ['a', ''] })
    expect(row).toMatchObject({ service_offer_id: 4, capability_name: 'Desks', capability_kind: kind, unit, synonyms: ['a'] })
  })
})

describe('toOfferResponse', () => {
  it('fills legacy fields from old category-based rows', () => {
    const response = toOfferResponse({
      id: 1,
      creator_id: 9,
      category: 'Material Supply',
      price_type: 'free',
      price_amount: null,
      requirements: '{"quantity":"12","unit":"kits"}',
      ngo: { verification_status: 'Verified' },
    })
    expect(response).toMatchObject({
      ngo_id: 9,
      offer_type: 'material',
      transaction_type: 'donate',
      is_expired: false,
      quantity: 12,
      item: 'kits',
      amount: null,
      verified: true,
      impact_area: [],
    })
  })

  it('treats a priced legacy row as a rental and flags expiry', () => {
    const response = toOfferResponse({ id: 2, offer_type: 'service', price_amount: 900, valid_until: '2020-01-01' })
    expect(response.transaction_type).toBe('rent')
    expect(response.unit_rate).toBe(900)
    expect(response.is_expired).toBe(true)
  })
})

describe('offer types', () => {
  it.each<[OfferType, unknown, string]>([
    ['material', 'sell', 'rent'],
    ['material', 'rent', 'rent'],
    ['financial', 'rent', 'donate'],
    ['service', undefined, 'volunteer'],
    ['infrastructure', 'donate', 'rent'],
  ])('normalises %s/%s to %s', (offerType, transactionType, expected) => {
    expect(normalizeCapabilityTransactionType(offerType, transactionType)).toBe(expected)
  })

  it('resolves the rental rate from the row, details or price', () => {
    expect(resolveCapabilityRentalRate({ unit_rate: 200, price_amount: 900 })).toBe(200)
    expect(resolveCapabilityRentalRate({ offer_details: { unit_rate: 300 }, price_amount: 900 })).toBe(300)
    expect(resolveCapabilityRentalRate({ price_amount: '450' })).toBe(450)
    expect(resolveCapabilityRentalRate({ unit_rate: -5 })).toBe(0)
  })

  it('lists the need types a capability can serve', () => {
    expect(getCapabilityNeedRequestTypes('infrastructure')).toEqual(['Infrastructure Project'])
    expect(getCapabilityNeedRequestTypes('land')).toEqual([])
  })
})

describe('impact areas', () => {
  it('maps legacy slugs and casing onto Schedule VII and drops unknowns', () => {
    expect(normalizeImpactAreas(['child_welfare', 'EDUCATION AND LIVELIHOOD ENHANCEMENT', 'Healthcare', 'space'])).toEqual([EDUCATION, HEALTH])
  })

  it('matches filters across legacy slugs and categories', () => {
    expect(impactAreaMatchesFilter(['education'], EDUCATION)).toBe(true)
    expect(impactAreaMatchesFilter([EDUCATION], 'livelihood')).toBe(true)
    expect(impactAreaMatchesFilter(['sports'], EDUCATION)).toBe(false)
    expect(impactAreaMatchesFilter([], 'All impact areas')).toBe(true)
  })

  it('labels unknown slugs readably', () => {
    expect(formatImpactAreaLabel('women_empowerment')).toBe('Gender Equality and Women Empowerment')
    expect(formatImpactAreaLabel('clean_water')).toBe('clean water')
  })
})

describe('offer parsing helpers', () => {
  it('parses nullable numbers', () => {
    expect(toNullablePositiveNumber('12')).toBe(12)
    expect(toNullablePositiveNumber(0)).toBeNull()
    expect(toNullablePositiveNumber('')).toBeNull()
    expect(toNullableNumber('-3')).toBe(-3)
    expect(toNullableNumber('abc')).toBeNull()
  })

  it('extends date-only values to the end of the UTC day', () => {
    expect(normalizeDateOnlyToEndOfDayIso('2026-03-01')).toBe('2026-03-01T23:59:59.999Z')
    expect(normalizeDateOnlyToEndOfDayIso('2026-03-01T10:00:00Z')).toBe('2026-03-01T10:00:00.000Z')
    expect(normalizeDateOnlyToEndOfDayIso('garbage')).toBeNull()
  })
})

describe('offer availability', () => {
  const now = new Date('2026-06-01T00:00:00Z')

  it('prefers expires_at and ignores bad dates', () => {
    expect(isOfferExpired({ expires_at: '2026-05-01', valid_until: '2026-07-01' }, now)).toBe(true)
    expect(isOfferExpired({ valid_until: 'not a date' }, now)).toBe(false)
    expect(isOfferExpired(null, now)).toBe(false)
  })

  it.each([
    ['paused', { status: 'paused' }, false],
    ['expired', { is_expired: true }, false],
    ['already used', { usage_records: [{}] }, false],
    ['assigned', { isAssigned: true }, false],
    ['paid rental lock', { offer_details: { csr_rental_lock: { paid_at: '2026-01-01' } } }, false],
    ['unpaid rental lock', { offer_details: { csr_rental_lock: { held_at: '2026-01-01' } } }, true],
    ['open', { status: 'active' }, true],
  ])('lists %s offers: %s', (_label, offer, expected) => {
    expect(isCapabilityOfferAvailableForListing(offer)).toBe(expected)
  })

  it.each([
    [{ id: 1, status: 'inactive' }, 'inactive'],
    [{ id: 1, is_expired: true, isAssigned: true }, 'expired_and_used'],
    [{ id: 1, isAssigned: true }, 'used'],
    [{ id: 1, is_expired: true, status: 'cancelled' }, 'expired'],
    [{ id: 1, status: 'active' }, null],
  ])('classifies past reason as %s', (offer, reason) => {
    const result = classifyCapabilityOffer(offer)
    expect(result.pastReason).toBe(reason)
    expect(result.isActive).toBe(reason === null)
  })
})

describe('offer formatting', () => {
  it('formats amounts and rental rates', () => {
    expect(formatOfferInrAmount(150000)).toBe('INR 1,50,000')
    expect(formatOfferInrAmount(0)).toBe('Free')
    expect(formatCapabilityRentalRateLabel({ transaction_type: 'rent', unit_rate: 1500 })).toBe('INR 1,500/day')
    expect(formatCapabilityRentalRateLabel({ transaction_type: 'rent' })).toBe('Not set')
    expect(formatCapabilityRentalRateLabel({ transaction_type: 'donate', unit_rate: 1500 })).toBe('Free')
  })

  it.each([
    ['sell', 'Daily rental'],
    ['volunteer', 'Volunteer'],
    ['cash_grant', 'cash grant'],
    [null, 'Not set'],
  ])('labels transaction %s', (value, label) => {
    expect(formatCapabilityTransactionLabel(value)).toBe(label)
  })

  it('labels usage statuses', () => {
    expect(formatUsageStatusLabel('in_progress')).toBe('In use')
    expect(formatUsageStatusLabel('completed')).toBe('Completed')
    expect(formatUsageStatusLabel('rejected')).toBe('Rejected')
  })
})

describe('usage records', () => {
  it('dedupes selected needs and caps the list', () => {
    const needs = [0, 1, 1, 2, 3, 4].map((id) => ({ id, title: `N${id}` }))
    expect(dedupeSelectedNeedSummaries(needs).map((need) => need.id)).toEqual([1, 2, 3])
  })

  it('builds need summaries from a JSON string of needs', () => {
    const summary = buildSelectedNeedSummary({
      service_request_id: 7,
      selected_needs: JSON.stringify([{ id: 3, title: 'Books', estimated_budget: '5000' }]),
    })
    expect(summary).toEqual([
      { id: 3, title: 'Books', service_request_id: 7, estimated_budget: 5000, target_amount: null, target_quantity: null, beneficiary_count: null },
    ])
  })

  it('ignores clients that were never accepted', () => {
    expect(buildUsageRecordFromClient({ id: 1, status: 'pending' })).toBeNull()
  })

  it('merges client, assignment and attendance data for daily rentals', () => {
    const record = buildUsageRecordFromClient(
      {
        id: 5,
        status: 'accepted',
        client: { name: 'Acme', user_type: 'company' },
        response_meta: {
          billing_cycle: 'daily',
          assignment_meta: { rate_per_unit: 800 },
          selected_need_ids: [3, 3, 4],
          linked_service_request_id: 3,
          accepted_at: '2026-01-01',
        },
      },
      { meta: { attendance_summary: { days_attended: 4, total_due: 3200, paid_total: 1600 }, settled_amount: 1600 } }
    )
    expect(record).toMatchObject({
      id: 5,
      client_name: 'Acme',
      client_email: null,
      payment_amount_inr: 800,
      payment_required: true,
      is_daily_rental: true,
      billing_cycle: 'daily',
      assigned_at: '2026-01-01',
      days_present: 4,
      cumulative_due: 3200,
      paid_total: 1600,
      settled_amount: 1600,
      linked_service_request_id: 3,
    })
    expect(record?.selected_needs.map((need) => [need.id, need.service_request_id])).toEqual([[3, 3], [4, 3]])
  })
})

function offerRequest(overrides: Partial<OfferRequestItem> = {}): OfferRequestItem {
  return { id: 1, service_offer_id: 2, offer_title: 'Desks', status: 'pending', isAssigned: false, ...overrides }
}

describe('offer requests', () => {
  it.each<[OfferRequestItem['status'], boolean, string]>([
    ['accepted', false, 'in-progress'],
    ['pending', true, 'in-progress'],
    ['cancelled', false, 'history'],
    ['rejected', false, 'history'],
    ['pending', false, 'pending'],
  ])('buckets %s (assigned=%s) as %s', (status, isAssigned, bucket) => {
    expect(getOfferRequestBucket(offerRequest({ status, isAssigned }))).toBe(bucket)
  })

  it('formats selected needs from the summary first', () => {
    const request = offerRequest({
      selected_need_summary: [{ id: 1, title: 'Books', target_amount: 25000 }, { id: 2, title: 'Desks' }],
      response_meta: { selected_need_ids: [9] },
    })
    expect(formatSelectedNeeds(request)).toEqual(['Books | INR 25,000', 'Desks'])
    expect(formatSelectedNeeds(request, 1)).toEqual(['Books | INR 25,000'])
  })

  it('falls back to meta needs, need ids and the service request id', () => {
    expect(formatSelectedNeeds(offerRequest({ response_meta: { selected_needs: [1, 2, 3, 4].map((id) => ({ title: `N${id}` })) } }))).toEqual(['N1', 'N2', 'N3'])
    expect(formatSelectedNeeds(offerRequest({ response_meta: { selected_need_ids: [5, 6] } }))).toEqual(['Need #5', 'Need #6'])
    expect(formatSelectedNeeds(offerRequest({ response_meta: { service_request_id: 8 } }))).toEqual(['Need #8'])
    expect(formatSelectedNeeds(offerRequest())).toEqual([])
  })

  it('resolves billing details with meta taking precedence', () => {
    const request = offerRequest({
      payment_amount_inr: 100,
      billing_cycle: 'monthly',
      response_meta: { billing_cycle: 'daily', assignment_meta: { rate_per_unit: 600, payment_mode: 'daily_due' } },
    })
    expect(getOfferRequestBillingDetails(request)).toMatchObject({
      billingCycle: 'daily',
      paymentMode: 'daily_due',
      paymentAmount: 600,
      paymentRequired: true,
    })
  })

  it('respects an explicit payment_required false', () => {
    const request = offerRequest({ response_meta: { payment_amount_inr: 500, payment_required: false } })
    expect(getOfferRequestBillingDetails(request).paymentRequired).toBe(false)
  })

  it('maps a request onto a rental application', () => {
    expect(toOfferRentalApplication(offerRequest({ id: 3, payment_amount_inr: 250 }))).toEqual({
      id: 3,
      fulfillment_amount: 250,
      assigned_amount: 250,
      response_meta: {},
    })
    expect(formatInrAmount('abc')).toBe('Free')
  })
})
