import Razorpay from 'razorpay';
import { PHONE_VERIFICATION_ENABLED } from '@/lib/auth';
import { supabase } from '@/lib/db';
import {
  buildPricingOrderNotes,
  buildPricingResponse,
  calculatePlatformCheckoutPricing,
  formatNgoBankDetailsSummary,
  maskAccountNumber,
  sanitizePayoutAccountInput,
  validateNgoPayoutAccount,
  type NgoPayoutAccount,
  type NgoRazorpayLinkStatus,
  type PlatformCheckoutPricing,
} from '@/lib/utils';

export type RoutePaymentKind =
  | 'ngo_network'
  | 'financial_need'
  | 'csr_milestone'
  | 'service_offer'
  | 'engagement_settlement'
  | 'company_ca'
  | 'csr_capability_rental';

export function parseProfileData(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

export function parseNgoPayoutAccountFromProfile(
  profile: Record<string, unknown> | null | undefined
): NgoPayoutAccount | null {
  const payout = profile?.payout_account;
  if (payout && typeof payout === 'object') {
    const sanitized = sanitizePayoutAccountInput(payout as Partial<NgoPayoutAccount>);
    return validateNgoPayoutAccount(sanitized) === null ? sanitized : null;
  }
  return null;
}

export function parseNgoPayoutAccountDraftFromProfile(
  profile: Record<string, unknown> | null | undefined
): NgoPayoutAccount | null {
  const payout = profile?.payout_account;
  if (payout && typeof payout === 'object') {
    return sanitizePayoutAccountInput(payout as Partial<NgoPayoutAccount>);
  }
  return null;
}

export function hasNgoPayoutDetailsOnFile(profile: Record<string, unknown> | null | undefined): boolean {
  return Boolean(parseNgoPayoutAccountFromProfile(profile));
}

export function getNgoLinkedAccountIdFromProfile(
  profile: Record<string, unknown> | null | undefined
): string | null {
  const linkedAccountId = String(
    profile?.razorpay_linked_account_id ||
      profile?.razorpay_route_account_id ||
      profile?.razorpay_account_id ||
      ''
  ).trim();
  return linkedAccountId || null;
}

/** Razorpay Route linked account must be active before the NGO can receive donations/payouts. */
export function isNgoRazorpayPayoutActive(
  profile: Record<string, unknown> | null | undefined
): boolean {
  const linkedAccountId = getNgoLinkedAccountIdFromProfile(profile);
  const linkStatus = getNgoPayoutLinkStatus(profile);
  return Boolean(linkedAccountId && linkStatus === 'active');
}

/** Any merchant account (NGO / company / individual) with an active Razorpay linked account. */
export function isMerchantRazorpayPayoutActive(
  profile: Record<string, unknown> | null | undefined
): boolean {
  return isNgoRazorpayPayoutActive(profile);
}

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

  if (!isMerchantRazorpayPayoutActive(parseProfileData(data?.profile_data))) {
    throw new Error(CAPABILITY_LISTING_REQUIRES_PAYOUT_MESSAGE);
  }
}

/**
 * @deprecated Prefer verification checks for listing and `isNgoRazorpayPayoutActive` for payments.
 * Kept as an alias of payout-active for payment-gate call sites.
 */
export function isNgoEligibleForNetworkListing(
  profile: Record<string, unknown> | null | undefined
): boolean {
  return isNgoRazorpayPayoutActive(profile);
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

  const profile = parseProfileData(data.profile_data);
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
      profile_data: nextProfile,
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
      const profile = parseProfileData(row.profile_data);
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
    } catch (activationError: any) {
      results.push({
        id: row.id,
        name: row.name,
        updated: false,
        routeReady: false,
        error: activationError?.message || 'Activation failed',
      });
    }
  }

  return results;
}

