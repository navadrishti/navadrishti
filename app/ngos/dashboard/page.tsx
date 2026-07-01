'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { createClient as createSupabaseClient } from '@/lib/supabase';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { Header } from '@/components/header';
import { VerificationBadge } from '@/components/verification-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Clock, CheckCircle, AlertTriangle, HeartHandshake, Trash2, Plus, Building, TicketCheck, MailCheck, Phone, Loader2, XCircle } from 'lucide-react';
import { formatDisplayDate, formatCampaignLeadLifecycleLabel, type CampaignLeadLifecycle } from '@/lib/format-date';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { SkeletonOrderItem } from '@/components/ui/skeleton';
import { ProfileDashboardTab } from '@/components/profile-dashboard-tab';
import { DashboardQuickSidebar } from '@/components/dashboard-quick-sidebar';
import { CampaignVolunteerAssignmentCard, type CampaignVolunteerAssignmentItem } from '@/components/campaign-volunteer-assignment-card';
import { YourCapabilitiesPanel } from '@/components/service-card';
import {
  formatDeliveryTrackingStatus,
  getDeliveryTrackingEvents,
  getNeedRemainingQuantity,
  getServiceRequestTarget,
  isDeliveredTrackingStatus,
  isNeedOpenForListing,
  isPickedUpTrackingStatus,
} from '@/lib/service-request-allocation';
import {
  formatAttendanceSummary,
  getSkillServiceDailyRate,
  getNgoNeedFulfillmentMode,
  isDailyRentalEngagementMeta,
  shouldUseDelhiveryForNeed,
  shouldUseNgoMarkedDailyAttendance,
} from '@/lib/service-request-allocation';

interface OfferRequestItem {
  id: number;
  service_offer_id: number;
  service_request_id?: number;
  assignment_id?: string;
  offer_title: string;
  client?: {
    name?: string;
    email?: string;
    user_type?: string;
  };
  message?: string;
  response_meta?: Record<string, any> | null;
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

const getOfferRequestBucket = (request: OfferRequestItem) => {
  const status = String(request.status || '').trim().toLowerCase();
  if (['accepted', 'active', 'in_progress'].includes(status) || request.isAssigned) return 'in-progress';
  if (['rejected', 'completed', 'cancelled', 'closed', 'expired'].includes(status)) return 'history';
  return 'pending';
};

const formatSelectedNeeds = (request: OfferRequestItem) => {
  const summaryNeeds = Array.isArray(request.selected_need_summary) ? request.selected_need_summary : [];
  if (summaryNeeds.length > 0) {
    return summaryNeeds.map((need: any) => {
      const title = String(need?.title || 'Need');
      const amount = Number(need?.estimated_budget ?? need?.target_amount ?? 0);
      return amount > 0 ? `${title} | INR ${amount.toLocaleString('en-IN')}` : title;
    });
  }

  const meta = request.response_meta && typeof request.response_meta === 'object' ? request.response_meta : {};
  const selectedNeeds = Array.isArray(meta.selected_needs) ? meta.selected_needs : [];

  if (selectedNeeds.length > 0) {
    return selectedNeeds
      .map((need: any) => {
        const title = String(need?.title || 'Need');
        const amount = Number(need?.estimated_budget ?? need?.target_amount ?? 0);
        return amount > 0 ? `${title} | INR ${amount.toLocaleString('en-IN')}` : title;
      })
      .slice(0, 3);
  }

  const selectedNeedIds = Array.isArray(meta.selected_need_ids) ? meta.selected_need_ids : [];
  if (selectedNeedIds.length > 0) {
    return selectedNeedIds.slice(0, 3).map((id: any) => `Need #${id}`);
  }

  const fallbackRequestId = Number(meta.service_request_id || 0);
  return fallbackRequestId > 0 ? [`Need #${fallbackRequestId}`] : [];
};

const formatInrAmount = (value: unknown): string => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 'Free';
  return `INR ${amount.toLocaleString('en-IN')}`;
};

const getOfferRequestBillingDetails = (request: OfferRequestItem) => {
  const meta = request.response_meta && typeof request.response_meta === 'object' ? request.response_meta : {};
  const assignmentMeta = meta.assignment_meta && typeof meta.assignment_meta === 'object' ? meta.assignment_meta : {};
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

const toOfferRentalApplication = (request: OfferRequestItem) => {
  const billing = getOfferRequestBillingDetails(request);
  return {
    id: request.id,
    fulfillment_amount: billing.paymentAmount,
    assigned_amount: billing.paymentAmount,
    response_meta: request.response_meta && typeof request.response_meta === 'object' ? request.response_meta : {},
  };
};

interface CompanyProjectApplication {
  project_id: string;
  project_title: string;
  project_location?: string;
  project_timeline?: string;
  company_id: number;
  company_name: string;
  company_email?: string;
  status: 'pending' | 'accepted' | 'rejected' | string;
  note?: string;
  needs: Array<{
    id: number;
    title: string;
    status: string;
    request_type?: string;
  }>;
}

interface CSRTrackingAssignment {
  project_id: string;
  project_title: string;
  project_location?: string;
  project_timeline?: string;
  project_description?: string;
  project_category?: string | null;
  project_expected_beneficiaries?: number | null;
  project_valid_until?: string | null;
  project_status?: string | null;
  csr_project_available_for_csr?: boolean | null;
  lead_ngo_id: number;
  lead_ngo_name: string;
  lead_ngo_email?: string;
  assigned_company_id: number;
  assigned_company_name: string;
  assigned_company_email?: string;
  selected_lead_ngo_id?: number | null;
  selected_lead_ngo_name?: string | null;
  selected_lead_ngo_email?: string | null;
  assignment_status: string;
  assigned_at?: string | null;
  review_note?: string;
  needs: Array<{
    id: number;
    title: string;
    status: string;
    request_type?: string;
  }>;
}

interface CampaignLeadAssignment {
  id: string;
  campaign_id: string;
  campaign_title: string;
  campaign_description?: string;
  campaign_location?: string;
  campaign_category?: string;
  campaign_status: string;
  start_date?: string | null;
  end_date?: string | null;
  lifecycle: CampaignLeadLifecycle;
  accepted_at?: string | null;
  company_id: number;
  company_name: string;
  company_email?: string;
}

interface CampaignVolunteerAssignment {
  id: string;
  campaign_id: string;
  campaign_title: string;
  campaign_description?: string;
  campaign_location?: string;
  campaign_category?: string;
  campaign_status?: string;
  start_date?: string | null;
  end_date?: string | null;
  lifecycle: CampaignLeadLifecycle;
  volunteer_capacity?: number;
  company_name?: string;
  company_email?: string;
  applied_at?: string | null;
  assignment_id?: string | null;
  attendance_summary?: {
    last_attendance_at?: string | null;
    days_attended?: number;
    total_entries?: number;
  };
}

interface CampaignLeadInvitation {
  id: string;
  campaign_id: string;
  campaign_title: string;
  campaign_description?: string;
  campaign_location?: string;
  campaign_cause?: string;
  status: string;
  invited_at?: string;
  company_id: number;
  company_name: string;
  company_email?: string;
}

const isActionableProjectApplicationStatus = (status: string): boolean => {
  const normalized = String(status || '').toLowerCase();
  return ['pending', 'pledged', 'invited', 'pending_acceptance', 'awaiting_acceptance', 'offered', 'assigned'].includes(normalized);
};

const formatStatusLabel = (status: string): string => {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return 'Unknown';
  return normalized
    .replace(/_/g, ' ')
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const getCampaignLifecycleBadgeClass = (lifecycle: CampaignLeadLifecycle): string => {
  if (lifecycle === 'yet_to_start') return 'border-amber-300 bg-amber-50 text-amber-700';
  if (lifecycle === 'started') return 'border-blue-300 bg-blue-50 text-blue-700';
  return 'border-green-300 bg-green-50 text-green-700';
};

const getStatusBadgeClass = (status: string): string => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'accepted' || normalized === 'completed') return 'border-green-300 bg-green-50 text-green-700';
  if (normalized === 'pending' || normalized === 'pledged' || normalized === 'invited' || normalized === 'pending_acceptance' || normalized === 'awaiting_acceptance' || normalized === 'offered' || normalized === 'assigned') return 'border-amber-300 bg-amber-50 text-amber-700';
  if (normalized === 'in_progress' || normalized === 'active') return 'border-blue-300 bg-blue-50 text-blue-700';
  if (normalized === 'rejected' || normalized === 'cancelled' || normalized === 'closed') return 'border-red-300 bg-red-50 text-red-700';
  if (normalized === 'expired') return 'border-slate-300 bg-slate-100 text-slate-700';
  return 'border-slate-300 bg-white text-slate-700';
};

function StaticStatusBadge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold pointer-events-none select-none',
        className
      )}
    >
      {children}
    </span>
  );
}

function NeedDetailLink({
  need,
}: {
  need: { id: number; title: string; request_type?: string };
}) {
  return (
    <Link
      href={`/service-requests/${need.id}`}
      className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 no-underline hover:bg-slate-100 hover:text-slate-700 focus:bg-slate-100 focus:text-slate-700"
    >
      {need.title}
      {need.request_type ? ` · ${need.request_type}` : ''}
    </Link>
  );
}

