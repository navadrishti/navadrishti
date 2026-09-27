import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findServiceOffers, InputSchema, type InputSchemaType } from '@/lib/csr-agent/find-service-offers'
import { buildFallbackCampaigns, generateCampaignsInputSchema, type GenerateCampaignsInput } from '@/lib/csr-agent/llm'
import {
  buildRequirementDetails,
  categoryKeywords,
  rankRecommendedNgosForViewer,
  scoreNgoForViewer,
  scoreNgosForCampaign,
  scoreProjectSuggestions,
  tokenize,
  type NetworkNgoCandidate,
} from '@/lib/csr-agent/recommendation-utils'
import { createSupabaseFake, type FakeResult } from './service-supabase-fake'

const mocks = vi.hoisted(() => ({ from: vi.fn(), eligible: vi.fn() }))

vi.mock('@/lib/db', () => ({ supabase: { from: mocks.from }, db: {} }))
vi.mock('@/lib/geminiClient', () => ({ GeminiChat: vi.fn(), GeminiError: class extends Error {} }))
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  ngoIsCsrEligibleForWorkThrough: mocks.eligible,
}))

function useDb(responses: Record<string, FakeResult[]>) {
  const fake = createSupabaseFake(responses)
  mocks.from.mockImplementation(fake.from)
  return fake
}

beforeEach(() => {
  mocks.from.mockReset()
  mocks.eligible.mockReset().mockReturnValue(true)
})

const offerInput = {
  title: 'School library setup',
  description: 'Books and shelves for rural school',
  category: 'Education',
  city: 'Pune',
  state_province: 'Maharashtra',
  budget: 50000,
  start_date: '2026-07-01',
  end_date: '2026-09-30',
  requirementDetails: 'books shelves',
}

describe('find service offers InputSchema', () => {
  it('coerces dates for a valid request', () => {
    const parsed = InputSchema.parse(offerInput)
    expect(parsed.start_date).toBeInstanceOf(Date)
    expect(parsed.budget).toBe(50000)
  })

  it.each([
    ['zero budget', { budget: 0 }, 'budget'],
    ['end before start', { end_date: '2026-06-01' }, 'end_date'],
    ['same start and end', { end_date: '2026-07-01' }, 'end_date'],
    ['missing title', { title: undefined }, 'title'],
  ])('rejects %s', (_label, overrides, path) => {
    const result = InputSchema.safeParse({ ...offerInput, ...overrides })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain(path)
  })
})

describe('findServiceOffers', () => {
  const input: InputSchemaType = InputSchema.parse(offerInput)
  const offers = [
    { id: 1, title: 'Library books kit', impact_area: ['Education'], city: 'Pune', state_province: 'Maharashtra', price_amount: 0, price_type: 'free', tags: ['books'] },
    { id: 2, title: 'Tractor rental', impact_area: ['Rural Development'], city: 'Nagpur', state_province: 'Maharashtra', price_amount: 90000, price_type: 'fixed' },
    { id: 3, title: 'Education volunteers', impact_area: ['Education'], city: 'Pune', valid_until: '2000-01-01' },
    { id: 4, title: 'Education desks', impact_area: ['Education'], city: 'Pune' },
    { id: 5, title: 'Education tablets', impact_area: ['Education'], requirements: JSON.stringify({ csr_rental_lock: { paid_at: '2026-01-01' } }) },
  ]

  it('drops expired, used and paid-locked offers and keeps only strong matches', async () => {
    const fake = useDb({
      'service_offers.select': [{ data: offers }],
      'service_clients.select': [{ data: [{ service_offer_id: 4 }] }],
    })

    const matches = await findServiceOffers(input)

    expect(matches.map((match) => match.service_offer_id)).toEqual([1])
    expect(matches[0]).toMatchObject({ capability_name: 'Library books kit', city: 'Pune', price_type: 'free' })
    expect(matches[0].similarity).toBeLessThanOrEqual(0.95)
    expect(fake.calls[0].filters).toContainEqual(['or', 'price_type.neq.fixed,price_amount.lte.50000'])
    expect(fake.calls[1].filters).toContainEqual(['in', 'service_offer_id', [1, 2, 4, 5]])
  })

  it('ranks local in-category offers above distant ones', async () => {
    useDb({
      'service_offers.select': [{
        data: [
          { id: 7, title: 'Education kits', impact_area: ['Education'], city: 'Delhi', state_province: 'Delhi', price_amount: 0, price_type: 'free' },
          { id: 8, title: 'Education kits', impact_area: ['Education'], city: 'Pune', state_province: 'Maharashtra', price_amount: 0, price_type: 'free' },
        ],
      }],
    })
    const matches = await findServiceOffers(input)
    expect(matches.map((match) => match.service_offer_id)).toEqual([8, 7])
    expect(matches[0].score).toBeGreaterThan(matches[1].score)
  })

  it('returns nothing when no offers are found', async () => {
    useDb({ 'service_offers.select': [{ data: [] }] })
    await expect(findServiceOffers(input)).resolves.toEqual([])
  })

  it('surfaces query errors', async () => {
    useDb({ 'service_offers.select': [{ error: { message: 'boom' } }] })
    await expect(findServiceOffers(input)).rejects.toThrow('Error fetching service offers: boom')
  })
})

