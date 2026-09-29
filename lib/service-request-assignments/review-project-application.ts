import { NextResponse } from 'next/server'
import { supabase, buildProjectLeadNgoPatch } from '@/lib/db'
import { assertNgoCsr1CoversProject } from '@/lib/server-auth'
import { parseJsonObject } from '@/lib/utils'
import {
  enrichProjectRecord,
  parseProjectMeta,
  withProjectMeta,
  isAuthenticCompanyProjectApplication,
} from '@/lib/service-request-allocation'
import {
  COMPANY_PROJECT_CONTRIBUTION_TYPE,
  EXPIRED_STATUS,
  actionableProjectApplicationStatuses,
  reviewQueueProjectApplicationStatuses,
  type AssignmentsPutContext,
} from '@/lib/service-request-assignments/shared'
import type { Tables, TablesUpdate } from '@/lib/database.types'

export async function reviewProjectApplication(ctx: AssignmentsPutContext) {
  const { body, userId, userType } = ctx

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

  const projectForReview = enrichProjectRecord(projectForReviewRaw)
  const pendingApps = Array.isArray(projectForReview?.pending_company_applications)
    ? [...projectForReview.pending_company_applications]
    : []
  const metaAppIndex = pendingApps.findIndex((item) => Number(item.company_id) === companyId)
  const hasMetaApp = metaAppIndex >= 0

  const { data: ownNeeds, error: ownNeedsError } = await supabase
    .from('service_requests')
    .select('id, ngo_id, status, project_context')
    .eq('project_id', projectId)
    .eq('ngo_id', userId)
    .not('status', 'in', '(completed,cancelled)')

  if (ownNeedsError) throw ownNeedsError

  const needIds = (ownNeeds || []).map((item) => item.id)

  let targetRows: Pick<Tables<'service_request_contributions'>, 'id' | 'service_request_id' | 'meta'>[] = []
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
      (item) =>
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

    // Capacity check against project volunteers_needed (standalone) or legacy child needs.
    try {
      const volunteersNeeded = Number(projectForReview?.volunteers_needed || 0)
      let totalVolunteersNeeded = volunteersNeeded

      if (needIds.length > 0) {
        const { data: volunteerRows, error: volunteerRowsError } = await supabase
          .from('service_requests')
          .select('volunteers_needed')
          .eq('project_id', projectId)
          .not('status', 'in', '(completed,cancelled)')

        if (volunteerRowsError) throw volunteerRowsError
        const fromNeeds = (volunteerRows || []).reduce((acc: number, r) => acc + (Number(r.volunteers_needed || 0)), 0)
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
  }

  if (hasMetaApp || pendingApps.length > 0) {
    const nextPending = pendingApps.map((item) => {
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

    const projectUpdate: TablesUpdate<'service_request_projects'> = {
      description: nextDescription,
      updated_at: new Date().toISOString(),
    }

    if (decision === 'accepted') {
      projectUpdate.status = 'in_progress'
      Object.assign(projectUpdate, buildProjectLeadNgoPatch(userId))
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
      ...(parseJsonObject(row.meta)),
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
        const existingContext = parseJsonObject(need.project_context)
        const nextContext = {
          ...existingContext,
          csr_assignment: {
            ...(parseJsonObject(existingContext.csr_assignment)),
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
            ...buildProjectLeadNgoPatch(userId),
            assigned_company_user_id: companyId,
            assignment_status: 'accepted',
            updated_at: new Date().toISOString()
          })
          .eq('id', projectId)
          .is('assigned_company_user_id', null)
          .select()
          .maybeSingle()

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
              ...buildProjectLeadNgoPatch(userId),
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
}
