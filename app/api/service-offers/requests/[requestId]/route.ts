import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';

interface JWTPayload {
  id: number;
  user_type: string;
  email: string;
  name: string;
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
    const { status } = body;

    if (!['accepted', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const { data: targetRequest, error: targetRequestError } = await supabase
      .from('service_clients')
      .select('id, service_offer_id, response_meta')
      .eq('id', parsedRequestId)
      .single();

    if (targetRequestError || !targetRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    const { data: offer, error: offerError } = await supabase
      .from('service_offers')
      .select('id, ngo_id')
      .eq('id', targetRequest.service_offer_id)
      .single();

    if (offerError || !offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    if (offer.ngo_id !== ownerId) {
      return NextResponse.json({ error: 'You can only manage requests for your own offers' }, { status: 403 });
    }

    const currentMeta = targetRequest.response_meta && typeof targetRequest.response_meta === 'object'
      ? targetRequest.response_meta
      : {};

    await supabase
      .from('service_clients')
      .update({
        status,
        response_meta: {
          ...currentMeta,
          isAssigned: status === 'accepted'
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', parsedRequestId)
      .eq('service_offer_id', targetRequest.service_offer_id);

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
    }

    return NextResponse.json({
      success: true,
      data: {
        id: parsedRequestId,
        service_offer_id: targetRequest.service_offer_id,
        status,
        isAssigned: status === 'accepted'
      }
    });
  } catch (error) {
    console.error('Error updating request status:', error);
    return NextResponse.json({ error: 'Failed to update request status' }, { status: 500 });
  }
}
