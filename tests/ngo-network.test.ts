import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Razorpay from 'razorpay'
import { createNetworkDonationOrder, verifyNetworkDonation } from '@/lib/ngo-network/donation'
import { filterNetworkNgos, type NetworkNgo, type NetworkNgoFilters } from '@/lib/ngo-network/listing'
import {
  buildCompliance,
  buildMission,
  buildSearchHaystack,
  getNgoSize,
  isFieldOfficerAccount,
  listNgoScheduleViiSectors,
  normalizeNgoRegistrationType,
  normalizeProjectStatus,
} from '@/lib/ngo-network/ngo-profile'

const mocks = vi.hoisted(() => ({ createOrder: vi.fn(), verifyDonation: vi.fn() }))

vi.mock('@/lib/db', () => ({ supabase: {}, db: {} }))
vi.mock('@/lib/razorpay-route', () => ({
  buildPricingResponse: (pricing: { totalChargeInr: number }) => ({ totalCharge: pricing.totalChargeInr }),
  createNgoNetworkDonationOrder: mocks.createOrder,
  isRazorpayRouteEnabled: () => false,
  verifyNgoNetworkDonation: mocks.verifyDonation,
  isNgoRazorpayPayoutActive: () => false,
}))

const EDUCATION = 'Education and Livelihood Enhancement'
const HEALTH = 'Promoting Healthcare and Sanitation'

describe('isFieldOfficerAccount', () => {
  it.each([
    [{}, { is_field_officer: true }, null, true],
    [{}, { account_role: 'Field Officer' }, null, true],
    [{ name: 'District Field Officer' }, {}, null, true],
    [{ name: 'Asha' }, {}, { ngo_name: 'field officer desk' }, true],
    [{ name: 'Asha Foundation' }, { role: 'admin' }, null, false],
  ])('detects field officers: %j %j', (row, profile, verification, expected) => {
    expect(isFieldOfficerAccount(row, profile, verification)).toBe(expected)
  })
})

describe('NGO profile helpers', () => {
  it('reads the team size', () => {
    expect(getNgoSize({ team_strength: 25, organization_size: 'large' })).toBe('25')
    expect(getNgoSize({ organization_size: '  ' })).toBeNull()
    expect(getNgoSize({})).toBeNull()
  })

  it('uses the bio as the mission when present', () => {
    expect(buildMission({ bio: ' We teach ', sectors_schedule_vii: EDUCATION })).toBe('We teach')
    expect(buildMission({ sectors_schedule_vii: EDUCATION })).toBe(EDUCATION)
    expect(buildMission({})).toBeNull()
  })

  it.each([
    ['Fulfilled', 'completed'],
    ['closed', 'completed'],
    ['assigned', 'ongoing'],
    ['in_progress', 'ongoing'],
    ['draft', 'active'],
    [null, 'active'],
  ])('normalises project status %j', (status, expected) => {
    expect(normalizeProjectStatus(status)).toBe(expected)
  })

  it.each([
    ['Public Charitable Trust', 'Trust'],
    ['Registered Society', 'Society'],
    ['Section 8 Company', 'Section 8'],
    ['section8', 'Section 8'],
    ['Company Limited by Guarantee', 'Section 8'],
    ['LLP', ''],
    ['', ''],
  ])('normalises registration type %j', (value, expected) => {
    expect(normalizeNgoRegistrationType(value)).toBe(expected)
  })

  it('collects valid Schedule VII sectors without duplicates', () => {
    expect(listNgoScheduleViiSectors(
      { sectors_schedule_vii: [EDUCATION, 'Space'], sector: `${EDUCATION}, ${HEALTH}` },
      { sector: HEALTH }
    )).toEqual([EDUCATION, HEALTH])
  })

  it('builds compliance flags from verification and CA tags', () => {
    const profile = { ca_compliance_tags: ['csr1', '80g'] }
    expect(buildCompliance(profile, 'Section 8 Company', { email_verified: true }, { verification_status: 'verified' })).toEqual({
      verified: true,
      csr1: true,
      section_12a: false,
      section_80g: true,
      fcra: false,
      section_8: true,
    })
    expect(buildCompliance(profile, 'Trust', { email_verified: false }, { verification_status: 'verified' }).verified).toBe(false)
    expect(buildCompliance(profile, 'Trust', { email_verified: true }, { verification_status: 'pending' })).toMatchObject({
      verified: false,
      csr1: false,
    })
  })

  it('builds a lowercase search haystack skipping blanks', () => {
    expect(buildSearchHaystack(
      { name: 'Asha Foundation', email: 'A@X.org', city: '' },
      { bio: 'Teaching Kids' },
      { fcra_number: 'FC-9' },
      { sector: EDUCATION },
      []
    )).toBe(`asha foundation a@x.org ${EDUCATION.toLowerCase()} teaching kids fc-9`)
  })
})

