import { describe, expect, it } from 'vitest'
import {
  enrichProjectRecord,
  formatAttendanceSummary,
  formatDeliveryTrackingStatus,
  formatProjectExactAddress,
  formatProjectLocation,
  getDeliveryTrackingEvents,
  getNgoNeedFulfillmentMode,
  getSkillServiceDailyRate,
  isAuthenticCompanyProjectApplication,
  isDailyRentalEngagementMeta,
  isDeliveredTrackingStatus,
  isFinancialNeedType,
  isInfrastructureNeed,
  isNeedOpenForListing,
  isPickedUpTrackingStatus,
  isReturnedToOriginTrackingStatus,
  mergeClientProjectDescription,
  normalizeServiceRequestRecord,
  parseProjectExactAddress,
  parseProjectMeta,
  projectAddressToLocationSummary,
  redactProjectSensitiveFields,
  serializeProjectExactAddress,
  shouldCreateSkillServiceAssignment,
  shouldUseDelhiveryForNeed,
  shouldUseNgoMarkedDailyAttendance,
  shouldUseRazorpayForNeed,
  stripProjectMetaFromDescription,
  toProjectAddressDateInput,
  validateProjectExactAddress,
  withProjectMeta,
  type ServiceRequestInput,
} from '@/lib/service-request-allocation'

describe('getNgoNeedFulfillmentMode', () => {
  it.each<[ServiceRequestInput, string]>([
    [{ request_type: 'Financial Need' }, 'financial'],
    [{ request_type: 'Material Need' }, 'material'],
    [{ category: 'Delivery of kits' }, 'material'],
    [{ request_type: 'Infrastructure Project' }, 'infrastructure'],
    [{ request_type: 'Skill / Service Need' }, 'skill_service'],
    [[{ request_type: 'Material Need' }], 'material'],
    [{ requirements: '{"request_type":"Financial Need"}' }, 'financial'],
    [null, 'skill_service'],
  ])('maps %j to %s', (request, mode) => {
    expect(getNgoNeedFulfillmentMode(request)).toBe(mode)
  })

  it('routes each mode to its fulfilment channel', () => {
    expect(shouldUseRazorpayForNeed({ request_type: 'Financial Need' })).toBe(true)
    expect(shouldUseDelhiveryForNeed({ request_type: 'Material Need' })).toBe(true)
    expect(shouldUseNgoMarkedDailyAttendance({ request_type: 'Skill / Service Need' })).toBe(true)
    expect(isInfrastructureNeed({ request_type: 'Infrastructure Project' })).toBe(true)
    expect(shouldCreateSkillServiceAssignment({ request_type: 'Infrastructure Project' })).toBe(true)
    expect(shouldCreateSkillServiceAssignment({ request_type: 'Material Need' })).toBe(false)
  })

  it('normalises joined request records', () => {
    expect(normalizeServiceRequestRecord([{ id: 1 }, { id: 2 }])).toEqual({ id: 1 })
    expect(normalizeServiceRequestRecord([])).toBeNull()
    expect(normalizeServiceRequestRecord('x')).toBeNull()
  })
})

describe('isNeedOpenForListing', () => {
  const need = { request_type: 'Material Need', target_quantity: 10, current_quantity: 4, status: 'active' }

  it('requires remaining capacity and an open listing', () => {
    expect(isNeedOpenForListing(need)).toBe(true)
    expect(isNeedOpenForListing({ ...need, current_quantity: 10 })).toBe(false)
    expect(isNeedOpenForListing({ ...need, listing_open: false })).toBe(false)
    expect(isNeedOpenForListing(null)).toBe(false)
  })

  it('detects financial need types', () => {
    expect(isFinancialNeedType('Financial Need')).toBe(true)
    expect(isFinancialNeedType(null)).toBe(false)
  })
})

