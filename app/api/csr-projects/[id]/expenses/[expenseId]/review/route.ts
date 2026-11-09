import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage } from '@/lib/utils'
import { authErrorResponse } from '@/lib/server-auth'
import {
  canReviewProjectOps,
  loadCsrProject,
  resolveProjectOpsActor,
} from '@/lib/csr-agent/project-ops-access'
import {
  reviewProjectExpense,
  type ExpenseReviewAction,
} from '@/lib/csr-agent/project-expense-write'

export const runtime = 'nodejs'

const ACTIONS = new Set<ExpenseReviewAction>(['approve', 'reject', 'unreconciled'])

/**
 * Evidence Verifier (or admin) expense review.
 * NGOs cannot approve their own submissions — canReviewProjectOps excludes ngo.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
  try {
    const actor = await resolveProjectOpsActor(request)
    if (!actor) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    const { id: projectId, expenseId } = await params
    const project = await loadCsrProject(projectId)
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 })
    }
    if (!canReviewProjectOps(actor, project)) {
      return NextResponse.json(
        { success: false, error: 'Only an authorized Evidence Verifier can review expenses' },
        { status: 403 }
      )
    }
    if (actor.role !== 'company_ca' && actor.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const action = String(body?.action || '').trim() as ExpenseReviewAction
    if (!ACTIONS.has(action)) {
      return NextResponse.json(
        { success: false, error: 'action must be approve, reject, or unreconciled' },
        { status: 400 }
      )
    }

    const result = await reviewProjectExpense({
      project,
      actor,
      expenseId,
      action,
      reason: body?.reason ?? body?.comments ?? null,
    })
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }

    return NextResponse.json({ success: true, data: result.expense })
  } catch (error) {
    const auth = authErrorResponse(error)
    if (auth) return auth
    console.error('[csr-projects/expenses/review]', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) || 'Failed to review expense' },
      { status: 500 }
    )
  }
}
