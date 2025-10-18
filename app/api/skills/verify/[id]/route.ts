import { NextRequest } from 'next/server';
import { supabase } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>
}

// PUT - Update verification record
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    const cookieToken = request.cookies.get('token')?.value;
    
    let token;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (cookieToken) {
      token = cookieToken;
    } else {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
      return Response.json({ error: 'Invalid authentication' }, { status: 401 });
    }

    const body = await request.json();
    const { action, status, rating, completedProjects } = body;

    if (action === 'verify') {
      // Update verification status
      await supabase
        .from('people_skills_verification')
        .update({
          verification_status: status,
          verified_by: user.id,
          verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('ngo_id', user.id);

      return Response.json({
        success: true,
        message: `Record ${status === 'verified' ? 'verified' : 'rejected'} successfully`
      });

    } else if (action === 'update_performance') {
      // Update rating and completed projects
      await supabase
        .from('people_skills_verification')
        .update({
          rating: rating,
          completed_projects: completedProjects,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('ngo_id', user.id);

      return Response.json({
        success: true,
        message: 'Performance updated successfully'
      });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error: any) {
    console.error('Skills verification update error:', error);
    return Response.json({
      success: false,
      error: 'Failed to update record',
      details: error.message
    }, { status: 500 });
  }
}

// DELETE - Delete verification record
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    const cookieToken = request.cookies.get('token')?.value;
    
    let token;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (cookieToken) {
      token = cookieToken;
    } else {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
      return Response.json({ error: 'Invalid authentication' }, { status: 401 });
    }

    // Only NGOs can delete their own records
    if (user.user_type !== 'ngo') {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    await supabase
      .from('people_skills_verification')
      .delete()
      .eq('id', id)
      .eq('ngo_id', user.id);

    return Response.json({
      success: true,
      message: 'Record deleted successfully'
    });

  } catch (error: any) {
    console.error('Skills verification deletion error:', error);
    return Response.json({
      success: false,
      error: 'Failed to delete record',
      details: error.message
    }, { status: 500 });
  }
}