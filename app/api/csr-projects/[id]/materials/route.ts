import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage } from '@/lib/utils'
import { opsTable } from '@/lib/csr-agent/project-ops-tables'
import {
  canSubmitProjectOps,
  canViewProjectOps,
  loadCsrProject,
  resolveProjectOpsActor,
} from '@/lib/csr-agent/project-ops-access'
import { submitNgoProjectMaterial } from '@/lib/csr-agent/project-material-write'
import { authErrorResponse } from '@/lib/server-auth'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await resolveProjectOpsActor(request)
    if (!actor) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    const { id: projectId } = await params
    const project = await loadCsrProject(projectId)
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 })
    }
    if (!canViewProjectOps(actor, project)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 })
    }

    const { data, error } = await opsTable('csr_project_materials')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { success: false, error: getErrorMessage(error) || 'Failed to load materials' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('[csr-projects/materials GET]', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) || 'Failed to load materials' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await resolveProjectOpsActor(request, { preferUserSession: true })
    if (!actor) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    const { id: projectId } = await params
    const project = await loadCsrProject(projectId)
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 })
    }
    if (!canSubmitProjectOps(actor, project) || actor.role !== 'ngo') {
      return NextResponse.json(
        { success: false, error: 'Only the assigned NGO can submit material records' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const result = await submitNgoProjectMaterial({ project, actor, body })
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }

    return NextResponse.json({ success: true, data: result.material }, { status: 201 })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('[csr-projects/materials POST]', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) || 'Failed to submit material' },
      { status: 500 }
    )
  }
}
