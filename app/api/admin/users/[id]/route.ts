import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { assertAdminUser } from '@/lib/server-auth';
import {
  getAdminModeration,
  type AdminModerationState,
} from '@/lib/auth';

const allowedUserTypes = new Set(['individual', 'ngo', 'company', 'admin']);
const allowedVerificationStatuses = new Set(['unverified', 'pending', 'verified', 'suspended']);
const USER_SELECT =
  'id, name, email, phone, user_type, verification_status, account_status, locked_until, city, state_province, profile_image, profile_data, created_at, updated_at';

function asProfile(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function withModeration(
  profileData: unknown,
  patch: AdminModerationState | null
): Record<string, unknown> {
  const next = { ...asProfile(profileData) };
  if (!patch) {
    delete next.admin_moderation;
    return next;
  }
  next.admin_moderation = {
    ...getAdminModeration(profileData),
    ...patch,
  };
  return next;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertAdminUser(request);
    const { id } = await params;
    const userId = Number(id);

    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Valid user ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const action = String(body?.action || '').trim().toLowerCase();

    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select(USER_SELECT)
      .eq('id', userId)
      .single();

    if (fetchError) throw fetchError;
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (action === 'suspend') {
      const days = Math.min(90, Math.max(1, Number(body?.days || 0)));
      if (!Number.isFinite(days) || days < 1) {
        return NextResponse.json({ error: 'Suspend days must be between 1 and 90' }, { status: 400 });
      }
      const until = new Date();
      until.setUTCDate(until.getUTCDate() + days);
      const reason = String(body?.reason || '').trim() || null;
      const updatePayload: Record<string, unknown> = {
        locked_until: until.toISOString(),
        account_status: 'suspended',
        profile_data: withModeration(existingUser.profile_data, {
          permanently_banned: false,
          suspended_at: new Date().toISOString(),
          suspended_until: until.toISOString(),
          suspend_days: days,
          reason,
        }),
        updated_at: new Date().toISOString(),
      };

      let { data, error } = await supabase
        .from('users')
        .update(updatePayload)
        .eq('id', userId)
        .select(USER_SELECT)
        .single();

      if (error && String(error.message || '').toLowerCase().includes('account_status')) {
        delete updatePayload.account_status;
        const retry = await supabase
          .from('users')
          .update(updatePayload)
          .eq('id', userId)
          .select(USER_SELECT)
          .single();
        data = retry.data;
        error = retry.error;
      }
      if (error) throw error;

      return NextResponse.json({
        success: true,
        message: `Account suspended for ${days} day(s).`,
        data,
      });
    }

    if (action === 'unsuspend') {
      const moderation = getAdminModeration(existingUser.profile_data);
      const updatePayload: Record<string, unknown> = {
        locked_until: null,
        account_status: 'active',
        profile_data: withModeration(existingUser.profile_data, {
          ...moderation,
          permanently_banned: moderation.permanently_banned === true,
          suspended_at: null,
          suspended_until: null,
          suspend_days: null,
          reason: moderation.permanently_banned ? moderation.reason || null : null,
        }),
        updated_at: new Date().toISOString(),
      };

      let { data, error } = await supabase
        .from('users')
        .update(updatePayload)
        .eq('id', userId)
        .select(USER_SELECT)
        .single();

      if (error && String(error.message || '').toLowerCase().includes('account_status')) {
        delete updatePayload.account_status;
        const retry = await supabase
          .from('users')
          .update(updatePayload)
          .eq('id', userId)
          .select(USER_SELECT)
          .single();
        data = retry.data;
        error = retry.error;
      }
      if (error) throw error;

      return NextResponse.json({ success: true, message: 'Account suspension cleared.', data });
    }

    if (action === 'ban') {
      const reason = String(body?.reason || '').trim() || null;
      const updatePayload: Record<string, unknown> = {
        account_status: 'banned',
        locked_until: null,
        profile_data: withModeration(existingUser.profile_data, {
          permanently_banned: true,
          banned_at: new Date().toISOString(),
          banned_email: existingUser.email,
          banned_phone: existingUser.phone || null,
          suspended_at: null,
          suspended_until: null,
          suspend_days: null,
          reason,
        }),
        updated_at: new Date().toISOString(),
      };

      let { data, error } = await supabase
        .from('users')
        .update(updatePayload)
        .eq('id', userId)
        .select(USER_SELECT)
        .single();

      if (error && String(error.message || '').toLowerCase().includes('account_status')) {
        delete updatePayload.account_status;
        const retry = await supabase
          .from('users')
          .update(updatePayload)
          .eq('id', userId)
          .select(USER_SELECT)
          .single();
        data = retry.data;
        error = retry.error;
      }
      if (error) throw error;

      return NextResponse.json({
        success: true,
        message: 'Account permanently banned. The same email and phone cannot register again.',
        data,
      });
    }

    if (action === 'unban') {
      const updatePayload: Record<string, unknown> = {
        account_status: 'active',
        locked_until: null,
        profile_data: withModeration(existingUser.profile_data, null),
        updated_at: new Date().toISOString(),
      };

      let { data, error } = await supabase
        .from('users')
        .update(updatePayload)
        .eq('id', userId)
        .select(USER_SELECT)
        .single();

      if (error && String(error.message || '').toLowerCase().includes('account_status')) {
        delete updatePayload.account_status;
        const retry = await supabase
          .from('users')
          .update(updatePayload)
          .eq('id', userId)
          .select(USER_SELECT)
          .single();
        data = retry.data;
        error = retry.error;
      }
      if (error) throw error;

      return NextResponse.json({ success: true, message: 'Permanent ban cleared.', data });
    }

    const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };
    let nextVerification: string | null = null;

    if (body.user_type !== undefined) {
      const nextType = String(body.user_type || '').trim();
      if (!allowedUserTypes.has(nextType)) {
        return NextResponse.json({ error: 'Invalid user type' }, { status: 400 });
      }
      updatePayload.user_type = nextType;
    }

    if (body.verification_status !== undefined) {
      nextVerification = String(body.verification_status || '').trim();
      if (!allowedVerificationStatuses.has(nextVerification)) {
        return NextResponse.json({ error: 'Invalid verification status' }, { status: 400 });
      }
      updatePayload.verification_status = nextVerification;

      // When the admin explicitly downgrades to unverified, clear CA badge and
      // reverification flag from profile_data so the user sees the correct state.
      if (nextVerification === 'unverified') {
        const currentProfile = asProfile(existingUser.profile_data);
        const cleaned = { ...currentProfile };
        delete cleaned.ca_badge_number;
        delete cleaned.reverification_pending;
        delete cleaned.allotted_compliance_tags;
        updatePayload.profile_data = cleaned;
      }
    }

    if (Object.keys(updatePayload).length === 1) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', userId)
      .select(USER_SELECT)
      .single();

    if (error) throw error;

    // Sync the type-specific verification table so downstream CA-queue checks
    // and resolveEffectiveVerificationStatus fall back correctly.
    if (nextVerification !== null) {
      const userType = String((updatePayload.user_type || existingUser.user_type) || '').toLowerCase();
      const verificationTable =
        userType === 'individual'
          ? 'individual_verifications'
          : userType === 'company'
            ? 'company_verifications'
            : userType === 'ngo'
              ? 'ngo_verifications'
              : null;

      if (verificationTable) {
        await supabase
          .from(verificationTable)
          .update({ verification_status: nextVerification, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
      }
    }

    return NextResponse.json({ success: true, data, previous: existingUser });
  } catch (error: any) {
    console.error('Admin user update error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertAdminUser(request);
    const { id } = await params;
    const userId = Number(id);

    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Valid user ID is required' }, { status: 400 });
    }

    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('id, email, phone, user_type')
      .eq('id', userId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (String(existingUser.user_type || '').toLowerCase() === 'admin') {
      return NextResponse.json({ error: 'Admin accounts cannot be deleted from this panel' }, { status: 403 });
    }

    const { error } = await supabase.from('users').delete().eq('id', userId);
    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: 'Account deleted.',
      deleted: existingUser,
    });
  } catch (error: any) {
    console.error('Admin user delete error:', error);
    const message = String(error?.message || 'Internal server error');
    const status = message.toLowerCase().includes('foreign key') || message.includes('23503') ? 409 : 500;
    return NextResponse.json(
      {
        error:
          status === 409
            ? 'Account could not be deleted because related records still reference it. Ban the account instead.'
            : message,
      },
      { status }
    );
  }
}
