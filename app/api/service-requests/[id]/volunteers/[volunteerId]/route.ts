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
} from '@/lib/service-request-allocation';
import { NeedCapacityExceededError } from '@/lib/service-requests/errors';
import { parseAmountToInr, parseJsonObject } from '@/lib/utils';
import type { Json, TablesUpdate } from '@/lib/database.types';

const NGO_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['accepted', 'rejected'],
  accepted: ['completed', 'cancelled', 'rejected'],
  active: ['completed', 'cancelled', 'rejected'],
};

// PUT - Update volunteer status
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; volunteerId: string }> }
) {
  try {
    const { id, volunteerId } = await params;
    
    const decoded = getTokenClaims(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const { id: userId, user_type: userType } = decoded;

    // NGOs can update applicants for their requests; individuals can mark their own accepted work as done
    if (userType !== 'ngo' && userType !== 'individual') {
      return NextResponse.json({ error: 'Only NGOs or individuals can update volunteer status' }, { status: 403 });
    }

    const requestId = parseInt(id);
    const volId = parseInt(volunteerId);
    const body = await request.json();
    const { status, decisionComment, allocationAmount, allocationQuantity, receiptUrl, completionNote } = body;

    const validStatuses = ['pending', 'accepted', 'rejected', 'active', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const request_data = await db.serviceRequests.getById(requestId);

    if (!request_data) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    if (userType === 'ngo' && Number(request_data.ngo_id) !== userId) {
      return NextResponse.json({ error: 'You can only update volunteers for your own requests' }, { status: 403 });
    }

    const { data: rawApplication, error } = await supabase
      .from('service_request_applications')
      .select(`
        *,
        fulfillment:service_request_fulfillments!application_id(*)
      `)
      .eq('id', volId)
      .eq('service_request_id', requestId)
      .single();

    const volunteerApplication = shapeApplicationForApi(rawApplication);

    if (error || !volunteerApplication) {
      return NextResponse.json({ error: 'Volunteer not found for this request' }, { status: 404 });
    }

    if (userType === 'individual' && getApplicationApplicantUserId(volunteerApplication) !== userId) {
      return NextResponse.json({ error: 'You can only update your own application' }, { status: 403 });
    }

    const currentStatus = String(volunteerApplication.status || 'pending').toLowerCase();

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

    const existingMeta =
      parseJsonObject(volunteerApplication.response_meta);

    const nextMeta: Record<string, Json | undefined> = {
      ...existingMeta,
      ngo_decision_comment: status === 'rejected' ? commentText : null,
      ngo_decision_at: new Date().toISOString()
    };

    const updatePayload: TablesUpdate<'service_request_applications'> & TablesUpdate<'service_request_fulfillments'> = {
      status,
      response_meta: nextMeta,
      updated_at: new Date().toISOString()
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
      .eq('id', volId)
      .eq('service_request_id', requestId)
      .eq('status', currentStatus)
      .select('id')
      .maybeSingle();

    if (claimError) throw claimError;
    if (!claimed) {
      return NextResponse.json({ error: 'This application was changed by someone else. Refresh and try again.' }, { status: 409 });
    }

    const updatedVolunteer = await db.serviceRequestApplications.update(volId, updatePayload);

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
        .eq('application_id', String(volId))
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
          .eq('id', volId)
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

        const assignmentMeta = {
          target_type: 'service_request',
          target_id: String(requestId),
          invitation_id: acceptedMeta.invitation_id || null,
          application_table: 'service_request_applications',
          application_id: String(volId),
          owner_user_id: request_data.ngo_id,
          assignee_user_id: getApplicationApplicantUserId(updatedVolunteer),
          assigned_by_user_id: userId,
          assigned_at: new Date().toISOString(),
          billing_cycle: isInfrastructure ? 'one_time' : 'daily',
          payment_mode: isInfrastructure ? 'waived' : 'daily_due',
          valid_until: acceptedMeta.valid_until || updatedVolunteer.assigned_until || null,
          rate_per_unit: isInfrastructure ? null : dailyRate,
          rate_currency: acceptedMeta.currency || 'INR',
          fulfillment_mode: fulfillmentMode,
        };

        const { fulfillment_mode: _fulfillmentMode, ...assignmentColumns } = assignmentMeta;
        const { data: assignment, error: assignmentError } = await supabase
          .from('service_engagement_assignments')
          .insert({
            ...assignmentColumns,
            status: 'active',
            meta: assignmentMeta,
          })
          .select('*')
          .maybeSingle();
        if (assignmentError) throw assignmentError;

        const { error: metaError } = await supabase
          .from('service_request_applications')
          .update({
            response_meta: {
              ...acceptedMeta,
              isAssigned: true,
              assignment_id: assignment?.id || null,
              assignment_meta: assignmentMeta,
              accepted_at: new Date().toISOString(),
              infrastructure_exclusive: isInfrastructure,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', volId)
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
          .eq('id', volId)
          .eq('service_request_id', requestId);
        if (metaError) throw metaError;
      }

      const remaining = getNeedRemainingQuantity(refreshedRequest);
      if (!requestTarget.isFinancial && remaining <= 0) {
        const { data: pendingApplicants, error: pendingError } = await supabase
          .from('service_request_applications')
          .select('id, response_meta')
          .eq('service_request_id', requestId)
          .eq('status', 'pending');
        if (pendingError) throw pendingError;

        for (const pa of pendingApplicants || []) {
          const otherMeta = pa?.response_meta && typeof pa.response_meta === 'object' ? pa.response_meta : {};
          const { error: autoRejectError } = await supabase
            .from('service_request_applications')
            .update({
              status: 'rejected',
              response_meta: { ...otherMeta, rejected_at: new Date().toISOString(), auto_rejected_reason: 'need_fully_allocated' },
              updated_at: new Date().toISOString(),
            })
            .eq('id', pa.id)
            .eq('service_request_id', requestId)
            .eq('status', 'pending');
          if (autoRejectError) throw autoRejectError;
        }
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