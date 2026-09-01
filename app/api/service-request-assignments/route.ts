import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { supabase } from '@/lib/db'
import {
  JWT_SECRET,
  assertCsr1CoversProject,
  ngoIsCsrEligibleForProject,
  CSR_ELIGIBILITY_REQUIRED_MESSAGE,
} from '@/lib/auth'
import { assertNgoCsr1CoversProject } from '@/lib/server-auth'
import {
  enrichProjectRecord,
  parseProjectMeta,
  withProjectMeta,
  redactProjectSensitiveFields,
  isAuthenticCompanyProjectApplication,
  formatProjectExactAddress,
  projectAddressToLocationSummary,
  parseProjectExactAddress,
} from '@/lib/service-request-allocation'

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
    .maybeSingle()

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

function isProjectAvailableForCsr(requestItem: any): boolean {
  const projectContext = safeJsonObject(requestItem?.project_context)
  const assignment = safeJsonObject(projectContext?.csr_assignment)
  if (projectContext?.csr_project_available_for_csr === false) return false
  if (assignment?.mode === 'company_project_handoff') return false
  if (Number(assignment?.assigned_company_id || 0) > 0) return false
  return true
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
    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view') || 'ongoing'
    const mode = searchParams.get('mode') || ''
    const requestIdFilter = Number(searchParams.get('requestId') || '')

    const authHeader = request.headers.get('authorization')
    let userId = 0
    let userType = ''
    let userName = ''

    if (mode === 'project-detail') {
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET) as JWTPayload
          userId = decoded.id
          userType = decoded.user_type
          userName = decoded.name
        } catch {
          // Invalid token — still allow public read-only project detail
        }
      }
    } else {
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
      }

      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET) as JWTPayload
      userId = decoded.id
      userType = decoded.user_type
      userName = decoded.name
    }

    if (mode === 'company-projects') {
      if (userType !== 'company') {
        return NextResponse.json({ error: 'Only companies can view project opportunities' }, { status: 403 })
      }

      const { data: projects, error: projectsError } = await supabase
        .from('service_request_projects')
        .select(`
          id,
          ngo_id,
          title,
          description,
          location,
          exact_address,
          timeline,
          status,
          valid_until,
          expected_beneficiaries,
          volunteers_needed,
          csr_project_available_for_csr,
          assigned_company_user_id,
          assignment_status,
          created_at,
          updated_at,
          ngo:users!ngo_id(id, name, email, verification_status, profile_data)
        `)
        .neq('ngo_id', userId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })

      if (projectsError) throw projectsError

      const companyFullyVerified = await isFullyVerifiedCompany(userId)
      const opportunities = []

      for (const raw of projects || []) {
        const project = enrichProjectRecord(raw) as any
        if (project?.csr_project_available_for_csr === false) continue
        if (Number(project.assigned_company_user_id || 0) > 0 && String(project.assignment_status || '').toLowerCase() === 'accepted') {
          continue
        }

        const ngo = Array.isArray(project.ngo) ? project.ngo[0] : project.ngo
        if (
          !ngoIsCsrEligibleForProject(ngo?.verification_status, ngo?.profile_data, {
            valid_until: project.valid_until,
            timeline: project.timeline,
          })
        ) {
          continue
        }

        const pending = Array.isArray(project.pending_company_applications)
          ? project.pending_company_applications
          : []
        const myApp = pending.find((item: any) => Number(item.company_id) === Number(userId))
        const acceptedElsewhere = pending.some(
          (item: any) => String(item.status || '').toLowerCase() === 'accepted' && Number(item.company_id) !== Number(userId)
        )
        if (acceptedElsewhere) continue

        let companyApplicationStatus = 'none'
        if (Number(project.assigned_company_user_id || 0) === Number(userId) && String(project.assignment_status || '').toLowerCase() === 'accepted') {
          companyApplicationStatus = 'accepted'
        } else if (myApp) {
          companyApplicationStatus = String(myApp.status || 'pending').toLowerCase()
        }

        const canApplyByStatus = companyApplicationStatus === 'none'
        const company_application_eligible = canApplyByStatus && companyFullyVerified
        const company_application_reason = !companyFullyVerified
          ? 'Complete email, phone, and document verification before applying for takeover.'
          : ''

        opportunities.push({
          project_id: String(project.id),
          project_title: project.title || 'Project',
          project_description: project.description || '',
          project_location: project.exact_address || project.location || '',
          project_timeline: project.timeline || '',
          project_category: project.category || null,
          project_budget_inr: project.budget_inr ?? null,
          project_expected_beneficiaries: project.expected_beneficiaries ?? null,
          project_impact_description: project.impact_description || null,
          volunteers_needed: project.volunteers_needed ?? null,
          ngo_id: project.ngo_id,
          ngo_name: ngo?.name || 'NGO',
          ngo_email: ngo?.email || '',
          ngo_verification_status: ngo?.verification_status || null,
          ngo_verified: String(ngo?.verification_status || '').toLowerCase() === 'verified',
          needs: [],
          company_application_status: companyApplicationStatus,
          company_application_eligible,
          company_application_reason,
          latest_application_at: myApp?.applied_at || null,
          note: myApp?.note || '',
        })
      }

      return NextResponse.json({
        success: true,
        data: opportunities,
        meta: { company_fully_verified: companyFullyVerified },
      })
    }

    if (mode === 'ngo-company-applications') {
      if (userType !== 'ngo') {
        return NextResponse.json({ error: 'Only NGOs can view company applications' }, { status: 403 })
      }

      const { data: ownProjects, error: ownProjectsError } = await supabase
        .from('service_request_projects')
        .select(`
          id,
          title,
          description,
          location,
          exact_address,
          timeline,
          status,
          valid_until,
          expected_beneficiaries,
          volunteers_needed,
          assigned_company_user_id,
          assignment_status,
          created_at,
          updated_at
        `)
        .eq('ngo_id', userId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })

      if (ownProjectsError) throw ownProjectsError

      const grouped = new Map<string, any>()

      const companyIds = new Set<number>()
      for (const raw of ownProjects || []) {
        const project = enrichProjectRecord(raw) as any
        const pending = Array.isArray(project.pending_company_applications)
          ? project.pending_company_applications
          : []
        const formattedAddress = formatProjectExactAddress(project.exact_address || project.location)
        const locationSummary =
          projectAddressToLocationSummary(parseProjectExactAddress(project.exact_address || project.location)) ||
          project.location ||
          ''
        for (const app of pending) {
          const companyId = Number(app.company_id)
          if (!Number.isFinite(companyId) || companyId <= 0) continue
          const status = String(app.status || 'pending').toLowerCase()
          if (!reviewQueueProjectApplicationStatuses.includes(status) && status !== 'accepted') continue
          companyIds.add(companyId)
          const key = `${project.id}::${companyId}`
          const rawNote = String(app.note || '').trim()
          const note =
            !rawNote || /^applied from /i.test(rawNote) ? '' : rawNote
          grouped.set(key, {
            project_id: String(project.id),
            project_title: project.title || 'Project',
            project_location: locationSummary,
            project_address: formattedAddress !== 'Not set' ? formattedAddress : locationSummary,
            project_timeline: project.timeline || '',
            project_valid_until: project.valid_until || null,
            project_expected_beneficiaries: project.expected_beneficiaries ?? null,
            project_volunteers_needed: project.volunteers_needed ?? null,
            project_category: project.category || null,
            project_budget_inr: project.budget_inr ?? null,
            company_id: companyId,
            company_name: app.company_name || 'Company',
            company_email: '',
            company_location: '',
            status,
            note,
            applied_at: app.applied_at || project.created_at,
            created_at: app.applied_at || project.created_at,
            updated_at: project.updated_at,
            needs: [] as any[],
          })
        }
      }

      // Legacy contribution-based applications (pre-split projects with child needs).
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
      if (ownNeedIds.length > 0) {
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

        for (const item of contributions || []) {
          const need = needsById.get(item.service_request_id)
          if (!need) continue

          const normalizedNeed = need as any
          const normalizedProject = Array.isArray(normalizedNeed.project) ? normalizedNeed.project[0] : normalizedNeed.project
          const normalizedContributor = Array.isArray(item.contributor) ? item.contributor[0] : item.contributor

          const projectId = String(need.project_id)
          const companyId = Number(item.contributor_id)
          companyIds.add(companyId)
          const key = `${projectId}::${companyId}`

          const existing = grouped.get(key) || {
            project_id: projectId,
            project_title: normalizedProject?.title || 'Project',
            project_location:
              projectAddressToLocationSummary(
                parseProjectExactAddress(normalizedProject?.exact_address || normalizedProject?.location)
              ) ||
              normalizedProject?.location ||
              '',
            project_address: formatProjectExactAddress(
              normalizedProject?.exact_address || normalizedProject?.location
            ),
            project_timeline: normalizedProject?.timeline || '',
            project_valid_until: null,
            project_expected_beneficiaries: null,
            project_volunteers_needed: null,
            project_category: null,
            project_budget_inr: null,
            company_id: companyId,
            company_name: normalizedContributor?.name || 'Company',
            company_email: normalizedContributor?.email || '',
            company_location: '',
            status: String(item.status || 'pending').toLowerCase(),
            note: (() => {
              const raw = String(safeNoteFromMeta(item.meta) || item.reference_text || '').trim()
              return !raw || /^applied from /i.test(raw) ? '' : raw
            })(),
            applied_at: item.created_at,
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

          if (normalizedContributor?.name) existing.company_name = normalizedContributor.name
          if (normalizedContributor?.email) existing.company_email = normalizedContributor.email

          grouped.set(key, existing)
        }
      }

      // Enrich company emails/names/location for meta-only applications.
      if (companyIds.size > 0) {
        const { data: companies } = await supabase
          .from('users')
          .select('id, name, email, location, city, state_province, country, phone, industry, profile_image, verification_status')
          .in('id', Array.from(companyIds))

        const companyById = new Map((companies || []).map((c: any) => [Number(c.id), c]))
        for (const entry of grouped.values()) {
          const company = companyById.get(Number(entry.company_id))
          if (!company) continue
          if (!entry.company_email) entry.company_email = company.email || ''
          if (!entry.company_name || entry.company_name === 'Company') entry.company_name = company.name || entry.company_name
          entry.company_phone = company.phone || entry.company_phone || ''
          entry.company_industry = company.industry || entry.company_industry || ''
          entry.company_profile_image = company.profile_image || entry.company_profile_image || null
          entry.company_verified =
            String(company.verification_status || '').toLowerCase() === 'verified'
          entry.company_location =
            company.city && company.state_province
              ? `${company.city}, ${company.state_province}`
              : company.location || entry.company_location || ''
        }
      }

      return NextResponse.json({ success: true, data: Array.from(grouped.values()) })
    }

    if (mode === 'project-detail') {
      const projectId = String(searchParams.get('projectId') || '').trim()
      if (!projectId) {
        return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
      }

      // project-detail: loading project (logs suppressed)

      // First, try to fetch project with ngo join
      let project: any = null
      let projectError: any = null
      {
        const response = await supabase
          .from('service_request_projects')
          .select('id, ngo_id, title, description, location, exact_address, timeline, status, valid_until, expected_beneficiaries, volunteers_needed, csr_project_available_for_csr, assigned_company_user_id, assignment_status, updated_at, created_at, ngo:users!ngo_id(id, name, email, location, city, state_province, country, phone, ngo_volunteer_capacity, industry, pincode, profile_data, verification_status)')
          .eq('id', projectId)
          .maybeSingle()

        project = response.data
        projectError = response.error
      }

      // If there's an error (likely due to broken foreign key), try without the ngo join
      if (projectError || !project) {
        if (projectError) {
          // project-detail: ngo join error suppressed
        }
        
        const { data: projectWithoutNgo, error: projectErrorWithoutNgo } = await supabase
          .from('service_request_projects')
          .select('id, ngo_id, title, description, location, exact_address, timeline, status, valid_until, expected_beneficiaries, csr_project_available_for_csr, updated_at, created_at')
          .eq('id', projectId)
          .maybeSingle()

        if (projectErrorWithoutNgo) {
          // project-detail: project fetch error suppressed
          throw projectErrorWithoutNgo
        }
        
        if (!projectWithoutNgo) {
          // project-detail: project row missing; will synthesize from linked needs
        }

        project = projectWithoutNgo as any
        if (project) {
          // project-detail: project loaded (without ngo)
        }

        // Now fetch the ngo separately
        if (project?.ngo_id) {
          const { data: ngo, error: ngoError } = await supabase
            .from('users')
            .select('id, name, email, location, city, state_province, country, phone, ngo_volunteer_capacity, industry, pincode, profile_data')
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
      const firstNeedContext = needsList.length > 0
        ? safeJsonObject((needsList[0] as any)?.project_context)
        : {}
      const metaEnriched = project ? enrichProjectRecord(project) as any : null
      const enrichedProject = metaEnriched
        ? {
            ...metaEnriched,
            category: metaEnriched.category
              || String(firstNeedContext.project_category || (needsList[0] as any)?.category || '').trim()
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
        : project
      // project-detail: needs loaded

      if (!project && needsList.length > 0) {
        const firstNeed = needsList[0] as any
        const projectContext = safeJsonObject(firstNeed?.project_context)
        const fallbackNgoId = Number(firstNeed?.ngo_id || 0) || null
        const fallbackProject = {
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
            .select('id, name, email, location, city, state_province, country, phone, ngo_volunteer_capacity, industry, pincode, profile_data')
            .eq('id', fallbackNgoId)
            .maybeSingle()

          if (!fallbackNgoError && fallbackNgo) {
            ;(fallbackProject as any).ngo = fallbackNgo
            // project-detail: fallback NGO loaded
          }
        }

        project = fallbackProject as any
        // project-detail: synthesized project payload from first need
      }

      const needIds = needsList.map((item: any) => item.id)
      const anchorNeedId = needIds[0] || null

      const { data: applications, error: applicationsError } = needIds.length > 0
        ? await supabase
            .from('service_request_contributions')
            .select('id, service_request_id, contributor_id, status, meta, created_at, updated_at')
            .in('service_request_id', needIds)
            .eq('contribution_type', COMPANY_PROJECT_CONTRIBUTION_TYPE)
        : { data: [], error: null as any }

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
            .from('service_volunteers')
            .select('service_request_id, status, individual_done_at, ngo_confirmed_at, fulfilled_amount, fulfilled_quantity, volunteer:users!volunteer_id(id, user_type)')
            .in('service_request_id', needIds)
        : { data: [], error: null as any }

      if (fulfillmentRowsError) {
        // project-detail: fulfillment rows fetch error suppressed
        throw fulfillmentRowsError
      }

      const hasIndividualFulfillment = needsList.length > 0 && (fulfillmentRows || []).some((row: any) => {
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

      // Merge meta-stored company applications (standalone projects without child needs).
      const metaApps = Array.isArray((enrichedProject as any)?.pending_company_applications)
        ? (enrichedProject as any).pending_company_applications
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
        Number((enrichedProject as any)?.assigned_company_user_id || 0) > 0 &&
        String((enrichedProject as any)?.assignment_status || '').toLowerCase() === 'accepted'

      const responsePayload = {
        project: enrichedProject,
        anchor_need_id: anchorNeedId,
        needs: needsList,
        need_breakdown: {
          ongoing: needsList.filter((item: any) => !['completed', 'cancelled'].includes(String(item.status || '').toLowerCase())),
          fulfilled: needsList.filter((item: any) => ['completed'].includes(String(item.status || '').toLowerCase())),
          removed: needsList.filter((item: any) => ['cancelled'].includes(String(item.status || '').toLowerCase()))
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
        responsePayload.project = redactProjectSensitiveFields(enrichedProject as any)
        responsePayload.company_applications = []
        responsePayload.lead_ngo_invites = []
      } else {
        const ownerNgoId = Number((enrichedProject as any)?.ngo_id || 0)
        const assignedCompanyId = Number((enrichedProject as any)?.assigned_company_user_id || 0)
        const isOwnerNgo = userType === 'ngo' && ownerNgoId === Number(userId)
        const isAssignedCompany = userType === 'company' && assignedCompanyId === Number(userId)
        if (!isOwnerNgo && !isAssignedCompany) {
          // Other authenticated viewers only see their own pending application, if any.
          const myApps = Array.isArray((enrichedProject as any)?.pending_company_applications)
            ? (enrichedProject as any).pending_company_applications.filter(
                (item: any) => Number(item?.company_id) === Number(userId)
              )
            : []
          responsePayload.project = {
            ...redactProjectSensitiveFields(enrichedProject as any),
            pending_company_applications: myApps,
          }
          responsePayload.company_applications = (responsePayload.company_applications || []).filter(
            (app: any) => Number(app?.company_id) === Number(userId)
          )
          responsePayload.lead_ngo_invites = []
        }
      }

      // project-detail: returning payload for project

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
          selected_lead_ngo_id,
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
          .map((item: any) => Number(item.service_request_id))
          .filter((id: number) => Number.isFinite(id) && id > 0)
      )]

      const { data: contributionNeeds, error: contributionNeedsError } = contributionNeedIds.length > 0
        ? await supabase
            .from('service_requests')
            .select('id, project_id, ngo_id, title, status, request_type, category, project_context, updated_at')
            .in('id', contributionNeedIds)
        : { data: [], error: null as any }

      if (contributionNeedsError) throw contributionNeedsError

      const needById = new Map<number, any>((contributionNeeds || []).map((need: any) => [Number(need.id), need]))
      const handoffPairs = new Map<string, { projectId: string; companyId: number; contributions: any[] }>()

      for (const contribution of contributions || []) {
        const need = needById.get(Number(contribution.service_request_id))
        if (!need) continue

        const meta = safeJsonObject(contribution.meta)
        const projectId = String(safeProjectIdFromMeta(meta) || need.project_id || '').trim()
        if (!projectId) continue

        const companyId = Number(contribution.contributor_id || meta.company_id || 0)
        if (!Number.isFinite(companyId) || companyId <= 0) continue

        const ownerNgoId = Number(need.ngo_id || 0)
        if (userType === 'ngo' && ownerNgoId !== Number(userId)) {
          const projectContext = safeJsonObject(need.project_context)
          const assignment = safeJsonObject(projectContext.csr_assignment)
          const selectedLeadNgoId = Number(assignment.selected_lead_ngo_id || 0)
          if (selectedLeadNgoId !== Number(userId)) continue
        }

        const key = `${projectId}::${companyId}`
        const bucket = handoffPairs.get(key) || { projectId, companyId, contributions: [] as any[] }
        bucket.contributions.push(contribution)
        handoffPairs.set(key, bucket)
      }

      let assignedProjectQuery = supabase
        .from('service_request_projects')
        .select(projectSelect)
        .not('assigned_company_user_id', 'is', null)

      if (userType === 'ngo') {
        assignedProjectQuery = assignedProjectQuery.or(`ngo_id.eq.${userId},selected_lead_ngo_id.eq.${userId}`)
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

      const projectById = new Map<string, any>((projects || []).map((project: any) => [String(project.id), project]))

      for (const pair of handoffPairs.values()) {
        const project = projectById.get(pair.projectId)
        if (!project) continue
        if (Number(project.assigned_company_user_id || 0) > 0) continue
        const hasAcceptedContribution = pair.contributions.some((item: any) =>
          ['accepted', 'in_progress', 'completed'].includes(String(item.status || '').toLowerCase())
        )
        if (!hasAcceptedContribution) continue

        const { data: repaired, error: repairError } = await supabase
          .from('service_request_projects')
          .update({
            assigned_company_user_id: pair.companyId,
            assignment_status: 'accepted',
            selected_lead_ngo_id: project.selected_lead_ngo_id || project.ngo_id,
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
        if (project.selected_lead_ngo_id) userIds.add(Number(project.selected_lead_ngo_id))
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
        : { data: [], error: null as any }

      if (usersError) throw usersError

      const userById = new Map<number, any>((users || []).map((item: any) => [Number(item.id), item]))
      const needsByProject = new Map<string, any[]>()
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
          const selectedLeadNgoId = Number(project.selected_lead_ngo_id || 0)
          const projectNeeds = needsByProject.get(projectId) || []
          const ownerNgo = userById.get(ownerNgoId)
          const company = userById.get(companyId)
          const selectedLeadNgo = selectedLeadNgoId > 0 ? userById.get(selectedLeadNgoId) : null

          const categoryLabels = [...new Set(
            projectNeeds
              .map((need: any) => String(need.request_type || need.category || '').trim())
              .filter(Boolean)
          )]

          const firstNeedContext = projectNeeds.length > 0
            ? safeJsonObject(projectNeeds[0].project_context)
            : {}
          const csrAssignment = safeJsonObject(firstNeedContext.csr_assignment)

          const relatedContributions = pair.contributions.length > 0
            ? pair.contributions
            : (contributions || []).filter((contribution: any) => {
                const need = needById.get(Number(contribution.service_request_id))
                return need &&
                  String(need.project_id || '') === projectId &&
                  Number(contribution.contributor_id) === companyId
              })

          const reviewNoteFromContribution = relatedContributions
            .map((contribution: any) => {
              const meta = safeJsonObject(contribution.meta)
              return String(meta.review_note || safeNoteFromMeta(contribution.meta) || contribution.reference_text || '').trim()
            })
            .find(Boolean)

          const assignedAtFromContribution = relatedContributions
            .map((contribution: any) => {
              const meta = safeJsonObject(contribution.meta)
              return meta.ngo_reviewed_at || contribution.updated_at || contribution.created_at || null
            })
            .find(Boolean)

          const contributionStatus = relatedContributions
            .map((contribution: any) => String(contribution.status || '').toLowerCase())
            .sort((a: string, b: string) => {
              const rank = (value: string) => (
                value === 'completed' ? 3 : value === 'in_progress' ? 2 : value === 'accepted' ? 1 : 0
              )
              return rank(b) - rank(a)
            })[0]

          const relevantInvites = (allLeadInvites || []).filter((invite: any) => {
            const meta = safeJsonObject(invite.meta)
            return String(meta.project_id || '') === projectId && Number(meta.inviting_company_id || 0) === companyId
          })

          const leadNgoInvites = relevantInvites.map((invite: any) => {
            const inviteNgoId = Number(invite.contributor_id)
            const inviteNgo = userById.get(inviteNgoId)
            const meta = safeJsonObject(invite.meta)
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
            needs: projectNeeds.map((need: any) => ({
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
          pending_count: relatedAssignments.filter((item: any) => String(item.status || '').toLowerCase() === 'pending').length,
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
      return NextResponse.json({
        error: 'Complete email, phone, and document verification before applying for project takeover or sending lead NGO invites.',
      }, { status: 403 })
    }

    const projectId = String(body.projectId || '').trim()
    const note = String(body.note || '').trim()

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    const { data: projectRowRaw, error: projectRowError } = await supabase
      .from('service_request_projects')
      .select('*')
      .eq('id', projectId)
      .maybeSingle()

    if (projectRowError) throw projectRowError
    if (!projectRowRaw) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const projectRow = enrichProjectRecord(projectRowRaw) as any
    const ownerNgoId = Number(projectRow.ngo_id || 0)

    if (ownerNgoId === userId) {
      return NextResponse.json({ error: 'You cannot apply to your own NGO project' }, { status: 403 })
    }

    // Legacy child needs (pre-split) — still supported for invite-lead flows.
    const { data: needs, error: needsError } = await supabase
      .from('service_requests')
      .select('id, ngo_id, title, status, project_id')
      .eq('project_id', projectId)
      .not('status', 'in', '(completed,cancelled)')

    if (needsError) throw needsError

    const activeNeeds = Array.isArray(needs) ? needs : []
    const needIds = activeNeeds.map((item: any) => item.id)

    if (action === 'apply-project') {
      const ownerCoverage = await assertNgoCsr1CoversProject(ownerNgoId, projectRow)
      if (!ownerCoverage.ok) {
        return NextResponse.json({ error: ownerCoverage.error }, { status: 403 })
      }

      if (projectRow?.csr_project_available_for_csr === false) {
        return NextResponse.json({
          error: 'This project is locked for CSR and cannot accept new company applications.'
        }, { status: 409 })
      }

      if (Number(projectRow.assigned_company_user_id || 0) > 0 && String(projectRow.assignment_status || '').toLowerCase() === 'accepted') {
        return NextResponse.json({
          error: 'This project has already been accepted by a company. New applications are not allowed.'
        }, { status: 409 })
      }

      const pending = Array.isArray(projectRow.pending_company_applications)
        ? [...projectRow.pending_company_applications]
        : []

      if (pending.some((item: any) => Number(item.company_id) === Number(userId))) {
        return NextResponse.json({
          error: 'You have already applied to this project.'
        }, { status: 409 })
      }

      if (pending.some((item: any) => String(item.status || '').toLowerCase() === 'accepted')) {
        return NextResponse.json({
          error: 'This project has already been accepted by a company. New applications are not allowed.'
        }, { status: 409 })
      }

      pending.push({
        company_id: userId,
        company_name: userName || null,
        note: note || null,
        applied_at: new Date().toISOString(),
        status: 'pending',
        source: 'company_apply',
        applicant_user_id: userId,
      })

      const nextDescription = withProjectMeta(projectRowRaw.description, {
        ...parseProjectMeta(projectRowRaw.description),
        pending_company_applications: pending,
      })

      const { error: updateError } = await supabase
        .from('service_request_projects')
        .update({
          description: nextDescription,
          assignment_status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)

      if (updateError) throw updateError

      // Best-effort legacy contribution rows when child needs still exist.
      if (needIds.length > 0) {
        const { data: existingRows } = await supabase
          .from('service_request_contributions')
          .select('id, service_request_id, status')
          .in('service_request_id', needIds)
          .eq('contributor_id', userId)
          .eq('contribution_type', COMPANY_PROJECT_CONTRIBUTION_TYPE)

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
          await supabase.from('service_request_contributions').insert(rowsToInsert)
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          projectId,
          message: 'Project-level CSR application submitted to NGO.'
        }
      })
    }

    if (action === 'invite-lead-ngo') {
      if (Number(projectRow.assigned_company_user_id || 0) !== Number(userId) && needIds.length === 0) {
        // Fall through to legacy path checks below when needs exist.
      }
    }

    if (activeNeeds.length === 0 && action === 'invite-lead-ngo') {
      // Lead NGO invites for package projects: store as pending meta + contribution if possible.
      // Reuse existing invite flow requires an anchor need — return clear error for now if none.
      return NextResponse.json({
        error: 'Lead NGO invites for projects without legacy needs are managed from the project assignment after NGO acceptance. Ensure the project is accepted first.'
      }, { status: 409 })
    }

    if (activeNeeds.length === 0) {
      return NextResponse.json({ error: 'No active project found' }, { status: 404 })
    }

    if (action === 'invite-lead-ngo') {
      const ngoIds = (Array.isArray(body.ngoIds)
        ? [...new Set(body.ngoIds.map((value: any) => Number(value)).filter((value: number) => Number.isFinite(value) && value > 0))]
        : []) as number[]

      if (ngoIds.length === 0) {
        return NextResponse.json({ error: 'At least one NGO id is required' }, { status: 400 })
      }

      const { data: ngoRows, error: ngoRowsError } = await supabase
        .from('users')
        .select('id, user_type, verification_status, profile_data')
        .in('id', ngoIds)

      if (ngoRowsError) throw ngoRowsError

      const { data: inviteProjectRow } = await supabase
        .from('service_request_projects')
        .select('valid_until, timeline, selected_lead_ngo_id')
        .eq('id', projectId)
        .maybeSingle()

      if (Number(inviteProjectRow?.selected_lead_ngo_id || 0) > 0) {
        return NextResponse.json({
          error: 'A lead NGO is already assigned to this project. Additional invites are not allowed.'
        }, { status: 409 })
      }

      for (const row of ngoRows || []) {
        if (row.user_type !== 'ngo') {
          return NextResponse.json({ error: CSR_ELIGIBILITY_REQUIRED_MESSAGE }, { status: 400 })
        }
        const gate = assertCsr1CoversProject(row.verification_status, row.profile_data, inviteProjectRow)
        if (!gate.ok) {
          return NextResponse.json({ error: gate.error }, { status: 400 })
        }
      }

      if ((ngoRows || []).length !== ngoIds.length) {
        return NextResponse.json({ error: CSR_ELIGIBILITY_REQUIRED_MESSAGE }, { status: 400 })
      }

      const requestOwnerNgoId = Number(activeNeeds[0]?.ngo_id || ownerNgoId || 0)
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

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
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
        .maybeSingle()

      if (inviteError) throw inviteError
      if (!invite || Number(invite.contributor_id) !== Number(userId)) {
        return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
      }

      if (decision === 'accepted') {
        const inviteProjectId = String(invite?.meta?.project_id || '').trim()
        const { data: inviteProject } = inviteProjectId
          ? await supabase
              .from('service_request_projects')
              .select('valid_until, timeline')
              .eq('id', inviteProjectId)
              .maybeSingle()
          : { data: null }
        const inviteCoverage = await assertNgoCsr1CoversProject(userId, inviteProject)
        if (!inviteCoverage.ok) {
          return NextResponse.json({ error: inviteCoverage.error }, { status: 403 })
        }
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

        // Also update project record to set selected lead NGO
        try {
          const { error: updateProjectError } = await supabase
            .from('service_request_projects')
            .update({ selected_lead_ngo_id: userId, assignment_status: 'lead_selected', updated_at: new Date().toISOString() })
            .eq('id', projectId)

          if (updateProjectError) {
            console.error('Error updating project selected_lead_ngo:', updateProjectError)
          }
        } catch (e) {
          console.error('Error while updating project selected_lead_ngo:', e)
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

      const { data: selectProjectRow } = await supabase
        .from('service_request_projects')
        .select('valid_until, timeline')
        .eq('id', projectId)
        .maybeSingle()
      const selectCoverage = await assertNgoCsr1CoversProject(ngoId, selectProjectRow)
      if (!selectCoverage.ok) {
        return NextResponse.json({ error: selectCoverage.error }, { status: 403 })
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
      const { data: acceptProjectRow } = await supabase
        .from('service_request_projects')
        .select('id, ngo_id, description, valid_until, timeline, assigned_company_user_id, assignment_status, volunteers_needed')
        .eq('id', projectId)
        .eq('ngo_id', userId)
        .maybeSingle()

      if (!acceptProjectRow) {
        return NextResponse.json({ error: 'Project not found under your NGO' }, { status: 404 })
      }

      const acceptCoverage = await assertNgoCsr1CoversProject(userId, acceptProjectRow)
      if (!acceptCoverage.ok) {
        return NextResponse.json({ error: acceptCoverage.error }, { status: 403 })
      }

      if (
        Number(acceptProjectRow.assigned_company_user_id || 0) > 0 &&
        Number(acceptProjectRow.assigned_company_user_id) !== companyId &&
        String(acceptProjectRow.assignment_status || '').toLowerCase() === 'accepted'
      ) {
        return NextResponse.json({
          error: 'A company application is already accepted for this project. You cannot accept another application.'
        }, { status: 409 })
      }
    }

    const { data: projectForReviewRaw, error: projectForReviewError } = await supabase
      .from('service_request_projects')
      .select('*')
      .eq('id', projectId)
      .eq('ngo_id', userId)
      .maybeSingle()

    if (projectForReviewError) throw projectForReviewError
    if (!projectForReviewRaw) {
      return NextResponse.json({ error: 'Project not found under your NGO' }, { status: 404 })
    }

    const projectForReview = enrichProjectRecord(projectForReviewRaw) as any
    const pendingApps = Array.isArray(projectForReview.pending_company_applications)
      ? [...projectForReview.pending_company_applications]
      : []
    const metaAppIndex = pendingApps.findIndex((item: any) => Number(item.company_id) === companyId)
    const hasMetaApp = metaAppIndex >= 0

    const { data: ownNeeds, error: ownNeedsError } = await supabase
      .from('service_requests')
      .select('id, ngo_id, status, project_context')
      .eq('project_id', projectId)
      .eq('ngo_id', userId)
      .not('status', 'in', '(completed,cancelled)')

    if (ownNeedsError) throw ownNeedsError

    const needIds = (ownNeeds || []).map((item: any) => item.id)

    let targetRows: any[] = []
    if (needIds.length > 0) {
      const { data: rows, error: targetRowsError } = await supabase
        .from('service_request_contributions')
        .select('id, service_request_id, meta')
        .in('service_request_id', needIds)
        .eq('contributor_id', companyId)
        .eq('contribution_type', COMPANY_PROJECT_CONTRIBUTION_TYPE)
        .in('status', actionableProjectApplicationStatuses)

      if (targetRowsError) throw targetRowsError
      targetRows = rows || []
    }

    if (!hasMetaApp && targetRows.length === 0) {
      return NextResponse.json({ error: 'No matching company application found for this project' }, { status: 404 })
    }

    const metaApp = hasMetaApp ? pendingApps[metaAppIndex] : null
    const authenticMetaApp = isAuthenticCompanyProjectApplication(metaApp)
    if (!authenticMetaApp && targetRows.length === 0) {
      return NextResponse.json(
        { error: 'Company application is not valid. The company must apply through the CSR marketplace.' },
        { status: 403 }
      )
    }

    if (decision === 'accepted') {
      const alreadyAcceptedMeta = pendingApps.some(
        (item: any) =>
          Number(item.company_id) !== companyId &&
          String(item.status || '').toLowerCase() === 'accepted'
      )
      if (alreadyAcceptedMeta) {
        return NextResponse.json({
          error: 'A company application is already accepted for this project. You cannot accept another application.'
        }, { status: 409 })
      }

      if (needIds.length > 0) {
        const { data: alreadyAcceptedRows, error: alreadyAcceptedRowsError } = await supabase
          .from('service_request_contributions')
          .select('id, contributor_id, service_request_id')
          .in('service_request_id', needIds)
          .eq('contribution_type', COMPANY_PROJECT_CONTRIBUTION_TYPE)
          .eq('status', 'accepted')
          .neq('contributor_id', companyId)

        if (alreadyAcceptedRowsError) throw alreadyAcceptedRowsError
        if ((alreadyAcceptedRows || []).length > 0) {
          return NextResponse.json({
            error: 'A company application is already accepted for this project. You cannot accept another application.'
          }, { status: 409 })
        }
      }
    }

    // Update meta-stored application statuses.
    if (hasMetaApp || pendingApps.length > 0) {
      const nextPending = pendingApps.map((item: any) => {
        const id = Number(item.company_id)
        if (id === companyId) {
          return {
            ...item,
            status: decision,
            review_note: note || null,
            reviewed_at: new Date().toISOString(),
            reviewed_by: userId,
          }
        }
        if (decision === 'accepted' && String(item.status || '').toLowerCase() === 'pending') {
          return { ...item, status: EXPIRED_STATUS }
        }
        return item
      })

      const nextDescription = withProjectMeta(projectForReviewRaw.description, {
        ...parseProjectMeta(projectForReviewRaw.description),
        pending_company_applications: nextPending,
      })

      const projectUpdate: Record<string, any> = {
        description: nextDescription,
        updated_at: new Date().toISOString(),
      }

      if (decision === 'accepted') {
        projectUpdate.status = 'in_progress'
        projectUpdate.selected_lead_ngo_id = userId
        projectUpdate.assigned_company_user_id = companyId
        projectUpdate.assignment_status = 'accepted'
      } else if (decision === 'rejected') {
        projectUpdate.assignment_status = 'pending'
      }

      const { error: metaUpdateError } = await supabase
        .from('service_request_projects')
        .update(projectUpdate)
        .eq('id', projectId)

      if (metaUpdateError) throw metaUpdateError
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
      // Capacity check against project volunteers_needed (standalone) or legacy child needs.
      try {
        const volunteersNeeded = Number(projectForReview.volunteers_needed || 0)
        let totalVolunteersNeeded = volunteersNeeded

        if (needIds.length > 0) {
          const { data: volunteerRows, error: volunteerRowsError } = await supabase
            .from('service_requests')
            .select('volunteers_needed')
            .eq('project_id', projectId)
            .not('status', 'in', '(completed,cancelled)')

          if (volunteerRowsError) throw volunteerRowsError
          const fromNeeds = (volunteerRows || []).reduce((acc: number, r: any) => acc + (Number(r.volunteers_needed || 0)), 0)
          if (fromNeeds > 0) totalVolunteersNeeded = fromNeeds
        }

        const { data: ngoUser, error: ngoUserError } = await supabase
          .from('users')
          .select('id, ngo_volunteer_capacity')
          .eq('id', userId)
          .single()

        if (!ngoUserError && ngoUser && Number.isFinite(Number(ngoUser.ngo_volunteer_capacity))) {
          const capacity = Number(ngoUser.ngo_volunteer_capacity || 0)
          if (capacity > 0 && totalVolunteersNeeded > capacity) {
            return NextResponse.json({ error: `NGO volunteer capacity (${capacity}) is less than required volunteers (${totalVolunteersNeeded}). Please review before accepting.` }, { status: 409 })
          }
        }
      } catch (e) {
        console.warn('Capacity check failed:', e)
      }

      if (needIds.length > 0) {
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

      // Ensure project assignment columns when meta path did not already set them
      // (legacy contribution-only apps with no meta entry).
      if (!hasMetaApp) {
        try {
          const { data: updated, error: projUpdateError } = await supabase
            .from('service_request_projects')
            .update({
              status: 'in_progress',
              selected_lead_ngo_id: userId,
              assigned_company_user_id: companyId,
              assignment_status: 'accepted',
              updated_at: new Date().toISOString()
            })
            .eq('id', projectId)
            .is('assigned_company_user_id', null)
            .select()
            .single()

          if (projUpdateError) throw projUpdateError

          if (!updated) {
            const { data: currentProject, error: currErr } = await supabase
              .from('service_request_projects')
              .select('id, assigned_company_user_id')
              .eq('id', projectId)
              .maybeSingle()

            if (currErr) throw currErr

            if (currentProject && Number(currentProject.assigned_company_user_id || 0) > 0 && Number(currentProject.assigned_company_user_id) !== Number(companyId)) {
              return NextResponse.json({ error: 'Project already assigned to another company' }, { status: 409 })
            }

            const { error: idempotentSetError } = await supabase
              .from('service_request_projects')
              .update({
                status: 'in_progress',
                selected_lead_ngo_id: userId,
                assignment_status: 'accepted',
                updated_at: new Date().toISOString()
              })
              .eq('id', projectId)

            if (idempotentSetError) throw idempotentSetError
          }
        } catch (e) {
          console.warn('Failed to atomically update project-level assignment columns:', e)
          return NextResponse.json({ error: 'Failed to finalize project assignment' }, { status: 500 })
        }
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