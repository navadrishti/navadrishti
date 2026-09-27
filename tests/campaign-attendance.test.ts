import { describe, expect, it } from 'vitest'
import {
  CAMPAIGN_VOLUNTEER_ENGAGEMENT_KIND,
  filterCampaignVolunteerAssignments,
  getElapsedCampaignDays,
  getInclusiveDayCount,
  getVolunteerApplicationForUser,
  isCampaignVolunteerAssignment,
  isVolunteeringBanned,
} from '@/lib/campaign-volunteer-attendance'
import { formatLeadNgoInviteStatusLabel, isRemovableLeadInviteStatus } from '@/app/companies/dashboard/format'

describe('campaign volunteer assignments', () => {
  it.each([
    [{ target_type: 'campaign' }, true],
    [{ target_type: 'csr_project', meta: { engagement_kind: CAMPAIGN_VOLUNTEER_ENGAGEMENT_KIND } }, true],
    [{ target_type: 'csr_project', meta: JSON.stringify({ engagement_kind: 'campaign_volunteer' }) }, true],
    [{ target_type: 'csr_project', meta: { engagement_kind: 'other' } }, false],
    [{ target_type: 'service_request', meta: { engagement_kind: 'campaign_volunteer' } }, false],
    [null, false],
  ])('%j is campaign volunteer: %s', (assignment, expected) => {
    expect(isCampaignVolunteerAssignment(assignment)).toBe(expected)
  })

  it('filters rows', () => {
    const rows = [{ target_type: 'campaign', id: 1 }, { target_type: 'service_request', id: 2 }]
    expect(filterCampaignVolunteerAssignments(rows).map((row) => row.id)).toEqual([1])
    expect(filterCampaignVolunteerAssignments(null)).toEqual([])
  })

  it('finds a volunteer application by user id', () => {
    const impact = { volunteer_applications: [{ user_id: '30', name: 'A' }, { user_id: 31 }] }
    expect(getVolunteerApplicationForUser(impact, 30)).toEqual({ user_id: '30', name: 'A' })
    expect(getVolunteerApplicationForUser(impact, 99)).toBeNull()
    expect(getVolunteerApplicationForUser({ volunteer_applications: 'bad' }, 30)).toBeNull()
  })
})

describe('campaign day counts', () => {
  it.each([
    ['2026-01-01', '2026-01-01', 1],
    ['2026-01-01', '2026-01-10', 10],
    ['2026-01-01T12:00:00Z', '2026-01-03T00:00:00Z', 3],
    ['2026-01-10', '2026-01-01', 0],
    ['bad', '2026-01-01', 0],
    [null, '2026-01-01', 0],
  ])('inclusive days %s..%s = %i', (start, end, expected) => {
    expect(getInclusiveDayCount(start, end)).toBe(expected)
  })

  it('counts elapsed days up to today or the end date', () => {
    const reference = new Date(2026, 0, 5, 15)
    expect(getElapsedCampaignDays('2026-01-01', '2026-01-10', reference)).toBe(5)
    expect(getElapsedCampaignDays('2026-01-01', '2026-01-03', reference)).toBe(3)
    expect(getElapsedCampaignDays('2026-02-01', '2026-02-10', reference)).toBe(0)
    expect(getElapsedCampaignDays('2026-01-01', null, reference)).toBe(0)
  })
})

describe('isVolunteeringBanned', () => {
  it('reads the ban from profile data', () => {
    expect(isVolunteeringBanned({ volunteering_ban: { banned: true, reason: 'No show', campaign_id: 9 } })).toEqual({
      banned: true,
      reason: 'No show',
      campaignId: '9',
    })
    expect(isVolunteeringBanned(JSON.stringify({ volunteering_ban: { active: true } }))).toEqual({
      banned: true,
      reason: 'Banned from CSR volunteering',
      campaignId: undefined,
    })
  })

  it.each([[null], [{}], [{ volunteering_ban: { banned: 'true' } }], [{ volunteering_ban: { banned: false } }]])(
    'not banned for %j',
    (profile) => {
      expect(isVolunteeringBanned(profile)).toEqual({ banned: false })
    }
  )
})

describe('lead invite status formatting', () => {
  it.each([
    ['pending', true],
    ['INVITED', true],
    [' offered ', true],
    ['assigned', false],
    ['accepted', false],
    ['expired', false],
    ['', false],
  ])('%s removable: %s', (status, expected) => {
    expect(isRemovableLeadInviteStatus(status)).toBe(expected)
  })

  it('labels actionable statuses as pending', () => {
    expect(formatLeadNgoInviteStatusLabel('awaiting_acceptance')).toBe('Pending')
    expect(formatLeadNgoInviteStatusLabel('assigned')).toBe('Pending')
    expect(formatLeadNgoInviteStatusLabel('accepted')).not.toBe('Pending')
  })
})
