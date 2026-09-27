import { supabase } from '@/lib/db';
import { parseJsonObject } from '@/lib/utils';
import { NGO_NETWORK_SOURCE } from './ngo-network';

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

function formatPaymentCounterpartyName(row: { name?: string | null; email?: string | null } | null | undefined) {
  return String(row?.name || row?.email || 'User').trim();
}

export function isCompanyCaOrder(order: { order_notes?: unknown; ngo_user_id?: number | null; payer_user_id?: number | null }) {
  const notes = parseJsonObject(order.order_notes);
  return notes?.source === 'company_ca_payment';
}

export function resolvePaymentSource(
  orderNotes: Record<string, unknown>,
  requirements: Record<string, unknown>
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

  const merged = new Map<string, NonNullable<typeof payerOrders>[number]>();
  for (const row of payerOrders || []) merged.set(String(row.id), row);
  for (const row of caOrders || []) {
    if (isCompanyCaOrder(row)) merged.set(String(row.id), row);
  }

  return Array.from(merged.values());
}

export async function fetchUserPaymentHistory(options: {
  userId: number;
  userType: string;
  role: PaymentHistoryRole;
  limit?: number;
}): Promise<PaymentHistoryRecord[]> {
  const { userId, userType, role, limit = 100 } = options;
  const orders = await fetchMatchingPaymentOrders(userId, userType, role);
  const orderIds = orders.map((row) => String(row.id));

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

  const orderById = Object.fromEntries(orders.map((row) => [String(row.id), row]));
  const serviceRequestIds = [
    ...new Set(orders.map((row) => Number(row.service_request_id || 0)).filter((id) => id > 0)),
  ];
  const offerIds = [
    ...new Set(
      orders
        .map((row) => {
          const notes = parseJsonObject(row.order_notes);
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

  const requestById = Object.fromEntries((requestResult.data || []).map((row) => [Number(row.id), row]));
  const userById = Object.fromEntries((userResult.data || []).map((row) => [Number(row.id), row]));
  const offerById = Object.fromEntries((offerResult.data || []).map((row) => [Number(row.id), row]));

  const payments: PaymentHistoryRecord[] = (paymentRows || []).map((payment) => {
    const order = orderById[String(payment.order_id)];
    const orderNotes = parseJsonObject(order?.order_notes);
    const request = requestById[Number(order?.service_request_id || 0)];
    const requirements = parseJsonObject(request?.requirements);
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
      counterpartyName = String(parseJsonObject(payment?.provider_payload).contributor_name || counterpartyName || 'Contributor');
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

  return payments
    .sort((a, b) => {
      const aTime = a.paid_at ? new Date(a.paid_at).getTime() : 0;
      const bTime = b.paid_at ? new Date(b.paid_at).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, limit);
}
