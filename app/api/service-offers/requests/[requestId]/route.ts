import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';

interface JWTPayload {
  id: number;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const ownerId = payload.id;

    const { requestId } = await params;
    const parsedRequestId = Number(requestId);

    if (!Number.isFinite(parsedRequestId)) {
      return NextResponse.json({ error: 'Invalid request id' }, { status: 400 });
    }

    const body = await request.json();
    const { status, fulfilled_amount, fulfilled_quantity, completion_note } = body;

    if (!['accepted', 'rejected', 'completed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
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
      .select('id, creator_id, valid_until, transaction_type, price_amount')
      .eq('id', targetRequest.service_offer_id)
      .single();

    if (offerError || !offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    if (offer.creator_id !== ownerId) {
      return NextResponse.json({ error: 'You can only manage requests for your own offers' }, { status: 403 });
    }

    const currentStatus = String(targetRequest.status || '').toLowerCase()
    if (currentStatus !== 'pending' && !(currentStatus === 'accepted' && status === 'completed')) {
      return NextResponse.json({ error: 'This decision is final and can no longer be changed.' }, { status: 409 })
    }

    const offerExpiry = offer.valid_until || null
    if (offerExpiry && new Date(String(offerExpiry)).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This offer has expired and can no longer be accepted.' }, { status: 409 })
    }

    const currentMeta = targetRequest.response_meta && typeof targetRequest.response_meta === 'object'
      ? targetRequest.response_meta
      : {};

    const nowIso = new Date().toISOString()

    const updatePayload: Record<string, any> = {
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
      updatePayload.accepted_at = currentStatus === 'accepted' ? (targetRequest.accepted_at || nowIso) : nowIso
      updatePayload.assigned_at = currentStatus === 'accepted' ? (targetRequest.assigned_at || nowIso) : nowIso
      updatePayload.response_meta = {
        ...currentMeta,
        isAssigned: true,
        fulfillment_note: completion_note || currentMeta.fulfillment_note || null,
        fulfilled_amount: fulfilled_amount ?? currentMeta.fulfilled_amount ?? null,
        fulfilled_quantity: fulfilled_quantity ?? currentMeta.fulfilled_quantity ?? null
      }
      updatePayload.fulfilled_amount = fulfilled_amount ?? null
      updatePayload.fulfilled_quantity = fulfilled_quantity ?? null
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
      const { data: otherRequests } = await supabase
        .from('service_clients')
        .select('id, response_meta')
        .eq('service_offer_id', targetRequest.service_offer_id)
        .neq('id', parsedRequestId)
        .in('status', ['pending', 'accepted']);

      for (const otherRequest of otherRequests || []) {
        const otherMeta = otherRequest?.response_meta && typeof otherRequest.response_meta === 'object'
          ? otherRequest.response_meta
          : {};

        await supabase
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
      }

      const currentMeta = targetRequest.response_meta && typeof targetRequest.response_meta === 'object'
        ? targetRequest.response_meta
        : {};

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
        billing_cycle: currentMeta.billing_cycle || targetRequest.billing_cycle || 'one_time',
        payment_mode: currentMeta.payment_mode || targetRequest.payment_mode || 'prepaid',
        // Assignment should NOT inherit the offer's `valid_until` (offer expiry).
        // Only set an assignment-level validity if explicitly provided in the application's meta
        // (e.g. `assignment_valid_until`). Otherwise leave it open-ended (null).
        valid_until: currentMeta.assignment_valid_until ?? null,
        rate_per_unit: currentMeta.rate_per_unit || targetRequest.proposed_amount || null,
        rate_currency: currentMeta.currency || 'INR'
      };

      const linkedServiceRequestId = Number(currentMeta.service_request_id || targetRequest.service_request_id || 0) || null;
      const offerAmount = Number(currentMeta.rate_per_unit || targetRequest.proposed_amount || offer.price_amount || 0) || 0;
      const paymentRequired = offer.transaction_type !== 'volunteer' && offer.transaction_type !== 'donate' && offerAmount > 0;

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
        .from('service_clients')
        .update({
          response_meta: {
            ...currentMeta,
            isAssigned: true,
            assignment_id: assignment?.id || null,
            assignment_meta: assignmentMeta,
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
    }

    if (status === 'completed') {
      const linkedServiceRequestId = Number(currentMeta.service_request_id || targetRequest.service_request_id || 0) || null;
      if (linkedServiceRequestId) {
        const { data: serviceRequest } = await supabase
          .from('service_requests')
          .select('id, current_amount, current_quantity, target_amount, target_quantity, remaining_amount, remaining_quantity, project_id')
          .eq('id', linkedServiceRequestId)
          .single();

        if (serviceRequest) {
          const nextCurrentAmount = Number(serviceRequest.current_amount || 0) + Number(fulfilled_amount || 0)
          const nextCurrentQuantity = Number(serviceRequest.current_quantity || 0) + Number(fulfilled_quantity || 0)
          const targetAmount = Number(serviceRequest.target_amount || 0)
          const targetQuantity = Number(serviceRequest.target_quantity || 0)
          const nextRemainingAmount = targetAmount > 0 ? Math.max(targetAmount - nextCurrentAmount, 0) : null
          const nextRemainingQuantity = targetQuantity > 0 ? Math.max(targetQuantity - nextCurrentQuantity, 0) : null
          const isFullyMet = (targetAmount > 0 && (nextRemainingAmount ?? 0) <= 0) || (targetQuantity > 0 && (nextRemainingQuantity ?? 0) <= 0)

          await supabase
            .from('service_requests')
            .update({
              current_amount: nextCurrentAmount,
              current_quantity: nextCurrentQuantity,
              remaining_amount: nextRemainingAmount,
              remaining_quantity: nextRemainingQuantity,
              is_fulfilled: isFullyMet,
              completed_at: isFullyMet ? nowIso : null,
              status: isFullyMet ? 'completed' : 'active',
              updated_at: nowIso
            })
            .eq('id', linkedServiceRequestId)

          if (isFullyMet && serviceRequest.project_id) {
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
