import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { autoRejectExpiredServiceOffers } from '@/lib/admin-offer-automation'
import { canIndividualApplyToNeed, getActiveInfrastructureVolunteerApplication } from '@/lib/infrastructure-assignment-lock'
import { createSupabaseFake, type FakeResult } from './service-supabase-fake'

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
  const offers = [
    { id: 1, title: 'Desks', organization: { name: 'Asha', email: 'asha@example.org' } },
    { id: 2, title: 'Tablets', organization: { name: 'Bodhi', email: 'bodhi@example.org' } },
    { id: 3, title: 'Tutors', organization: null },
  ]

  it('rejects offers pending for more than five days', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-10T00:00:00Z'))
    const fake = useDb({
      'service_offers.select': [{ data: offers }],
      'service_offers.update': [{}, { error: { message: 'locked' } }, {}],
    })

    const result = await autoRejectExpiredServiceOffers()

    expect(result).toEqual({
      rejectedCount: 2,
      rejectedOffers: [
        { id: 1, title: 'Desks', organization: 'Asha' },
        { id: 3, title: 'Tutors', organization: null },
      ],
    })
    expect(fake.calls[0].filters).toContainEqual(['eq', 'admin_status', 'pending'])
    expect(fake.calls[0].filters).toContainEqual(['lt', 'submitted_for_review_at', '2026-06-05T00:00:00.000Z'])
    expect(fake.writes('service_offers')[0].payload).toMatchObject({ admin_status: 'rejected' })
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)
    expect(mocks.sendEmail.mock.calls[0][0]).toMatchObject({ to: 'asha@example.org' })
  })

  it('keeps going when a notification email fails', async () => {
    useDb({ 'service_offers.select': [{ data: [offers[0]] }] })
    mocks.sendEmail.mockRejectedValue(new Error('smtp down'))
    await expect(autoRejectExpiredServiceOffers()).resolves.toMatchObject({ rejectedCount: 1 })
  })

  it('throws when pending offers cannot be loaded', async () => {
    useDb({ 'service_offers.select': [{ error: { message: 'boom' } }] })
    await expect(autoRejectExpiredServiceOffers()).rejects.toEqual({ message: 'boom' })
  })

  it('escapes the offer title and organization name in the rejection email', async () => {
    useDb({ 'service_offers.select': [{ data: [{ id: 9, title: '<img src=x onerror=alert(1)>', organization: { name: 'Asha & <b>Co</b>', email: 'a@example.org' } }] }] })
    await autoRejectExpiredServiceOffers()
    const { html } = mocks.sendEmail.mock.calls[0][0]
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('Asha &amp; &lt;b&gt;Co&lt;/b&gt;')
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
    expect(fake.calls[0].filters).toContainEqual(['eq', 'applicant_user_id', 7])
    expect(fake.calls[0].filters).toContainEqual(['in', 'status', ['accepted', 'active']])
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
