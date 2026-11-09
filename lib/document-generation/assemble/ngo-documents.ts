import 'server-only'
import { readCampaignLocation } from '@/lib/campaign-schema'
import {
  CA_COMPLIANCE_TAG_KEYS,
  CA_COMPLIANCE_TAG_LABELS,
  getCaComplianceTagExpiry,
  getCaComplianceTags,
  summarizeDocumentExpiries,
} from '@/lib/auth'
import type { ImpactReportPeriod } from '@/lib/document-generation/types'
import {
  implementingAgencyReportTemplate,
  ngoCompliancePackTemplate,
} from '@/lib/document-generation/templates/company/csr-compliance-profile'
import { parseJsonObject } from '@/lib/utils'
import {
  loadCampaignForLeadNgo,
  loadProjectForActor,
  loadProjectsForCampaign,
  resolvePartnerName,
} from './loaders'
import {
  confirmedFunds,
  milestonesFromCampaign,
  milestonesFromProject,
  nullableMetric,
  pickLatestImpact,
  sumScopedImpactField,
} from './project-data'
import type { CampaignRow, CsrProjectDetail, OrganizationRow, PeriodDocumentContext } from './types'
import { asNumber, asString, defaultPeriodBounds, periodLabel, slugify } from './values'

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

export function buildNgoCompliancePack(userRow: OrganizationRow) {
  const profile = parseJsonObject(userRow.profile_data)
  const liveTags = new Set(getCaComplianceTags(profile, userRow.verification_status))
  const expirySummary = summarizeDocumentExpiries(profile)
  const tags = CA_COMPLIANCE_TAG_KEYS.map((key) => {
    const expiry = getCaComplianceTagExpiry(profile, key)
    const present = liveTags.has(key)
    return {
      key,
      label: CA_COMPLIANCE_TAG_LABELS[key],
      present,
      detail: expiry
        ? `Valid until ${expiry}${present ? '' : ' (expired or not allotted as live tag)'}`
        : present
          ? 'Recorded on platform (no expiry date stored)'
          : 'Not recorded / not verified on platform',
    }
  })

  const gaps: string[] = []
  for (const tag of tags) {
    if (!tag.present) gaps.push(`${tag.label} not present as a live CA compliance tag`)
  }
  if (expirySummary.has_expired) gaps.push('One or more compliance certificates are expired')
  if (expirySummary.has_due_soon) gaps.push('One or more compliance certificates are due soon')

  const documentExpirySummary = expirySummary.soonest
    ? `Soonest expiry: ${expirySummary.soonest.label} on ${expirySummary.soonest.valid_until} (${Math.max(
        expirySummary.soonest.days_remaining,
        0
      )} days remaining; status ${expirySummary.soonest.status}).`
    : null

  return {
    html: ngoCompliancePackTemplate({
      ngoName: asString(userRow.name) || 'NGO',
      verificationStatus: asString(userRow.verification_status) || null,
      email: asString(userRow.email) || null,
      location: asString(profile.location || profile.city || profile.state) || null,
      caBadgeNumber: asString(profile.ca_badge_number || profile.caBadgeNumber) || null,
      tags,
      documentExpirySummary,
      gaps,
    }),
    filename: `${slugify(userRow.name || 'ngo')}-compliance-status-pack.html`,
    label: 'NGO Compliance Status Pack',
  }
}

