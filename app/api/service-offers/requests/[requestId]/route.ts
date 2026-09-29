import { NextRequest, NextResponse } from 'next/server';
import { adjustServiceRequestProgress, supabase } from '@/lib/db';
import { getTokenClaims } from '@/lib/auth';
import { isCapabilityRentalTransaction, resolveCapabilityRentalRate } from '@/lib/service-offers';
import { parseJsonObject } from '@/lib/utils';
import type { TablesUpdate } from '@/lib/database.types';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const claims = getTokenClaims(request);
    if (!claims) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const ownerId = claims.id;

    const { requestId } = await params;
    const parsedRequestId = Number(requestId);

    if (!Number.isInteger(parsedRequestId) || parsedRequestId <= 0) {
      return NextResponse.json({ error: 'Invalid request id' }, { status: 400 });
    }

    const body = await request.json();
    const { status, completion_note } = body;

    if (!['accepted', 'rejected', 'completed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const parseFulfilled = (value: unknown): number | null | undefined => {
      if (value === undefined || value === null || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    };
    const fulfilled_amount = parseFulfilled(body.fulfilled_amount);
    const fulfilled_quantity = parseFulfilled(body.fulfilled_quantity);
    if (fulfilled_amount === undefined || fulfilled_quantity === undefined) {
      return NextResponse.json({ error: 'Fulfilled amount and quantity must be non-negative numbers' }, { status: 400 });
    }

    const { data: targetRequest, error: targetRequestError } = await supabase
      .from('service_clients')
      .select('id, service_offer_id, response_meta, status, client_id, service_request_id, proposed_amount, billing_cycle, payment_mode, expires_at, accepted_at, assigned_at')
      .eq('id', parsedRequestId)
      .single();

    if (targetRequestError || !targetRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    const { data: offer, error: offerError } = await supabase
      .from('service_offers')
      .select('id, creator_id, valid_until, transaction_type, price_amount, unit_rate, offer_details')
      .eq('id', targetRequest.service_offer_id)
      .single();

    if (offerError || !offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    if (offer.creator_id !== ownerId) {
      return NextResponse.json({ error: 'You can only manage requests for your own offers' }, { status: 403 });
    }

    const currentStatus = String(targetRequest.status || '').toLowerCase()
    const allowedTransition = status === 'completed'
      ? currentStatus === 'accepted'
      : currentStatus === 'pending'
    if (!allowedTransition) {
      const error = status === 'completed' && currentStatus === 'pending'
        ? 'Only accepted requests can be marked as completed.'
        : 'This decision is final and can no longer be changed.'
      return NextResponse.json({ error }, { status: 409 })
    }

    const offerExpiry = offer.valid_until || null
    if (status === 'accepted' && offerExpiry && new Date(String(offerExpiry)).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This offer has expired and can no longer be accepted.' }, { status: 409 })
    }

    const currentMeta = parseJsonObject(targetRequest.response_meta);

    const nowIso = new Date().toISOString()

    const updatePayload: TablesUpdate<'service_clients'> = {
      response_meta: {
        ...currentMeta,
        isAssigned: status === 'accepted' || status === 'completed'
      },
      updated_at: nowIso
    }

    if (status === 'accepted') {
      updatePayload.status = 'accepted'
      updatePayload.accepted_at = nowIso
      updatePayload.assigned_at = nowIso
      updatePayload.rejected_at = null
    } else if (status === 'rejected') {
      updatePayload.status = 'rejected'
      updatePayload.rejected_at = nowIso
    } else if (status === 'completed') {
      updatePayload.status = 'completed'
      updatePayload.completed_at = nowIso
      updatePayload.accepted_at = targetRequest.accepted_at || nowIso
      updatePayload.assigned_at = targetRequest.assigned_at || nowIso
      updatePayload.response_meta = {
        ...currentMeta,
        isAssigned: true,
        fulfillment_note: completion_note || currentMeta.fulfillment_note || null,
        fulfilled_amount: fulfilled_amount ?? currentMeta.fulfilled_amount ?? null,
        fulfilled_quantity: fulfilled_quantity ?? currentMeta.fulfilled_quantity ?? null
      }
      updatePayload.fulfilled_amount = fulfilled_amount
      updatePayload.fulfilled_quantity = fulfilled_quantity
    }

    const { error: updateError } = await supabase
      .from('service_clients')
      .update(updatePayload)
      .eq('id', parsedRequestId)
      .eq('service_offer_id', targetRequest.service_offer_id);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update request status' }, { status: 500 });
    }

    if (status === 'accepted') {
      const { data: otherRequests, error: otherRequestsError } = await supabase
        .from('service_clients')
        .select('id, response_meta')
        .eq('service_offer_id', targetRequest.service_offer_id)
        .neq('id', parsedRequestId)
        .in('status', ['pending', 'accepted']);

      if (otherRequestsError) {
        return NextResponse.json({ error: 'Failed to update other applications' }, { status: 500 });
      }

      for (const otherRequest of otherRequests || []) {
        const otherMeta = otherRequest?.response_meta && typeof otherRequest.response_meta === 'object'
          ? otherRequest.response_meta
          : {};

        const { error: rejectError } = await supabase
          .from('service_clients')
          .update({
            status: 'rejected',
            response_meta: {
              ...otherMeta,
              isAssigned: false
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', otherRequest.id)
          .eq('service_offer_id', targetRequest.service_offer_id);

        if (rejectError) {
          return NextResponse.json({ error: 'Failed to update other applications' }, { status: 500 });
        }
      }

      const offerDetails = parseJsonObject(offer.offer_details)
      const isRent = isCapabilityRentalTransaction(offer.transaction_type)
      const dailyRate = resolveCapabilityRentalRate({
        unit_rate: offer.unit_rate,
        price_amount: offer.price_amount,
        offer_details: offerDetails,
      }) || Number(currentMeta.rate_per_unit ?? 0) || 0
      const billingCycle = isRent
        ? String(offerDetails.billing_cycle || currentMeta.billing_cycle || targetRequest.billing_cycle || 'daily')
        : String(currentMeta.billing_cycle || targetRequest.billing_cycle || 'one_time')
      const paymentMode = isRent
        ? 'daily_due'
        : String(currentMeta.payment_mode || targetRequest.payment_mode || 'prepaid')

      const assignmentMeta = {
        target_type: 'service_offer',
        target_id: String(targetRequest.service_offer_id),
        invitation_id: currentMeta.invitation_id || null,
        application_table: 'service_clients',
        application_id: String(parsedRequestId),
        owner_user_id: offer.creator_id,
        assignee_user_id: targetRequest.client_id,
        assigned_by_user_id: ownerId,
        assigned_at: nowIso,
        billing_cycle: billingCycle,
        payment_mode: paymentMode,
        // Assignment should NOT inherit the offer's `valid_until` (offer expiry).
        // Only set an assignment-level validity if explicitly provided in the application's meta
        // (e.g. `assignment_valid_until`). Otherwise leave it open-ended (null).
        valid_until: currentMeta.assignment_valid_until ?? null,
        rate_per_unit: isRent ? dailyRate : (Number(currentMeta.rate_per_unit || offer.price_amount || 0) || null),
        rate_currency: currentMeta.currency || offerDetails.rate_currency || 'INR'
      };

      const linkedServiceRequestId = Number(currentMeta.service_request_id || targetRequest.service_request_id || 0) || null;
      const offerAmount = isRent
        ? dailyRate
        : Number(assignmentMeta.rate_per_unit || 0) || 0
      const paymentRequired = isRent
        ? dailyRate > 0
        : offer.transaction_type !== 'volunteer' && offer.transaction_type !== 'donate' && offerAmount > 0;

      const { data: assignment, error: assignmentError } = await supabase
        .from('service_engagement_assignments')
        .insert({
          ...assignmentMeta,
          status: 'active',
          meta: assignmentMeta
        })
        .select('*')
        .maybeSingle();

      if (assignmentError) {
        return NextResponse.json({ error: 'Failed to create service assignment' }, { status: 500 });
      }

      const { error: metaUpdateError } = await supabase
        .from('service_clients')
        .update({
          response_meta: {
            ...currentMeta,
            isAssigned: true,
            assignment_id: assignment?.id || null,
            assignment_meta: assignmentMeta,
            billing_cycle: billingCycle,
            payment_mode: paymentMode,
            rate_per_unit: assignmentMeta.rate_per_unit,
            linked_service_request_id: linkedServiceRequestId,
            payment_required: paymentRequired,
            payment_amount_inr: paymentRequired ? offerAmount : 0,
            accepted_at: nowIso
          },
          assigned_at: nowIso,
          updated_at: nowIso
        })
        .eq('id', parsedRequestId)
        .eq('service_offer_id', targetRequest.service_offer_id);

      if (metaUpdateError) {
        return NextResponse.json({ error: 'Failed to save assignment details' }, { status: 500 });
      }

      const { error: offerUpdateError } = await supabase
        .from('service_offers')
        .update({
          status: 'inactive',
          updated_at: nowIso
        })
        .eq('id', targetRequest.service_offer_id);

      if (offerUpdateError) {
        return NextResponse.json({ error: 'Failed to close the offer' }, { status: 500 });
      }
    }

    if (status === 'completed') {
      const linkedServiceRequestId = Number(currentMeta.service_request_id || targetRequest.service_request_id || 0) || null;
      if (linkedServiceRequestId) {
        const { data: serviceRequest } = await supabase
          .from('service_requests')
          .select('id, status, current_amount, current_quantity, target_amount, target_quantity, remaining_amount, remaining_quantity, project_id')
          .eq('id', linkedServiceRequestId)
          .single();

        if (serviceRequest) {
          const alreadyCreditedByPayment = currentMeta.payment_status === 'paid'
          const targetAmount = Number(serviceRequest.target_amount || 0)
          const targetQuantity = Number(serviceRequest.target_quantity || 0)
          const progress = await adjustServiceRequestProgress(
            serviceRequest,
            {
              amount: alreadyCreditedByPayment ? 0 : Number(fulfilled_amount || 0),
              quantity: Number(fulfilled_quantity || 0),
            },
            { targetAmount, targetQuantity }
          )
          const isFullyMet =
            (targetAmount > 0 && Number(progress.current_amount || 0) >= targetAmount) ||
            (targetQuantity > 0 && Number(progress.current_quantity || 0) >= targetQuantity)
          const requestStatus = String(progress.status || '').toLowerCase()
          const isOpenRequest = ['active', 'in_progress'].includes(requestStatus)

          if (isFullyMet && isOpenRequest) {
            await supabase
              .from('service_requests')
              .update({ is_fulfilled: true, completed_at: nowIso, status: 'completed', updated_at: nowIso })
              .eq('id', linkedServiceRequestId)
          }

          if (isFullyMet && isOpenRequest && serviceRequest.project_id) {
            await supabase
              .from('service_request_projects')
              .update({
                csr_project_available_for_csr: false,
                updated_at: nowIso
              })
              .eq('id', serviceRequest.project_id)
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: parsedRequestId,
        service_offer_id: targetRequest.service_offer_id,
        status,
        isAssigned: status === 'accepted' || status === 'completed'
      }
    });
  } catch (error) {
    console.error('Error updating request status:', error);
    return NextResponse.json({ error: 'Failed to update request status' }, { status: 500 });
  }
}
