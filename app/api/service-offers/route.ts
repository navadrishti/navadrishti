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
  verification_status?: string;
}

const OFFER_TYPES = [
  'financial',
  'material',
  'service',
  'infrastructure'
];

const TRANSACTION_TYPES = ['sell', 'rent', 'volunteer'];

const OFFER_TYPE_TO_CATEGORY: Record<string, string> = {
  financial: 'Funding Capacity',
  material: 'Material Supply',
  service: 'Skill / Expertise',
  infrastructure: 'Execution Capability'
};

const CATEGORY_TO_OFFER_TYPE: Record<string, string> = {
  'Funding Capacity': 'financial',
  'Material Supply': 'material',
  'Skill / Expertise': 'service',
  'Execution Capability': 'infrastructure'
};

const safeParseJson = (value: unknown): Record<string, any> => {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, any>;

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  return {};
};

const toNonNegativeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
};

const buildTransactionDetails = (body: Record<string, any>) => {
  const transactionType = body.transaction_type;

  if (!TRANSACTION_TYPES.includes(transactionType)) {
    return {};
  }

  if (transactionType === 'volunteer') {
    return {
      transaction_type: 'volunteer',
      sell_amount: 0,
      rent_per_day: 0
    };
  }

  if (transactionType === 'rent') {
    return {
      transaction_type: 'rent',
      sell_amount: null,
      rent_per_day: toNonNegativeNumber(body.rent_per_day)
    };
  }

  return {
    transaction_type: 'sell',
    sell_amount: toNonNegativeNumber(body.sell_amount),
    rent_per_day: 0
  };
};

const inferTransactionType = (offer: any, details: Record<string, any>) => {
  if (TRANSACTION_TYPES.includes(details.transaction_type)) {
    return details.transaction_type;
  }

  const priceType = String(offer.price_type || '').toLowerCase();
  const priceDescription = String(offer.price_description || '').toLowerCase();

  if (priceType === 'free' || priceType === 'donation') {
    return 'volunteer';
  }

  if (priceDescription.includes('per day') || priceDescription.includes('/day')) {
    return 'rent';
  }

  return 'sell';
};

const normalizeOffer = (offer: any) => {
  const details = safeParseJson(offer.requirements);
  const normalizedOfferType = offer.offer_type || details.offer_type || CATEGORY_TO_OFFER_TYPE[offer.category] || 'service';
  const transactionType = inferTransactionType(offer, details);
  const fallbackPriceAmount = toNonNegativeNumber(offer.price_amount);

  return {
    ...offer,
    offer_type: normalizedOfferType,
    transaction_type: transactionType,
    sell_amount: details.sell_amount ?? (transactionType === 'sell' ? fallbackPriceAmount : null),
    rent_per_day: details.rent_per_day ?? (transactionType === 'rent' ? fallbackPriceAmount : null),
    amount: details.amount ?? null,
    location_scope: details.location_scope ?? null,
    conditions: details.conditions ?? null,
    item: details.item ?? null,
    quantity: details.quantity ?? null,
    delivery_scope: details.delivery_scope ?? null,
    skill: details.skill ?? null,
    capacity: details.capacity ?? null,
    duration: details.duration ?? null,
    scope: details.scope ?? null,
    budget_range: details.budget_range ?? null
  };
};

const buildOfferDetails = (body: Record<string, any>) => {
  const offerType = body.offer_type;
  const transactionDetails = buildTransactionDetails(body);
  const resolvedFinancialAmount = body.amount ?? (
    transactionDetails.transaction_type === 'volunteer'
      ? 0
      : transactionDetails.transaction_type === 'rent'
        ? (transactionDetails.rent_per_day ?? null)
        : (transactionDetails.sell_amount ?? null)
  );
  let offerDetails: Record<string, any>;

  switch (offerType) {
    case 'financial':
      offerDetails = {
        offer_type: offerType,
        amount: resolvedFinancialAmount,
        location_scope: body.location_scope || null,
        conditions: body.conditions || null
      };
      break;
    case 'material':
      offerDetails = {
        offer_type: offerType,
        item: body.item || null,
        quantity: body.quantity ?? null,
        delivery_scope: body.delivery_scope || null
      };
      break;
    case 'service':
      offerDetails = {
        offer_type: offerType,
        skill: body.skill || null,
        capacity: body.capacity ?? null,
        duration: body.duration || null
      };
      break;
    case 'infrastructure':
      offerDetails = {
        offer_type: offerType,
        scope: body.scope || null,
        capacity: body.capacity ?? null,
        budget_range: body.budget_range || null,
        conditions: body.conditions || null
      };
      break;
    default:
      offerDetails = { offer_type: offerType };
  }

  return {
    ...offerDetails,
    ...transactionDetails
  };
};

