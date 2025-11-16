import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';

// Interface for JWT payload
interface JWTPayload {
  id: number;
  user_type: string;
  email: string;
  name: string;
}

// GET - Fetch service offers with enhanced filtering
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const view = searchParams.get('view');
    const location = searchParams.get('location');
    const min_wage = searchParams.get('min_wage');
    const max_wage = searchParams.get('max_wage');
    const experience_level = searchParams.get('experience_level');
    const employment_type = searchParams.get('employment_type');

    // For my-offers view, authenticate user
    let authenticatedUserId = null;
    if (view === 'my-offers') {
      const authHeader = request.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Authentication required for my-offers' }, { status: 401 });
      }

      const token = authHeader.substring(7);
      try {
        const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
        authenticatedUserId = payload.id;
        
        if (payload.user_type !== 'ngo') {
          return NextResponse.json({ success: true, data: [] });
        }
      } catch {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }
    }

    // Build query with enhanced fields including admin approval fields
    let query = supabase
      .from('service_offers')
      .select(`
        *,
        ngo:users!ngo_id(
          id,
          name,
          email,
          user_type,
          verification_status,
          location,
          city,
          state_province,
          pincode,
          profile_image
        )
      `)
      .order('created_at', { ascending: false });

    // For public view, only show approved offers
    if (view !== 'my-offers') {
      query = query.or('admin_status.eq.approved,admin_status.is.null')
              .eq('status', 'active');
    } else {
      // For my-offers view, show all offers by the user
      query = query.eq('status', 'active');
    }

    // Apply filters
    if (category && category !== 'All Categories') {
      query = query.eq('category', category);
    }

    if (view === 'my-offers' && authenticatedUserId) {
      query = query.eq('ngo_id', authenticatedUserId);
    }

    if (employment_type) {
      query = query.eq('employment_type', employment_type);
    }

    const { data: offers, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to fetch service offers' }, { status: 500 });
    }

    // Apply additional filters that require processing
    let filteredOffers = offers || [];

    if (search) {
      const searchLower = search.toLowerCase();
      filteredOffers = filteredOffers.filter(offer =>
        offer.title?.toLowerCase().includes(searchLower) ||
        offer.description?.toLowerCase().includes(searchLower) ||
        offer.tags?.some((tag: string) => tag.toLowerCase().includes(searchLower))
      );
    }

    if (location) {
      const locationLower = location.toLowerCase();
      filteredOffers = filteredOffers.filter(offer =>
        offer.city?.toLowerCase().includes(locationLower) ||
        offer.state_province?.toLowerCase().includes(locationLower) ||
        offer.location?.toLowerCase().includes(locationLower)
      );
    }

    if (min_wage || max_wage) {
      filteredOffers = filteredOffers.filter(offer => {
        const wages = offer.wage_info;
        if (!wages || !wages.min_amount) return false;

        if (min_wage && wages.min_amount < parseInt(min_wage)) return false;
        if (max_wage && wages.max_amount && wages.max_amount > parseInt(max_wage)) return false;

        return true;
      });
    }

    if (experience_level) {
      filteredOffers = filteredOffers.filter(offer =>
        offer.experience_requirements?.level === experience_level
      );
    }

    // Get hire counts and application counts for each offer
    if (filteredOffers && filteredOffers.length > 0) {
      const offerIds = filteredOffers.map(offer => offer.id);

      const { data: clients, error: clientsError } = await supabase
        .from('service_clients')
        .select('service_offer_id, status')
        .in('service_offer_id', offerIds);

      if (!clientsError && clients) {
        const counts = clients.reduce((acc: Record<number, any>, client) => {
          if (!acc[client.service_offer_id]) {
            acc[client.service_offer_id] = { total: 0, accepted: 0, pending: 0 };
          }
          acc[client.service_offer_id].total++;
          if (client.status === 'accepted') acc[client.service_offer_id].accepted++;
          if (client.status === 'pending') acc[client.service_offer_id].pending++;
          return acc;
        }, {});

        // Add counts to offers
        filteredOffers.forEach((offer: any) => {
          const offerCounts = counts[offer.id] || { total: 0, accepted: 0, pending: 0 };
          offer.hires_count = offerCounts.accepted;
          offer.applications_count = offerCounts.total;
          offer.pending_applications = offerCounts.pending;
        });
      }
    }

    return NextResponse.json({ success: true, data: filteredOffers });

  } catch (error) {
    console.error('Error fetching service offers:', error);
    return NextResponse.json({ error: 'Failed to fetch service offers' }, { status: 500 });
  }
}

// POST - Create new enhanced service offer (NGOs only)
export async function POST(request: NextRequest) {
  try {
    console.log('POST /api/service-offers - Enhanced version starting');

    // Authenticate user
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    let decoded: JWTPayload;

    try {
      decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch (jwtError) {
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
    }

    const { id: userId, user_type: userType } = decoded;

    // Only NGOs can create service offers
    if (userType !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can create service offers' }, { status: 403 });
    }

    const body = await request.json();
    console.log('Enhanced service offer data received');

    // Validate required fields
    const requiredFields = ['title', 'description', 'category'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Prepare enhanced offer data
    const offerData = {
      ngo_id: userId,
      title: body.title,
      description: body.description,
      category: body.category,
      location: body.location,
      city: body.city,
      state_province: body.state_province,
      pincode: body.pincode,
      wage_info: body.wage_info, // { min_amount, max_amount, currency, payment_frequency, negotiable }
      experience_requirements: body.experience_requirements, // { level, years_required, specific_skills, certifications }
      skills_required: body.skills_required, // Array of required skills
      employment_type: body.employment_type, // 'full_time', 'part_time', 'contract', 'internship', 'volunteer'
      duration: body.duration, // { type: 'fixed'|'ongoing', duration_months }
      working_hours: body.working_hours, // { hours_per_week, flexible, schedule_details }
      benefits: body.benefits, // Array of benefits offered
      images: body.images, // Array of image URLs
      tags: body.tags, // Array of tags
      application_deadline: body.application_deadline,
      start_date: body.start_date,
      contact_preferences: body.contact_preferences, // { email, phone, whatsapp }
      status: 'active', // Set as active but pending admin approval
      admin_status: 'pending', // New offers require admin approval
      admin_reviewed_at: null,
      admin_reviewed_by: null,
      admin_comments: null,
      // Legacy compatibility fields
      price_type: body.wage_info?.negotiable ? 'negotiable' : 'fixed',
      price_amount: body.wage_info?.min_amount || 0,
      price_description: body.wage_info?.payment_frequency || 'monthly'
    };

    console.log('Inserting enhanced offer data:', { ...offerData, wage_info: '...', experience_requirements: '...' });

    const { data: offer, error } = await supabase
      .from('service_offers')
      .insert(offerData)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to create service offer' }, { status: 500 });
    }

    // Handle individual invitations if provided
    if (body.invited_individuals && body.invited_individuals.length > 0) {
      const invitations = body.invited_individuals.map((individualId: number) => ({
        service_offer_id: offer.id,
        invited_individual_id: individualId,
        invited_by: userId,
        status: 'pending',
        invited_at: new Date().toISOString()
      }));

      // Create invitations table if it doesn't exist and insert
      const { error: invitationError } = await supabase
        .from('service_offer_invitations')
        .insert(invitations);

      if (invitationError) {
        console.warn('Failed to create invitations (table may not exist):', invitationError);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: offer.id,
        message: 'Service offer created successfully and submitted for approval'
      }
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating enhanced service offer:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create service offer',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}