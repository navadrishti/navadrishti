import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
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

export async function loadPayoutUser(userId: number) {
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

type PayoutUser = Awaited<ReturnType<typeof loadPayoutUser>>;

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

export async function buildPayoutStatus(user: PayoutUser, profileData: unknown = user.profile_data) {
  const response = buildNgoPayoutStatusResponse({ id: user.id, name: user.name, profile_data: profileData });
  response.canConnect = Boolean(response.hasPayoutDetails);
  response.payoutStatusMessage = await buildPayoutStatusMessage(user, response);
  return response;
}

export async function savePayoutAccount(user: PayoutUser, payoutInput: unknown) {
  const currentProfile = parseJsonObject(user.profile_data);
  const existingPayout = parseNgoPayoutAccountFromProfile(currentProfile);
  const payoutAccount = sanitizePayoutAccountInput(payoutInput as Partial<NgoPayoutAccount>);

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
    .eq('id', user.id);

  if (error) {
    throw new Error('Failed to save payout account details.');
  }

  const savedResponse = await buildPayoutStatus(user, nextProfile);

  return NextResponse.json({
    success: true,
    message: profilePatch.razorpay_link_status === 'needs_reconnect'
      ? 'Payout bank details updated. Reconnect your Razorpay payout account to apply the new bank information.'
      : 'Payout bank details saved.',
    ...savedResponse,
  });
}

export async function connectPayoutAccount(user: PayoutUser) {
  const currentProfile = parseJsonObject(user.profile_data);
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
      .eq('id', user.id);

    return NextResponse.json({
      success: true,
      message: refreshed.message,
      ...buildNgoPayoutStatusResponse({
        id: user.id,
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
    userType: user.user_type,
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
    .eq('id', user.id);

  if (error) {
    throw new Error('Connected to Razorpay, but failed to save linked account details.');
  }

  return NextResponse.json({
    success: true,
    message: onboarding.message,
    ...buildNgoPayoutStatusResponse({
      id: user.id,
      name: user.name,
      profile_data: nextProfile,
    }),
  });
}

export async function markPayoutConnectFailed(userId: number, message: string) {
  const user = await loadPayoutUser(userId);
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
    .eq('id', userId);
}
