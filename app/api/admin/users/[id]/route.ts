import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { assertAdminUser } from '@/lib/admin-auth';

const allowedUserTypes = new Set(['individual', 'ngo', 'company', 'admin']);
const allowedVerificationStatuses = new Set(['unverified', 'pending', 'verified']);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertAdminUser(request);
    const { id } = await params;
    const userId = Number(id);

    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Valid user ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };

    if (body.user_type !== undefined) {
      const nextType = String(body.user_type || '').trim();
      if (!allowedUserTypes.has(nextType)) {
        return NextResponse.json({ error: 'Invalid user type' }, { status: 400 });
      }
      updatePayload.user_type = nextType;
    }

    if (body.verification_status !== undefined) {
      const nextVerification = String(body.verification_status || '').trim();
      if (!allowedVerificationStatuses.has(nextVerification)) {
        return NextResponse.json({ error: 'Invalid verification status' }, { status: 400 });
      }
      updatePayload.verification_status = nextVerification;
    }

    if (Object.keys(updatePayload).length === 1) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
    }

    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('id, name, email, user_type, verification_status, city, state_province, profile_image, created_at, updated_at')
      .eq('id', userId)
      .single();

    if (fetchError) throw fetchError;

    const { data, error } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', userId)
      .select('id, name, email, user_type, verification_status, city, state_province, profile_image, created_at, updated_at')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data, previous: existingUser });
  } catch (error: any) {
    console.error('Admin user update error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}