function CampaignAssignmentDetails({
  assignment,
  roleLabel,
}: {
  assignment: CampaignLeadAssignment;
  roleLabel: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{assignment.campaign_title}</p>
          <p className="text-sm text-slate-600">
            {roleLabel} • {assignment.company_name}
          </p>
          <p className="text-xs text-slate-500">
            {assignment.company_email || 'No email'}
            {assignment.accepted_at ? ` • Accepted ${formatDisplayDate(assignment.accepted_at)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <StaticStatusBadge className={getCampaignLifecycleBadgeClass(assignment.lifecycle)}>
            {formatCampaignLeadLifecycleLabel(assignment.lifecycle)}
          </StaticStatusBadge>
          {assignment.campaign_status ? (
            <StaticStatusBadge className={getStatusBadgeClass(assignment.campaign_status)}>
              Campaign: {formatStatusLabel(assignment.campaign_status)}
            </StaticStatusBadge>
          ) : null}
        </div>
      </div>

      {assignment.campaign_description ? (
        <p className="text-sm text-muted-foreground line-clamp-3">{assignment.campaign_description}</p>
      ) : null}

      {assignment.campaign_status === 'draft' && assignment.lifecycle === 'yet_to_start' ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Waiting for the company to publish this campaign.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Category</p>
          <p className="font-medium text-slate-800">{assignment.campaign_category || 'Not set'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Location</p>
          <p className="font-medium text-slate-800">{assignment.campaign_location || 'Not set'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Timeline</p>
          <p className="font-medium text-slate-800">
            {formatDisplayDate(assignment.start_date) || 'Start TBD'} → {formatDisplayDate(assignment.end_date) || 'End TBD'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button asChild variant="outline" size="sm">
          <Link href={`/csr-campaigns/${assignment.campaign_id}`}>View Campaign</Link>
        </Button>
      </div>
    </div>
  );
}

function CsrTrackingProjectDetails({
  assignment,
  partnerLabel,
  partnerName,
  partnerEmail,
}: {
  assignment: CSRTrackingAssignment;
  partnerLabel: string;
  partnerName: string;
  partnerEmail?: string;
}) {
  const beneficiaries =
    assignment.project_expected_beneficiaries != null && assignment.project_expected_beneficiaries > 0
      ? Number(assignment.project_expected_beneficiaries).toLocaleString('en-IN')
      : null;
  const csrAvailable = assignment.csr_project_available_for_csr;
  const needs = assignment.needs || [];
  const visibleNeeds = needs.slice(0, 4);
  const hiddenNeedCount = Math.max(0, needs.length - visibleNeeds.length);
  const hasDistinctLeadNgo = Boolean(
    assignment.selected_lead_ngo_id &&
    Number(assignment.selected_lead_ngo_id) !== Number(assignment.lead_ngo_id)
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{assignment.project_title}</p>
          <p className="text-sm text-slate-600">{partnerLabel}: {partnerName}</p>
          <p className="text-xs text-slate-500">
            {partnerEmail || 'No email'}
            {assignment.assigned_at ? ` • Handoff ${formatDisplayDate(assignment.assigned_at)}` : ''}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Owner NGO: {assignment.lead_ngo_name}
            {hasDistinctLeadNgo && assignment.selected_lead_ngo_name
              ? ` • Lead NGO: ${assignment.selected_lead_ngo_name}`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <StaticStatusBadge className={getStatusBadgeClass(assignment.assignment_status)}>
            Assignment: {formatStatusLabel(assignment.assignment_status)}
          </StaticStatusBadge>
          {assignment.project_status ? (
            <StaticStatusBadge className={getStatusBadgeClass(assignment.project_status)}>
              Project: {formatStatusLabel(assignment.project_status)}
            </StaticStatusBadge>
          ) : null}
        </div>
      </div>

      {assignment.project_description ? (
        <p className="text-sm text-muted-foreground line-clamp-3">{assignment.project_description}</p>
      ) : null}

      {assignment.review_note ? (
        <div className="rounded-md border bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-medium">Acceptance note:</span> {assignment.review_note}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Need types</p>
          <p className="font-medium text-slate-800">{assignment.project_category || 'Not set'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Location</p>
          <p className="font-medium text-slate-800">{assignment.project_location || 'Not set'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Timeline</p>
          <p className="font-medium text-slate-800">{assignment.project_timeline || 'Not set'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Beneficiaries</p>
          <p className="font-medium text-slate-800">{beneficiaries || 'Not set'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Valid until</p>
          <p className="font-medium text-slate-800">{formatDisplayDate(assignment.project_valid_until) || 'Not set'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">CSR takeover</p>
          <p className="font-medium text-slate-800">
            {csrAvailable === false ? 'No' : csrAvailable === true ? 'Yes' : 'Not set'}
          </p>
        </div>
      </div>

      {needs.length > 0 ? (
        <div>
          <p className="mb-1.5 text-xs uppercase tracking-wide text-slate-500">Project needs ({needs.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {visibleNeeds.map((need) => (
              <NeedDetailLink key={need.id} need={need} />
            ))}
            {hiddenNeedCount > 0 ? (
              <StaticStatusBadge className="border-slate-200 bg-white text-slate-600">+{hiddenNeedCount} more</StaticStatusBadge>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <Link href={`/service-requests/projects/${assignment.project_id}`}>
          <Button size="sm" variant="outline">View Project</Button>
        </Link>
      </div>
    </div>
  );
}

function formatDelhiveryEventTime(value: unknown) {
  if (!value) return 'Time not available';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function InlineDelhiveryFulfillment({
  serviceRequestId,
  volunteerApplicationId,
  responseMeta,
  canEditTrackingId = true,
  canVerifyPickup = false,
  onUpdated,
}: {
  serviceRequestId: number;
  volunteerApplicationId: number;
  responseMeta?: Record<string, any> | null;
  canEditTrackingId?: boolean;
  canVerifyPickup?: boolean;
  onUpdated?: (nextMeta: Record<string, any>) => void | Promise<void>;
}) {
  const { toast } = useToast();
  const meta = responseMeta && typeof responseMeta === 'object' ? responseMeta : {};
  const [trackingId, setTrackingId] = useState(String(meta.delivery_tracking_id || ''));
  const [syncing, setSyncing] = useState(false);

  const events = useMemo(() => getDeliveryTrackingEvents(meta), [meta]);
  const currentStatus = formatDeliveryTrackingStatus(meta);
  const pickedUp = isPickedUpTrackingStatus(meta.delivery_tracking_last_status);
  const delivered = isDeliveredTrackingStatus(meta.delivery_tracking_last_status);

  const handleVerifyPickup = async () => {
    const resolvedTrackingId = trackingId.trim() || String(meta.delivery_tracking_id || '').trim();
    if (!resolvedTrackingId) {
      toast({
        title: 'Tracking ID required',
        description: 'Enter the Delhivery tracking ID from your shipment.',
        variant: 'destructive',
      });
      return;
    }

    setSyncing(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Please sign in again');

      const response = await fetch(
        `/api/service-requests/${serviceRequestId}/volunteers/${volunteerApplicationId}/delivery/sync`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ trackingId: resolvedTrackingId }),
        }
      );

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Could not verify Delhivery pickup');
      }

      const nextMeta =
        data?.data?.assignment?.response_meta && typeof data.data.assignment.response_meta === 'object'
          ? data.data.assignment.response_meta
          : meta;

      setTrackingId(String(nextMeta.delivery_tracking_id || resolvedTrackingId));

      toast({
        title: isDeliveredTrackingStatus(nextMeta.delivery_tracking_last_status)
          ? 'Delivery updated'
          : isPickedUpTrackingStatus(nextMeta.delivery_tracking_last_status)
            ? 'Pickup verified'
            : 'Delhivery status synced',
        description: formatDeliveryTrackingStatus(nextMeta),
      });

      await onUpdated?.(nextMeta);
    } catch (error) {
      toast({
        title: 'Verification failed',
        description: error instanceof Error ? error.message : 'Could not sync Delhivery status',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-indigo-200 bg-indigo-50/60 p-3">
      <div>
        <p className="text-sm font-medium text-indigo-950">Delhivery delivery</p>
        <p className="text-xs text-indigo-800/80">
          Material fulfillment is tracked through Delhivery pickup and delivery updates.
        </p>
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <p>
          Status:{' '}
          <span className="font-medium text-slate-900">{currentStatus}</span>
        </p>
        <p>
          Last location:{' '}
          <span className="font-medium text-slate-900">
            {meta.delivery_tracking_last_location || 'Not available yet'}
          </span>
        </p>
      </div>

      {canEditTrackingId ? (
        <div className="space-y-2">
          <Label htmlFor={`delhivery-tracking-${volunteerApplicationId}`} className="text-xs">
            Delhivery tracking ID
          </Label>
          <Input
            id={`delhivery-tracking-${volunteerApplicationId}`}
            value={trackingId}
            onChange={(event) => setTrackingId(event.target.value)}
            placeholder="Enter tracking ID after Delhivery pickup"
            className="bg-white"
          />
        </div>
      ) : meta.delivery_tracking_id ? (
        <p className="text-xs text-slate-700">
          Tracking ID: <span className="font-medium">{meta.delivery_tracking_id}</span>
        </p>
      ) : null}

      {canVerifyPickup ? (
        <Button
          size="sm"
          className="bg-indigo-700 hover:bg-indigo-800"
          onClick={handleVerifyPickup}
          disabled={syncing}
        >
          {syncing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Checking Delhivery…
            </>
          ) : delivered ? (
            'Refresh delivery status'
          ) : pickedUp ? (
            'Refresh delivery status'
          ) : (
            'Verify Delhivery pickup'
          )}
        </Button>
      ) : null}

      {events.length > 0 ? (
        <div className="rounded-md border border-indigo-100 bg-white p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Delivery timeline
          </p>
          <ol className="space-y-2">
            {events.map((event: any, index: number) => (
              <li key={`${event.status}-${event.timestamp}-${index}`} className="border-l-2 border-indigo-200 pl-3">
                <p className="text-sm font-medium text-slate-900">
                  {String(event.status || 'Update')}
                </p>
                <p className="text-xs text-slate-600">
                  {event.location ? `${event.location} · ` : ''}
                  {formatDelhiveryEventTime(event.timestamp)}
                </p>
                {event.details ? (
                  <p className="text-xs text-slate-500">{String(event.details)}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="text-xs text-slate-600">
          {meta.delivery_tracking_id
            ? canVerifyPickup
              ? 'No timeline events yet. Use verify pickup to pull the latest Delhivery updates.'
              : 'No timeline events yet. The individual will sync Delhivery updates after pickup.'
            : canVerifyPickup
              ? 'Add the tracking ID once Delhivery picks up the goods to start live tracking.'
              : 'Waiting for the individual to verify Delhivery pickup and share tracking updates.'}
        </p>
      )}
    </div>
  );
}
declare global {
  interface Window {
    Razorpay?: any;
  }
}

function getSkillLocalDateString(reference: Date = new Date()) {
  const year = reference.getFullYear();
  const month = String(reference.getMonth() + 1).padStart(2, '0');
  const day = String(reference.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function loadRazorpayScript() {
  if (typeof window === 'undefined' || window.Razorpay) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay'));
    document.body.appendChild(script);
  });
}

function InlineSkillServiceFulfillment({
  application,
  role,
  title = 'Skill / service rental',
  onUpdated,
}: {
  application: {
    id: number;
    fulfillment_amount?: number | null;
    fulfillment_quantity?: number | null;
    assigned_amount?: number | null;
    assigned_quantity?: number | null;
    proposed_amount?: number | null;
    response_meta?: Record<string, any> | null;
  };
  role: 'ngo' | 'individual';
  title?: string;
  onUpdated?: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [marking, setMarking] = useState(false);
  const [settling, setSettling] = useState(false);
  const meta = application.response_meta && typeof application.response_meta === 'object'
    ? application.response_meta
    : {};
  const assignmentId =
    meta.assignment_id || meta.assignmentMeta?.id || meta.assignment_meta?.id;
  const dailyRate = getSkillServiceDailyRate(application);
  const summary = formatAttendanceSummary(meta);
  const today = getSkillLocalDateString();
  const alreadyMarkedToday = String(summary.lastAttendanceAt || '') === today;
  const settlementStatus = String(meta.settlement_status || '').toLowerCase();
  const isSettled = settlementStatus === 'settled';
  const outstanding = Math.max(0, summary.totalDue - summary.paidTotal);

  useEffect(() => {
    if (role === 'ngo') {
      void loadRazorpayScript().catch(() => undefined);
    }
  }, [role]);

  const handleMarkAttendance = async () => {
    if (!assignmentId) {
      toast({
        title: 'Attendance unavailable',
        description: 'Assignment is not linked yet.',
        variant: 'destructive',
      });
      return;
    }

    if (alreadyMarkedToday) {
      toast({
        title: 'Already marked',
        description: "Today's attendance is already recorded and cannot be changed.",
      });
      return;
    }

    setMarking(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Please sign in again');

      const response = await fetch(`/api/service-assignments/${assignmentId}/attendance`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          attendanceStatus: 'present',
          attendanceSource: 'ngo_dashboard',
          attendanceDate: today,
          units: 1,
          multiplier: 1,
          markedForUserId: meta.assignee_user_id || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to mark attendance');
      }

      toast({
        title: 'Attendance marked',
        description: `Present day recorded. Daily due: INR ${dailyRate.toLocaleString('en-IN')}.`,
      });
      await onUpdated?.();
    } catch (error) {
      toast({
        title: 'Could not mark attendance',
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setMarking(false);
    }
  };

  const handleSettle = async () => {
    if (!assignmentId) {
      toast({
        title: 'Settlement unavailable',
        description: 'Assignment is not linked yet.',
        variant: 'destructive',
      });
      return;
    }

    setSettling(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Please sign in again');

      const response = await fetch(`/api/service-assignments/${assignmentId}/settle`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'start' }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to start settlement');
      }

      const payload = data.data;
      if (payload?.settled) {
        toast({
          title: 'Service completed',
          description: payload.settledAmount > 0
            ? `Settlement recorded for INR ${Number(payload.settledAmount).toLocaleString('en-IN')}.`
            : 'Service marked complete with no payment due.',
        });
        await onUpdated?.();
        return;
      }

      if (!payload?.paymentRequired) {
        await onUpdated?.();
        return;
      }

      await loadRazorpayScript();
      if (!window.Razorpay) {
        throw new Error('Razorpay failed to load. Refresh and try again.');
      }

      const razorpay = new window.Razorpay({
        key: payload.keyId,
        amount: Math.round(Number(payload.amount) * 100),
        currency: payload.currency || 'INR',
        name: 'Navadrishti',
        description: 'Daily rental settlement',
        order_id: payload.orderId,
        theme: { color: '#059669' },
        handler: async (paymentResponse: Record<string, string>) => {
          try {
            const verifyRes = await fetch(`/api/service-assignments/${assignmentId}/settle`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'verify',
                razorpay_order_id: paymentResponse.razorpay_order_id,
                razorpay_payment_id: paymentResponse.razorpay_payment_id,
                razorpay_signature: paymentResponse.razorpay_signature,
              }),
            });

            const verifyData = await verifyRes.json();
            if (!verifyRes.ok || !verifyData?.success) {
              throw new Error(verifyData?.error || 'Payment verification failed');
            }

            toast({
              title: 'Payment successful',
              description: `Settled INR ${Number(verifyData.data?.settledAmount || payload.amount).toLocaleString('en-IN')} and marked service complete.`,
            });
            await onUpdated?.();
          } catch (verifyError) {
            toast({
              title: 'Payment verification failed',
              description: verifyError instanceof Error ? verifyError.message : 'Contact support with your payment reference.',
              variant: 'destructive',
            });
          }
        },
      });

      razorpay.open();
    } catch (error) {
      toast({
        title: 'Could not settle',
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setSettling(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
      <div>
        <p className="text-sm font-medium text-emerald-950">{title}</p>
        <p className="text-xs text-emerald-900/80">
          {role === 'ngo'
            ? 'Mark attendance once per day for this individual. Past days cannot be marked or edited. Settle the cumulative total when service ends.'
            : 'The NGO marks your daily attendance. Payment is calculated from present days times your quoted daily rate.'}
        </p>
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <p>
          Daily rate:{' '}
          <span className="font-medium text-slate-900">
            {dailyRate > 0 ? `INR ${dailyRate.toLocaleString('en-IN')}` : 'Not set'}
          </span>
        </p>
        <p>
          Days present: <span className="font-medium text-slate-900">{summary.daysPresent}</span>
        </p>
        <p>
          Cumulative due:{' '}
          <span className="font-medium text-slate-900">
            INR {summary.totalDue.toLocaleString('en-IN')}
          </span>
        </p>
      </div>

      {summary.lastAttendanceAt ? (
        <p className="text-xs text-slate-600">
          Last attendance marked: {summary.lastAttendanceAt}
        </p>
      ) : null}

      {isSettled ? (
        <p className="text-xs font-medium text-emerald-800">
          Settled
          {meta.settled_amount != null ? ` · INR ${Number(meta.settled_amount).toLocaleString('en-IN')}` : ''}
          {meta.settlement_mode ? ` (${meta.settlement_mode})` : ''}
        </p>
      ) : role === 'ngo' ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={handleMarkAttendance} disabled={marking || alreadyMarkedToday || isSettled}>
            {marking ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Marking…
              </>
            ) : alreadyMarkedToday ? (
              'Today already marked'
            ) : (
              'Mark today present'
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSettle}
            disabled={settling || isSettled}
          >
            {settling ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Settling…
              </>
            ) : outstanding > 0 ? (
              `Complete service & pay INR ${outstanding.toLocaleString('en-IN')}`
            ) : (
              'Complete service (no payment due)'
            )}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-slate-600">
          {alreadyMarkedToday
            ? 'The NGO marked you present today.'
            : "Waiting for the NGO to mark today's attendance."}
          {outstanding > 0 ? ` Outstanding: INR ${outstanding.toLocaleString('en-IN')}.` : ''}
        </p>
      )}
    </div>
  );
}
function InlineInfrastructureAssignment({
  application,
  serviceRequestId,
  role,
  onUpdated,
}: {
  application: {
    id: number;
    status?: string;
    response_meta?: Record<string, any> | null;
  };
  serviceRequestId: number;
  role: 'ngo' | 'individual';
  onUpdated?: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [completing, setCompleting] = useState(false);
  const status = String(application.status || '').toLowerCase();
  const inProgress = ['accepted', 'active'].includes(status);

  const handleMarkComplete = async () => {
    setCompleting(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Please sign in again');

      const response = await fetch(
        `/api/service-requests/${serviceRequestId}/volunteers/${application.id}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'completed' }),
        }
      );

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to mark complete');
      }

      toast({
        title: 'Infrastructure need completed',
        description: 'The individual can now apply to other needs.',
      });
      await onUpdated?.();
    } catch (error) {
      toast({
        title: 'Could not mark complete',
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setCompleting(false);
    }
  };

  if (!inProgress) return null;

  return (
    <div className="space-y-2 rounded-md border border-violet-200 bg-violet-50/60 p-3">
      <p className="text-sm font-medium text-violet-950">Infrastructure assignment</p>
      <p className="text-xs text-violet-900/80">
        {role === 'individual'
          ? 'You are assigned to this infrastructure need. You cannot take another need until the NGO marks this complete.'
          : 'Mark this infrastructure engagement complete when work is done so the individual can take new needs.'}
      </p>
      {role === 'ngo' ? (
        <Button size="sm" variant="outline" onClick={handleMarkComplete} disabled={completing}>
          {completing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Marking…
            </>
          ) : (
            'Mark complete'
          )}
        </Button>
      ) : null}
    </div>
  );
}
type NgoNeedAssignment = {
  id: number;
  status?: string;
  assigned_quantity?: number | null;
  assigned_amount?: number | null;
  fulfillment_quantity?: number | null;
  fulfillment_amount?: number | null;
  response_meta?: Record<string, any> | null;
  volunteer?: { id?: number; name?: string | null; email?: string | null; user_type?: string | null } | null;
};