export function getNgoPayoutLinkStatus(
  profile: Record<string, unknown> | null | undefined
): NgoRazorpayLinkStatus {
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

export function isRazorpayRouteEnabled(): boolean {
  return String(process.env.RAZORPAY_ROUTE_ENABLED || '').toLowerCase() === 'true';
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

  return parseProfileData(data.profile_data);
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

  const profile = parseProfileData(data.profile_data);
  const payoutAccount = parseNgoPayoutAccountFromProfile(profile);
  if (payoutAccount?.account_number) {
    return formatNgoBankDetailsSummary(payoutAccount);
  }

  const bankDetails = String(profile?.bank_details || '').trim();
  return bankDetails || null;
}

export async function ngoHasPayoutBankDetails(ngoUserId: number): Promise<boolean> {
  if (!Number.isFinite(ngoUserId) || ngoUserId <= 0) {
    return false;
  }

  const { data } = await supabase
    .from('users')
    .select('profile_data')
    .eq('id', ngoUserId)
    .maybeSingle();

  return hasNgoPayoutDetailsOnFile(parseProfileData(data?.profile_data));
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
  return isNgoRazorpayPayoutActive(parseProfileData(data?.profile_data));
}

export async function getBeneficiaryPayoutStatus(ngoUserId: number, ngoName?: string) {
  const profile = await loadNgoProfileData(ngoUserId);
  const linkedAccountId = profile
    ? String(
        profile.razorpay_linked_account_id ||
          profile.razorpay_route_account_id ||
          profile.razorpay_account_id ||
          ''
      ).trim() || null
    : null;
  const linkStatus = getNgoPayoutLinkStatus(profile);
  const bankDetailsOnFile = profile ? hasNgoPayoutDetailsOnFile(profile) : false;

  if (linkedAccountId && linkStatus === 'active') {
    return {
      ready: true,
      linkedAccountId,
      bankDetailsOnFile,
      message: `${ngoName || 'NGO'} is ready for direct Razorpay Route payouts.`,
    };
  }

  if (linkedAccountId) {
    return {
      ready: false,
      linkedAccountId,
      bankDetailsOnFile,
      message: `${ngoName || 'NGO'} payout account is submitted to Razorpay and pending activation.`,
    };
  }

  return {
    ready: false,
    linkedAccountId: null as string | null,
    bankDetailsOnFile,
    message: bankDetailsOnFile
      ? `${ngoName || 'NGO'} has bank details on file, but Razorpay linked-account onboarding is still required for automatic bank/UPI settlement.`
      : `${ngoName || 'NGO'} must add bank details and complete Razorpay linked-account onboarding.`,
  };
}
export function shouldHoldTransferForKind(kind: RoutePaymentKind): boolean {
  return kind === 'financial_need';
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

type CreateRoutedOrderParams = {
  razorpay: Razorpay;
  pricing: PlatformCheckoutPricing;
  receipt: string;
  notes: Record<string, unknown>;
  beneficiaryLinkedAccountId: string;
  paymentKind: RoutePaymentKind;
  onHold?: boolean;
};

export type PlatformRazorpayOrderSnapshot = {
  id: string;
  receipt: string;
  currency: string;
};

export function toRazorpayOrderSnapshot(order: unknown): PlatformRazorpayOrderSnapshot {
  const value = order as Record<string, unknown>;
  return {
    id: String(value?.id ?? ''),
    receipt: String(value?.receipt ?? ''),
    currency: String(value?.currency ?? 'INR'),
  };
}

export async function createRoutedRazorpayOrder(params: CreateRoutedOrderParams): Promise<PlatformRazorpayOrderSnapshot> {
  const holdTransfer = params.onHold ?? shouldHoldTransferForKind(params.paymentKind);

  const orderPayload: Record<string, unknown> = {
    amount: params.pricing.totalChargePaise,
    currency: 'INR',
    receipt: params.receipt,
    notes: params.notes,
    transfers: [
      {
        account: params.beneficiaryLinkedAccountId,
        amount: params.pricing.transferAmountPaise,
        currency: 'INR',
        on_hold: holdTransfer ? 1 : 0,
        notes: {
          payment_kind: params.paymentKind,
          base_amount_inr: String(params.pricing.baseAmountInr),
        },
      },
    ],
  };

  const order = await params.razorpay.orders.create(orderPayload as any);
  return toRazorpayOrderSnapshot(order);
}

export async function createStandardRazorpayOrder(params: {
  razorpay: Razorpay;
  pricing: PlatformCheckoutPricing;
  receipt: string;
  notes: Record<string, unknown>;
}): Promise<PlatformRazorpayOrderSnapshot> {
  const order = await params.razorpay.orders.create({
    amount: params.pricing.totalChargePaise,
    currency: 'INR',
    receipt: params.receipt,
    notes: params.notes as any,
  });
  return toRazorpayOrderSnapshot(order);
}

type CreatePlatformPricedOrderParams = {
  razorpay: Razorpay;
  baseAmountInr: number;
  receipt: string;
  notes?: Record<string, unknown>;
  paymentKind: RoutePaymentKind;
  beneficiaryUserId?: number;
  beneficiaryName?: string;
  onHold?: boolean;
  requireRouteWhenEnabled?: boolean;
};

export async function createPlatformPricedOrder(params: CreatePlatformPricedOrderParams) {
  const pricing = calculatePlatformCheckoutPricing(params.baseAmountInr, {
    paymentKind: params.paymentKind,
  });
  const orderNotes = buildPricingOrderNotes(pricing, {
    ...(params.notes || {}),
    payment_kind: params.paymentKind,
    transfer_on_hold: params.onHold ?? shouldHoldTransferForKind(params.paymentKind),
    ...(params.beneficiaryUserId ? { beneficiary_user_id: String(params.beneficiaryUserId) } : {}),
  });

  const requireRoute = params.requireRouteWhenEnabled ?? true;
  if (requireRoute && params.beneficiaryUserId && isRazorpayRouteEnabled()) {
    const { linkedAccountId } = await assertBeneficiaryRouteReady(
      params.beneficiaryUserId,
      params.beneficiaryName
    );
    const order = await createRoutedRazorpayOrder({
      razorpay: params.razorpay,
      pricing,
      receipt: params.receipt,
      notes: orderNotes,
      beneficiaryLinkedAccountId: linkedAccountId,
      paymentKind: params.paymentKind,
      onHold: params.onHold,
    });
    return { order, pricing, orderNotes };
  }

  const order = await createStandardRazorpayOrder({
    razorpay: params.razorpay,
    pricing,
    receipt: params.receipt,
    notes: orderNotes,
  });
  return { order, pricing, orderNotes };
}

export async function releaseHeldTransfersForPayment(params: {
  razorpay: Razorpay;
  razorpayPaymentId: string;
}): Promise<void> {
  if (!isRazorpayRouteEnabled()) {
    return;
  }

  try {
    const payment = await params.razorpay.payments.fetch(params.razorpayPaymentId);
    const transferId = (payment as any)?.transfer_id;
    if (!transferId) {
      return;
    }

    await (params.razorpay as any).transfers.edit(transferId, { on_hold: false });
  } catch (error) {
    console.error('Failed to release held Razorpay transfer:', error);
  }
}

type RazorpayApiError = {
  error?: {
    description?: string;
    reason?: string;
    code?: string;
  };
};

export type NgoLinkedAccountOnboardingInput = {
  userId: number;
  email: string;
  phone?: string | null;
  ngoName: string;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  payoutAccount: NgoPayoutAccount;
  existingLinkedAccountId?: string | null;
  existingProductId?: string | null;
};

export type NgoLinkedAccountOnboardingResult = {
  linkedAccountId: string;
  productId: string | null;
  status: NgoRazorpayLinkStatus;
  activationStatus?: string;
  message: string;
  error?: string;
};

function getRazorpayAuthHeader(): string {
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials are not configured.');
  }
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

async function razorpayLinkedAccountRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.razorpay.com${path}`, {
    ...init,
    headers: {
      Authorization: getRazorpayAuthHeader(),
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as T & RazorpayApiError;

  if (!response.ok) {
    const message =
      payload?.error?.description ||
      payload?.error?.reason ||
      payload?.error?.code ||
      `Razorpay request failed (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

function normalizePhoneForRazorpay(phone?: string | null): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return '9999999999';
}

function normalizeStateForRazorpay(state?: string | null): string {
  const value = String(state || 'Karnataka').trim();
  return value.length >= 2 ? value.toUpperCase() : 'KARNATAKA';
}

function normalizeStreet(city?: string | null): string {
  const value = String(city || 'India').trim();
  return value.length >= 3 ? value : 'Registered address';
}

function deriveActivationStatus(product: Record<string, unknown> | null | undefined): string {
  return String(product?.activation_status || product?.status || '').trim();
}

function mapActivationToLinkStatus(activationStatus: string): NgoRazorpayLinkStatus {
  const normalized = activationStatus.toLowerCase();
  if (normalized === 'activated' || normalized === 'active') {
    return 'active';
  }
  if (normalized === 'needs_clarification' || normalized === 'under_review' || normalized === 'requested') {
    return 'pending';
  }
  if (normalized === 'rejected' || normalized === 'failed') {
    return 'failed';
  }
  return 'pending';
}

async function createLinkedAccount(params: NgoLinkedAccountOnboardingInput): Promise<string> {
  const payout = sanitizePayoutAccountInput(params.payoutAccount);
  const ngoName = String(params.ngoName || payout.account_holder_name).trim().slice(0, 200);
  const contactName = payout.account_holder_name.slice(0, 255);

  const account = await razorpayLinkedAccountRequest<{ id: string }>('/v2/accounts', {
    method: 'POST',
    body: JSON.stringify({
      email: params.email,
      phone: normalizePhoneForRazorpay(params.phone),
      type: 'route',
      reference_id: `navadrishti_ngo_${params.userId}`.slice(0, 20),
      legal_business_name: ngoName,
      customer_facing_business_name: ngoName,
      business_type: 'ngo',
      contact_name: contactName,
      profile: {
        category: 'others',
        subcategory: 'others',
        addresses: {
          registered: {
            street1: normalizeStreet(params.city),
            city: String(params.city || 'Bengaluru').trim() || 'Bengaluru',
            state: normalizeStateForRazorpay(params.state),
            postal_code: String(params.pincode || '560001').replace(/\D/g, '').slice(0, 6) || '560001',
            country: 'IN',
          },
        },
      },
    }),
  });

  return account.id;
}

async function createStakeholder(accountId: string, params: NgoLinkedAccountOnboardingInput): Promise<void> {
  const payout = sanitizePayoutAccountInput(params.payoutAccount);

  await razorpayLinkedAccountRequest(`/v2/accounts/${accountId}/stakeholders`, {
    method: 'POST',
    body: JSON.stringify({
      name: payout.account_holder_name,
      email: params.email,
      addresses: {
        residential: {
          street: normalizeStreet(params.city),
          city: String(params.city || 'Bengaluru').trim() || 'Bengaluru',
          state: normalizeStateForRazorpay(params.state),
          postal_code: String(params.pincode || '560001').replace(/\D/g, '').slice(0, 6) || '560001',
          country: 'IN',
        },
      },
    }),
  });
}

async function requestRouteProduct(accountId: string): Promise<string> {
  const product = await razorpayLinkedAccountRequest<{ id: string }>(`/v2/accounts/${accountId}/products`, {
    method: 'POST',
    body: JSON.stringify({
      product_name: 'route',
      tnc_accepted: true,
    }),
  });

  return product.id;
}

async function updateRouteProductSettlement(
  accountId: string,
  productId: string,
  payoutAccount: NgoPayoutAccount
): Promise<Record<string, unknown>> {
  const payout = sanitizePayoutAccountInput(payoutAccount);

  return razorpayLinkedAccountRequest<Record<string, unknown>>(
    `/v2/accounts/${accountId}/products/${productId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        settlements: {
          account_number: payout.account_number,
          ifsc_code: payout.ifsc,
          beneficiary_name: payout.account_holder_name,
        },
        tnc_accepted: true,
      }),
    }
  );
}

async function fetchRouteProduct(accountId: string, productId: string): Promise<Record<string, unknown>> {
  return razorpayLinkedAccountRequest<Record<string, unknown>>(
    `/v2/accounts/${accountId}/products/${productId}`
  );
}

export async function onboardNgoRazorpayLinkedAccount(
  params: NgoLinkedAccountOnboardingInput
): Promise<NgoLinkedAccountOnboardingResult> {
  let linkedAccountId = String(params.existingLinkedAccountId || '').trim();
  let productId = String(params.existingProductId || '').trim() || null;

  if (!linkedAccountId) {
    linkedAccountId = await createLinkedAccount(params);
    await createStakeholder(linkedAccountId, params);
    productId = await requestRouteProduct(linkedAccountId);
  } else if (!productId) {
    productId = await requestRouteProduct(linkedAccountId);
  }

  const product = await updateRouteProductSettlement(linkedAccountId, productId!, params.payoutAccount);
  const activationStatus = deriveActivationStatus(product);
  const status = mapActivationToLinkStatus(activationStatus);

  return {
    linkedAccountId,
    productId,
    status,
    activationStatus,
    message:
      status === 'active'
        ? 'Payout account connected. Donations can settle directly to your bank account via Razorpay Route.'
        : 'Payout account submitted to Razorpay. Activation may take a short review period before transfers are enabled.',
  };
}

export async function refreshNgoRazorpayLinkStatus(params: {
  linkedAccountId: string;
  productId: string;
}): Promise<Pick<NgoLinkedAccountOnboardingResult, 'status' | 'activationStatus' | 'message'>> {
  const product = await fetchRouteProduct(params.linkedAccountId, params.productId);
  const activationStatus = deriveActivationStatus(product);
  const status = mapActivationToLinkStatus(activationStatus);

  return {
    status,
    activationStatus,
    message:
      status === 'active'
        ? 'Payout account is active for Razorpay Route transfers.'
        : 'Payout account onboarding is still pending Razorpay activation.',
  };
}

export function buildNgoPayoutStatusResponse(user: {
  id: number;
  name?: string | null;
  profile_data?: unknown;
}) {
  const profile = parseProfileData(user.profile_data);
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
    /** True when Razorpay is connected and the account can receive Route payouts. */
    acceptsPayments: isNgoRazorpayPayoutActive(profile),
    networkListingEligible: true,
    routeReady: isNgoRazorpayPayoutActive(profile),
    payoutStatusMessage: null as string | null,
  };
}

export const NGO_NETWORK_SOURCE = 'ngo_network';
/** @deprecated Legacy auto-generated payment channels only */
export const NGO_NETWORK_GENERAL_SOURCE = 'ngo_network_general';
export const NGO_NETWORK_MAX_CONTRIBUTION_INR = 10_000_000;

export function parseServiceRequestRequirements(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function isGeneralNgoNetworkNeed(requirements: Record<string, any>): boolean {
  return (
    requirements?.ngo_network_general === true ||
    requirements?.source === NGO_NETWORK_GENERAL_SOURCE
  );
}

/** Legacy auto-generated "General support" rows that should never appear as NGO needs. */
export function isHiddenNgoNetworkPaymentChannel(input: {
  title?: unknown;
  requirements?: unknown;
  project_context?: unknown;
}): boolean {
  const requirements = parseServiceRequestRequirements(input.requirements);
  if (isGeneralNgoNetworkNeed(requirements)) return true;

  const title = String(input.title || '').trim();
  if (/^General support\s-/i.test(title)) return true;

  const projectContext = parseServiceRequestRequirements(input.project_context);
  return (
    projectContext?.source === NGO_NETWORK_GENERAL_SOURCE ||
    projectContext?.source === NGO_NETWORK_SOURCE
  );
}

export async function removeLegacyGeneralSupportRequests(): Promise<{
  deleted: number;
  ids: number[];
  errors: Array<{ id: number; error: string }>;
}> {
  const { data, error } = await supabase
    .from('service_requests')
    .select('id, title, requirements, project_context');

  if (error) throw error;

  const legacyIds = (data || [])
    .filter((row) => isHiddenNgoNetworkPaymentChannel(row))
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && id > 0);

  const errors: Array<{ id: number; error: string }> = [];
  let deleted = 0;

  for (const id of legacyIds) {
    try {
      await supabase
        .from('razorpay_payment_orders')
        .update({ service_request_id: null, updated_at: new Date().toISOString() })
        .eq('service_request_id', id);

      await supabase.from('service_volunteers').delete().eq('service_request_id', id);
      await supabase.from('service_request_contributions').delete().eq('service_request_id', id);

      const { error: deleteError } = await supabase.from('service_requests').delete().eq('id', id);
      if (deleteError) throw deleteError;

      deleted += 1;
    } catch (err: any) {
      errors.push({ id, error: err?.message || 'Delete failed' });
    }
  }

  return { deleted, ids: legacyIds, errors };
}

export function canContributeViaPlatform(userType: string | undefined | null): boolean {
  return userType === 'individual' || userType === 'company';
}

export async function isVerifiedNgoUser(ngoUserId: number): Promise<{ ok: boolean; name?: string }> {
  const { data, error } = await supabase
    .from('users')
    .select(`
      id,
      name,
      user_type,
      email_verified,
      phone_verified,
      ngo_verifications!inner(verification_status)
    `)
    .eq('id', ngoUserId)
    .eq('user_type', 'ngo')
    .maybeSingle();

  if (error || !data) return { ok: false };

  const verification = Array.isArray(data.ngo_verifications)
    ? data.ngo_verifications[0]
    : data.ngo_verifications;

  const verified =
    data.email_verified === true &&
    (!PHONE_VERIFICATION_ENABLED || data.phone_verified === true) &&
    verification?.verification_status === 'verified';

  return verified ? { ok: true, name: data.name || 'NGO' } : { ok: false };
}

function parseDonationAmountInr(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const text = String(value).trim();
  if (!text) return 0;
  const parsed = Number(text.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export async function createNgoNetworkDonationOrder(params: {
  razorpay: Razorpay;
  ngoUserId: number;
  ngoName: string;
  contributorId: number;
  contributorType: string;
  amountInr: number;
}) {
  const contributionInr = Math.min(
    Math.max(parseDonationAmountInr(params.amountInr), 1),
    NGO_NETWORK_MAX_CONTRIBUTION_INR
  );

  const { order, pricing, orderNotes } = await createPlatformPricedOrder({
    razorpay: params.razorpay,
    baseAmountInr: contributionInr,
    receipt: `nn_${params.ngoUserId}_${params.contributorId}_${Date.now()}`,
    paymentKind: 'ngo_network',
    beneficiaryUserId: params.ngoUserId,
    beneficiaryName: params.ngoName,
    notes: {
      source: NGO_NETWORK_SOURCE,
      ngo_user_id: String(params.ngoUserId),
      contributor_id: String(params.contributorId),
      contributor_type: params.contributorType,
    },
  });

  const nowIso = new Date().toISOString();
  await supabase.from('razorpay_payment_orders').upsert(
    {
      service_request_id: null,
      volunteer_assignment_id: null,
      contribution_id: null,
      payer_user_id: params.contributorId,
      ngo_user_id: params.ngoUserId,
      razorpay_order_id: String(order.id),
      receipt: String(order.receipt || `nn_${params.ngoUserId}`),
      amount_inr: Number(pricing.totalChargeInr.toFixed(2)),
      amount_paise: pricing.totalChargePaise,
      currency: String(order.currency || 'INR'),
      order_status: 'created',
      order_notes: orderNotes,
      updated_at: nowIso,
    },
    { onConflict: 'razorpay_order_id' }
  );

  return { order, pricing, contributionInr };
}

export async function verifyNgoNetworkDonation(params: {
  razorpay: Razorpay;
  keySecret: string;
  ngoUserId: number;
  contributorId: number;
  contributorName?: string | null;
  contributorType: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}) {
  const crypto = await import('crypto');
  const generatedSignature = crypto
    .createHmac('sha256', params.keySecret)
    .update(`${params.razorpay_order_id}|${params.razorpay_payment_id}`)
    .digest('hex');

  const expectedBuffer = Buffer.from(generatedSignature, 'utf8');
  const receivedBuffer = Buffer.from(String(params.razorpay_signature || ''), 'utf8');
  if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
    throw new Error('Invalid payment signature');
  }

  const [providerPayment, providerOrder] = await Promise.all([
    params.razorpay.payments.fetch(String(params.razorpay_payment_id)),
    params.razorpay.orders.fetch(String(params.razorpay_order_id)),
  ]);

  if (!providerPayment || providerPayment.id !== params.razorpay_payment_id) {
    throw new Error('Unable to fetch payment from provider');
  }

  if (providerPayment.order_id !== params.razorpay_order_id || providerOrder.id !== params.razorpay_order_id) {
    throw new Error('Order and payment mismatch');
  }

  const providerStatus = String(providerPayment.status || '').toLowerCase();
  if (providerStatus !== 'captured') {
    throw new Error(`Payment not captured yet (status: ${providerStatus || 'unknown'})`);
  }

  const providerCurrency = String(providerPayment.currency || '').toUpperCase();
  if (providerCurrency !== 'INR') {
    throw new Error('Only INR payments are supported');
  }

  const paidInr = Number((Number(providerPayment.amount || 0) / 100).toFixed(2));
  if (paidInr <= 0) {
    throw new Error('Invalid contribution amount');
  }

  const providerNotes = (providerOrder.notes || providerPayment.notes || {}) as Record<string, any>;
  const expectedTotalInr = parseDonationAmountInr(providerNotes?.total_charge_inr);
  if (expectedTotalInr > 0 && Math.abs(paidInr - expectedTotalInr) > 0.01) {
    throw new Error('Paid amount does not match checkout total');
  }

  const paymentKind = String(providerNotes?.payment_kind || '').toLowerCase();
  const source = String(providerNotes?.source || '').toLowerCase();
  if (paymentKind !== 'ngo_network' && source !== NGO_NETWORK_SOURCE) {
    throw new Error('Payment is not an NGO Network donation');
  }

  const notesNgoId = Number(providerNotes?.ngo_user_id || providerNotes?.beneficiary_user_id || 0);
  if (notesNgoId > 0 && notesNgoId !== params.ngoUserId) {
    throw new Error('Payment is linked to a different NGO');
  }

  const notesContributorId = Number(providerNotes?.contributor_id || 0);
  if (notesContributorId > 0 && notesContributorId !== params.contributorId) {
    throw new Error('Payment belongs to a different contributor');
  }

  const { data: existingNormalizedPayment } = await supabase
    .from('razorpay_payments')
    .select('id')
    .eq('razorpay_payment_id', String(params.razorpay_payment_id))
    .maybeSingle();

  if (existingNormalizedPayment?.id) {
    return { message: 'Payment already recorded', paidInr, replay: true };
  }

  const nowIso = new Date().toISOString();
  await supabase.from('razorpay_payment_orders').upsert(
    {
      service_request_id: null,
      volunteer_assignment_id: null,
      contribution_id: null,
      payer_user_id: params.contributorId,
      ngo_user_id: params.ngoUserId,
      razorpay_order_id: params.razorpay_order_id,
      receipt: String(providerOrder.receipt || `nn_${params.ngoUserId}`),
      amount_inr: Number(paidInr.toFixed(2)),
      amount_paise: Math.round(paidInr * 100),
      currency: 'INR',
      order_status: 'paid',
      order_notes: providerNotes,
      updated_at: nowIso,
    },
    { onConflict: 'razorpay_order_id' }
  );

  const { data: orderRow } = await supabase
    .from('razorpay_payment_orders')
    .select('id')
    .eq('razorpay_order_id', params.razorpay_order_id)
    .maybeSingle();

  if (orderRow?.id) {
    const { error: paymentInsertError } = await supabase.from('razorpay_payments').insert({
      order_id: orderRow.id,
      razorpay_order_id: params.razorpay_order_id,
      razorpay_payment_id: params.razorpay_payment_id,
      razorpay_signature: params.razorpay_signature,
      amount_inr: Number(paidInr.toFixed(2)),
      amount_paise: Math.round(paidInr * 100),
      currency: 'INR',
      payment_status: 'captured',
      payment_method: providerPayment.method || null,
      paid_at: new Date((providerPayment.created_at || 0) * 1000).toISOString(),
      provider_payload: {
        contributor_id: params.contributorId,
        contributor_name: params.contributorName || null,
        contributor_type: params.contributorType,
        ngo_user_id: params.ngoUserId,
        source: NGO_NETWORK_SOURCE,
        provider_payment_status: providerStatus,
        provider_order_status: String(providerOrder.status || '').toLowerCase(),
      },
      updated_at: nowIso,
    });

    if (paymentInsertError && paymentInsertError.code !== '23505') {
      throw paymentInsertError;
    }
  }

  return {
    message: 'Payment verified successfully',
    paidInr,
    replay: false,
  };
}

export type PaymentHistoryRole = 'sent' | 'received';

export type PaymentHistorySource =
  | 'ngo_network'
  | 'service_request'
  | 'service_offer'
  | 'engagement_settlement'
  | 'company_ca'
  | 'razorpay';

export type PaymentHistoryRecord = {
  id: string | number;
  razorpay_payment_id: string;
  razorpay_order_id: string | null;
  amount_inr: number;
  payment_status: string;
  payment_method: string | null;
  paid_at: string | null;
  order_status: string | null;
  service_request_id: number | null;
  service_request_title: string;
  source: PaymentHistorySource;
  source_label: string;
  counterparty_name: string;
  payer: { id: number | null; name: string; user_type: string | null };
  ngo: { id: number | null; name: string };
};

function parsePaymentJsonRecord(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function formatPaymentCounterpartyName(row: { name?: string | null; email?: string | null } | null | undefined) {
  return String(row?.name || row?.email || 'User').trim();
}

export function isCompanyCaOrder(order: { order_notes?: unknown; ngo_user_id?: number | null; payer_user_id?: number | null }) {
  const notes = parsePaymentJsonRecord(order.order_notes);
  return notes?.source === 'company_ca_payment';
}

export function resolvePaymentSource(
  orderNotes: Record<string, any>,
  requirements: Record<string, any>
): { source: PaymentHistorySource; source_label: string } {
  if (orderNotes?.source === 'company_ca_payment') {
    return { source: 'company_ca', source_label: 'Evidence verification' };
  }

  if (
    orderNotes?.target_type === 'csr_capability_rental' ||
    orderNotes?.payment_kind === 'csr_capability_rental'
  ) {
    return { source: 'service_offer', source_label: 'CSR capability rental' };
  }

  if (
    orderNotes?.target_type === 'service_offer' ||
    orderNotes?.service_offer_id ||
    orderNotes?.offer_id
  ) {
    return { source: 'service_offer', source_label: 'Capability offer' };
  }

  if (orderNotes?.settlement_scope === 'daily_rental' || orderNotes?.assignment_id) {
    return { source: 'engagement_settlement', source_label: 'Engagement settlement' };
  }

  if (
    orderNotes?.payment_kind === 'ngo_network' ||
    orderNotes?.source === NGO_NETWORK_SOURCE ||
    requirements?.source === 'ngo_network_general' ||
    requirements?.ngo_network_general ||
    orderNotes?.source === 'ngo_network_general'
  ) {
    return { source: 'ngo_network', source_label: 'NGO Network' };
  }

  if (orderNotes?.service_request_id || requirements?.request_type) {
    return { source: 'service_request', source_label: 'Financial need' };
  }

  return { source: 'razorpay', source_label: 'Razorpay payment' };
}

async function fetchMatchingPaymentOrders(userId: number, userType: string, role: PaymentHistoryRole) {
  const select =
    'id, service_request_id, payer_user_id, ngo_user_id, amount_inr, order_status, order_notes, updated_at, created_at, receipt';

  if (role === 'received') {
    const { data, error } = await supabase
      .from('razorpay_payment_orders')
      .select(select)
      .eq('ngo_user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(300);

    if (error) throw error;
    return (data || []).filter((row) => !isCompanyCaOrder(row));
  }

  const [{ data: payerOrders, error: payerError }, { data: caOrders, error: caError }] = await Promise.all([
    supabase
      .from('razorpay_payment_orders')
      .select(select)
      .eq('payer_user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(300),
    userType === 'company'
      ? supabase
          .from('razorpay_payment_orders')
          .select(select)
          .eq('ngo_user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(150)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (payerError) throw payerError;
  if (caError) throw caError;

  const merged = new Map<number, any>();
  for (const row of payerOrders || []) merged.set(Number(row.id), row);
  for (const row of caOrders || []) {
    if (isCompanyCaOrder(row)) merged.set(Number(row.id), row);
  }

  return Array.from(merged.values());
}

async function fetchLegacyPaymentHistory(
  userId: number,
  role: PaymentHistoryRole,
  existingPaymentIds: Set<string>
): Promise<PaymentHistoryRecord[]> {
  let requestQuery = supabase
    .from('service_requests')
    .select('id, title, requirements, ngo_id')
    .order('updated_at', { ascending: false })
    .limit(200);

  if (role === 'received') {
    requestQuery = requestQuery.eq('ngo_id', userId);
  }

  const { data: requestRows } = await requestQuery;
  const legacy: PaymentHistoryRecord[] = [];
  const ngoIds = [
    ...new Set((requestRows || []).map((row) => Number(row.ngo_id || 0)).filter((id) => id > 0)),
  ];
  const { data: ngoUsers } = ngoIds.length
    ? await supabase.from('users').select('id, name, email').in('id', ngoIds)
    : { data: [] };
  const ngoById = Object.fromEntries(((ngoUsers || []) as any[]).map((row) => [Number(row.id), row]));

  for (const requestRow of requestRows || []) {
    const requirements = parseServiceRequestRequirements(requestRow.requirements);
    const requestType = String(requirements?.request_type || '').toLowerCase();
    if (!requestType.includes('financial')) continue;

    const transactions = Array.isArray(requirements.financial_transactions)
      ? requirements.financial_transactions
      : [];

    for (const tx of transactions) {
      const paymentId = String(tx?.razorpay_payment_id || '').trim();
      if (!paymentId || existingPaymentIds.has(paymentId)) continue;

      const contributorId = Number(tx?.contributor_id || tx?.payer_user_id || 0);
      if (role === 'sent' && contributorId !== userId) continue;
      if (role === 'received' && Number(requestRow.ngo_id || 0) !== userId) continue;

      const ngoUser = ngoById[Number(requestRow.ngo_id || 0)];
      const ngoName = formatPaymentCounterpartyName(ngoUser);
      const contributorName = String(tx?.contributor_name || 'Contributor');
      const { source, source_label } = resolvePaymentSource({}, requirements);
      legacy.push({
        id: `legacy-${requestRow.id}-${paymentId}`,
        razorpay_payment_id: paymentId,
        razorpay_order_id: tx?.razorpay_order_id ? String(tx.razorpay_order_id) : null,
        amount_inr: Number(tx?.amount_inr || tx?.amount || 0),
        payment_status: String(tx?.refund_status || '').toLowerCase() === 'processed' ? 'refunded' : 'paid',
        payment_method: null,
        paid_at: tx?.paid_at || null,
        order_status: null,
        service_request_id: Number(requestRow.id),
        service_request_title: String(requestRow.title || 'Financial need'),
        source,
        source_label,
        counterparty_name: role === 'received' ? contributorName : ngoName,
        payer: {
          id: contributorId || null,
          name: contributorName,
          user_type: tx?.contributor_type || null,
        },
        ngo: {
          id: Number(requestRow.ngo_id || 0) || null,
          name: ngoName,
        },
      });
    }
  }

  return legacy;
}

export async function fetchUserPaymentHistory(options: {
  userId: number;
  userType: string;
  role: PaymentHistoryRole;
  limit?: number;
}): Promise<PaymentHistoryRecord[]> {
  const { userId, userType, role, limit = 100 } = options;
  const orders = await fetchMatchingPaymentOrders(userId, userType, role);
  const orderIds = orders.map((row) => Number(row.id)).filter((id) => id > 0);

  const { data: paymentRows, error: paymentError } = orderIds.length
    ? await supabase
        .from('razorpay_payments')
        .select(
          'id, order_id, razorpay_payment_id, razorpay_order_id, amount_inr, payment_status, payment_method, paid_at, created_at, provider_payload'
        )
        .in('order_id', orderIds)
        .order('paid_at', { ascending: false })
        .limit(Math.min(limit, 300))
    : { data: [], error: null };

  if (paymentError) throw paymentError;

  const orderById = Object.fromEntries(orders.map((row) => [Number(row.id), row]));
  const serviceRequestIds = [
    ...new Set(orders.map((row) => Number(row.service_request_id || 0)).filter((id) => id > 0)),
  ];
  const offerIds = [
    ...new Set(
      orders
        .map((row) => {
          const notes = parsePaymentJsonRecord(row.order_notes);
          return Number(notes?.service_offer_id || notes?.offer_id || 0);
        })
        .filter((id) => id > 0)
    ),
  ];
  const userIds = [
    ...new Set(
      orders.flatMap((row) => [Number(row.payer_user_id || 0), Number(row.ngo_user_id || 0)]).filter((id) => id > 0)
    ),
  ];

  const [requestResult, userResult, offerResult] = await Promise.all([
    serviceRequestIds.length
      ? supabase.from('service_requests').select('id, title, requirements').in('id', serviceRequestIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? supabase.from('users').select('id, name, email, user_type').in('id', userIds)
      : Promise.resolve({ data: [] }),
    offerIds.length
      ? supabase.from('service_offers').select('id, title, creator_id').in('id', offerIds)
      : Promise.resolve({ data: [] }),
  ]);

  const requestById = Object.fromEntries(((requestResult.data || []) as any[]).map((row) => [Number(row.id), row]));
  const userById = Object.fromEntries(((userResult.data || []) as any[]).map((row) => [Number(row.id), row]));
  const offerById = Object.fromEntries(((offerResult.data || []) as any[]).map((row) => [Number(row.id), row]));

  const payments: PaymentHistoryRecord[] = (paymentRows || []).map((payment: any) => {
    const order = orderById[Number(payment.order_id || 0)];
    const orderNotes = parsePaymentJsonRecord(order?.order_notes);
    const request = requestById[Number(order?.service_request_id || 0)];
    const requirements = parseServiceRequestRequirements(request?.requirements);
    const { source, source_label } = resolvePaymentSource(orderNotes, requirements);
    const offerId = Number(orderNotes?.service_offer_id || orderNotes?.offer_id || 0);
    const offer = offerById[offerId];
    const payer = userById[Number(order?.payer_user_id || 0)];
    const ngo = userById[Number(order?.ngo_user_id || 0)];

    let serviceRequestTitle = request?.title || offer?.title || 'Razorpay payment';
    if (source === 'company_ca') serviceRequestTitle = 'Evidence verification payment';
    if (source === 'engagement_settlement') serviceRequestTitle = request?.title || 'Engagement settlement';
    if (source === 'service_offer') serviceRequestTitle = offer?.title || request?.title || 'Capability offer payment';
    if (source === 'ngo_network') {
      serviceRequestTitle = role === 'received'
        ? `NGO Network donation from ${formatPaymentCounterpartyName(payer)}`
        : `NGO Network support for ${formatPaymentCounterpartyName(ngo)}`;
    }

    let counterpartyName =
      role === 'received' ? formatPaymentCounterpartyName(payer) : formatPaymentCounterpartyName(ngo);

    if (role === 'sent' && source === 'company_ca') {
      counterpartyName = 'Evidence verification';
    }

    if (role === 'received' && !order?.payer_user_id && source !== 'company_ca') {
      counterpartyName = String(payment?.provider_payload?.contributor_name || counterpartyName || 'Contributor');
    }

    return {
      id: payment.id,
      razorpay_payment_id: payment.razorpay_payment_id,
      razorpay_order_id: payment.razorpay_order_id,
      amount_inr: Number(payment.amount_inr || order?.amount_inr || 0),
      payment_status: payment.payment_status,
      payment_method: payment.payment_method,
      paid_at: payment.paid_at || order?.updated_at || payment.created_at,
      order_status: order?.order_status || null,
      service_request_id: order?.service_request_id ? Number(order.service_request_id) : null,
      service_request_title: serviceRequestTitle,
      source,
      source_label,
      counterparty_name: counterpartyName,
      payer: {
        id: order?.payer_user_id ? Number(order.payer_user_id) : null,
        name: formatPaymentCounterpartyName(payer),
        user_type: payer?.user_type || null,
      },
      ngo: {
        id: order?.ngo_user_id ? Number(order.ngo_user_id) : null,
        name: formatPaymentCounterpartyName(ngo),
      },
    };
  });

  const existingPaymentIds = new Set(payments.map((row) => row.razorpay_payment_id).filter(Boolean));
  const legacy = await fetchLegacyPaymentHistory(userId, role, existingPaymentIds);

  return [...payments, ...legacy]
    .sort((a, b) => {
      const aTime = a.paid_at ? new Date(a.paid_at).getTime() : 0;
      const bTime = b.paid_at ? new Date(b.paid_at).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, limit);
}

export {
  buildPricingOrderNotes,
  buildPricingResponse,
  calculatePlatformCheckoutPricing,
  formatInr,
  formatNgoBankDetailsSummary,
  getPlatformFeeMinInr,
  getPlatformFeePercent,
  getPlatformGstPercent,
  isNgoPayoutAccountComplete,
  maskAccountNumber,
  normalizeAccountNumber,
  normalizeIfsc,
  paymentKindRequiresPlatformGst,
  sanitizePayoutAccountInput,
  validateCapturedPaymentAmounts,
  validateNgoPayoutAccount,
  type NgoPayoutAccount,
  type NgoPayoutAccountType,
  type NgoRazorpayLinkStatus,
  type PlatformCheckoutPricing,
} from '@/lib/utils';
