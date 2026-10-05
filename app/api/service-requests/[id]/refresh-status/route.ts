import { NextRequest, NextResponse } from 'next/server';
import { db, supabase } from '@/lib/db';
import { getTokenClaims } from '@/lib/auth';

// POST - Manually refresh service request status based on volunteer completion
export async function POST(request: NextRequest) {
  try {
    const claims = getTokenClaims(request);
    if (!claims) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const { id: userId, user_type: userType } = claims;

    // Only NGOs can refresh their service request statuses
    if (userType !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can refresh request statuses' }, { status: 403 });
    }

    const body = await request.json();
    const { serviceRequestId } = body;

    if (!serviceRequestId) {
      return NextResponse.json({ error: 'Service request ID is required' }, { status: 400 });
    }

    const requestData = await db.serviceRequests.getById(serviceRequestId);
    if (!requestData || requestData.ngo_id !== userId) {
      return NextResponse.json({ error: 'Service request not found or unauthorized' }, { status: 404 });
    }

    const { data: allVolunteers, error: volunteersError } = await supabase
      .from('service_request_applications')
      .select('id, status')
      .eq('service_request_id', serviceRequestId);

    if (volunteersError) throw volunteersError;

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

    const previousStatus = String(requestData.status || '').toLowerCase();
    if (!['active', 'in_progress', 'completed'].includes(previousStatus)) {
      return NextResponse.json({ error: `A ${previousStatus || 'closed'} request cannot be refreshed` }, { status: 409 });
    }

    let newStatus = previousStatus;
    if (previousStatus === 'completed' && workingVolunteers > 0) {
      newStatus = 'active';
    } else if (workingVolunteers === 0 && completedCount > 0) {
      newStatus = 'completed';
    }

    if (newStatus !== previousStatus) {
      const { error: updateError } = await supabase
        .from('service_requests')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', serviceRequestId)
        .eq('status', previousStatus);

      if (updateError) throw updateError;
    }

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