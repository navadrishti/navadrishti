import { describe, expect, it } from 'vitest'
import {
  applyProjectSuggestion,
  buildManualCampaignBody,
  campaignDurationLabel,
  campaignRowToManualForm,
  createEmptyCampaignForm,
  isCampaignDraftUpdateSuccess,
  readManualCampaignExtras,
  validateManualCampaign,
  withMilestoneCount,
} from '@/app/csr-campaigns/create/helpers'

const completeForm = {
  ...createEmptyCampaignForm(),
  campaignName: 'Rural school kits',
  requirementDetails: 'Deliver school kits to 300 students in Gadchiroli this quarter.',
  category: 'Education and Livelihood Enhancement',
  city: 'Gadchiroli',
  state: 'Maharashtra',
  budget: '500000',
  volunteerRequirement: '12',
  startDate: '2026-11-01',
  endDate: '2026-12-31',
  beneficiaries: '300',
  milestones: [
    { title: 'Kickoff', description: 'Plan delivery', budgetTarget: '200000', startDate: '2026-11-01', endDate: '2026-11-15' },
    { title: 'Delivery', description: 'Distribute kits', budgetTarget: '300000', startDate: '2026-11-16', endDate: '2026-12-31' },
  ],
}

describe('manual CSR campaign helpers', () => {
  it('rejects an empty form', () => {
    expect(validateManualCampaign(createEmptyCampaignForm())).toBe('Campaign name must be at least 3 characters.')
  })

  it('requires milestone budgets to match the campaign budget', () => {
    expect(
      validateManualCampaign({
        ...completeForm,
        milestones: [{ title: 'Only', description: 'One phase', budgetTarget: '1000', startDate: '', endDate: '' }],
      })
    ).toMatch(/Milestone budgets add up/)
  })

  it('accepts a complete form and writes a draft payload', () => {
    expect(validateManualCampaign(completeForm)).toBeNull()
    expect(buildManualCampaignBody(completeForm, { selectedProjectId: 'p-9' })).toMatchObject({
      title: 'Rural school kits',
      category: 'Education and Livelihood Enhancement',
      location: 'Gadchiroli, Maharashtra',
      budget_inr: 500000,
      impact_metrics: {
        volunteer_requirement: '12',
        selected_existing_project_id: 'p-9',
      },
    })
  })

  it('applies an existing project suggestion without dropping filled fields', () => {
    const next = applyProjectSuggestion(completeForm, {
      id: 'p-1',
      title: 'Classroom kit drive',
      description: 'NGO project already scoped for schools.',
      location: 'Nagpur, Maharashtra',
      expected_beneficiaries: 120,
    })
    expect(next).toMatchObject({
      campaignName: 'Classroom kit drive',
      requirementDetails: 'NGO project already scoped for schools.',
      city: 'Nagpur',
      state: 'Maharashtra',
      budget: '500000',
      beneficiaries: '120',
    })
  })

  it('resizes milestones and labels a campaign window', () => {
    expect(withMilestoneCount(completeForm, 3).milestones).toHaveLength(3)
    expect(campaignDurationLabel('2026-11-01', '2026-12-31')).toMatch(/week|month/)
  })

  it('hydrates a saved draft back into the manual form', () => {
    expect(
      campaignRowToManualForm({
        title: 'Rural school kits',
        description: 'Deliver school kits to 300 students in Gadchiroli this quarter.',
        category: 'Education and Livelihood Enhancement',
        location: 'Gadchiroli, Maharashtra',
        budget_inr: 500000,
        start_date: '2026-11-01',
        end_date: '2026-12-31',
        impact_metrics: { volunteer_requirement: '12', beneficiaries: 300, invited_offer_ids: [4, 9], selected_existing_project_id: 'p-9' },
        milestones: [{ title: 'Kickoff', description: 'Plan delivery', budget_allocated: 200000, start_date: '2026-11-01', end_date: '2026-11-15' }],
      })
    ).toMatchObject({
      campaignName: 'Rural school kits',
      city: 'Gadchiroli',
      state: 'Maharashtra',
      budget: '500000',
      volunteerRequirement: '12',
      beneficiaries: '300',
      milestones: [{ title: 'Kickoff', budgetTarget: '200000' }],
    })
    expect(
      readManualCampaignExtras({
        impact_metrics: { invited_offer_ids: [4, '9'], selected_existing_project_id: 'p-9' },
      })
    ).toEqual({ invitedOfferIds: [4, 9], selectedProjectId: 'p-9' })
  })

  it('treats the update-campaign PUT body as success with or without a success flag', () => {
    expect(isCampaignDraftUpdateSuccess({ success: true, data: { id: 'c1' } })).toBe(true)
    expect(isCampaignDraftUpdateSuccess({ id: 'c1', title: 'Rural school kits', status: 'draft' })).toBe(true)
    expect(isCampaignDraftUpdateSuccess({ error: 'Failed to update campaign draft' })).toBe(false)
    expect(isCampaignDraftUpdateSuccess(null)).toBe(false)
  })
})
