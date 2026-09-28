import { describe, expect, it } from 'vitest'
import type { CsrCapabilityRentalRecord } from '@/lib/service-engagement'
import {
  acceptedLeadNgoFromRemote,
  buildPreviewMilestoneDrafts,
  buildSuggestedMilestoneSets,
  describeRentalReservation,
  getUserInitials,
  isPendingLeadInvite,
  isQuestionnaireCompleteFor,
  leadInvitesFromRemote,
  normalizePreviewMilestones,
  readStoredSessionPayload,
  sortSessionsByRecency,
  upsertSession,
} from '@/app/companies/csr-agent/helpers'
import { buildPublishCampaignBody, campaignRowToDraft } from '@/app/companies/csr-agent/api'
import { buildEmptySession, parseMoneyValue, type GeneratedCampaign } from '@/app/companies/csr-agent/session'

const invite = (ngo_id: number, status: string) => ({ ngo_id, name: `NGO ${ngo_id}`, email: `${ngo_id}@ngo.org`, status })

describe('leadInvitesFromRemote', () => {
  it('returns only what the server sent', () => {
    expect(leadInvitesFromRemote({ invites: [] })).toEqual([])
    expect(leadInvitesFromRemote({})).toEqual([])
    expect(leadInvitesFromRemote({ invites: [invite(5, 'INVITED')] })).toEqual([
      { ngoId: 5, name: 'NGO 5', email: '5@ngo.org', status: 'invited' },
    ])
  })

  it('drops rejected and invalid invites', () => {
    const invites = leadInvitesFromRemote({ invites: [invite(5, 'rejected'), invite(0, 'invited'), invite(6, '')] })
    expect(invites).toEqual([{ ngoId: 6, name: 'NGO 6', email: '6@ngo.org', status: 'invited' }])
  })

  it('marks the accepted lead and expires the pending rest', () => {
    const invites = leadInvitesFromRemote({
      leadNgoAccepted: true,
      selectedLeadNgoId: 6,
      selectedLeadNgoName: 'Lead NGO',
      invites: [invite(5, 'invited'), invite(6, 'invited'), invite(7, 'pending'), invite(8, 'expired')],
    })
    expect(invites.map((row) => [row.ngoId, row.status, row.name])).toEqual([
      [5, 'expired', 'NGO 5'],
      [6, 'accepted', 'Lead NGO'],
      [7, 'expired', 'NGO 7'],
      [8, 'expired', 'NGO 8'],
    ])
  })

  it('adds the accepted lead when it is missing from the list', () => {
    const invites = leadInvitesFromRemote({ leadNgoAccepted: true, selectedLeadNgoId: 9, invites: [invite(5, 'invited')] })
    expect(invites).toEqual([
      { ngoId: 5, name: 'NGO 5', email: '5@ngo.org', status: 'expired' },
      { ngoId: 9, name: '', email: '', status: 'accepted' },
    ])
  })

  it('ignores a selected lead that has not accepted', () => {
    const invites = leadInvitesFromRemote({ leadNgoAccepted: false, selectedLeadNgoId: 6, invites: [invite(6, 'invited')] })
    expect(invites[0].status).toBe('invited')
  })
})

describe('acceptedLeadNgoFromRemote', () => {
  it.each([
    [{ leadNgoAccepted: true, selectedLeadNgoId: 0 }],
    [{ leadNgoAccepted: false, selectedLeadNgoId: 4 }],
    [{ leadNgoAccepted: true, selectedLeadNgoId: null }],
  ])('returns null for %j', (state) => {
    expect(acceptedLeadNgoFromRemote(state)).toBeNull()
  })

  it('builds the accepted invite', () => {
    expect(acceptedLeadNgoFromRemote({ leadNgoAccepted: true, selectedLeadNgoId: 4, selectedLeadNgoEmail: 'a@b.org' })).toEqual({
      ngoId: 4,
      name: '',
      email: 'a@b.org',
      status: 'accepted',
    })
  })
})

describe('isPendingLeadInvite', () => {
  it.each([
    [undefined, true],
    ['invited', true],
    ['pending', true],
    ['accepted', false],
    ['expired', false],
    ['rejected', false],
  ] as const)('%s pending: %s', (status, expected) => {
    expect(isPendingLeadInvite({ ngoId: 1, name: '', email: '', status })).toBe(expected)
  })
})

