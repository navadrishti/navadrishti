import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage } from '@/lib/utils'
import { authErrorResponse } from '@/lib/server-auth'
import {
  canReviewProjectOps,
  loadCsrProject,
  resolveProjectOpsActor,
} from '@/lib/csr-agent/project-ops-access'
import { reviewProjectMaterial } from '@/lib/csr-agent/project-material-write'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; materialId: string }> }
) {
  try {
    const actor = await resolveProjectOpsActor(request)
    if (!actor) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    const { id: projectId, materialId } = await params
    const project = await loadCsrProject(projectId)
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 })
    }
    if (!canReviewProjectOps(actor, project)) {
      return NextResponse.json(
        { success: false, error: 'Only an authorized Evidence Verifier can review materials' },
        { status: 403 }
      )
    }
    if (actor.role !== 'company_ca' && actor.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const action = String(body?.action || '').trim()
    if (action !== 'acknowledge' && action !== 'flag_discrepancy') {
      return NextResponse.json(
        { success: false, error: 'action must be acknowledge or flag_discrepancy' },
        { status: 400 }
      )
    }

    const result = await reviewProjectMaterial({
      project,
      actor,
      materialId,
      action,
      reason: body?.reason ?? body?.comments ?? null,
      discrepancy_flags: body?.discrepancy_flags,
    })
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }

    return NextResponse.json({ success: true, data: result.material })
  } catch (error) {
    const auth = authErrorResponse(error)
    if (auth) return auth
    console.error('[csr-projects/materials/review]', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) || 'Failed to review material' },
      { status: 500 }
    )
  }
}
