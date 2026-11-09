import 'server-only'
import { supabase } from '@/lib/db'
import { getCampaignLeadNgoId } from '@/lib/campaign-volunteer-attendance'
import {
  loadPaymentRefundTotalsByReferences,
  withConfirmedRefunds,
} from '@/lib/csr-agent/milestone-refund-accounting'
import { AuthError, type UserData } from '@/lib/auth'
import { isProjectFinancialLead } from '@/lib/csr-agent/project-financial-access'

async function attachPaymentRefunds<T extends { csr_payment_confirmations?: Array<{ payment_reference?: string | null }> | null }>(
  project: T
): Promise<T> {
  const payments = Array.isArray(project.csr_payment_confirmations) ? project.csr_payment_confirmations : []
  if (payments.length === 0) return project
  const totals = await loadPaymentRefundTotalsByReferences(payments.map((p) => p.payment_reference))
  return {
    ...project,
    csr_payment_confirmations: withConfirmedRefunds(payments, totals.processedByPaymentRef),
  }
}

async function attachPaymentRefundsMany<T extends { csr_payment_confirmations?: Array<{ payment_reference?: string | null }> | null }>(
  projects: T[]
): Promise<T[]> {
  const refs = projects.flatMap((project) =>
    (Array.isArray(project.csr_payment_confirmations) ? project.csr_payment_confirmations : []).map(
      (payment) => payment.payment_reference
    )
  )
  const totals = await loadPaymentRefundTotalsByReferences(refs)
  return projects.map((project) => ({
    ...project,
    csr_payment_confirmations: withConfirmedRefunds(
      Array.isArray(project.csr_payment_confirmations) ? project.csr_payment_confirmations : [],
      totals.processedByPaymentRef
    ),
  }))
}

export async function loadUserRow(userId: number) {
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

export async function loadCampaignForCompany(campaignId: string, companyId: number) {
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

export async function loadCampaignForLeadNgo(campaignId: string, ngoId: number) {
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

export async function loadProjectForActor(
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
  if (user.user_type === 'ngo' && !isProjectFinancialLead(data, user.id)) {
    throw new AuthError('Insufficient permissions', 403)
  }

  return attachPaymentRefunds(data)
}

export async function loadProjectsForCampaign(campaignId: string) {
  const { data } = await supabase
    .from('csr_projects')
    .select('*, csr_impact_metrics(*), csr_project_milestones(*), csr_payment_confirmations(*)')
    .eq('campaign_id', campaignId)

  return attachPaymentRefundsMany(Array.isArray(data) ? data : [])
}

export async function loadCompanyCampaigns(companyId: number) {
  const { data } = await supabase.from('campaigns').select('*').eq('company_id', companyId)
  return Array.isArray(data) ? data : []
}

export async function loadCompanyProjects(companyId: number) {
  const { data } = await supabase
    .from('csr_projects')
    .select('*, campaigns(*), csr_impact_metrics(*), csr_payment_confirmations(*)')
    .eq('company_user_id', companyId)
  return attachPaymentRefundsMany(Array.isArray(data) ? data : [])
}

export async function resolvePartnerName(userId: number | null | undefined): Promise<string | null> {
  if (!userId || userId <= 0) return null
  const { data } = await supabase.from('users').select('name').eq('id', userId).maybeSingle()
  return data?.name ? String(data.name) : null
}