describe('session helpers', () => {
  it('gets initials', () => {
    expect(getUserInitials('asha rao kumar')).toBe('AR')
    expect(getUserInitials('  ')).toBe('U')
    expect(getUserInitials(undefined)).toBe('U')
  })

  it('upserts and sorts sessions', () => {
    const older = { ...buildEmptySession(), id: 'a', updatedAt: '2026-01-01T00:00:00Z' }
    const newer = { ...buildEmptySession(), id: 'b', updatedAt: '2026-02-01T00:00:00Z' }
    expect(upsertSession([older], newer).map((s) => s.id)).toEqual(['b', 'a'])
    expect(upsertSession([older, newer], { ...older, title: 'Renamed' }).map((s) => s.title)).toEqual(['Renamed', newer.title])
    expect(sortSessionsByRecency([older, newer]).map((s) => s.id)).toEqual(['b', 'a'])
  })

  it('reads stored payloads defensively', () => {
    expect(readStoredSessionPayload(null)).toBeNull()
    expect(readStoredSessionPayload('{not json')).toBeNull()
    expect(readStoredSessionPayload('{"foo":1}')).toBeNull()
    expect(readStoredSessionPayload('[{"id":"s1"}]')).toEqual({ sessions: [{ id: 's1' }], activeSessionId: 's1' })
  })
})

describe('questionnaire and milestones', () => {
  const projectData = {
    category: 'Health',
    city: 'Pune',
    state: 'Maharashtra',
    budget: '90000',
    startDate: '2026-03-01',
    endDate: '2026-03-30',
  }

  it('requires every project field and milestone', () => {
    const milestones = [{ description: 'Build', budgetTarget: '1000' }]
    expect(isQuestionnaireCompleteFor(projectData, 1, milestones)).toBe(true)
    expect(isQuestionnaireCompleteFor({ ...projectData, city: '' }, 1, milestones)).toBe(false)
    expect(isQuestionnaireCompleteFor(projectData, 2, milestones)).toBe(false)
    expect(isQuestionnaireCompleteFor(projectData, null, milestones)).toBe(false)
    expect(isQuestionnaireCompleteFor(projectData, 1, [{ description: ' ', budgetTarget: '1000' }])).toBe(false)
  })

  it('suggests milestone sets that cover the budget and timeline', () => {
    const sets = buildSuggestedMilestoneSets(projectData)
    expect(sets.map((set) => set.milestones.length)).toEqual([3, 5, 8])
    for (const set of sets) {
      const total = set.milestones.reduce((sum, m) => sum + (parseMoneyValue(m.budgetTarget) || 0), 0)
      expect(total).toBe(90000)
      expect(set.milestones[0].startDate).toBe('2026-03-01')
      expect(set.milestones.at(-1)?.endDate).toBe('2026-03-30')
    }
  })

  it('builds preview drafts', () => {
    expect(buildPreviewMilestoneDrafts([], 2).drafts).toHaveLength(2)
    expect(buildPreviewMilestoneDrafts([], null)).toEqual({ count: 1, drafts: [{ title: '', description: '', budgetTarget: '' }] })
    expect(buildPreviewMilestoneDrafts([{ description: 'x', budgetTarget: '5', start_date: '2026-01-01' }], 1).drafts[0].startDate).toBe(
      '2026-01-01'
    )
  })

  it('clamps preview milestone count', () => {
    expect(normalizePreviewMilestones(50, [], {})).toMatchObject({ count: 10 })
    expect(normalizePreviewMilestones(0, [], {})).toMatchObject({ count: 1 })
  })

  it.each([
    [[{ description: '', budgetTarget: 'lots' }], {}, 'Milestone 1 has an invalid budget. Please fix it in preview.'],
    [[{ description: '', budgetTarget: '', startDate: '2026-03-01' }], {}, 'Milestone 1 must have both start and end dates.'],
    [
      [{ description: '', budgetTarget: '', startDate: '2026-03-10', endDate: '2026-03-01' }],
      {},
      'Milestone 1 has invalid start/end dates.',
    ],
    [
      [{ description: '', budgetTarget: '', startDate: '2026-03-02', endDate: '2026-03-30' }],
      projectData,
      'First milestone must start on the project start date.',
    ],
    [
      [{ description: '', budgetTarget: '', startDate: '2026-03-01', endDate: '2026-03-29' }],
      projectData,
      'Last milestone must end on the project end date.',
    ],
  ])('rejects %j', (drafts, project, error) => {
    expect(normalizePreviewMilestones(drafts.length, drafts, project)).toEqual({ error })
  })

  it('rejects overlapping milestones', () => {
    const drafts = [
      { description: '', budgetTarget: '', startDate: '2026-03-01', endDate: '2026-03-15' },
      { description: '', budgetTarget: '', startDate: '2026-03-15', endDate: '2026-03-30' },
    ]
    expect(normalizePreviewMilestones(2, drafts, projectData)).toEqual({
      error: 'Milestone 2 must start after the previous milestone ends.',
    })
  })

  it('normalizes valid milestones', () => {
    const drafts = [
      { description: 'a', budgetTarget: 'INR 1,000', startDate: '01/03/2026', endDate: '2026-03-15' },
      { description: 'b', budgetTarget: '2000', startDate: '2026-03-16', endDate: '2026-03-30' },
    ]
    const result = normalizePreviewMilestones(2, drafts, projectData)
    expect(result).toMatchObject({
      count: 2,
      milestones: [
        { budgetTarget: '1000', startDate: '2026-03-01' },
        { budgetTarget: '2000', endDate: '2026-03-30' },
      ],
    })
  })
})

