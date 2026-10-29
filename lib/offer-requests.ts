import { formatStatusLabel } from '@/lib/format-date';
import {
  formatAttendanceSummary,
  isDailyRentalEngagementMeta,
  isDeliveredTrackingStatus,
  isPickedUpTrackingStatus,
} from '@/lib/service-request-allocation';
import type { CapabilityOfferMyApplication, CapabilityOfferSummary } from '@/lib/service-offers/types';
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
    service_request_id?: number | null;
  }>;
  status: 'pending' | 'accepted' | 'rejected' | 'active' | 'completed' | 'cancelled';
  isAssigned: boolean;
}

export const getOfferRequestBucket = (request: Pick<OfferRequestItem, 'status' | 'isAssigned'> | { status?: string | null; isAssigned?: boolean }) => {
  const status = String(request.status || '').trim().toLowerCase();
  if (['rejected', 'completed', 'cancelled', 'closed', 'expired'].includes(status)) return 'history';
  if (['accepted', 'active', 'in_progress'].includes(status) || request.isAssigned) return 'in-progress';
  return 'pending';
};

function applicationStatusToRequestStatus(status: string): OfferRequestItem['status'] {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'in_progress') return 'active';
  if (
    normalized === 'pending'
    || normalized === 'accepted'
    || normalized === 'rejected'
    || normalized === 'active'
    || normalized === 'completed'
    || normalized === 'cancelled'
  ) {
    return normalized;
  }
  return 'pending';
}

export function toApplicantOfferRequest(
  offer: Pick<CapabilityOfferSummary, 'id' | 'title' | 'valid_until' | 'billing_cycle' | 'payment_mode'>,
  application: CapabilityOfferMyApplication
): OfferRequestItem {
  return {
    id: application.id,
    service_offer_id: offer.id,
    service_request_id: application.service_request_id ?? undefined,
    assignment_id: application.assignment_id ?? undefined,
    offer_title: offer.title,
    message: application.message ?? undefined,
    response_meta: application.response_meta,
    assigned_at: application.assigned_at,
    accepted_at: application.assigned_at,
    valid_until: offer.valid_until,
    billing_cycle: offer.billing_cycle,
    payment_mode: offer.payment_mode,
    selected_need_summary: application.selected_needs,
    status: applicationStatusToRequestStatus(application.status),
    isAssigned: application.isAssigned,
  };
}

export function getApplicantOfferBucket(offer: Pick<CapabilityOfferSummary, 'my_application'>) {
  const application = offer.my_application;
  if (!application) return 'pending';
  return getOfferRequestBucket(application);
}

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

export function formatOfferBillingLabel(cycle?: string | null, mode?: string | null) {
  return `${formatStatusLabel(cycle || 'one_time')} · ${formatStatusLabel(mode || 'prepaid')}`;
}

export { overlayLiveAttendanceSummary } from '@/lib/service-offers/attendance-overlay'

export function hydrateOfferRequestMeta(
  meta: Record<string, unknown>,
  assignment?: { meta?: unknown } | null
): Record<string, unknown> {
  const assignmentMeta = parseJsonObject(assignment?.meta);
  if (Object.keys(assignmentMeta).length === 0) return meta;

  return {
    ...meta,
    assignment_meta: { ...parseJsonObject(meta.assignment_meta), ...assignmentMeta },
    attendance_summary: assignmentMeta.attendance_summary ?? meta.attendance_summary,
    settled_amount: assignmentMeta.settled_amount ?? meta.settled_amount,
    settlement_status: assignmentMeta.settlement_status ?? meta.settlement_status,
    settlement_mode: assignmentMeta.settlement_mode ?? meta.settlement_mode,
    delivery_tracking_id: assignmentMeta.delivery_tracking_id ?? meta.delivery_tracking_id,
    delivery_tracking_last_status:
      assignmentMeta.delivery_tracking_last_status ?? meta.delivery_tracking_last_status,
  };
}

function applicationNote(request: OfferRequestItem) {
  const message = String(request.message || '').trim();
  if (!message) return null;
  if (/^applying for:/i.test(message)) return null;
  return message;
}

function paymentStatusLabel(input: {
  paymentRequired: boolean;
  paymentMode: string;
  totalDue: number;
  paidTotal: number;
  settledAmount: number;
  settlementStatus: string;
}) {
  if (!input.paymentRequired) return 'No payment';

  const outstanding = Math.max(0, input.totalDue - input.paidTotal);
  if (input.settlementStatus === 'settled' || (input.settledAmount > 0 && outstanding <= 0)) {
    return `Settled · ${formatInrAmount(input.settledAmount || input.paidTotal)}`;
  }
  if (input.paidTotal > 0 && outstanding <= 0) {
    return `Paid · ${formatInrAmount(input.paidTotal)}`;
  }
  if (outstanding > 0) {
    return `Outstanding · ${formatInrAmount(outstanding)}`;
  }
  if (input.paymentMode === 'prepaid') return 'Payment due';
  return 'Due as used';
}

