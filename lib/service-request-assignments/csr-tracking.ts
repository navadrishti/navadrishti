import { NextResponse } from 'next/server'
import { supabase, getProjectLeadNgoId, buildProjectLeadNgoPatch } from '@/lib/db'
import { parseJsonObject } from '@/lib/utils'
import {
  COMPANY_PROJECT_CONTRIBUTION_TYPE,
  LEAD_NGO_INVITE_CONTRIBUTION_TYPE,
  safeBoolean,
  safeNoteFromMeta,
  safeProjectIdFromMeta,
  type AssignmentsGetContext,
} from '@/lib/service-request-assignments/shared'
import type { Tables } from '@/lib/database.types'

type TrackingContribution = Pick<
  Tables<'service_request_contributions'>,
  'id' | 'service_request_id' | 'contributor_id' | 'status' | 'reference_text' | 'meta' | 'created_at' | 'updated_at'
>

type TrackingNeed = Pick<
  Tables<'service_requests'>,
  'id' | 'project_id' | 'ngo_id' | 'title' | 'status' | 'request_type' | 'category' | 'project_context' | 'updated_at'
>

type TrackingProject = Pick<
  Tables<'service_request_projects'>,
  | 'id'
  | 'ngo_id'
  | 'title'
  | 'description'
  | 'location'
  | 'exact_address'
  | 'timeline'
  | 'status'
  | 'expected_beneficiaries'
  | 'valid_until'
  | 'lead_ngo_user_id'
  | 'assigned_company_user_id'
  | 'assignment_status'
  | 'csr_project_available_for_csr'
  | 'created_at'
  | 'updated_at'
>

type TrackingUser = Pick<Tables<'users'>, 'id' | 'name' | 'email' | 'verification_status'>

type HandoffPair = {
  projectId: string
  companyId: number
  contributions: TrackingContribution[]
}

