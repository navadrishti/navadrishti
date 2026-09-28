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
import { confirmedFunds, paymentLineItems, pickLatestImpact, sumLatestImpact } from './project-data'
import { buildUtilization } from './report-builders'
import type { PeriodDocumentContext } from './types'
import { asNumber, asString } from './values'

async function assembleCompanyUtilization({ user, request, organizationName }: PeriodDocumentContext) {
  if (request.projectId) {
    const project = await loadProjectForActor(request.projectId, user)
    const implementerName = await resolvePartnerName(project.ngo_user_id)
    const impact = pickLatestImpact(project)
    return buildUtilization({
      organizationName,
      audienceLabel: 'Company CSR / Finance',
      entityTitle: asString(project.title) || asString(project.campaigns?.title) || 'CSR Project',
      entityTypeLabel: 'CSR Project',
      funderName: organizationName,
      implementerName,
      budgetInr: asNumber(project.campaigns?.budget_inr),
      fundsUtilized: asNumber(impact?.funds_utilized),
      fundsConfirmed: confirmedFunds(project),
      status: asString(project.project_status),
      lineItems: paymentLineItems(project),
      gaps: confirmedFunds(project) || asNumber(impact?.funds_utilized)
        ? []
        : ['No confirmed payments or utilization figures found'],
    })
  }
  if (!request.campaignId) throw new Error('Select a campaign or project for the utilization certificate')
  const campaign = await loadCampaignForCompany(request.campaignId, user.id)
  const projects = await loadProjectsForCampaign(campaign.id)
  const implementerName = await resolvePartnerName(
    getCampaignLeadNgoId(campaign) || projects[0]?.ngo_user_id
  )
  const fundsUtilized = sumLatestImpact(projects, 'funds_utilized', parseJsonObject(campaign.impact_metrics).funds_utilized)
  const fundsConfirmed = projects.reduce((sum, project) => sum + confirmedFunds(project), 0)
  const lineItems = projects.flatMap((project) => paymentLineItems(project))
  return buildUtilization({
    organizationName,
    audienceLabel: 'Company CSR / Finance',
    entityTitle: asString(campaign.title) || 'Campaign',
    entityTypeLabel: 'Campaign',
    funderName: organizationName,
    implementerName,
    budgetInr: asNumber(campaign.budget_inr),
    fundsUtilized,
    fundsConfirmed,
    status: asString(campaign.status),
    lineItems,
    gaps: projects.length ? [] : ['No linked projects — utilization may be incomplete'],
  })
}

async function assembleNgoUtilization({ user, request, organizationName }: PeriodDocumentContext) {
  if (request.projectId) {
    const project = await loadProjectForActor(request.projectId, user)
    const funderName = await resolvePartnerName(project.company_user_id)
    const impact = pickLatestImpact(project)
    return buildUtilization({
      organizationName,
      audienceLabel: 'NGO Finance / Funding Partner',
      entityTitle: asString(project.title) || asString(project.campaigns?.title) || 'CSR Project',
      entityTypeLabel: 'CSR Project',
      funderName,
      implementerName: organizationName,
      budgetInr: asNumber(project.campaigns?.budget_inr),
      fundsUtilized: asNumber(impact?.funds_utilized),
      fundsConfirmed: confirmedFunds(project),
      status: asString(project.project_status),
      lineItems: paymentLineItems(project),
    })
  }
  if (request.campaignId) {
    const campaign = await loadCampaignForLeadNgo(request.campaignId, user.id)
    const funderName = await resolvePartnerName(campaign.company_id)
    const projects = await loadProjectsForCampaign(campaign.id)
    const ngoProjects = projects.filter((project) => Number(project.ngo_user_id) === user.id)
    const fundsUtilized = sumLatestImpact(ngoProjects, 'funds_utilized', parseJsonObject(campaign.impact_metrics).funds_utilized)
    const fundsConfirmed = ngoProjects.reduce((sum, project) => sum + confirmedFunds(project), 0)
    return buildUtilization({
      organizationName,
      audienceLabel: 'NGO Finance / Funding Partner',
      entityTitle: asString(campaign.title) || 'Campaign',
      entityTypeLabel: 'Lead Campaign',
      funderName,
      implementerName: organizationName,
      budgetInr: asNumber(campaign.budget_inr),
      fundsUtilized,
      fundsConfirmed,
      status: asString(campaign.status),
      lineItems: ngoProjects.flatMap((project) => paymentLineItems(project)),
    })
  }
  throw new Error('Select a project or lead campaign for the utilization certificate')
}

export async function assembleUtilizationCertificate(context: PeriodDocumentContext) {
  if (context.user.user_type === 'company') return assembleCompanyUtilization(context)
  if (context.user.user_type === 'ngo') return assembleNgoUtilization(context)
  throw new Error('Utilization certificates are available to companies and NGOs only')
}
