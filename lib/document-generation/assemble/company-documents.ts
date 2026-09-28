import 'server-only'
import { getCampaignLeadNgoId } from '@/lib/campaign-volunteer-attendance'
import { readCampaignLocation } from '@/lib/campaign-schema'
import {
  boardCsrAnnexureDraftTemplate,
  csrComplianceProfileTemplate,
} from '@/lib/document-generation/templates/company/csr-compliance-profile'
import { csrPolicyDocumentTemplate } from '@/lib/document-generation/templates/company/csr-policy-document.template'
import { parseJsonObject } from '@/lib/utils'
import { loadCompanyCampaigns, loadCompanyProjects, resolvePartnerName } from './loaders'
import { confirmedFunds, pickLatestImpact } from './project-data'
import type { OrganizationRow } from './types'
import {
  asNumber,
  asString,
  companyFocusAreas,
  companyWebsite,
  currentFinancialYearLabel,
  slugify,
} from './values'

export function buildCompliance(userRow: OrganizationRow) {
  const profile = parseJsonObject(userRow.profile_data)
  const netWorth = asNumber(profile.net_worth ?? profile.netWorth)
  const turnover = asNumber(profile.turnover)
  const netProfit = asNumber(profile.net_profit ?? profile.netProfit)
  const cin = asString(profile.cin || profile.CIN)
  const pan = asString(profile.pan || profile.PAN)
  const registeredOffice = asString(
    profile.registered_office || profile.office_address || profile.address
  )
  const gaps: string[] = []
  if (!cin) gaps.push('CIN missing on company profile')
  if (!pan) gaps.push('PAN missing on company profile')
  if (!netWorth && !turnover && !netProfit) gaps.push('Financial figures (net worth / turnover / net profit) missing')
  if (!registeredOffice) gaps.push('Registered office address missing')

  const csrApplicable = netProfit >= 5 || netWorth >= 500 || turnover >= 1000

  return {
    html: csrComplianceProfileTemplate({
      companyName: asString(userRow.name) || 'Company',
      cin: cin || 'Not provided',
      pan: pan || 'Not provided',
      registeredOffice: registeredOffice || null,
      netWorth,
      turnover,
      netProfit,
      csrApplicable,
      financialYearLabel: currentFinancialYearLabel(),
      gaps,
    }),
    filename: `${slugify(userRow.name || 'company')}-csr-compliance-profile.html`,
    label: 'CSR Compliance Profile',
  }
}

export function buildPolicy(userRow: OrganizationRow) {
  const profile = parseJsonObject(userRow.profile_data)
  const focusAreas = companyFocusAreas(profile)
  const policyUrl = companyWebsite(profile)

  const gaps: string[] = []
  if (!asString(profile.csr_vision || profile.csrVision)) gaps.push('CSR vision missing')
  if (!focusAreas.length) gaps.push('Focus areas missing')
  if (!policyUrl) gaps.push('Website / CSR Policy URL missing (Rule 9 disclosure)')

  return {
    html: csrPolicyDocumentTemplate({
      companyName: asString(userRow.name) || 'Company',
      csrVision: asString(profile.csr_vision || profile.csrVision),
      focusAreas,
      implementationModel: asString(profile.implementation_model || profile.implementationModel),
      governingMechanism: asString(profile.governing_mechanism || profile.governingMechanism),
      monitoringMechanism: asString(profile.monitoring_mechanism || profile.monitoringMechanism),
      reportingFramework: asString(profile.reporting_framework || profile.reportingFramework),
      stakeholderEngagement: asString(profile.stakeholder_engagement || profile.stakeholderEngagement),
      grievanceRedressal: asString(profile.grievance_redressal || profile.grievanceRedressal),
      reviewAndUpdate: asString(profile.review_and_update || profile.reviewAndUpdate),
      policyUrl,
      date: new Date().toISOString(),
      gaps,
    }),
    filename: `${slugify(userRow.name || 'company')}-csr-policy.html`,
    label: 'CSR Policy Document',
  }
}

type AnnexureProjectRow = {
  name: string
  scheduleVii?: string | null
  location?: string | null
  implementingAgency?: string | null
  amountSpent?: number | null
  status?: string | null
  mode?: string | null
}