const hasRequiredOfferFields = (offerType: string, details: Record<string, any>) => {
  switch (offerType) {
    case 'financial':
      return details.amount !== null && details.amount !== undefined && String(details.location_scope || '').trim();
    case 'material':
      return String(details.item || '').trim() && details.quantity !== null && details.quantity !== undefined && String(details.delivery_scope || '').trim();
    case 'service':
      return String(details.skill || '').trim() && String(details.capacity || '').trim() && String(details.duration || '').trim();
    case 'infrastructure':
      return String(details.scope || '').trim() && String(details.capacity || '').trim() && String(details.budget_range || '').trim();
    default:
      return false;
  }
};

const hasRequiredTransactionFields = (details: Record<string, any>) => {
  const transactionType = details.transaction_type;

  if (transactionType === 'volunteer') {
    return true;
  }

  if (transactionType === 'rent') {
    return details.rent_per_day !== null && details.rent_per_day !== undefined && Number(details.rent_per_day) > 0;
  }

  if (transactionType === 'sell') {
    return details.sell_amount !== null && details.sell_amount !== undefined && Number(details.sell_amount) > 0;
  }

  return false;
};

const getLegacyPricing = (offerType: string, details: Record<string, any>) => {
  if (offerType === 'financial') {
    const amount = Number(details.amount || 0);
    return {
      price_type: amount > 0 ? 'fixed' : 'negotiable',
      price_amount: amount,
      price_description: details.location_scope || 'Financial support'
    };
  }

  if (offerType === 'material') {
    return {
      price_type: 'donation',
      price_amount: 0,
      price_description: details.item || 'Material support'
    };
  }

  return {
    price_type: 'negotiable',
    price_amount: 0,
    price_description: `${offerType} support`
  };
};

const getTransactionPricing = (details: Record<string, any>, fallbackPricing: Record<string, any>) => {
  if (details.transaction_type === 'volunteer') {
    return {
      price_type: 'free',
      price_amount: 0,
      price_description: 'Volunteer support (no charges)'
    };
  }

  if (details.transaction_type === 'rent') {
    const rentPerDay = Number(details.rent_per_day || 0);
    return {
      price_type: 'fixed',
      price_amount: rentPerDay,
      price_description: `Rent: ₹${rentPerDay.toLocaleString('en-IN')} per day`
    };
  }

  if (details.transaction_type === 'sell') {
    const sellAmount = Number(details.sell_amount || 0);
    return {
      price_type: 'fixed',
      price_amount: sellAmount,
      price_description: `Sell: ₹${sellAmount.toLocaleString('en-IN')}`
    };
  }

  return fallbackPricing;
};

