import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { supabase } from '@/lib/db'
import { JWT_SECRET } from '@/lib/auth'

interface JWTPayload {
  id: number;
  user_type: string;
  email: string;
  name: string;
}

async function isFullyVerifiedCompany(userId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('email_verified, phone_verified, verification_status')
    .eq('id', userId)
    .single()

  if (error || !data) return false

  return Boolean(
    data.email_verified === true &&
    data.phone_verified === true &&
    String(data.verification_status || '').toLowerCase() === 'verified'
  )
}

const ongoingVolunteerStatuses = ['pending', 'accepted', 'active']
const historyVolunteerStatuses = ['completed', 'rejected', 'cancelled']
const actionableProjectApplicationStatuses = ['pending', 'pledged', 'accepted', 'invited', 'pending_acceptance', 'awaiting_acceptance', 'offered', 'assigned']
const reviewQueueProjectApplicationStatuses = ['pending', 'pledged', 'invited', 'pending_acceptance', 'awaiting_acceptance', 'offered', 'assigned']

const COMPANY_PROJECT_CONTRIBUTION_TYPE = 'company_project_csr'
const LEAD_NGO_INVITE_CONTRIBUTION_TYPE = 'project_lead_ngo_invite'
const EXPIRED_STATUS = 'expired'

function safeProjectIdFromMeta(meta: any): string | null {
  if (!meta || typeof meta !== 'object') return null
  const value = String(meta.project_id || '').trim()
  return value || null
}

function safeNoteFromMeta(meta: any): string {
  if (!meta || typeof meta !== 'object') return ''
  return String(meta.note || '').trim()
}

