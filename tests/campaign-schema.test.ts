import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildCampaignWritePayload,
  getVolunteerApplicationCapacity,
  getVolunteerButtonState,
  isVolunteerCapacityFullForUser,
  readCampaignCategory,
  readCampaignDuration,
  readCampaignLocation,
  resolveAppOrigin,
  resolveCampaignCategoryInput,
  resolveCampaignLocationInput,
  sumVolunteerApplicationCount,
} from '@/lib/campaign-schema'

describe('campaign readers', () => {
  it('falls back through category aliases', () => {
    expect(readCampaignCategory({ category: ' Health ', schedule_vii: 'Education' })).toBe('Health')
    expect(readCampaignCategory({ schedule_vii: 'Education', cause: 'Water' })).toBe('Education')
    expect(readCampaignCategory({ cause: 'Water' })).toBe('Water')
    expect(readCampaignCategory(null)).toBe('')
  })

  it('reads location and duration', () => {
    expect(readCampaignLocation({ region: 'Pune' })).toBe('Pune')
    expect(readCampaignLocation(undefined)).toBe('')
    expect(readCampaignDuration({ impact_metrics: { duration: ' 6 months ' } })).toBe('6 months')
    expect(readCampaignDuration({ impact_metrics: 'bad' })).toBe('')
    expect(readCampaignDuration(null)).toBe('')
  })

  it('resolves body aliases', () => {
    expect(resolveCampaignCategoryInput({ cause: 'Water', schedule_vii: 'Health' })).toBe('Water')
    expect(resolveCampaignLocationInput({ region: ' Goa ' })).toBe('Goa')
    expect(resolveCampaignLocationInput({})).toBe('')
  })
})

describe('buildCampaignWritePayload', () => {
  it('fills defaults for missing fields', () => {
    expect(buildCampaignWritePayload({ title: 'Clean water' }, 7)).toEqual({
      company_id: 7,
      title: 'Clean water',
      description: null,
      category: '',
      location: '',
      budget_inr: null,
      budget_breakdown: {},
      schedule_vii: null,
      sdg_alignment: [],
      impact_metrics: {},
      milestones: [],
      start_date: null,
      end_date: null,
      status: 'draft',
    })
  })

  it('uses category as schedule_vii', () => {
    const payload = buildCampaignWritePayload({ title: 'T', cause: 'Health', region: 'Pune' }, 7)
    expect(payload).toMatchObject({ category: 'Health', location: 'Pune', schedule_vii: 'Health' })
  })

  it('always creates drafts', () => {
    expect(buildCampaignWritePayload({ title: 'T', status: 'active' }, 7).status).toBe('draft')
  })

  it('keeps only client-editable impact metrics', () => {
    const payload = buildCampaignWritePayload({
      title: 'T',
      impact_metrics: {
        beneficiaries: 50,
        duration: '6 months',
        volunteer_requirement: '10',
        lead_ngo_accepted: true,
        lead_ngo_user_id: 9,
        csr_capability_rentals: [{ id: 'x' }],
        volunteer_applications: [{ user_id: 1 }],
        invited_offer_ids: [4],
        published_at: '2026-01-01',
        csr_agent_session_id: 's1',
      },
    }, 7)
    expect(payload.impact_metrics).toEqual({ beneficiaries: 50, duration: '6 months', volunteer_requirement: '10' })
  })
})

describe('resolveAppOrigin', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const request = (headers: Record<string, string>) => ({ headers: new Headers(headers) })

  it('prefers the configured app url without trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://navadrishti.org/')
    expect(resolveAppOrigin(request({ host: 'evil.test' }))).toBe('https://navadrishti.org')
  })

  it('falls back to forwarded headers, then localhost', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    vi.stubEnv('APP_URL', '')
    expect(resolveAppOrigin(request({ 'x-forwarded-host': 'a.test', 'x-forwarded-proto': 'https' }))).toBe('https://a.test')
    expect(resolveAppOrigin(request({ host: 'b.test' }))).toBe('http://b.test')
    expect(resolveAppOrigin(request({}))).toBe('http://localhost:3000')
  })
})

describe('volunteer capacity', () => {
  it.each([
    ['individual', { ngo_volunteer_capacity: 40 }, 1],
    ['ngo', { ngo_volunteer_capacity: 40 }, 40],
    ['ngo', { profile_data: { team_strength: '12' } }, 12],
    ['ngo', { profile_data: '{"size": 5}' }, 5],
    ['ngo', { ngo_volunteer_capacity: -3 }, 1],
    ['ngo', { profile_data: { size: 'lots' } }, 1],
    ['ngo', null, 1],
  ])('capacity for %s %j is %i', (userType, user, expected) => {
    expect(getVolunteerApplicationCapacity(userType, user)).toBe(expected)
  })

  it('sums capacities and treats bad values as one', () => {
    expect(sumVolunteerApplicationCount([{ capacity: 10 }, { size: 3 }, { ngo_capacity: 2 }, {}, { capacity: -1 }])).toBe(17)
    expect(sumVolunteerApplicationCount(null)).toBe(0)
  })

  it.each([
    ['individual', 5, 5, true],
    ['individual', 4, 5, false],
    ['NGO', 50, 5, false],
    ['individual', 100, 0, false],
    [null, 5, 5, true],
  ])('full for %s at %i/%i is %s', (userType, count, limit, expected) => {
    expect(isVolunteerCapacityFullForUser(userType, count, limit)).toBe(expected)
  })
})

describe('getVolunteerButtonState', () => {
  const base = { allVerified: true, applied: false, applying: false, status: 'active' }

  it.each([
    [{ applied: true }, false, 'Applied'],
    [{ applying: true }, false, 'Applying...'],
    [{ allVerified: false }, false, 'Verify to apply'],
    [{ status: 'Completed' }, false, 'Closed'],
    [{ status: 'cancelled' }, false, 'Closed'],
    [{ isCampaignStarted: () => true }, false, 'Closed'],
    [{ isVolunteerRegistrationPastDeadline: () => true }, false, 'Closed'],
    [{ status: 'draft' }, false, 'Not open yet'],
    [{ status: 'draft', leadNgoAccepted: true }, true, 'Volunteer'],
    [{ volunteerCount: 5, volunteerLimit: 5, userType: 'individual' }, false, 'Full'],
    [{ volunteerCount: 5, volunteerLimit: 5, userType: 'ngo' }, true, 'Volunteer'],
    [{}, true, 'Volunteer'],
  ])('%j gives canApply=%s label=%s', (overrides, canApply, label) => {
    expect(getVolunteerButtonState({ ...base, ...overrides })).toEqual({ canApply, label })
  })
})
