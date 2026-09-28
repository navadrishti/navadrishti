import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createNeed, type CreateNeedBody } from '@/lib/service-requests/create-need'
import { listServiceRequests, type ListingParams } from '@/lib/service-requests/list-query'
import {
  isCompanyAssignedNeed,
  isProjectLocked,
  shapeListingRequest,
  type ListingSource,
} from '@/lib/service-requests/list-shape'
import { parseAmount, parseImageArray } from '@/lib/service-requests/parsing'
import { createSupabaseFake, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({ from: vi.fn(), create: vi.fn(), getAll: vi.fn() }))

vi.mock('@/lib/db', () => ({
  supabase: { from: mocks.from },
  db: { serviceRequests: { create: mocks.create, getAll: mocks.getAll } },
}))
vi.mock('@/lib/razorpay-route', () => ({
  isHiddenNgoNetworkPaymentChannel: (row: { title?: unknown }) => row.title === 'hidden',
}))

function useDb(responses: Record<string, FakeResult[]> = {}) {
  const fake = createSupabaseFake(responses)
  mocks.from.mockImplementation(fake.from)
  return fake
}

beforeEach(() => {
  mocks.from.mockReset()
  mocks.create.mockReset().mockResolvedValue({ id: 77 })
  mocks.getAll.mockReset()
})

describe('parseImageArray', () => {
  it.each([
    [['a.jpg', ' ', 'b.jpg'], ['a.jpg', 'b.jpg']],
    ['["a.jpg","b.jpg"]', ['a.jpg', 'b.jpg']],
    ['a.jpg, b.jpg\nc.jpg', ['a.jpg', 'b.jpg', 'c.jpg']],
    ['', []],
    [42, []],
    [null, []],
  ])('parses %j', (input, expected) => {
    expect(parseImageArray(input)).toEqual(expected)
  })
})

describe('parseAmount', () => {
  it.each([
    ['₹1,500', 1500],
    [' 2500.5 ', 2500.5],
    [-20, -20],
    ['', null],
    [undefined, null],
    ['1,000-2,000', null],
    ['N/A', 0],
  ])('parses %j as %j', (input, expected) => {
    expect(parseAmount(input)).toBe(expected)
  })
})

describe('isCompanyAssignedNeed', () => {
  it.each([
    [{ project_context: { csr_assignment: { assigned_company_id: 5 } } }, true],
    [{ project_context: '{"assigned_company_id":"9"}' }, true],
    [{ requirements: { csr_assignment: { assigned_company_id: 3 } } }, true],
    [{ project_context: { handoff_to_company: true } }, true],
    [{ project_context: { csr_assignment: { mode: 'company_project_handoff' } } }, true],
    [{ project_context: { csr_assignment: { assigned_company_id: 0 } } }, false],
    [{}, false],
  ])('detects company assignment in %j', (request, expected) => {
    expect(isCompanyAssignedNeed(request)).toBe(expected)
  })
})

describe('isProjectLocked', () => {
  it.each([
    [{ csr_project_available_for_csr: false }, true],
    [{ csr_assignment: { mode: 'company_project_handoff' } }, true],
    [{ csr_assignment: { assigned_company_id: 4 } }, true],
    [{ csr_project_available_for_csr: true }, false],
  ])('locks %j: %s', (projectContext, expected) => {
    expect(isProjectLocked({ project_context: projectContext })).toBe(expected)
  })
})

function listingRow(overrides: Record<string, unknown> = {}): ListingSource {
  return {
    id: 1,
    title: 'Books',
    description: 'Books for the library',
    category: 'Education and Livelihood Enhancement',
    request_type: null,
    requirements: null,
    image_url: null,
    beneficiary_count: null,
    estimated_budget: null,
    impact_description: null,
    status: 'active',
    urgency_level: 'medium',
    project_context: null,
    deadline: null,
    project: null,
    ...overrides,
  } as unknown as ListingSource
}

