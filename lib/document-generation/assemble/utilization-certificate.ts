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
import {
  confirmedFunds,
  grossConfirmedFunds,
  nullableMetric,
  paymentLineItems,
  pickLatestImpact,
  sumLatestImpact,
  sumScopedImpactField,
} from './project-data'
import { buildUtilization } from './report-builders'
import type { PeriodDocumentContext } from './types'
import { asNumber, asString } from './values'

const UNRECONCILED_NET_GAP =
  'Net disbursement unreconciled — refund ledger enrichment missing; gross is not reported as net'

function sumNetConfirmed(projects: Array<Parameters<typeof confirmedFunds>[0]>): {
  fundsConfirmed: number | null
  unreconciled: boolean
} {
  let total = 0
  for (const project of projects) {
    const net = confirmedFunds(project)
    if (net == null) return { fundsConfirmed: null, unreconciled: true }
    total += net
  }
  return { fundsConfirmed: Number(total.toFixed(2)), unreconciled: false }
}

async function assembleCompanyUtilization({ user, request, organizationName }: PeriodDocumentContext) {
  if (request.projectId) {
    const project = await loadProjectForActor(request.projectId, user)
    const implementerName = await resolvePartnerName(project.ngo_user_id)
    const impact = pickLatestImpact(project)
    const fundsConfirmed = confirmedFunds(project)
    const fundsUtilized = nullableMetric(impact?.funds_utilized)
    const gaps: string[] = []
    if (fundsConfirmed == null && grossConfirmedFunds(project) > 0) gaps.push(UNRECONCILED_NET_GAP)
    else if (!fundsConfirmed && fundsUtilized == null) {
      gaps.push('No confirmed payments or utilization figures found')
    }
    return buildUtilization({
      organizationName,
      audienceLabel: 'Company CSR / Finance',
      entityTitle: asString(project.title) || asString(project.campaigns?.title) || 'CSR Project',
      entityTypeLabel: 'CSR Project',
      funderName: organizationName,
      implementerName,
      budgetInr: asNumber(project.campaigns?.budget_inr),
      fundsUtilized,
      fundsConfirmed,
      status: asString(project.project_status),
      lineItems: paymentLineItems(project),
      gaps,
    })
  }
  if (!request.campaignId) throw new Error('Select a campaign or project for the utilization certificate')
  const campaign = await loadCampaignForCompany(request.campaignId, user.id)
  const projects = await loadProjectsForCampaign(campaign.id)
  const implementerName = await resolvePartnerName(
    getCampaignLeadNgoId(campaign) || projects[0]?.ngo_user_id
  )
  const fundsUtilized = sumLatestImpact(projects, 'funds_utilized', parseJsonObject(campaign.impact_metrics).funds_utilized)
  const { fundsConfirmed, unreconciled } = sumNetConfirmed(projects)
  const lineItems = projects.flatMap((project) => paymentLineItems(project))
  const gaps: string[] = []
  if (!projects.length) gaps.push('No linked projects — utilization may be incomplete')
  if (unreconciled) gaps.push(UNRECONCILED_NET_GAP)
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
    gaps,
  })
}

async function assembleNgoUtilization({ user, request, organizationName }: PeriodDocumentContext) {
  if (request.projectId) {
    const project = await loadProjectForActor(request.projectId, user)
    const funderName = await resolvePartnerName(project.company_user_id)
    const impact = pickLatestImpact(project)
    const fundsConfirmed = confirmedFunds(project)
    const gaps: string[] = []
    if (fundsConfirmed == null && grossConfirmedFunds(project) > 0) gaps.push(UNRECONCILED_NET_GAP)
    return buildUtilization({
      organizationName,
      audienceLabel: 'NGO Finance / Funding Partner',
      entityTitle: asString(project.title) || asString(project.campaigns?.title) || 'CSR Project',
      entityTypeLabel: 'CSR Project',
      funderName,
      implementerName: organizationName,
      budgetInr: asNumber(project.campaigns?.budget_inr),
      fundsUtilized: nullableMetric(impact?.funds_utilized),
      fundsConfirmed,
      status: asString(project.project_status),
      lineItems: paymentLineItems(project),
      gaps,
    })
  }
  if (request.campaignId) {
    const campaign = await loadCampaignForLeadNgo(request.campaignId, user.id)
    const funderName = await resolvePartnerName(campaign.company_id)
    const projects = await loadProjectsForCampaign(campaign.id)
    const ngoProjects = projects.filter((project) => Number(project.ngo_user_id) === user.id)
    const fundsUtilized = sumScopedImpactField(ngoProjects, 'funds_utilized')
    const { fundsConfirmed, unreconciled } = sumNetConfirmed(ngoProjects)
    const gaps: string[] = []
    if (!ngoProjects.length) gaps.push('No projects assigned to this NGO under the lead campaign')
    if (unreconciled) gaps.push(UNRECONCILED_NET_GAP)
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
      gaps,
    })
  }
  throw new Error('Select a project or lead campaign for the utilization certificate')
}

export async function assembleUtilizationCertificate(context: PeriodDocumentContext) {
  if (context.user.user_type === 'company') return assembleCompanyUtilization(context)
  if (context.user.user_type === 'ngo') return assembleNgoUtilization(context)
  throw new Error('Utilization certificates are available to companies and NGOs only')
}
