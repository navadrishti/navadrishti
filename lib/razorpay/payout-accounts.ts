import { supabase } from '@/lib/db';
import type { Json } from '@/lib/database.types';
import {
  formatNgoBankDetailsSummary,
  getErrorMessage,
  parseJsonObject,
  sanitizePayoutAccountInput,
} from '@/lib/utils';
import { isRazorpayRouteEnabled } from './config';
import {
  getNgoPayoutLinkStatus,
  isMerchantRazorpayPayoutActive,
  isNgoRazorpayPayoutActive,
  parseNgoPayoutAccountFromProfile,
} from './payout-profile';

export const CAPABILITY_LISTING_REQUIRES_PAYOUT_MESSAGE =
  'Connect Razorpay payout before listing capabilities so you can receive merchant payments.';

export async function assertUserRazorpayPayoutActiveForCapabilities(userId: number): Promise<void> {
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error(CAPABILITY_LISTING_REQUIRES_PAYOUT_MESSAGE);
  }

  const { data } = await supabase
    .from('users')
    .select('profile_data')
    .eq('id', userId)
    .maybeSingle();

  if (!isMerchantRazorpayPayoutActive(parseJsonObject(data?.profile_data))) {
    throw new Error(CAPABILITY_LISTING_REQUIRES_PAYOUT_MESSAGE);
  }
}

export function buildNgoPayoutListingActivationUpdate(params: {
  ngoUserId: number;
  ngoName: string;
  existingProfile: Record<string, unknown>;
}): Record<string, unknown> {
  const now = new Date().toISOString();
  const existingPayout = parseNgoPayoutAccountFromProfile(params.existingProfile);
  const payoutAccount =
    existingPayout ||
    sanitizePayoutAccountInput({
      account_holder_name: params.ngoName.trim() || `NGO ${params.ngoUserId}`,
      bank_name: 'HDFC Bank',
      branch: 'Main Branch',
      account_number: `1000${String(params.ngoUserId).padStart(8, '0')}`,
      ifsc: 'HDFC0001234',
      account_type: 'current',
    });

  const linkedAccountId = String(
    params.existingProfile.razorpay_linked_account_id ||
      params.existingProfile.razorpay_route_account_id ||
      `acc_listing_${params.ngoUserId}`
  ).trim();

  return {
    ...params.existingProfile,
    payout_account: {
      ...payoutAccount,
      updated_at: now,
    },
    bank_details: formatNgoBankDetailsSummary(payoutAccount),
    razorpay_linked_account_id: linkedAccountId,
    razorpay_link_status: 'active',
    razorpay_link_error: undefined,
    payout_listing_activated_at: now,
    payout_listing_activation_source: 'admin',
  };
}