describe('describeRentalReservation', () => {
  const rental = (outbound: Record<string, unknown> | null) =>
    ({ outbound_delivery: outbound }) as unknown as CsrCapabilityRentalRecord

  it('describes the delivery state', () => {
    expect(describeRentalReservation(3, rental({ tracking_id: 'AWB1' }))).toContain('AWB AWB1')
    expect(describeRentalReservation(3, rental({ booking_error: 'No pincode' }))).toContain('needs attention: No pincode')
    expect(describeRentalReservation(3, null)).toContain('being scheduled')
  })
})

describe('csr agent api helpers', () => {
  it('maps a campaign row to a draft', () => {
    expect(
      campaignRowToDraft({
        id: 1,
        cause: 'Health',
        region: 'Pune',
        budget_inr: '5000',
        impact_metrics: { beneficiaries: '20' },
        sdg_alignment: 'bad',
      })
    ).toMatchObject({
      title: 'Health',
      category: 'Health',
      location: 'Pune',
      schedule_vii: 'Health',
      budget_inr: 5000,
      sdg_alignment: [],
      milestones: [],
      impact_metrics: { beneficiaries: 20, duration: 'Flexible timeline' },
    })
  })

  it('builds the publish body with invites and beneficiaries', () => {
    const draft: GeneratedCampaign = {
      title: 'T',
      description: 'D',
      category: 'Health',
      location: 'Pune',
      budget_inr: 1000,
      budget_breakdown: { infrastructure: 0, training: 0, materials: 0, monitoring: 0, contingency: 0 },
      schedule_vii: 'Health',
      sdg_alignment: [3],
      start_date: '2026-03-01',
      end_date: '2026-03-30',
      impact_metrics: { beneficiaries: 5, duration: '1 month' },
      milestones: [],
    }
    const lead = { ngoId: 6, name: 'Lead', email: 'l@ngo.org', status: 'accepted' as const }
    const body = buildPublishCampaignBody(draft, {
      sessionId: 's1',
      leadNgoInvites: [lead, { ngoId: 5, name: 'Other', email: 'o@ngo.org', status: 'expired' }],
      acceptedLeadNgo: lead,
      invitedOfferIds: [11],
      volunteerRequirement: '10',
      selectedProjectSuggestionId: 'p1',
      projectSuggestions: [{ id: 'p1', title: 'P', description: '', location: '', expected_beneficiaries: 250 }],
    })
    expect(body.impact_metrics).toMatchObject({
      csr_agent_session_id: 's1',
      lead_ngo_accepted: true,
      invited_offer_ids: [11],
      beneficiaries: 250,
      selected_existing_project_id: 'p1',
    })
    expect(body.impact_metrics.lead_ngo_invites.map((row) => [row.ngo_id, row.status])).toEqual([
      [6, 'accepted'],
      [5, 'expired'],
    ])
  })
})
