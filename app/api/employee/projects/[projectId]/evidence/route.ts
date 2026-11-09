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

    const { data: milestones, error: milestoneError } = await supabase
      .from('csr_project_milestones')
      .select('id, title, status, milestone_order, due_date, evidence_requirements')
      .eq('project_id', projectId)
      .order('milestone_order', { ascending: true })

    if (milestoneError) {
      console.error('Employee evidence milestones error:', milestoneError)
      return NextResponse.json({ error: 'Failed to load evidence' }, { status: 500 })
    }

    const milestoneIds = (milestones ?? []).map((row) => row.id)
    const [evidenceResult, reviewResult] = await Promise.all([
      milestoneIds.length > 0
        ? supabase
            .from('csr_milestone_evidence')
            .select('*')
            .in('milestone_id', milestoneIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      milestoneIds.length > 0
        ? supabase
            .from('csr_milestone_reviews')
            .select('*')
            .in('milestone_id', milestoneIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ])

    if (evidenceResult.error || reviewResult.error) {
      console.error('Employee evidence fetch error:', {
        evidenceError: evidenceResult.error,
        reviewError: reviewResult.error,
      })
      return NextResponse.json({ error: 'Failed to load evidence' }, { status: 500 })
    }

    const evidenceRows = evidenceResult.data ?? []
    const evidenceIds = evidenceRows.map((row) => row.id)

    const [mediaResult, documentsResult] = await Promise.all([
      evidenceIds.length > 0
        ? supabase
            .from('csr_milestone_evidence_media')
            .select('*')
            .in('evidence_id', evidenceIds)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      evidenceIds.length > 0
        ? supabase
            .from('csr_milestone_evidence_documents')
            .select('*')
            .in('evidence_id', evidenceIds)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ])

    if (mediaResult.error || documentsResult.error) {
      console.error('Employee evidence media/docs error:', {
        mediaError: mediaResult.error,
        documentsError: documentsResult.error,
      })
      return NextResponse.json({ error: 'Failed to load evidence uploads' }, { status: 500 })
    }

    const mediaByEvidence: Record<string, unknown[]> = {}
    for (const row of mediaResult.data ?? []) {
      const key = String(row.evidence_id)
      if (!mediaByEvidence[key]) mediaByEvidence[key] = []
      mediaByEvidence[key].push(row)
    }

    const documentsByEvidence: Record<string, unknown[]> = {}
    for (const row of documentsResult.data ?? []) {
      const key = String(row.evidence_id)
      if (!documentsByEvidence[key]) documentsByEvidence[key] = []
      documentsByEvidence[key].push(row)
    }

    const reviewsByMilestone: Record<string, unknown[]> = {}
    for (const row of reviewResult.data ?? []) {
      const key = String(row.milestone_id)
      if (!reviewsByMilestone[key]) reviewsByMilestone[key] = []
      reviewsByMilestone[key].push(row)
    }

    const evidenceByMilestone: Record<string, unknown[]> = {}
    for (const row of evidenceRows) {
      const key = String(row.milestone_id)
      if (!evidenceByMilestone[key]) evidenceByMilestone[key] = []
      evidenceByMilestone[key].push({
        ...row,
        media: mediaByEvidence[String(row.id)] ?? [],
        documents: documentsByEvidence[String(row.id)] ?? [],
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        timeline: (milestones ?? []).map((milestone) => ({
          milestone,
          evidence: evidenceByMilestone[String(milestone.id)] ?? [],
          reviews: reviewsByMilestone[String(milestone.id)] ?? [],
        })),
      },
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    if (error instanceof CompanyEmployeeError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Employee evidence route error:', error)
    return NextResponse.json({ error: 'Failed to load evidence' }, { status: 500 })
  }
}
