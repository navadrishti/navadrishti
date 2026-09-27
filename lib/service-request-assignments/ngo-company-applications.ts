import { NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import {
  enrichProjectRecord,
  formatProjectExactAddress,
  projectAddressToLocationSummary,
  parseProjectExactAddress,
} from '@/lib/service-request-allocation'
import {
  COMPANY_PROJECT_CONTRIBUTION_TYPE,
  reviewQueueProjectApplicationStatuses,
  safeNoteFromMeta,
  type AssignmentsGetContext,
} from '@/lib/service-request-assignments/shared'

type CompanyApplicationNeed = {
  id: number
  title: string
  status: string | null
  request_type: string | null
  estimated_budget: number | null
  target_amount: number | null
  target_quantity: number | null
  beneficiary_count: number | null
}

type CompanyApplicationEntry = {
  project_id: string
  project_title: string
  project_location: string
  project_address: string
  project_timeline: string
  project_valid_until: string | null
  project_expected_beneficiaries: number | null
  project_volunteers_needed: number | null
  project_category: string | null
  project_budget_inr: number | null
  company_id: number
  company_name: string
  company_email: string
  company_location: string
  company_phone?: string
  company_industry?: string
  company_profile_image?: string | null
  company_verified?: boolean
  status: string
  note: string
  applied_at: string | null
  created_at: string | null
  updated_at: string | null
  needs: CompanyApplicationNeed[]
}

export async function getNgoCompanyApplications(ctx: AssignmentsGetContext) {
  const { userId, userType } = ctx

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

  const grouped = new Map<string, CompanyApplicationEntry>()

  const companyIds = new Set<number>()
  for (const raw of ownProjects || []) {
    const project = enrichProjectRecord(raw)
    if (!project) continue
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
        needs: [],
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

  const ownNeedIds = (ownNeeds || []).map((item) => item.id)
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

    const needsById = new Map((ownNeeds || []).map((item) => [item.id, item] as const))

    for (const item of contributions || []) {
      const need = needsById.get(item.service_request_id)
      if (!need) continue

      const normalizedProject = Array.isArray(need.project) ? need.project[0] : need.project
      const normalizedContributor = Array.isArray(item.contributor) ? item.contributor[0] : item.contributor

      const projectId = String(need.project_id)
      const companyId = Number(item.contributor_id)
      companyIds.add(companyId)
      const key = `${projectId}::${companyId}`

      const existing: CompanyApplicationEntry = grouped.get(key) || {
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
        needs: []
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

    const companyById = new Map((companies || []).map((c) => [Number(c.id), c]))
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