describe('delivery tracking', () => {
  it.each([
    ['Delivered', true, true],
    ['Shipment Delivered', true, true],
    ['RTO Delivered', false, true],
    ['RTO In Transit', false, true],
    ['Returned to Origin', false, true],
    ['Undelivered', false, false],
    ['In Transit', false, true],
    ['Picked Up', false, true],
    ['Out for Delivery', false, true],
    ['Manifested', false, false],
    ['Not Picked', false, false],
    ['Pending pickup', false, false],
    ['Pickup Scheduled', false, false],
    ['Booked', false, false],
    ['', false, false],
  ])('classifies %j', (status, delivered, pickedUp) => {
    expect(isDeliveredTrackingStatus(status)).toBe(delivered)
    expect(isPickedUpTrackingStatus(status)).toBe(pickedUp)
  })

  it.each([
    ['RTO Delivered', true],
    ['rto', true],
    ['Return to Origin initiated', true],
    ['Delivered', false],
    ['Protocol hold', false],
  ])('detects return-to-origin status %j', (status, expected) => {
    expect(isReturnedToOriginTrackingStatus(status)).toBe(expected)
  })

  it('reads tracking events and status from meta', () => {
    expect(getDeliveryTrackingEvents({ delivery_tracking_events: [{ status: 'Picked' }] })).toEqual([{ status: 'Picked' }])
    expect(getDeliveryTrackingEvents({ delivery_tracking_events: 'x' })).toEqual([])
    expect(formatDeliveryTrackingStatus({ delivery_tracking_last_status: ' In Transit ' })).toBe('In Transit')
    expect(formatDeliveryTrackingStatus(null)).toBe('Tracking not linked yet')
  })
})

describe('skill service helpers', () => {
  it('prefers the fulfilment amount, then meta rates, and never bills the quantity as a rate', () => {
    expect(getSkillServiceDailyRate({ fulfillment_amount: 900, response_meta: { rate_per_unit: 500 } })).toBe(900)
    expect(getSkillServiceDailyRate({ response_meta: { assignment_meta: { rate_per_unit: 700 } } })).toBe(700)
    expect(getSkillServiceDailyRate({ proposed_amount: 0, assigned_quantity: 3 })).toBe(0)
  })

  it('detects daily rentals from billing cycle or payment mode', () => {
    expect(isDailyRentalEngagementMeta({ billing_cycle: 'Daily' })).toBe(true)
    expect(isDailyRentalEngagementMeta({ assignment_meta: { payment_mode: 'daily_due' } })).toBe(true)
    expect(isDailyRentalEngagementMeta({ billing_cycle: 'monthly' })).toBe(false)
  })

  it('summarises attendance', () => {
    expect(formatAttendanceSummary({ attendance_summary: { total_entries: 2, total_due: 1000 } })).toEqual({
      daysPresent: 2,
      totalDue: 1000,
      paidTotal: 0,
      lastAttendanceAt: null,
    })
  })
})

describe('project meta', () => {
  const application = {
    company_id: 5,
    applicant_user_id: 5,
    source: 'company_apply',
    applied_at: '2026-01-01',
    status: 'pending',
  }

  it('round-trips meta hidden inside the description', () => {
    const description = withProjectMeta('Build a library', { category: 'Education', budget_inr: 50000 })
    expect(stripProjectMetaFromDescription(description)).toBe('Build a library')
    expect(parseProjectMeta(description)).toEqual({ category: 'Education', budget_inr: 50000 })
  })

  it('omits the meta block when there is nothing to store', () => {
    expect(withProjectMeta('Plain', { pending_company_applications: [] })).toBe('Plain')
    expect(parseProjectMeta('<!--nd-project-meta:{bad json:nd-project-meta-->')).toEqual({})
  })

  it('enriches and redacts project records', () => {
    const description = withProjectMeta('Library', { contact_info: '999', pending_company_applications: [application] })
    const enriched = enrichProjectRecord({ description, contact_info: null })
    expect(enriched).toMatchObject({ description: 'Library', contact_info: '999', pending_company_applications: [application] })
    expect(redactProjectSensitiveFields(enriched)).toEqual({
      description: 'Library',
      category: null,
      budget_inr: null,
      impact_description: null,
      contact_info: null,
      pending_company_applications: [],
    })
  })

  it.each([
    ['an object', { bio: 'Hi', website: 'https://w', phone_alt: '1', payout_account: {} }, { bio: 'Hi', website: 'https://w' }],
    ['a JSON string', JSON.stringify({ cover_image: 'c.png', bank: 'x' }), { cover_image: 'c.png' }],
    ['missing', null, {}],
  ])('strips NGO contact details when profile_data is %s', (_label, profileData, expected) => {
    const redacted = redactProjectSensitiveFields({
      title: 'Library',
      ngo: { id: 1, name: 'Seva', email: 'seva@example.org', phone: '999', city: 'Pune', profile_data: profileData },
    })
    expect(redacted?.ngo).toEqual({ id: 1, name: 'Seva', city: 'Pune', profile_data: expected })
  })

  it('keeps NGO email and phone on request but still strips private profile data', () => {
    const redacted = redactProjectSensitiveFields(
      {
        title: 'Library',
        contact_info: '999',
        ngo: { id: 1, email: 'seva@example.org', phone: '999', profile_data: { bio: 'Hi', payout_account: {} } },
      },
      { keepNgoContact: true }
    )
    expect(redacted?.ngo).toEqual({ id: 1, email: 'seva@example.org', phone: '999', profile_data: { bio: 'Hi' } })
    expect(redacted?.contact_info).toBeNull()
  })

  it('leaves a missing NGO alone', () => {
    expect(redactProjectSensitiveFields({ title: 'x', ngo: null })?.ngo).toBeNull()
  })

  it('keeps server-owned applications when the client edits the description', () => {
    const existing = withProjectMeta('Old', { category: 'Education', pending_company_applications: [application] })
    const smuggled = withProjectMeta('New text', {
      pending_company_applications: [{ ...application, company_id: 99, applicant_user_id: 99 }],
    })
    const merged = mergeClientProjectDescription(existing, smuggled, { budget_inr: 1000 })
    expect(stripProjectMetaFromDescription(merged)).toBe('New text')
    expect(parseProjectMeta(merged)).toMatchObject({
      category: 'Education',
      budget_inr: 1000,
      pending_company_applications: [application],
    })
  })

  it.each([
    [{ company_id: 5, source: 'company_apply' }, true],
    [{ company_id: 5, applicant_user_id: 5, source: 'company_apply' }, true],
    [{ company_id: 5, applicant_user_id: 6, source: 'company_apply' }, false],
    [{ company_id: 5, source: 'ngo_invite' }, false],
    [{ company_id: 0, source: 'company_apply' }, false],
    [null, false],
  ])('treats %j as authentic: %s', (app, expected) => {
    expect(isAuthenticCompanyProjectApplication(app)).toBe(expected)
  })
})