type NgoNeedDashboardItem = {
  id: number;
  title: string;
  status?: string;
  category?: string;
  location?: string;
  beneficiary_count?: number | null;
  target_quantity?: number | null;
  remaining_quantity?: number | null;
  current_quantity?: number | null;
  estimated_budget?: number | null;
  target_amount?: number | null;
  accepted_count?: number;
  completed_count?: number;
  project?: { title?: string | null; exact_address?: string | null; location?: string | null } | null;
  assignments?: NgoNeedAssignment[];
};

function getAcceptedNgoNeedAssignments(item: NgoNeedDashboardItem) {
  return (item.assignments || []).filter((assignment) =>
    ['accepted', 'active', 'completed'].includes(String(assignment.status || '').toLowerCase())
  );
}

function getPendingNgoNeedAssignments(item: NgoNeedDashboardItem) {
  return (item.assignments || []).filter(
    (assignment) => String(assignment.status || '').toLowerCase() === 'pending'
  );
}

function formatNgoNeedOfferValue(item: NgoNeedDashboardItem, assignment: NgoNeedAssignment) {
  const mode = getNgoNeedFulfillmentMode(item);
  if (mode === 'financial') {
    const amount = Number(assignment.fulfillment_amount ?? assignment.assigned_amount ?? 0);
    return amount > 0 ? `INR ${amount.toLocaleString('en-IN')}` : 'Amount not set';
  }
  if (mode === 'skill_service') {
    const amount = Number(assignment.fulfillment_amount ?? assignment.assigned_amount ?? 0);
    return amount > 0 ? `INR ${amount.toLocaleString('en-IN')} / day` : 'Daily rate not set';
  }

  const quantity = Number(assignment.fulfillment_quantity ?? assignment.assigned_quantity ?? 0);
  return quantity > 0 ? `${quantity} units` : 'Quantity not set';
}

function formatNgoNeedTargetSummary(item: NgoNeedDashboardItem) {
  const target = getServiceRequestTarget(item);
  const remaining = getNeedRemainingQuantity(item);

  if (target.isFinancial) {
    const targetLabel = target.amount > 0 ? `INR ${target.amount.toLocaleString('en-IN')}` : 'Open budget';
    const remainingLabel = target.amount > 0 ? `INR ${remaining.toLocaleString('en-IN')}` : 'Open';
    return { targetLabel, remainingLabel };
  }

  const targetLabel = target.quantity > 0 ? `${target.quantity} units` : String(item.beneficiary_count || 0);
  const remainingLabel = target.quantity > 0 ? `${remaining} units` : String(remaining);
  return { targetLabel, remainingLabel };
}

