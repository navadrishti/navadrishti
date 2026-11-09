import {
  formatAttendanceSummary,
  formatDeliveryTrackingStatus,
  getNgoNeedFulfillmentMode,
  isDeliveredTrackingStatus,
  isPickedUpTrackingStatus,
  normalizeServiceRequestRecord,
  type NgoNeedFulfillmentMode,
} from '@/lib/service-request-allocation';
import { meterPercent } from '@/components/info-meter';
import { parseJsonObject } from '@/lib/utils';
import type { IndividualNgoRequestApplication } from './types';

export const formatDisplayDate = (value?: string | null): string => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

export function normalizeNgoRequestApplication(application: IndividualNgoRequestApplication) {
  return normalizeServiceRequestRecord(application.request);
}

export function describeNgoNeedMode(mode: NgoNeedFulfillmentMode) {
  switch (mode) {
    case 'financial':
      return {
        label: 'Financial need',
        detail: 'Fulfilled by online contribution. Attendance is not used.',
      };
    case 'material':
      return {
        label: 'Material donation',
        detail: 'Tracked through pickup and delivery status.',
      };
    case 'infrastructure':
      return {
        label: 'Infrastructure assignment',
        detail: 'Asset or facility assignment managed with the NGO.',
      };
    case 'skill_service':
    default:
      return {
        label: 'Skill / service',
        detail: 'Daily engagement with NGO-marked attendance and settlement when due.',
      };
  }
}

/** Marketplace need lifecycle for badges — Active / Ongoing / Closed only. */
export function describeNeedLifecycleStatus(status?: string | null): {
  label: 'Active' | 'Ongoing' | 'Closed' | 'Cancelled' | 'Expired'
  className: string
  detail: string
} | null {
  const normalized = String(status || '')
    .trim()
    .toLowerCase()
  if (!normalized) return null

  if (['active', 'open', 'published'].includes(normalized)) {
    return {
      label: 'Active',
      className: 'border-sky-200 bg-sky-50 text-sky-800',
      detail: 'This need is still accepting or listing on the marketplace.',
    }
  }
  if (['in_progress', 'ongoing'].includes(normalized)) {
    return {
      label: 'Ongoing',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      detail: 'Fulfillment is underway for this need.',
    }
  }
  if (['completed', 'fulfilled', 'closed'].includes(normalized)) {
    return {
      label: 'Closed',
      className: 'border-slate-200 bg-slate-100 text-slate-700',
      detail: 'The NGO has closed this need.',
    }
  }
  if (['cancelled', 'canceled'].includes(normalized)) {
    return {
      label: 'Cancelled',
      className: 'border-rose-200 bg-rose-50 text-rose-800',
      detail: 'This need was cancelled by the NGO.',
    }
  }
  if (normalized === 'expired') {
    return {
      label: 'Expired',
      className: 'border-amber-200 bg-amber-50 text-amber-900',
      detail: 'This need listing has expired.',
    }
  }

  // Unknown DB values that clearly mean finished → Closed
  if (['done', 'archived', 'inactive'].includes(normalized)) {
    return {
      label: 'Closed',
      className: 'border-slate-200 bg-slate-100 text-slate-700',
      detail: 'This need is no longer open.',
    }
  }

  return null
}

export function formatNgoRequestFulfillmentValue(application: IndividualNgoRequestApplication) {
  const request = normalizeNgoRequestApplication(application);
  const mode = getNgoNeedFulfillmentMode(request);

  if (mode === 'financial' || mode === 'skill_service') {
    const amount = Number(application.assigned_amount ?? application.fulfillment_amount ?? 0);
    if (mode === 'skill_service') {
      return amount > 0 ? `INR ${amount.toLocaleString('en-IN')}/day` : 'Daily rate not set';
    }
    return amount > 0 ? `INR ${amount.toLocaleString('en-IN')}` : 'Amount not set';
  }

  const quantity = Number(application.assigned_quantity ?? application.fulfillment_quantity ?? 0);
  return quantity > 0 ? `${quantity} units` : 'Quantity not set';
}

export function getNgoRequestFulfillmentStage(application: IndividualNgoRequestApplication) {
  const status = String(application.status || '').toLowerCase();
  const meta = parseJsonObject(application.response_meta);
  const request = normalizeNgoRequestApplication(application);
  const mode = getNgoNeedFulfillmentMode(request);
  const trackingStatus = String(meta.delivery_tracking_last_status || '');

  if (status === 'pending') {
    return { label: 'Awaiting NGO review', className: 'border-amber-300 bg-amber-50 text-amber-700' };
  }
  if (status === 'rejected') {
    return { label: 'Not selected', className: 'border-red-300 bg-red-50 text-red-700' };
  }
  if (status === 'cancelled') {
    return { label: 'Cancelled', className: 'border-slate-300 bg-slate-100 text-slate-700' };
  }
  if (status === 'completed' || meta.ngo_confirmed_at) {
    return { label: 'Completed', className: 'border-green-300 bg-green-50 text-green-700' };
  }

  if (mode === 'material') {
    if (isDeliveredTrackingStatus(trackingStatus)) {
      return { label: 'Delivered', className: 'border-green-300 bg-green-50 text-green-700' };
    }
    if (isPickedUpTrackingStatus(trackingStatus)) {
      return { label: 'In delivery', className: 'border-blue-300 bg-blue-50 text-blue-700' };
    }
    if (['accepted', 'active'].includes(status)) {
      return { label: 'Awaiting pickup', className: 'border-slate-300 bg-slate-100 text-slate-700' };
    }
  }

  if (mode === 'financial' && ['accepted', 'active'].includes(status)) {
    return { label: 'Contribute online', className: 'border-slate-300 bg-slate-100 text-slate-700' };
  }

  if (mode === 'skill_service' && ['accepted', 'active'].includes(status)) {
    return { label: 'Service in progress', className: 'border-emerald-300 bg-emerald-50 text-emerald-700' };
  }

  if (mode === 'infrastructure' && ['accepted', 'active'].includes(status)) {
    return { label: 'Infrastructure assigned', className: 'border-violet-300 bg-violet-50 text-violet-700' };
  }

  return { label: status || 'Unknown', className: 'border-slate-300 bg-white text-slate-700' };
}

