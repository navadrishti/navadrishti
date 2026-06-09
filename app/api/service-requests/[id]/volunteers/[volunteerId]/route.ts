import { NextRequest, NextResponse } from 'next/server';
import { db, supabase } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';

// Interface for JWT payload
interface JWTPayload {
  id: number;
  user_type: string;
  email: string;
  name: string;
}

function parseAmount(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const text = String(value).trim();
  if (!text) return 0;
  const parsed = Number(text.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function getRequestTarget(request: any): { amount: number; quantity: number; type: string } {
  const requirements = (() => {
    try {
      return typeof request?.requirements === 'string' ? JSON.parse(request.requirements) : (request?.requirements || {});
    } catch {
      return {};
    }
  })();

  const requestType = String(requirements?.request_type || request?.request_type || request?.category || '').toLowerCase();
  return {
    type: requestType,
    amount: parseAmount(request?.target_amount ?? requirements?.funding_target_inr ?? requirements?.estimated_budget ?? requirements?.budget),
    quantity: parseAmount(request?.target_quantity ?? requirements?.target_quantity ?? request?.volunteers_needed ?? requirements?.beneficiary_count)
  };
}

// PUT - Update volunteer status
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; volunteerId: string }> }
) {
  try {
    const { id, volunteerId } = await params;
    
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const { id: userId, user_type: userType } = decoded;

    // NGOs can update applicants for their requests; individuals can mark their own accepted work as done
    if (userType !== 'ngo' && userType !== 'individual') {
      return NextResponse.json({ error: 'Only NGOs or individuals can update volunteer status' }, { status: 403 });
    }

    const requestId = parseInt(id);
    const volId = parseInt(volunteerId);
    const body = await request.json();
    const { status, decisionComment, allocationAmount, allocationQuantity, receiptUrl, completionNote, deliveryTrackingId } = body;

    // Validate status
    const validStatuses = ['pending', 'accepted', 'rejected', 'active', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // First, verify that this request belongs to the authenticated NGO
    const request_data = await db.serviceRequests.getById(requestId);

    if (!request_data) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    if (userType === 'ngo' && request_data.requester_id !== userId) {
      return NextResponse.json({ error: 'You can only update volunteers for your own requests' }, { status: 403 });
    }

    if (userType === 'individual' && volId !== userId) {
      return NextResponse.json({ error: 'You can only update your own application' }, { status: 403 });
    }

    // Find the volunteer application by its ID
    const { data: volunteerApplication, error } = await supabase
      .from('service_volunteers')
      .select('*')
      .eq('id', volId)
      .eq('service_request_id', requestId)
      .single();

    if (error || !volunteerApplication) {
      return NextResponse.json({ error: 'Volunteer not found for this request' }, { status: 404 });
    }

    const commentText = typeof decisionComment === 'string' ? decisionComment.trim() : '';
    if (commentText.length > 500) {
      return NextResponse.json({ error: 'Decision comment must be 500 characters or fewer' }, { status: 400 });
    }

    if (userType === 'ngo' && status === 'accepted') {
      // Try to call a DB-side stored procedure for atomic accept (if available).
      try {
        const isFinancial = String(request_data.request_type || request_data.category || '').toLowerCase().includes('financial')
        const allocationAmountParam = isFinancial ? (allocationAmount != null ? Number(allocationAmount) : parseAmount(volunteerApplication.fulfillment_amount || volunteerApplication.assigned_amount)) : 0
        const allocationQuantityParam = !isFinancial ? (allocationQuantity != null ? Number(allocationQuantity) : parseAmount(volunteerApplication.fulfillment_quantity || volunteerApplication.assigned_quantity)) : 0

        const { data: rpcResult, error: rpcError } = await supabase.rpc('accept_volunteer_assignment', {
          p_request_id: requestId,
          p_volunteer_app_id: volId,
          p_ngo_user_id: request_data.ngo_id || request_data.requester_id,
          p_allocation_amount: allocationAmountParam,
          p_allocation_quantity: allocationQuantityParam,
          p_actor_user_id: userId
        });

        if (rpcError) {
          // If function not installed or RPC failure, fall back to JS-based logic below
          console.warn('RPC accept_volunteer_assignment failed, falling back to JS path:', rpcError.message)
        } else if (rpcResult) {
          // RPC returns JSONB - map to expected updatedVolunteer
          // Refresh applicant and request details
          fetchApplicants()
          fetchRequestDetails()
          return NextResponse.json({ success: true, data: rpcResult });
        }
      } catch (e) {
        console.warn('RPC call attempted and failed:', e?.message || e)
      }

      // If RPC not available or failed, continue with the existing JS fallback logic (already implemented earlier)
    }

    const existingMeta =
      volunteerApplication.response_meta && typeof volunteerApplication.response_meta === 'object'
        ? volunteerApplication.response_meta
        : {};

    const nextMeta = {
      ...existingMeta,
      ngo_decision_comment: status === 'rejected' ? commentText : null,
      ngo_decision_at: new Date().toISOString()
    };

    const trackingId = typeof deliveryTrackingId === 'string' ? deliveryTrackingId.trim() : '';
    if (trackingId) {
      (nextMeta as any).delivery_tracking_id = trackingId;
      (nextMeta as any).delivery_provider = 'delhivery';
      (nextMeta as any).delivery_tracking_updated_at = new Date().toISOString();
      (nextMeta as any).delivery_tracking_last_status = (nextMeta as any).delivery_tracking_last_status || null;
      (nextMeta as any).delivery_tracking_last_location = (nextMeta as any).delivery_tracking_last_location || null;
      (nextMeta as any).delivery_tracking_last_event_at = (nextMeta as any).delivery_tracking_last_event_at || null;
      (nextMeta as any).delivery_tracking_events = Array.isArray((nextMeta as any).delivery_tracking_events)
        ? (nextMeta as any).delivery_tracking_events
        : [];
    }

    const updatePayload: Record<string, any> = {
      status,
      response_meta: nextMeta,
      updated_at: new Date().toISOString()
    }

    if (userType === 'ngo' && status === 'accepted') {
      updatePayload.assigned_amount = allocationAmount != null ? Number(allocationAmount) : parseAmount(volunteerApplication.fulfillment_amount || volunteerApplication.assigned_amount)
      updatePayload.assigned_quantity = allocationQuantity != null ? Number(allocationQuantity) : parseAmount(volunteerApplication.fulfillment_quantity || volunteerApplication.assigned_quantity)
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

    const { data: updatedVolunteer, error: updateError } = await supabase
      .from('service_volunteers')
      .update(updatePayload)
      .eq('id', volId)
      .eq('service_request_id', requestId)
      .select('*')
      .single();

    if (updateError || !updatedVolunteer) {
      return NextResponse.json({ error: 'Failed to update volunteer status' }, { status: 500 });
    }

    if (userType === 'ngo' && status === 'accepted') {
      // Only create assignment metadata and mark this volunteer as assigned. Do NOT auto-reject all other applicants.
      const acceptedMeta = updatedVolunteer.response_meta && typeof updatedVolunteer.response_meta === 'object'
        ? updatedVolunteer.response_meta
        : {};

      const assignmentMeta = {
        target_type: 'service_request',
        target_id: String(requestId),
        invitation_id: acceptedMeta.invitation_id || null,
        application_table: 'service_volunteers',
        application_id: String(volId),
        owner_user_id: request_data.requester_id,
        assignee_user_id: updatedVolunteer.volunteer_id,
        assigned_by_user_id: userId,
        assigned_at: new Date().toISOString(),
        billing_cycle: acceptedMeta.billing_cycle || 'daily',
        payment_mode: acceptedMeta.payment_mode || 'daily_due',
        valid_until: acceptedMeta.valid_until || updatedVolunteer.assigned_until || null,
        rate_per_unit: acceptedMeta.rate_per_unit || updatedVolunteer.assigned_amount || updatedVolunteer.assigned_quantity || null,
        rate_currency: acceptedMeta.currency || 'INR'
      };

      const { data: assignment } = await supabase
        .from('service_engagement_assignments')
        .insert({
          ...assignmentMeta,
          status: 'active',
          meta: assignmentMeta
        })
        .select('*')
        .maybeSingle();

      await supabase
        .from('service_volunteers')
        .update({
          response_meta: {
            ...acceptedMeta,
            isAssigned: true,
            assignment_id: assignment?.id || null,
            assignment_meta: assignmentMeta,
            accepted_at: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', volId)
        .eq('service_request_id', requestId);

      // If the request is now fully allocated, mark request as completed and reject remaining pending applicants
      const refreshedRequest = (await supabase.from('service_requests').select('*').eq('id', requestId).single()).data;
      const requestTarget = getRequestTarget(refreshedRequest);
      const currentAllocated = requestTarget.type.includes('financial') ? Number(refreshedRequest.current_amount || 0) : Number(refreshedRequest.current_quantity || 0);
      const targetValue = requestTarget.type.includes('financial') ? requestTarget.amount : requestTarget.quantity;

      if (currentAllocated >= targetValue && targetValue > 0) {
        // Mark request completed
        await supabase.from('service_requests').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', requestId);

        // Reject any remaining pending applicants
        const { data: pendingApplicants } = await supabase
          .from('service_volunteers')
          .select('id, response_meta')
          .eq('service_request_id', requestId)
          .eq('status', 'pending');

        for (const pa of pendingApplicants || []) {
          const otherMeta = pa?.response_meta && typeof pa.response_meta === 'object' ? pa.response_meta : {};
          await supabase.from('service_volunteers').update({ status: 'rejected', response_meta: { ...otherMeta, rejected_at: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq('id', pa.id).eq('service_request_id', requestId);
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