import { NextRequest } from 'next/server'
import { listActiveAssignedProjectIdsForCompanyCa } from '@/lib/company-ca'
import { supabase } from '@/lib/db'
import {
  findAuthUser,
  getAdminUser,
  getAuthUserFromRequest,
  getCompanyCAFromRequest,
  hasCompanyCaPermission,
} from '@/lib/server-auth'
import type { Tables } from '@/lib/database.types'
import { isProjectFinancialLead } from './project-financial-access'
import { resolveNgoProjectViewer } from './ngo-project-viewer'

export type CsrProjectRow = Pick<
  Tables<'csr_projects'>,
  'id' | 'title' | 'company_user_id' | 'ngo_user_id' | 'campaign_id' | 'total_budget'
> & { campaigns?: Pick<Tables<'campaigns'>, 'lead_ngo_user_id'> | null }

export type ProjectOpsActor =
  | { role: 'ngo'; userId: number }
  | { role: 'company'; userId: number }
  | {
      role: 'company_ca'
      userId: number
      companyUserId: number
      companyCAIdentityId: string
      canReview: boolean
      assignedProjectIds: string[]
    }
  | { role: 'admin'; userId: number }

export async function loadCsrProject(projectId: string): Promise<CsrProjectRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null
  const { data, error } = await supabase
    .from('csr_projects')
    .select('id, title, company_user_id, ngo_user_id, campaign_id, total_budget, campaigns(lead_ngo_user_id)')
    .eq('id', projectId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function resolveProjectOpsActor(
  request: NextRequest,
  options: { preferUserSession?: boolean } = {}
): Promise<ProjectOpsActor | null> {
  const ngo = await resolveNgoProjectViewer(request)
  if (ngo) return { role: 'ngo', userId: ngo.id }
  if (options.preferUserSession && findAuthUser(request)) {
    const user = await getAuthUserFromRequest(request)
    if (user.user_type === 'ngo') return { role: 'ngo', userId: user.id }
    if (user.user_type === 'company') return { role: 'company', userId: user.id }
    return null
  }

  const admin = getAdminUser(request)
  if (admin) {
    return { role: 'admin', userId: admin.id }
  }

  try {
    const ca = await getCompanyCAFromRequest(request)
    const assignedProjectIds = await listActiveAssignedProjectIdsForCompanyCa(ca.user.id)
    return {
      role: 'company_ca',
      userId: ca.user.id,
      companyUserId: ca.identity.company_user_id,
      companyCAIdentityId: ca.identity.id,
      canReview: hasCompanyCaPermission(ca.identity, 'can_review_evidence'),
      assignedProjectIds,
    }
  } catch {
    // Fall through to user session.
  }

  if (!findAuthUser(request)) return null
  const user = await getAuthUserFromRequest(request)
  if (user.user_type === 'ngo') return { role: 'ngo', userId: user.id }
  if (user.user_type === 'company') return { role: 'company', userId: user.id }
  return null
}

function companyCaAssignedToProject(
  actor: Extract<ProjectOpsActor, { role: 'company_ca' }>,
  project: CsrProjectRow
): boolean {
  return (
    project.company_user_id === actor.companyUserId &&
    actor.assignedProjectIds.includes(String(project.id))
  )
}

export function canViewProjectOps(actor: ProjectOpsActor, project: CsrProjectRow): boolean {
  if (actor.role === 'admin') return true
  if (actor.role === 'ngo') return isProjectFinancialLead(project, actor.userId)
  if (actor.role === 'company') return project.company_user_id === actor.userId
  if (actor.role === 'company_ca') return companyCaAssignedToProject(actor, project)
  return false
}

export function canSubmitProjectOps(actor: ProjectOpsActor, project: CsrProjectRow): boolean {
  return actor.role === 'ngo' && isProjectFinancialLead(project, actor.userId)
}

export function canReviewProjectOps(actor: ProjectOpsActor, project: CsrProjectRow): boolean {
  if (actor.role === 'admin') return true
  return actor.role === 'company_ca' && actor.canReview && companyCaAssignedToProject(actor, project)
}
