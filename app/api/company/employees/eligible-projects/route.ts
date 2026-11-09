import { NextRequest, NextResponse } from 'next/server'
import {
  assertVerifiedCompanyEmployeeManager,
  isProjectEligibleForEmployeeAssignment,
} from '@/lib/company-employee'
import { supabase } from '@/lib/db'
import { getAuthUserFromRequest, authErrorResponse } from '@/lib/server-auth'

const ASSIGNABLE = ['planning', 'active', 'on-hold', 'in_progress', 'submitted'] as const

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request)
    await assertVerifiedCompanyEmployeeManager(user)

    const { data, error } = await supabase
      .from('csr_projects')
      .select('id, title, project_status, region, start_date, end_date, created_at, updated_at')
      .eq('company_user_id', user.id)
      .in('project_status', [...ASSIGNABLE])
      .order('title', { ascending: true })

    if (error) {
      console.error('Failed to list eligible employee projects:', error)
      return NextResponse.json({ error: 'Failed to list eligible projects' }, { status: 500 })
    }

    const projects = (data ?? []).filter((project) =>
      isProjectEligibleForEmployeeAssignment(project.project_status)
    )

    return NextResponse.json({ success: true, data: projects })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('Eligible company-employee projects error:', error)
    return NextResponse.json({ error: 'Failed to list eligible projects' }, { status: 500 })
  }
}
