import { NextResponse } from 'next/server'
import { supabase, buildProjectLeadNgoPatch } from '@/lib/db'
import { assertNgoCsr1CoversProject } from '@/lib/server-auth'
import { parseJsonObject } from '@/lib/utils'
import {
  EXPIRED_STATUS,
  LEAD_NGO_INVITE_CONTRIBUTION_TYPE,
  isFullyVerifiedCompany,
  type AssignmentsPutContext,
} from '@/lib/service-request-assignments/shared'

export async function respondToLeadNgoInvitation(ctx: AssignmentsPutContext) {
  const { body, userId, userType } = ctx

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
    const inviteProjectId = String(parseJsonObject(invite.meta).project_id || '').trim()
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

  const projectId = String(parseJsonObject(invite.meta).project_id || '').trim()
  const invitingCompanyId = String(parseJsonObject(invite.meta).inviting_company_id || '').trim()

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
    ...(parseJsonObject(invite.meta)),
    ngo_response: decision,
    ngo_responded_at: new Date().toISOString(),
    selected_as_lead: decision === 'accepted',
    selected_at: decision === 'accepted' ? new Date().toISOString() : null,
    auto_selected_by: decision === 'accepted' ? 'ngo_acceptance' : null
  }

  const { data: updatedInvite, error: updateInviteError } = await supabase
    .from('service_request_contributions')
    .update({
      status: decision,
      meta: nextMeta,
      updated_at: new Date().toISOString()
    })
    .eq('id', inviteId)
    .in('status', actionableInviteStatuses)
    .select('id')
    .maybeSingle()

  if (updateInviteError) throw updateInviteError
  if (!updatedInvite) {
    return NextResponse.json({ error: 'This invitation is no longer actionable.' }, { status: 409 })
  }

  if (decision === 'accepted') {
    const { data: claimedProject, error: updateProjectError } = await supabase
      .from('service_request_projects')
      .update({ ...buildProjectLeadNgoPatch(userId), assignment_status: 'lead_selected', updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .or(`lead_ngo_user_id.is.null,lead_ngo_user_id.eq.${Number(userId)}`)
      .select('id')
      .maybeSingle()

    if (updateProjectError) throw updateProjectError
    if (!claimedProject) {
      await supabase
        .from('service_request_contributions')
        .update({
          status: EXPIRED_STATUS,
          meta: { ...nextMeta, selected_as_lead: false, selected_at: null, auto_selected_by: null },
          updated_at: new Date().toISOString()
        })
        .eq('id', inviteId)
      return NextResponse.json({ error: 'A lead NGO is already accepted for this project invite.' }, { status: 409 })
    }

    const { error: expireOtherInvitesError } = await supabase
      .from('service_request_contributions')
      .update({ status: EXPIRED_STATUS, updated_at: new Date().toISOString() })
      .eq('contribution_type', LEAD_NGO_INVITE_CONTRIBUTION_TYPE)
      .eq('meta->>project_id', projectId)
      .eq('meta->>inviting_company_id', invitingCompanyId)
      .neq('id', inviteId)
      .in('status', ['pending', 'invited', 'pending_acceptance', 'awaiting_acceptance', 'offered', 'assigned'])

    if (expireOtherInvitesError) throw expireOtherInvitesError
  }

  return NextResponse.json({ success: true, data: { inviteId, decision } })
}

export async function selectLeadNgo(ctx: AssignmentsPutContext) {
  const { body, userId, userType } = ctx

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
      ...(parseJsonObject(invite.meta)),
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

  const { error: projectLeadError } = await supabase
    .from('service_request_projects')
    .update({
      ...buildProjectLeadNgoPatch(ngoId),
      assignment_status: 'lead_selected',
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId)

  if (projectLeadError) throw projectLeadError

  return NextResponse.json({ success: true, data: { projectId, ngoId } })
}