describe('project exact address', () => {
  const address = {
    address_line: '12 MG Road',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411 001',
  }

  it('parses JSON, objects and legacy plain text', () => {
    expect(parseProjectExactAddress(serializeProjectExactAddress(address))).toMatchObject({ pincode: '411001', country: 'India' })
    expect(parseProjectExactAddress('Kothrud, Pune')).toMatchObject({ address_line: 'Kothrud, Pune', city: 'Kothrud' })
    expect(parseProjectExactAddress(null).country).toBe('India')
  })

  it('formats the address, defaulting the country', () => {
    expect(formatProjectExactAddress(address)).toBe('12 MG Road, Pune, Maharashtra, 411001, India')
    expect(formatProjectExactAddress({ city: 'Kathmandu', country: 'Nepal' })).toBe('Kathmandu, Nepal')
  })

  it('reports an empty address as not set', () => {
    expect(formatProjectExactAddress('')).toBe('Not set')
    expect(formatProjectExactAddress(null)).toBe('Not set')
    expect(formatProjectExactAddress({ country: 'India' })).toBe('Not set')
    expect(formatProjectExactAddress('{"address_line":" ","country":"India"}')).toBe('Not set')
  })

  it.each([
    [{ address_line: '' }, /Street/],
    [{ city: '' }, /City/],
    [{ state: '' }, /State/],
    [{ pincode: '' }, /Pincode is required/],
    [{ pincode: '4110' }, /6-digit/],
    [{ state: 'Atlantis' }, /valid Indian state/],
  ])('rejects %j', (overrides, message) => {
    expect(validateProjectExactAddress({ ...address, ...overrides })).toMatch(message)
  })

  it('accepts valid Indian and foreign addresses', () => {
    expect(validateProjectExactAddress({ ...address, state: 'maharashtra' })).toBeNull()
    expect(validateProjectExactAddress({ ...address, state: 'Bagmati', pincode: '44600', country: 'Nepal' })).toBeNull()
  })

  it('converts dates for date inputs', () => {
    expect(toProjectAddressDateInput('2026-03-05T10:00:00Z')).toBe('2026-03-05')
    expect(toProjectAddressDateInput('nope')).toBe('')
  })

  it('summarises the location without repeating the city', () => {
    expect(projectAddressToLocationSummary(address)).toBe('Pune, Maharashtra, 411001, India')
  })

  it('never returns a stored address as raw JSON', () => {
    const stored = serializeProjectExactAddress({ address_line: 'dadada', city: 'Delhi', state: 'Delhi', pincode: '112231' })
    expect(formatProjectLocation(stored, 'ignored')).toBe('Delhi, Delhi, 112231, India')
    expect(formatProjectLocation(address)).toBe('Pune, Maharashtra, 411001, India')
    expect(formatProjectLocation('', null, 'Ward 9')).toBe('Ward 9')
    expect(formatProjectLocation('{not json', 'Ward 9')).toBe('Ward 9')
    expect(formatProjectLocation('{"country":""}', 'Ward 9')).toBe('Ward 9')
    expect(formatProjectLocation(null, undefined)).toBe('')
  })
})
