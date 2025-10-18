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
    
    // Get JWT token from Authorization header for NGO requests
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const { id: ngoUserId, user_type: userType } = decoded;

    // Only NGOs can view clients for their offers
    if (userType !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can view applicants' }, { status: 403 });
    }

    // First, verify that this offer belongs to the authenticated NGO
    const offer = await db.serviceOffers.getById(offerId);

    if (!offer) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 });
    }

    if (offer.ngo_id !== ngoUserId) {
      return NextResponse.json({ error: 'You can only view applicants for your own offers' }, { status: 403 });
    }

    // Fetch clients for this offer
    const { data: clients, error } = await supabase
      .from('service_clients')
      .select(`
        *,
        client:users!client_id(name, email)
      `)
      .eq('service_offer_id', offerId)
      .order('created_at', { ascending: false });

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
    const { client_id, client_type, message, start_date, end_date, proposed_amount } = body;

    // Validate required fields
    if (!client_id || !client_type || !message) {
      return NextResponse.json(
        { error: 'Client ID, client type, and message are required' },
        { status: 400 }
      );
    }

    const offerId = parseInt(id);

    // Check user verification status before allowing hiring application
    const user = await db.users.findById(client_id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verification requirements based on user type
    if (user.user_type === 'individual') {
      // For individuals, require at least basic verification (email + identity)
      if (user.verification_status !== 'verified') {
        return NextResponse.json({ 
          error: 'Account verification required', 
          message: 'Please complete your identity verification (Aadhaar & PAN) before hiring services.',
          requiresVerification: true
        }, { status: 403 });
      }
    } else if (user.user_type === 'company') {
      // For companies, require organization verification
      if (user.verification_status !== 'verified') {
        return NextResponse.json({ 
          error: 'Organization verification required', 
          message: 'Please complete your organization verification before hiring services.',
          requiresVerification: true
        }, { status: 403 });
      }
    } else if (user.user_type === 'ngo') {
      // NGOs cannot hire services from other NGOs
      return NextResponse.json({ 
        error: 'Invalid user type', 
        message: 'NGOs cannot hire services from other NGOs. Only individuals and companies can hire services.',
      }, { status: 403 });
    }

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
        client_type: client_type,
        message: message,
        start_date: start_date || null,
        end_date: end_date || null,
        amount_paid: proposed_amount || 0,
        status: 'pending'
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