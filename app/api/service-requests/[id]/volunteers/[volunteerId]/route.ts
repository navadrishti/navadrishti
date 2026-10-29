import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  getApplicationApplicantUserId,
  shapeApplicationForApi,
  supabase,
  applyVolunteerAcceptanceAllocation,
  releaseVolunteerAllocation,
} from '@/lib/db';
import { getTokenClaims } from '@/lib/auth';
import {
  getNeedRemainingQuantity,
  getServiceRequestTarget,
  validateAcceptanceAllocation,
  getNgoNeedFulfillmentMode,
  getSkillServiceDailyRate,
  shouldCreateSkillServiceAssignment,
  shouldUseDelhiveryForNeed,
} from '@/lib/service-request-allocation';
import { NeedCapacityExceededError } from '@/lib/service-requests/errors';
import { parseAmountToInr, parseJsonObject } from '@/lib/utils';
import type { Json, TablesUpdate } from '@/lib/database.types';

const NGO_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['accepted', 'rejected'],
  accepted: ['completed', 'cancelled', 'rejected'],
  active: ['completed', 'cancelled', 'rejected'],
};

const APPLICATION_SELECT = `
        *,
        fulfillment:service_request_fulfillments!application_id(*)
      `

function asJsonObject(value: unknown): { [key: string]: Json | undefined } {
  try {
    const parsed = JSON.parse(JSON.stringify(parseJsonObject(value))) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as { [key: string]: Json | undefined }
    }
  } catch {
    // Malformed jsonb is treated as empty so a bad meta blob cannot block accept/reject.
  }
  return {}
}

function asOptionalUuid(value: unknown): string | null {
  const text = String(value ?? '').trim()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return null
  return text
}

