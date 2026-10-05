import {
  sanitizePayoutAccountInput,
  type NgoPayoutAccount,
  type NgoRazorpayLinkStatus,
} from '@/lib/utils';

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
  userType?: string | null;
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

export function razorpayBusinessType(userType?: string | null): string {
  if (userType === 'company') return 'private_limited';
  if (userType === 'individual') return 'individual';
  return 'ngo';
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
      reference_id: `nd_ngo_${params.userId}`.slice(0, 20),
      legal_business_name: ngoName,
      customer_facing_business_name: ngoName,
      business_type: razorpayBusinessType(params.userType),
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