describe('shapeListingRequest', () => {
  it('derives scores and fields from requirements and the requester', () => {
    const shaped = shapeListingRequest(listingRow({
      urgency_level: 'high',
      requirements: JSON.stringify({ request_type: 'Material Need', images: ['a.jpg', 'b.jpg'], beneficiary_count: 120 }),
      requester: { id: 2, name: 'Asha', email: '', user_type: 'ngo', verification_status: 'verified' },
    }))
    expect(shaped).toMatchObject({
      ngo_name: 'Asha',
      images: ['a.jpg', 'b.jpg'],
      request_type: 'Material Need',
      estimated_budget: 'Not specified',
      beneficiary_count: 120,
      trust_badge_weight: 1,
      verified: true,
      impact_score: 90,
      proof_strength: 20,
      completion_rate: 0,
      project: null,
    })
  })

  it('splits legacy budget/contact/timeline lines out of the description', () => {
    const shaped = shapeListingRequest(listingRow({
      description: 'Need books\nBudget: 5000\nContact: 99999\nTimeline: 3 months',
      requirements: '{"beneficiary_count":10}',
    }))
    expect(shaped.description).toBe('Need books')
    expect(shaped.deadline).toBe('3 months')
    expect(JSON.parse(String(shaped.requirements))).toEqual({
      beneficiary_count: 10,
      budget: '5000',
      contactInfo: '99999',
      timeline: '3 months',
    })
  })

  it('drops auto-filled ISO deadlines', () => {
    expect(shapeListingRequest(listingRow({ deadline: '2026-01-01T00:00:00Z' })).deadline).toBeNull()
  })

  it('falls back to the category for the request type and scores unverified NGOs lower', () => {
    const shaped = shapeListingRequest(listingRow({
      category: 'Financial Need',
      beneficiary_count: 0,
      status: 'completed',
      image_url: 'x.jpg',
    }))
    expect(shaped.request_type).toBe('Financial Need')
    expect(shaped.trust_badge_weight).toBe(0.6)
    expect(shaped.impact_score).toBe(30)
    expect(shaped.completion_rate).toBe(100)
    expect(shapeListingRequest(listingRow()).request_type).toBe('Skill / Service Need')
  })

  it('summarises the project from the project context', () => {
    const shaped = shapeListingRequest(listingRow({
      project_context: { project: { id: 'p1', exact_address: 'Pune' }, project_title: 'Library', project_timeline: '6 months' },
    }))
    expect(shaped.project).toEqual({ id: 'p1', title: 'Library', location: 'Pune', timeline: '6 months', category: '' })
  })
})

describe('listServiceRequests', () => {
  const params: ListingParams = {
    view: 'all',
    userId: null,
    category: null,
    projectId: null,
    search: null,
    location: null,
    requestType: null,
    urgency: null,
  }
  const rows = [
    listingRow({ id: 1, title: 'Books for school', request_type: 'Material Need', target_quantity: 10, current_quantity: 0, volunteers_needed: 2, location: 'Pune' }),
    listingRow({ id: 2, title: 'hidden', request_type: 'Material Need', target_quantity: 10 }),
    listingRow({ id: 3, title: 'Handed off', request_type: 'Material Need', target_quantity: 10, project_context: { csr_assignment: { assigned_company_id: 5 } } }),
    listingRow({ id: 4, title: 'Full', request_type: 'Material Need', target_quantity: 10, volunteers_needed: 1 }),
    listingRow({ id: 5, title: 'Done', request_type: 'Material Need', target_quantity: 10, current_quantity: 10 }),
    listingRow({ id: 6, title: 'Desks', request_type: 'Material Need', target_quantity: 5, location: 'Nagpur' }),
  ]

  function applicationCounts() {
    return { 'service_request_applications.select': [{ data: [] }, { data: [{ id: 1 }] }, { data: [] }, { data: [] }] }
  }

  it('lists only open, unassigned needs with free slots in the browse view', async () => {
    mocks.getAll.mockResolvedValue(rows)
    useDb(applicationCounts())
    const result = await listServiceRequests(params)
    expect(result.map((item) => item.id)).toEqual([1, 6])
  })

  it('applies search and location filters', async () => {
    mocks.getAll.mockResolvedValue(rows)
    useDb(applicationCounts())
    expect((await listServiceRequests({ ...params, location: 'PUNE' })).map((item) => item.id)).toEqual([1])
    mocks.getAll.mockResolvedValue(rows)
    useDb(applicationCounts())
    expect((await listServiceRequests({ ...params, search: 'desks' })).map((item) => item.id)).toEqual([6])
  })

  it('scopes my-requests to the NGO and hides needs taken by a company project', async () => {
    mocks.getAll.mockResolvedValue([rows[0], rows[2], rows[5]])
    useDb({ 'service_request_contributions.select': [{ data: [{ service_request_id: 6 }] }] })
    const result = await listServiceRequests({ ...params, view: 'my-requests', userId: 12, category: 'All Categories' })
    expect(mocks.getAll).toHaveBeenCalledWith({ ngo_id: 12 })
    expect(result.map((item) => item.id)).toEqual([1])
  })
})

