import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';

// Debug endpoint to check service request and volunteer data
export async function GET(request: NextRequest) {
  try {
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { id: userId } = decoded;

    // Get all service requests for this NGO
    const { data: requests } = await supabase
      .from('service_requests')
      .select('id, title, status, ngo_id')
      .eq('ngo_id', userId);

    const debugData = [];

    for (const request of requests || []) {
      // Get all volunteers for this request
      const { data: volunteers } = await supabase
        .from('service_volunteers')
        .select('id, volunteer_id, status, applied_at, updated_at')
        .eq('service_request_id', request.id);

      // Count by status
      const statusCounts = {
        pending: volunteers?.filter(v => v.status === 'pending').length || 0,
        accepted: volunteers?.filter(v => v.status === 'accepted').length || 0,
        active: volunteers?.filter(v => v.status === 'active').length || 0,
        completed: volunteers?.filter(v => v.status === 'completed').length || 0,
        rejected: volunteers?.filter(v => v.status === 'rejected').length || 0,
      };

      const workingVolunteers = statusCounts.accepted + statusCounts.active;
      const shouldBeCompleted = workingVolunteers === 0 && statusCounts.completed > 0;

      debugData.push({
        request: {
          id: request.id,
          title: request.title,
          current_status: request.status,
          should_be_completed: shouldBeCompleted
        },
        volunteers: volunteers || [],
        status_counts: statusCounts,
        working_volunteers: workingVolunteers
      });
    }

    return NextResponse.json({
      success: true,
      user_id: userId,
      debug_data: debugData
    });

  } catch (error) {
    console.error('Debug endpoint error:', error);
    return NextResponse.json(
      { error: 'Failed to get debug data' },
      { status: 500 }
    );
  }
}