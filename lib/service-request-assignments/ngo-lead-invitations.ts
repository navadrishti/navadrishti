import { NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { parseJsonObject } from '@/lib/utils'
import {
  LEAD_NGO_INVITE_CONTRIBUTION_TYPE,
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

  const projectIds = [...new Set((invites || []).map((item) => String(parseJsonObject(item.meta).project_id || '').trim()).filter(Boolean))]
  const companyIds = [...new Set((invites || []).map((item) => Number(parseJsonObject(item.meta).inviting_company_id || 0)).filter((id: number) => Number.isFinite(id) && id > 0))]

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

  const projectsById = new Map<string, any>((projects || []).map((item) => [String(item.id), item]))
  const companiesById = new Map<number, any>((companies || []).map((item) => [Number(item.id), item]))

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
      project_location: project?.exact_address || project?.location || '',
      project_timeline: project?.timeline || '',
      company_id: companyId,
      company_name: company?.name || 'Company',
      company_email: company?.email || ''
    }
  })

  return NextResponse.json({ success: true, data: payload })
}