describe('createNeed', () => {
  const body: CreateNeedBody = {
    title: 'Books',
    description: 'Library books',
    request_type: 'Material Need',
    project_category: 'Education and Livelihood Enhancement',
    location: ' Pune ',
    timeline: '3 months',
    budget: '₹50,000 - ₹1,00,000',
    contactInfo: '9999999999',
    impact_description: 'Children read more',
    beneficiary_count: 40,
  }

  it.each<[string, Partial<CreateNeedBody>, RegExp]>([
    ['missing contact info', { contactInfo: ' ' }, /Missing required fields/],
    ['missing request type', { request_type: undefined }, /Missing required fields/],
    ['zero beneficiaries', { beneficiary_count: 0 }, /beneficiary_count must be greater than 0/],
    ['unknown request type', { request_type: 'Other' }, /Invalid request_type/],
    ['non Schedule VII category', { project_category: 'Space' }, /Invalid project_category/],
    ['attached project', { projectId: 'p1' }, /Needs are standalone/],
    ['anytime timeline', { timeline: ' Anytime ' }, /cannot be "Anytime"/],
  ])('rejects %s', async (_label, overrides, message) => {
    useDb()
    const result = await createNeed(12, { ...body, ...overrides })
    expect(result).toEqual({ ok: false, status: 400, error: expect.stringMatching(message) })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it.each<[string, CreateNeedBody['beneficiary_count']]>([
    ['non-numeric', 'many'],
    ['fractional', 2.5],
    ['negative', '-3'],
    ['missing', undefined],
  ])('rejects a %s beneficiary count', async (_label, beneficiary_count) => {
    useDb()
    const result = await createNeed(12, { ...body, beneficiary_count })
    expect(result).toEqual({ ok: false, status: 400, error: expect.stringMatching(/beneficiary_count must be greater than 0/) })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('accepts a numeric string beneficiary count', async () => {
    useDb()
    await expect(createNeed(12, { ...body, beneficiary_count: '25' })).resolves.toEqual({ ok: true, id: 77 })
    expect(mocks.create.mock.calls[0][0].beneficiary_count).toBe(25)
  })

  it('rejects selected offers that are not active offers of the matching type', async () => {
    const fake = useDb({ 'service_offers.select': [{ data: [{ id: 5 }] }] })
    const result = await createNeed(12, { ...body, details: { recommended_offer_ids: [5, 6] } })
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/capability offers are invalid/) })
    expect(fake.queries[0].filters).toContainEqual(['eq', 'offer_type', 'material'])
  })

  it('creates a material need with derived progress fields', async () => {
    useDb()
    await expect(createNeed(12, body)).resolves.toEqual({ ok: true, id: 77 })
    const row = mocks.create.mock.calls[0][0]
    expect(row).toMatchObject({
      ngo_id: 12,
      location: 'Pune',
      status: 'active',
      request_type: 'Material Need',
      category: 'Education and Livelihood Enhancement',
      urgency_level: 'low',
      timeline: '3 months',
      target_amount: 100000,
      target_quantity: 40,
      current_quantity: 0,
      remaining_quantity: 40,
      project_id: null,
    })
    expect(JSON.parse(row.requirements)).not.toHaveProperty('funding_target_inr')
  })

  it('records the funding target for financial needs', async () => {
    useDb()
    await createNeed(12, { ...body, request_type: 'Financial Need', target_amount: 25000, current_amount: 5000 })
    const row = mocks.create.mock.calls[0][0]
    expect(JSON.parse(row.requirements).funding_target_inr).toBe(25000)
    expect(row).toMatchObject({ target_amount: 25000, current_amount: 5000, remaining_amount: 20000 })
  })
})