describe('recommendation text helpers', () => {
  it('tokenizes into lowercase words longer than two letters', () => {
    expect(tokenize('Build a Rural-School, v2!')).toEqual(['build', 'rural', 'school'])
    expect(tokenize(null)).toEqual([])
  })

  it('expands categories with keyword aliases', () => {
    const keywords = categoryKeywords('Eradicating Hunger, Poverty and Malnutrition')
    expect(keywords).toEqual(expect.arrayContaining(['hunger', 'food', 'nutrition', 'poverty']))
    expect(categoryKeywords('')).toEqual([])
  })

  it.each([
    [{ requirementDetails: '  Solar lamps  ', campaignName: 'X' }, 'Solar lamps'],
    [{ campaignName: 'Light Up', category: 'Rural', city: 'Pune', state: 'MH' }, 'Light Up. Rural. Location: Pune, MH. CSR campaign capability and execution support'],
    [{ city: 'Pune' }, 'Pune. CSR campaign capability and execution support'],
    [{}, 'CSR campaign capability and execution support'],
  ])('builds requirement details from %j', (input, expected) => {
    expect(buildRequirementDetails(input)).toBe(expected)
  })
})

describe('scoreNgosForCampaign', () => {
  const campaign = { campaignName: 'School meals', category: 'hunger', city: 'Pune', state: 'Maharashtra', volunteers_needed: 10, end_date: '2026-12-31' }
  const ngos = [
    { id: 1, name: 'Far NGO', city: 'Delhi', state_province: 'Delhi', verification_status: 'verified', profile_data: {} },
    { id: 2, name: 'Food Bank Pune', city: 'Pune', state_province: 'Maharashtra', verification_status: 'verified', ngo_volunteer_capacity: 20, profile_data: { focus_areas: 'hunger food nutrition' } },
    { id: 3, name: 'State NGO', city: 'Nagpur', state_province: 'maharashtra', verification_status: 'pending', profile_data: {} },
    { id: 4, name: 'Expired CSR-1', city: 'Pune', verification_status: 'verified', profile_data: { csr1_expired: true } },
  ]

  it('excludes NGOs whose CSR-1 does not cover the campaign and ranks by fit', () => {
    mocks.eligible.mockImplementation((_status: unknown, profile: Record<string, unknown>) => !profile.csr1_expired)

    const ranked = scoreNgosForCampaign(ngos, campaign)

    expect(ranked.map((ngo) => ngo.id)).toEqual([2, 1, 3])
    expect(ranked[0]).toMatchObject({ verified: true, ngo_volunteer_capacity: 20 })
    expect(mocks.eligible).toHaveBeenCalledWith('verified', {}, '2026-12-31', { requireWorkEnd: true })
  })

  it('respects the limit', () => {
    expect(scoreNgosForCampaign(ngos, campaign, 2)).toHaveLength(2)
    expect(scoreNgosForCampaign([], campaign)).toEqual([])
  })
})

describe('NGO recommendations for a viewer', () => {
  const candidate: NetworkNgoCandidate = {
    id: 10,
    name: 'Asha',
    city: 'Pune',
    sectors_schedule_vii: ['Education and Livelihood Enhancement'],
    compliance: { verified: true, csr1: true, section_12a: true, section_80g: true },
    projects_completed_count: 3,
  }

  it('gives no score to the viewer themself', () => {
    expect(scoreNgoForViewer(candidate, { id: 10, city: 'Pune' })).toBe(0)
  })

  it('rewards location, focus and CSR compliance for companies', () => {
    const company = scoreNgoForViewer(candidate, { id: 1, user_type: 'company', city: 'pune', profile_data: { focus_areas: ['education'] } })
    const individual = scoreNgoForViewer(candidate, { id: 1, user_type: 'individual', city: 'pune', profile_data: { focus_areas: ['education'] } })
    expect(company).toBeGreaterThan(individual)
    expect(scoreNgoForViewer(candidate, { id: 1, user_type: 'company', city: 'Delhi' })).toBeLessThan(company)
  })

  it('ranks by score then name and drops zero scores', () => {
    const ngos: NetworkNgoCandidate[] = [
      { id: 1, name: 'Zeta', city: 'Pune' },
      { id: 2, name: 'Alpha', city: 'Pune' },
      { id: 3, name: 'Best', city: 'Pune', compliance: { verified: true } },
      { id: 4, name: 'Nowhere', city: 'Delhi' },
    ]
    const ranked = rankRecommendedNgosForViewer(ngos, { city: 'Pune' }, { shuffleTies: false, displaySize: 3 })
    expect(ranked.map((ngo) => ngo.name)).toEqual(['Best', 'Alpha', 'Zeta'])
    expect(ranked[0].match_score).toBe(50)
  })

  it('orders project suggestions by keyword and location overlap', () => {
    const projects = [
      { id: 'a', title: 'Office repaint', location: 'Delhi' },
      { id: 'b', title: 'School meals programme', location: 'Pune, Maharashtra' },
    ]
    expect(scoreProjectSuggestions(projects, { campaignName: 'School meals', city: 'Pune' }).map((project) => project.id)).toEqual(['b', 'a'])
  })
})

