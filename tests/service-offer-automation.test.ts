import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { autoRejectExpiredServiceOffers } from '@/lib/admin-offer-automation'
import { canIndividualApplyToNeed, getActiveInfrastructureVolunteerApplication } from '@/lib/infrastructure-assignment-lock'
import { createSupabaseFake, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({ from: vi.fn(), sendEmail: vi.fn() }))

vi.mock('@/lib/db', () => ({ supabase: { from: mocks.from }, db: {} }))
vi.mock('@/lib/email', async (importOriginal) => ({
  escapeHtml: (await importOriginal<typeof import('@/lib/email')>()).escapeHtml,
  emailService: { sendEmail: mocks.sendEmail },
}))

function useDb(responses: Record<string, FakeResult[]>) {
  const fake = createSupabaseFake(responses)
  mocks.from.mockImplementation(fake.from)
  return fake
}

beforeEach(() => {
  mocks.from.mockReset()
  mocks.sendEmail.mockReset().mockResolvedValue({ success: true })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('autoRejectExpiredServiceOffers', () => {
  it('does not auto-reject pending capability offers', async () => {
    const result = await autoRejectExpiredServiceOffers()
    expect(result).toEqual({ rejectedCount: 0, rejectedOffers: [] })
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })
})

describe('infrastructure assignment lock', () => {
  const applications = [
    { id: 1, request: { status: 'completed', request_type: 'Infrastructure Project', title: 'Old hall' } },
    { id: 2, request: [{ status: 'active', request_type: 'Material Need', title: 'Books' }] },
    { id: 3, request: { status: 'active', category: 'Infrastructure Project', title: 'School roof' } },
  ]

  it('finds the open infrastructure assignment', async () => {
    const fake = useDb({ 'service_request_applications.select': [{ data: applications }] })
    await expect(getActiveInfrastructureVolunteerApplication(7)).resolves.toMatchObject({ id: 3 })
    expect(fake.queries[0].filters).toContainEqual(['eq', 'applicant_user_id', 7])
    expect(fake.queries[0].filters).toContainEqual(['in', 'status', ['accepted', 'active']])
  })

  it('returns null when no infrastructure work is open', async () => {
    useDb({ 'service_request_applications.select': [{ data: applications.slice(0, 2) }] })
    await expect(getActiveInfrastructureVolunteerApplication(7)).resolves.toBeNull()
  })

  it('blocks other needs while an infrastructure assignment is open', async () => {
    useDb({ 'service_request_applications.select': [{ data: applications }] })
    const result = await canIndividualApplyToNeed(7, { request_type: 'Skill / Service Need' })
    expect(result).toEqual({
      allowed: false,
      reason: expect.stringContaining('School roof'),
      blockingApplicationId: 3,
    })
  })

  it('does not check the lock when applying to an infrastructure need', async () => {
    useDb({})
    await expect(canIndividualApplyToNeed(7, { request_type: 'Infrastructure Project' })).resolves.toEqual({
      allowed: true,
      reason: null,
      blockingApplicationId: null,
    })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('surfaces lookup errors', async () => {
    useDb({ 'service_request_applications.select': [{ error: new Error('db down') }] })
    await expect(canIndividualApplyToNeed(7, { request_type: 'Material Need' })).rejects.toThrow('db down')
  })
})
