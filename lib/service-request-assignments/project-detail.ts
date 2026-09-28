import { NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { parseJsonObject } from '@/lib/utils'
import { enrichProjectRecord, redactProjectSensitiveFields } from '@/lib/service-request-allocation'
import {
  COMPANY_PROJECT_CONTRIBUTION_TYPE,
  LEAD_NGO_INVITE_CONTRIBUTION_TYPE,
  type AssignmentsGetContext,
} from '@/lib/service-request-assignments/shared'
import type { Tables } from '@/lib/database.types'

type ProjectRecord = Omit<Partial<Tables<'service_request_projects'>>, 'ngo_id'> & {
  ngo_id?: number | null
  ngo?: unknown
}

type CompanyApplicationGroup = {
  company_id: number
  company_name?: string | null
  status: string
  created_at: string | null
  updated_at: string | null
  note?: string
  needs: Array<{ id: number; status: string }>
}

type ProjectDetailPayload = {
  project: Record<string, unknown> | null | undefined
  company_applications: CompanyApplicationGroup[]
  lead_ngo_invites: unknown[]
  [key: string]: unknown
}

export async function getProjectDetail(ctx: AssignmentsGetContext) {
  const { searchParams, userId, userType } = ctx

  const projectId = String(searchParams.get('projectId') || '').trim()
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  // project-detail: loading project (logs suppressed)

  const { data: joinedProject, error: projectError } = await supabase
    .from('service_request_projects')
    .select('id, ngo_id, title, description, location, exact_address, timeline, status, valid_until, expected_beneficiaries, volunteers_needed, csr_project_available_for_csr, assigned_company_user_id, assignment_status, updated_at, created_at, ngo:users!ngo_id(id, name, email, location, city, state_province, country, phone, ngo_volunteer_capacity, industry, pincode, profile_image, profile_data, verification_status)')
    .eq('id', projectId)
    .maybeSingle()

  let project: ProjectRecord | null = joinedProject

  // If there's an error (likely due to broken foreign key), try without the ngo join
  if (projectError || !project) {
    if (projectError) {
      // project-detail: ngo join error suppressed
    }
    
    const { data: projectWithoutNgo, error: projectErrorWithoutNgo } = await supabase
      .from('service_request_projects')
      .select('id, ngo_id, title, description, location, exact_address, timeline, status, valid_until, expected_beneficiaries, volunteers_needed, csr_project_available_for_csr, assigned_company_user_id, assignment_status, updated_at, created_at')
      .eq('id', projectId)
      .maybeSingle()

    if (projectErrorWithoutNgo) {
      // project-detail: project fetch error suppressed
      throw projectErrorWithoutNgo
    }
    
    if (!projectWithoutNgo) {
      // project-detail: project row missing; will synthesize from linked needs
    }

    project = projectWithoutNgo
    if (project) {
      // project-detail: project loaded (without ngo)
    }

    if (project?.ngo_id) {
      const { data: ngo, error: ngoError } = await supabase
        .from('users')
        .select('id, name, email, location, city, state_province, country, phone, ngo_volunteer_capacity, industry, pincode, profile_image, profile_data')
        .eq('id', project.ngo_id)
        .maybeSingle()

      if (!ngoError && ngo) {
        project.ngo = ngo
        // project-detail: NGO loaded
      }
    }
  } else {
    // project-detail: project loaded with ngo join
  }

  const { data: needs, error: needsError } = await supabase
    .from('service_requests')
    .select('id, ngo_id, title, description, image_url, status, request_type, category, estimated_budget, target_amount, target_quantity, beneficiary_count, location, timeline, project_context, created_at, updated_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (needsError) {
    // project-detail: needs fetch error suppressed
    throw needsError
  }

  const needsList = Array.isArray(needs) ? needs : []
  // project-detail: needs loaded

  if (!project && needsList.length > 0) {
    const firstNeed = needsList[0]
    const projectContext = parseJsonObject(firstNeed?.project_context)
    const fallbackNgoId = Number(firstNeed?.ngo_id || 0) || null
    const fallbackProject: ProjectRecord = {
      id: projectId,
      ngo_id: fallbackNgoId,
      title: String(projectContext.project_title || firstNeed.title || 'Project'),
      description: String(projectContext.project_description || firstNeed.description || ''),
      location: String(projectContext.project_location || firstNeed.location || ''),
      exact_address: String(projectContext.project_location || firstNeed.location || ''),
      timeline: String(projectContext.project_timeline || firstNeed.timeline || ''),
      status: String(projectContext.project_status || 'active'),
      created_at: firstNeed.created_at,
      updated_at: firstNeed.updated_at,
      ngo: null
    }

    if (fallbackNgoId) {
      const { data: fallbackNgo, error: fallbackNgoError } = await supabase
        .from('users')
        .select('id, name, email, location, city, state_province, country, phone, ngo_volunteer_capacity, industry, pincode, profile_image, profile_data')
        .eq('id', fallbackNgoId)
        .maybeSingle()

      if (!fallbackNgoError && fallbackNgo) {
        fallbackProject.ngo = fallbackNgo
        // project-detail: fallback NGO loaded
      }
    }

    project = fallbackProject
    // project-detail: synthesized project payload from first need
  }

  const firstNeedContext = needsList.length > 0
    ? parseJsonObject(needsList[0]?.project_context)
    : {}
  const metaEnriched = project ? enrichProjectRecord(project) : null
  const enrichedProject = metaEnriched
    ? {
        ...metaEnriched,
        category: metaEnriched.category
          || String(firstNeedContext.project_category || needsList[0]?.category || '').trim()
          || null,
        csr_project_available_for_csr:
          metaEnriched.csr_project_available_for_csr ??
          (firstNeedContext.csr_project_available_for_csr !== undefined
            ? firstNeedContext.csr_project_available_for_csr !== false
            : true),
        expected_beneficiaries: metaEnriched.expected_beneficiaries ?? (firstNeedContext.project_expected_beneficiaries != null
          ? Number(firstNeedContext.project_expected_beneficiaries)
          : null),
        valid_until: metaEnriched.valid_until ?? (firstNeedContext.project_valid_until
          ? String(firstNeedContext.project_valid_until)
          : null),
        budget_inr: metaEnriched.budget_inr ?? null,
        impact_description: metaEnriched.impact_description || null,
        contact_info: metaEnriched.contact_info || null,
        volunteers_needed: metaEnriched.volunteers_needed ?? null,
      }
    : null

  const needIds = needsList.map((item) => item.id)
  const anchorNeedId = needIds[0] || null

  const { data: applications, error: applicationsError } = needIds.length > 0
    ? await supabase
        .from('service_request_contributions')
        .select('id, service_request_id, contributor_id, status, meta, created_at, updated_at')
        .in('service_request_id', needIds)
        .eq('contribution_type', COMPANY_PROJECT_CONTRIBUTION_TYPE)
    : { data: [], error: null }

  if (applicationsError) {
    // project-detail: applications fetch error suppressed
    throw applicationsError
  }

  const { data: leadInvites, error: leadInvitesError } = await supabase
    .from('service_request_contributions')
    .select('id, service_request_id, contributor_id, status, reference_text, meta, created_at, updated_at, ngo:users!contributor_id(id, name, email)')
    .eq('contribution_type', LEAD_NGO_INVITE_CONTRIBUTION_TYPE)
    .eq('meta->>project_id', projectId)
    .order('created_at', { ascending: false })

  if (leadInvitesError) {
    // project-detail: lead invites fetch error suppressed
    throw leadInvitesError
  }

  const { data: fulfillmentRows, error: fulfillmentRowsError } = needIds.length > 0
    ? await supabase
        .from('service_request_applications')
        .select(`
          service_request_id,
          status,
          volunteer:users!applicant_user_id(id, user_type),
          fulfillment:service_request_fulfillments!application_id(
            individual_done_at,
            ngo_confirmed_at,
            fulfilled_amount,
            fulfilled_quantity
          )
        `)
        .in('service_request_id', needIds)
    : { data: [], error: null }

  if (fulfillmentRowsError) {
    // project-detail: fulfillment rows fetch error suppressed
    throw fulfillmentRowsError
  }

  const hasIndividualFulfillment = needsList.length > 0 && (fulfillmentRows || []).some((row) => {
    const isIndividual = String(row?.volunteer?.user_type || '').toLowerCase() === 'individual'
    const status = String(row?.status || '').toLowerCase()
    const ful = Array.isArray(row?.fulfillment) ? row.fulfillment[0] : row?.fulfillment
    return isIndividual && (
      status === 'completed' ||
      !!ful?.individual_done_at ||
      !!ful?.ngo_confirmed_at ||
      Number(ful?.fulfilled_amount || 0) > 0 ||
      Number(ful?.fulfilled_quantity || 0) > 0
    )
  })

  const groupedApplicationsByCompany = (applications || []).reduce<Record<string, CompanyApplicationGroup>>((acc, item) => {
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

  // Merge meta-stored company applications (standalone projects without child needs).
  const metaApps = Array.isArray(enrichedProject?.pending_company_applications)
    ? enrichedProject.pending_company_applications
    : []
  for (const app of metaApps) {
    const companyId = Number(app.company_id)
    if (!Number.isFinite(companyId) || companyId <= 0) continue
    const key = String(companyId)
    if (groupedApplicationsByCompany[key]) continue
    groupedApplicationsByCompany[key] = {
      company_id: companyId,
      company_name: app.company_name || null,
      status: String(app.status || 'pending').toLowerCase(),
      created_at: app.applied_at || null,
      updated_at: app.applied_at || null,
      note: app.note || '',
      needs: [],
    }
  }

  const assignmentLocked =
    Number(enrichedProject?.assigned_company_user_id || 0) > 0 &&
    String(enrichedProject?.assignment_status || '').toLowerCase() === 'accepted'

  const responsePayload: ProjectDetailPayload = {
    project: enrichedProject,
    anchor_need_id: anchorNeedId,
    needs: needsList,
    need_breakdown: {
      ongoing: needsList.filter((item) => !['completed', 'cancelled'].includes(String(item.status || '').toLowerCase())),
      fulfilled: needsList.filter((item) => ['completed'].includes(String(item.status || '').toLowerCase())),
      removed: needsList.filter((item) => ['cancelled'].includes(String(item.status || '').toLowerCase()))
    },
    company_applications: Object.values(groupedApplicationsByCompany),
    lead_ngo_invites: leadInvites || [],
    // Standalone projects (no child needs) are gated only by assignment status.
    csr_project_eligible_for_company_apply: !assignmentLocked && (needsList.length === 0 || !hasIndividualFulfillment),
    csr_project_ineligible_reason: assignmentLocked
      ? 'This project has already been accepted by a company.'
      : (hasIndividualFulfillment ? 'One or more legacy needs in this project were already fulfilled by individuals.' : '')
  }

  if (!userId) {
    responsePayload.project = redactProjectSensitiveFields(enrichedProject)
    responsePayload.company_applications = []
    responsePayload.lead_ngo_invites = []
  } else {
    const ownerNgoId = Number(enrichedProject?.ngo_id || 0)
    const assignedCompanyId = Number(enrichedProject?.assigned_company_user_id || 0)
    const isOwnerNgo = userType === 'ngo' && ownerNgoId === Number(userId)
    const isAssignedCompany = userType === 'company' && assignedCompanyId === Number(userId)
    if (!isOwnerNgo && !isAssignedCompany) {
      // Other authenticated viewers only see their own pending application, if any.
      const myApps = Array.isArray(enrichedProject?.pending_company_applications)
        ? enrichedProject.pending_company_applications.filter(
            (item) => Number(item?.company_id) === Number(userId)
          )
        : []
      responsePayload.project = {
        ...redactProjectSensitiveFields(enrichedProject, { keepNgoContact: true }),
        pending_company_applications: myApps,
      }
      responsePayload.company_applications = (responsePayload.company_applications || []).filter(
        (app) => Number(app?.company_id) === Number(userId)
      )
      responsePayload.lead_ngo_invites = []
    }
  }

  // project-detail: returning payload for project

  return NextResponse.json({ success: true, data: responsePayload })
}
