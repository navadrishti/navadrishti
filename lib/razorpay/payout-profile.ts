import {
  formatNgoBankDetailsSummary,
  maskAccountNumber,
  parseJsonObject,
  sanitizePayoutAccountInput,
  validateNgoPayoutAccount,
  type NgoPayoutAccount,
  type NgoRazorpayLinkStatus,
} from '@/lib/utils';

type ProfileRecord = Record<string, unknown> | null | undefined;

export function parseNgoPayoutAccountFromProfile(profile: ProfileRecord): NgoPayoutAccount | null {
  const payout = profile?.payout_account;
  if (payout && typeof payout === 'object') {
    const sanitized = sanitizePayoutAccountInput(payout as Partial<NgoPayoutAccount>);
    return validateNgoPayoutAccount(sanitized) === null ? sanitized : null;
  }
  return null;
}

export function parseNgoPayoutAccountDraftFromProfile(profile: ProfileRecord): NgoPayoutAccount | null {
  const payout = profile?.payout_account;
  if (payout && typeof payout === 'object') {
    return sanitizePayoutAccountInput(payout as Partial<NgoPayoutAccount>);
  }
  return null;
}

export function hasNgoPayoutDetailsOnFile(profile: ProfileRecord): boolean {
  return Boolean(parseNgoPayoutAccountFromProfile(profile));
}

export function getNgoLinkedAccountIdFromProfile(profile: ProfileRecord): string | null {
  const linkedAccountId = String(
    profile?.razorpay_linked_account_id ||
      profile?.razorpay_route_account_id ||
      profile?.razorpay_account_id ||
      ''
  ).trim();
  return linkedAccountId || null;
}

/** Razorpay Route linked account must be active before the NGO can receive donations/payouts. */
export function isNgoRazorpayPayoutActive(profile: ProfileRecord): boolean {
  const linkedAccountId = getNgoLinkedAccountIdFromProfile(profile);
  const linkStatus = getNgoPayoutLinkStatus(profile);
  return Boolean(linkedAccountId && linkStatus === 'active');
}

/** Any merchant account (NGO / company / individual) with an active Razorpay linked account. */
export function isMerchantRazorpayPayoutActive(profile: ProfileRecord): boolean {
  return isNgoRazorpayPayoutActive(profile);
}

export function getNgoPayoutLinkStatus(profile: ProfileRecord): NgoRazorpayLinkStatus {
  const status = String(profile?.razorpay_link_status || '').trim() as NgoRazorpayLinkStatus;
  if (
    status === 'pending' ||
    status === 'active' ||
    status === 'failed' ||
    status === 'needs_reconnect'
  ) {
    return status;
  }

  const linkedAccountId = String(
    profile?.razorpay_linked_account_id ||
      profile?.razorpay_route_account_id ||
      profile?.razorpay_account_id ||
      ''
  ).trim();

  return linkedAccountId ? 'pending' : 'not_started';
}

export function maskPayoutAccountForClient(account: NgoPayoutAccount | null): NgoPayoutAccount | null {
  if (!account) return null;
  return {
    ...account,
    account_number: maskAccountNumber(account.account_number),
  };
}

function payoutAccountsEqual(
  left: NgoPayoutAccount | null | undefined,
  right: NgoPayoutAccount | null | undefined
): boolean {
  if (!left || !right) return false;
  const a = sanitizePayoutAccountInput(left);
  const b = sanitizePayoutAccountInput(right);
  return (
    a.account_holder_name === b.account_holder_name &&
    a.bank_name === b.bank_name &&
    (a.branch || '') === (b.branch || '') &&
    a.account_number === b.account_number &&
    a.ifsc === b.ifsc &&
    a.account_type === b.account_type
  );
}

export function buildPayoutProfileUpdate(params: {
  payoutAccount: NgoPayoutAccount;
  currentProfile: Record<string, unknown>;
  resetLinkedAccount?: boolean;
}): Record<string, unknown> {
  const now = new Date().toISOString();
  const previous = parseNgoPayoutAccountFromProfile(params.currentProfile);
  const bankChanged = previous ? !payoutAccountsEqual(previous, params.payoutAccount) : true;
  const linkedAccountId = String(params.currentProfile?.razorpay_linked_account_id || '').trim();

  const next: Record<string, unknown> = {
    payout_account: {
      ...params.payoutAccount,
      updated_at: now,
    },
    bank_details: formatNgoBankDetailsSummary(params.payoutAccount),
  };

  if (params.resetLinkedAccount || (bankChanged && linkedAccountId)) {
    next.razorpay_link_status = linkedAccountId ? 'needs_reconnect' : 'not_started';
    next.razorpay_link_error = undefined;
    if (params.resetLinkedAccount) {
      next.razorpay_linked_account_id = undefined;
      next.razorpay_route_product_id = undefined;
    }
  }

  return next;
}

export function buildNgoPayoutStatusResponse(user: {
  id: number;
  name?: string | null;
  profile_data?: unknown;
}) {
  const profile = parseJsonObject(user.profile_data);
  const payoutAccount = parseNgoPayoutAccountFromProfile(profile);
  const payoutDraft = parseNgoPayoutAccountDraftFromProfile(profile);
  const linkStatus = getNgoPayoutLinkStatus(profile);
  const linkedAccountId = String(profile.razorpay_linked_account_id || '').trim() || null;

  return {
    payoutAccount: maskPayoutAccountForClient(payoutAccount || payoutDraft),
    canConnect: Boolean(payoutAccount),
    bankDetailsSummary: String(profile.bank_details || '').trim() || null,
    linkStatus,
    linkedAccountId,
    linkError: String(profile.razorpay_link_error || '').trim() || null,
    linkUpdatedAt: String(profile.razorpay_link_updated_at || '').trim() || null,
    hasPayoutDetails: hasNgoPayoutDetailsOnFile(profile),
    acceptsPayments: isNgoRazorpayPayoutActive(profile),
    networkListingEligible: true,
    routeReady: isNgoRazorpayPayoutActive(profile),
    payoutStatusMessage: null as string | null,
  };
}
