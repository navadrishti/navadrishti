import { NextRequest, NextResponse } from 'next/server'
import {
  assertActiveCompanyEmployee,
  assertEmployeeAssignedToCompanyProject,
  CompanyEmployeeError,
} from '@/lib/company-employee'
import { supabase } from '@/lib/db'
import { getAuthUserFromRequest, authErrorResponse } from '@/lib/server-auth'

function resolveProjectId(raw: unknown): string {
  return typeof raw === 'string' ? decodeURIComponent(raw).trim() : ''
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request)
    const identity = await assertActiveCompanyEmployee(user)

    const resolvedParams = await params
    const projectId = resolveProjectId(resolvedParams?.projectId)
    if (!projectId) {
      return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })
    }

    await assertEmployeeAssignedToCompanyProject({
      identity,
      projectId,
    })

    const { data: project, error: projectError } = await supabase
      .from('csr_projects')
      .select(
        'id, title, description, project_status, region, start_date, end_date, total_budget, ngo_user_id, company_user_id, metadata, created_at, updated_at'
      )
      .eq('id', projectId)
      .eq('company_user_id', identity.company_user_id)
      .maybeSingle()

    if (projectError) {
      console.error('Employee project lookup failed')
      return NextResponse.json({ error: 'Authorization service temporarily unavailable' }, { status: 503 })
    }
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { data: milestones, error: milestoneError } = await supabase
      .from('csr_project_milestones')
      .select(
        'id, title, description, status, due_date, amount, milestone_order, evidence_requirements, created_at, updated_at'
      )
      .eq('project_id', projectId)
      .order('milestone_order', { ascending: true })

    if (milestoneError) {
      console.error('Failed to load employee project milestones:', milestoneError)
    }

    const milestoneIds = (milestones ?? []).map((row) => String(row.id))
    const { data: reviews, error: reviewError } =
      milestoneIds.length > 0
        ? await supabase
            .from('csr_milestone_reviews')
            .select('id, milestone_id, evidence_id, decision, comments, reviewed_at, created_at, reviewer_id')
            .in('milestone_id', milestoneIds)
            .order('created_at', { ascending: false })
        : { data: [], error: null }

    if (reviewError) {
      console.error('Failed to load employee project reviews:', reviewError)
    }

    const { data: evidence, error: evidenceError } = await supabase
      .from('csr_milestone_evidence')
      .select(
        'id, milestone_id, submission_status, description, uploaded_at, captured_at, created_at, uploaded_by'
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (evidenceError) {
      console.error('Failed to load employee project evidence summary:', evidenceError)
    }

    let ngoName: string | null = null
    if (project.ngo_user_id) {
      const { data: ngo } = await supabase
        .from('users')
        .select('name')
        .eq('id', project.ngo_user_id)
        .maybeSingle()
      ngoName = ngo?.name ? String(ngo.name) : null
    }

    const reviewsByMilestone: Record<string, unknown[]> = {}
    for (const review of reviews ?? []) {
      const key = String(review.milestone_id)
      if (!reviewsByMilestone[key]) reviewsByMilestone[key] = []
      reviewsByMilestone[key].push(review)
    }

    return NextResponse.json({
      success: true,
      data: {
        project: {
          ...project,
          ngo_name: ngoName,
        },
        milestones: (milestoneError ? [] : milestones ?? []).map((milestone) => ({
          ...milestone,
          reviews: reviewsByMilestone[String(milestone.id)] ?? [],
        })),
        evidence_summary: evidenceError ? [] : evidence ?? [],
      },
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    if (error instanceof CompanyEmployeeError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Employee project detail error:', error)
    return NextResponse.json({ error: 'Failed to load project' }, { status: 500 })
  }
}
