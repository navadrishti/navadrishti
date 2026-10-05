import { supabase } from '@/lib/db';
import { formatNgoBankDetailsSummary, parseJsonObject } from '@/lib/utils';
import {
  getNgoLinkedAccountIdFromProfile,
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

async function loadPayeeProfileData(userId: number) {
  if (!Number.isFinite(userId) || userId <= 0) {
    return null;
  }

  const { data, error } = await supabase
    .from('users')
    .select('profile_data')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data?.profile_data) {
    return null;
  }

  return parseJsonObject(data.profile_data);
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

export class PayeeNotConnectedError extends Error {}

/** Every payee must have an active Razorpay linked account before anyone can pay them. */
export async function assertBeneficiaryRouteReady(
  payeeUserId: number,
  payeeName?: string
): Promise<{ linkedAccountId: string }> {
  const label = payeeName || 'This recipient';
  const profile = await loadPayeeProfileData(payeeUserId);
  const linkedAccountId = getNgoLinkedAccountIdFromProfile(profile);
  const linkStatus = getNgoPayoutLinkStatus(profile);

  if (!linkedAccountId || linkStatus !== 'active') {
    if (linkedAccountId) {
      throw new PayeeNotConnectedError(
        `${label}'s Razorpay payout account is still pending activation, so payments to them are paused until Razorpay activates it.`
      );
    }
    const bankOnFile = parseNgoPayoutAccountFromProfile(profile) || String(profile?.bank_details || '').trim();
    throw new PayeeNotConnectedError(
      bankOnFile
        ? `${label} has saved bank details but has not finished connecting Razorpay, so they cannot receive payments yet.`
        : `${label} has not connected a Razorpay payout account, so they cannot receive payments yet.`
    );
  }
  return { linkedAccountId };
}
