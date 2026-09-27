import 'server-only'
import { getCampaignLeadNgoId } from '@/lib/campaign-volunteer-attendance'
import { parseJsonObject } from '@/lib/utils'
import {
  loadCampaignForCompany,
  loadCampaignForLeadNgo,
  loadProjectForActor,
  loadProjectsForCampaign,
  resolvePartnerName,
} from './loaders'
import { pickLatestImpact, sumLatestImpact } from './project-data'
import { buildImpactFromCampaign, buildImpactFromProject } from './report-builders'
import type { PeriodDocumentContext } from './types'
import { asNumber } from './values'

async function assembleCompanyImpactReport({ user, request, organizationName, period }: PeriodDocumentContext) {
  if (!request.campaignId) throw new Error('Select a campaign for the impact report')
  const campaign = await loadCampaignForCompany(request.campaignId, user.id)
  const projects = await loadProjectsForCampaign(campaign.id)
  const leadNgoId = getCampaignLeadNgoId(campaign)
  const partnerName = await resolvePartnerName(leadNgoId || projects[0]?.ngo_user_id)
  const campaignImpact = parseJsonObject(campaign.impact_metrics)
  const fundsUtilized = sumLatestImpact(projects, 'funds_utilized', campaignImpact.funds_utilized)
  const beneficiaries = sumLatestImpact(projects, 'beneficiaries', campaignImpact.beneficiaries)
  const progressValues = projects
    .map((project) => asNumber(pickLatestImpact(project)?.progress_percentage))
    .filter((value) => value > 0)
  const progressPercentage = progressValues.length
    ? Math.round(progressValues.reduce((a, b) => a + b, 0) / progressValues.length)
    : asNumber(campaignImpact.progress_percentage)

  return buildImpactFromCampaign({
    campaign,
    organizationName,
    audienceLabel: 'Company CSR Board / Management',
    partnerName,
    period,
    periodStart: request.periodStart,
    periodEnd: request.periodEnd,
    fundsUtilized,
    beneficiaries,
    progressPercentage,
    gaps: projects.length ? [] : ['No linked CSR projects yet — metrics may be incomplete'],
  })
}

async function assembleNgoImpactReport({ user, request, organizationName, period }: PeriodDocumentContext) {
  if (request.projectId) {
    const project = await loadProjectForActor(request.projectId, user)
    const partnerName = await resolvePartnerName(project.company_user_id)
    return buildImpactFromProject({
      project,
      organizationName,
      audienceLabel: 'NGO Management / Funder Pack',
      partnerName,
      period,
      periodStart: request.periodStart,
      periodEnd: request.periodEnd,
    })
  }
  if (request.campaignId) {
    const campaign = await loadCampaignForLeadNgo(request.campaignId, user.id)
    const companyName = await resolvePartnerName(campaign.company_id)
    return buildImpactFromCampaign({
      campaign,
      organizationName,
      audienceLabel: 'Lead NGO / Implementing Partner',
      partnerName: companyName,
      period,
      periodStart: request.periodStart,
      periodEnd: request.periodEnd,
    })
  }
  throw new Error('Select a project or lead campaign for the impact report')
}

export async function assembleImpactReport(context: PeriodDocumentContext) {
  if (context.user.user_type === 'company') return assembleCompanyImpactReport(context)
  if (context.user.user_type === 'ngo') return assembleNgoImpactReport(context)
  throw new Error('Impact reports are available to companies and NGOs only')
}
