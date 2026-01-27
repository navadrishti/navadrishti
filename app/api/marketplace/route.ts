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

// GET - Fetch marketplace items (public endpoint - no auth required for viewing)
export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const userId = searchParams.get('userId');
    const sellerId = searchParams.get('seller_id');
    const view = searchParams.get('view'); // 'all', 'my-listings', 'purchased', 'nearby'
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');

    // For my-listings view, authenticate user
    let authenticatedUserId = null;
    let currentUser = null;
    
    if (view === 'my-listings' || view === 'nearby') {
      const authHeader = request.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        if (view === 'my-listings') {
          return NextResponse.json({ error: 'Authentication required for my-listings' }, { status: 401 });
        }
        // For nearby view without auth, proceed with all items
      } else {
        const token = authHeader.substring(7);
        try {
          const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
          authenticatedUserId = payload.id;
          
          // Get user location data for nearby functionality
          if (view === 'nearby') {
            currentUser = await db.users.findById(authenticatedUserId);
          }
        } catch {
          if (view === 'my-listings') {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
          }
          // For nearby view with invalid token, proceed with all items
        }
      }
    }

    // Use Supabase database helpers with seller information
    const filters: any = {};
    if (category && category !== 'All Categories') {
      filters.category = category;
    }
    if (view === 'my-listings' && authenticatedUserId) {
      filters.seller_id = authenticatedUserId;
    }
    if (sellerId) {
      filters.seller_id = sellerId;
    }

    // Get marketplace items based on view type
    let marketplaceItems;
    
    if (view === 'nearby' && currentUser) {
      // Get nearby items based on user location
      const userLocation = {
        city: currentUser.city,
        state_province: currentUser.state_province,
        pincode: currentUser.pincode
      };
      marketplaceItems = await db.marketplaceItems.getNearbyItems(userLocation, filters);
    } else {
      // Get all items with seller information
      marketplaceItems = await db.marketplaceItems.getAllWithSeller(filters);
    }

    // Apply client-side filtering for features not supported by the helper
    if (search) {
      const searchLower = search.toLowerCase();
      marketplaceItems = marketplaceItems.filter(item => 
        item.title?.toLowerCase().includes(searchLower) ||
        item.description?.toLowerCase().includes(searchLower) ||
        item.tags?.toLowerCase().includes(searchLower)
      );
    }

    if (minPrice) {
      const min = parseFloat(minPrice);
      marketplaceItems = marketplaceItems.filter(item => parseFloat(item.price) >= min);
    }

    if (maxPrice) {
      const max = parseFloat(maxPrice);
      marketplaceItems = marketplaceItems.filter(item => parseFloat(item.price) <= max);
    }

    // Handle purchased view separately if needed
    if (view === 'purchased' && userId) {
      // This would need a separate query to purchases table
      // For now, return empty as this feature may need more implementation
      marketplaceItems = [];
    }

    // Format the data to ensure seller information is properly structured
    const formattedItems = marketplaceItems?.map(item => ({
      ...item,
      seller_id: item.seller_id,
      seller_name: item.seller?.name || 'Unknown Seller',
      seller_email: item.seller?.email,
      seller_type: item.seller?.user_type,
      seller_location: item.seller?.location
    })) || [];

    return NextResponse.json({
      success: true,
      data: formattedItems
    });

  } catch (error) {
    console.error('Error fetching marketplace items:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch marketplace items' },
      { status: 500 }
    );
  }
}

