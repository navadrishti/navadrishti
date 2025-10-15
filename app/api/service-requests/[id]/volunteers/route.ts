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

// GET - Fetch volunteers for a service request
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const requestId = parseInt(id);
    
    // Check if this is a public request to check user application status
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    
    if (userId) {
      // Public request to check if user has applied
      const userApplication = await executeQuery({
        query: `SELECT sv.*, u.name as volunteer_name, u.email as volunteer_email
                 FROM service_volunteers sv
                 JOIN users u ON sv.volunteer_id = u.id
                 WHERE sv.service_request_id = ? AND sv.volunteer_id = ?`,
        values: [requestId, parseInt(userId)]
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

    // Only NGOs can view volunteers for their requests
    if (userType !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can view applicants' }, { status: 403 });
    }

    // First, verify that this request belongs to the authenticated NGO
    const requestCheck = await executeQuery({
      query: `SELECT ngo_id FROM service_requests WHERE id = ?`,
      values: [requestId]
    }) as any[];

    if (requestCheck.length === 0) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    if (requestCheck[0].ngo_id !== ngoUserId) {
      return NextResponse.json({ error: 'You can only view applicants for your own requests' }, { status: 403 });
    }

    // Fetch volunteers for this request
    const volunteers = await executeQuery({
      query: `
        SELECT 
          sv.*,
          u.name as volunteer_name,
          u.email as volunteer_email
        FROM service_volunteers sv
        JOIN users u ON sv.volunteer_id = u.id
        WHERE sv.service_request_id = ?
        ORDER BY sv.created_at DESC
      `,
      values: [requestId]
    }) as any[];

    return NextResponse.json({
      success: true,
      data: volunteers
    });

  } catch (error) {
    console.error('Error fetching volunteers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch volunteers' },
      { status: 500 }
    );
  }
}

// POST - Submit volunteer application for a service request
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { volunteer_id, volunteer_type, message, start_date, end_date } = body;

    // Validate required fields
    if (!volunteer_id || !volunteer_type || !message) {
      return NextResponse.json(
        { error: 'Volunteer ID, volunteer type, and message are required' },
        { status: 400 }
      );
    }

    const requestId = parseInt(id);

    // Check if the volunteer has already applied
    const existingApplication = await executeQuery({
      query: `SELECT id FROM service_volunteers 
               WHERE service_request_id = ? AND volunteer_id = ?`,
      values: [requestId, volunteer_id]
    }) as any[];

    if (existingApplication.length > 0) {
      return NextResponse.json(
        { error: 'You have already applied for this service request' },
        { status: 400 }
      );
    }

    // Insert the volunteer application
    const result = await executeQuery({
      query: `INSERT INTO service_volunteers 
               (service_request_id, volunteer_id, volunteer_type, message, start_date, end_date, status) 
               VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      values: [
        requestId,
        volunteer_id,
        volunteer_type,
        message,
        start_date || null,
        end_date || null
      ]
    }) as any;

    if (result && result.insertId) {
      // Return the created application
      const newApplication = await executeQuery({
        query: `SELECT sv.*, u.name as volunteer_name, u.email as volunteer_email
                 FROM service_volunteers sv
                 JOIN users u ON sv.volunteer_id = u.id
                 WHERE sv.id = ?`,
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
    console.error('Error creating volunteer application:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}