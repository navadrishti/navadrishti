import { NextRequest, NextResponse } from 'next/server'
import { supabase, getProjectLeadNgoId } from '@/lib/db'
import {
  getTokenClaims,
  assertCsr1CoversProject,
  CSR_ELIGIBILITY_REQUIRED_MESSAGE,
} from '@/lib/auth'
import { assertNgoCsr1CoversProject } from '@/lib/server-auth'
import {
  enrichProjectRecord,
  parseProjectMeta,
  withProjectMeta,
} from '@/lib/service-request-allocation'
import {
  COMPANY_PROJECT_CONTRIBUTION_TYPE,
  EXPIRED_STATUS,
  LEAD_NGO_INVITE_CONTRIBUTION_TYPE,
  isFullyVerifiedCompany,
} from '@/lib/service-request-assignments/shared'

const PENDING_LEAD_INVITE_STATUSES = ['pending', 'invited', 'pending_acceptance', 'awaiting_acceptance', 'offered']

export async function submitProjectApplication(request: NextRequest) {
  try {
    const decoded = getTokenClaims(request)
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    const { id: userId, user_type: userType, name: userName } = decoded

    const body = await request.json()
    const action = String(body.action || '').trim()

    if (!['apply-project', 'invite-lead-ngo', 'revoke-lead-ngo'].includes(action)) {
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

    const projectRow = enrichProjectRecord(projectRowRaw)
    if (!projectRow) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
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
    const needIds = activeNeeds.map((item) => item.id)

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

      if (pending.some((item) => Number(item.company_id) === Number(userId))) {
        return NextResponse.json({
          error: 'You have already applied to this project.'
        }, { status: 409 })
      }

      if (pending.some((item) => String(item.status || '').toLowerCase() === 'accepted')) {
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
          .filter((item) => ['pending', 'pledged', 'accepted', 'in_progress', 'completed'].includes(String(item.status || '').toLowerCase()))
          .map((item) => Number(item.service_request_id)))

        const rowsToInsert = activeNeeds
          .filter((need) => !existingNeedIds.has(Number(need.id)))
          .map((need) => ({
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

    if (action === 'revoke-lead-ngo') {
      const ngoId = Number(body.ngoId || 0)
      if (!Number.isFinite(ngoId) || ngoId <= 0) {
        return NextResponse.json({ error: 'Valid ngoId is required' }, { status: 400 })
      }

      const { data: removed, error: removeError } = await supabase
        .from('service_request_contributions')
        .delete()
        .eq('contribution_type', LEAD_NGO_INVITE_CONTRIBUTION_TYPE)
        .eq('meta->>project_id', projectId)
        .eq('meta->>inviting_company_id', String(userId))
        .eq('contributor_id', ngoId)
        .in('status', PENDING_LEAD_INVITE_STATUSES)
        .select('id')

      if (removeError) throw removeError
      if (!removed || removed.length === 0) {
        return NextResponse.json({ error: 'This invite has already been answered and can no longer be removed.' }, { status: 409 })
      }

      return NextResponse.json({ success: true, data: { projectId, message: 'Lead NGO invite removed.' } })
    }

    if (activeNeeds.length === 0 && action === 'invite-lead-ngo') {
      return NextResponse.json({
        error: 'Lead NGO invites for projects without legacy needs are managed from the project assignment after NGO acceptance. Ensure the project is accepted first.'
      }, { status: 409 })
    }

    if (activeNeeds.length === 0) {
      return NextResponse.json({ error: 'No active project found' }, { status: 404 })
    }

    if (action === 'invite-lead-ngo') {
      const rawNgoIds: unknown = body.ngoIds
      const ngoIds = Array.isArray(rawNgoIds)
        ? [...new Set(rawNgoIds.map((value: unknown) => Number(value)).filter((value) => Number.isFinite(value) && value > 0))]
        : []

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
        .select('valid_until, timeline, lead_ngo_user_id')
        .eq('id', projectId)
        .maybeSingle()

      if (getProjectLeadNgoId(inviteProjectRow) > 0) {
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

      const existingInvitedNgoIds = new Set((existingInvites || []).map((item) => Number(item.contributor_id)))
      const rowsToInsert = ngoIds
        .filter((ngoId: number) => !existingInvitedNgoIds.has(ngoId))
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
