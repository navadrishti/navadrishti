import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';

// Direct fix to update service request statuses
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

    console.log('🔧 Starting direct status fix for user:', userId);

    // Get all service requests for this NGO that are currently active/open
    const { data: requests } = await supabase
      .from('service_requests')
      .select('id, title, status, ngo_id')
      .eq('ngo_id', userId)
      .in('status', ['active', 'open']);

    if (!requests || requests.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active service requests found',
        updates: []
      });
    }

    console.log(`📋 Found ${requests.length} active requests to check`);

    const updates = [];

    for (const request of requests) {
      console.log(`\n🔍 Checking request: "${request.title}" (ID: ${request.id})`);
      
      // Get all volunteers for this request
      const { data: volunteers } = await supabase
        .from('service_volunteers')
        .select('id, volunteer_id, status, applied_at, updated_at')
        .eq('service_request_id', request.id);

      if (!volunteers || volunteers.length === 0) {
        console.log(`   ⚠️ No volunteers found for "${request.title}"`);
        continue;
      }

      // Count by status
      const statusCounts = {
        pending: volunteers.filter(v => v.status === 'pending').length,
        accepted: volunteers.filter(v => v.status === 'accepted').length,
        active: volunteers.filter(v => v.status === 'active').length,
        completed: volunteers.filter(v => v.status === 'completed').length,
        rejected: volunteers.filter(v => v.status === 'rejected').length,
      };

      const workingVolunteers = statusCounts.accepted + statusCounts.active;
      
      console.log(`   📊 Volunteer counts:`, statusCounts);
      console.log(`   👥 Working volunteers: ${workingVolunteers}`);

      // Check if request should be marked as completed
      if (workingVolunteers === 0 && statusCounts.completed > 0) {
        console.log(`   ✅ Updating "${request.title}" to completed status`);
        
        // Update the service request status
        const { error: updateError } = await supabase
          .from('service_requests')
          .update({ 
            status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', request.id);

        if (updateError) {
          console.error(`   ❌ Error updating "${request.title}":`, updateError);
          updates.push({
            id: request.id,
            title: request.title,
            status: 'error',
            error: updateError.message,
            volunteer_counts: statusCounts
          });
        } else {
          console.log(`   ✅ Successfully updated "${request.title}" to completed`);
          updates.push({
            id: request.id,
            title: request.title,
            old_status: request.status,
            new_status: 'completed',
            volunteer_counts: statusCounts,
            reason: `${statusCounts.completed} completed volunteers, ${workingVolunteers} still working`
          });
        }
      } else {
        console.log(`   ⏳ "${request.title}" not ready for completion (${workingVolunteers} still working, ${statusCounts.completed} completed)`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Direct fix completed. Checked ${requests.length} requests, updated ${updates.filter(u => u.new_status).length} requests.`,
      user_id: userId,
      updates
    });

  } catch (error) {
    console.error('❌ Error in direct status fix:', error);
    return NextResponse.json(
      { error: 'Failed to fix service request statuses', details: error.message },
      { status: 500 }
    );
  }
}