function deliveryStatusLabel(trackingStatus: string) {
  if (!trackingStatus) return 'Waiting for pickup';
  if (isDeliveredTrackingStatus(trackingStatus)) return trackingStatus;
  if (isPickedUpTrackingStatus(trackingStatus)) return trackingStatus;
  return trackingStatus;
}

export function getOfferEngagementOverview(
  request: OfferRequestItem,
  options?: { perspective?: 'offering' | 'applying'; counterpartyName?: string }
) {
  const billing = getOfferRequestBillingDetails(request);
  const meta = parseJsonObject(request.response_meta);
  const assignmentMeta = parseJsonObject(meta.assignment_meta);
  const merged = {
    ...assignmentMeta,
    ...meta,
    attendance_summary: meta.attendance_summary ?? assignmentMeta.attendance_summary,
  };
  const attendance = formatAttendanceSummary(merged);
  const isDailyRental = isDailyRentalEngagementMeta(meta) || isDailyRentalEngagementMeta(assignmentMeta);
  const trackingStatus = String(
    meta.delivery_tracking_last_status || assignmentMeta.delivery_tracking_last_status || ''
  ).trim();
  const trackingId = String(meta.delivery_tracking_id || assignmentMeta.delivery_tracking_id || '').trim();
  const attendanceSource = String(
    parseJsonObject(merged.attendance_summary).last_source
    || parseJsonObject(merged.attendance_summary).source
    || ''
  ).trim();

  return {
    assignedAt: billing.assignedAt,
    billingLabel: formatOfferBillingLabel(billing.billingCycle, billing.paymentMode),
    amountLabel:
      isDailyRental && billing.paymentAmount > 0
        ? `${formatInrAmount(billing.paymentAmount)}/day`
        : formatInrAmount(billing.paymentAmount),
    paymentStatusLabel: paymentStatusLabel({
      paymentRequired: billing.paymentRequired,
      paymentMode: String(billing.paymentMode || '').toLowerCase(),
      totalDue: attendance.totalDue,
      paidTotal: attendance.paidTotal,
      settledAmount: Number(meta.settled_amount ?? assignmentMeta.settled_amount ?? 0),
      settlementStatus: String(meta.settlement_status || assignmentMeta.settlement_status || '').toLowerCase(),
    }),
    payerLabel: options?.perspective === 'applying'
      ? 'You'
      : (request.client?.name || 'Requester'),
    payeeLabel: options?.perspective === 'applying'
      ? (options.counterpartyName || 'Offering party')
      : 'You (offering party)',
    isDailyRental,
    showAttendance: isDailyRental || attendance.daysPresent > 0 || Boolean(attendance.lastAttendanceAt),
    daysPresent: attendance.daysPresent,
    lastAttendanceAt: attendance.lastAttendanceAt,
    attendanceSourceLabel: attendanceSource
      ? /pwa|gram|device/i.test(attendanceSource)
        ? 'GRAM App'
        : /deliver/i.test(attendanceSource)
          ? 'After delivery'
          : formatStatusLabel(attendanceSource)
      : isDailyRental
        ? 'GRAM App · daily delivery'
        : null,
    showDelivery: Boolean(trackingId || trackingStatus),
    deliveryStatusLabel: deliveryStatusLabel(trackingStatus),
    todayPresent: attendance.lastAttendanceAt
      ? String(attendance.lastAttendanceAt).slice(0, 10) === new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
      : false,
    linkedNeeds: (Array.isArray(request.selected_need_summary) ? request.selected_need_summary : [])
      .map((need) => {
        const requestId = Number(need.service_request_id || need.id || 0)
        const title = String(need.title || 'Need')
        const amount = Number(need.estimated_budget ?? need.target_amount ?? 0)
        return {
          id: Number(need.id || requestId),
          label: amount > 0 ? `${title} · INR ${amount.toLocaleString('en-IN')}` : title,
          href: requestId > 0 ? `/service-requests/${requestId}` : null,
        }
      })
      .filter((need) => need.label),
    needs: formatSelectedNeeds(request),
    applicationNote: applicationNote(request),
  };
}

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

export function offerRequestDetailHref(request: Pick<OfferRequestItem, 'service_offer_id'>): string {
  return `/service-offers/${request.service_offer_id}`
}

export function offerRequestTrackHref(request: Pick<OfferRequestItem, 'id' | 'service_offer_id' | 'service_request_id' | 'response_meta' | 'selected_need_summary'>): string {
  const meta = parseJsonObject(request.response_meta)
  const linkedNeedId = Number(
    request.service_request_id ||
    meta.service_request_id ||
    request.selected_need_summary?.[0]?.service_request_id ||
    0
  )
  if (linkedNeedId > 0) return `/service-requests/${linkedNeedId}`
  return offerRequestDetailHref(request)
}

export const toOfferRentalApplication = (request: OfferRequestItem) => {
  const billing = getOfferRequestBillingDetails(request);
  return {
    id: request.id,
    fulfillment_amount: billing.paymentAmount,
    assigned_amount: billing.paymentAmount,
    response_meta: parseJsonObject(request.response_meta),
  };
};
