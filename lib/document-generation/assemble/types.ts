import type { UserData } from '@/lib/auth'
import type { Tables } from '@/lib/database.types'
import type { GenerateDocumentRequest, ImpactReportPeriod } from '@/lib/document-generation/types'

export type OrganizationRow = Pick<
  Tables<'users'>,
  'id' | 'name' | 'email' | 'user_type' | 'profile_data' | 'verification_status'
>

export type CampaignRow = Tables<'campaigns'>

export type ProjectImpactSource = { csr_impact_metrics?: Tables<'csr_impact_metrics'>[] | null }
export type ProjectMilestoneSource = { csr_project_milestones?: Tables<'csr_project_milestones'>[] | null }
export type ProjectPaymentSource = { csr_payment_confirmations?: Tables<'csr_payment_confirmations'>[] | null }

// Report builders also fall back to legacy keys (category, location, budget_inr, …) that are not csr_projects columns.
export type CsrProjectDetail = Tables<'csr_projects'> &
  ProjectImpactSource &
  ProjectMilestoneSource &
  ProjectPaymentSource & {
    campaigns?: CampaignRow | null
  } & Record<string, unknown>

export type PeriodDocumentContext = {
  user: UserData
  request: GenerateDocumentRequest
  userRow: OrganizationRow
  organizationName: string
  period: ImpactReportPeriod
}
