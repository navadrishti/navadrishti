import {
  getNgoNeedFulfillmentMode,
  isDeliveredTrackingStatus,
  isPickedUpTrackingStatus,
  normalizeServiceRequestRecord,
} from '@/lib/service-request-allocation';
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
      return { label: 'Awaiting Delhivery pickup', className: 'border-indigo-300 bg-indigo-50 text-indigo-700' };
    }
  }

  if (mode === 'financial' && ['accepted', 'active'].includes(status)) {
    return { label: 'Contribute via Razorpay', className: 'border-emerald-300 bg-emerald-50 text-emerald-700' };
  }

  if (mode === 'skill_service' && ['accepted', 'active'].includes(status)) {
    return { label: 'Service in progress', className: 'border-emerald-300 bg-emerald-50 text-emerald-700' };
  }

  if (mode === 'infrastructure' && ['accepted', 'active'].includes(status)) {
    return { label: 'Infrastructure assigned', className: 'border-violet-300 bg-violet-50 text-violet-700' };
  }

  return { label: status || 'Unknown', className: 'border-slate-300 bg-white text-slate-700' };
}