async function buildImplementingAgencyReport(args: {
  userRow: OrganizationRow
  organizationName: string
  campaign?: CampaignRow
  campaignProjects?: CsrProjectDetail[]
  project?: CsrProjectDetail
  period: ImpactReportPeriod
  periodStart?: string | null
  periodEnd?: string | null
}) {
  const profile = parseJsonObject(args.userRow.profile_data)
  const liveTags = getCaComplianceTags(profile, args.userRow.verification_status)
  const registrationHints = liveTags.map((key) => `${CA_COMPLIANCE_TAG_LABELS[key]} recorded on GRAM`)
  const bounds = defaultPeriodBounds(args.period)
  const periodStart = args.periodStart || bounds.start
  const periodEnd = args.periodEnd || bounds.end
  const gaps: string[] = []
  if (!liveTags.includes('csr1')) gaps.push('CSR-1 tag not live — funders typically require Form CSR-1 registration')

  if (args.project) {
    const project = args.project
    const campaign = parseJsonObject(project.campaigns)
    const impact = pickLatestImpact(project)
    const companyName = await resolvePartnerName(project.company_user_id)
    const entityTitle =
      asString(project.title) || asString(campaign.title) || 'Untitled project'
    if (!impact) gaps.push('No csr_impact_metrics row found for this project')
    const fundsReceived = confirmedFunds(project)
    if (fundsReceived == null) {
      gaps.push(
        'Net disbursement unreconciled — refund ledger enrichment missing; gross is not reported as net'
      )
    }

    return {
      html: implementingAgencyReportTemplate({
        ngoName: args.organizationName,
        companyName,
        entityTitle,
        entityTypeLabel: 'CSR Project',
        registrationHints,
        location:
          asString(project.region) || readCampaignLocation(campaign) || null,
        scheduleVii: asString(campaign.schedule_vii) || null,
        periodLabel: periodLabel(args.period, periodStart, periodEnd),
        budgetInr: asNumber(project.budget_inr ?? campaign.budget_inr),
        fundsReceived,
        fundsUtilized: nullableMetric(impact?.funds_utilized),
        beneficiaries: nullableMetric(impact?.beneficiaries),
        progressPercentage: nullableMetric(impact?.progress_percentage),
        milestones: milestonesFromProject(project),
        activitiesSummary: asString(project.description || campaign.description) || null,
        gaps,
      }),
      filename: `${slugify(args.organizationName)}-implementing-agency-${slugify(entityTitle)}.html`,
      label: 'Implementing Agency Project Report',
      entityTitle,
    }
  }

  const campaign = args.campaign
  if (!campaign) throw new Error('Select a project or lead campaign for the implementing agency report')
  const companyName = await resolvePartnerName(campaign.company_id)
  const entityTitle = asString(campaign.title) || 'Untitled campaign'
  const ngoProjects = Array.isArray(args.campaignProjects) ? args.campaignProjects : []
  const { fundsConfirmed, unreconciled } = sumNetConfirmed(ngoProjects)
  if (!ngoProjects.length) gaps.push('No projects assigned to this NGO under the lead campaign')
  if (unreconciled) gaps.push(UNRECONCILED_NET_GAP)
  // Never fall back to campaign impact_metrics — those may include sibling implementers.
  const fundsUtilized = sumScopedImpactField(ngoProjects, 'funds_utilized')
  const beneficiaries = sumScopedImpactField(ngoProjects, 'beneficiaries')
  const progressRows = ngoProjects
    .map((project) => nullableMetric(pickLatestImpact(project)?.progress_percentage))
    .filter((value): value is number => value != null && value > 0)
  const progressPercentage = progressRows.length
    ? Number((progressRows.reduce((sum, value) => sum + value, 0) / progressRows.length).toFixed(1))
    : null

  return {
    html: implementingAgencyReportTemplate({
      ngoName: args.organizationName,
      companyName,
      entityTitle,
      entityTypeLabel: 'Lead Campaign',
      registrationHints,
      location: readCampaignLocation(campaign) || null,
      scheduleVii: asString(campaign.schedule_vii) || null,
      periodLabel: periodLabel(args.period, periodStart, periodEnd),
      budgetInr: asNumber(campaign.budget_inr),
      fundsReceived: fundsConfirmed,
      fundsUtilized,
      beneficiaries,
      progressPercentage,
      milestones: milestonesFromCampaign(campaign),
      activitiesSummary: asString(campaign.description) || null,
      gaps,
    }),
    filename: `${slugify(args.organizationName)}-implementing-agency-${slugify(entityTitle)}.html`,
    label: 'Implementing Agency Project Report',
    entityTitle,
  }
}

export async function assembleImplementingAgencyReport({
  user,
  request,
  userRow,
  organizationName,
  period,
}: PeriodDocumentContext) {
  if (user.user_type !== 'ngo') throw new Error('Implementing Agency Report is available to NGOs only')
  if (request.projectId) {
    const project = await loadProjectForActor(request.projectId, user)
    return buildImplementingAgencyReport({
      userRow,
      organizationName,
      project,
      period,
      periodStart: request.periodStart,
      periodEnd: request.periodEnd,
    })
  }
  if (request.campaignId) {
    const campaign = await loadCampaignForLeadNgo(request.campaignId, user.id)
    const projects = await loadProjectsForCampaign(campaign.id)
    const campaignProjects = projects.filter((project) => Number(project.ngo_user_id) === user.id)
    return buildImplementingAgencyReport({
      userRow,
      organizationName,
      campaign,
      campaignProjects,
      period,
      periodStart: request.periodStart,
      periodEnd: request.periodEnd,
    })
  }
  throw new Error('Select a project or lead campaign for the implementing agency report')
}
