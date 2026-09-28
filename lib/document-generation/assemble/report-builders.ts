import { readCampaignCategory, readCampaignLocation } from '@/lib/campaign-schema'
import type { ImpactReportPeriod } from '@/lib/document-generation/types'
import {
  impactReportTemplate,
  utilizationCertificateTemplate,
  type ImpactReportData,
  type UtilizationCertificateData,
} from '@/lib/document-generation/templates/company/csr-compliance-profile'
import { parseJsonObject } from '@/lib/utils'
import { milestonesFromCampaign, milestonesFromProject, pickLatestImpact } from './project-data'
import type { CampaignRow, CsrProjectDetail } from './types'
import { asNumber, asString, defaultPeriodBounds, periodLabel, slugify } from './values'

export function buildImpactFromCampaign(args: {
  campaign: CampaignRow
  organizationName: string
  audienceLabel: string
  partnerName?: string | null
  period: ImpactReportPeriod
  periodStart?: string | null
  periodEnd?: string | null
  fundsUtilized?: number
  beneficiaries?: number
  progressPercentage?: number
  customMetrics?: Record<string, unknown> | null
  gaps?: string[]
}) {
  const impact = parseJsonObject(args.campaign.impact_metrics)
  const bounds = defaultPeriodBounds(args.period)
  const periodStart = args.periodStart || bounds.start
  const periodEnd = args.periodEnd || bounds.end

  const payload: ImpactReportData = {
    audienceLabel: args.audienceLabel,
    organizationName: args.organizationName,
    entityTitle: asString(args.campaign.title) || 'Untitled campaign',
    entityTypeLabel: 'Campaign',
    period: args.period,
    periodLabel: periodLabel(args.period, periodStart, periodEnd),
    periodStart,
    periodEnd,
    category: readCampaignCategory(args.campaign) || null,
    location: readCampaignLocation(args.campaign) || null,
    scheduleVii: asString(args.campaign.schedule_vii) || null,
    sdgAlignment: Array.isArray(args.campaign.sdg_alignment) ? args.campaign.sdg_alignment : [],
    budgetInr: asNumber(args.campaign.budget_inr),
    fundsUtilized: args.fundsUtilized ?? asNumber(impact.funds_utilized),
    beneficiaries: args.beneficiaries ?? asNumber(impact.beneficiaries ?? impact.expected_beneficiaries),
    progressPercentage: args.progressPercentage ?? asNumber(impact.progress_percentage),
    status: asString(args.campaign.status) || null,
    partnerName: args.partnerName || null,
    description: asString(args.campaign.description) || null,
    milestones: milestonesFromCampaign(args.campaign),
    customMetrics: args.customMetrics ?? parseJsonObject(impact.custom_metrics),
    gaps: args.gaps || [],
  }

  return {
    html: impactReportTemplate(payload),
    filename: `${slugify(args.organizationName)}-impact-${args.period}-${slugify(payload.entityTitle)}.html`,
    label: `${periodLabel(args.period)} Impact Report`,
    entityTitle: payload.entityTitle,
  }
}

export function buildImpactFromProject(args: {
  project: CsrProjectDetail
  organizationName: string
  audienceLabel: string
  partnerName?: string | null
  period: ImpactReportPeriod
  periodStart?: string | null
  periodEnd?: string | null
}) {
  const campaign = parseJsonObject(args.project.campaigns)
  const impact = pickLatestImpact(args.project) || parseJsonObject(args.project.latest_impact)
  const bounds = defaultPeriodBounds(args.period)
  const periodStart = args.periodStart || bounds.start
  const periodEnd = args.periodEnd || bounds.end
  const gaps: string[] = []
  if (!impact) gaps.push('No csr_impact_metrics row found for this project')

  const payload: ImpactReportData = {
    audienceLabel: args.audienceLabel,
    organizationName: args.organizationName,
    entityTitle:
      asString(args.project.title) ||
      asString(campaign.title) ||
      'Untitled project',
    entityTypeLabel: 'CSR Project',
    period: args.period,
    periodLabel: periodLabel(args.period, periodStart, periodEnd),
    periodStart,
    periodEnd,
    category: asString(args.project.category) || readCampaignCategory(campaign) || null,
    location: asString(args.project.region || args.project.location) || readCampaignLocation(campaign) || null,
    scheduleVii: asString(args.project.schedule_vii || campaign.schedule_vii) || null,
    sdgAlignment: Array.isArray(campaign.sdg_alignment) ? campaign.sdg_alignment : [],
    budgetInr: asNumber(args.project.budget_inr ?? campaign.budget_inr),
    fundsUtilized: asNumber(impact?.funds_utilized),
    beneficiaries: asNumber(impact?.beneficiaries),
    progressPercentage: asNumber(impact?.progress_percentage),
    status: asString(args.project.project_status || args.project.status) || null,
    partnerName: args.partnerName || null,
    description: asString(args.project.description || campaign.description) || null,
    milestones: milestonesFromProject(args.project),
    customMetrics: parseJsonObject(impact?.custom_metrics),
    gaps,
  }

  return {
    html: impactReportTemplate(payload),
    filename: `${slugify(args.organizationName)}-project-impact-${slugify(payload.entityTitle)}.html`,
    label: 'Project Impact Report',
    entityTitle: payload.entityTitle,
  }
}

export function buildUtilization(args: {
  organizationName: string
  audienceLabel: string
  entityTitle: string
  entityTypeLabel: string
  funderName?: string | null
  implementerName?: string | null
  budgetInr?: number | null
  fundsUtilized?: number | null
  fundsConfirmed?: number | null
  status?: string | null
  periodLabel?: string | null
  scheduleVii?: string | null
  lineItems?: UtilizationCertificateData['lineItems']
  gaps?: string[]
}) {
  return {
    html: utilizationCertificateTemplate({
      audienceLabel: args.audienceLabel,
      organizationName: args.organizationName,
      entityTitle: args.entityTitle,
      entityTypeLabel: args.entityTypeLabel,
      funderName: args.funderName,
      implementerName: args.implementerName,
      budgetInr: args.budgetInr,
      fundsUtilized: args.fundsUtilized,
      fundsConfirmed: args.fundsConfirmed,
      status: args.status,
      periodLabel: args.periodLabel,
      scheduleVii: args.scheduleVii,
      lineItems: args.lineItems || [],
      gaps: args.gaps || [],
    }),
    filename: `${slugify(args.organizationName)}-utilization-${slugify(args.entityTitle)}.html`,
    label: 'Utilization Certificate',
    entityTitle: args.entityTitle,
  }
}