describe('generateCampaignsInputSchema', () => {
  const valid = {
    company_id: '12',
    budget: 100000,
    milestones: 2,
    category: 'Education',
    city: 'Pune',
    state_province: 'Maharashtra',
    start_date: '2026-07-01',
    end_date: '2026-12-31',
  }

  it('accepts a complete request', () => {
    expect(generateCampaignsInputSchema.safeParse(valid).success).toBe(true)
  })

  it.each([
    ['no milestones', { milestones: 0 }],
    ['too many milestones', { milestones: 11 }],
    ['fractional milestones', { milestones: 1.5 }],
    ['negative budget', { budget: -1 }],
    ['empty company', { company_id: '' }],
    ['milestone without budget', { milestone_info: [{ description: 'Phase 1', budget_allocated: 0 }] }],
  ])('rejects %s', (_label, overrides) => {
    expect(generateCampaignsInputSchema.safeParse({ ...valid, ...overrides }).success).toBe(false)
  })
})

describe('buildFallbackCampaigns', () => {
  const input: GenerateCampaignsInput = {
    company_id: '12',
    budget: 100000,
    milestones: 2,
    category: 'Education',
    city: 'Pune',
    state_province: 'Maharashtra',
    start_date: '2026-07-01',
    end_date: '2026-12-31',
    milestone_info: [
      { title: 'Build', description: 'Build classrooms', budget_allocated: 30000 },
      { description: 'Train teachers', budget_allocated: 10000 },
      { description: 'Ignored third', budget_allocated: 5000 },
    ],
  }

  it('drafts three campaigns whose budgets add up', () => {
    const campaigns = buildFallbackCampaigns(input)
    expect(campaigns.map((campaign) => campaign.title)).toEqual([
      'Infrastructure-first Education Program 1',
      'Capability-first Education Program 2',
      'Access-first Education Program 3',
    ])
    for (const campaign of campaigns) {
      expect(campaign.location).toBe('Pune, Maharashtra')
      const breakdown = Object.values(campaign.budget_breakdown).reduce((sum, value) => sum + value, 0)
      expect(breakdown).toBe(100000)
      expect(campaign.milestones.reduce((sum, milestone) => sum + milestone.budget_allocated, 0)).toBe(100000)
    }
    expect(campaigns[0].budget_breakdown).toEqual({ infrastructure: 45000, training: 15000, materials: 20000, monitoring: 12000, contingency: 8000 })
  })

  it('scales user milestone budgets for the direct plan and splits evenly otherwise', () => {
    const [direct, capacity] = buildFallbackCampaigns(input)
    expect(direct.milestones.map((milestone) => milestone.budget_allocated)).toEqual([75000, 25000])
    expect(capacity.milestones.map((milestone) => milestone.budget_allocated)).toEqual([50000, 50000])
    expect(direct.milestones.map((milestone) => milestone.title)).toEqual(['Build', 'Milestone 2: Execution'])
    expect(capacity.milestones[1].description).toBe('Train local stakeholders and institutions in Pune, Maharashtra to operationalize: Train teachers')
  })

  it('creates default milestones and a minimum beneficiary estimate', () => {
    const campaigns = buildFallbackCampaigns({ ...input, milestone_info: undefined, milestones: 3, budget: 10001 })
    expect(campaigns[0].milestones).toHaveLength(3)
    expect(campaigns[0].milestones[0].description).toBe('Phase 1 implementation for community impact')
    expect(campaigns[0].milestones.map((milestone) => milestone.budget_allocated)).toEqual([3334, 3334, 3333])
    expect(campaigns.map((campaign) => campaign.impact_metrics.beneficiaries)).toEqual([50, 50, 52])
  })
})