function NgoNeedDashboardInline({
  need,
  variant = 'ongoing',
  onUpdated,
}: {
  need: NgoNeedDashboardItem;
  variant?: 'ongoing' | 'history';
  onUpdated?: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const accepted = getAcceptedNgoNeedAssignments(need);
  const pending = getPendingNgoNeedAssignments(need);
  const { targetLabel, remainingLabel } = formatNgoNeedTargetSummary(need);
  const listingOpen = isNeedOpenForListing(need);
  const target = getServiceRequestTarget(need);
  const location =
    need.project?.exact_address || need.project?.location || need.location || 'Not set';

  const handleApplicantDecision = async (
    assignment: NgoNeedAssignment,
    decision: 'accepted' | 'rejected'
  ) => {
    setUpdatingId(assignment.id);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Please sign in again');
      }

      const payload: Record<string, unknown> = { status: decision };
      if (decision === 'accepted') {
        const remaining = getNeedRemainingQuantity(need);
        if (target.isFinancial) {
          const offer = Number(assignment.fulfillment_amount ?? assignment.assigned_amount ?? 0);
          payload.allocationAmount = Math.min(offer > 0 ? offer : remaining, remaining);
        } else {
          const offer = Number(assignment.fulfillment_quantity ?? assignment.assigned_quantity ?? 0);
          payload.allocationQuantity = Math.min(offer > 0 ? offer : remaining, remaining);
        }
      }

      const response = await fetch(
        `/api/service-requests/${need.id}/volunteers/${assignment.id}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to update application');
      }

      toast({
        title: decision === 'accepted' ? 'Application accepted' : 'Application rejected',
        description:
          decision === 'accepted'
            ? `${assignment.volunteer?.name || 'Applicant'} is now assigned to this need.`
            : `${assignment.volunteer?.name || 'Applicant'} was not selected.`,
      });

      await onUpdated?.();
    } catch (error) {
      toast({
        title: 'Could not update application',
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-3 rounded-md border bg-white p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-semibold">{need.title}</p>
          <p className="text-sm text-muted-foreground">
            {need.project?.title || need.location || 'Standalone need'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{need.status || 'active'}</Badge>
          {variant === 'ongoing' && !listingOpen ? (
            <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
              Fully assigned · hidden from listing
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-4">
        <p>Target: {targetLabel}</p>
        <p>Remaining: {remainingLabel}</p>
        <p>Pending review: {pending.length}</p>
        <p>Location: {location}</p>
      </div>

      {pending.length > 0 && variant === 'ongoing' ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-sm font-medium text-amber-900">Pending applications</p>
          {pending.map((assignment) => (
            <div
              key={assignment.id}
              className="flex flex-col gap-2 border-t border-amber-200 pt-2 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {assignment.volunteer?.name || 'Individual'}
                </p>
                <p className="text-xs text-slate-600">
                  Offer: {formatNgoNeedOfferValue(need, assignment)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  disabled={updatingId === assignment.id}
                  onClick={() => handleApplicantDecision(assignment, 'accepted')}
                >
                  {updatingId === assignment.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Accept'
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50"
                  disabled={updatingId === assignment.id}
                  onClick={() => handleApplicantDecision(assignment, 'rejected')}
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {accepted.length > 0 ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-3">
          <p className="text-sm font-medium text-slate-900">Assigned individuals</p>
          {accepted.map((assignment) => {
            const mode = getNgoNeedFulfillmentMode(need);
            const inFulfillment = ['accepted', 'active'].includes(String(assignment.status || '').toLowerCase());

            return (
              <div key={assignment.id} className="space-y-2 border-t border-slate-200 pt-2 first:border-t-0 first:pt-0">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {assignment.volunteer?.name || 'Individual'}
                    </p>
                    <p className="text-xs text-slate-600">
                      Promised: {formatNgoNeedOfferValue(need, assignment)}
                    </p>
                  </div>
                  <p className="text-xs capitalize text-slate-600 sm:text-right">
                    {String(assignment.status || 'accepted').replace('_', ' ')}
                  </p>
                </div>

                {shouldUseDelhiveryForNeed(need) && inFulfillment ? (
                  <InlineDelhiveryFulfillment
                    serviceRequestId={need.id}
                    volunteerApplicationId={assignment.id}
                    responseMeta={assignment.response_meta || {}}
                    canEditTrackingId={false}
                    canVerifyPickup={false}
                    onUpdated={onUpdated}
                  />
                ) : null}

                {shouldUseNgoMarkedDailyAttendance(need) && inFulfillment ? (
                  <InlineSkillServiceFulfillment
                    application={assignment}
                    role="ngo"
                    onUpdated={onUpdated}
                  />
                ) : null}

                {mode === 'infrastructure' && inFulfillment ? (
                  <InlineInfrastructureAssignment
                    application={assignment}
                    serviceRequestId={need.id}
                    role="ngo"
                    onUpdated={onUpdated}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Link href={`/service-requests/${need.id}`}>
          <Button variant="outline" size="sm">
            View
          </Button>
        </Link>
        {variant === 'ongoing' ? (
          <>
            <Link href={`/service-requests/edit/${need.id}`}>
              <Button variant="outline" size="sm">
                Edit
              </Button>
            </Link>
            {pending.length > 0 ? (
              <Link href={`/service-requests/applicants/${need.id}`}>
                <Button variant="outline" size="sm">
                  All applicants ({pending.length})
                </Button>
              </Link>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function NGODashboardContent() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'profile';

  // State for real service data
  const [serviceOffers, setServiceOffers] = useState<any[]>([]);
  const [offerApplications, setOfferApplications] = useState<any[]>([]);
  const [offerRequests, setOfferRequests] = useState<OfferRequestItem[]>([]);
  const [companyProjectApplications, setCompanyProjectApplications] = useState<CompanyProjectApplication[]>([]);
  const [loadingCompanyProjectApplications, setLoadingCompanyProjectApplications] = useState(false);
  const [reviewingCompanyApplicationKey, setReviewingCompanyApplicationKey] = useState<string | null>(null);
  const [csrTrackingAssignments, setCsrTrackingAssignments] = useState<CSRTrackingAssignment[]>([]);
  const [loadingCSRTrackingAssignments, setLoadingCSRTrackingAssignments] = useState(false);
  const [csrAttendanceAssignments, setCsrAttendanceAssignments] = useState<any[]>([]);
  const [loadingCSRAttendanceAssignments, setLoadingCSRAttendanceAssignments] = useState(false);
  const [markingAttendanceId, setMarkingAttendanceId] = useState<string | null>(null);
  const [campaignLeadInvitations, setCampaignLeadInvitations] = useState<CampaignLeadInvitation[]>([]);
  const [campaignLeadAssignments, setCampaignLeadAssignments] = useState<CampaignLeadAssignment[]>([]);
  const [campaignVolunteerAssignments, setCampaignVolunteerAssignments] = useState<CampaignVolunteerAssignment[]>([]);
  const [loadingCampaignVolunteerAssignments, setLoadingCampaignVolunteerAssignments] = useState(false);
  const [loadingCampaignLeadInvitations, setLoadingCampaignLeadInvitations] = useState(false);
  const [loadingCampaignLeadAssignments, setLoadingCampaignLeadAssignments] = useState(false);
  const [respondingCampaignLeadInviteId, setRespondingCampaignLeadInviteId] = useState<string | null>(null);
  const [ongoingNeeds, setOngoingNeeds] = useState<any[]>([]);
  const [historyNeeds, setHistoryNeeds] = useState<any[]>([]);
  const [csrProjects, setCsrProjects] = useState<any[]>([]);
  const [projectEvidenceById, setProjectEvidenceById] = useState<Record<string, any>>({});
  const [loadingEvidenceProjectId, setLoadingEvidenceProjectId] = useState<string | null>(null);
  const [loadingCSRProjects, setLoadingCSRProjects] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [loadingOfferApplications, setLoadingOfferApplications] = useState(false);
  const [loadingOfferRequests, setLoadingOfferRequests] = useState(false);
  const [updatingOfferRequestId, setUpdatingOfferRequestId] = useState<number | null>(null);
  const [capabilityOffersTab, setCapabilityOffersTab] = useState<'your-capabilities' | 'your-applications' | 'requests'>('your-capabilities');
  const [offerRequestsTab, setOfferRequestsTab] = useState<'pending' | 'in-progress' | 'history'>('pending');
  const [yourNeedsTab, setYourNeedsTab] = useState<'ongoing-needs' | 'history-needs'>('ongoing-needs');
  const [trackingTab, setTrackingTab] = useState<'ongoing-projects' | 'history-projects' | 'ongoing-needs' | 'history-needs'>('ongoing-needs');
  const [csrProjectsTab, setCsrProjectsTab] = useState<'invitations' | 'ongoing' | 'completed'>('invitations');
  const [csrProjectsSectionTab, setCsrProjectsSectionTab] = useState<'ngo-projects' | 'other-csr'>('ngo-projects');
  const [deletingRequest, setDeletingRequest] = useState<number | null>(null);
  const sidebarItems = [
    { value: 'profile', label: 'Profile' },
    { value: 'service-offers', label: 'Capability Offers' },
    { value: 'service-requests', label: 'Your Needs' },
    { value: 'csr-projects', label: 'CSR Projects' },
  ];

  // Handle service request deletion
  const handleDeleteRequest = async (requestId: number, requestTitle: string) => {
    if (!confirm(`Are you sure you want to delete "${requestTitle}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingRequest(requestId);
      const token = localStorage.getItem('token');
      
      const response = await fetch(`/api/service-requests/${requestId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Success",
          description: "Service request deleted successfully",
        });
        // Refresh the service requests
        fetchServiceRequests();
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to delete service request",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete service request",
        variant: "destructive",
      });
    } finally {
      setDeletingRequest(null);
    }
  };

  // Fetch real service offers data
  const fetchServiceOffers = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      console.log('Fetching service offers...');
      const response = await fetch('/api/service-offers?view=my-offers&include_expired=true&limit=50', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      console.log('Service offers response:', data);
      if (data.success) {
        setServiceOffers(data.data || []);
        console.log('Service offers set:', data.data?.length || 0, 'items');
      } else {
        console.error('Service offers fetch failed:', data.error);
      }
    } catch (error) {
      console.error('Error fetching service offers:', error);
    }
  };

  const isHistoryNeed = (request: any) => {
    const status = String(request?.status || '').toLowerCase();
    return status === 'completed' || status === 'cancelled';
  };

  // Fetch NGO's own service requests for dashboard Your Needs
  const fetchServiceRequests = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const [ongoingResponse, historyResponse] = await Promise.all([
        fetch('/api/service-request-assignments?view=ongoing', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/service-request-assignments?view=history', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      const ongoingData = await ongoingResponse.json();
      const historyData = await historyResponse.json();

      if (ongoingData.success) {
        setOngoingNeeds(Array.isArray(ongoingData.data) ? ongoingData.data : []);
      }
      if (historyData.success) {
        setHistoryNeeds(Array.isArray(historyData.data) ? historyData.data : []);
      }
    } catch (error) {
      console.error('Error fetching service requests:', error);
    }
  };

  const fetchOfferApplications = async () => {
    try {
      setLoadingOfferApplications(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setOfferApplications([]);
        return;
      }

      const response = await fetch('/api/service-offers?view=my-responses&limit=20', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await response.json();
      setOfferApplications(data.success ? (data.data || []) : []);
    } catch (error) {
      console.error('Error fetching offer applications:', error);
      setOfferApplications([]);
    } finally {
      setLoadingOfferApplications(false);
    }
  };

  const fetchOfferRequests = async () => {
    try {
      setLoadingOfferRequests(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setOfferRequests([]);
        return;
      }

      const response = await fetch('/api/service-offers/requests', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await response.json();
      setOfferRequests(data.success ? (data.data || []) : []);
    } catch (error) {
      console.error('Error fetching offer requests:', error);
      setOfferRequests([]);
    } finally {
      setLoadingOfferRequests(false);
    }
  };

  const pendingOfferRequests = offerRequests.filter((request) => getOfferRequestBucket(request) === 'pending');
  const inProgressOfferRequests = offerRequests.filter((request) => getOfferRequestBucket(request) === 'in-progress');
  const historyOfferRequests = offerRequests.filter((request) => getOfferRequestBucket(request) === 'history');

  const fetchCompanyProjectApplications = async () => {
    try {
      setLoadingCompanyProjectApplications(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setCompanyProjectApplications([]);
        return;
      }

      const response = await fetch('/api/service-request-assignments?mode=ngo-company-applications', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const payload = await response.json();
      if (response.ok && payload?.success) {
        setCompanyProjectApplications(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setCompanyProjectApplications([]);
      }
    } catch (error) {
      console.error('Error fetching company project applications:', error);
      setCompanyProjectApplications([]);
    } finally {
      setLoadingCompanyProjectApplications(false);
    }
  };

  const fetchCSRTrackingAssignments = async () => {
    try {
      setLoadingCSRTrackingAssignments(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setCsrTrackingAssignments([]);
        return;
      }

      const response = await fetch('/api/service-request-assignments?mode=csr-tracking', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const payload = await response.json();
      if (response.ok && payload?.success) {
        setCsrTrackingAssignments(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setCsrTrackingAssignments([]);
      }
    } catch (error) {
      console.error('Error fetching CSR tracking assignments:', error);
      setCsrTrackingAssignments([]);
    } finally {
      setLoadingCSRTrackingAssignments(false);
    }
  };

  const fetchCampaignLeadInvitations = async () => {
    try {
      setLoadingCampaignLeadInvitations(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setCampaignLeadInvitations([]);
        return;
      }

      const response = await fetch('/api/campaigns/lead-invitations', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json();
      if (response.ok && payload?.success) {
        setCampaignLeadInvitations(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setCampaignLeadInvitations([]);
      }
    } catch (error) {
      console.error('Error fetching campaign lead invitations:', error);
      setCampaignLeadInvitations([]);
    } finally {
      setLoadingCampaignLeadInvitations(false);
    }
  };

  const fetchCampaignLeadAssignments = async () => {
    try {
      setLoadingCampaignLeadAssignments(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setCampaignLeadAssignments([]);
        return;
      }

      const response = await fetch('/api/campaigns/lead-assignments', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json();
      if (response.ok && payload?.success) {
        setCampaignLeadAssignments(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setCampaignLeadAssignments([]);
      }
    } catch (error) {
      console.error('Error fetching campaign lead assignments:', error);
      setCampaignLeadAssignments([]);
    } finally {
      setLoadingCampaignLeadAssignments(false);
    }
  };

  const fetchCampaignVolunteerAssignments = async () => {
    try {
      setLoadingCampaignVolunteerAssignments(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setCampaignVolunteerAssignments([]);
        return;
      }

      const response = await fetch('/api/campaigns/volunteer-assignments', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok && data?.success) {
        setCampaignVolunteerAssignments(Array.isArray(data.data) ? data.data : []);
      } else {
        setCampaignVolunteerAssignments([]);
      }
    } catch (error) {
      console.error('Error fetching campaign volunteer assignments:', error);
      setCampaignVolunteerAssignments([]);
    } finally {
      setLoadingCampaignVolunteerAssignments(false);
    }
  };

  const respondCampaignLeadInvitation = async (campaignId: string, decision: 'accepted' | 'rejected') => {
    try {
      setRespondingCampaignLeadInviteId(campaignId);
      const token = localStorage.getItem('token');
      if (!token) {
        toast({ title: 'Error', description: 'Please login again', variant: 'destructive' });
        return;
      }

      if (decision === 'accepted') {
        const response = await fetch('/api/campaigns/accept-lead', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ campaign_id: campaignId }),
        });

        const payload = await response.json();
        if (!response.ok || !payload?.success) {
          toast({ title: 'Accept failed', description: payload?.error || 'Could not accept lead NGO invite', variant: 'destructive' });
          return;
        }

        toast({
          title: 'Lead role accepted',
          description: 'This campaign is now in Ongoing CSR. It will show as Started once the campaign begins.',
        });

        setCsrProjectsSectionTab('other-csr');
        setCsrProjectsTab('ongoing');
      }

      await Promise.all([fetchCampaignLeadInvitations(), fetchCampaignLeadAssignments()]);
    } catch (error) {
      toast({ title: 'Error', description: 'Could not respond to campaign invitation', variant: 'destructive' });
    } finally {
      setRespondingCampaignLeadInviteId(null);
    }
  };

  const reviewCompanyProjectApplication = async (projectId: string, companyId: number, decision: 'accepted' | 'rejected') => {
    const key = `${projectId}:${companyId}`;
    try {
      setReviewingCompanyApplicationKey(key);
      const token = localStorage.getItem('token');
      if (!token) {
        toast({ title: 'Error', description: 'Please login again', variant: 'destructive' });
        return;
      }

      const response = await fetch('/api/service-request-assignments', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'review-project-application',
          projectId,
          companyId,
          decision
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        toast({ title: 'Review failed', description: payload?.error || 'Could not review application', variant: 'destructive' });
        return;
      }

      toast({
        title: decision === 'accepted' ? 'Company application accepted' : 'Company application rejected',
        description: decision === 'accepted'
          ? 'All active needs in this project moved into execution tracking.'
          : 'Application was rejected for this project.'
      });

      fetchCompanyProjectApplications();
      fetchServiceRequests();
      fetchCSRTrackingAssignments();
    } catch (error) {
      toast({ title: 'Review failed', description: 'Could not review application', variant: 'destructive' });
    } finally {
      setReviewingCompanyApplicationKey(null);
    }
  };

  const handleOfferRequestStatusUpdate = async (requestId: number, newStatus: 'accepted' | 'rejected') => {
    try {
      setUpdatingOfferRequestId(requestId);
      const token = localStorage.getItem('token');

      const response = await fetch(`/api/service-offers/requests/${requestId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await response.json();
      if (!data.success) {
        toast({
          title: 'Error',
          description: data.error || 'Failed to update request status',
          variant: 'destructive'
        });
        return;
      }

      setOfferRequests((prev) =>
        prev.map((request) => {
          if (request.id === requestId) {
            return {
              ...request,
              status: newStatus,
              isAssigned: newStatus === 'accepted'
            };
          }

          const isActionableProjectApplicationStatus = (status: string): boolean => {
            const normalized = String(status || '').toLowerCase();
            return ['pending', 'pledged', 'invited', 'pending_acceptance', 'awaiting_acceptance', 'offered', 'assigned'].includes(normalized);
          };

          if (
            newStatus === 'accepted' &&
            request.service_offer_id === data.data.service_offer_id &&
            (request.status === 'pending' || request.status === 'accepted')
          ) {
            return {
              ...request,
              status: 'rejected',
              isAssigned: false
            };
          }

          return request;
        })
      );

      toast({
        title: 'Success',
        description: newStatus === 'accepted' ? 'Request accepted and offer assigned' : 'Request rejected'
      });
    } catch (error) {
      console.error('Error updating offer request status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update request status',
        variant: 'destructive'
      });
    } finally {
      setUpdatingOfferRequestId(null);
    }
  };

  const fetchCSRProjects = async () => {
    try {
      setLoadingCSRProjects(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setCsrProjects([]);
        return;
      }

      const response = await fetch('/api/csr-projects', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (response.ok && data?.success) {
        setCsrProjects(Array.isArray(data.data) ? data.data : []);
      } else {
        setCsrProjects([]);
      }
    } catch (error) {
      console.error('Error fetching CSR projects:', error);
      setCsrProjects([]);
    } finally {
      setLoadingCSRProjects(false);
    }
  };

  const fetchCSRAttendanceAssignments = async () => {
    try {
      setLoadingCSRAttendanceAssignments(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setCsrAttendanceAssignments([]);
        return;
      }

      const response = await fetch('/api/service-assignments?role=assigned&targetType=csr_project', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (response.ok && data?.success) {
        setCsrAttendanceAssignments(Array.isArray(data.data) ? data.data : []);
      } else {
        setCsrAttendanceAssignments([]);
      }
    } catch (error) {
      console.error('Error fetching CSR attendance assignments:', error);
      setCsrAttendanceAssignments([]);
    } finally {
      setLoadingCSRAttendanceAssignments(false);
    }
  };

  const getLocalDateString = (reference: Date = new Date()) => {
    const year = reference.getFullYear();
    const month = String(reference.getMonth() + 1).padStart(2, '0');
    const day = String(reference.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getNgoAttendanceUnits = () => {
    const profileData = (user as any)?.profile_data || {};
    const capacity = Number(
      (user as any)?.ngo_volunteer_capacity ??
      profileData.ngo_volunteer_capacity ??
      profileData.team_strength ??
      0
    );
    return Number.isFinite(capacity) && capacity > 0 ? capacity : 1;
  };

  const handleMarkCampaignVolunteerAttendance = async (assignment: CampaignVolunteerAssignmentItem) => {
    const token = localStorage.getItem('token');
    if (!token || !assignment.assignment_id) {
      toast({ title: 'Authentication required', description: 'Please sign in again to mark attendance.', variant: 'destructive' });
      return;
    }

    const today = getLocalDateString();
    const attendanceSummary = assignment.attendance_summary || {};
    if (String(attendanceSummary.last_attendance_at || '') === today) {
      toast({ title: 'Already marked', description: "Today's attendance has already been submitted." });
      return;
    }

    const location = await new Promise<{ latitude: number; longitude: number; accuracy?: number } | null>((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });

    if (!location) {
      toast({
        title: 'Location required',
        description: 'Please share your location to mark attendance.',
        variant: 'destructive'
      });
      return;
    }

    try {
      setMarkingAttendanceId(String(assignment.assignment_id));
      const response = await fetch(`/api/service-assignments/${assignment.assignment_id}/attendance`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          attendanceStatus: 'present',
          attendanceSource: 'ngo_dashboard',
          attendanceDate: today,
          locationLatitude: location.latitude,
          locationLongitude: location.longitude,
          locationAccuracy: location.accuracy,
          units: getNgoAttendanceUnits()
        })
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to mark attendance');
      }

      toast({ title: 'Attendance marked', description: `Attendance saved for ${getNgoAttendanceUnits()} people.` });
      await fetchCampaignVolunteerAssignments();
    } catch (error) {
      toast({
        title: 'Attendance failed',
        description: error instanceof Error ? error.message : 'Could not mark attendance.',
        variant: 'destructive'
      });
    } finally {
      setMarkingAttendanceId(null);
    }
  };

  const handleMarkCSRAttendance = async (assignment: any) => {
    const token = localStorage.getItem('token');
    if (!token) {
      toast({ title: 'Authentication required', description: 'Please sign in again to mark attendance.', variant: 'destructive' });
      return;
    }

    const today = getLocalDateString();
    const attendanceSummary = assignment?.meta?.attendance_summary || {};
    if (String(attendanceSummary.last_attendance_at || '') === today) {
      toast({ title: 'Already marked', description: "Today's attendance has already been submitted." });
      return;
    }

    const location = await new Promise<{ latitude: number; longitude: number; accuracy?: number } | null>((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });

    if (!location) {
      toast({
        title: 'Location required',
        description: 'Please share your location to mark NGO attendance.',
        variant: 'destructive'
      });
      return;
    }

    try {
      setMarkingAttendanceId(String(assignment.id));
      const response = await fetch(`/api/service-assignments/${assignment.id}/attendance`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          attendanceStatus: 'present',
          attendanceSource: 'ngo_dashboard',
          attendanceDate: today,
          locationLatitude: location.latitude,
          locationLongitude: location.longitude,
          locationAccuracy: location.accuracy,
          units: getNgoAttendanceUnits()
        })
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to mark attendance');
      }

      toast({ title: 'Attendance marked', description: `Attendance saved for ${getNgoAttendanceUnits()} people.` });
      await fetchCSRAttendanceAssignments();
    } catch (error) {
      toast({
        title: 'Attendance failed',
        description: error instanceof Error ? error.message : 'Could not mark attendance.',
        variant: 'destructive'
      });
    } finally {
      setMarkingAttendanceId(null);
    }
  };

  const refreshDashboardData = async () => {
    if (!user?.id) return;

    await Promise.all([
      fetchServiceOffers(),
      fetchServiceRequests(),
      fetchOfferApplications(),
      fetchOfferRequests(),
      fetchCompanyProjectApplications(),
      fetchCSRTrackingAssignments(),
      fetchCSRAttendanceAssignments(),
      fetchCampaignLeadInvitations(),
      fetchCampaignLeadAssignments(),
      fetchCampaignVolunteerAssignments(),
      fetchCSRProjects()
    ]);
  };

  const fetchProjectEvidenceTimeline = async (projectId: string) => {
    try {
      setLoadingEvidenceProjectId(projectId);
      const token = localStorage.getItem('token');
      if (!token) {
        return;
      }

      const response = await fetch(`/api/csr-projects/${projectId}/evidence`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (response.ok && data?.success) {
        setProjectEvidenceById((prev) => ({ ...prev, [projectId]: data.data }));
      }
    } catch (error) {
      console.error('Error fetching project evidence timeline:', error);
    } finally {
      setLoadingEvidenceProjectId(null);
    }
  };

  // Fetch all real data when component mounts
  useEffect(() => {
    if (!user?.id) return;

    const runAutoUpdate = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        await fetch('/api/auto-update-statuses', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
      } catch (autoUpdateError) {
        console.error('Auto-update error (non-critical):', autoUpdateError);
      }
    };

    const loadData = async () => {
      console.log('NGO Dashboard: Starting to fetch all data for user:', user.id);
      setLoadingData(true);
      await runAutoUpdate();
      await refreshDashboardData();
      setLoadingData(false);
      console.log('NGO Dashboard: Finished fetching all data');
    };

    loadData();

    // Realtime subscriptions (Supabase) for NGO dashboard
    const realtime = createSupabaseClient();
    const channel = realtime.channel('realtime-ngo-dashboard');

    const handleChange = (table: string) => {
      if (table === 'service_request_projects') fetchCSRProjects();
      else if (table === 'service_requests') fetchServiceRequests();
      else if (table === 'service_offers') { fetchServiceOffers(); fetchOfferRequests(); }
      else if (table === 'service_engagement_assignments') { fetchCSRTrackingAssignments(); fetchCSRAttendanceAssignments(); }
    }

    ['service_request_projects', 'service_requests', 'service_offers', 'service_engagement_assignments'].forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => handleChange(table));
    });
    void channel.subscribe();

    return () => {
      try { realtime.removeChannel(channel); } catch (e) { /* ignore */ }
    };
  }, [user?.id]);

  const allVerified = Boolean(
    user?.email_verified &&
    user?.phone_verified &&
    user?.verification_status === 'verified'
  );

  const getProjectBucket = (project: any): 'invitation' | 'ongoing' | 'completed' => {
    const status = String(project?.project_status || '').toLowerCase().trim();
    const progress = Number(project?.progress_percentage ?? 0);

    if (['completed', 'closed', 'finished', 'done'].includes(status) || progress >= 100) {
      return 'completed';
    }

    if (['invited', 'pending', 'pending_acceptance', 'awaiting_acceptance', 'assigned', 'offered'].includes(status)) {
      return 'invitation';
    }

    return 'ongoing';
  };

  const getNeedTrackingBadgeClass = (status: string): string => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'completed') return 'bg-green-100 text-green-800 border-green-200';
    if (normalized === 'in_progress' || normalized === 'active') return 'bg-blue-100 text-blue-800 border-blue-200';
    if (normalized === 'accepted') return 'bg-amber-100 text-amber-800 border-amber-200';
    if (normalized === 'cancelled' || normalized === 'rejected') return 'bg-red-100 text-red-800 border-red-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const getNeedTrackingSummary = (needs: Array<{ status: string }>) => {
    let completed = 0;
    let inProgress = 0;
    let accepted = 0;

    for (const need of needs || []) {
      const normalized = String(need?.status || '').toLowerCase();
      if (normalized === 'completed') {
        completed += 1;
      } else if (normalized === 'in_progress' || normalized === 'active') {
        inProgress += 1;
      } else if (normalized === 'accepted') {
        accepted += 1;
      }
    }

    return { completed, inProgress, accepted };
  };

  const ongoingCampaignVolunteerAssignments = campaignVolunteerAssignments.filter((assignment) => assignment.lifecycle !== 'completed');
  const completedCampaignVolunteerAssignments = campaignVolunteerAssignments.filter((assignment) => assignment.lifecycle === 'completed');
  const ongoingCampaignLeadAssignments = campaignLeadAssignments.filter((assignment) => assignment.lifecycle !== 'completed');
  const completedCampaignLeadAssignments = campaignLeadAssignments.filter((assignment) => assignment.lifecycle === 'completed');
  const ongoingCSRProjects = csrProjects.filter((project) => getProjectBucket(project) === 'ongoing');
  const completedCSRProjects = csrProjects.filter((project) => getProjectBucket(project) === 'completed');
  const otherCsrCount =
    campaignLeadInvitations.length +
    ongoingCampaignLeadAssignments.length +
    completedCampaignLeadAssignments.length +
    ongoingCSRProjects.length +
    completedCSRProjects.length;
  const ongoingTrackingProjects = csrTrackingAssignments.filter((assignment) => !['completed', 'closed', 'cancelled'].includes(String(assignment.assignment_status || '').toLowerCase()));
  const historyTrackingProjects = csrTrackingAssignments.filter((assignment) => ['completed', 'closed', 'cancelled'].includes(String(assignment.assignment_status || '').toLowerCase()));
  const navigateToTab = (value: string) => {
    if (value === 'service-offers') {
      setCapabilityOffersTab('your-capabilities');
    }
    if (value === 'service-requests') {
      setYourNeedsTab('ongoing-needs');
      setTrackingTab('ongoing-needs');
    }
    if (value === 'csr-projects') {
      setCsrProjectsSectionTab('ngo-projects');
      setCsrProjectsTab('invitations');
    }
    router.replace(`/ngos/dashboard?tab=${value}`, { scroll: false });
  };

  return (
    <ProtectedRoute userTypes={['ngo']}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 p-4 md:p-6 lg:p-8 bg-gray-50">
          <div className="mx-auto max-w-7xl space-y-8">
            {/* Dashboard Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                <p className="text-gray-500 mt-1">
                  Manage your NGO capability offers, service requests, and CSR projects
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <DashboardQuickSidebar
                items={sidebarItems}
                activeTab={activeTab}
                onSelect={navigateToTab}
                desktopClassName="lg:col-span-4"
                triggerLabel="Dashboard sections"
              />

              <div className="lg:col-span-8">
                <Card>
                  <CardContent className="pt-6">
                    <Tabs value={activeTab} onValueChange={(value) => {
                      window.history.replaceState(null, '', `/ngos/dashboard?tab=${value}`);
                      router.replace(`/ngos/dashboard?tab=${value}`, { scroll: false });
                    }} className="w-full">
                  <TabsContent value="profile" className="mt-4 space-y-4">
                    <ProfileDashboardTab />
                  </TabsContent>
                  
                  <TabsContent value="service-offers" className="mt-4 space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="font-medium">Capability Offers</h3>
                      <Link href="/service-offers/create">
                        <Button variant="outline" size="sm">
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add Service
                        </Button>
                      </Link>
                    </div>

                    <Tabs value={capabilityOffersTab} onValueChange={(value) => setCapabilityOffersTab(value as 'your-capabilities' | 'your-applications' | 'requests')} className="w-full">
                      <TabsList className="grid w-full grid-cols-3 h-auto">
                        <TabsTrigger value="your-capabilities">Your Capabilities</TabsTrigger>
                        <TabsTrigger value="your-applications">Your Applications</TabsTrigger>
                        <TabsTrigger value="requests">Offer Applications</TabsTrigger>
                      </TabsList>

                      <TabsContent value="your-capabilities" className="mt-4 space-y-3">
                        <YourCapabilitiesPanel
                          offers={serviceOffers}
                          loading={loadingData}
                          createLabel="Create Your First Service Offer"
                          emptyDescription="Publish capability offers for NGOs to discover and apply."
                        />
                      </TabsContent>

                      <TabsContent value="your-applications" className="mt-4 space-y-3">
                        {loadingOfferApplications ? (
                          <div className="p-6 text-center text-muted-foreground">Loading your applications...</div>
                        ) : offerApplications.length === 0 ? (
                          <div className="p-8 text-center text-muted-foreground">
                            <p className="text-lg font-medium mb-2">No applications yet</p>
                            <p className="text-sm">Your applications on capability offers will appear here.</p>
                          </div>
                        ) : offerApplications.map((offer) => (
                          <div key={offer.id} className="rounded-md border bg-white p-4 space-y-3">
                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                              <div>
                                <p className="font-semibold">{offer.title}</p>
                                <p className="text-sm text-muted-foreground">{offer.provider_name || offer.ngo_name || 'Provider not available'}</p>
                              </div>
                              <Badge variant="outline">{offer.status || 'active'}</Badge>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Link href={`/service-offers/${offer.id}`}>
                                <Button variant="outline" size="sm">View Offer</Button>
                              </Link>
                            </div>
                              <div className="text-xs text-slate-500">Valid until: {formatDisplayDate(offer.valid_until) || 'Not set'}</div>
                          </div>
                        ))}
                      </TabsContent>

                      <TabsContent value="requests" className="mt-4 space-y-3">
                        <Tabs value={offerRequestsTab} onValueChange={(value) => setOfferRequestsTab(value as 'pending' | 'in-progress' | 'history')} className="w-full">
                          <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="pending">Pending</TabsTrigger>
                            <TabsTrigger value="in-progress">In Progress</TabsTrigger>
                            <TabsTrigger value="history">History</TabsTrigger>
                          </TabsList>

                          <TabsContent value="pending" className="mt-4 space-y-3">
                            {loadingOfferRequests ? (
                              <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin" />
                              </div>
                            ) : pendingOfferRequests.length === 0 ? (
                              <div className="p-8 text-center text-muted-foreground">
                                <p className="text-lg font-medium mb-2">No pending requests</p>
                                <p className="text-sm">Incoming requests on your offers will appear here.</p>
                              </div>
                            ) : pendingOfferRequests.map((request) => (
                              <div key={request.id} className="rounded-md border bg-white p-4 space-y-3">
                                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                  <div>
                                    <p className="font-semibold">{request.offer_title}</p>
                                    <p className="text-sm text-muted-foreground">
                                      Requester: {request.client?.name || 'Unknown'} ({request.client?.user_type || 'participant'})
                                    </p>
                                    <p className="text-sm text-muted-foreground">{request.client?.email || 'No email available'}</p>
                                    {request.message ? (
                                      <div className="mt-2 rounded-md bg-muted p-3 text-sm text-foreground">
                                        {request.message}
                                      </div>
                                    ) : null}
                                    {formatSelectedNeeds(request).length > 0 ? (
                                      <div className="mt-3 rounded-md bg-slate-50 p-3">
                                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Selected needs</p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          {formatSelectedNeeds(request).map((needLabel) => (
                                            <Badge key={needLabel} variant="secondary" className="rounded-full bg-white text-slate-700 border border-slate-200">
                                              {needLabel}
                                            </Badge>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="capitalize">{request.status}</Badge>
                                    <Badge className={request.isAssigned ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}>
                                      {request.isAssigned ? 'Assigned' : 'Not Assigned'}
                                    </Badge>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleOfferRequestStatusUpdate(request.id, 'accepted')}
                                    disabled={updatingOfferRequestId === request.id}
                                    className="bg-green-600 hover:bg-green-700"
                                  >
                                    {updatingOfferRequestId === request.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <>
                                        <CheckCircle size={14} className="mr-1" />
                                        Accept
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleOfferRequestStatusUpdate(request.id, 'rejected')}
                                    disabled={updatingOfferRequestId === request.id}
                                    className="border-red-300 text-red-600 hover:bg-red-50"
                                  >
                                    {updatingOfferRequestId === request.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <>
                                        <XCircle size={14} className="mr-1" />
                                        Reject
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </TabsContent>

                          <TabsContent value="in-progress" className="mt-4 space-y-3">
                            {loadingOfferRequests ? (
                              <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin" />
                              </div>
                            ) : inProgressOfferRequests.length === 0 ? (
                              <div className="p-8 text-center text-muted-foreground">
                                <p className="text-lg font-medium mb-2">No active requests</p>
                                <p className="text-sm">Accepted requests that are now in progress will appear here.</p>
                              </div>
                            ) : inProgressOfferRequests.map((request) => {
                              const billing = getOfferRequestBillingDetails(request);

                              return (
                                <div key={request.id} className="rounded-md border bg-white p-4 space-y-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate font-semibold">{request.offer_title}</p>
                                      <p className="truncate text-sm text-muted-foreground">
                                        {request.client?.name || 'Unknown'} · {request.client?.user_type || 'participant'}
                                      </p>
                                      <p className="truncate text-sm text-muted-foreground">{request.client?.email || 'No email available'}</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                      <Badge variant="outline" className="capitalize whitespace-nowrap">{request.status}</Badge>
                                      <Badge className={`${request.isAssigned ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'} whitespace-nowrap`}>
                                        {request.isAssigned ? 'Assigned' : 'Not Assigned'}
                                      </Badge>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
                                    <div className="min-w-0">
                                      <p className="text-xs uppercase tracking-wide text-slate-500">Assigned</p>
                                      <p className="truncate">{formatDisplayDate(billing.assignedAt) || 'Not set'}</p>
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs uppercase tracking-wide text-slate-500">Billing</p>
                                      <p className="truncate">{billing.billingCycle || 'one_time'} · {billing.paymentMode || 'prepaid'}</p>
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs uppercase tracking-wide text-slate-500">Amount</p>
                                      <p className="truncate">{formatInrAmount(billing.paymentAmount)} · {billing.paymentRequired ? 'Due' : 'No payment'}</p>
                                    </div>
                                  </div>

                                  {request.message ? <p className="text-sm text-slate-600 break-words">{request.message}</p> : null}
                                  {formatSelectedNeeds(request).length > 0 ? (
                                    <p className="text-xs text-slate-500 break-words">
                                      Needs: {formatSelectedNeeds(request).join(' · ')}
                                    </p>
                                  ) : null}

                                  {isDailyRentalEngagementMeta(request.response_meta) ? (
                                    <InlineSkillServiceFulfillment
                                      application={toOfferRentalApplication(request)}
                                      role="ngo"
                                      title="Capability offer rental"
                                      onUpdated={fetchOfferRequests}
                                    />
                                  ) : null}

                                  <div className="space-y-1 text-sm text-slate-600">
                                    <p>This decision is final. Use tracking and project screens to manage the engagement.</p>
                                    <p className="text-xs text-slate-500">Request ID: {request.id}</p>
                                    {request.service_request_id ? (
                                      <p className="text-xs text-slate-500">Linked service request: {request.service_request_id}</p>
                                    ) : null}
                                    {request.assignment_id ? (
                                      <p className="text-xs text-slate-500">Assignment ID: {request.assignment_id}</p>
                                    ) : null}
                                  </div>

                                  <div className="flex flex-wrap gap-2">
                                    <Link href={request.assignment_id ? `/service-request-assignments/${request.assignment_id}` : `/service-requests/${request.id ?? request.service_request_id}`}>
                                      <Button size="sm" variant="outline">Track engagement</Button>
                                    </Link>
                                  </div>
                                </div>
                              );
                            })}
                          </TabsContent>

                          <TabsContent value="history" className="mt-4 space-y-3">
                            {loadingOfferRequests ? (
                              <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin" />
                              </div>
                            ) : historyOfferRequests.length === 0 ? (
                              <div className="p-8 text-center text-muted-foreground">
                                <p className="text-lg font-medium mb-2">No history yet</p>
                                <p className="text-sm">Rejected, completed, or cancelled requests will appear here.</p>
                              </div>
                            ) : historyOfferRequests.map((request) => (
                              <div key={request.id} className="rounded-md border bg-white p-4 space-y-3">
                                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                  <div>
                                    <p className="font-semibold">{request.offer_title}</p>
                                    <p className="text-sm text-muted-foreground">
                                      Requester: {request.client?.name || 'Unknown'} ({request.client?.user_type || 'participant'})
                                    </p>
                                    <p className="text-sm text-muted-foreground">{request.client?.email || 'No email available'}</p>
                                    {request.message ? (
                                      <div className="mt-2 rounded-md bg-muted p-3 text-sm text-foreground">
                                        {request.message}
                                      </div>
                                    ) : null}
                                    {formatSelectedNeeds(request).length > 0 ? (
                                      <div className="mt-3 rounded-md bg-slate-50 p-3">
                                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Selected needs</p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          {formatSelectedNeeds(request).map((needLabel) => (
                                            <Badge key={needLabel} variant="secondary" className="rounded-full bg-white text-slate-700 border border-slate-200">
                                              {needLabel}
                                            </Badge>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="capitalize">{request.status}</Badge>
                                    <Badge className={request.isAssigned ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}>
                                      {request.isAssigned ? 'Assigned' : 'Not Assigned'}
                                    </Badge>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Link href={`/service-offers/${request.service_offer_id}`}>
                                    <Button size="sm" variant="outline">View Offer</Button>
                                  </Link>
                                </div>
                              </div>
                            ))}
                          </TabsContent>
                        </Tabs>
                      </TabsContent>
                    </Tabs>
                  </TabsContent>
                  
                  <TabsContent value="service-requests" className="mt-4 space-y-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <h3 className="font-medium">Your Needs</h3>
                      <Link href="/service-requests/create">
                        <Button variant="outline" size="sm">
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add Request
                        </Button>
                      </Link>
                    </div>

                    <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">Company Project Applications</p>
                          <p className="text-sm text-slate-600">Companies can apply once to fulfill the full project scope (all needs under the project).</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={fetchCompanyProjectApplications}>Refresh</Button>
                      </div>

                      {loadingCompanyProjectApplications ? (
                        <div className="flex items-center justify-center py-6 text-sm text-slate-600">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Loading company applications...
                        </div>
                      ) : companyProjectApplications.length === 0 ? (
                        <p className="text-sm text-slate-600">No company project applications yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {companyProjectApplications.map((application) => {
                            const appKey = `${application.project_id}:${application.company_id}`;
                            const isPending = isActionableProjectApplicationStatus(application.status);
                            return (
                              <div key={appKey} className="rounded-md border bg-white p-3 space-y-2">
                                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                  <div>
                                    <p className="font-semibold">{application.project_title}</p>
                                    <p className="text-sm text-slate-600">Company: {application.company_name}</p>
                                    <p className="text-xs text-slate-500">{application.company_email || 'No email'} • {application.project_location || 'Location not set'}</p>
                                  </div>
                                  <Badge variant="outline" className={`w-fit ${getStatusBadgeClass(application.status)}`}>
                                    {formatStatusLabel(application.status)}
                                  </Badge>
                                </div>

                                <p className="text-xs text-slate-600">Needs in application: {application.needs.length}</p>
                                <div className="flex flex-wrap gap-2">
                                  {application.needs.slice(0, 4).map((need) => (
                                    <Badge key={need.id} variant="secondary">#{need.id} {need.request_type || 'Need'}</Badge>
                                  ))}
                                  {application.needs.length > 4 && <Badge variant="secondary">+{application.needs.length - 4} more</Badge>}
                                </div>

                                {application.note ? (
                                  <div className="rounded-md bg-muted p-2 text-sm text-foreground">{application.note}</div>
                                ) : null}

                                <div className="flex flex-wrap gap-2">
                                  <Link href={`/service-requests/projects/${application.project_id}`}>
                                    <Button size="sm" variant="outline">View Project</Button>
                                  </Link>
                                  <Button
                                    size="sm"
                                    onClick={() => reviewCompanyProjectApplication(application.project_id, application.company_id, 'accepted')}
                                    disabled={!isPending || reviewingCompanyApplicationKey === appKey}
                                    className="bg-green-600 hover:bg-green-700"
                                  >
                                    {reviewingCompanyApplicationKey === appKey ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Accept Full Project'}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => reviewCompanyProjectApplication(application.project_id, application.company_id, 'rejected')}
                                    disabled={!isPending || reviewingCompanyApplicationKey === appKey}
                                    className="border-red-300 text-red-600 hover:bg-red-50"
                                  >
                                    {reviewingCompanyApplicationKey === appKey ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reject'}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <Tabs value={trackingTab} onValueChange={(value) => setTrackingTab(value as 'ongoing-projects' | 'history-projects' | 'ongoing-needs' | 'history-needs')} className="w-full">
                      <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto">
                        <TabsTrigger value="ongoing-projects">Ongoing Projects ({ongoingTrackingProjects.length})</TabsTrigger>
                        <TabsTrigger value="history-projects">History Projects ({historyTrackingProjects.length})</TabsTrigger>
                        <TabsTrigger value="ongoing-needs">Ongoing Needs ({ongoingNeeds.length})</TabsTrigger>
                        <TabsTrigger value="history-needs">History Needs ({historyNeeds.length})</TabsTrigger>
                      </TabsList>

                      <TabsContent value="ongoing-projects" className="mt-4 space-y-3">
                        {ongoingTrackingProjects.length === 0 ? (
                          <div className="p-8 text-center text-muted-foreground">
                            <p className="text-lg font-medium mb-2">No ongoing assigned projects</p>
                            <p className="text-sm">Accepted full-project handoffs will appear here for tracking.</p>
                          </div>
                        ) : ongoingTrackingProjects.map((assignment) => {
                          const summary = getNeedTrackingSummary(assignment.needs || []);
                          return (
                            <div key={`${assignment.project_id}:${assignment.assigned_company_id}`} className="rounded-md border bg-white p-3 space-y-3">
                              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                <div>
                                  <p className="font-semibold">{assignment.project_title}</p>
                                  <p className="text-sm text-slate-600">Assigned Company: {assignment.assigned_company_name}</p>
                                </div>
                                <Badge variant="outline" className={`w-fit ${getStatusBadgeClass(assignment.assignment_status)}`}>
                                  {formatStatusLabel(assignment.assignment_status)}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-1 gap-2 text-xs text-slate-600 sm:grid-cols-4">
                                <p>Total Needs: {assignment.needs.length}</p>
                                <p>Completed: {summary.completed}</p>
                                <p>In Progress: {summary.inProgress}</p>
                                <p>Accepted: {summary.accepted}</p>
                              </div>
                            </div>
                          );
                        })}
                      </TabsContent>

                      <TabsContent value="history-projects" className="mt-4 space-y-3">
                        {historyTrackingProjects.length === 0 ? (
                          <div className="p-8 text-center text-muted-foreground">
                            <p className="text-lg font-medium mb-2">No project history yet</p>
                            <p className="text-sm">Completed project handoffs will appear here.</p>
                          </div>
                        ) : historyTrackingProjects.map((assignment) => {
                          const summary = getNeedTrackingSummary(assignment.needs || []);
                          return (
                            <div key={`${assignment.project_id}:${assignment.assigned_company_id}`} className="rounded-md border bg-white p-3 space-y-3">
                              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                <div>
                                  <p className="font-semibold">{assignment.project_title}</p>
                                  <p className="text-sm text-slate-600">Assigned Company: {assignment.assigned_company_name}</p>
                                </div>
                                <Badge variant="outline" className={`w-fit ${getStatusBadgeClass(assignment.assignment_status)}`}>
                                  {formatStatusLabel(assignment.assignment_status)}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-1 gap-2 text-xs text-slate-600 sm:grid-cols-4">
                                <p>Total Needs: {assignment.needs.length}</p>
                                <p>Completed: {summary.completed}</p>
                                <p>In Progress: {summary.inProgress}</p>
                                <p>Accepted: {summary.accepted}</p>
                              </div>
                            </div>
                          );
                        })}
                      </TabsContent>

                      <TabsContent value="ongoing-needs" className="mt-4 space-y-3">
                        {loadingData ? (
                          <div className="p-6 text-center text-muted-foreground">Loading ongoing needs...</div>
                        ) : ongoingNeeds.length === 0 ? (
                          <div className="p-8 text-center text-muted-foreground">
                            <p className="text-lg font-medium mb-2">No ongoing needs</p>
                            <p className="text-sm">Accepted and active requests will appear here until fulfillment is confirmed.</p>
                          </div>
                        ) : ongoingNeeds.map((request) => (
                          <NgoNeedDashboardInline
                            key={request.id}
                            need={request as NgoNeedDashboardItem}
                            variant="ongoing"
                            onUpdated={fetchServiceRequests}
                          />
                        ))}
                      </TabsContent>

                      <TabsContent value="history-needs" className="mt-4 space-y-3">
                        {loadingData ? (
                          <div className="p-6 text-center text-muted-foreground">Loading history...</div>
                        ) : historyNeeds.length === 0 ? (
                          <div className="p-8 text-center text-muted-foreground">
                            <p className="text-lg font-medium mb-2">No history yet</p>
                            <p className="text-sm">Completed or cancelled requests will appear here.</p>
                          </div>
                        ) : historyNeeds.map((request) => (
                          <NgoNeedDashboardInline
                            key={request.id}
                            need={request as NgoNeedDashboardItem}
                            variant="history"
                          />
                        ))}
                      </TabsContent>
                    </Tabs>
                  </TabsContent>
                  

                  <TabsContent value="csr-projects" className="mt-4 space-y-4">
                    <Tabs
                      value={csrProjectsSectionTab}
                      onValueChange={(value) => setCsrProjectsSectionTab(value as 'ngo-projects' | 'other-csr')}
                      className="w-full"
                    >
                      <TabsList className="grid w-full grid-cols-2 h-auto">
                        <TabsTrigger value="ngo-projects">
                          Taken - in ({csrTrackingAssignments.length})
                        </TabsTrigger>
                        <TabsTrigger value="other-csr">
                          Assignments ({otherCsrCount})
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="ngo-projects" className="mt-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-medium">Taken - in</h3>
                            <p className="text-sm text-muted-foreground">Projects you published that a company has taken in or is working on with you.</p>
                          </div>
                          <Button variant="outline" size="sm" onClick={fetchCSRTrackingAssignments}>Refresh</Button>
                        </div>

                        <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                          {loadingCSRTrackingAssignments ? (
                            <div className="flex items-center justify-center py-6 text-sm text-slate-600">
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              Loading company handoffs...
                            </div>
                          ) : csrTrackingAssignments.length === 0 ? (
                            <div className="py-6 text-center text-muted-foreground">
                              <p className="font-medium">No company handoffs yet</p>
                              <p className="mt-1 text-sm">When a company takes in one of your projects, it will appear here.</p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {csrTrackingAssignments.map((assignment) => (
                                <div key={`${assignment.project_id}:${assignment.assigned_company_id}`} className="rounded-md border bg-white p-4">
                                  <CsrTrackingProjectDetails
                                    assignment={assignment}
                                    partnerLabel="Company"
                                    partnerName={assignment.assigned_company_name}
                                    partnerEmail={assignment.assigned_company_email}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </TabsContent>

                      <TabsContent value="other-csr" className="mt-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-medium">Assignments</h3>
                            <p className="text-sm text-muted-foreground">Invitations, ongoing work, and completed CSR where you are assigned as lead NGO or volunteer.</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              void fetchCSRProjects();
                              void fetchCampaignLeadInvitations();
                              void fetchCampaignLeadAssignments();
                            }}
                          >
                            Refresh
                          </Button>
                        </div>

                    {loadingCSRProjects || loadingCampaignLeadAssignments || loadingCampaignVolunteerAssignments ? (
                      <div className="p-8 text-center text-muted-foreground">Loading CSR projects...</div>
                    ) : (
                      <Tabs value={csrProjectsTab} onValueChange={(value) => setCsrProjectsTab(value as 'invitations' | 'ongoing' | 'completed')} className="w-full">
                        <TabsList className="grid w-full grid-cols-3 h-auto">
                          <TabsTrigger value="invitations">Invitations ({campaignLeadInvitations.length})</TabsTrigger>
                          <TabsTrigger value="ongoing">Ongoing CSR ({ongoingCampaignLeadAssignments.length + ongoingCampaignVolunteerAssignments.length + ongoingCSRProjects.length})</TabsTrigger>
                          <TabsTrigger value="completed">Completed CSR ({completedCampaignLeadAssignments.length + completedCampaignVolunteerAssignments.length + completedCSRProjects.length})</TabsTrigger>
                        </TabsList>

                        <TabsContent value="invitations" className="mt-4 space-y-3">
                          <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="font-semibold text-slate-900">CSR Campaign Lead NGO Invitations</p>
                                <p className="text-sm text-slate-600">Companies invite your NGO to lead a CSR campaign before it is published.</p>
                              </div>
                              <Button variant="outline" size="sm" onClick={fetchCampaignLeadInvitations}>Refresh</Button>
                            </div>

                            {loadingCampaignLeadInvitations ? (
                              <div className="flex items-center justify-center py-4 text-sm text-slate-600">
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Loading invitations...
                              </div>
                            ) : campaignLeadInvitations.length === 0 ? (
                              <div className="py-8 text-center text-muted-foreground">
                                <p className="font-medium">No invitations pending</p>
                                <p className="mt-1 text-sm">CSR campaign lead invites from companies will appear here.</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {campaignLeadInvitations.map((invite) => {
                                  const actionable = ['pending', 'invited', 'pending_acceptance', 'awaiting_acceptance', 'offered', 'assigned'].includes(String(invite.status || '').toLowerCase());
                                  return (
                                    <div key={invite.id} className="rounded-md border bg-white p-3 space-y-2">
                                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                        <div>
                                          <p className="font-semibold">{invite.campaign_title}</p>
                                          <p className="text-sm text-slate-600">Invited by: {invite.company_name}</p>
                                          <p className="text-xs text-slate-500">{invite.company_email || 'No email'} • {invite.campaign_location || 'Location not set'}</p>
                                        </div>
                                        <Badge variant="outline" className={`w-fit ${getStatusBadgeClass(invite.status)}`}>
                                          {formatStatusLabel(invite.status)}
                                        </Badge>
                                      </div>

                                      <div className="flex flex-wrap gap-2">
                                        <Button
                                          size="sm"
                                          className="bg-green-600 hover:bg-green-700"
                                          onClick={() => respondCampaignLeadInvitation(invite.campaign_id, 'accepted')}
                                          disabled={!actionable || respondingCampaignLeadInviteId === invite.campaign_id}
                                        >
                                          {respondingCampaignLeadInviteId === invite.campaign_id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Accept'}
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </TabsContent>

                        <TabsContent value="ongoing" className="mt-4 space-y-3">
                          {ongoingCampaignLeadAssignments.length === 0 && ongoingCampaignVolunteerAssignments.length === 0 && ongoingCSRProjects.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground">
                              <p className="text-lg font-medium mb-2">No ongoing CSR projects</p>
                              <p className="text-sm">Accepted campaign assignments and active projects will appear here.</p>
                            </div>
                          ) : (
                            <>
                              {ongoingCampaignLeadAssignments.map((assignment) => (
                                <div key={`campaign-lead-${assignment.id}`} className="rounded-md border bg-white p-4">
                                  <CampaignAssignmentDetails assignment={assignment} roleLabel="Lead NGO" />
                                </div>
                              ))}
                              {ongoingCampaignVolunteerAssignments.map((assignment) => (
                                <CampaignVolunteerAssignmentCard
                                  key={`campaign-volunteer-${assignment.id}`}
                                  assignment={assignment}
                                  today={getLocalDateString()}
                                  markingAttendanceId={markingAttendanceId}
                                  onMarkAttendance={handleMarkCampaignVolunteerAttendance}
                                />
                              ))}
                              {ongoingCSRProjects.map((project) => (
                            <div key={project.id} className="rounded-md border bg-white p-4">
                              {(() => {
                                const attendanceAssignment = csrAttendanceAssignments.find((assignment) => String(assignment.target_id) === String(project.id));
                                const attendanceSummary = attendanceAssignment?.meta?.attendance_summary || {};
                                const today = getLocalDateString();
                                const alreadyMarkedToday = String(attendanceSummary.last_attendance_at || '') === today;
                                const attendanceCount = getNgoAttendanceUnits();

                                return (
                                  <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                      <div>
                                          <p className="font-medium text-slate-900">Self attendance</p>
                                        <p className="text-sm text-slate-600">
                                          {alreadyMarkedToday
                                              ? `Marked today for ${attendanceCount} people`
                                              : 'Pending today. Share your location to record this day.'}
                                        </p>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="outline" className={alreadyMarkedToday ? 'border-green-300 bg-green-50 text-green-700' : 'border-amber-300 bg-amber-50 text-amber-700'}>
                                          {alreadyMarkedToday ? 'Marked' : 'Pending'}
                                        </Badge>
                                        <Button
                                          size="sm"
                                          onClick={() => attendanceAssignment && handleMarkCSRAttendance(attendanceAssignment)}
                                          disabled={!attendanceAssignment || alreadyMarkedToday || markingAttendanceId === String(attendanceAssignment?.id || '')}
                                        >
                                          {markingAttendanceId === String(attendanceAssignment?.id || '') ? 'Marking…' : 'Mark Attendance'}
                                        </Button>
                                      </div>
                                    </div>
                                    <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-500 md:grid-cols-3">
                                      <p>Counts as: {attendanceCount} people</p>
                                      <p>Last marked: {attendanceSummary.last_attendance_at || 'Not yet'}</p>
                                      <p>Days attended: {attendanceSummary.days_attended ?? attendanceSummary.total_entries ?? 0}</p>
                                    </div>
                                  </div>
                                );
                              })()}

                              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div>
                                  <p className="font-semibold">{project.title}</p>
                                  <p className="text-sm text-muted-foreground">{project.region || 'Region not set'}</p>
                                </div>
                                <Badge variant="outline" className="w-fit">{project.project_status}</Badge>
                              </div>
                              <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-4">
                                <p>Progress: {project.progress_percentage ?? 0}%</p>
                                <p>Milestones: {project.completed_milestones_count ?? 0}/{project.milestones_count ?? 0}</p>
                                <p>Funds Utilized: Rs {project.funds_utilized ?? 0}</p>
                                <p>Beneficiaries: {project.latest_impact?.beneficiaries ?? 0}</p>
                              </div>
                              <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-3">
                                <p>Next Milestone: {project.next_milestone?.title || 'N/A'}</p>
                                <p>Deadline: {project.deadline_at || 'N/A'}</p>
                                <p>Confirmed Funds: Rs {project.confirmed_funds ?? 0}</p>
                              </div>
                              <div className="mt-3">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => fetchProjectEvidenceTimeline(project.id)}
                                  disabled={loadingEvidenceProjectId === project.id}
                                >
                                  {loadingEvidenceProjectId === project.id ? 'Loading Timeline...' : 'View Evidence Timeline'}
                                </Button>
                              </div>

                              {projectEvidenceById[project.id] && (
                                <div className="mt-4 rounded-md border bg-slate-50 p-3">
                                  <p className="text-sm font-medium text-slate-900">Evidence Timeline Snapshot</p>
                                  <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-600 md:grid-cols-4">
                                    <p>Total Milestones: {projectEvidenceById[project.id]?.summary?.total_milestones ?? 0}</p>
                                    <p>Completed: {projectEvidenceById[project.id]?.summary?.completed_milestones ?? 0}</p>
                                    <p>Confirmed Funds: Rs {projectEvidenceById[project.id]?.summary?.confirmed_funds ?? 0}</p>
                                    <p>Upcoming: {projectEvidenceById[project.id]?.summary?.next_milestone?.title || 'N/A'}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                            </>
                          )}
                        </TabsContent>

                        <TabsContent value="completed" className="mt-4 space-y-3">
                          {completedCampaignLeadAssignments.length === 0 && completedCampaignVolunteerAssignments.length === 0 && completedCSRProjects.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground">
                              <p className="text-lg font-medium mb-2">No completed CSR projects yet</p>
                              <p className="text-sm">Completed campaigns and projects will appear here for reference and reporting.</p>
                            </div>
                          ) : (
                            <>
                              {completedCampaignLeadAssignments.map((assignment) => (
                                <div key={`campaign-lead-completed-${assignment.id}`} className="rounded-md border bg-white p-4">
                                  <CampaignAssignmentDetails assignment={assignment} roleLabel="Lead NGO" />
                                </div>
                              ))}
                              {completedCampaignVolunteerAssignments.map((assignment) => (
                                <CampaignVolunteerAssignmentCard
                                  key={`campaign-volunteer-completed-${assignment.id}`}
                                  assignment={assignment}
                                  today={getLocalDateString()}
                                  markingAttendanceId={markingAttendanceId}
                                  onMarkAttendance={handleMarkCampaignVolunteerAttendance}
                                />
                              ))}
                              {completedCSRProjects.map((project) => (
                            <div key={project.id} className="rounded-md border bg-white p-4">
                              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div>
                                  <p className="font-semibold">{project.title}</p>
                                  <p className="text-sm text-muted-foreground">{project.region || 'Region not set'}</p>
                                </div>
                                <Badge variant="outline" className="w-fit">{project.project_status}</Badge>
                              </div>
                              <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-4">
                                <p>Progress: {project.progress_percentage ?? 0}%</p>
                                <p>Milestones: {project.completed_milestones_count ?? 0}/{project.milestones_count ?? 0}</p>
                                <p>Funds Utilized: Rs {project.funds_utilized ?? 0}</p>
                                <p>Beneficiaries: {project.latest_impact?.beneficiaries ?? 0}</p>
                              </div>
                              <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-2">
                                <p>Deadline: {project.deadline_at || 'N/A'}</p>
                                <p>Confirmed Funds: Rs {project.confirmed_funds ?? 0}</p>
                              </div>
                              <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                <p className="font-medium text-slate-900">Attendance</p>
                                <p className="mt-1 text-slate-600">Days attended: {project.days_attended ?? 0}</p>
                                <p className="text-slate-600">Last marked: {project.last_attendance_at || 'Not yet'}</p>
                              </div>
                              <div className="mt-3">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => fetchProjectEvidenceTimeline(project.id)}
                                  disabled={loadingEvidenceProjectId === project.id}
                                >
                                  {loadingEvidenceProjectId === project.id ? 'Loading Timeline...' : 'View Evidence Timeline'}
                                </Button>
                              </div>

                              {projectEvidenceById[project.id] && (
                                <div className="mt-4 rounded-md border bg-slate-50 p-3">
                                  <p className="text-sm font-medium text-slate-900">Evidence Timeline Snapshot</p>
                                  <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-600 md:grid-cols-4">
                                    <p>Total Milestones: {projectEvidenceById[project.id]?.summary?.total_milestones ?? 0}</p>
                                    <p>Completed: {projectEvidenceById[project.id]?.summary?.completed_milestones ?? 0}</p>
                                    <p>Confirmed Funds: Rs {projectEvidenceById[project.id]?.summary?.confirmed_funds ?? 0}</p>
                                    <p>Upcoming: {projectEvidenceById[project.id]?.summary?.next_milestone?.title || 'N/A'}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                            </>
                          )}
                        </TabsContent>
                      </Tabs>
                    )}
                      </TabsContent>
                    </Tabs>
                  </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}

export default function NGODashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50"><Header /><div className="container mx-auto px-4 py-8 text-gray-600">Loading dashboard...</div></div>}>
      <NGODashboardContent />
    </Suspense>
  );
}