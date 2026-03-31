import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';

// Interface for JWT payload
interface JWTPayload {
  id: number;
  user_type: string;
  email: string;
  name: string;
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

// GET - Fetch single service offer
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const offerId = parseInt(id);

    // Fetch the service offer using Supabase helper
    const serviceOffer = await db.serviceOffers.getById(offerId);

    if (!serviceOffer) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 });
    }

    // Return the service offer data (publicly accessible)
    const providerName = serviceOffer.ngo?.name || serviceOffer.ngo_name;
    const providerType = serviceOffer.ngo?.user_type || 'ngo';

    return NextResponse.json({
      ...normalizeOffer(serviceOffer),
      ngo_name: providerName,
      provider_name: providerName,
      provider_type: providerType
    });

  } catch (error) {
    console.error('Error fetching service offer:', error);
    return NextResponse.json(
      { error: 'Failed to fetch service offer' },
      { status: 500 }
    );
  }
}

// PUT - Update service offer (offer owner only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const { id: userId } = decoded;

    const offerId = parseInt(id);
    const body = await request.json();

    const { 
      title, 
      description, 
      offer_type,
      transaction_type,
      sell_amount,
      rent_per_day,
      amount,
      location_scope,
      conditions,
      item,
      quantity,
      delivery_scope,
      skill,
      capacity,
      duration,
      scope,
      budget_range
    } = body;

    // Validate required fields
    const normalizedOfferType = offer_type;

    if (!title || !description || !normalizedOfferType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!OFFER_TYPES.includes(normalizedOfferType)) {
      return NextResponse.json(
        { error: 'offer_type must be one of: financial, material, service, infrastructure.' },
        { status: 400 }
      );
    }

    if (!TRANSACTION_TYPES.includes(transaction_type)) {
      return NextResponse.json(
        { error: 'transaction_type must be one of: sell, rent, volunteer.' },
        { status: 400 }
      );
    }

    const offerDetails = buildOfferDetails({
      offer_type: normalizedOfferType,
      transaction_type,
      sell_amount,
      rent_per_day,
      amount,
      location_scope,
      conditions,
      item,
      quantity,
      delivery_scope,
      skill,
      capacity,
      duration,
      scope,
      budget_range
    });

    if (!hasRequiredOfferFields(normalizedOfferType, offerDetails)) {
      return NextResponse.json({ error: 'Please complete all required offer details for selected offer_type.' }, { status: 400 });
    }

    if (!hasRequiredTransactionFields(offerDetails)) {
      return NextResponse.json({ error: 'Please complete all required pricing fields for selected transaction_type.' }, { status: 400 });
    }

    // First, verify that this offer belongs to the authenticated owner
    const existingOffer = await db.serviceOffers.getById(offerId);

    if (!existingOffer) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 });
    }

    if (existingOffer.ngo_id !== userId) {
      return NextResponse.json({ error: 'You can only update your own offers' }, { status: 403 });
    }

    const legacyPricing = getLegacyPricing(normalizedOfferType, offerDetails);
    const resolvedPricing = getTransactionPricing(offerDetails, legacyPricing);

    const updateData = {
      title,
      description,
      offer_type: normalizedOfferType,
      category: OFFER_TYPE_TO_CATEGORY[normalizedOfferType] || existingOffer.category || normalizedOfferType,
      location: body.location || null,
      price_type: resolvedPricing.price_type,
      price_amount: resolvedPricing.price_amount,
      price_description: resolvedPricing.price_description,
      requirements: offerDetails,
      updated_at: new Date().toISOString()
    };

    await db.serviceOffers.update(offerId, updateData);

    return NextResponse.json({
      success: true,
      data: { message: 'Service offer updated successfully' }
    });

  } catch (error) {
    console.error('Error updating service offer:', error);
    return NextResponse.json(
      { error: 'Failed to update service offer' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a service offer (offer owner only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params to get the id
    const { id } = await params;
    
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const { id: userId } = decoded;

    const offerId = parseInt(id);

    // First, verify that this offer belongs to the authenticated owner
    const existingOffer = await db.serviceOffers.getById(offerId);

    if (!existingOffer) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 });
    }

    if (existingOffer.ngo_id !== userId) {
      return NextResponse.json({ error: 'You can only delete your own service offers' }, { status: 403 });
    }

    // Delete the service offer using Supabase helper
    await db.serviceOffers.delete(offerId, userId);

    return NextResponse.json({
      success: true,
      message: 'Service offer deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting service offer:', error);
    return NextResponse.json(
      { error: 'Failed to delete service offer' },
      { status: 500 }
    );
  }
}