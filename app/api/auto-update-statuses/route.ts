import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';

// Auto-update service request statuses (server-side API)
export async function POST(request: NextRequest) {
  try {
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { id: userId } = decoded;

    console.log(`🔄 Auto-checking service request statuses for NGO ${userId}`);

    // Get all active/open service requests for this NGO
    const { data: requests } = await supabase
      .from('service_requests')
      .select('id, title, status')
      .eq('ngo_id', userId)
      .in('status', ['active', 'open']);

    if (!requests || requests.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active service requests found to check',
        updated: 0,
        checked: 0
      });
    }

    let updatedCount = 0;

    for (const request of requests) {
      // Get all volunteers for this request
      const { data: volunteers } = await supabase
        .from('service_volunteers')
        .select('status')
        .eq('service_request_id', request.id);

      if (volunteers && volunteers.length > 0) {
        // Count volunteers by status
        const acceptedCount = volunteers.filter(v => v.status === 'accepted').length;
        const activeCount = volunteers.filter(v => v.status === 'active').length;
        const completedCount = volunteers.filter(v => v.status === 'completed').length;
        const workingVolunteers = acceptedCount + activeCount;

        // Check if request should be marked as completed
        if (workingVolunteers === 0 && completedCount > 0) {
          console.log(`🔄 Auto-updating "${request.title}" to completed status`);
          
          await supabase
            .from('service_requests')
            .update({ 
              status: 'completed',
              updated_at: new Date().toISOString()
            })
            .eq('id', request.id);

          updatedCount++;
        }
      }
    }

    console.log(`✅ Auto-update complete: ${updatedCount} requests updated out of ${requests.length} checked`);

    return NextResponse.json({
      success: true,
      message: `Auto-update complete: ${updatedCount} requests updated out of ${requests.length} checked`,
      updated: updatedCount,
      checked: requests.length
    });

  } catch (error) {
    console.error('❌ Error in auto-update service request statuses:', error);
    return NextResponse.json(
      { error: 'Failed to auto-update service request statuses', details: error.message },
      { status: 500 }
    );
  }
}