function networkNgo(overrides: Record<string, unknown>): NetworkNgo {
  return {
    id: 1,
    name: 'NGO',
    location: 'Pune, Maharashtra, India',
    city: 'Pune',
    state_province: 'Maharashtra',
    sectors_schedule_vii: [EDUCATION],
    registration_type: 'Trust',
    geographic_coverage_preview: '',
    compliance: { verified: true, csr1: false, section_12a: false, section_80g: false, fcra: false, section_8: false },
    search_haystack: 'ngo',
    ...overrides,
  } as unknown as NetworkNgo
}

describe('filterNetworkNgos', () => {
  const ngos = [
    networkNgo({ id: 1, search_haystack: 'asha teaching', compliance: { verified: true, csr1: true, section_80g: true } }),
    networkNgo({ id: 2, location: 'Mumbai', geographic_coverage_preview: 'Thane, Pune', sectors_schedule_vii: [HEALTH], registration_type: 'Section 8' }),
    networkNgo({ id: 3, location: 'Delhi', compliance: { verified: false, fcra: true }, registration_type: 'Society' }),
  ]
  const none: NetworkNgoFilters = { search: '', location: '', sector: '', compliance: '', registrationType: '', verifiedOnly: false }

  it.each<[Partial<NetworkNgoFilters>, number[]]>([
    [{}, [1, 2, 3]],
    [{ search: 'Teaching' }, [1]],
    [{ location: 'pune' }, [1, 2]],
    [{ sector: HEALTH.toUpperCase() }, [2]],
    [{ sector: 'all' }, [1, 2, 3]],
    [{ verifiedOnly: true }, [1, 2]],
    [{ compliance: '80g' }, [1]],
    [{ compliance: 'fcra' }, [3]],
    [{ registrationType: 'section 8 company' }, [2]],
  ])('filters by %j', (filters, ids) => {
    expect(filterNetworkNgos(ngos, { ...none, ...filters }).map((ngo) => ngo.id)).toEqual(ids)
  })

  it('strips internal search fields from the result', () => {
    const [ngo] = filterNetworkNgos(ngos.slice(0, 1), none)
    expect(ngo).not.toHaveProperty('search_haystack')
    expect(ngo).not.toHaveProperty('city')
    expect(ngo).not.toHaveProperty('state_province')
  })
})

describe('NGO network donations', () => {
  const context = {
    razorpay: {} as Razorpay,
    keyId: 'rzp_test',
    keySecret: 'secret',
    contributor: { id: 3, user_type: 'company', name: 'Acme' },
    ngoUserId: 7,
    ngoName: 'Asha',
  }

  beforeEach(() => {
    mocks.createOrder.mockReset()
    mocks.verifyDonation.mockReset()
  })

  it.each([0, -5, 'abc', null])('rejects an invalid amount %j', async (amount) => {
    const response = await createNetworkDonationOrder(context, amount)
    expect(response.status).toBe(400)
    expect(mocks.createOrder).not.toHaveBeenCalled()
  })

  it('creates an order for a valid amount', async () => {
    mocks.createOrder.mockResolvedValue({ order: { id: 'order_1', currency: 'INR' }, pricing: { totalChargeInr: 1059 } })
    const response = await createNetworkDonationOrder(context, '1000')
    expect(mocks.createOrder).toHaveBeenCalledWith(expect.objectContaining({ amountInr: 1000, ngoUserId: 7, contributorId: 3 }))
    expect(await response.json()).toEqual({
      success: true,
      data: {
        orderId: 'order_1',
        totalCharge: 1059,
        currency: 'INR',
        keyId: 'rzp_test',
        ngoId: 7,
        ngoName: 'Asha',
        source: 'ngo_network',
        routeEnabled: false,
        paymentKind: 'ngo_network',
      },
    })
  })

  it('requires all verification fields', async () => {
    const response = await verifyNetworkDonation(context, { razorpay_order_id: 'o', razorpay_payment_id: 'p' })
    expect(response.status).toBe(400)
    expect(mocks.verifyDonation).not.toHaveBeenCalled()
    expect((await verifyNetworkDonation(context, null)).status).toBe(400)
  })

  it('reports verification failures as a 400', async () => {
    mocks.verifyDonation.mockRejectedValue(new Error('Signature mismatch'))
    const response = await verifyNetworkDonation(context, { razorpay_order_id: 'o', razorpay_payment_id: 'p', razorpay_signature: 's' })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Signature mismatch' })
  })

  it('confirms a verified donation', async () => {
    mocks.verifyDonation.mockResolvedValue({ message: 'Thanks' })
    const response = await verifyNetworkDonation(context, { razorpay_order_id: 'o', razorpay_payment_id: 'p', razorpay_signature: 's' })
    expect(await response.json()).toEqual({ success: true, data: { message: 'Thanks', ngoId: 7, ngoName: 'Asha', source: 'ngo_network' } })
    expect(mocks.verifyDonation).toHaveBeenCalledWith(expect.objectContaining({ razorpay_signature: 's', contributorId: 3 }))
  })
})
