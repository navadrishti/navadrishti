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
      const userApplication = await executeQuery({
        query: `SELECT sc.*, u.name as client_name, u.email as client_email
                 FROM service_clients sc
                 JOIN users u ON sc.client_id = u.id
                 WHERE sc.service_offer_id = ? AND sc.client_id = ?`,
        values: [offerId, parseInt(userId)]
      }) as any[];

      return NextResponse.json(userApplication);
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
    const offerCheck = await executeQuery({
      query: `SELECT ngo_id FROM service_offers WHERE id = ?`,
      values: [offerId]
    }) as any[];

    if (offerCheck.length === 0) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 });
    }

    if (offerCheck[0].ngo_id !== ngoUserId) {
      return NextResponse.json({ error: 'You can only view applicants for your own offers' }, { status: 403 });
    }

    // Fetch clients for this offer
    const clients = await executeQuery({
      query: `
        SELECT 
          sc.*,
          u.name as client_name,
          u.email as client_email
        FROM service_clients sc
        JOIN users u ON sc.client_id = u.id
        WHERE sc.service_offer_id = ?
        ORDER BY sc.created_at DESC
      `,
      values: [offerId]
    }) as any[];

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

    // Check if the client has already applied
    const existingApplication = await executeQuery({
      query: `SELECT id FROM service_clients 
               WHERE service_offer_id = ? AND client_id = ?`,
      values: [offerId, client_id]
    }) as any[];

    if (existingApplication.length > 0) {
      return NextResponse.json(
        { error: 'You have already applied for this service offer' },
        { status: 400 }
      );
    }

    // Insert the client application
    const result = await executeQuery({
      query: `INSERT INTO service_clients 
               (service_offer_id, client_id, client_type, message, start_date, end_date, amount_paid, status) 
               VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      values: [
        offerId,
        client_id,
        client_type,
        message,
        start_date || null,
        end_date || null,
        proposed_amount || 0
      ]
    }) as any;

    if (result && result.insertId) {
      // Return the created application
      const newApplication = await executeQuery({
        query: `SELECT sc.*, u.name as client_name, u.email as client_email
                 FROM service_clients sc
                 JOIN users u ON sc.client_id = u.id
                 WHERE sc.id = ?`,
        values: [result.insertId]
      }) as any[];

      if (newApplication.length > 0) {
        return NextResponse.json(newApplication[0], { status: 201 });
      }
    }

    return NextResponse.json(
      { error: 'Failed to create application' },
      { status: 500 }
    );

  } catch (error) {
    console.error('Error creating client application:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}