// GET - Fetch service offers with enhanced filtering
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const rawView = searchParams.get('view');
    const view = rawView === 'hired' ? 'my-responses' : rawView;
    const location = searchParams.get('location');
    const offer_type = searchParams.get('offer_type');

    // For my-offers view, authenticate user
    let authenticatedUserId = null;
    if (view === 'my-offers' || view === 'my-responses') {
      const authHeader = request.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Authentication required for this view' }, { status: 401 });
      }

      const token = authHeader.substring(7);
      try {
        const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
        authenticatedUserId = payload.id;
      } catch {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }
    }

    let responseOfferIds: number[] | null = null;
    if (view === 'my-responses' && authenticatedUserId) {
      const { data: serviceClients, error: serviceClientsError } = await supabase
        .from('service_clients')
        .select('service_offer_id')
        .eq('client_id', authenticatedUserId);

      if (serviceClientsError) {
        console.error('Error fetching responded offers:', serviceClientsError);
        return NextResponse.json({ error: 'Failed to fetch responded offers' }, { status: 500 });
      }

      responseOfferIds = [...new Set((serviceClients || []).map((row: any) => row.service_offer_id))];
      if (responseOfferIds.length === 0) {
        return NextResponse.json({ success: true, data: [] });
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
    if (view === 'all' || !view) {
      query = query.or('admin_status.eq.approved,admin_status.is.null')
              .eq('status', 'active');
    } else if (view === 'my-offers') {
      // For my-offers view, show all offers by the user
      query = query.eq('status', 'active');
    } else if (view === 'my-responses') {
      query = query.in('id', responseOfferIds || []);
    }

    // Apply filters
    if (category && category !== 'All Categories') {
      query = query.eq('category', category);
    }

    if (view === 'my-offers' && authenticatedUserId) {
      query = query.eq('ngo_id', authenticatedUserId);
    }

    const { data: offers, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to fetch service offers' }, { status: 500 });
    }

    // Apply additional filters that require processing
    let filteredOffers = (offers || []).map(normalizeOffer);

    if (offer_type) {
      filteredOffers = filteredOffers.filter((offer) => offer.offer_type === offer_type);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filteredOffers = filteredOffers.filter(offer =>
        offer.title?.toLowerCase().includes(searchLower) ||
        offer.description?.toLowerCase().includes(searchLower) ||
        offer.category?.toLowerCase().includes(searchLower) ||
        offer.offer_type?.toLowerCase().includes(searchLower) ||
        offer.skill?.toLowerCase().includes(searchLower) ||
        offer.item?.toLowerCase().includes(searchLower) ||
        offer.scope?.toLowerCase().includes(searchLower) ||
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

    filteredOffers = filteredOffers.map((offer: any) => {
      const providerName = offer.ngo?.name || offer.ngo_name;
      const providerType = offer.ngo?.user_type || 'ngo';

      return {
        ...offer,
        ngo_name: providerName,
        provider_name: providerName,
        provider_type: providerType
      };
    });

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

// POST - Create new enhanced service offer
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

    const { id: userId, verification_status, user_type } = decoded;

    // Read the latest account state from DB to avoid stale token claims.
    const { data: currentUser, error: currentUserError } = await supabase
      .from('users')
      .select('id, user_type, verification_status')
      .eq('id', userId)
      .single();

    if (currentUserError || !currentUser) {
      return NextResponse.json({ error: 'User account not found' }, { status: 404 });
    }

    const effectiveUserType = currentUser.user_type || user_type;
    const effectiveVerificationStatus = currentUser.verification_status || verification_status || 'unverified';

    console.log('=== Service Offers Debug ===');
    console.log('User ID:', userId);
    console.log('User type from token:', user_type);
    console.log('Verification status from token:', verification_status);
    console.log('User type from DB:', currentUser.user_type);
    console.log('Verification status from DB:', currentUser.verification_status);

    const allowedCreatorTypes = ['ngo', 'company', 'individual'];
    if (!allowedCreatorTypes.includes(effectiveUserType)) {
      return NextResponse.json({
        error: 'Only verified NGO, company, or individual accounts can create capability offers.'
      }, { status: 403 });
    }

    if (effectiveVerificationStatus !== 'verified') {
      return NextResponse.json({ 
        error: 'You need to complete verification before creating capability offers.',
        requiresVerification: true,
        debug: {
          tokenVerificationStatus: verification_status,
          dbVerificationStatus: currentUser.verification_status,
          userId: userId
        }
      }, { status: 403 });
    }

    const body = await request.json();
    console.log('Enhanced service offer data received');

    // Validate required fields
    const requiredFields = ['title', 'description', 'offer_type', 'transaction_type'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    if (!OFFER_TYPES.includes(body.offer_type)) {
      return NextResponse.json(
        { error: 'offer_type must be one of: financial, material, service, infrastructure.' },
        { status: 400 }
      );
    }

    if (!TRANSACTION_TYPES.includes(body.transaction_type)) {
      return NextResponse.json(
        { error: 'transaction_type must be one of: sell, rent, volunteer.' },
        { status: 400 }
      );
    }

    const offerDetails = buildOfferDetails(body);
    if (!hasRequiredOfferFields(body.offer_type, offerDetails)) {
      return NextResponse.json({ error: 'Please complete all required offer details for selected offer_type.' }, { status: 400 });
    }

    if (!hasRequiredTransactionFields(offerDetails)) {
      return NextResponse.json({ error: 'Please complete all required pricing fields for selected transaction_type.' }, { status: 400 });
    }

    const legacyPricing = getLegacyPricing(body.offer_type, offerDetails);
    const resolvedPricing = getTransactionPricing(offerDetails, legacyPricing);

    const offerData = {
      // TODO: rename column to creator_id in DB to reflect companies/individuals
      ngo_id: userId,
      title: body.title,
      description: body.description,
      offer_type: body.offer_type,
      category: OFFER_TYPE_TO_CATEGORY[body.offer_type] || body.offer_type,
      location: body.location || null,
      price_type: resolvedPricing.price_type,
      price_amount: resolvedPricing.price_amount,
      price_description: resolvedPricing.price_description,
      requirements: offerDetails,
      status: 'active',
      admin_status: 'pending',
      admin_reviewed_at: null,
      admin_reviewed_by: null,
      admin_comments: null
    };

    console.log('Inserting philanthropic offer data:', offerData);

    const { data: offer, error } = await supabase
      .from('service_offers')
      .insert(offerData)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to create service offer' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: offer.id,
        message: 'Capability offer created successfully and submitted for approval'
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