// POST - Create new marketplace item or purchase item
export async function POST(request: NextRequest) {
  try {
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const { id: userId, user_type: userType } = decoded;

    const body = await request.json();
    const { action } = body;

    if (action === 'create') {
      // Check user verification status before allowing item creation
      const user = await db.users.findById(userId);
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      // Verification requirements based on user type
      if (user.user_type === 'individual') {
        // For individuals, require at least basic verification (email + identity)
        if (user.verification_status !== 'verified') {
          return NextResponse.json({ 
            error: 'Account verification required', 
            message: 'Please complete your identity verification (Aadhaar & PAN) before posting items.',
            requiresVerification: true
          }, { status: 403 });
        }
      } else if (user.user_type === 'company') {
        // For companies, require organization verification
        if (user.verification_status !== 'verified') {
          return NextResponse.json({ 
            error: 'Organization verification required', 
            message: 'Please complete your organization verification before posting items.',
            requiresVerification: true
          }, { status: 403 });
        }
      } else if (user.user_type === 'ngo') {
        // For NGOs, require organization verification
        if (user.verification_status !== 'verified') {
          return NextResponse.json({ 
            error: 'NGO verification required', 
            message: 'Please complete your NGO verification before posting items.',
            requiresVerification: true
          }, { status: 403 });
        }
      }

      const { 
        title, 
        description, 
        category, 
        tags, 
        price, 
        quantity, 
        condition_type, 
        location, 
        contact_info,
        images,
        brand,
        weight_kg,
        dimensions_cm,
        specifications,
        // Structured location fields
        city,
        state_province,
        pincode,
        country,
        // Buyer eligibility
        who_can_buy
      } = body;

      // Validate required fields
      if (!title || !description || !category || !price) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }

      // Validate who_can_buy field
      if (!who_can_buy || !Array.isArray(who_can_buy) || who_can_buy.length === 0) {
        return NextResponse.json({ 
          error: 'Please specify who can buy this item',
          message: 'You must select at least one buyer type (NGO, Individual, or Company)'
        }, { status: 400 });
      }

      // Validate who_can_buy values
      const validBuyerTypes = ['ngo', 'individual', 'company'];
      const invalidTypes = who_can_buy.filter((type: string) => !validBuyerTypes.includes(type));
      if (invalidTypes.length > 0) {
        return NextResponse.json({ 
          error: 'Invalid buyer types',
          message: `Invalid buyer types: ${invalidTypes.join(', ')}. Must be one of: ngo, individual, company`
        }, { status: 400 });
      }

      // Debug: Log the values being inserted
      console.log('Inserting marketplace item with values:', {
        userId,
        title,
        description,
        category,
        tags,
        price,
        quantity,
        condition_type,
        location,
        images: images?.length || 0
      });

      // Insert new marketplace item using Supabase helpers
      const itemData = {
        seller_id: userId,
        title: title || '',
        description: description || '',
        category: category || '',
        tags: JSON.stringify(tags || []),
        price: price || 0,
        quantity: quantity || 1,
        condition_type: condition_type || 'new',
        item_type: 'single', // Default to single item
        location: location || null, // Keep for backward compatibility
        // Structured location fields for nearby functionality
        city: city || null,
        state_province: state_province || null,
        pincode: pincode || null,
        country: country || 'India',
        images: JSON.stringify(images || []),
        status: 'active',
        is_negotiable: true,
        brand: brand || null,
        weight_kg: weight_kg || null,
        dimensions_cm: dimensions_cm ? JSON.stringify(dimensions_cm) : null,
        specifications: specifications ? JSON.stringify(specifications) : null,
        rating_average: 0.0,
        rating_count: 0,
        who_can_buy: who_can_buy || ['ngo', 'individual', 'company'] // Store as array, not JSON string
      };

      console.log('Final itemData to insert:', itemData);

      const result = await db.marketplaceItems.create(itemData);

      console.log('Insert result:', result);

      return NextResponse.json({
        success: true,
        data: { id: result.id, message: 'Marketplace item created successfully' }
      });

    } else if (action === 'purchase') {
      const { itemId, quantity = 1, shippingAddress, paymentMethod } = body;

      if (!itemId) {
        return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
      }

      // Get item details using Supabase helpers
      const item = await db.marketplaceItems.getById(itemId);

      if (!item || item.status !== 'active') {
        return NextResponse.json({ error: 'Item not found or not available' }, { status: 404 });
      }

      // Check if seller is not the buyer
      if (item.seller_id === userId) {
        return NextResponse.json({ error: 'Cannot purchase your own item' }, { status: 400 });
      }

      // Check if buyer's user type is allowed to purchase this item
      let allowedBuyerTypes: string[] = [];
      try {
        if (typeof item.who_can_buy === 'string') {
          allowedBuyerTypes = JSON.parse(item.who_can_buy);
        } else if (Array.isArray(item.who_can_buy)) {
          allowedBuyerTypes = item.who_can_buy;
        }
      } catch (e) {
        // If parsing fails, allow all user types (backward compatibility)
        allowedBuyerTypes = ['ngo', 'individual', 'company'];
      }

      // Validate buyer eligibility
      if (allowedBuyerTypes.length > 0 && !allowedBuyerTypes.includes(userType)) {
        const buyerTypeLabels: Record<string, string> = {
          ngo: 'NGOs',
          individual: 'Individuals',
          company: 'Companies'
        };
        const allowedLabels = allowedBuyerTypes.map(type => buyerTypeLabels[type] || type).join(', ');
        return NextResponse.json({ 
          error: 'Not eligible to purchase',
          message: `This item can only be purchased by: ${allowedLabels}. Your account type (${buyerTypeLabels[userType] || userType}) is not eligible.`
        }, { status: 403 });
      }

      // Check quantity availability
      if (item.quantity < quantity) {
        return NextResponse.json({ error: 'Insufficient quantity available' }, { status: 400 });
      }

      const totalAmount = item.price * quantity;

      // Create purchase record using Supabase helpers
      const purchaseData = {
        marketplace_item_id: itemId,
        buyer_id: userId,
        buyer_type: userType,
        seller_id: item.seller_id,
        quantity: quantity,
        unit_price: item.price,
        total_amount: totalAmount,
        shipping_address: JSON.stringify(shippingAddress || {}),
        payment_method: paymentMethod || 'cash',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const purchaseResult = await db.purchases.create(purchaseData);

      // Update item quantity using Supabase helpers
      await db.marketplaceItems.update(itemId, {
        quantity: item.quantity - quantity
      });

      // If quantity reaches 0, mark as sold with timestamp
      if (item.quantity - quantity === 0) {
        await db.marketplaceItems.update(itemId, {
          status: 'sold',
          sold_at: new Date().toISOString()
        });
      }

      return NextResponse.json({
        success: true,
        data: { 
          purchaseId: purchaseResult.id, 
          totalAmount,
          message: 'Purchase completed successfully' 
        }
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Error processing marketplace request:', error);
    
    // Return more specific error information
    const errorMessage = error instanceof Error ? error.message : 'Failed to process marketplace request';
    
    return NextResponse.json(
      { 
        success: false, 
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}