export async function getCsrTracking(ctx: AssignmentsGetContext) {
  const { userId, userType } = ctx

  if (!['ngo', 'company'].includes(userType)) {
    return NextResponse.json({ error: 'Only NGO and company users can view CSR tracking' }, { status: 403 })
  }

  const projectSelect = `
      id,
      ngo_id,
      title,
      description,
      location,
      exact_address,
      timeline,
      status,
      expected_beneficiaries,
      valid_until,
      lead_ngo_user_id,
      assigned_company_user_id,
      assignment_status,
      csr_project_available_for_csr,
      created_at,
      updated_at
    `

  let contributionQuery = supabase
    .from('service_request_contributions')
    .select('id, service_request_id, contributor_id, status, reference_text, meta, created_at, updated_at')
    .eq('contribution_type', COMPANY_PROJECT_CONTRIBUTION_TYPE)
    .in('status', ['accepted', 'in_progress', 'completed'])
    .order('updated_at', { ascending: false })

  if (userType === 'company') {
    contributionQuery = contributionQuery.eq('contributor_id', userId)
  }

  const { data: contributions, error: contributionsError } = await contributionQuery
  if (contributionsError) throw contributionsError

  const contributionNeedIds = [...new Set(
    (contributions || [])
      .map((item) => Number(item.service_request_id))
      .filter((id: number) => Number.isFinite(id) && id > 0)
  )]

  const { data: contributionNeeds, error: contributionNeedsError } = contributionNeedIds.length > 0
    ? await supabase
        .from('service_requests')
        .select('id, project_id, ngo_id, title, status, request_type, category, project_context, updated_at')
        .in('id', contributionNeedIds)
    : { data: [], error: null }

  if (contributionNeedsError) throw contributionNeedsError

  const needById = new Map<number, TrackingNeed>((contributionNeeds || []).map((need) => [Number(need.id), need]))
  const handoffPairs = new Map<string, HandoffPair>()

  const contributionProjectId = (contribution: TrackingContribution) => {
    const need = needById.get(Number(contribution.service_request_id))
    return String(safeProjectIdFromMeta(parseJsonObject(contribution.meta)) || need?.project_id || '').trim()
  }
  const handoffProjectIds = [...new Set((contributions || []).map(contributionProjectId).filter(Boolean))]
  const { data: handoffProjects } = userType === 'ngo' && handoffProjectIds.length > 0
    ? await supabase.from('service_request_projects').select('id, lead_ngo_user_id').in('id', handoffProjectIds)
    : { data: [] as Array<{ id: string; lead_ngo_user_id: number | null }> }
  const leadNgoByProjectId = new Map<string, number>(
    (handoffProjects || []).map((project) => [String(project.id), getProjectLeadNgoId(project)])
  )

  for (const contribution of contributions || []) {
    const need = needById.get(Number(contribution.service_request_id))
    if (!need) continue

    const meta = parseJsonObject(contribution.meta)
    const projectId = contributionProjectId(contribution)
    if (!projectId) continue

    const companyId = Number(contribution.contributor_id || meta.company_id || 0)
    if (!Number.isFinite(companyId) || companyId <= 0) continue

    const ownerNgoId = Number(need.ngo_id || 0)
    if (userType === 'ngo' && ownerNgoId !== Number(userId) && leadNgoByProjectId.get(projectId) !== Number(userId)) {
      continue
    }

    const key = `${projectId}::${companyId}`
    const bucket: HandoffPair = handoffPairs.get(key) || { projectId, companyId, contributions: [] }
    bucket.contributions.push(contribution)
    handoffPairs.set(key, bucket)
  }

  let assignedProjectQuery = supabase
    .from('service_request_projects')
    .select(projectSelect)
    .not('assigned_company_user_id', 'is', null)

  if (userType === 'ngo') {
    assignedProjectQuery = assignedProjectQuery.or(`ngo_id.eq.${userId},lead_ngo_user_id.eq.${userId}`)
  } else {
    assignedProjectQuery = assignedProjectQuery.eq('assigned_company_user_id', userId)
  }

  const { data: assignedProjects, error: assignedProjectsError } = await assignedProjectQuery
  if (assignedProjectsError) throw assignedProjectsError

  for (const project of assignedProjects || []) {
    const companyId = Number(project.assigned_company_user_id || 0)
    if (!companyId) continue
    const key = `${String(project.id)}::${companyId}`
    if (!handoffPairs.has(key)) {
      handoffPairs.set(key, { projectId: String(project.id), companyId, contributions: [] })
    }
  }

  if (handoffPairs.size === 0) {
    return NextResponse.json({ success: true, data: [] })
  }

  const projectIds = [...new Set([...handoffPairs.values()].map((pair) => pair.projectId))]

  const { data: projects, error: projectsError } = await supabase
    .from('service_request_projects')
    .select(projectSelect)
    .in('id', projectIds)

  if (projectsError) throw projectsError

  const projectById = new Map<string, TrackingProject>((projects || []).map((project) => [String(project.id), project]))

  for (const pair of handoffPairs.values()) {
    const project = projectById.get(pair.projectId)
    if (!project) continue
    if (Number(project.assigned_company_user_id || 0) > 0) continue
    const hasAcceptedContribution = pair.contributions.some((item) =>
      ['accepted', 'in_progress', 'completed'].includes(String(item.status || '').toLowerCase())
    )
    if (!hasAcceptedContribution) continue

    const { data: repaired, error: repairError } = await supabase
      .from('service_request_projects')
      .update({
        assigned_company_user_id: pair.companyId,
        assignment_status: 'accepted',
        ...buildProjectLeadNgoPatch(getProjectLeadNgoId(project) || project.ngo_id),
        status: project.status === 'active' ? 'in_progress' : project.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pair.projectId)
      .is('assigned_company_user_id', null)
      .select(projectSelect)
      .maybeSingle()

    if (!repairError && repaired) {
      projectById.set(pair.projectId, repaired)
    }
  }

  const { data: needs, error: needsError } = await supabase
    .from('service_requests')
    .select('id, project_id, ngo_id, title, status, request_type, category, project_context, updated_at')
    .in('project_id', projectIds)
    .order('created_at', { ascending: true })

  if (needsError) throw needsError

  const { data: allLeadInvites, error: allLeadInvitesError } = await supabase
    .from('service_request_contributions')
    .select('id, contributor_id, status, reference_text, meta, created_at, updated_at')
    .eq('contribution_type', LEAD_NGO_INVITE_CONTRIBUTION_TYPE)
    .order('created_at', { ascending: false })

  if (allLeadInvitesError) throw allLeadInvitesError

  const userIds = new Set<number>()
  for (const project of projectById.values()) {
    if (project.ngo_id) userIds.add(Number(project.ngo_id))
    if (project.assigned_company_user_id) userIds.add(Number(project.assigned_company_user_id))
    const leadNgoId = getProjectLeadNgoId(project)
    if (leadNgoId) userIds.add(leadNgoId)
  }
  for (const pair of handoffPairs.values()) {
    userIds.add(pair.companyId)
  }
  for (const invite of allLeadInvites || []) {
    userIds.add(Number(invite.contributor_id))
  }

  const { data: users, error: usersError } = userIds.size > 0
    ? await supabase
        .from('users')
        .select('id, name, email, verification_status')
        .in('id', [...userIds])
    : { data: [], error: null }

  if (usersError) throw usersError

  const userById = new Map<number, TrackingUser>((users || []).map((item) => [Number(item.id), item]))
  const needsByProject = new Map<string, TrackingNeed[]>()
  for (const need of needs || []) {
    const projectId = String(need.project_id || '')
    if (!projectId) continue
    const bucket = needsByProject.get(projectId) || []
    bucket.push(need)
    needsByProject.set(projectId, bucket)
  }

  const payload = [...handoffPairs.values()]
    .map((pair) => {
      const project = projectById.get(pair.projectId)
      if (!project) return null

      const projectId = String(project.id)
      const companyId = Number(project.assigned_company_user_id || pair.companyId || 0)
      const ownerNgoId = Number(project.ngo_id || 0)
      const selectedLeadNgoId = getProjectLeadNgoId(project)
      const projectNeeds = needsByProject.get(projectId) || []
      const ownerNgo = userById.get(ownerNgoId)
      const company = userById.get(companyId)
      const selectedLeadNgo = selectedLeadNgoId > 0 ? userById.get(selectedLeadNgoId) : null

      const categoryLabels = [...new Set(
        projectNeeds
          .map((need) => String(need.request_type || need.category || '').trim())
          .filter(Boolean)
      )]

      const firstNeedContext = projectNeeds.length > 0
        ? parseJsonObject(projectNeeds[0].project_context)
        : {}
      const csrAssignment = parseJsonObject(firstNeedContext.csr_assignment)

      const relatedContributions = pair.contributions.length > 0
        ? pair.contributions
        : (contributions || []).filter((contribution) => {
            const need = needById.get(Number(contribution.service_request_id))
            return need &&
              String(need.project_id || '') === projectId &&
              Number(contribution.contributor_id) === companyId
          })

      const reviewNoteFromContribution = relatedContributions
        .map((contribution) => {
          const meta = parseJsonObject(contribution.meta)
          return String(meta.review_note || safeNoteFromMeta(contribution.meta) || contribution.reference_text || '').trim()
        })
        .find(Boolean)

      const assignedAtFromContribution = relatedContributions
        .map((contribution) => {
          const meta = parseJsonObject(contribution.meta)
          return meta.ngo_reviewed_at || contribution.updated_at || contribution.created_at || null
        })
        .find(Boolean)

      const contributionStatus = relatedContributions
        .map((contribution) => String(contribution.status || '').toLowerCase())
        .sort((a: string, b: string) => {
          const rank = (value: string) => (
            value === 'completed' ? 3 : value === 'in_progress' ? 2 : value === 'accepted' ? 1 : 0
          )
          return rank(b) - rank(a)
        })[0]

      const relevantInvites = (allLeadInvites || []).filter((invite) => {
        const meta = parseJsonObject(invite.meta)
        return String(meta.project_id || '') === projectId && Number(meta.inviting_company_id || 0) === companyId
      })

      const leadNgoInvites = relevantInvites.map((invite) => {
        const inviteNgoId = Number(invite.contributor_id)
        const inviteNgo = userById.get(inviteNgoId)
        const meta = parseJsonObject(invite.meta)
        return {
          id: invite.id,
          ngo_id: inviteNgoId,
          ngo_name: inviteNgo?.name || 'NGO',
          ngo_email: inviteNgo?.email || '',
          ngo_verification_status: inviteNgo?.verification_status || null,
          ngo_verified: String(inviteNgo?.verification_status || '').toLowerCase() === 'verified',
          status: invite.status,
          note: String(invite.reference_text || meta.note || ''),
          selected_as_lead: safeBoolean(meta.selected_as_lead),
          created_at: invite.created_at,
          updated_at: invite.updated_at,
        }
      })

      return {
        project_id: projectId,
        project_title: project.title || 'Project',
        project_description: project.description || '',
        project_location: project.exact_address || project.location || '',
        project_timeline: project.timeline || '',
        project_category: categoryLabels.length === 1
          ? categoryLabels[0]
          : (categoryLabels.length > 1 ? categoryLabels.join(' • ') : null),
        project_expected_beneficiaries: project.expected_beneficiaries ?? null,
        project_valid_until: project.valid_until ?? null,
        project_status: project.status || null,
        csr_project_available_for_csr: project.csr_project_available_for_csr ?? null,
        lead_ngo_id: ownerNgoId,
        lead_ngo_name: ownerNgo?.name || 'NGO',
        lead_ngo_email: ownerNgo?.email || '',
        lead_ngo_verification_status: ownerNgo?.verification_status || null,
        lead_ngo_verified: String(ownerNgo?.verification_status || '').toLowerCase() === 'verified',
        assigned_company_id: companyId,
        assigned_company_name: company?.name || 'Company',
        assigned_company_email: company?.email || '',
        assigned_company_verification_status: company?.verification_status || null,
        assigned_company_verified: String(company?.verification_status || '').toLowerCase() === 'verified',
        selected_lead_ngo_id: selectedLeadNgoId > 0 ? selectedLeadNgoId : null,
        selected_lead_ngo_name: selectedLeadNgo?.name || null,
        selected_lead_ngo_email: selectedLeadNgo?.email || null,
        selected_lead_ngo_verification_status: selectedLeadNgo?.verification_status || null,
        selected_lead_ngo_verified: String(selectedLeadNgo?.verification_status || '').toLowerCase() === 'verified',
        ngo_dashboard_role: ownerNgoId === Number(userId)
          ? 'request_owner'
          : (selectedLeadNgoId === Number(userId) ? 'selected_lead' : 'viewer'),
        assignment_status: String(
          project.assignment_status || csrAssignment.assignment_status || contributionStatus || 'accepted'
        ).toLowerCase(),
        assigned_at: csrAssignment.assigned_at || assignedAtFromContribution || project.updated_at || project.created_at || null,
        review_note: String(csrAssignment.review_note || reviewNoteFromContribution || '').trim(),
        lead_ngo_invites: leadNgoInvites,
        needs: projectNeeds.map((need) => ({
          id: need.id,
          title: need.title,
          status: need.status,
          request_type: need.request_type || need.category,
        })),
      }
    })
    .filter(Boolean)

  return NextResponse.json({ success: true, data: payload })
}
