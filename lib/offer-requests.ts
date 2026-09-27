import { parseJsonObject } from '@/lib/utils';

export interface OfferRequestItem {
  id: number;
  service_offer_id: number;
  service_request_id?: number;
  assignment_id?: string;
  offer_title: string;
  client?: {
    name?: string;
    email?: string;
    user_type?: string;
    verification_status?: string | null;
  };
  message?: string;
  response_meta?: Record<string, unknown> | null;
  assigned_at?: string | null;
  accepted_at?: string | null;
  valid_until?: string | null;
  billing_cycle?: string | null;
  payment_mode?: string | null;
  payment_required?: boolean | null;
  payment_amount_inr?: number | null;
  selected_need_summary?: Array<{
    id: number;
    title: string;
    estimated_budget?: number | null;
    target_amount?: number | null;
    target_quantity?: number | null;
    beneficiary_count?: number | null;
  }>;
  status: 'pending' | 'accepted' | 'rejected' | 'active' | 'completed' | 'cancelled';
  isAssigned: boolean;
}

export const getOfferRequestBucket = (request: OfferRequestItem) => {
  const status = String(request.status || '').trim().toLowerCase();
  if (['accepted', 'active', 'in_progress'].includes(status) || request.isAssigned) return 'in-progress';
  if (['rejected', 'completed', 'cancelled', 'closed', 'expired'].includes(status)) return 'history';
  return 'pending';
};

export const formatSelectedNeeds = (request: OfferRequestItem, summaryLimit?: number) => {
  const summaryNeeds = Array.isArray(request.selected_need_summary) ? request.selected_need_summary : [];
  if (summaryNeeds.length > 0) {
    return summaryNeeds.slice(0, summaryLimit).map((need) => {
      const title = String(need?.title || 'Need');
      const amount = Number(need?.estimated_budget ?? need?.target_amount ?? 0);
      return amount > 0 ? `${title} | INR ${amount.toLocaleString('en-IN')}` : title;
    });
  }

  const meta = parseJsonObject(request.response_meta);
  const selectedNeeds = Array.isArray(meta.selected_needs) ? meta.selected_needs : [];

  if (selectedNeeds.length > 0) {
    return selectedNeeds
      .map((need) => {
        const title = String(need?.title || 'Need');
        const amount = Number(need?.estimated_budget ?? need?.target_amount ?? 0);
        return amount > 0 ? `${title} | INR ${amount.toLocaleString('en-IN')}` : title;
      })
      .slice(0, 3);
  }

  const selectedNeedIds = Array.isArray(meta.selected_need_ids) ? meta.selected_need_ids : [];
  if (selectedNeedIds.length > 0) {
    return selectedNeedIds.slice(0, 3).map((id) => `Need #${id}`);
  }

  const fallbackRequestId = Number(meta.service_request_id || 0);
  return fallbackRequestId > 0 ? [`Need #${fallbackRequestId}`] : [];
};

export const formatInrAmount = (value: unknown): string => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 'Free';
  return `INR ${amount.toLocaleString('en-IN')}`;
};

export const getOfferRequestBillingDetails = (request: OfferRequestItem) => {
  const meta = parseJsonObject(request.response_meta);
  const assignmentMeta = parseJsonObject(meta.assignment_meta);
  const paymentAmount = Number(meta.payment_amount_inr ?? assignmentMeta.payment_amount_inr ?? assignmentMeta.rate_per_unit ?? request.payment_amount_inr ?? 0);
  const paymentRequired = Boolean(meta.payment_required ?? assignmentMeta.payment_required ?? request.payment_required ?? paymentAmount > 0);

  return {
    assignedAt: String(meta.accepted_at || meta.assigned_at || assignmentMeta.assigned_at || request.assigned_at || request.accepted_at || ''),
    validUntil: String(meta.valid_until || assignmentMeta.valid_until || request.valid_until || ''),
    billingCycle: String(meta.billing_cycle || assignmentMeta.billing_cycle || request.billing_cycle || ''),
    paymentMode: String(meta.payment_mode || assignmentMeta.payment_mode || request.payment_mode || ''),
    paymentAmount,
    paymentRequired
  };
};

export const toOfferRentalApplication = (request: OfferRequestItem) => {
  const billing = getOfferRequestBillingDetails(request);
  return {
    id: request.id,
    fulfillment_amount: billing.paymentAmount,
    assigned_amount: billing.paymentAmount,
    response_meta: parseJsonObject(request.response_meta),
  };
};
