import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { getAuthUserFromRequest, authErrorResponse } from '@/lib/server-auth'
import { assertVerifiedNgoFieldOfficerManager } from '@/lib/ngo-field-officer'

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request)
    await assertVerifiedNgoFieldOfficerManager(user)

    const projectId = String(request.nextUrl.searchParams.get('projectId') || '').trim()
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const { data: project, error: projectError } = await supabase
      .from('csr_projects')
      .select('id, title, project_status, ngo_user_id')
      .eq('id', projectId)
      .eq('ngo_user_id', user.id)
      .maybeSingle()

    if (projectError) {
      console.error('Failed to load project for assignment roster:', projectError)
      return NextResponse.json({ error: 'Failed to list project assignments' }, { status: 500 })
    }
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('ngo_field_officer_project_assignments')
      .select(
        `
        id, field_officer_identity_id, field_officer_user_id, ngo_user_id, project_id,
        status, assigned_by, assigned_at, deactivated_at, created_at, updated_at,
        identity:field_officer_identity_id (
          id, status, users:user_id (id, name, email)
        )
      `
      )
      .eq('ngo_user_id', user.id)
      .eq('project_id', projectId)
      .order('assigned_at', { ascending: false })

    if (error) {
      console.error('Failed to list project field-officer assignments:', error)
      return NextResponse.json({ error: 'Failed to list project assignments' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: {
        project,
        assignments: data ?? [],
      },
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse

    console.error('Project field-officer assignments error:', error)
    return NextResponse.json({ error: 'Failed to list project assignments' }, { status: 500 })
  }
}