function safeJsonObject(value: any): Record<string, any> {
  if (!value) return {}
  if (typeof value === 'object') return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload
    const { id: userId, user_type: userType, name: userName } = decoded

    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view') || 'ongoing'
    const mode = searchParams.get('mode') || ''
    const requestIdFilter = Number(searchParams.get('requestId') || '')

    if (mode === 'company-projects') {
      if (userType !== 'company') {
        return NextResponse.json({ error: 'Only companies can view project opportunities' }, { status: 403 })
      }

      const { data: requests, error: requestsError } = await supabase
        .from('service_requests')
        .select(`
          id,
          ngo_id,
          title,
          status,
          request_type,
          category,
          estimated_budget,
          target_amount,
          target_quantity,
          beneficiary_count,
          location,
          timeline,
          project_id,
          project:service_request_projects!project_id(id, title, description, location, exact_address, timeline),
          requester:users!ngo_id(id, name, email)
        `)
        .not('project_id', 'is', null)
        .neq('ngo_id', userId)
        .not('status', 'in', '(completed,cancelled)')
        .order('created_at', { ascending: false })

      if (requestsError) throw requestsError

      const filteredRequests = Array.isArray(requests)
        ? requests.filter((item: any) => !Number.isFinite(requestIdFilter) || item.id === requestIdFilter)
        : []

      // If any need in a project is already accepted by a company, hide that project from opportunity listing.
      const { data: acceptedProjectAssignments, error: acceptedProjectAssignmentsError } = filteredRequests.length > 0
        ? await supabase
            .from('service_request_contributions')
            .select('service_request_id')
            .in('service_request_id', filteredRequests.map((item: any) => item.id))
            .eq('contribution_type', COMPANY_PROJECT_CONTRIBUTION_TYPE)
            .eq('status', 'accepted')
        : { data: [], error: null as any }

      if (acceptedProjectAssignmentsError) throw acceptedProjectAssignmentsError

      const acceptedNeedIdSet = new Set(
        (acceptedProjectAssignments || [])
          .map((item: any) => Number(item.service_request_id))
          .filter((id: number) => Number.isFinite(id) && id > 0)
      )

      const listingRequests = filteredRequests.filter((item: any) => !acceptedNeedIdSet.has(Number(item.id)))

      const projectIds = [...new Set(listingRequests.map((item: any) => item.project_id).filter(Boolean))]

      if (projectIds.length === 0) {
        return NextResponse.json({ success: true, data: [] })
      }

      const { data: companyApplications, error: companyApplicationsError } = await supabase
        .from('service_request_contributions')
        .select('id, service_request_id, status, created_at, updated_at, meta')
        .eq('contributor_id', userId)
        .eq('contribution_type', COMPANY_PROJECT_CONTRIBUTION_TYPE)
        .in('service_request_id', listingRequests.map((item: any) => item.id))
        .order('created_at', { ascending: false })

      if (companyApplicationsError) throw companyApplicationsError

      const { data: fulfillmentRows, error: fulfillmentRowsError } = listingRequests.length > 0
        ? await supabase
            .from('service_volunteers')
            .select('service_request_id, status, individual_done_at, ngo_confirmed_at, fulfilled_amount, fulfilled_quantity, volunteer:users!volunteer_id(id, user_type)')
        .in('service_request_id', listingRequests.map((item: any) => item.id))
        : { data: [], error: null as any }

      if (fulfillmentRowsError) throw fulfillmentRowsError

      const grouped = new Map<string, any>()

      for (const need of listingRequests) {
        const projectId = String(need.project_id)
        const existing = grouped.get(projectId) || {
          project_id: projectId,
          project_title: need.project?.title || 'Project',
          project_description: need.project?.description || '',
          project_location: need.project?.exact_address || need.project?.location || need.location || '',
          project_timeline: need.project?.timeline || need.timeline || '',
          ngo_id: need.ngo_id,
          ngo_name: need.requester?.name || 'NGO',
          ngo_email: need.requester?.email || '',
          needs: [],
          company_application_status: 'none',
          company_application_eligible: true,
          company_application_reason: '',
          latest_application_at: null,
          note: ''
        }

        existing.needs.push({
          id: need.id,
          title: need.title,
          status: need.status,
          request_type: need.request_type || need.category,
          estimated_budget: need.estimated_budget,
          target_amount: need.target_amount,
          target_quantity: need.target_quantity,
          beneficiary_count: need.beneficiary_count
        })

        grouped.set(projectId, existing)
      }

      const applicationsByProject = (companyApplications || []).reduce((acc: Record<string, any[]>, item: any) => {
        const projectId = safeProjectIdFromMeta(item.meta)
        if (!projectId) return acc
        if (!acc[projectId]) acc[projectId] = []
        acc[projectId].push(item)
        return acc
      }, {})

      const hasIndividualFulfillmentByProject = (fulfillmentRows || []).reduce((acc: Record<string, boolean>, row: any) => {
        const requestItem = listingRequests.find((item: any) => Number(item.id) === Number(row.service_request_id))
        if (!requestItem?.project_id) return acc

        const isIndividual = String(row?.volunteer?.user_type || '').toLowerCase() === 'individual'
        const status = String(row?.status || '').toLowerCase()
        const hasFulfillmentSignal = (
          status === 'completed' ||
          !!row?.individual_done_at ||
          !!row?.ngo_confirmed_at ||
          Number(row?.fulfilled_amount || 0) > 0 ||
          Number(row?.fulfilled_quantity || 0) > 0
        )

        if (isIndividual && hasFulfillmentSignal) {
          acc[String(requestItem.project_id)] = true
        }

        return acc
      }, {})

      for (const [projectId, payload] of grouped.entries()) {
        if (hasIndividualFulfillmentByProject[projectId]) {
          payload.company_application_eligible = false
          payload.company_application_reason = 'One or more needs in this project were already fulfilled by individuals. CSR full-project assignment is blocked.'
        }

        const entries = applicationsByProject[projectId] || []
        if (entries.length === 0) continue

        const latest = entries[0]
        const statuses = new Set(entries.map((entry) => String(entry.status || '').toLowerCase()))

        if (statuses.has('accepted')) {
          payload.company_application_status = 'accepted'
          } else if (
            statuses.has('pending') ||
            statuses.has('pledged') ||
            statuses.has('invited') ||
            statuses.has('pending_acceptance') ||
            statuses.has('awaiting_acceptance') ||
            statuses.has('offered') ||
            statuses.has('assigned')
          ) {
          payload.company_application_status = 'pending'
        } else if (statuses.has('rejected')) {
          payload.company_application_status = 'rejected'
        } else {
          payload.company_application_status = String(latest.status || 'none').toLowerCase()
        }

        payload.latest_application_at = latest.created_at || null
        payload.note = safeNoteFromMeta(latest.meta)
      }

      return NextResponse.json({ success: true, data: Array.from(grouped.values()) })
    }

    if (mode === 'ngo-company-applications') {
      if (userType !== 'ngo') {
        return NextResponse.json({ error: 'Only NGOs can view company applications' }, { status: 403 })
      }

      const { data: ownNeeds, error: ownNeedsError } = await supabase
        .from('service_requests')
        .select(`
          id,
          title,
          status,
          request_type,
          category,
          estimated_budget,
          target_amount,
          target_quantity,
          beneficiary_count,
          project_id,
          project:service_request_projects!project_id(id, title, location, exact_address, timeline)
        `)
        .eq('ngo_id', userId)
        .not('project_id', 'is', null)
        .order('created_at', { ascending: false })

      if (ownNeedsError) throw ownNeedsError

      const ownNeedIds = (ownNeeds || []).map((item: any) => item.id)
      if (ownNeedIds.length === 0) {
        return NextResponse.json({ success: true, data: [] })
      }

      const { data: contributions, error: contributionsError } = await supabase
        .from('service_request_contributions')
        .select(`
          id,
          service_request_id,
          contributor_id,
          status,
          reference_text,
          meta,
          created_at,
          updated_at,
          contributor:users!contributor_id(id, name, email, user_type)
        `)
        .in('service_request_id', ownNeedIds)
        .eq('contribution_type', COMPANY_PROJECT_CONTRIBUTION_TYPE)
        .in('status', reviewQueueProjectApplicationStatuses)
        .order('created_at', { ascending: false })

      if (contributionsError) throw contributionsError

      const needsById = new Map<number, any>((ownNeeds || []).map((item: any) => [item.id, item]))
      const grouped = new Map<string, any>()

      for (const item of contributions || []) {
        const need = needsById.get(item.service_request_id)
        if (!need) continue

        const projectId = String(need.project_id)
        const companyId = Number(item.contributor_id)
        const key = `${projectId}::${companyId}`

        const existing = grouped.get(key) || {
          project_id: projectId,
          project_title: need.project?.title || 'Project',
          project_location: need.project?.exact_address || need.project?.location || '',
          project_timeline: need.project?.timeline || '',
          company_id: companyId,
          company_name: item.contributor?.name || 'Company',
          company_email: item.contributor?.email || '',
          status: String(item.status || 'pending').toLowerCase(),
          note: safeNoteFromMeta(item.meta) || String(item.reference_text || ''),
          created_at: item.created_at,
          updated_at: item.updated_at,
          needs: [] as any[]
        }

        existing.needs.push({
          id: need.id,
          title: need.title,
          status: need.status,
          request_type: need.request_type || need.category,
          estimated_budget: need.estimated_budget,
          target_amount: need.target_amount,
          target_quantity: need.target_quantity,
          beneficiary_count: need.beneficiary_count
        })

        if (String(item.status || '').toLowerCase() === 'accepted') {
          existing.status = 'accepted'
        } else if (existing.status !== 'accepted' && String(item.status || '').toLowerCase() === 'pending') {
          existing.status = 'pending'
        }

        grouped.set(key, existing)
      }

      return NextResponse.json({ success: true, data: Array.from(grouped.values()) })
    }

    if (mode === 'project-detail') {
      const projectId = String(searchParams.get('projectId') || '').trim()
      if (!projectId) {
        return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
      }

      const { data: project, error: projectError } = await supabase
        .from('service_request_projects')
        .select('id, ngo_id, title, description, location, exact_address, timeline, status, updated_at, created_at, ngo:users!ngo_id(id, name, email, location, city, state_province, country, phone, ngo_size, industry, pincode, profile_data)')
        .eq('id', projectId)
        .single()

      if (projectError) throw projectError
      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }

      const { data: needs, error: needsError } = await supabase
        .from('service_requests')
        .select('id, ngo_id, title, status, request_type, category, estimated_budget, target_amount, target_quantity, beneficiary_count, location, timeline, created_at, updated_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })

      if (needsError) throw needsError

      const needsList = Array.isArray(needs) ? needs : []
      const needIds = needsList.map((item: any) => item.id)
      const anchorNeedId = needIds[0] || null

      const { data: applications, error: applicationsError } = needIds.length > 0
        ? await supabase
            .from('service_request_contributions')
            .select('id, service_request_id, contributor_id, status, meta, created_at, updated_at')
            .in('service_request_id', needIds)
            .eq('contribution_type', COMPANY_PROJECT_CONTRIBUTION_TYPE)
        : { data: [], error: null as any }

      if (applicationsError) throw applicationsError

      const { data: leadInvites, error: leadInvitesError } = await supabase
        .from('service_request_contributions')
        .select('id, service_request_id, contributor_id, status, reference_text, meta, created_at, updated_at, ngo:users!contributor_id(id, name, email)')
        .eq('contribution_type', LEAD_NGO_INVITE_CONTRIBUTION_TYPE)
        .eq('meta->>project_id', projectId)
        .order('created_at', { ascending: false })

      if (leadInvitesError) throw leadInvitesError

      const { data: fulfillmentRows, error: fulfillmentRowsError } = needIds.length > 0
        ? await supabase
            .from('service_volunteers')
            .select('service_request_id, status, individual_done_at, ngo_confirmed_at, fulfilled_amount, fulfilled_quantity, volunteer:users!volunteer_id(id, user_type)')
            .in('service_request_id', needIds)
        : { data: [], error: null as any }

      if (fulfillmentRowsError) throw fulfillmentRowsError

      const hasIndividualFulfillment = (fulfillmentRows || []).some((row: any) => {
        const isIndividual = String(row?.volunteer?.user_type || '').toLowerCase() === 'individual'
        const status = String(row?.status || '').toLowerCase()
        return isIndividual && (
          status === 'completed' ||
          !!row?.individual_done_at ||
          !!row?.ngo_confirmed_at ||
          Number(row?.fulfilled_amount || 0) > 0 ||
          Number(row?.fulfilled_quantity || 0) > 0
        )
      })

      const groupedApplicationsByCompany = (applications || []).reduce((acc: Record<string, any>, item: any) => {
        const key = String(item.contributor_id)
        const normalizedStatus = String(item.status || 'pending').toLowerCase()
        if (!acc[key]) {
          acc[key] = {
            company_id: item.contributor_id,
            status: normalizedStatus,
            created_at: item.created_at,
            updated_at: item.updated_at,
            needs: []
          }
        }

        acc[key].needs.push({
          id: item.service_request_id,
          status: normalizedStatus
        })

        if (normalizedStatus === 'accepted') {
          acc[key].status = 'accepted'
        } else if (normalizedStatus === 'rejected' && acc[key].status !== 'accepted') {
          acc[key].status = 'rejected'
        } else if (['pending', 'pledged', 'invited', 'pending_acceptance', 'awaiting_acceptance', 'offered', 'assigned'].includes(normalizedStatus) && !['accepted', 'rejected'].includes(acc[key].status)) {
          acc[key].status = 'pending'
        }

        return acc
      }, {})

      const responsePayload = {
        project,
        anchor_need_id: anchorNeedId,
        needs: needsList,
        need_breakdown: {
          ongoing: needsList.filter((item: any) => !['completed', 'cancelled'].includes(String(item.status || '').toLowerCase())),
          fulfilled: needsList.filter((item: any) => ['completed'].includes(String(item.status || '').toLowerCase())),
          removed: needsList.filter((item: any) => ['cancelled'].includes(String(item.status || '').toLowerCase()))
        },
        company_applications: Object.values(groupedApplicationsByCompany),
        lead_ngo_invites: leadInvites || [],
        csr_project_eligible_for_company_apply: !hasIndividualFulfillment,
        csr_project_ineligible_reason: hasIndividualFulfillment ? 'One or more needs in this project were already fulfilled by individuals.' : ''
      }

      return NextResponse.json({ success: true, data: responsePayload })
    }

    if (mode === 'ngo-lead-invitations') {
      if (userType !== 'ngo') {
        return NextResponse.json({ error: 'Only NGOs can view lead invitations' }, { status: 403 })
      }

      const { data: invites, error: invitesError } = await supabase
        .from('service_request_contributions')
        .select('id, status, reference_text, created_at, updated_at, meta')
        .eq('contribution_type', LEAD_NGO_INVITE_CONTRIBUTION_TYPE)
        .eq('contributor_id', userId)
        .order('created_at', { ascending: false })

      if (invitesError) throw invitesError

      const projectIds = [...new Set((invites || []).map((item: any) => String(item.meta?.project_id || '').trim()).filter(Boolean))]
      const companyIds = [...new Set((invites || []).map((item: any) => Number(item.meta?.inviting_company_id || 0)).filter((id: number) => Number.isFinite(id) && id > 0))]

      const { data: projects, error: projectsError } = projectIds.length > 0
        ? await supabase
            .from('service_request_projects')
            .select('id, title, location, exact_address, timeline')
            .in('id', projectIds)
        : { data: [], error: null as any }

      if (projectsError) throw projectsError

      const { data: companies, error: companiesError } = companyIds.length > 0
        ? await supabase
            .from('users')
            .select('id, name, email')
            .in('id', companyIds)
        : { data: [], error: null as any }

      if (companiesError) throw companiesError

      const projectsById = new Map<string, any>((projects || []).map((item: any) => [String(item.id), item]))
      const companiesById = new Map<number, any>((companies || []).map((item: any) => [Number(item.id), item]))

      const payload = (invites || []).map((invite: any) => {
        const projectId = String(invite.meta?.project_id || '')
        const companyId = Number(invite.meta?.inviting_company_id || 0)
        const project = projectsById.get(projectId)
        const company = companiesById.get(companyId)

        return {
          id: invite.id,
          status: invite.status,
          note: String(invite.reference_text || invite.meta?.note || ''),
          invited_at: invite.created_at,
          project_id: projectId,
          project_title: project?.title || 'Project',
          project_location: project?.exact_address || project?.location || '',
          project_timeline: project?.timeline || '',
          company_id: companyId,
          company_name: company?.name || 'Company',
          company_email: company?.email || ''
        }
      })

      return NextResponse.json({ success: true, data: payload })
    }

    if (mode === 'csr-tracking') {
      if (!['ngo', 'company'].includes(userType)) {
        return NextResponse.json({ error: 'Only NGO and company users can view CSR tracking' }, { status: 403 })
      }

      let contributionQuery = supabase
        .from('service_request_contributions')
        .select('id, service_request_id, contributor_id, status, meta, created_at, updated_at')
        .eq('contribution_type', COMPANY_PROJECT_CONTRIBUTION_TYPE)
        .in('status', ['accepted', 'in_progress', 'completed'])
        .order('updated_at', { ascending: false })

      if (userType === 'company') {
        contributionQuery = contributionQuery.eq('contributor_id', userId)
      }

      const { data: contributions, error: contributionsError } = await contributionQuery
      if (contributionsError) throw contributionsError

      if (!contributions || contributions.length === 0) {
        return NextResponse.json({ success: true, data: [] })
      }

      const requestIds = [...new Set(contributions.map((item: any) => Number(item.service_request_id)).filter((value) => Number.isFinite(value) && value > 0))]
      const companyIds = [...new Set(contributions.map((item: any) => Number(item.contributor_id)).filter((value) => Number.isFinite(value) && value > 0))]

      const { data: requests, error: requestsError } = await supabase
        .from('service_requests')
        .select(`
          id,
          ngo_id,
          title,
          status,
          request_type,
          category,
          location,
          timeline,
          project_id,
          project_context,
          project:service_request_projects!project_id(id, title, location, exact_address, timeline),
          requester:users!ngo_id(id, name, email)
        `)
        .in('id', requestIds)

      if (requestsError) throw requestsError

      const selectedLeadNgoIds = [...new Set((requests || [])
        .map((requestItem: any) => {
          const projectContext = safeJsonObject(requestItem?.project_context)
          const assignment = safeJsonObject(projectContext?.csr_assignment)
          return Number(assignment?.selected_lead_ngo_id || 0)
        })
        .filter((value: number) => Number.isFinite(value) && value > 0))]

      const allUserIds = [...new Set([...companyIds, ...selectedLeadNgoIds])]

      const { data: users, error: usersError } = allUserIds.length > 0
        ? await supabase
            .from('users')
            .select('id, name, email')
            .in('id', allUserIds)
        : { data: [], error: null as any }

      if (usersError) throw usersError

      const companyById = new Map<number, any>((users || []).map((item: any) => [Number(item.id), item]))

      const { data: allLeadInvites, error: allLeadInvitesError } = await supabase
        .from('service_request_contributions')
        .select('id, contributor_id, status, reference_text, meta, created_at, updated_at')
        .eq('contribution_type', LEAD_NGO_INVITE_CONTRIBUTION_TYPE)
        .order('created_at', { ascending: false })

      if (allLeadInvitesError) throw allLeadInvitesError
      const requestById = new Map<number, any>((requests || []).map((item: any) => [Number(item.id), item]))
      const grouped = new Map<string, any>()

      for (const item of contributions) {
        const requestItem = requestById.get(Number(item.service_request_id))
        if (!requestItem) continue

        const projectContext = safeJsonObject(requestItem.project_context)
        const assignmentContext = safeJsonObject(projectContext.csr_assignment)
        const selectedLeadNgoId = Number(assignmentContext.selected_lead_ngo_id || 0)
        const isRequestNgo = Number(requestItem.ngo_id) === Number(userId)
        const isSelectedLeadNgo = selectedLeadNgoId > 0 && selectedLeadNgoId === Number(userId)

        if (userType === 'ngo' && !isRequestNgo && !isSelectedLeadNgo) continue

        const companyId = Number(item.contributor_id)
        const company = companyById.get(companyId)
        const projectId = String(safeProjectIdFromMeta(item.meta) || requestItem.project_id || `request-${requestItem.id}`)
        const key = `${projectId}::${companyId}`
        const selectedLeadNgo = companyById.get(selectedLeadNgoId)

        const existing = grouped.get(key) || {
          project_id: projectId,
          project_title: requestItem.project?.title || 'Project',
          project_location: requestItem.project?.exact_address || requestItem.project?.location || requestItem.location || '',
          project_timeline: requestItem.project?.timeline || requestItem.timeline || '',
          lead_ngo_id: requestItem.ngo_id,
          lead_ngo_name: requestItem.requester?.name || 'NGO',
          lead_ngo_email: requestItem.requester?.email || '',
          assigned_company_id: companyId,
          assigned_company_name: company?.name || 'Company',
          assigned_company_email: company?.email || '',
          selected_lead_ngo_id: selectedLeadNgoId || null,
          selected_lead_ngo_name: selectedLeadNgo?.name || null,
          selected_lead_ngo_email: selectedLeadNgo?.email || null,
          ngo_dashboard_role: isRequestNgo ? 'request_owner' : (isSelectedLeadNgo ? 'selected_lead' : 'viewer'),
          assignment_status: String(item.status || 'accepted').toLowerCase(),
          assigned_at: projectContext?.csr_assignment?.assigned_at || item.created_at || null,
          review_note: safeNoteFromMeta(item.meta),
          lead_ngo_invites: [] as any[],
          needs: [] as any[]
        }

        existing.needs.push({
          id: requestItem.id,
          title: requestItem.title,
          status: requestItem.status,
          request_type: requestItem.request_type || requestItem.category
        })

        const normalizedStatus = String(item.status || '').toLowerCase()
        if (normalizedStatus === 'completed') {
          existing.assignment_status = 'completed'
        } else if (normalizedStatus === 'in_progress' && existing.assignment_status !== 'completed') {
          existing.assignment_status = 'in_progress'
        }

        grouped.set(key, existing)
      }

      for (const payload of grouped.values()) {
        const projectId = String(payload.project_id)
        const companyId = Number(payload.assigned_company_id)
        const relevantInvites = (allLeadInvites || []).filter((invite: any) => {
          const meta = safeJsonObject(invite.meta)
          return String(meta.project_id || '') === projectId && Number(meta.inviting_company_id || 0) === companyId
        })

        payload.lead_ngo_invites = relevantInvites.map((invite: any) => {
          const inviteNgoId = Number(invite.contributor_id)
          const inviteNgo = companyById.get(inviteNgoId)
          return {
            id: invite.id,
            ngo_id: inviteNgoId,
            ngo_name: inviteNgo?.name || 'NGO',
            ngo_email: inviteNgo?.email || '',
            status: invite.status,
            note: String(invite.reference_text || invite.meta?.note || ''),
            selected_as_lead: safeBoolean(invite.meta?.selected_as_lead),
            created_at: invite.created_at,
            updated_at: invite.updated_at
          }
        })
      }

      return NextResponse.json({ success: true, data: Array.from(grouped.values()) })
    }

    if (userType === 'individual') {
      let query = supabase
        .from('service_volunteers')
        .select(`
          *,
          request:service_requests!service_request_id(
            id,
            title,
            description,
            category,
            location,
            status,
            timeline,
            urgency_level,
            estimated_budget,
            beneficiary_count,
            project:service_request_projects!project_id(id, title, exact_address, location, timeline)
          )
        `)
        .eq('volunteer_id', userId)
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

      const requestIds = (requests || []).map((item: any) => item.id)
      const { data: assignments, error: assignmentsError } = requestIds.length > 0
        ? await supabase
            .from('service_volunteers')
            .select(`
              *,
              volunteer:users!volunteer_id(id, name, email, user_type),
              request:service_requests!service_request_id(id, title, status, category, location, timeline, urgency_level, estimated_budget, beneficiary_count, project:service_request_projects!project_id(id, title, exact_address, location, timeline))
            `)
            .in('service_request_id', requestIds)
            .order('updated_at', { ascending: false })
        : { data: [], error: null }

      if (assignmentsError) throw assignmentsError

      const grouped = (requests || []).map((requestItem: any) => {
        const relatedAssignments = (assignments || []).filter((assignment: any) => String(assignment.service_request_id) === String(requestItem.id))
        return {
          ...requestItem,
          assignments: relatedAssignments,
          accepted_count: relatedAssignments.filter((item: any) => ['accepted', 'active', 'completed'].includes(String(item.status || '').toLowerCase())).length,
          completed_count: relatedAssignments.filter((item: any) => {
            const status = String(item.status || '').toLowerCase()
            return status === 'completed' || item.ngo_confirmed_at
          }).length
        }
      })

      const filtered = view === 'history'
        ? grouped.filter((item: any) => ['completed', 'cancelled'].includes(String(item.status || '').toLowerCase()))
        : grouped.filter((item: any) => !['completed', 'cancelled'].includes(String(item.status || '').toLowerCase()))

      return NextResponse.json({ success: true, data: filtered })
    }

    return NextResponse.json({ error: 'Unsupported user type' }, { status: 403 })
  } catch (error) {
    console.error('Error fetching assignments:', error)
    return NextResponse.json({ error: 'Failed to fetch assignments' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload
    const { id: userId, user_type: userType, name: userName } = decoded

    const body = await request.json()
    const action = String(body.action || '').trim()

    if (!['apply-project', 'invite-lead-ngo'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    if (userType !== 'company') {
      return NextResponse.json({ error: 'Only company users can perform this action' }, { status: 403 })
    }

    if (!(await isFullyVerifiedCompany(userId))) {
      return NextResponse.json({ error: 'Company must be fully verified before applying or sending lead NGO invites' }, { status: 403 })
    }

    const projectId = String(body.projectId || '').trim()
    const note = String(body.note || '').trim()

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    const { data: needs, error: needsError } = await supabase
      .from('service_requests')
      .select('id, ngo_id, title, status, project_id')
      .eq('project_id', projectId)
      .not('status', 'in', '(completed,cancelled)')

    if (needsError) throw needsError

    const activeNeeds = Array.isArray(needs) ? needs : []
    if (activeNeeds.length === 0) {
      return NextResponse.json({ error: 'No active needs found in this project' }, { status: 404 })
    }

    if (activeNeeds.some((item: any) => Number(item.ngo_id) === userId)) {
      return NextResponse.json({ error: 'You cannot apply to your own NGO project' }, { status: 403 })
    }

    const needIds = activeNeeds.map((item: any) => item.id)

    if (action === 'apply-project') {
      const { data: existingAcceptedRows, error: existingAcceptedRowsError } = await supabase
        .from('service_request_contributions')
        .select('id, contributor_id, service_request_id')
        .in('service_request_id', needIds)
        .eq('contribution_type', COMPANY_PROJECT_CONTRIBUTION_TYPE)
        .eq('status', 'accepted')

      if (existingAcceptedRowsError) throw existingAcceptedRowsError
      if ((existingAcceptedRows || []).length > 0) {
        return NextResponse.json({
          error: 'This project has already been accepted by a company. New applications are not allowed.'
        }, { status: 409 })
      }

      const { data: fulfillmentRows, error: fulfillmentRowsError } = await supabase
        .from('service_volunteers')
        .select('service_request_id, status, individual_done_at, ngo_confirmed_at, fulfilled_amount, fulfilled_quantity, volunteer:users!volunteer_id(id, user_type)')
        .in('service_request_id', needIds)

      if (fulfillmentRowsError) throw fulfillmentRowsError

      const hasIndividualFulfillment = (fulfillmentRows || []).some((row: any) => {
        const isIndividual = String(row?.volunteer?.user_type || '').toLowerCase() === 'individual'
        const status = String(row?.status || '').toLowerCase()
        return isIndividual && (
          status === 'completed' ||
          !!row?.individual_done_at ||
          !!row?.ngo_confirmed_at ||
          Number(row?.fulfilled_amount || 0) > 0 ||
          Number(row?.fulfilled_quantity || 0) > 0
        )
      })

      if (hasIndividualFulfillment) {
        return NextResponse.json({
          error: 'Project is not eligible for company CSR application because one or more needs were already fulfilled by individuals.'
        }, { status: 409 })
      }
    }

    if (action === 'invite-lead-ngo') {
      const ngoIds = Array.isArray(body.ngoIds)
        ? [...new Set(body.ngoIds.map((value: any) => Number(value)).filter((value: number) => Number.isFinite(value) && value > 0))]
        : []

      if (ngoIds.length === 0) {
        return NextResponse.json({ error: 'At least one NGO id is required' }, { status: 400 })
      }

      const requestOwnerNgoId = Number(activeNeeds[0]?.ngo_id || 0)
      if (requestOwnerNgoId > 0 && ngoIds.includes(requestOwnerNgoId)) {
        return NextResponse.json({
          error: 'You cannot invite the NGO that owns the original project request as lead NGO.'
        }, { status: 400 })
      }

      const { data: acceptedRows, error: acceptedRowsError } = await supabase
        .from('service_request_contributions')
        .select('id, service_request_id, status, meta')
        .in('service_request_id', needIds)
        .eq('contributor_id', userId)
        .eq('contribution_type', COMPANY_PROJECT_CONTRIBUTION_TYPE)
        .eq('status', 'accepted')

      if (acceptedRowsError) throw acceptedRowsError
      if (!acceptedRows || acceptedRows.length === 0) {
        return NextResponse.json({ error: 'Project must be accepted by NGO before inviting lead NGOs' }, { status: 409 })
      }

      const { data: alreadyAcceptedLeadInvite, error: alreadyAcceptedLeadInviteError } = await supabase
        .from('service_request_contributions')
        .select('id, contributor_id')
        .eq('contribution_type', LEAD_NGO_INVITE_CONTRIBUTION_TYPE)
        .eq('meta->>project_id', projectId)
        .eq('meta->>inviting_company_id', String(userId))
        .eq('status', 'accepted')
        .maybeSingle()

      if (alreadyAcceptedLeadInviteError) throw alreadyAcceptedLeadInviteError

      if (alreadyAcceptedLeadInvite) {
        await supabase
          .from('service_request_contributions')
          .update({ status: EXPIRED_STATUS, updated_at: new Date().toISOString() })
          .eq('contribution_type', LEAD_NGO_INVITE_CONTRIBUTION_TYPE)
          .eq('meta->>project_id', projectId)
          .eq('meta->>inviting_company_id', String(userId))
          .neq('id', alreadyAcceptedLeadInvite.id)
          .in('status', ['pending', 'invited', 'pending_acceptance', 'awaiting_acceptance', 'offered', 'assigned'])

        return NextResponse.json({
          error: 'A lead NGO has already accepted this project invite. No additional invites are allowed.'
        }, { status: 409 })
      }

      const anchorNeedId = needIds[0]
      const { data: existingInvites, error: existingInvitesError } = await supabase
        .from('service_request_contributions')
        .select('id, contributor_id, status')
        .eq('contribution_type', LEAD_NGO_INVITE_CONTRIBUTION_TYPE)
        .eq('meta->>project_id', projectId)
        .in('contributor_id', ngoIds)

      if (existingInvitesError) throw existingInvitesError

      const existingByNgo = new Map<number, any>((existingInvites || []).map((item: any) => [Number(item.contributor_id), item]))
      const rowsToInsert = ngoIds
        .filter((ngoId: number) => !existingByNgo.has(ngoId))
        .map((ngoId: number) => ({
          service_request_id: anchorNeedId,
          contributor_id: ngoId,
          contribution_type: LEAD_NGO_INVITE_CONTRIBUTION_TYPE,
          status: 'pending',
          reference_text: note || null,
          meta: {
            project_id: projectId,
            inviting_company_id: userId,
            invitation_scope: 'lead_ngo',
            note,
            selected_as_lead: false
          }
        }))

      if (rowsToInsert.length > 0) {
        const { error: inviteInsertError } = await supabase
          .from('service_request_contributions')
          .insert(rowsToInsert)

        if (inviteInsertError) throw inviteInsertError
      }

      return NextResponse.json({
        success: true,
        data: {
          projectId,
          invitedNgoCount: rowsToInsert.length,
          alreadyInvitedNgoCount: ngoIds.length - rowsToInsert.length,
          message: rowsToInsert.length > 0 ? 'Lead NGO invitations sent.' : 'Selected NGOs were already invited.'
        }
      })
    }

    const { data: existingRows, error: existingRowsError } = await supabase
      .from('service_request_contributions')
      .select('id, service_request_id, status')
      .in('service_request_id', needIds)
      .eq('contributor_id', userId)
      .eq('contribution_type', COMPANY_PROJECT_CONTRIBUTION_TYPE)

    if (existingRowsError) throw existingRowsError

    const existingNeedIds = new Set((existingRows || [])
      .filter((item: any) => ['pending', 'pledged', 'accepted', 'in_progress', 'completed'].includes(String(item.status || '').toLowerCase()))
      .map((item: any) => Number(item.service_request_id)))

    const rowsToInsert = activeNeeds
      .filter((need: any) => !existingNeedIds.has(Number(need.id)))
      .map((need: any) => ({
        service_request_id: need.id,
        contributor_id: userId,
        contribution_type: COMPANY_PROJECT_CONTRIBUTION_TYPE,
        status: 'pending',
        reference_text: note || null,
        meta: {
          application_scope: 'project',
          project_id: projectId,
          company_id: userId,
          company_name: userName || null,
          note,
          payment_provider: 'razorpay',
          logistics_provider: 'delhivery',
          flow: 'company_project_csr'
        }
      }))

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('service_request_contributions')
        .insert(rowsToInsert)

      if (insertError) throw insertError
    }

    return NextResponse.json({
      success: true,
      data: {
        projectId,
        totalNeeds: needIds.length,
        newlyAppliedNeeds: rowsToInsert.length,
        message: rowsToInsert.length > 0
          ? 'Project-level CSR application submitted to NGO for all active needs.'
          : 'You have already applied for this project.'
      }
    })
  } catch (error) {
    console.error('Error creating project-level company application:', error)
    return NextResponse.json({ error: 'Failed to submit project-level application' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload
    const { id: userId, user_type: userType } = decoded

    const body = await request.json()
    const action = String(body.action || '').trim()

    if (!['review-project-application', 'respond-lead-ngo-invitation', 'select-lead-ngo'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    if (action === 'respond-lead-ngo-invitation') {
      if (userType !== 'ngo') {
        return NextResponse.json({ error: 'Only NGOs can respond to lead invitations' }, { status: 403 })
      }

      const inviteId = String(body.inviteId || '').trim()
      const decision = String(body.decision || '').trim().toLowerCase()
      if (!inviteId || !['accepted', 'rejected'].includes(decision)) {
        return NextResponse.json({ error: 'inviteId and decision are required' }, { status: 400 })
      }

      const { data: invite, error: inviteError } = await supabase
        .from('service_request_contributions')
        .select('id, contributor_id, status, meta')
        .eq('id', inviteId)
        .eq('contribution_type', LEAD_NGO_INVITE_CONTRIBUTION_TYPE)
        .single()

      if (inviteError) throw inviteError
      if (!invite || Number(invite.contributor_id) !== Number(userId)) {
        return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
      }

      const currentInviteStatus = String(invite.status || '').toLowerCase()
      const actionableInviteStatuses = ['pending', 'invited', 'pending_acceptance', 'awaiting_acceptance', 'offered', 'assigned']
      if (!actionableInviteStatuses.includes(currentInviteStatus)) {
        return NextResponse.json({ error: 'This invitation is no longer actionable.' }, { status: 409 })
      }

      const projectId = String(invite?.meta?.project_id || '').trim()
      const invitingCompanyId = String(invite?.meta?.inviting_company_id || '').trim()

      if (decision === 'accepted') {
        const { data: existingAcceptedInvite, error: existingAcceptedInviteError } = await supabase
          .from('service_request_contributions')
          .select('id, contributor_id')
          .eq('contribution_type', LEAD_NGO_INVITE_CONTRIBUTION_TYPE)
          .eq('meta->>project_id', projectId)
          .eq('meta->>inviting_company_id', invitingCompanyId)
          .eq('status', 'accepted')
          .neq('id', inviteId)
          .maybeSingle()

        if (existingAcceptedInviteError) throw existingAcceptedInviteError

        if (existingAcceptedInvite) {
          await supabase
            .from('service_request_contributions')
            .update({ status: EXPIRED_STATUS, updated_at: new Date().toISOString() })
            .eq('id', inviteId)

          return NextResponse.json({ error: 'A lead NGO is already accepted for this project invite.' }, { status: 409 })
        }
      }

      const nextMeta = {
        ...(invite.meta && typeof invite.meta === 'object' ? invite.meta : {}),
        ngo_response: decision,
        ngo_responded_at: new Date().toISOString(),
        selected_as_lead: decision === 'accepted',
        selected_at: decision === 'accepted' ? new Date().toISOString() : null,
        auto_selected_by: decision === 'accepted' ? 'ngo_acceptance' : null
      }

      const { error: updateInviteError } = await supabase
        .from('service_request_contributions')
        .update({
          status: decision,
          meta: nextMeta,
          updated_at: new Date().toISOString()
        })
        .eq('id', inviteId)

      if (updateInviteError) throw updateInviteError

      if (decision === 'accepted') {
        const { error: expireOtherInvitesError } = await supabase
          .from('service_request_contributions')
          .update({ status: EXPIRED_STATUS, updated_at: new Date().toISOString() })
          .eq('contribution_type', LEAD_NGO_INVITE_CONTRIBUTION_TYPE)
          .eq('meta->>project_id', projectId)
          .eq('meta->>inviting_company_id', invitingCompanyId)
          .neq('id', inviteId)
          .in('status', ['pending', 'invited', 'pending_acceptance', 'awaiting_acceptance', 'offered', 'assigned'])

        if (expireOtherInvitesError) throw expireOtherInvitesError

        const { data: projectNeeds, error: projectNeedsError } = await supabase
          .from('service_requests')
          .select('id, project_context')
          .eq('project_id', projectId)

        if (projectNeedsError) throw projectNeedsError

        for (const need of projectNeeds || []) {
          const currentContext = safeJsonObject(need.project_context)
          const currentAssignment = safeJsonObject(currentContext.csr_assignment)

          const nextContext = {
            ...currentContext,
            csr_assignment: {
              ...currentAssignment,
              selected_lead_ngo_id: userId,
              selected_lead_ngo_at: new Date().toISOString(),
              lead_selection_mode: 'ngo_acceptance',
              lead_selection_invite_id: inviteId
            }
          }

          const { error: updateNeedError } = await supabase
            .from('service_requests')
            .update({ project_context: nextContext, updated_at: new Date().toISOString() })
            .eq('id', need.id)

          if (updateNeedError) throw updateNeedError
        }
      }

      return NextResponse.json({ success: true, data: { inviteId, decision } })
    }

    if (action === 'select-lead-ngo') {
      if (userType !== 'company') {
        return NextResponse.json({ error: 'Only companies can select lead NGOs' }, { status: 403 })
      }

      if (!(await isFullyVerifiedCompany(userId))) {
        return NextResponse.json({ error: 'Company must be fully verified before selecting a lead NGO' }, { status: 403 })
      }

      const projectId = String(body.projectId || '').trim()
      const ngoId = Number(body.ngoId)
      if (!projectId || !Number.isFinite(ngoId) || ngoId <= 0) {
        return NextResponse.json({ error: 'projectId and ngoId are required' }, { status: 400 })
      }

      const { data: acceptedInvite, error: acceptedInviteError } = await supabase
        .from('service_request_contributions')
        .select('id, status, meta')
        .eq('contribution_type', LEAD_NGO_INVITE_CONTRIBUTION_TYPE)
        .eq('contributor_id', ngoId)
        .eq('meta->>project_id', projectId)
        .eq('meta->>inviting_company_id', String(userId))
        .eq('status', 'accepted')
        .maybeSingle()

      if (acceptedInviteError) throw acceptedInviteError
      if (!acceptedInvite) {
        return NextResponse.json({ error: 'Selected NGO has not accepted an invitation for this project' }, { status: 409 })
      }

      const { data: allInvites, error: allInvitesError } = await supabase
        .from('service_request_contributions')
        .select('id, meta')
        .eq('contribution_type', LEAD_NGO_INVITE_CONTRIBUTION_TYPE)
        .eq('meta->>project_id', projectId)
        .eq('meta->>inviting_company_id', String(userId))

      if (allInvitesError) throw allInvitesError

      for (const invite of allInvites || []) {
        const nextMeta = {
          ...(invite.meta && typeof invite.meta === 'object' ? invite.meta : {}),
          selected_as_lead: String(invite.id) === String(acceptedInvite.id),
          selected_at: String(invite.id) === String(acceptedInvite.id) ? new Date().toISOString() : null,
          selected_by_company_id: userId
        }

        const { error: updateInviteError } = await supabase
          .from('service_request_contributions')
          .update({ meta: nextMeta, updated_at: new Date().toISOString() })
          .eq('id', invite.id)

        if (updateInviteError) throw updateInviteError
      }

      const { data: projectNeeds, error: projectNeedsError } = await supabase
        .from('service_requests')
        .select('id, project_context')
        .eq('project_id', projectId)

      if (projectNeedsError) throw projectNeedsError

      for (const need of projectNeeds || []) {
        const currentContext = safeJsonObject(need.project_context)
        const currentAssignment = safeJsonObject(currentContext.csr_assignment)

        const nextContext = {
          ...currentContext,
          csr_assignment: {
            ...currentAssignment,
            selected_lead_ngo_id: ngoId,
            selected_lead_ngo_at: new Date().toISOString(),
            selected_by_company_id: userId
          }
        }

        const { error: updateNeedError } = await supabase
          .from('service_requests')
          .update({ project_context: nextContext, updated_at: new Date().toISOString() })
          .eq('id', need.id)

        if (updateNeedError) throw updateNeedError
      }

      return NextResponse.json({ success: true, data: { projectId, ngoId } })
    }

    if (userType !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can review project applications' }, { status: 403 })
    }

    const projectId = String(body.projectId || '').trim()
    const companyId = Number(body.companyId)
    const decision = String(body.decision || '').trim().toLowerCase()
    const note = String(body.note || '').trim()

    if (!projectId || !Number.isFinite(companyId) || !['accepted', 'rejected'].includes(decision)) {
      return NextResponse.json({ error: 'projectId, companyId and decision are required' }, { status: 400 })
    }

    if (decision === 'accepted') {
      const { data: alreadyAcceptedRows, error: alreadyAcceptedRowsError } = await supabase
        .from('service_request_contributions')
        .select('id, contributor_id, service_request_id')
        .eq('contribution_type', COMPANY_PROJECT_CONTRIBUTION_TYPE)
        .in('service_request_id', (
          await supabase
            .from('service_requests')
            .select('id')
            .eq('project_id', projectId)
            .eq('ngo_id', userId)
            .not('status', 'in', '(completed,cancelled)')
        ).data?.map((item: any) => item.id) || [])
        .eq('status', 'accepted')
        .neq('contributor_id', companyId)

      if (alreadyAcceptedRowsError) throw alreadyAcceptedRowsError

      if ((alreadyAcceptedRows || []).length > 0) {
        return NextResponse.json({
          error: 'A company application is already accepted for this project. You cannot accept another application.'
        }, { status: 409 })
      }
    }

    const { data: ownNeeds, error: ownNeedsError } = await supabase
      .from('service_requests')
      .select('id, ngo_id, status, project_context')
      .eq('project_id', projectId)
      .eq('ngo_id', userId)
      .not('status', 'in', '(completed,cancelled)')

    if (ownNeedsError) throw ownNeedsError

    const needIds = (ownNeeds || []).map((item: any) => item.id)
    if (needIds.length === 0) {
      return NextResponse.json({ error: 'No active needs found for this project under your NGO' }, { status: 404 })
    }

    const { data: targetRows, error: targetRowsError } = await supabase
      .from('service_request_contributions')
      .select('id, service_request_id, meta')
      .in('service_request_id', needIds)
      .eq('contributor_id', companyId)
      .eq('contribution_type', COMPANY_PROJECT_CONTRIBUTION_TYPE)
      .in('status', actionableProjectApplicationStatuses)

    if (targetRowsError) throw targetRowsError

    if (!targetRows || targetRows.length === 0) {
      return NextResponse.json({ error: 'No matching company application found for this project' }, { status: 404 })
    }

    for (const row of targetRows) {
      const nextMeta = {
        ...(row.meta && typeof row.meta === 'object' ? row.meta : {}),
        review_note: note,
        ngo_reviewed_at: new Date().toISOString(),
        ngo_reviewed_by: userId,
        application_status: decision
      }

      const { error: updateError } = await supabase
        .from('service_request_contributions')
        .update({
          status: decision,
          meta: nextMeta,
          updated_at: new Date().toISOString()
        })
        .eq('id', row.id)

      if (updateError) throw updateError
    }

    if (decision === 'accepted') {
      const { error: expireOtherApplicationsError } = await supabase
        .from('service_request_contributions')
        .update({
          status: EXPIRED_STATUS,
          updated_at: new Date().toISOString()
        })
        .in('service_request_id', needIds)
        .eq('contribution_type', COMPANY_PROJECT_CONTRIBUTION_TYPE)
        .neq('contributor_id', companyId)
        .in('status', reviewQueueProjectApplicationStatuses)

      if (expireOtherApplicationsError) throw expireOtherApplicationsError

      for (const need of ownNeeds || []) {
        const existingContext = safeJsonObject(need.project_context)
        const nextContext = {
          ...existingContext,
          csr_assignment: {
            ...(existingContext.csr_assignment && typeof existingContext.csr_assignment === 'object' ? existingContext.csr_assignment : {}),
            mode: 'company_project_handoff',
            project_id: projectId,
            lead_ngo_id: userId,
            assigned_company_id: companyId,
            assignment_status: 'accepted',
            assigned_at: new Date().toISOString(),
            review_note: note || null,
            payment_provider: 'razorpay',
            logistics_provider: 'delhivery'
          }
        }

        const { error: requestUpdateError } = await supabase
          .from('service_requests')
          .update({
            status: 'in_progress',
            project_context: nextContext,
            updated_at: new Date().toISOString()
          })
          .eq('id', need.id)

        if (requestUpdateError) throw requestUpdateError
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        projectId,
        companyId,
        decision,
        affectedNeeds: needIds.length
      }
    })
  } catch (error) {
    console.error('Error reviewing company project application:', error)
    return NextResponse.json({ error: 'Failed to review project application' }, { status: 500 })
  }
}

function safeBoolean(value: any): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value === 'string') return ['true', '1', 'yes'].includes(value.toLowerCase())
  return false
}