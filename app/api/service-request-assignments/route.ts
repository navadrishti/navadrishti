import { NextRequest, NextResponse } from 'next/server'
import { supabase, shapeApplicationForApi } from '@/lib/db'
import { getTokenClaims } from '@/lib/auth'
import { getCompanyProjects } from '@/lib/service-request-assignments/company-projects'
import { getNgoCompanyApplications } from '@/lib/service-request-assignments/ngo-company-applications'
import { getProjectDetail } from '@/lib/service-request-assignments/project-detail'
import { getNgoLeadInvitations } from '@/lib/service-request-assignments/ngo-lead-invitations'
import { getCsrTracking } from '@/lib/service-request-assignments/csr-tracking'
import { submitProjectApplication } from '@/lib/service-request-assignments/project-applications'
import {
  respondToLeadNgoInvitation,
  selectLeadNgo,
} from '@/lib/service-request-assignments/lead-ngo'
import { reviewProjectApplication } from '@/lib/service-request-assignments/review-project-application'
import {
  historyVolunteerStatuses,
  ongoingVolunteerStatuses,
} from '@/lib/service-request-assignments/shared'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view') || 'ongoing'
    const mode = searchParams.get('mode') || ''

    // Project detail stays publicly readable; every other mode needs a session.
    const claims = getTokenClaims(request)
    if (!claims && mode !== 'project-detail') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    const userId = claims?.id ?? 0
    const userType = claims?.user_type ?? ''

    const ctx = { searchParams, userId, userType }

    if (mode === 'company-projects') return await getCompanyProjects(ctx)
    if (mode === 'ngo-company-applications') return await getNgoCompanyApplications(ctx)
    if (mode === 'project-detail') return await getProjectDetail(ctx)
    if (mode === 'ngo-lead-invitations') return await getNgoLeadInvitations(ctx)
    if (mode === 'csr-tracking') return await getCsrTracking(ctx)

    if (userType === 'individual') {
      let query = supabase
        .from('service_request_applications')
        .select(`
          *,
          request:service_requests!service_request_id(
            id,
            title,
            description,
            category,
            request_type,
            requirements,
            location,
            status,
            timeline,
            urgency_level,
            estimated_budget,
            beneficiary_count,
            ngo_id,
            ngo:users!ngo_id(id, name, email, verification_status),
            project:service_request_projects!project_id(id, title, exact_address, location, timeline)
          )
        `)
        .eq('applicant_user_id', userId)
        .order('updated_at', { ascending: false })

      if (view === 'ongoing') {
        query = query.in('status', ongoingVolunteerStatuses)
      } else if (view === 'history') {
        query = query.in('status', historyVolunteerStatuses)
      }

      const { data, error } = await query
      if (error) throw error

      return NextResponse.json({ success: true, data: data || [] })
    }

    if (userType === 'ngo') {
      const { data: requests, error } = await supabase
        .from('service_requests')
        .select(`
          *,
          project:service_request_projects!project_id(id, title, exact_address, location, timeline)
        `)
        .eq('ngo_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error

      const requestIds = (requests || []).map((item) => item.id)
      const { data: assignments, error: assignmentsError } = requestIds.length > 0
        ? await supabase
            .from('service_request_applications')
            .select(`
              *,
              volunteer:users!applicant_user_id(id, name, email, user_type),
              fulfillment:service_request_fulfillments!application_id(*),
              request:service_requests!service_request_id(id, title, status, category, location, timeline, urgency_level, estimated_budget, beneficiary_count, project:service_request_projects!project_id(id, title, exact_address, location, timeline))
            `)
            .in('service_request_id', requestIds)
            .order('updated_at', { ascending: false })
        : { data: [], error: null }

      if (assignmentsError) throw assignmentsError

      const shapedAssignments = (assignments || []).map((row) => shapeApplicationForApi(row))

      const grouped = (requests || []).map((requestItem) => {
        const relatedAssignments = shapedAssignments.filter((assignment) => String(assignment.service_request_id) === String(requestItem.id))
        return {
          ...requestItem,
          assignments: relatedAssignments,
          accepted_count: relatedAssignments.filter((item) => ['accepted', 'active', 'completed'].includes(String(item.status || '').toLowerCase())).length,
          pending_count: relatedAssignments.filter((item) => String(item.status || '').toLowerCase() === 'pending').length,
          completed_count: relatedAssignments.filter((item) => {
            const status = String(item.status || '').toLowerCase()
            return status === 'completed' || item.ngo_confirmed_at
          }).length
        }
      })

      const filtered = view === 'history'
        ? grouped.filter((item) => ['completed', 'cancelled'].includes(String(item.status || '').toLowerCase()))
        : grouped.filter((item) => !['completed', 'cancelled'].includes(String(item.status || '').toLowerCase()))

      return NextResponse.json({ success: true, data: filtered })
    }

    return NextResponse.json({ error: 'Unsupported user type' }, { status: 403 })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Error fetching assignments:', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    })
    return NextResponse.json({ 
      error: 'Failed to fetch assignments'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return submitProjectApplication(request)
}

export async function PUT(request: NextRequest) {
  try {
    const decoded = getTokenClaims(request)
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    const { id: userId, user_type: userType } = decoded

    const body = await request.json()
    const action = String(body.action || '').trim()

    if (!['review-project-application', 'respond-lead-ngo-invitation', 'select-lead-ngo'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const ctx = { body, userId, userType }

    if (action === 'respond-lead-ngo-invitation') return await respondToLeadNgoInvitation(ctx)
    if (action === 'select-lead-ngo') return await selectLeadNgo(ctx)
    return await reviewProjectApplication(ctx)
  } catch (error) {
    console.error('Error reviewing company project application:', error)
    return NextResponse.json({ error: 'Failed to review project application' }, { status: 500 })
  }
}
