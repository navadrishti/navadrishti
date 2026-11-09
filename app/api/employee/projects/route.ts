import { NextRequest, NextResponse } from 'next/server'
import {
  EMPLOYEE_MILESTONE_COMPLETED_STATUSES,
  EMPLOYEE_MILESTONE_PENDING_REVIEW_STATUSES,
  EMPLOYEE_MILESTONE_REJECTED_STATUSES,
} from '@/lib/company-employee-access'
import { assertActiveCompanyEmployee, listAuthorizedEmployeeProjects } from '@/lib/company-employee'
import { supabase } from '@/lib/db'
import { getAuthUserFromRequest, authErrorResponse } from '@/lib/server-auth'

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request)
    const identity = await assertActiveCompanyEmployee(user)

    const assignments = await listAuthorizedEmployeeProjects(identity)

    const projectIds = (assignments ?? [])
      .map((row) => String(row.project_id))
      .filter(Boolean)

    const milestoneCounts = new Map<
      string,
      { total: number; completed: number; pending_review: number; rejected: number }
    >()
    if (projectIds.length > 0) {
      const { data: milestones, error: milestoneError } = await supabase
        .from('csr_project_milestones')
        .select('id, project_id, status')
        .in('project_id', projectIds)

      if (milestoneError) {
        console.error('Failed to load milestone summary for employee projects:', milestoneError)
      } else {
        for (const milestone of milestones ?? []) {
          const key = String(milestone.project_id)
          const current = milestoneCounts.get(key) ?? {
            total: 0,
            completed: 0,
            pending_review: 0,
            rejected: 0,
          }
          current.total += 1
          const status = String(milestone.status || '').toLowerCase()
          if (EMPLOYEE_MILESTONE_COMPLETED_STATUSES.has(status)) {
            current.completed += 1
          }
          if (EMPLOYEE_MILESTONE_PENDING_REVIEW_STATUSES.has(status)) {
            current.pending_review += 1
          }
          if (EMPLOYEE_MILESTONE_REJECTED_STATUSES.has(status)) {
            current.rejected += 1
          }
          milestoneCounts.set(key, current)
        }
      }
    }

    const ngoIds = [
      ...new Set(
        (assignments ?? [])
          .map((row) => {
            const project = Array.isArray(row.project) ? row.project[0] : row.project
            return project && typeof project === 'object' && 'ngo_user_id' in project
              ? Number((project as { ngo_user_id?: number }).ngo_user_id)
              : null
          })
          .filter((id): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0)
      ),
    ]

    const ngoNames = new Map<number, string>()
    if (ngoIds.length > 0) {
      const { data: ngos } = await supabase.from('users').select('id, name').in('id', ngoIds)
      for (const ngo of ngos ?? []) {
        ngoNames.set(Number(ngo.id), String(ngo.name || 'NGO'))
      }
    }

    const projects = (assignments ?? []).map((row) => {
      const projectRaw = Array.isArray(row.project) ? row.project[0] : row.project
      const project =
        projectRaw && typeof projectRaw === 'object'
          ? (projectRaw as Record<string, unknown>)
          : null
      const projectId = String(row.project_id)
      const counts = milestoneCounts.get(projectId) ?? {
        total: 0,
        completed: 0,
        pending_review: 0,
        rejected: 0,
      }
      const ngoUserId = project?.ngo_user_id == null ? null : Number(project.ngo_user_id)

      return {
        assignment_id: row.id,
        assigned_at: row.assigned_at,
        project_id: projectId,
        title: project ? String(project.title || 'CSR project') : 'CSR project',
        project_status: project ? String(project.project_status || '') : '',
        region: project?.region == null ? null : String(project.region),
        start_date: project?.start_date == null ? null : String(project.start_date),
        end_date: project?.end_date == null ? null : String(project.end_date),
        ngo_user_id: ngoUserId,
        ngo_name: ngoUserId ? ngoNames.get(ngoUserId) || 'NGO' : null,
        milestone_total: counts.total,
        milestone_completed: counts.completed,
        pending_reviews: counts.pending_review,
        rejected_milestones: counts.rejected,
      }
    })

    return NextResponse.json({ success: true, data: projects })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('Employee projects list error:', error)
    return NextResponse.json({ error: 'Failed to list assigned projects' }, { status: 500 })
  }
}
