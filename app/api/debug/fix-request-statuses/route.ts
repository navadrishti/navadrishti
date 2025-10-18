import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

// One-time fix to update service request statuses based on volunteer completion
export async function POST(request: NextRequest) {
  try {
    console.log('🔧 Starting one-time service request status fix...');

    // Get all service requests that are currently 'active' or 'open'
    const { data: activeRequests, error: requestsError } = await supabase
      .from('service_requests')
      .select('id, status, title')
      .in('status', ['active', 'open']);

    if (requestsError) throw requestsError;

    if (!activeRequests || activeRequests.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active service requests found to update'
      });
    }

    console.log(`📋 Found ${activeRequests.length} active service requests to check`);

    const updates = [];

    for (const request of activeRequests) {
      // Get all volunteers for this service request
      const { data: volunteers } = await supabase
        .from('service_volunteers')
        .select('id, status')
        .eq('service_request_id', request.id);

      if (volunteers && volunteers.length > 0) {
        // Count volunteers by status
        const acceptedCount = volunteers.filter(v => v.status === 'accepted').length;
        const activeCount = volunteers.filter(v => v.status === 'active').length;
        const completedCount = volunteers.filter(v => v.status === 'completed').length;
        const workingVolunteers = acceptedCount + activeCount;

        console.log(`📊 Request "${request.title}" (ID: ${request.id}):`, {
          accepted: acceptedCount,
          active: activeCount,
          completed: completedCount,
          working: workingVolunteers
        });

        // Determine if request should be marked as completed
        if (workingVolunteers === 0 && completedCount > 0) {
          // Update to completed
          await supabase
            .from('service_requests')
            .update({ 
              status: 'completed',
              updated_at: new Date().toISOString()
            })
            .eq('id', request.id);

          updates.push({
            id: request.id,
            title: request.title,
            oldStatus: request.status,
            newStatus: 'completed',
            reason: `${completedCount} completed volunteers, ${workingVolunteers} still working`
          });

          console.log(`✅ Updated "${request.title}" to completed`);
        } else {
          console.log(`⏳ "${request.title}" still has ${workingVolunteers} volunteers working`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Status fix completed. Updated ${updates.length} service requests.`,
      updates
    });

  } catch (error) {
    console.error('❌ Error in status fix:', error);
    return NextResponse.json(
      { error: 'Failed to fix service request statuses' },
      { status: 500 }
    );
  }
}