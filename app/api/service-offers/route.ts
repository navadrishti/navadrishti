import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';

// Interface for JWT payload
interface JWTPayload {
  id: number;
  user_type: string;
  email: string;
  name: string;
}

// GET - Fetch service offers (public endpoint - no auth required for viewing)
export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const userId = searchParams.get('userId');
    const view = searchParams.get('view'); // 'all', 'my-offers', 'hired-services'

    // Build query based on filters
    let query = `
      SELECT 
        so.*,
        u.name as ngo_name,
        u.email as ngo_email,
        COUNT(sh.id) as hire_count
      FROM service_offers so
      JOIN users u ON so.ngo_id = u.id
      LEFT JOIN service_hires sh ON so.id = sh.service_offer_id
      WHERE so.status = 'active'
    `;
    const values: any[] = [];

    // Add filters
    if (category && category !== 'All Categories') {
      query += ' AND so.category = ?';
      values.push(category);
    }

    if (search) {
      query += ' AND (so.title LIKE ? OR so.description LIKE ? OR so.tags LIKE ?)';
      const searchPattern = `%${search}%`;
      values.push(searchPattern, searchPattern, searchPattern);
    }

    // Handle different views (only if userId is provided)
    if (view === 'my-offers' && userId) {
      query += ' AND so.ngo_id = ?';
      values.push(parseInt(userId));
    } else if (view === 'hired-services' && userId) {
      query += ' AND so.id IN (SELECT service_offer_id FROM service_hires WHERE client_id = ?)';
      values.push(parseInt(userId));
    }

    query += ' GROUP BY so.id ORDER BY so.created_at DESC';

    const serviceOffers = await executeQuery({
      query,
      values
    }) as any[];

    return NextResponse.json({
      success: true,
      data: serviceOffers
    });

  } catch (error) {
    console.error('Error fetching service offers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch service offers' },
      { status: 500 }
    );
  }
}

// POST - Create new service offer (NGOs only)
export async function POST(request: NextRequest) {
  try {
    console.log('POST /api/service-offers - Starting request processing');
    
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('Missing or invalid authorization header');
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    let decoded: JWTPayload;
    
    try {
      decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      console.log('JWT decoded successfully:', { userId: decoded.id, userType: decoded.user_type });
    } catch (jwtError) {
      console.error('JWT verification failed:', jwtError);
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
    }

    const { id: userId, user_type: userType } = decoded;

    // Only NGOs can create service offers
    if (userType !== 'ngo') {
      console.error('User is not NGO:', userType);
      return NextResponse.json({ error: 'Only NGOs can create service offers' }, { status: 403 });
    }

    const body = await request.json();
    console.log('Request body received:', JSON.stringify(body, null, 2));
    
    const { 
      title, 
      description, 
      category,
      location,
      availability,
      deliveryTime,
      pricing,
      contactInfo
    } = body;

    // Validate required fields
    if (!title || !description || !category) {
      console.error('Missing required fields:', { 
        title: !!title, 
        description: !!description, 
        category: !!category 
      });
      return NextResponse.json({ 
        error: 'Missing required fields',
        details: { title: !!title, description: !!description, category: !!category }
      }, { status: 400 });
    }

    // Prepare database values
    const dbValues = [
      userId,
      title,
      description,
      category,
      location || null,
      pricing > 0 ? 'fixed' : 'negotiable',
      pricing || 0,
      `${availability || ''} | Delivery: ${deliveryTime || ''} | Contact: ${contactInfo || ''}`,
      JSON.stringify([]) // Empty skills array
    ];

    console.log('Database values prepared:', dbValues);

    // Insert new service offer
    const result = await executeQuery({
      query: `
        INSERT INTO service_offers (
          ngo_id, title, description, category, location,
          price_type, price_amount, price_description, 
          tags, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `,
      values: dbValues
    }) as any;

    console.log('Database insert result:', result);

    return NextResponse.json({
      success: true,
      data: { id: result.insertId, message: 'Service offer created successfully' }
    });

  } catch (error) {
    console.error('Error creating service offer:', error);
    // Log more details about the error
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return NextResponse.json(
      { error: 'Failed to create service offer', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}