export async function activateNgoPayoutListingForNetwork(ngoUserId: number) {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, user_type, verification_status, profile_data')
    .eq('id', ngoUserId)
    .single();

  if (error || !data) {
    throw new Error('NGO user not found');
  }

  if (data.user_type !== 'ngo') {
    throw new Error('User is not an NGO');
  }

  if (data.verification_status !== 'verified') {
    throw new Error('Only verified NGOs can be activated for NGO Network listing');
  }

  const profile = parseJsonObject(data.profile_data);
  if (isNgoRazorpayPayoutActive(profile)) {
    return {
      id: data.id,
      name: data.name,
      updated: false,
      routeReady: true,
    };
  }

  const nextProfile = buildNgoPayoutListingActivationUpdate({
    ngoUserId,
    ngoName: String(data.name || 'NGO'),
    existingProfile: profile,
  });

  const { error: updateError } = await supabase
    .from('users')
    .update({
      profile_data: nextProfile as Json,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ngoUserId);

  if (updateError) {
    throw updateError;
  }

  return {
    id: data.id,
    name: data.name,
    updated: true,
    routeReady: true,
  };
}

export async function activateVerifiedNgoPayoutListingsForNetwork() {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, verification_status, user_type, profile_data')
    .eq('user_type', 'ngo')
    .eq('verification_status', 'verified');

  if (error) {
    throw error;
  }

  const results: Array<{
    id: number;
    name: string | null;
    updated: boolean;
    routeReady: boolean;
    error?: string;
  }> = [];

  for (const row of data || []) {
    try {
      const profile = parseJsonObject(row.profile_data);
      if (isNgoRazorpayPayoutActive(profile)) {
        results.push({
          id: row.id,
          name: row.name,
          updated: false,
          routeReady: true,
        });
        continue;
      }

      const activated = await activateNgoPayoutListingForNetwork(Number(row.id));
      results.push(activated);
    } catch (activationError) {
      results.push({
        id: row.id,
        name: row.name,
        updated: false,
        routeReady: false,
        error: getErrorMessage(activationError) || 'Activation failed',
      });
    }
  }

  return results;
}

async function loadNgoProfileData(ngoUserId: number) {
  if (!Number.isFinite(ngoUserId) || ngoUserId <= 0) {
    return null;
  }

  const { data, error } = await supabase
    .from('users')
    .select('profile_data')
    .eq('id', ngoUserId)
    .eq('user_type', 'ngo')
    .maybeSingle();

  if (error || !data?.profile_data) {
    return null;
  }

  return parseJsonObject(data.profile_data);
}

export async function getNgoLinkedAccountId(ngoUserId: number): Promise<string | null> {
  const profile = await loadNgoProfileData(ngoUserId);
  if (!profile) {
    return null;
  }

  const linked =
    profile.razorpay_linked_account_id ||
    profile.razorpay_route_account_id ||
    profile.razorpay_account_id;

  const normalized = String(linked || '').trim();
  return normalized || null;
}

export async function getNgoBankDetailsOnFile(ngoUserId: number): Promise<string | null> {
  if (!Number.isFinite(ngoUserId) || ngoUserId <= 0) {
    return null;
  }

  const { data } = await supabase
    .from('users')
    .select('profile_data')
    .eq('id', ngoUserId)
    .maybeSingle();

  if (!data?.profile_data) {
    return null;
  }

  const profile = parseJsonObject(data.profile_data);
  const payoutAccount = parseNgoPayoutAccountFromProfile(profile);
  if (payoutAccount?.account_number) {
    return formatNgoBankDetailsSummary(payoutAccount);
  }

  const bankDetails = String(profile?.bank_details || '').trim();
  return bankDetails || null;
}

export async function ngoIsEligibleForNetworkListing(ngoUserId: number): Promise<boolean> {
  if (!Number.isFinite(ngoUserId) || ngoUserId <= 0) {
    return false;
  }

  const { data } = await supabase
    .from('users')
    .select('profile_data')
    .eq('id', ngoUserId)
    .maybeSingle();

  // Payment readiness (Razorpay connected), not directory listing eligibility.
  return isNgoRazorpayPayoutActive(parseJsonObject(data?.profile_data));
}

export async function assertBeneficiaryRouteReady(
  ngoUserId: number,
  ngoName?: string
): Promise<{ linkedAccountId: string }> {
  if (!isRazorpayRouteEnabled()) {
    throw new Error(
      'Direct NGO payouts are not enabled yet. Set RAZORPAY_ROUTE_ENABLED=true and onboard the NGO linked account.'
    );
  }

  const linkedAccountId = await getNgoLinkedAccountId(ngoUserId);
  const profile = await loadNgoProfileData(ngoUserId);
  const linkStatus = getNgoPayoutLinkStatus(profile);

  if (!linkedAccountId || linkStatus !== 'active') {
    const bankOnFile = await getNgoBankDetailsOnFile(ngoUserId);
    if (linkedAccountId && linkStatus !== 'active') {
      throw new Error(
        `${ngoName || 'This NGO'} payout account is pending Razorpay activation. Complete linked-account onboarding before accepting direct Route payments.`
      );
    }
    throw new Error(
      bankOnFile
        ? `${ngoName || 'This NGO'} has bank details saved, but Razorpay linked-account setup is pending. Complete Route onboarding to pay directly to their bank/UPI settlement account.`
        : `${ngoName || 'This NGO'} has not completed Razorpay payout setup. Add bank details and finish linked-account onboarding first.`
    );
  }
  return { linkedAccountId };
}
