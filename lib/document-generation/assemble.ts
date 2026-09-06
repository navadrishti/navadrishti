import 'server-only'
import { supabase } from '@/lib/db'
import { getCampaignLeadNgoId } from '@/lib/campaign-volunteer-attendance'
import { readCampaignCategory, readCampaignLocation } from '@/lib/campaign-schema'
import {
  CA_COMPLIANCE_TAG_KEYS,
  CA_COMPLIANCE_TAG_LABELS,
  getCaComplianceTagExpiry,
  getCaComplianceTags,
  summarizeDocumentExpiries,
  type UserData,
} from '@/lib/auth'
import type {
  DocumentTypeId,
  GenerateDocumentRequest,
  ImpactReportPeriod,
} from '@/lib/document-generation/types'
import {
  boardCsrAnnexureDraftTemplate,
  csrComplianceProfileTemplate,
  impactReportTemplate,
  implementingAgencyReportTemplate,
  ngoCompliancePackTemplate,
  utilizationCertificateTemplate,
  type ImpactReportData,
  type UtilizationCertificateData,
} from '@/lib/document-generation/templates/company/csr-compliance-profile.template'
import { csrPolicyDocumentTemplate } from '@/lib/document-generation/templates/company/csr-policy-document.template'

function asRecord(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, any>
}

function asNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function asString(value: unknown): string {
  return String(value ?? '').trim()
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'document'
}

function periodLabel(period: ImpactReportPeriod, start?: string | null, end?: string | null): string {
  if (period === 'quarterly') return 'Quarterly'
  if (period === 'annual') return 'Annual'
  if (start || end) return `Custom (${start || '…'} → ${end || '…'})`
  return 'Custom Period'
}

function defaultPeriodBounds(period: ImpactReportPeriod): { start: string; end: string } {
  const end = new Date()
  const start = new Date(end)
  if (period === 'annual') {
    start.setFullYear(end.getFullYear() - 1)
  } else if (period === 'quarterly') {
    start.setMonth(end.getMonth() - 3)
  } else {
    start.setMonth(end.getMonth() - 1)
  }
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

async function loadUserRow(userId: number) {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, user_type, profile_data, verification_status')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) {
    throw new Error('Unable to load organization profile')
  }
  return data
}

async function loadCampaignForCompany(campaignId: string, companyId: number) {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (error || !data) {
    throw new Error('Campaign not found or not owned by this company')
  }
  return data
}

async function loadCampaignForLeadNgo(campaignId: string, ngoId: number) {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .maybeSingle()

  if (error || !data) {
    throw new Error('Campaign not found')
  }

  if (getCampaignLeadNgoId(data) !== ngoId) {
    throw new Error('Campaign is not assigned to this NGO as lead')
  }

  return data
}

async function loadProjectForActor(
  projectId: string,
  user: UserData
) {
  const { data, error } = await supabase
    .from('csr_projects')
    .select('*, campaigns(*), csr_impact_metrics(*), csr_project_milestones(*), csr_payment_confirmations(*)')
    .eq('id', projectId)
    .maybeSingle()

  if (error || !data) {
    throw new Error('CSR project not found')
  }

  if (user.user_type === 'company' && Number(data.company_user_id) !== user.id) {
    throw new Error('Project not owned by this company')
  }
  if (user.user_type === 'ngo' && Number(data.ngo_user_id) !== user.id) {
    throw new Error('Project not assigned to this NGO')
  }

  return data
}

async function loadProjectsForCampaign(campaignId: string) {
  const { data } = await supabase
    .from('csr_projects')
    .select('*, csr_impact_metrics(*), csr_project_milestones(*), csr_payment_confirmations(*)')
    .eq('campaign_id', campaignId)

  return Array.isArray(data) ? data : []
}

async function resolvePartnerName(userId: number | null | undefined): Promise<string | null> {
  if (!userId || userId <= 0) return null
  const { data } = await supabase.from('users').select('name').eq('id', userId).maybeSingle()
  return data?.name ? String(data.name) : null
}

function pickLatestImpact(project: any) {
  const metrics = Array.isArray(project?.csr_impact_metrics) ? project.csr_impact_metrics : []
  return metrics[0] || null
}

