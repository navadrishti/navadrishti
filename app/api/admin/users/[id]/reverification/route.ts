import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { assertAdminUser } from '@/lib/admin-auth';
import {
  approveReverification,
  extractReverificationSummary,
  rejectReverification,
} from '@/lib/reverification';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertAdminUser(request);
    const { id } = await params;
    const userId = Number(id);

    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Valid user ID is required' }, { status: 400 });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, user_type, verification_status, profile_data, updated_at')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const summary = extractReverificationSummary(user);

    return NextResponse.json({
      success: true,
      pending: Boolean(summary),
      reverification: summary,
    });
  } catch (error: any) {
    console.error('Admin reverification detail error:', error);
    if (error?.message === 'Admin authentication required') {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertAdminUser(request);
    const { id } = await params;
    const userId = Number(id);

    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Valid user ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const action = String(body?.action || '').trim();
    const reason = typeof body?.reason === 'string' ? body.reason : '';

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Use approve or reject.' }, { status: 400 });
    }

    const updatedUser = action === 'approve'
      ? await approveReverification(userId)
      : await rejectReverification(userId, reason);

    return NextResponse.json({
      success: true,
      action,
      message: action === 'approve'
        ? 'Reverification approved and documents updated.'
        : 'Reverification rejected. User remains verified with existing documents.',
      data: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        user_type: updatedUser.user_type,
        verification_status: updatedUser.verification_status,
        updated_at: updatedUser.updated_at,
      },
    });
  } catch (error: any) {
    console.error('Admin reverification action error:', error);
    if (error?.message === 'Admin authentication required') {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }
    const status = error?.message?.includes('No pending reverification') ? 400 : 500;
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status });
  }
}
