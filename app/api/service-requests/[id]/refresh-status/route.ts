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

// POST - Manually refresh service request status based on volunteer completion
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

    // Only NGOs can refresh their service request statuses
    if (userType !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can refresh request statuses' }, { status: 403 });
    }

    const body = await request.json();
    const { serviceRequestId } = body;

    if (!serviceRequestId) {
      return NextResponse.json({ error: 'Service request ID is required' }, { status: 400 });
    }

    // Verify that this request belongs to the authenticated NGO
    const requestData = await db.serviceRequests.getById(serviceRequestId);
    if (!requestData || requestData.requester_id !== userId) {
      return NextResponse.json({ error: 'Service request not found or unauthorized' }, { status: 404 });
    }

    // Get all volunteers for this service request
    const { data: allVolunteers } = await supabase
      .from('service_volunteers')
      .select('id, status')
      .eq('service_request_id', serviceRequestId);

    if (!allVolunteers || allVolunteers.length === 0) {
      return NextResponse.json({ error: 'No volunteers found for this request' }, { status: 404 });
    }

    // Count volunteers by status
    const acceptedCount = allVolunteers.filter(v => v.status === 'accepted').length;
    const activeCount = allVolunteers.filter(v => v.status === 'active').length;
    const completedCount = allVolunteers.filter(v => v.status === 'completed').length;
    const rejectedCount = allVolunteers.filter(v => v.status === 'rejected').length;
    const pendingCount = allVolunteers.filter(v => v.status === 'pending').length;
    const workingVolunteers = acceptedCount + activeCount;

    // Determine correct status
    let newStatus = 'active'; // default
    if (workingVolunteers === 0 && completedCount > 0) {
      newStatus = 'completed';
    }

    // Update service request status
    await supabase
      .from('service_requests')
      .update({ 
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', serviceRequestId);

    return NextResponse.json({
      success: true,
      data: {
        serviceRequestId,
        previousStatus: requestData.status,
        newStatus,
        volunteerCounts: {
          pending: pendingCount,
          accepted: acceptedCount,
          active: activeCount,
          completed: completedCount,
          rejected: rejectedCount,
          total: allVolunteers.length
        }
      }
    });

  } catch (error) {
    console.error('Error refreshing service request status:', error);
    return NextResponse.json(
      { error: 'Failed to refresh service request status' },
      { status: 500 }
    );
  }
}