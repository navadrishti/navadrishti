import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { assertUserType, authErrorResponse, getAuthUserFromRequest } from '@/lib/server-auth'
import {
  getVolunteerApplicationForUser,
  isCampaignVolunteerAssignment,
  isCsrCapabilityRentalAssignment,
} from '@/lib/campaign-volunteer-attendance'
import { isPaidCompletedMilestoneStatus } from '@/lib/csr-agent/project-metrics'

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request)
    assertUserType(user, ['ngo'])
    const projectId = request.nextUrl.searchParams.get('project_id')
    const campaignId = request.nextUrl.searchParams.get('campaign_id')
    const id = projectId || campaignId
    if (!id || Boolean(projectId) === Boolean(campaignId) || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: 'Provide one valid project or campaign ID' }, { status: 400 })
    }

    const { data: projects, error: projectError } = await supabase
      .from('csr_projects')
      .select('id, title, region, project_status, campaign_id, ngo_user_id, updated_at')
      .eq(projectId ? 'id' : 'campaign_id', id)
      .limit(2)
    if (projectError) throw projectError
    if (!projects || projects.length !== 1) {
      return NextResponse.json({ error: 'Project not available' }, { status: 404 })
    }
    const project = projects[0]

    let association = project.ngo_user_id === user.id ? 'project_assignment' : null
    let assignmentStatus: string | null = null
    let joinedAt: string | null = null
    if (!association && project.campaign_id) {
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .select('id, impact_metrics')
        .eq('id', project.campaign_id)
        .maybeSingle()
      if (campaignError) throw campaignError
      if (!campaign) return NextResponse.json({ error: 'Project not available' }, { status: 404 })

      const { data: assignments, error: assignmentError } = await supabase
        .from('service_engagement_assignments')
        .select('id, target_id, target_type, meta, status, assigned_at')
        .in('target_id', [project.campaign_id, project.id])
        .eq('assignee_user_id', user.id)
      if (assignmentError) throw assignmentError
      const ownAssignments = (assignments || []).filter((row) =>
        isCampaignVolunteerAssignment(row) &&
        !isCsrCapabilityRentalAssignment(row) &&
        ((row.target_type === 'campaign' && row.target_id === project.campaign_id) ||
          (row.target_type === 'csr_project' &&
            (row.target_id === project.id || row.target_id === project.campaign_id)))
      )
      const ownAssignment = ownAssignments.find((row) =>
        ['active', 'completed'].includes(String(row.status).toLowerCase())
      )
      const application = getVolunteerApplicationForUser(campaign.impact_metrics, user.id)
      if (application && ownAssignment) {
        association = 'campaign_participation'
        assignmentStatus = ownAssignment.status
        joinedAt = ownAssignment.assigned_at
      } else if (ownAssignments.length === 0 && application) {
        association = 'campaign_registration'
        joinedAt = application.applied_at || null
      }
    }
    if (!association) return NextResponse.json({ error: 'Project not available' }, { status: 404 })

    const [milestoneResult, evidenceResult] = await Promise.all([
      supabase.from('csr_project_milestones')
        .select('id, title, milestone_order, status, updated_at')
        .eq('project_id', project.id)
        .order('milestone_order', { ascending: true }),
      supabase.from('csr_milestone_evidence')
        .select('id, milestone_id, submission_status, uploaded_at, created_at')
        .eq('project_id', project.id)
        .eq('ngo_user_id', user.id)
        .eq('uploaded_by', user.id)
        .order('created_at', { ascending: false }),
    ])
    if (milestoneResult.error) throw milestoneResult.error
    if (evidenceResult.error) throw evidenceResult.error

    const milestones = (milestoneResult.data || []).map((milestone) => {
      const status = String(milestone.status || '').toLowerCase()
      return {
        id: milestone.id,
        title: milestone.title,
        order: milestone.milestone_order,
        status: isPaidCompletedMilestoneStatus(status)
          ? 'completed'
          : status === 'approved'
            ? 'review_complete'
            : ['pending', 'in_progress', 'submitted', 'under_review', 'rejected'].includes(status)
              ? status
              : 'unknown',
        updated_at: milestone.updated_at,
      }
    })
    const completed = milestones.filter((milestone) => milestone.status === 'completed').length
    return NextResponse.json({
      success: true,
      data: {
        project: {
          id: project.id,
          title: project.title,
          location: project.region,
          status: project.project_status,
          updated_at: project.updated_at,
        },
        participation: { association, assignment_status: assignmentStatus, joined_at: joinedAt },
        progress: {
          total: milestones.length,
          completed,
          percentage: milestones.length ? Math.round((completed / milestones.length) * 100) : null,
          current_milestone_id: milestones.find((milestone) => milestone.status !== 'completed')?.id || null,
        },
        milestones,
        own_evidence: (evidenceResult.data || []).map((evidence) => ({
          id: evidence.id,
          milestone_id: evidence.milestone_id,
          submission_status: evidence.submission_status,
          uploaded_at: evidence.uploaded_at,
          created_at: evidence.created_at,
        })),
      },
    })
  } catch (error) {
    const response = authErrorResponse(error)
    if (response) return response
    console.error('[ngo/project-participation]', error)
    return NextResponse.json({ error: 'Failed to load project participation' }, { status: 500 })
  }
}
