import Razorpay from 'razorpay';
import { PHONE_VERIFICATION_ENABLED } from '@/lib/auth';
import { supabase } from '@/lib/db';
import { getErrorMessage, parseJsonObject, validateCapturedPaymentAmounts } from '@/lib/utils';
import { createPlatformPricedOrder } from './orders';

export const NGO_NETWORK_SOURCE = 'ngo_network';
/** Source tag of the legacy auto-generated payment channels. */
export const NGO_NETWORK_GENERAL_SOURCE = 'ngo_network_general';
export const NGO_NETWORK_MAX_CONTRIBUTION_INR = 10_000_000;

type ProviderNotes = Record<string, string | number | null>;

export function isGeneralNgoNetworkNeed(requirements: Record<string, unknown>): boolean {
  return (
    requirements?.ngo_network_general === true ||
    requirements?.source === NGO_NETWORK_GENERAL_SOURCE
  );
}

/** Auto-generated "General support" rows that should never appear as NGO needs. */
export function isHiddenNgoNetworkPaymentChannel(input: {
  title?: unknown;
  requirements?: unknown;
  project_context?: unknown;
}): boolean {
  const requirements = parseJsonObject(input.requirements);
  if (isGeneralNgoNetworkNeed(requirements)) return true;

  const title = String(input.title || '').trim();
  if (/^General support\s-/i.test(title)) return true;

  const projectContext = parseJsonObject(input.project_context);
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

      await supabase.from('service_request_applications').delete().eq('service_request_id', id);
      await supabase.from('service_request_contributions').delete().eq('service_request_id', id);

      const { error: deleteError } = await supabase.from('service_requests').delete().eq('id', id);
      if (deleteError) throw deleteError;

      deleted += 1;
    } catch (err) {
      errors.push({ id, error: getErrorMessage(err) || 'Delete failed' });
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
      application_id: null,
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

  const providerNotes: ProviderNotes = providerOrder.notes || providerPayment.notes || {};
  const amountCheck = validateCapturedPaymentAmounts({
    orderNotes: providerNotes,
    orderAmountPaise: providerOrder.amount,
    paidInr,
  });
  if (!amountCheck.ok) {
    throw new Error(amountCheck.error);
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
  const { data: updatedOrder } = await supabase
    .from('razorpay_payment_orders')
    .update({ order_status: 'paid', updated_at: nowIso })
    .eq('razorpay_order_id', params.razorpay_order_id)
    .select('id')
    .maybeSingle();

  const orderRow = updatedOrder ?? (
    await supabase
      .from('razorpay_payment_orders')
      .upsert(
        {
          service_request_id: null,
          application_id: null,
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
      )
      .select('id')
      .maybeSingle()
  ).data;

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
