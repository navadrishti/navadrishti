import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/db';
import { buildNgoLocationDisplay, isPlatformUserSession } from '@/lib/auth';
import { assertUserType, getAuthUserFromRequest, findAuthUser } from '@/lib/server-auth';
import {
  buildNgoPayoutStatusResponse,
  buildPayoutProfileUpdate,
  getNgoPayoutLinkStatus,
  onboardNgoRazorpayLinkedAccount,
  parseNgoPayoutAccountFromProfile,
  refreshNgoRazorpayLinkStatus,
  sanitizePayoutAccountInput,
  validateNgoPayoutAccount,
  type NgoPayoutAccount,
} from '@/lib/razorpay-route';
import { parseJsonObject } from '@/lib/utils';
import type { TablesUpdate } from '@/lib/database.types';

const SERVER_OWNED_PROFILE_KEYS = [
  'ca_badge_number',
  'ca_verified_at',
  'ca_verified_by',
  'allotted_compliance_tags',
  'reverification_pending',
  'verification_documents',
  'document_expiries',
  'payout_account',
  'payout_details_on_file',
  'payout_listing',
  'payout_listings',
  'payout_listing_activated_at',
  'payout_listing_activation_source',
  'razorpay_account_id',
  'razorpay_linked_account_id',
  'razorpay_route_account_id',
  'razorpay_route_product_id',
  'razorpay_link_status',
  'razorpay_link_error',
  'razorpay_link_updated_at',
];

// Validation schema for PUT request (authenticated users updating their own profile)
const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters').optional(),
  profileImageUrl: z.string().url().optional(),
  city: z.string().optional(),
  state_province: z.string().optional(),
  pincode: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  bio: z.string().optional(),
  location: z.string().optional(),
  timezone: z.string().optional(),
  skills: z.string().optional(),
  interests: z.string().optional(),
  ngo_volunteer_capacity: z.union([z.number().int(), z.string()]).optional()
});

async function loadPayoutUser(userId: number) {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, phone, city, state_province, pincode, profile_data, user_type')
    .eq('id', userId)
    .in('user_type', ['ngo', 'individual', 'company'])
    .maybeSingle();

  if (error || !data) {
    throw new Error('Profile not found.');
  }

  return data;
}

function buildPayoutStatusMessage(
  user: { id: number; name?: string | null; user_type?: string | null },
  response: ReturnType<typeof buildNgoPayoutStatusResponse>
) {
  if (response.routeReady) {
    return Promise.resolve(null);
  }

  if (user.user_type === 'ngo') {
    return Promise.resolve('Connect account to receive donations and list capabilities');
  }

  if (user.user_type === 'individual') {
    return Promise.resolve(
      response.hasPayoutDetails
        ? 'Connect account to list capabilities and receive payouts'
        : 'Save bank details, then connect Razorpay to list capabilities and receive payouts'
    );
  }

  return Promise.resolve(
    response.hasPayoutDetails
      ? 'Connect account to list capabilities and receive merchant payouts'
      : 'Save bank details, then connect Razorpay to list capabilities and receive merchant payouts'
  );
}

