import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse } from '@/lib/server-auth'
import { getErrorMessage } from '@/lib/utils'
import { canSubmitProjectOps, loadCsrProject, resolveProjectOpsActor } from '@/lib/csr-agent/project-ops-access'
import { resubmitNgoProjectExpense } from '@/lib/csr-agent/project-expense-write'

export const runtime = 'nodejs'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; expenseId: string }> }) {
  try {
    const actor = await resolveProjectOpsActor(request, { preferUserSession: true })
    if (!actor) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    const { id, expenseId } = await params
    const project = await loadCsrProject(id)
    if (!project) return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 })
    if (actor.role !== 'ngo' || !canSubmitProjectOps(actor, project)) {
      return NextResponse.json({ success: false, error: 'Only the authorized lead NGO can resubmit expenses' }, { status: 403 })
    }
    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 })
    }
    const result = await resubmitNgoProjectExpense({ project, actor, expenseId, body })
    if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    return NextResponse.json({ success: true, data: result.expense })
  } catch (error) {
    const auth = authErrorResponse(error)
    if (auth) return auth
    console.error('[csr-projects/expenses/resubmit]', error)
    return NextResponse.json({ success: false, error: getErrorMessage(error) || 'Failed to resubmit expense' }, { status: 500 })
  }
}
