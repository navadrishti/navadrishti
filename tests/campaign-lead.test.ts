import { describe, expect, it } from 'vitest'
import {
  filterVolunteerApplicationsExcludingLeadNgo,
  getCampaignLeadNgoId,
  isCampaignLeadNgo,
  isCampaignVolunteerApplicant,
  parseLeadNgoInvites,
} from '@/lib/campaign-volunteer-attendance'

const campaign = {
  lead_ngo_user_id: 12,
  impact_metrics: {
    volunteer_applications: [{ user_id: 12 }, { user_id: 30 }, { user_id: 31 }],
  },
}

describe('campaign lead NGO', () => {
  it('reads the lead from lead_ngo_user_id', () => {
    expect(getCampaignLeadNgoId(campaign)).toBe(12)
    expect(getCampaignLeadNgoId({ lead_ngo_user_id: '12' })).toBe(12)
    expect(getCampaignLeadNgoId({ lead_ngo_user_id: null })).toBe(0)
    expect(getCampaignLeadNgoId(null)).toBe(0)
  })

  it('ignores the old impact_metrics copy', () => {
    expect(getCampaignLeadNgoId({ impact_metrics: { selected_lead_ngo_id: 12 } })).toBe(0)
  })

  it('does not count the lead NGO as a volunteer', () => {
    expect(isCampaignLeadNgo(campaign, 12)).toBe(true)
    expect(isCampaignVolunteerApplicant(campaign, 12)).toBe(false)
    expect(isCampaignVolunteerApplicant(campaign, 30)).toBe(true)
    expect(isCampaignVolunteerApplicant(campaign, 99)).toBe(false)
  })

  it('drops the lead from the volunteer list', () => {
    const userIds = filterVolunteerApplicationsExcludingLeadNgo(campaign).map((entry) => entry.user_id)
    expect(userIds).toEqual([30, 31])
  })
})

describe('parseLeadNgoInvites', () => {
  it('normalises old camelCase invites and drops rows without an NGO', () => {
    expect(
      parseLeadNgoInvites([
        { ngoId: '5', name: 'Seva Trust', status: 'INVITED', invitedAt: '2026-01-02' },
        { ngo_id: 6, email: 'a@b.org' },
        { name: 'missing id' },
        'garbage',
      ])
    ).toEqual([
      { ngo_id: 5, name: 'Seva Trust', email: '', status: 'invited', invited_at: '2026-01-02' },
      { ngo_id: 6, name: '', email: 'a@b.org', status: 'invited', invited_at: undefined },
    ])
  })

  it('returns an empty list for non-arrays', () => {
    expect(parseLeadNgoInvites(undefined)).toEqual([])
    expect(parseLeadNgoInvites({})).toEqual([])
  })
})
