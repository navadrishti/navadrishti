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
import { pickLatestImpact, sumLatestImpact, sumScopedImpactField } from './project-data'
import { buildImpactFromCampaign, buildImpactFromProject } from './report-builders'
import type { PeriodDocumentContext } from './types'
import { asNumber } from './values'

async function assembleCompanyImpactReport({ user, request, organizationName, period }: PeriodDocumentContext) {
  // Project-scoped path: used by Company Employees and any company request that names a project.
  // Must not pull sibling campaign projects into the report.
  if (request.projectId) {
    const project = await loadProjectForActor(request.projectId, user)
    const partnerName = await resolvePartnerName(project.ngo_user_id)
    return buildImpactFromProject({
      project,
      organizationName,
      audienceLabel: 'Company CSR monitoring',
      partnerName,
      period,
      periodStart: request.periodStart,
      periodEnd: request.periodEnd,
    })
  }

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
    const projects = await loadProjectsForCampaign(campaign.id)
    const ngoProjects = projects.filter((project) => Number(project.ngo_user_id) === user.id)
    // Scope metrics to this NGO's projects only — never use campaign-wide impact_metrics
    // (those may include sibling implementers on the same campaign).
    const fundsUtilized = sumScopedImpactField(ngoProjects, 'funds_utilized') ?? 0
    const beneficiaries = sumScopedImpactField(ngoProjects, 'beneficiaries') ?? 0
    const progressRows = ngoProjects
      .map((project) => asNumber(pickLatestImpact(project)?.progress_percentage))
      .filter((value) => value > 0)
    const progressPercentage = progressRows.length
      ? Math.round(progressRows.reduce((a, b) => a + b, 0) / progressRows.length)
      : 0

    return buildImpactFromCampaign({
      campaign,
      organizationName,
      audienceLabel: 'Lead NGO / Implementing Partner',
      partnerName: companyName,
      period,
      periodStart: request.periodStart,
      periodEnd: request.periodEnd,
      fundsUtilized,
      beneficiaries,
      progressPercentage,
      gaps: ngoProjects.length
        ? []
        : ['No projects assigned to this NGO under the lead campaign — metrics may be incomplete'],
    })
  }
  throw new Error('Select a project or lead campaign for the impact report')
}

export async function assembleImpactReport(context: PeriodDocumentContext) {
  if (context.user.user_type === 'company') return assembleCompanyImpactReport(context)
  if (context.user.user_type === 'ngo') return assembleNgoImpactReport(context)
  throw new Error('Impact reports are available to companies and NGOs only')
}
