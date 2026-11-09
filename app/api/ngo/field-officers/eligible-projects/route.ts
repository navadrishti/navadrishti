import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { getAuthUserFromRequest, authErrorResponse } from '@/lib/server-auth'
import {
  assertVerifiedNgoFieldOfficerManager,
  FIELD_ASSIGNABLE_PROJECT_STATUSES,
  isProjectEligibleForFieldAssignment,
} from '@/lib/ngo-field-officer'
import { describeFieldAssignmentLock } from '@/lib/field-officer-assignment-lock'
import { isProjectFinancialLead } from '@/lib/csr-agent/project-financial-access'

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request)
    await assertVerifiedNgoFieldOfficerManager(user)

    const { data, error } = await supabase
      .from('csr_projects')
      .select('id, title, project_status, region, start_date, end_date, created_at, updated_at, ngo_user_id, campaign_id, campaigns(lead_ngo_user_id)')
      .eq('ngo_user_id', user.id)
      .in('project_status', [...FIELD_ASSIGNABLE_PROJECT_STATUSES])
      .order('title', { ascending: true })

    if (error) {
      console.error('Failed to list eligible field-officer projects:', error)
      return NextResponse.json({ error: 'Failed to list eligible projects' }, { status: 500 })
    }

    const now = new Date()
    const projects = (data ?? [])
      .filter((project) => isProjectEligibleForFieldAssignment(project.project_status) && isProjectFinancialLead(project, user.id))
      .map((project) => {
        const lock = describeFieldAssignmentLock(
          project.start_date == null ? null : String(project.start_date),
          now
        )
        return {
          id: project.id,
          title: project.title,
          project_status: project.project_status,
          region: project.region,
          start_date: project.start_date,
          end_date: project.end_date,
          created_at: project.created_at,
          updated_at: project.updated_at,
          assignment_lock: lock,
          assignment_editable: !lock.locked,
        }
      })

    return NextResponse.json({ success: true, data: projects })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse

    console.error('Eligible field-officer projects error:', error)
    return NextResponse.json({ error: 'Failed to list eligible projects' }, { status: 500 })
  }
}