async function annexureProjectRows(companyId: number): Promise<AnnexureProjectRow[]> {
  const projects = await loadCompanyProjects(companyId)
  const campaigns = await loadCompanyCampaigns(companyId)
  const rows: AnnexureProjectRow[] = []

  if (projects.length) {
    for (const project of projects) {
      const campaign = parseJsonObject(project.campaigns)
      const impact = pickLatestImpact(project)
      const agencyName = await resolvePartnerName(project.ngo_user_id)
      const spent = asNumber(impact?.funds_utilized) || confirmedFunds(project)
      rows.push({
        name: asString(project.title) || asString(campaign.title) || 'CSR Project',
        scheduleVii: asString(campaign.schedule_vii) || null,
        location:
          asString(project.region) || readCampaignLocation(campaign) || null,
        implementingAgency: agencyName,
        amountSpent: spent || null,
        status: asString(project.project_status) || null,
        mode: agencyName ? 'Through implementing agency' : 'Direct / as recorded',
      })
    }
  } else {
    for (const campaign of campaigns) {
      const agencyId = getCampaignLeadNgoId(campaign)
      const agencyName = await resolvePartnerName(agencyId)
      const impact = parseJsonObject(campaign.impact_metrics)
      rows.push({
        name: asString(campaign.title) || 'Campaign',
        scheduleVii: asString(campaign.schedule_vii) || null,
        location: readCampaignLocation(campaign) || null,
        implementingAgency: agencyName,
        amountSpent: asNumber(impact.funds_utilized) || null,
        status: asString(campaign.status) || null,
        mode: agencyName ? 'Through implementing agency' : 'Direct / as recorded',
      })
    }
  }

  return rows
}

export async function buildBoardAnnexureDraft(userRow: OrganizationRow, companyId: number) {
  const profile = parseJsonObject(userRow.profile_data)
  const focusAreas = companyFocusAreas(profile)
  const cin = asString(profile.cin || profile.CIN)
  const websiteUrl = companyWebsite(profile)
  // Platform stores crore figures for threshold check; Annexure amounts are INR — leave null unless explicit INR fields exist
  const averageNetProfitInr = asNumber(
    profile.average_net_profit_inr ?? profile.avg_net_profit_inr ?? profile.average_net_profit
  )
  const prescribed = averageNetProfitInr > 0 ? averageNetProfitInr * 0.02 : null

  const gaps: string[] = []
  if (!cin) gaps.push('CIN missing')
  if (!websiteUrl) gaps.push('Company website URL missing for Rule 9 disclosure')
  if (!(averageNetProfitInr > 0)) {
    gaps.push(
      'Average net profit (3 preceding FYs under Section 198) not stored as INR on profile — insert audited figure before Board’s Report'
    )
  }
  gaps.push('CSR Committee composition is not captured on GRAM — complete the blank table offline')

  const rows = await annexureProjectRows(companyId)

  if (!rows.length) gaps.push('No campaigns or projects found to list under CSR amount spent')

  const totalSpent = rows.reduce((sum, row) => sum + asNumber(row.amountSpent), 0)
  const amountUnspent =
    prescribed != null && prescribed > 0 ? Math.max(prescribed - totalSpent, 0) : null

  const largeProject = rows.some((row) => asNumber(row.amountSpent) >= 1_00_00_000)
  const impactAssessmentNote = largeProject
    ? 'One or more tracked initiatives show utilization ≥ ₹1 crore. If the company’s average CSR obligation is also ≥ ₹10 crore, commission an independent Rule 8(3) impact assessment and attach the report.'
    : 'No tracked initiative currently shows ≥ ₹1 crore utilization. Reassess Rule 8(3) if obligation and project outlay thresholds are met.'

  return {
    html: boardCsrAnnexureDraftTemplate({
      companyName: asString(userRow.name) || 'Company',
      cin: cin || null,
      financialYearLabel: currentFinancialYearLabel(),
      csrPolicyOutline: asString(profile.csr_vision || profile.csrVision) || null,
      focusAreas,
      websiteUrl,
      averageNetProfit: averageNetProfitInr > 0 ? averageNetProfitInr : null,
      prescribedSpend2Pct: prescribed,
      totalSpent: totalSpent || null,
      amountUnspent,
      projects: rows,
      impactAssessmentNote,
      gaps,
    }),
    filename: `${slugify(userRow.name || 'company')}-board-csr-annexure-ii-draft.html`,
    label: 'Board Annexure II Draft',
  }
}
