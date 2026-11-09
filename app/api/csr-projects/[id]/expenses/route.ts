import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage } from '@/lib/utils'
import { opsTable } from '@/lib/csr-agent/project-ops-tables'
import {
  canSubmitProjectOps,
  canViewProjectOps,
  loadCsrProject,
  resolveProjectOpsActor,
} from '@/lib/csr-agent/project-ops-access'
import { submitNgoProjectExpense } from '@/lib/csr-agent/project-expense-write'
import { authErrorResponse } from '@/lib/server-auth'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const mine = request.nextUrl.searchParams.get('mine') === '1'
    const actor = await resolveProjectOpsActor(request, {
      preferUserSession: mine,
    })
    if (!actor) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }
    if (mine && actor.role !== 'ngo') {
      return NextResponse.json({ success: false, error: 'Only an NGO can view its submitted expenses' }, { status: 403 })
    }

    const { id: projectId } = await params
    const project = await loadCsrProject(projectId)
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 })
    }
    if (!canViewProjectOps(actor, project)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 })
    }

    let query = opsTable('csr_project_expenses')
      .select('*')
      .eq('project_id', project.id)
      .order('expense_date', { ascending: false })

    if (actor.role === 'ngo' && mine) {
      query = query.eq('created_by', actor.userId)
    }
    const { data, error } = await query
    if (error) {
      return NextResponse.json(
        { success: false, error: getErrorMessage(error) || 'Failed to load expenses' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('[csr-projects/expenses GET]', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) || 'Failed to load expenses' },
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
        { success: false, error: 'Only the assigned NGO can submit project expenses' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const result = await submitNgoProjectExpense({ project, actor, body })
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }

    return NextResponse.json({ success: true, data: result.expense }, { status: 201 })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('[csr-projects/expenses POST]', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) || 'Failed to submit expense' },
      { status: 500 }
    )
  }
}
