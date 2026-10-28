import { NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { parseJsonObject } from '@/lib/utils'
import { formatProjectLocation, parseProjectMeta } from '@/lib/service-request-allocation'
import {
  LEAD_NGO_INVITE_CONTRIBUTION_TYPE,
  PENDING_LEAD_INVITE_STATUSES,
  type AssignmentsGetContext,
} from '@/lib/service-request-assignments/shared'

export async function getNgoLeadInvitations(ctx: AssignmentsGetContext) {
  const { userId, userType } = ctx

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

  const { data: metaProjects, error: metaProjectsError } = await supabase
    .from('service_request_projects')
    .select('id, title, location, exact_address, timeline, description')
    .ilike('description', '%pending_lead_ngo_invites%')
    .order('updated_at', { ascending: false })
    .limit(200)

  if (metaProjectsError) throw metaProjectsError

  const projectIds = [...new Set((invites || []).map((item) => String(parseJsonObject(item.meta).project_id || '').trim()).filter(Boolean))]
  const companyIds = (invites || []).map((item) => Number(parseJsonObject(item.meta).inviting_company_id || 0))
  for (const project of metaProjects || []) {
    projectIds.push(String(project.id))
    for (const invite of parseProjectMeta(project.description).pending_lead_ngo_invites || []) {
      if (Number(invite.ngo_id) !== Number(userId)) continue
      companyIds.push(Number(invite.inviting_company_id || 0))
    }
  }
  const uniqueProjectIds = [...new Set(projectIds.filter(Boolean))]
  const uniqueCompanyIds = [...new Set(companyIds.filter((id) => Number.isFinite(id) && id > 0))]

  const { data: projects, error: projectsError } = uniqueProjectIds.length > 0
    ? await supabase
        .from('service_request_projects')
        .select('id, title, location, exact_address, timeline')
        .in('id', uniqueProjectIds)
    : { data: [], error: null }

  if (projectsError) throw projectsError

  const { data: companies, error: companiesError } = uniqueCompanyIds.length > 0
    ? await supabase
        .from('users')
        .select('id, name, email')
        .in('id', uniqueCompanyIds)
    : { data: [], error: null }

  if (companiesError) throw companiesError

  const projectsById = new Map((projects || []).map((item) => [String(item.id), item] as const))
  for (const project of metaProjects || []) {
    if (!projectsById.has(String(project.id))) {
      projectsById.set(String(project.id), project)
    }
  }
  const companiesById = new Map((companies || []).map((item) => [Number(item.id), item] as const))

  const payload = (invites || []).map((invite) => {
    const inviteMeta = parseJsonObject(invite.meta)
    const projectId = String(inviteMeta.project_id || '')
    const companyId = Number(inviteMeta.inviting_company_id || 0)
    const project = projectsById.get(projectId)
    const company = companiesById.get(companyId)

    return {
      id: invite.id,
      status: invite.status,
      note: String(invite.reference_text || inviteMeta.note || ''),
      invited_at: invite.created_at,
      project_id: projectId,
      project_title: project?.title || 'Project',
      project_location: formatProjectLocation(project?.exact_address, project?.location),
      project_timeline: project?.timeline || '',
      company_id: companyId,
      company_name: company?.name || 'Company',
      company_email: company?.email || ''
    }
  })

  const seenIds = new Set(payload.map((item) => item.id))
  for (const project of metaProjects || []) {
    for (const invite of parseProjectMeta(project.description).pending_lead_ngo_invites || []) {
      if (Number(invite.ngo_id) !== Number(userId)) continue
      if (!PENDING_LEAD_INVITE_STATUSES.includes(String(invite.status || 'pending').toLowerCase()) && String(invite.status || '').toLowerCase() !== 'accepted') {
        continue
      }
      if (seenIds.has(invite.id)) continue
      const company = companiesById.get(Number(invite.inviting_company_id || 0))
      payload.push({
        id: invite.id,
        status: invite.status || 'pending',
        note: String(invite.note || ''),
        invited_at: invite.invited_at,
        project_id: String(project.id),
        project_title: project.title || 'Project',
        project_location: formatProjectLocation(project.exact_address, project.location),
        project_timeline: project.timeline || '',
        company_id: Number(invite.inviting_company_id || 0),
        company_name: company?.name || 'Company',
        company_email: company?.email || '',
      })
    }
  }

  return NextResponse.json({ success: true, data: payload })
}