export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get('scope') !== 'payout') {
      return NextResponse.json({ error: 'Unsupported profile scope' }, { status: 400 });
    }

    const authUser = getAuthUserFromRequest(request);
    assertUserType(authUser, ['ngo', 'individual', 'company']);

    const user = await loadPayoutUser(authUser.id);
    const response = buildNgoPayoutStatusResponse(user);
    response.canConnect = Boolean(response.hasPayoutDetails);
    response.payoutStatusMessage = await buildPayoutStatusMessage(user, response);

    return NextResponse.json({ success: true, ...response });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load payout account.';
    const status = message.includes('Authentication') || message.includes('permissions') ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
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
    const currentProfile = parseJsonObject(user.profile_data);
    const action = String(body?.action || '').trim();

    if (action === 'save') {
      const existingPayout = parseNgoPayoutAccountFromProfile(currentProfile);
      const payoutAccount = sanitizePayoutAccountInput(body?.payoutAccount as Partial<NgoPayoutAccount>);

      if (
        (!payoutAccount.account_number || payoutAccount.account_number.includes('*')) &&
        existingPayout?.account_number
      ) {
        payoutAccount.account_number = existingPayout.account_number;
      }

      const validationError = validateNgoPayoutAccount(payoutAccount);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }

      const profilePatch = buildPayoutProfileUpdate({
        payoutAccount,
        currentProfile,
      });

      const nextProfile = {
        ...currentProfile,
        ...profilePatch,
      };

      const { error } = await supabase
        .from('users')
        .update({
          profile_data: nextProfile,
          updated_at: new Date().toISOString(),
        })
        .eq('id', authUser.id);

      if (error) {
        throw new Error('Failed to save payout account details.');
      }

      const savedResponse = buildNgoPayoutStatusResponse({
        id: authUser.id,
        name: user.name,
        profile_data: nextProfile,
      });
      savedResponse.canConnect = Boolean(savedResponse.hasPayoutDetails);
      savedResponse.payoutStatusMessage = await buildPayoutStatusMessage(user, savedResponse);

      return NextResponse.json({
        success: true,
        message: profilePatch.razorpay_link_status === 'needs_reconnect'
          ? 'Payout bank details updated. Reconnect your Razorpay payout account to apply the new bank information.'
          : 'Payout bank details saved.',
        ...savedResponse,
      });
    }

    if (action === 'connect') {
      connectAttempt = true;
      const payoutAccount = parseNgoPayoutAccountFromProfile(currentProfile);

      if (!payoutAccount) {
        return NextResponse.json(
          { error: 'Add and save payout bank details before connecting Razorpay.' },
          { status: 400 }
        );
      }

      const validationError = validateNgoPayoutAccount(payoutAccount);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }

      const existingLinkedAccountId = String(currentProfile.razorpay_linked_account_id || '').trim() || null;
      const existingProductId = String(currentProfile.razorpay_route_product_id || '').trim() || null;
      const linkStatus = getNgoPayoutLinkStatus(currentProfile);

      if (linkStatus === 'active' && existingLinkedAccountId && existingProductId) {
        const refreshed = await refreshNgoRazorpayLinkStatus({
          linkedAccountId: existingLinkedAccountId,
          productId: existingProductId,
        });

        const refreshedProfile = {
          ...currentProfile,
          razorpay_link_status: refreshed.status,
          razorpay_link_updated_at: new Date().toISOString(),
          razorpay_link_error: undefined,
        };

        await supabase
          .from('users')
          .update({
            profile_data: refreshedProfile,
            updated_at: new Date().toISOString(),
          })
          .eq('id', authUser.id);

        return NextResponse.json({
          success: true,
          message: refreshed.message,
          ...buildNgoPayoutStatusResponse({
            id: authUser.id,
            name: user.name,
            profile_data: refreshedProfile,
          }),
        });
      }

      const onboarding = await onboardNgoRazorpayLinkedAccount({
        userId: user.id,
        email: user.email,
        phone: user.phone,
        ngoName: String(
          currentProfile.ngo_name ||
            currentProfile.company_name ||
            user.name ||
            payoutAccount.account_holder_name
        ),
        city: user.city,
        state: user.state_province,
        pincode: user.pincode,
        payoutAccount,
        existingLinkedAccountId,
        existingProductId,
      });

      const nextProfile = {
        ...currentProfile,
        razorpay_linked_account_id: onboarding.linkedAccountId,
        razorpay_route_product_id: onboarding.productId || undefined,
        razorpay_link_status: onboarding.status,
        razorpay_link_error: onboarding.error || undefined,
        razorpay_link_updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('users')
        .update({
          profile_data: nextProfile,
          updated_at: new Date().toISOString(),
        })
        .eq('id', authUser.id);

      if (error) {
        throw new Error('Connected to Razorpay, but failed to save linked account details.');
      }

      return NextResponse.json({
        success: true,
        message: onboarding.message,
        ...buildNgoPayoutStatusResponse({
          id: authUser.id,
          name: user.name,
          profile_data: nextProfile,
        }),
      });
    }

    return NextResponse.json({ error: 'Unsupported payout action' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update payout account.';
    const status = message.includes('Authentication') || message.includes('permissions') ? 401 : 400;

    try {
      if (connectAttempt) {
        const authUser = getAuthUserFromRequest(request);
        const user = await loadPayoutUser(authUser.id);
        const currentProfile = parseJsonObject(user.profile_data);
        await supabase
          .from('users')
          .update({
            profile_data: {
              ...currentProfile,
              razorpay_link_status: 'failed',
              razorpay_link_error: message,
              razorpay_link_updated_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', authUser.id);
      }
    } catch {
      // Ignore secondary persistence errors.
    }

    return NextResponse.json({ error: message }, { status });
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
    const {
      name,
      email,
      profileImageUrl, 
      city, 
      state_province, 
      pincode, 
      country, 
      phone, 
      bio,
      location,
      timezone,
      ngo_volunteer_capacity,
      profile_data
    } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (profileImageUrl !== undefined) updateData.profile_image = profileImageUrl;
    const coverImageUrl = body.coverImageUrl;
    if (city !== undefined) updateData.city = city;
    if (state_province !== undefined) updateData.state_province = state_province;
    if (pincode !== undefined) updateData.pincode = pincode;
    if (country !== undefined) updateData.country = country;
    if (phone !== undefined) updateData.phone = phone;
    if (location !== undefined) updateData.location = location;
    if (timezone !== undefined) updateData.timezone = timezone;

    if (ngo_volunteer_capacity !== undefined && ngo_volunteer_capacity !== null) {
      const raw = ngo_volunteer_capacity;
      const parsed =
        typeof raw === 'number'
          ? Math.trunc(raw)
          : String(raw).match(/\d+/)
            ? Number(String(raw).match(/\d+/)![0])
            : null;
      if (parsed !== null) {
        updateData.ngo_volunteer_capacity = parsed;
      }
    }

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

    if (email !== undefined && String(email).trim().toLowerCase() !== String(currentUser?.email || '').trim().toLowerCase()) {
      updateData.email_verified = false;
      updateData.email_verified_at = null;
    }
    if (phone !== undefined && String(phone).replace(/\s+/g, '') !== String(currentUser?.phone || '').replace(/\s+/g, '')) {
      updateData.phone_verified = false;
      updateData.phone_verified_at = null;
    }

    if (profile_data && typeof profile_data === 'object') {
      const currentProfileData = parseJsonObject(currentUser?.profile_data);
      const incomingProfileData = { ...profile_data };
      for (const key of SERVER_OWNED_PROFILE_KEYS) delete incomingProfileData[key];
      if (currentUser?.user_type === 'ngo') {
        delete incomingProfileData.past_projects;
      }
      const newProfileData = { ...currentProfileData, ...incomingProfileData };
      if (bio !== undefined) {
        newProfileData.bio = bio;
      }
      updateData.profile_data = newProfileData;
    } else if (bio !== undefined) {
      const currentProfileData = parseJsonObject(currentUser?.profile_data);
      updateData.profile_data = { ...currentProfileData, bio };
    }

    if (coverImageUrl !== undefined) {
      const currentProfileData = updateData.profile_data || parseJsonObject(currentUser?.profile_data);
      updateData.profile_data = {
        ...currentProfileData,
        cover_image: typeof coverImageUrl === 'string' ? coverImageUrl.trim() : '',
      };
    }

    if (
      (currentUser?.user_type === 'ngo' || currentUser?.user_type === 'company') &&
      location === undefined &&
      (city !== undefined ||
        state_province !== undefined ||
        pincode !== undefined ||
        country !== undefined ||
        (profile_data &&
          typeof profile_data === 'object' &&
          ((profile_data.ngo_headquarters && typeof profile_data.ngo_headquarters === 'object') ||
            (profile_data.company_headquarters && typeof profile_data.company_headquarters === 'object'))))
    ) {
      const mergedProfile = updateData.profile_data || parseJsonObject(currentUser?.profile_data);
      const headquartersKey = currentUser?.user_type === 'company' ? 'company_headquarters' : 'ngo_headquarters';
      const headquarters =
        mergedProfile[headquartersKey] && typeof mergedProfile[headquartersKey] === 'object'
          ? (mergedProfile[headquartersKey] as Record<string, unknown>)
          : {};

      updateData.location = buildNgoLocationDisplay({
        address_line: String(headquarters.address_line || ''),
        city: String(city ?? currentUser?.city ?? ''),
        state: String(state_province ?? currentUser?.state_province ?? ''),
        pincode: String(pincode ?? currentUser?.pincode ?? ''),
        country: String(country ?? currentUser?.country ?? 'India'),
      });
    }

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
      .select();

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
    
    const { ngo_volunteer_capacity: rawCapacity, ...updateData } = validationResult.data;
    const capacityDigits = rawCapacity == null ? null : String(rawCapacity).match(/\d+/);
    const ngoVolunteerCapacity =
      typeof rawCapacity === 'number' ? Math.trunc(rawCapacity) : capacityDigits ? Number(capacityDigits[0]) : undefined;

    const cleanUpdateData: Partial<typeof updateData> & { ngo_volunteer_capacity?: number; updated_at?: string } =
      Object.fromEntries(
        Object.entries({ ...updateData, ngo_volunteer_capacity: ngoVolunteerCapacity }).filter(([_, value]) => value !== undefined)
      );
    
    if (Object.keys(cleanUpdateData).length === 0) {
      return NextResponse.json(
        { error: 'No data provided to update' },
        { status: 400 }
      );
    }

    cleanUpdateData.updated_at = new Date().toISOString();

    const { data: currentUser, error: fetchError } = await supabase
      .from('users')
      .select('phone, profile_data')
      .eq('id', userId)
      .single();

    if (fetchError || !currentUser) {
      return NextResponse.json(
        { error: 'Failed to access user data' },
        { status: 500 }
      );
    }

    const { skills, interests, bio, profileImageUrl, ...directUserFields } = cleanUpdateData;
    
    const updatedProfileData = parseJsonObject(currentUser.profile_data);
    
    // Only update profile_data fields that were provided
    if (skills !== undefined) updatedProfileData.skills = skills;
    if (interests !== undefined) updatedProfileData.interests = interests;
    if (bio !== undefined) updatedProfileData.bio = bio;
    
    const finalUpdateData: TablesUpdate<'users'> = {
      ...directUserFields,
      profile_data: updatedProfileData,
      updated_at: new Date().toISOString()
    };
    if (profileImageUrl !== undefined) finalUpdateData.profile_image = profileImageUrl;
    if (
      directUserFields.phone !== undefined &&
      String(directUserFields.phone).replace(/\s+/g, '') !== String(currentUser.phone || '').replace(/\s+/g, '')
    ) {
      finalUpdateData.phone_verified = false;
      finalUpdateData.phone_verified_at = null;
    }

    const { data, error } = await supabase
      .from('users')
      .update(finalUpdateData)
      .eq('id', userId)
      .select('id, email, name, user_type, profile_image, city, state_province, pincode, country, phone, profile_data, location, timezone');

    if (error) {
      console.error('Error updating profile:', error);
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const user = data[0];
    const profileData = parseJsonObject(user.profile_data);
    
    const formattedUser = {
      ...user,
      skills: profileData.skills || '',
      interests: profileData.interests || ''
    };

    return NextResponse.json({ 
      success: true, 
      message: 'Profile updated successfully',
      user: formattedUser
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