function milestonesFromCampaign(campaign: any) {
  const raw = Array.isArray(campaign?.milestones) ? campaign.milestones : []
  return raw.map((item: any) => ({
    title: asString(item?.title) || 'Untitled milestone',
    status: asString(item?.status) || null,
    budgetAllocated: asNumber(item?.budget_allocated ?? item?.budget),
    dueDate: item?.due_date || item?.end_date || null,
    description: asString(item?.description) || null,
  }))
}

function milestonesFromProject(project: any) {
  const raw = Array.isArray(project?.csr_project_milestones) ? project.csr_project_milestones : []
  return raw
    .slice()
    .sort((a: any, b: any) => Number(a.milestone_order || 0) - Number(b.milestone_order || 0))
    .map((item: any) => ({
      title: asString(item?.title) || 'Untitled milestone',
      status: asString(item?.status) || null,
      budgetAllocated: asNumber(item?.budget_allocated),
      dueDate: item?.due_date || null,
      description: asString(item?.description) || null,
    }))
}

function paymentLineItems(project: any) {
  const payments = Array.isArray(project?.csr_payment_confirmations)
    ? project.csr_payment_confirmations
    : []
  return payments.map((payment: any, index: number) => ({
    label: asString(payment?.description) || `Payment ${index + 1}`,
    amount: asNumber(payment?.amount),
    status: asString(payment?.payment_status) || null,
    note: asString(payment?.reference_id) || null,
  }))
}

function confirmedFunds(project: any): number {
  const payments = Array.isArray(project?.csr_payment_confirmations)
    ? project.csr_payment_confirmations
    : []
  return payments
    .filter((payment: any) => String(payment?.payment_status || '').toLowerCase() === 'confirmed')
    .reduce((sum: number, payment: any) => sum + asNumber(payment?.amount), 0)
}

function currentFinancialYearLabel(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  // Indian FY: Apr–Mar
  if (month >= 3) return `FY ${year}-${String(year + 1).slice(-2)}`
  return `FY ${year - 1}-${String(year).slice(-2)}`
}

function companyFocusAreas(profile: Record<string, any>): string[] {
  const focusRaw = profile.focus_areas_schedule_vii ?? profile.focus_areas ?? profile.focusAreas
  if (Array.isArray(focusRaw)) return focusRaw.map((item) => asString(item)).filter(Boolean)
  return asString(focusRaw) ? [asString(focusRaw)] : []
}

function companyWebsite(profile: Record<string, any>): string | null {
  return (
    asString(profile.website || profile.company_website || profile.csr_policy_url || profile.csrPolicyUrl) ||
    null
  )
}

