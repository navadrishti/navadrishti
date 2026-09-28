import { NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { ngoIsCsrEligibleForProject } from '@/lib/auth'
import { enrichProjectRecord } from '@/lib/service-request-allocation'
import {
  isFullyVerifiedCompany,
  type AssignmentsGetContext,
} from '@/lib/service-request-assignments/shared'

export async function getCompanyProjects(ctx: AssignmentsGetContext) {
  const { userId, userType } = ctx

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
    const project = enrichProjectRecord(raw)
    if (!project) continue
    if (project.csr_project_available_for_csr === false) continue
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
    const myApp = pending.find((item) => Number(item.company_id) === Number(userId))
    const acceptedElsewhere = pending.some(
      (item) => String(item.status || '').toLowerCase() === 'accepted' && Number(item.company_id) !== Number(userId)
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
