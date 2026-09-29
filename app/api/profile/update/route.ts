import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { isPlatformUserSession } from '@/lib/auth';
import { assertUserType, authErrorResponse, getAuthUserFromRequest, findAuthUser } from '@/lib/server-auth';
import {
  buildPayoutStatus,
  connectPayoutAccount,
  loadPayoutUser,
  markPayoutConnectFailed,
  savePayoutAccount,
} from '@/lib/profile-update/payout';
import { buildProfileUpdate } from '@/lib/profile-update/profile-fields';
import { validateNameAndEmail } from '@/lib/profile-update/identity';
import {
  normalizeProfileForm,
  PROFILE_RESPONSE_COLUMNS,
  saveProfileForm,
  updateProfileSchema,
} from '@/lib/profile-update/profile-form';

export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get('scope') !== 'payout') {
      return NextResponse.json({ error: 'Unsupported profile scope' }, { status: 400 });
    }

    const authUser = getAuthUserFromRequest(request);
    assertUserType(authUser, ['ngo', 'individual', 'company']);

    const user = await loadPayoutUser(authUser.id);
    const response = await buildPayoutStatus(user);

    return NextResponse.json({ success: true, ...response });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    const message = error instanceof Error ? error.message : 'Failed to load payout account.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  let connectAttempt = false;

  try {
    const authUser = getAuthUserFromRequest(request);
    assertUserType(authUser, ['ngo', 'individual', 'company']);

    const body = await request.json();
    if (body?.scope !== 'payout') {
      return NextResponse.json({ error: 'Unsupported profile scope' }, { status: 400 });
    }

    const user = await loadPayoutUser(authUser.id);
    const action = String(body?.action || '').trim();

    if (action === 'save') {
      return await savePayoutAccount(user, body?.payoutAccount);
    }

    if (action === 'connect') {
      connectAttempt = true;
      return await connectPayoutAccount(user);
    }

    return NextResponse.json({ error: 'Unsupported payout action' }, { status: 400 });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    const message = error instanceof Error ? error.message : 'Failed to update payout account.';

    try {
      if (connectAttempt) {
        await markPayoutConnectFailed(getAuthUserFromRequest(request).id, message);
      }
    } catch {
      // Ignore secondary persistence errors.
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = findAuthUser(request, { allowCookie: true });
    if (!isPlatformUserSession(authUser)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const userId = authUser.id;

    const body = await request.json();

    const { data: currentUser, error: fetchError } = await supabase
      .from('users')
      .select('email, phone, profile_data, user_type, city, state_province, pincode, country')
      .eq('id', userId)
      .single();

    if (fetchError) {
      console.error('Error fetching current user data:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch current user data' },
        { status: 500 }
      );
    }

    const identity = await validateNameAndEmail(body, userId, currentUser.email);
    if (!identity.ok) {
      return NextResponse.json({ error: identity.error }, { status: identity.status });
    }

    const updateData = buildProfileUpdate({ ...body, name: identity.name, email: identity.email }, currentUser);

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No data provided to update' },
        { status: 400 }
      );
    }

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select(PROFILE_RESPONSE_COLUMNS);

    if (error) {
      console.error('Error updating profile:', error);
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Profile updated successfully',
      user: data[0]
    });

  } catch (error) {
    console.error('Error in profile update API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT method for authenticated users updating their own profile
export async function PUT(request: NextRequest) {
  try {
    const payload = findAuthUser(request);
    if (!payload) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = payload.id;
    
    const body = await request.json();
    
    const validationResult = updateProfileSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error('Validation failed:', validationResult.error.errors);
      return NextResponse.json({ 
        error: validationResult.error.errors[0].message,
        details: validationResult.error.errors
      }, { status: 400 });
    }
    
    const cleanUpdateData = normalizeProfileForm(validationResult.data);
    
    if (Object.keys(cleanUpdateData).length === 0) {
      return NextResponse.json(
        { error: 'No data provided to update' },
        { status: 400 }
      );
    }

    const result = await saveProfileForm(userId, cleanUpdateData);

    if (result.status === 'fetch_failed') {
      return NextResponse.json(
        { error: 'Failed to access user data' },
        { status: 500 }
      );
    }

    if (result.status === 'update_failed') {
      console.error('Error updating profile:', result.error);
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    if (result.status === 'not_found') {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Profile updated successfully',
      user: result.user
    });

  } catch (error) {
    console.error('Error in profile update API (PUT):', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