function asOptionalIsoDate(value: unknown): string | null {
  if (!value) return null
  const ms = Date.parse(String(value))
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

async function rejectOtherPendingApplications(
  requestId: number,
  exceptApplicationId: number,
  reason: string
) {
  const { data: pendingApplicants, error: pendingError } = await supabase
    .from('service_request_applications')
    .select('id, response_meta')
    .eq('service_request_id', requestId)
    .eq('status', 'pending')
    .neq('id', exceptApplicationId)
  if (pendingError) throw pendingError

  const nowIso = new Date().toISOString()
  for (const applicant of pendingApplicants || []) {
    const otherMeta = asJsonObject(applicant.response_meta)
    const { error: autoRejectError } = await supabase
      .from('service_request_applications')
      .update({
        status: 'rejected',
        rejected_at: nowIso,
        response_meta: {
          ...otherMeta,
          rejected_at: nowIso,
          auto_rejected_reason: reason,
        },
        updated_at: nowIso,
      })
      .eq('id', applicant.id)
      .eq('service_request_id', requestId)
      .eq('status', 'pending')
    if (autoRejectError) throw autoRejectError
  }
}

// PUT - Update volunteer status
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; volunteerId: string }> }
) {
  try {
    const { id, volunteerId } = await params;
    
    const decoded = await getTokenClaims(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const { id: userId, user_type: userType } = decoded;

    // NGOs can update applicants for their requests; individuals can mark their own accepted work as done
    if (userType !== 'ngo' && userType !== 'individual') {
      return NextResponse.json({ error: 'Only NGOs or individuals can update volunteer status' }, { status: 403 });
    }

    const requestId = Number(id);
    const volunteerKey = Number(volunteerId);
    const body = await request.json();
    const { status, decisionComment, allocationAmount, allocationQuantity, receiptUrl, completionNote } = body;

    const validStatuses = ['pending', 'accepted', 'rejected', 'active', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    if (!Number.isFinite(requestId) || requestId <= 0 || !Number.isFinite(volunteerKey) || volunteerKey <= 0) {
      return NextResponse.json({ error: 'Volunteer not found for this request' }, { status: 404 });
    }

    const request_data = await db.serviceRequests.getById(requestId);

    if (!request_data) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    if (userType === 'ngo' && Number(request_data.ngo_id) !== userId) {
      return NextResponse.json({ error: 'You can only update volunteers for your own requests' }, { status: 403 });
    }

    const byApplicationId = await supabase
      .from('service_request_applications')
      .select(APPLICATION_SELECT)
      .eq('id', volunteerKey)
      .eq('service_request_id', requestId)
      .maybeSingle();

    let rawApplication = byApplicationId.data
    let error = byApplicationId.error

    if (!rawApplication) {
      const { data: fulfillmentRow } = await supabase
        .from('service_request_fulfillments')
        .select('application_id')
        .eq('id', volunteerKey)
        .eq('service_request_id', requestId)
        .maybeSingle();
      const mappedApplicationId = Number(fulfillmentRow?.application_id || 0);
      if (mappedApplicationId > 0) {
        const retry = await supabase
          .from('service_request_applications')
          .select(APPLICATION_SELECT)
          .eq('id', mappedApplicationId)
          .eq('service_request_id', requestId)
          .maybeSingle();
        rawApplication = retry.data;
        error = retry.error;
      }
    }

    const volunteerApplication = shapeApplicationForApi(rawApplication);
    const applicationId = Number(volunteerApplication?.id || 0);

    if (error || !volunteerApplication || !(applicationId > 0)) {
      return NextResponse.json({ error: 'Volunteer not found for this request' }, { status: 404 });
    }

    if (userType === 'individual' && getApplicationApplicantUserId(volunteerApplication) !== userId) {
      return NextResponse.json({ error: 'You can only update your own application' }, { status: 403 });
    }

    const rawStatus = String(
      (rawApplication as { status?: unknown } | null)?.status ?? volunteerApplication.status ?? 'pending'
    );
    const currentStatus = rawStatus.toLowerCase();

    if (userType === 'individual') {
      if (status !== 'completed' && status !== 'cancelled') {
        return NextResponse.json({ error: 'You can only mark your work as done or withdraw a pending application' }, { status: 403 });
      }
      const allowedFrom = status === 'completed' ? ['accepted', 'active'] : ['pending'];
      if (!allowedFrom.includes(currentStatus)) {
        return NextResponse.json({ error: `Cannot change a ${currentStatus} application to ${status}` }, { status: 409 });
      }
    } else {
      // Delivery sync can mark an application completed before the NGO confirms it.
      const isPendingNgoConfirmation =
        status === 'completed' && currentStatus === 'completed' && !volunteerApplication.ngo_confirmed_at;
      if (!NGO_STATUS_TRANSITIONS[currentStatus]?.includes(status) && !isPendingNgoConfirmation) {
        return NextResponse.json({ error: `Cannot change a ${currentStatus} application to ${status}` }, { status: 409 });
      }
    }

    const commentText = typeof decisionComment === 'string' ? decisionComment.trim() : '';
    if (commentText.length > 500) {
      return NextResponse.json({ error: 'Decision comment must be 500 characters or fewer' }, { status: 400 });
    }

    const requestTarget = getServiceRequestTarget(request_data);
    // A skill volunteer fills one slot; the dashboards would otherwise allocate everything that is left.
    const isSkillSlotNeed = getNgoNeedFulfillmentMode(request_data) === 'skill_service';
    const resolvedAllocationAmount = allocationAmount != null
      ? Number(allocationAmount)
      : parseAmountToInr(volunteerApplication.fulfillment_amount || volunteerApplication.assigned_amount);
    const resolvedAllocationQuantity = isSkillSlotNeed
      ? 1
      : allocationQuantity != null
        ? Number(allocationQuantity)
        : parseAmountToInr(volunteerApplication.fulfillment_quantity || volunteerApplication.assigned_quantity);

    if (userType === 'ngo' && status === 'accepted') {
      const allocationError = validateAcceptanceAllocation(request_data, {
        amount: requestTarget.isFinancial ? resolvedAllocationAmount : 0,
        quantity: requestTarget.isFinancial ? 0 : resolvedAllocationQuantity,
      });

      if (allocationError) {
        return NextResponse.json({ error: allocationError }, { status: 400 });
      }
    }

    const existingMeta = asJsonObject(volunteerApplication.response_meta);

    const nextMeta = {
      ...existingMeta,
      ngo_decision_comment: status === 'rejected' ? commentText : null,
      ngo_decision_at: new Date().toISOString()
    };

    const updatePayload: TablesUpdate<'service_request_applications'> & TablesUpdate<'service_request_fulfillments'> = {
      status,
      response_meta: nextMeta as Json,
      updated_at: new Date().toISOString()
    }

    if (status === 'rejected') {
      updatePayload.rejected_at = new Date().toISOString()
    }

    if (userType === 'ngo' && status === 'accepted') {
      updatePayload.assigned_amount = resolvedAllocationAmount
      updatePayload.assigned_quantity = resolvedAllocationQuantity
      updatePayload.fulfilled_amount = volunteerApplication.fulfilled_amount || 0
      updatePayload.fulfilled_quantity = volunteerApplication.fulfilled_quantity || 0
    }

    if (userType === 'individual' && status === 'completed') {
      updatePayload.individual_done_at = new Date().toISOString()
      updatePayload.individual_receipt_url = receiptUrl || volunteerApplication.individual_receipt_url || null
      updatePayload.completion_note = completionNote || volunteerApplication.completion_note || null
      updatePayload.status = 'active'
    }

    if (userType === 'ngo' && status === 'completed') {
      updatePayload.ngo_confirmed_at = new Date().toISOString()
      updatePayload.ngo_receipt_url = receiptUrl || volunteerApplication.ngo_receipt_url || null
      updatePayload.completion_note = completionNote || volunteerApplication.completion_note || null
    }

    const { data: claimed, error: claimError } = await supabase
      .from('service_request_applications')
      .update({ status: String(updatePayload.status), updated_at: new Date().toISOString() })
      .eq('id', applicationId)
      .eq('service_request_id', requestId)
      .eq('status', rawStatus)
      .select('id')
      .maybeSingle();

    if (claimError) throw claimError;
    if (!claimed) {
      return NextResponse.json({ error: 'This application was changed by someone else. Refresh and try again.' }, { status: 409 });
    }

    const updatedVolunteer = await db.serviceRequestApplications.update(applicationId, updatePayload);

    if (!updatedVolunteer) {
      return NextResponse.json({ error: 'Failed to update volunteer status' }, { status: 500 });
    }

    const releasesAllocation =
      userType === 'ngo' &&
      ['accepted', 'active'].includes(currentStatus) &&
      ['rejected', 'cancelled'].includes(status);

    if (releasesAllocation) {
      // Financial needs only count money actually received, so an accepted pledge never added anything.
      if (!requestTarget.isFinancial) {
        await releaseVolunteerAllocation(request_data, {
          amount: 0,
          quantity: parseAmountToInr(volunteerApplication.assigned_quantity),
        });
      }

      const { error: assignmentCloseError } = await supabase
        .from('service_engagement_assignments')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('application_table', 'service_request_applications')
        .eq('application_id', String(applicationId))
        .in('status', ['active', 'in_progress']);
      if (assignmentCloseError) throw assignmentCloseError;
    }

    if (userType === 'ngo' && status === 'accepted') {
      let refreshedRequest: Awaited<ReturnType<typeof applyVolunteerAcceptanceAllocation>> = request_data;
      try {
        // Pledged money is credited when it is paid, so accepting a financial pledge reserves nothing.
        if (!requestTarget.isFinancial) {
          refreshedRequest = await applyVolunteerAcceptanceAllocation(request_data, {
            amount: 0,
            quantity: Number(updatePayload.assigned_quantity || 0),
          });
        }
      } catch (allocationError) {
        await supabase
          .from('service_request_applications')
          .update({ status: currentStatus, updated_at: new Date().toISOString() })
          .eq('id', applicationId)
          .eq('service_request_id', requestId);
        if (allocationError instanceof NeedCapacityExceededError) {
          return NextResponse.json({ error: allocationError.message }, { status: 409 });
        }
        throw allocationError;
      }

      const acceptedMeta = parseJsonObject(updatedVolunteer.response_meta);
      const fulfillmentMode = getNgoNeedFulfillmentMode(request_data);

      if (shouldCreateSkillServiceAssignment(request_data)) {
        const isInfrastructure = fulfillmentMode === 'infrastructure';
        const dailyRate = getSkillServiceDailyRate(updatedVolunteer);

        const assigneeUserId = getApplicationApplicantUserId(updatedVolunteer);
        const assignmentMeta = {
          target_type: 'service_request',
          target_id: String(requestId),
          invitation_id: asOptionalUuid(acceptedMeta.invitation_id),
          application_table: 'service_request_applications',
          application_id: String(applicationId),
          owner_user_id: Number(request_data.ngo_id),
          assignee_user_id: assigneeUserId,
          assigned_by_user_id: userId,
          assigned_at: new Date().toISOString(),
          billing_cycle: isInfrastructure ? 'one_time' : 'daily',
          payment_mode: isInfrastructure ? 'waived' : 'daily_due',
          valid_until: asOptionalIsoDate(acceptedMeta.valid_until || updatedVolunteer.assigned_until),
          rate_per_unit: isInfrastructure ? null : dailyRate,
          rate_currency: String(acceptedMeta.currency || 'INR'),
          fulfillment_mode: fulfillmentMode,
        };

        const assignmentColumns = {
          target_type: assignmentMeta.target_type,
          target_id: assignmentMeta.target_id,
          invitation_id: assignmentMeta.invitation_id,
          application_table: assignmentMeta.application_table,
          application_id: assignmentMeta.application_id,
          owner_user_id: assignmentMeta.owner_user_id,
          assignee_user_id: assignmentMeta.assignee_user_id,
          assigned_by_user_id: assignmentMeta.assigned_by_user_id,
          assigned_at: assignmentMeta.assigned_at,
          billing_cycle: assignmentMeta.billing_cycle,
          payment_mode: assignmentMeta.payment_mode,
          valid_until: assignmentMeta.valid_until,
          rate_per_unit: assignmentMeta.rate_per_unit,
          rate_currency: assignmentMeta.rate_currency,
        };
        let assignmentId: string | null = null
        if (assigneeUserId > 0 && Number(request_data.ngo_id) > 0) {
          const { data: assignment, error: assignmentError } = await supabase
            .from('service_engagement_assignments')
            .insert({
              ...assignmentColumns,
              status: 'active',
              meta: assignmentMeta as Json,
            })
            .select('*')
            .maybeSingle();
          if (assignmentError && assignmentError.code !== '23505') throw assignmentError;
          assignmentId = assignment?.id || null
        }

        const { error: metaError } = await supabase
          .from('service_request_applications')
          .update({
            response_meta: {
              ...acceptedMeta,
              isAssigned: true,
              assignment_id: assignmentId,
              assignment_meta: assignmentMeta,
              accepted_at: new Date().toISOString(),
              infrastructure_exclusive: isInfrastructure,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', applicationId)
          .eq('service_request_id', requestId);
        if (metaError) throw metaError;
      } else {
        const { error: metaError } = await supabase
          .from('service_request_applications')
          .update({
            response_meta: {
              ...acceptedMeta,
              isAssigned: true,
              accepted_at: new Date().toISOString(),
              fulfillment_mode: fulfillmentMode,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', applicationId)
          .eq('service_request_id', requestId);
        if (metaError) throw metaError;
      }

      const remaining = getNeedRemainingQuantity(refreshedRequest);
      const fullyAllocated = requestTarget.isFinancial
        ? requestTarget.amount > 0 && remaining <= 0
        : requestTarget.quantity > 0 && remaining <= 0;
      if (fullyAllocated) {
        await rejectOtherPendingApplications(
          requestId,
          applicationId,
          'need_fully_allocated'
        );
      }
      if (remaining <= 0 && !shouldUseDelhiveryForNeed(request_data)) {
        const { error: completeNeedError } = await supabase
          .from('service_requests')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', requestId)
          .in('status', ['active', 'in_progress']);
        if (completeNeedError) throw completeNeedError;
      }
    }

    return NextResponse.json({
      success: true,
      data: updatedVolunteer
    });

  } catch (error) {
    console.error('Error updating volunteer status:', error);
    return NextResponse.json(
      { error: 'Failed to update volunteer status' },
      { status: 500 }
    );
  }
}