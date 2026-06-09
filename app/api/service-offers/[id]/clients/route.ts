import { NextRequest, NextResponse } from 'next/server';
import { db, supabase } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';
import { isOfferExpired } from '@/lib/service-offers';

// Interface for JWT payload
interface JWTPayload {
  id: number;
  user_type: string;
  email: string;
  name: string;
}

function parseNeedIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .map((item) => Number(item))
      .filter((id) => Number.isFinite(id) && id > 0)
  )];
}

function summarizeNeeds(needs: Array<Record<string, any>>) {
  return needs.map((need) => ({
    id: Number(need.id),
    title: String(need.title || 'Need'),
    status: String(need.status || '').toLowerCase(),
    request_type: need.request_type || null,
    estimated_budget: need.estimated_budget != null ? Number(need.estimated_budget) : null,
    target_amount: need.target_amount != null ? Number(need.target_amount) : null,
    target_quantity: need.target_quantity != null ? Number(need.target_quantity) : null,
    beneficiary_count: need.beneficiary_count != null ? Number(need.beneficiary_count) : null,
    project_id: need.project_id || null
  }));
}

// GET - Fetch clients for a service offer
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const offerId = parseInt(id);
    
    // Check if this is a public request to check user application status
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    
    if (userId) {
      // Public request to check if user has applied
      const { data: userApplication } = await supabase
        .from('service_clients')
        .select(`
          *,
          client:users!client_id(name, email)
        `)
        .eq('service_offer_id', offerId)
        .eq('client_id', parseInt(userId))
        .single();

      return NextResponse.json(userApplication || null);
    }
    
    // Get JWT token from Authorization header for owner requests
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const { id: ownerUserId } = decoded;

    // First, verify that this offer belongs to the authenticated owner
    const offer = await db.serviceOffers.getById(offerId);

    if (!offer) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 });
    }

    if ((offer.creator_id ?? offer.ngo_id) !== ownerUserId) {
      return NextResponse.json({ error: 'You can only view applicants for your own offers' }, { status: 403 });
    }

    // Fetch clients for this offer
    const { data: clients, error } = await supabase
      .from('service_clients')
      .select(`
        *,
        response_meta,
        client:users!client_id(name, email)
      `)
      .eq('service_offer_id', offerId)
      .order('applied_at', { ascending: false });

    return NextResponse.json({
      success: true,
      data: clients
    });

  } catch (error) {
    console.error('Error fetching clients:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clients' },
      { status: 500 }
    );
  }
}

// POST - Submit client application for a service offer
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { client_id, client_type, message, start_date, end_date, proposed_amount, service_request_id, selected_need_ids, service_request_ids } = body;

    // Validate required fields
    if (!client_id) {
      return NextResponse.json(
        { error: 'Client ID is required' },
        { status: 400 }
      );
    }

    const offerId = parseInt(id);

    const user = await db.users.findById(client_id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.user_type !== 'ngo') {
      return NextResponse.json({ 
        error: 'Invalid user type', 
        message: 'Only verified NGOs can respond to capability offers from the offer details page.',
      }, { status: 403 });
    }

    if (user.verification_status !== 'verified') {
      return NextResponse.json({ 
        error: 'Account verification required', 
        message: 'Please complete verification before responding to capability offers.',
        requiresVerification: true
      }, { status: 403 });
    }

    // Prevent self-response to own capability offer
    const offer = await db.serviceOffers.getById(offerId);
    if (offer && (offer.creator_id ?? offer.ngo_id) === client_id) {
      return NextResponse.json(
        { error: 'You cannot respond to your own capability offer' },
        { status: 400 }
      );
    }

    if (offer && isOfferExpired(offer)) {
      return NextResponse.json({ error: 'This capability offer has expired.' }, { status: 409 });
    }

    const needIds = parseNeedIds(selected_need_ids || service_request_ids || (service_request_id != null ? [service_request_id] : []));
    if (needIds.length === 0) {
      return NextResponse.json({ error: 'Please select one or more active needs.' }, { status: 400 });
    }

    const { data: linkedNeeds, error: linkedNeedsError } = await supabase
      .from('service_requests')
      .select('id, title, status, request_type, estimated_budget, target_amount, target_quantity, beneficiary_count, ngo_id, project_id')
      .in('id', needIds)
      .eq('ngo_id', client_id)
      .not('status', 'in', '(completed,cancelled)');

    if (linkedNeedsError) {
      return NextResponse.json({ error: 'Failed to validate selected needs' }, { status: 500 });
    }

    if (!Array.isArray(linkedNeeds) || linkedNeeds.length !== needIds.length) {
      return NextResponse.json({ error: 'One or more selected needs are invalid or inactive.' }, { status: 400 });
    }

    const selectedNeeds = summarizeNeeds(linkedNeeds);
    const totalSelectedAmount = selectedNeeds.reduce((sum, need) => {
      const amount = Number(need.estimated_budget ?? need.target_amount ?? 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);

    const offerAmount = Number(offer?.price_amount || 0);
    if (offerAmount > 0 && totalSelectedAmount > offerAmount) {
      return NextResponse.json({ error: 'Selected needs exceed the offer value. Please choose needs within the offer amount.' }, { status: 400 });
    }

    const applicationMessage = String(message || '').trim() || `Applied for ${selectedNeeds.map((need) => need.title).join(', ')}`;
    const primaryServiceRequestId = needIds[0] || null;

    // Check if the client has already applied
    const { data: existingApplication } = await supabase
      .from('service_clients')
      .select('id')
      .eq('service_offer_id', offerId)
      .eq('client_id', client_id)
      .single();

    if (existingApplication) {
      return NextResponse.json(
        { error: 'You have already applied for this service offer' },
        { status: 400 }
      );
    }

    // Insert the client application
    const { data: result, error: insertError } = await supabase
      .from('service_clients')
      .insert({
        service_offer_id: offerId,
        client_id: client_id,
        service_request_id: primaryServiceRequestId,
        message: applicationMessage,
        start_date: start_date || null,
        end_date: end_date || null,
        proposed_amount: proposed_amount || null,
        status: 'pending',
        response_meta: {
          client_type: 'ngo',
          application_mode: 'ngo_need_selection',
          service_request_id: primaryServiceRequestId,
          selected_need_ids: needIds,
          selected_needs: selectedNeeds,
          selected_need_amount: totalSelectedAmount,
          ...(client_type ? { requested_client_type: client_type } : {})
        }
      })
      .select(`
        *,
        client:users!client_id(name, email)
      `)
      .single();

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json(result, { status: 201 });

  } catch (error) {
    console.error('Error creating client application:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}