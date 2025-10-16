import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';

interface JWTPayload {
  id: number;
  email: string;
  user_type: string;
  exp: number;
}

export async function POST(request: NextRequest) {
  try {
    const { itemId, itemType } = await request.json();
    
    console.log('Debug delete request:', { itemId, itemType });
    
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ 
        error: 'Authentication required',
        debug: { authHeader: !!authHeader }
      }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    console.log('Token received:', token ? 'Token present' : 'No token');
    
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      console.log('JWT decoded:', { userId: decoded.id, userType: decoded.user_type });
    } catch (jwtError: any) {
      console.error('JWT verification failed:', jwtError);
      return NextResponse.json({ 
        error: 'Invalid token',
        debug: { jwtError: jwtError.message }
      }, { status: 401 });
    }

    const { id: userId, user_type: userType } = decoded;

    if (itemType === 'marketplace') {
      // Test marketplace item lookup
      const item = await db.marketplaceItems.getById(parseInt(itemId));
      console.log('Marketplace item found:', !!item, item ? { id: item.id, seller_id: item.seller_id } : null);
      
      if (!item) {
        return NextResponse.json({ 
          error: 'Item not found',
          debug: { itemId, itemType }
        }, { status: 404 });
      }

      if (item.seller_id !== userId) {
        return NextResponse.json({ 
          error: 'Permission denied',
          debug: { 
            item_seller_id: item.seller_id, 
            current_user_id: userId,
            match: item.seller_id === userId
          }
        }, { status: 403 });
      }

      return NextResponse.json({
        success: true,
        debug: {
          itemId: item.id,
          sellerId: item.seller_id,
          userId: userId,
          canDelete: true,
          userType: userType
        }
      });
    }

    if (itemType === 'service-request') {
      const request = await db.serviceRequests.getById(parseInt(itemId));
      console.log('Service request found:', !!request, request ? { id: request.id, ngo_id: request.ngo_id } : null);
      
      return NextResponse.json({
        success: true,
        debug: {
          requestId: request?.id,
          ngoId: request?.ngo_id,
          userId: userId,
          canDelete: request?.ngo_id === userId,
          userType: userType
        }
      });
    }

    if (itemType === 'service-offer') {
      const offer = await db.serviceOffers.getById(parseInt(itemId));
      console.log('Service offer found:', !!offer, offer ? { id: offer.id, ngo_id: offer.ngo_id } : null);
      
      return NextResponse.json({
        success: true,
        debug: {
          offerId: offer?.id,
          ngoId: offer?.ngo_id,
          userId: userId,
          canDelete: offer?.ngo_id === userId,
          userType: userType
        }
      });
    }

    return NextResponse.json({ 
      error: 'Invalid item type',
      debug: { itemType }
    }, { status: 400 });

  } catch (error: any) {
    console.error('Debug delete error:', error);
    return NextResponse.json({ 
      error: 'Server error',
      debug: { message: error.message, stack: error.stack }
    }, { status: 500 });
  }
}