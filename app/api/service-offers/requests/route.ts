import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';

interface JWTPayload {
  id: number;
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const ownerId = payload.id;

    const { data: offers, error: offersError } = await supabase
      .from('service_offers')
      .select('id, title')
      .eq('creator_id', ownerId)
      .order('created_at', { ascending: false });

    if (offersError) {
      return NextResponse.json({ error: 'Failed to fetch owner offers' }, { status: 500 });
    }

    const offerIds = (offers || []).map((offer: any) => offer.id);
    if (offerIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const offerTitleMap = new Map<number, string>((offers || []).map((offer: any) => [offer.id, offer.title]));

    const { data: requests, error: requestsError } = await supabase
      .from('service_clients')
      .select(`
        id,
        service_offer_id,
        message,
        status,
        response_meta,
        client:users!client_id(name, email, user_type)
      `)
      .in('service_offer_id', offerIds)
      .order('created_at', { ascending: false });

    if (requestsError) {
      return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 });
    }

    const normalizedRequests = (requests || []).map((request: any) => {
      const meta = request?.response_meta && typeof request.response_meta === 'object' ? request.response_meta : {};
      const isAssigned = typeof meta.isAssigned === 'boolean' ? meta.isAssigned : request.status === 'accepted';

      return {
        id: request.id,
        service_offer_id: request.service_offer_id,
        client: request.client,
        message: request.message,
        status: request.status,
        offer_title: offerTitleMap.get(request.service_offer_id) || `Offer #${request.service_offer_id}`,
        isAssigned
      };
    });

    return NextResponse.json({ success: true, data: normalizedRequests });
  } catch (error) {
    console.error('Error fetching service offer requests:', error);
    return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 });
  }
}
