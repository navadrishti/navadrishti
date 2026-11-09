import type { Tables } from '@/lib/database.types'

type ProjectLeadScope = Pick<Tables<'csr_projects'>, 'ngo_user_id'> & {
  campaign_id: string | null
  campaigns?: Pick<Tables<'campaigns'>, 'lead_ngo_user_id'> | null
}

export function isProjectFinancialLead(project: ProjectLeadScope, userId: number): boolean {
  return (
    Number.isInteger(userId) &&
    userId > 0 &&
    project.ngo_user_id === userId &&
    Boolean(project.campaign_id) &&
    project.campaigns?.lead_ngo_user_id === userId
  )
}