function buildCompliance(userRow: any) {
  const profile = asRecord(userRow.profile_data)
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

function buildPolicy(userRow: any) {
  const profile = asRecord(userRow.profile_data)
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

function buildImpactFromCampaign(args: {
  campaign: any
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
  const impact = asRecord(args.campaign.impact_metrics)
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
    customMetrics: args.customMetrics ?? asRecord(impact.custom_metrics),
    gaps: args.gaps || [],
  }

  return {
    html: impactReportTemplate(payload),
    filename: `${slugify(args.organizationName)}-impact-${args.period}-${slugify(payload.entityTitle)}.html`,
    label: `${periodLabel(args.period)} Impact Report`,
    entityTitle: payload.entityTitle,
  }
}

function buildImpactFromProject(args: {
  project: any
  organizationName: string
  audienceLabel: string
  partnerName?: string | null
  period: ImpactReportPeriod
  periodStart?: string | null
  periodEnd?: string | null
}) {
  const campaign = asRecord(args.project.campaigns)
  const impact = pickLatestImpact(args.project) || asRecord(args.project.latest_impact)
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
    customMetrics: asRecord(impact?.custom_metrics),
    gaps,
  }

  return {
    html: impactReportTemplate(payload),
    filename: `${slugify(args.organizationName)}-project-impact-${slugify(payload.entityTitle)}.html`,
    label: 'Project Impact Report',
    entityTitle: payload.entityTitle,
  }
}

function buildUtilization(args: {
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

async function loadCompanyCampaigns(companyId: number) {
  const { data } = await supabase.from('campaigns').select('*').eq('company_id', companyId)
  return Array.isArray(data) ? data : []
}

async function loadCompanyProjects(companyId: number) {
  const { data } = await supabase
    .from('csr_projects')
    .select('*, campaigns(*), csr_impact_metrics(*), csr_payment_confirmations(*)')
    .eq('company_user_id', companyId)
  return Array.isArray(data) ? data : []
}

async function buildBoardAnnexureDraft(userRow: any, companyId: number) {
  const profile = asRecord(userRow.profile_data)
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

  const projects = await loadCompanyProjects(companyId)
  const campaigns = await loadCompanyCampaigns(companyId)
  const rows: Array<{
    name: string
    scheduleVii?: string | null
    location?: string | null
    implementingAgency?: string | null
    amountSpent?: number | null
    status?: string | null
    mode?: string | null
  }> = []

  if (projects.length) {
    for (const project of projects) {
      const campaign = asRecord(project.campaigns)
      const impact = pickLatestImpact(project)
      const agencyName = await resolvePartnerName(project.ngo_user_id)
      const spent = asNumber(impact?.funds_utilized) || confirmedFunds(project)
      rows.push({
        name: asString(project.title) || asString(campaign.title) || 'CSR Project',
        scheduleVii: asString(project.schedule_vii || campaign.schedule_vii) || null,
        location:
          asString(project.region || project.location) || readCampaignLocation(campaign) || null,
        implementingAgency: agencyName,
        amountSpent: spent || null,
        status: asString(project.project_status || project.status) || null,
        mode: agencyName ? 'Through implementing agency' : 'Direct / as recorded',
      })
    }
  } else {
    for (const campaign of campaigns) {
      const agencyId = getCampaignLeadNgoId(campaign)
      const agencyName = await resolvePartnerName(agencyId)
      const impact = asRecord(campaign.impact_metrics)
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

function buildNgoCompliancePack(userRow: any) {
  const profile = asRecord(userRow.profile_data)
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
  userRow: any
  organizationName: string
  campaign?: any
  project?: any
  period: ImpactReportPeriod
  periodStart?: string | null
  periodEnd?: string | null
}) {
  const profile = asRecord(args.userRow.profile_data)
  const liveTags = getCaComplianceTags(profile, args.userRow.verification_status)
  const registrationHints = liveTags.map((key) => `${CA_COMPLIANCE_TAG_LABELS[key]} recorded on GRAM`)
  const bounds = defaultPeriodBounds(args.period)
  const periodStart = args.periodStart || bounds.start
  const periodEnd = args.periodEnd || bounds.end
  const gaps: string[] = []
  if (!liveTags.includes('csr1')) gaps.push('CSR-1 tag not live — funders typically require Form CSR-1 registration')

  if (args.project) {
    const project = args.project
    const campaign = asRecord(project.campaigns)
    const impact = pickLatestImpact(project)
    const companyName = await resolvePartnerName(project.company_user_id)
    const entityTitle =
      asString(project.title) || asString(campaign.title) || 'Untitled project'
    if (!impact) gaps.push('No csr_impact_metrics row found for this project')

    return {
      html: implementingAgencyReportTemplate({
        ngoName: args.organizationName,
        companyName,
        entityTitle,
        entityTypeLabel: 'CSR Project',
        registrationHints,
        location:
          asString(project.region || project.location) || readCampaignLocation(campaign) || null,
        scheduleVii: asString(project.schedule_vii || campaign.schedule_vii) || null,
        periodLabel: periodLabel(args.period, periodStart, periodEnd),
        budgetInr: asNumber(project.budget_inr ?? campaign.budget_inr),
        fundsReceived: confirmedFunds(project),
        fundsUtilized: asNumber(impact?.funds_utilized),
        beneficiaries: asNumber(impact?.beneficiaries),
        progressPercentage: asNumber(impact?.progress_percentage),
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
  const impact = asRecord(campaign.impact_metrics)
  const entityTitle = asString(campaign.title) || 'Untitled campaign'

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
      fundsReceived: null,
      fundsUtilized: asNumber(impact.funds_utilized),
      beneficiaries: asNumber(impact.beneficiaries ?? impact.expected_beneficiaries),
      progressPercentage: asNumber(impact.progress_percentage),
      milestones: milestonesFromCampaign(campaign),
      activitiesSummary: asString(campaign.description) || null,
      gaps,
    }),
    filename: `${slugify(args.organizationName)}-implementing-agency-${slugify(entityTitle)}.html`,
    label: 'Implementing Agency Project Report',
    entityTitle,
  }
}

export async function assembleGeneratedDocument(
  user: UserData,
  request: GenerateDocumentRequest
) {
  const documentType = request.documentType as DocumentTypeId
  const userRow = await loadUserRow(user.id)
  const organizationName = asString(userRow.name) || (user.user_type === 'ngo' ? 'NGO' : 'Company')

  if (documentType === 'csr_compliance_profile') {
    if (user.user_type !== 'company') throw new Error('CSR Compliance Profile is available to companies only')
    return buildCompliance(userRow)
  }

  if (documentType === 'csr_policy_document') {
    if (user.user_type !== 'company') throw new Error('CSR Policy Document is available to companies only')
    return buildPolicy(userRow)
  }

  if (documentType === 'board_csr_annexure_draft') {
    if (user.user_type !== 'company') throw new Error('Board Annexure II draft is available to companies only')
    return buildBoardAnnexureDraft(userRow, user.id)
  }

  if (documentType === 'ngo_compliance_pack') {
    if (user.user_type !== 'ngo') throw new Error('NGO Compliance Pack is available to NGOs only')
    return buildNgoCompliancePack(userRow)
  }

  const period = (request.period || 'annual') as ImpactReportPeriod

  if (documentType === 'implementing_agency_report') {
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
      return buildImplementingAgencyReport({
        userRow,
        organizationName,
        campaign,
        period,
        periodStart: request.periodStart,
        periodEnd: request.periodEnd,
      })
    }
    throw new Error('Select a project or lead campaign for the implementing agency report')
  }

  if (documentType === 'impact_report') {
    if (user.user_type === 'company') {
      if (!request.campaignId) throw new Error('Select a campaign for the impact report')
      const campaign = await loadCampaignForCompany(request.campaignId, user.id)
      const projects = await loadProjectsForCampaign(campaign.id)
      const leadNgoId = getCampaignLeadNgoId(campaign)
      const partnerName = await resolvePartnerName(leadNgoId || projects[0]?.ngo_user_id)
      const fundsUtilized = projects.reduce(
        (sum, project) => sum + asNumber(pickLatestImpact(project)?.funds_utilized),
        0
      )
      const beneficiaries = projects.reduce(
        (sum, project) => sum + asNumber(pickLatestImpact(project)?.beneficiaries),
        asNumber(asRecord(campaign.impact_metrics).beneficiaries)
      )
      const progressValues = projects
        .map((project) => asNumber(pickLatestImpact(project)?.progress_percentage))
        .filter((value) => value > 0)
      const progressPercentage = progressValues.length
        ? Math.round(progressValues.reduce((a, b) => a + b, 0) / progressValues.length)
        : asNumber(asRecord(campaign.impact_metrics).progress_percentage)

      return buildImpactFromCampaign({
        campaign,
        organizationName,
        audienceLabel: 'Company CSR Board / Management',
        partnerName,
        period,
        periodStart: request.periodStart,
        periodEnd: request.periodEnd,
        fundsUtilized: fundsUtilized || asNumber(asRecord(campaign.impact_metrics).funds_utilized),
        beneficiaries,
        progressPercentage,
        gaps: projects.length ? [] : ['No linked CSR projects yet — metrics may be incomplete'],
      })
    }

    if (user.user_type === 'ngo') {
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

    throw new Error('Impact reports are available to companies and NGOs only')
  }

  if (documentType === 'utilization_certificate') {
    if (user.user_type === 'company') {
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
          budgetInr: asNumber(project.budget_inr ?? project.campaigns?.budget_inr),
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
      const fundsUtilized = projects.reduce(
        (sum, project) => sum + asNumber(pickLatestImpact(project)?.funds_utilized),
        asNumber(asRecord(campaign.impact_metrics).funds_utilized)
      )
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

    if (user.user_type === 'ngo') {
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
          budgetInr: asNumber(project.budget_inr ?? project.campaigns?.budget_inr),
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
        const fundsUtilized = ngoProjects.reduce(
          (sum, project) => sum + asNumber(pickLatestImpact(project)?.funds_utilized),
          asNumber(asRecord(campaign.impact_metrics).funds_utilized)
        )
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

    throw new Error('Utilization certificates are available to companies and NGOs only')
  }

  throw new Error('Unsupported document type')
}