export function getNgoRequestProgress(application: IndividualNgoRequestApplication): {
  percent: number | null
  caption: string
  nextStep: string
} {
  const status = String(application.status || '').toLowerCase();
  const meta = parseJsonObject(application.response_meta);
  const request = normalizeNgoRequestApplication(application);
  const mode = getNgoNeedFulfillmentMode(request);
  const trackingStatus = String(meta.delivery_tracking_last_status || '');
  const attendance = formatAttendanceSummary(meta);
  const settlementStatus = String(meta.settlement_status || '').toLowerCase();

  if (status === 'pending') {
    return {
      percent: 15,
      caption: 'Application submitted',
      nextStep: 'Waiting for the NGO to accept or decline this offer.',
    };
  }
  if (status === 'rejected') {
    return {
      percent: null,
      caption: 'Not selected',
      nextStep: 'This application was not accepted. You can browse other NGO needs.',
    };
  }
  if (status === 'cancelled') {
    return {
      percent: null,
      caption: 'Cancelled',
      nextStep: 'This engagement was cancelled and is closed.',
    };
  }
  if (status === 'completed' || meta.ngo_confirmed_at) {
    return {
      percent: 100,
      caption: 'Fulfillment complete',
      nextStep: 'No further action is required on this need.',
    };
  }

  if (mode === 'material') {
    if (isDeliveredTrackingStatus(trackingStatus)) {
      return {
        percent: 90,
        caption: 'Delivered · awaiting NGO confirmation',
        nextStep: 'Delivery is complete. The NGO may still confirm receipt.',
      };
    }
    if (isPickedUpTrackingStatus(trackingStatus)) {
      return {
        percent: 60,
        caption: 'In transit',
        nextStep: `Courier status: ${formatDeliveryTrackingStatus(meta)}.`,
      };
    }
    return {
      percent: 35,
      caption: 'Accepted · pickup pending',
      nextStep: 'Book or confirm pickup so the donation can move.',
    };
  }

  if (mode === 'financial') {
    const paid = Number(meta.paid_amount ?? meta.contribution_paid_inr ?? attendance.paidTotal ?? 0);
    const due = Number(application.assigned_amount ?? application.fulfillment_amount ?? attendance.totalDue ?? 0);
    const paidShare = meterPercent(paid, due);
    if (paidShare != null && paidShare > 0) {
      return {
        percent: Math.min(95, Math.max(45, paidShare)),
        caption: paidShare >= 100 ? 'Contribution recorded' : 'Partial contribution recorded',
        nextStep: paidShare >= 100
          ? 'Payment is recorded. Waiting for NGO completion if still open.'
          : 'Complete the remaining online contribution for this need.',
      };
    }
    return {
      percent: 40,
      caption: 'Accepted · payment due',
      nextStep: 'Pay online from the need page to fulfill this financial request.',
    };
  }

  if (mode === 'skill_service') {
    const dueShare = meterPercent(attendance.paidTotal + attendance.waivedTotal, attendance.totalDue);
    if (settlementStatus === 'settled' && attendance.outstanding <= 0) {
      return {
        percent: 95,
        caption: 'Settlement complete',
        nextStep: 'Service charges are settled. Waiting for final NGO completion if still open.',
      };
    }
    if (dueShare != null) {
      return {
        percent: Math.min(90, Math.max(45, dueShare)),
        caption: `${attendance.daysPresent} day(s) present · settlement in progress`,
        nextStep:
          attendance.outstanding > 0
            ? `Outstanding settlement: INR ${attendance.outstanding.toLocaleString('en-IN')}.`
            : 'Continue daily attendance until the NGO closes this engagement.',
      };
    }
    if (attendance.daysPresent > 0) {
      return {
        percent: 55,
        caption: `${attendance.daysPresent} day(s) present`,
        nextStep: 'Keep serving as scheduled. Settlement appears when dues are posted.',
      };
    }
    return {
      percent: 45,
      caption: 'Service engagement open',
      nextStep: 'NGO marks daily attendance. Settlement follows present days when billed.',
    };
  }

  return {
    percent: 50,
    caption: 'Infrastructure assigned',
    nextStep: 'Coordinate assignment details with the NGO until completion.',
  };
}
