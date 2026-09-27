import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getTokenClaims } from '@/lib/auth';
import { parseJsonObject } from '@/lib/utils';

function isNeedRecord(need: unknown): need is Record<string, unknown> {
  return Boolean(need) && typeof need === 'object';
}

function parseSelectedNeeds(meta: Record<string, unknown>): Record<string, unknown>[] {
  const rawNeeds = meta.selected_needs;
  if (Array.isArray(rawNeeds)) {
    return rawNeeds.filter(isNeedRecord);
  }

  if (typeof rawNeeds === 'string') {
    try {
      const parsed: unknown = JSON.parse(rawNeeds);
      return Array.isArray(parsed) ? parsed.filter(isNeedRecord) : [];
    } catch {
      return [];
    }
  }

  return [];
}

function buildSelectedNeedSummary(meta: Record<string, unknown>) {
  const selectedNeeds = parseSelectedNeeds(meta);
  if (selectedNeeds.length > 0) {
    return selectedNeeds.slice(0, 3).map((need) => ({
      id: Number(need.id),
      title: String(need.title || 'Need'),
      estimated_budget: need.estimated_budget != null ? Number(need.estimated_budget) : null,
      target_amount: need.target_amount != null ? Number(need.target_amount) : null,
      target_quantity: need.target_quantity != null ? Number(need.target_quantity) : null,
      beneficiary_count: need.beneficiary_count != null ? Number(need.beneficiary_count) : null
    }));
  }

  const selectedNeedIds = Array.isArray(meta.selected_need_ids)
    ? meta.selected_need_ids.map((item) => Number(item)).filter((id: number) => Number.isFinite(id) && id > 0)
    : [];

  return selectedNeedIds.slice(0, 3).map((id: number) => ({
    id,
    title: `Need #${id}`,
    estimated_budget: null,
    target_amount: null,
    target_quantity: null,
    beneficiary_count: null
  }));
}

export async function GET(request: NextRequest) {
  try {
    const claims = getTokenClaims(request);
    if (!claims) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const ownerId = claims.id;

    const { data: offers, error: offersError } = await supabase
      .from('service_offers')
      .select('id, title, creator_id')
      .eq('creator_id', ownerId)
      .order('created_at', { ascending: false });

    if (offersError) {
      return NextResponse.json({ error: 'Failed to fetch owner offers' }, { status: 500 });
    }

    const offerIds = (offers || []).map((offer) => offer.id);
    if (offerIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const offerTitleMap = new Map<number, string>((offers || []).map((offer) => [offer.id, offer.title]));

    const { data: requests, error: requestsError } = await supabase
      .from('service_clients')
      .select(`
        id,
        service_offer_id,
        message,
        status,
        response_meta,
        client:users!client_id(name, email, user_type, verification_status)
      `)
      .in('service_offer_id', offerIds)
      .order('applied_at', { ascending: false });

    if (requestsError) {
      return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 });
    }

    const normalizedRequests = (requests || []).map((request) => {
      const meta = parseJsonObject(request.response_meta);
      const isAssigned = typeof meta.isAssigned === 'boolean' ? meta.isAssigned : request.status === 'accepted';
      const selectedNeedSummary = buildSelectedNeedSummary(meta);

      return {
        id: request.id,
        service_offer_id: request.service_offer_id,
        client: request.client,
        message: request.message,
        status: request.status,
        response_meta: meta,
        selected_need_summary: selectedNeedSummary,
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
