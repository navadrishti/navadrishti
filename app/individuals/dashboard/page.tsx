'use client';

import { useEffect, useState, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { Header } from '@/components/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfileDashboardTab } from '@/components/profile-dashboard-tab';
import { DashboardBodyLayout, DashboardQuickSidebar } from '@/components/dashboard-quick-sidebar';
import { DashboardPageSkeleton } from '@/components/ui/skeleton';
import { CampaignVolunteerAssignmentCard, type CampaignVolunteerAssignmentItem } from '@/components/campaign-volunteer-assignment-card';
import { VerifiedAccountName } from '@/components/verification-badge';
import { YourCapabilitiesPanel } from '@/components/service-card';
import { formatStatusLabel } from '@/lib/format-date';
import { dashboardProfilePayoutHref, usePayoutConnection } from '@/hooks/use-payout-connection';
import {
  formatDeliveryTrackingStatus,
  getDeliveryTrackingEvents,
  isDeliveredTrackingStatus,
  isPickedUpTrackingStatus,
  getNgoNeedFulfillmentMode,
  isDailyRentalEngagementMeta,
  normalizeServiceRequestRecord,
  shouldUseDelhiveryForNeed,
  shouldUseNgoMarkedDailyAttendance,
  shouldUseRazorpayForNeed,
} from '@/lib/service-request-allocation';
import { useToast } from '@/hooks/use-toast';
import { formatInrAmount, getOfferRequestBillingDetails, getOfferRequestBucket, toOfferRentalApplication, type OfferRequestItem } from '@/lib/offer-requests';
import { InlineInfrastructureAssignment, InlineSkillServiceFulfillment } from '@/components/engagement-fulfillment';
import { parseJsonObject } from '@/lib/utils';
import type { CapabilityOfferSummary } from '@/lib/service-offers';

const formatDisplayDate = (value?: string | null): string => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

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
  responseMeta?: Record<string, unknown> | null;
  canEditTrackingId?: boolean;
  canVerifyPickup?: boolean;
  onUpdated?: (nextMeta: Record<string, unknown>) => void | Promise<void>;
}) {
  const { toast } = useToast();
  const meta = parseJsonObject(responseMeta);
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
            {events.map((event, index: number) => (
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

type IndividualNgoRequestApplication = {
  id: number;
  status?: string;
  fulfillment_amount?: number | null;
  fulfillment_quantity?: number | null;
  assigned_amount?: number | null;
  assigned_quantity?: number | null;
  response_meta?: Record<string, unknown> | null;
  request?: {
    id?: number;
    title?: string;
    category?: string;
    request_type?: string;
    location?: string;
    status?: string;
    project?: { title?: string | null } | null;
    ngo?: { name?: string | null; email?: string | null } | null;
    requester?: { name?: string | null; email?: string | null } | null;
  } | null;
};

function normalizeNgoRequestApplication(application: IndividualNgoRequestApplication) {
  return normalizeServiceRequestRecord(application.request);
}

function formatNgoRequestFulfillmentValue(application: IndividualNgoRequestApplication) {
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

function getNgoRequestFulfillmentStage(application: IndividualNgoRequestApplication) {
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

function IndividualNgoRequestInline({
  application,
  onUpdated,
}: {
  application: IndividualNgoRequestApplication;
  onUpdated?: () => void | Promise<void>;
}) {
  const stage = getNgoRequestFulfillmentStage(application);
  const request = normalizeNgoRequestApplication(application);
  const ngoName = request?.ngo?.name || request?.requester?.name || 'NGO';
  const ngoVerificationStatus =
    request?.ngo?.verification_status || request?.requester?.verification_status || null;
  const requestId = request?.id;
  const mode = getNgoNeedFulfillmentMode(request);
  const status = String(application.status || '').toLowerCase();
  const meta = parseJsonObject(application.response_meta);
  const inFulfillment = ['accepted', 'active'].includes(status);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">{request?.title || 'NGO need'}</p>
            <p className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              <span>Posted by</span>
              <VerifiedAccountName
                name={ngoName}
                status={ngoVerificationStatus}
                size="xs"
                nameClassName="font-medium text-slate-800"
              />
              {request?.project?.title ? <span>· {request.project.title}</span> : null}
            </p>
            {request?.location ? (
              <p className="text-xs text-muted-foreground">{request.location}</p>
            ) : null}
          </div>
          <Badge variant="outline" className={stage.className}>
            {stage.label}
          </Badge>
        </div>

        <p className="text-sm">Your offer: {formatNgoRequestFulfillmentValue(application)}</p>

        {shouldUseDelhiveryForNeed(request) && inFulfillment && requestId ? (
          <InlineDelhiveryFulfillment
            serviceRequestId={Number(requestId)}
            volunteerApplicationId={application.id}
            responseMeta={meta}
            canEditTrackingId
            canVerifyPickup
            onUpdated={onUpdated}
          />
        ) : null}

        {shouldUseDelhiveryForNeed(request) && status === 'pending' ? (
          <p className="text-sm text-muted-foreground">
            Delhivery tracking starts after the NGO accepts your application.
          </p>
        ) : null}

        {shouldUseDelhiveryForNeed(request) &&
        (status === 'completed' || isDeliveredTrackingStatus(meta.delivery_tracking_last_status)) &&
        requestId ? (
          <InlineDelhiveryFulfillment
            serviceRequestId={Number(requestId)}
            volunteerApplicationId={application.id}
            responseMeta={meta}
            canEditTrackingId={false}
            canVerifyPickup
            onUpdated={onUpdated}
          />
        ) : null}

        {shouldUseRazorpayForNeed(request) && inFulfillment && requestId ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
            <p className="text-sm font-medium text-emerald-950">Financial contribution</p>
            <p className="text-xs text-emerald-900/80">
              Financial needs are fulfilled through Razorpay. Attendance is not used here.
            </p>
            <Link href={`/service-requests/${requestId}?pay=1`}>
              <Button size="sm">Pay via Razorpay</Button>
            </Link>
          </div>
        ) : null}

        {shouldUseNgoMarkedDailyAttendance(request) && inFulfillment ? (
          <InlineSkillServiceFulfillment application={application} role="individual" onUpdated={onUpdated} />
        ) : null}

        {mode === 'infrastructure' && inFulfillment && requestId ? (
          <InlineInfrastructureAssignment
            application={application}
            serviceRequestId={Number(requestId)}
            role="individual"
            onUpdated={onUpdated}
          />
        ) : null}

        {!inFulfillment && mode === 'material' && status !== 'pending' ? (
          <p className="text-sm text-muted-foreground">
            Delhivery: {formatDeliveryTrackingStatus(meta)}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function IndividualDashboardContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const { connected: payoutConnected } = usePayoutConnection(Boolean(user));
  const canListCapabilities = payoutConnected === true;
  const payoutHref = dashboardProfilePayoutHref('individual');
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab') || 'profile';
  const activeTab =
    requestedTab === 'services-hired' || requestedTab === 'service-requests'
      ? 'ngo-requests'
      : requestedTab;
  const [serviceOffers, setServiceOffers] = useState<CapabilityOfferSummary[]>([]);
  const [offerRequests, setOfferRequests] = useState<OfferRequestItem[]>([]);
  const [loadingServiceOffers, setLoadingServiceOffers] = useState(true);
  const [loadingOfferRequests, setLoadingOfferRequests] = useState(true);
  const [updatingOfferRequestId, setUpdatingOfferRequestId] = useState<number | null>(null);
  const [capabilityOffersTab, setCapabilityOffersTab] = useState<'your-capabilities' | 'requests'>('your-capabilities');
  const [offerRequestsTab, setOfferRequestsTab] = useState<'pending' | 'in-progress' | 'history'>('pending');
  const [myApplicationsTab, setMyApplicationsTab] = useState<'pending' | 'in-progress' | 'history'>('in-progress');
  const [ongoingApplications, setOngoingApplications] = useState<IndividualNgoRequestApplication[]>([]);
  const [historyApplications, setHistoryApplications] = useState<IndividualNgoRequestApplication[]>([]);
  const [loadingApplications, setLoadingApplications] = useState(true);
  const [campaignVolunteerAssignments, setCampaignVolunteerAssignments] = useState<CampaignVolunteerAssignmentItem[]>([]);
  const [loadingCampaignVolunteerAssignments, setLoadingCampaignVolunteerAssignments] = useState(true);
  const [csrCampaignsTab, setCsrCampaignsTab] = useState<'ongoing' | 'completed'>('ongoing');
  const sidebarItems = [
    { value: 'profile', label: 'Profile' },
    { value: 'capability-offers', label: 'Capability Offers' },
    { value: 'ngo-requests', label: 'NGO Requests' },
    { value: 'csr-campaigns', label: 'CSR Campaigns' },
  ];

  const fetchServiceOffers = async () => {
    try {
      setLoadingServiceOffers(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setServiceOffers([]);
        return;
      }

      const response = await fetch('/api/service-offers?view=my-offers&include_expired=true&limit=50', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await response.json();
      setServiceOffers(data.success ? (data.data || []) : []);
    } catch {
      setServiceOffers([]);
    } finally {
      setLoadingServiceOffers(false);
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
    } catch {
      setOfferRequests([]);
    } finally {
      setLoadingOfferRequests(false);
    }
  };

  const fetchMyApplications = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setOngoingApplications([])
      setHistoryApplications([])
      return
    }

    const [ongoingRes, historyRes] = await Promise.all([
      fetch('/api/service-request-assignments?view=ongoing', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/service-request-assignments?view=history', { headers: { Authorization: `Bearer ${token}` } })
    ])

    const ongoingData = await ongoingRes.json()
    const historyData = await historyRes.json()

    if (ongoingData.success) setOngoingApplications(Array.isArray(ongoingData.data) ? ongoingData.data : [])
    if (historyData.success) setHistoryApplications(Array.isArray(historyData.data) ? historyData.data : [])
  }

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
      setCampaignVolunteerAssignments(response.ok && data?.success && Array.isArray(data.data) ? data.data : []);
    } catch {
      setCampaignVolunteerAssignments([]);
    } finally {
      setLoadingCampaignVolunteerAssignments(false);
    }
  };

  const ongoingCampaignVolunteerAssignments = campaignVolunteerAssignments.filter((assignment) => assignment.lifecycle !== 'completed');
  const completedCampaignVolunteerAssignments = campaignVolunteerAssignments.filter((assignment) => assignment.lifecycle === 'completed');

  const pendingNgoRequests = ongoingApplications.filter((application) => String(application.status || '').toLowerCase() === 'pending');
  const inProgressNgoRequests = ongoingApplications.filter((application) => ['accepted', 'active'].includes(String(application.status || '').toLowerCase()));

  const pendingOfferRequests = offerRequests.filter((request) => getOfferRequestBucket(request) === 'pending');
  const inProgressOfferRequests = offerRequests.filter((request) => getOfferRequestBucket(request) === 'in-progress');
  const historyOfferRequests = offerRequests.filter((request) => getOfferRequestBucket(request) === 'history');

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
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update request status',
        variant: 'destructive'
      });
    } finally {
      setUpdatingOfferRequestId(null);
    }
  };

  useEffect(() => {
    const loadAssignments = async () => {
      if (!user?.id) return

      setLoadingApplications(true)
      try {
        await fetchMyApplications()
      } catch {
        setOngoingApplications([])
        setHistoryApplications([])
      } finally {
        setLoadingApplications(false)
      }
    }

    loadAssignments()
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return;
    fetchServiceOffers();
    fetchOfferRequests();
    fetchCampaignVolunteerAssignments();
  }, [user?.id]);

  const navigateToTab = (value: string) => {
    if (value === 'capability-offers') {
      setCapabilityOffersTab('your-capabilities');
    }
    if (value === 'ngo-requests') {
      setMyApplicationsTab('in-progress');
    }
    if (value === 'csr-campaigns') {
      setCsrCampaignsTab('ongoing');
    }
    router.replace(`/individuals/dashboard?tab=${value}`, { scroll: false });
  };

  return (
    <ProtectedRoute userTypes={['individual']}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <DashboardBodyLayout
          showSidebar={sidebarItems.length > 1}
          sidebar={
            <DashboardQuickSidebar
              items={sidebarItems}
              activeTab={activeTab}
              onSelect={navigateToTab}
              triggerLabel="Dashboard sections"
            />
          }
        >
          <div className="space-y-8 p-4 md:p-6 lg:p-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                <p className="text-gray-500 mt-1">
                  Manage NGO needs you fulfill, CSR campaign volunteering, and your capability offers
                </p>
              </div>
            </div>

            <Card>
              <CardContent className="pt-6">
                    {activeTab === 'profile' ? (
                      <ProfileDashboardTab />
                    ) : activeTab === 'capability-offers' ? (
                      <Tabs value={capabilityOffersTab} onValueChange={(value) => setCapabilityOffersTab(value as 'your-capabilities' | 'requests')} className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="your-capabilities">Your Capabilities</TabsTrigger>
                          <TabsTrigger value="requests">Offer Applications</TabsTrigger>
                        </TabsList>

                        <TabsContent value="your-capabilities" className="mt-4 space-y-3">
                          <YourCapabilitiesPanel
                            offers={serviceOffers}
                            loading={loadingServiceOffers}
                            emptyDescription="Create an offer to contribute skills, funds, materials, or infrastructure."
                            canCreate={canListCapabilities}
                            createBlockedHref={payoutHref}
                          />
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
                                  <p className="text-sm">Incoming requests on your capability offers will appear here.</p>
                                </div>
                              ) : pendingOfferRequests.map((request) => (
                                <Card key={request.id}>
                                  <CardContent className="p-4 space-y-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="font-semibold">{request.offer_title}</p>
                                        <p className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                                      <span>Requester:</span>
                                      <VerifiedAccountName
                                        name={request.client?.name || 'Unknown'}
                                        status={request.client?.verification_status}
                                        size="xs"
                                        nameClassName="font-medium text-slate-800"
                                      />
                                      <span>({request.client?.user_type || 'participant'})</span>
                                    </p>
                                        <p className="text-sm text-muted-foreground">{request.client?.email || 'No email available'}</p>
                                      </div>
                                      <Badge variant="outline">{formatStatusLabel(request.status)}</Badge>
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
                                  </CardContent>
                                </Card>
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
                                  <Card key={request.id}>
                                    <CardContent className="p-4 space-y-3">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                          <p className="truncate font-semibold">{request.offer_title}</p>
                                          <p className="flex min-w-0 flex-wrap items-center gap-1 truncate text-sm text-muted-foreground">
                                            <VerifiedAccountName
                                              name={request.client?.name || 'Unknown'}
                                              status={request.client?.verification_status}
                                              size="xs"
                                              nameClassName="font-medium text-slate-800"
                                            />
                                            <span>· {request.client?.user_type || 'participant'}</span>
                                          </p>
                                          <p className="truncate text-sm text-muted-foreground">{request.client?.email || 'No email available'}</p>
                                        </div>
                                        <Badge variant="outline" className="whitespace-nowrap">{formatStatusLabel(request.status)}</Badge>
                                      </div>

                                      <div className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
                                        <div className="min-w-0">
                                          <p className="text-xs uppercase tracking-wide text-slate-500">Assigned</p>
                                          <p className="truncate">{formatDisplayDate(billing.assignedAt)}</p>
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

                                      {isDailyRentalEngagementMeta(request.response_meta) ? (
                                        <InlineSkillServiceFulfillment
                                          application={toOfferRentalApplication(request)}
                                          role="ngo"
                                          title="Capability offer rental"
                                          onUpdated={fetchOfferRequests}
                                        />
                                      ) : null}

                                      <div className="space-y-1 text-sm text-slate-600">
                                        <p>This decision is final. Use the offer and tracking screens to manage fulfillment.</p>
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
                                    </CardContent>
                                  </Card>
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
                                <Card key={request.id}>
                                  <CardContent className="p-4 space-y-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="font-semibold">{request.offer_title}</p>
                                        <p className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                                      <span>Requester:</span>
                                      <VerifiedAccountName
                                        name={request.client?.name || 'Unknown'}
                                        status={request.client?.verification_status}
                                        size="xs"
                                        nameClassName="font-medium text-slate-800"
                                      />
                                      <span>({request.client?.user_type || 'participant'})</span>
                                    </p>
                                        <p className="text-sm text-muted-foreground">{request.client?.email || 'No email available'}</p>
                                      </div>
                                      <Badge variant="outline">{formatStatusLabel(request.status)}</Badge>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <Link href={`/service-offers/${request.service_offer_id}`}>
                                        <Button size="sm" variant="outline">View Offer</Button>
                                      </Link>
                                    </div>
                                  </CardContent>
                                </Card>
                              ))}
                            </TabsContent>
                          </Tabs>
                        </TabsContent>
                      </Tabs>
                    ) : activeTab === 'ngo-requests' ? (
                      <div className="space-y-4">
                        <div>
                          <h2 className="text-lg font-semibold text-slate-900">NGO Requests</h2>
                          <p className="text-sm text-muted-foreground">
                            Needs posted by NGOs that you apply to, fulfill, and track here. CSR company campaigns are listed separately under CSR Campaigns.
                          </p>
                        </div>

                        <Tabs value={myApplicationsTab} onValueChange={(value) => setMyApplicationsTab(value as 'pending' | 'in-progress' | 'history')} className="w-full">
                          <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="pending">Pending ({pendingNgoRequests.length})</TabsTrigger>
                            <TabsTrigger value="in-progress">In Progress ({inProgressNgoRequests.length})</TabsTrigger>
                            <TabsTrigger value="history">History ({historyApplications.length})</TabsTrigger>
                          </TabsList>

                          <TabsContent value="pending" className="mt-4 space-y-3">
                            {loadingApplications ? (
                              <div className="p-6 text-center text-muted-foreground">Loading NGO requests...</div>
                            ) : pendingNgoRequests.length === 0 ? (
                              <div className="p-8 text-center text-muted-foreground">
                                <p className="text-lg font-medium mb-2">No pending applications</p>
                                <p className="text-sm mb-4">When you apply to an NGO need, it appears here until the NGO accepts or rejects it.</p>
                                <Link href="/service-requests">
                                  <Button variant="outline">Browse NGO Requests</Button>
                                </Link>
                              </div>
                            ) : pendingNgoRequests.map((application) => (
                              <IndividualNgoRequestInline key={application.id} application={application} />
                            ))}
                          </TabsContent>

                          <TabsContent value="in-progress" className="mt-4 space-y-3">
                            {loadingApplications ? (
                              <div className="p-6 text-center text-muted-foreground">Loading NGO requests...</div>
                            ) : inProgressNgoRequests.length === 0 ? (
                              <div className="p-8 text-center text-muted-foreground">
                                <p className="text-lg font-medium mb-2">No active fulfillments</p>
                                <p className="text-sm mb-4">Accepted NGO needs appear here with tracking based on need type: Delhivery, Razorpay, daily service rental, or infrastructure assignment.</p>
                                <Link href="/service-requests">
                                  <Button variant="outline">Browse NGO Requests</Button>
                                </Link>
                              </div>
                            ) : inProgressNgoRequests.map((application) => (
                              <IndividualNgoRequestInline
                                key={application.id}
                                application={application}
                                onUpdated={fetchMyApplications}
                              />
                            ))}
                          </TabsContent>

                          <TabsContent value="history" className="mt-4 space-y-3">
                            {loadingApplications ? (
                              <div className="p-6 text-center text-muted-foreground">Loading history...</div>
                            ) : historyApplications.length === 0 ? (
                              <div className="p-8 text-center text-muted-foreground">
                                <p className="text-lg font-medium mb-2">No history yet</p>
                                <p className="text-sm mb-4">Completed, rejected, or cancelled NGO fulfillments will be stored here.</p>
                                <Link href="/service-requests">
                                  <Button variant="outline">Browse NGO Requests</Button>
                                </Link>
                              </div>
                            ) : historyApplications.map((application) => (
                              <IndividualNgoRequestInline key={application.id} application={application} />
                            ))}
                          </TabsContent>
                        </Tabs>
                      </div>
                    ) : activeTab === 'csr-campaigns' ? (
                      <div className="space-y-4">
                        <div>
                          <h2 className="text-lg font-semibold text-slate-900">CSR Campaigns</h2>
                          <p className="text-sm text-muted-foreground">
                            Company-led CSR campaigns you volunteer for. These are separate from day-to-day NGO needs.
                          </p>
                        </div>
                      <Tabs value={csrCampaignsTab} onValueChange={(value) => setCsrCampaignsTab(value as 'ongoing' | 'completed')} className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="ongoing">Ongoing ({ongoingCampaignVolunteerAssignments.length})</TabsTrigger>
                          <TabsTrigger value="completed">Completed ({completedCampaignVolunteerAssignments.length})</TabsTrigger>
                        </TabsList>

                        <TabsContent value="ongoing" className="mt-4 space-y-3">
                          {loadingCampaignVolunteerAssignments ? (
                            <div className="p-6 text-center text-muted-foreground">Loading CSR campaigns...</div>
                          ) : ongoingCampaignVolunteerAssignments.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground">
                              <p className="text-lg font-medium mb-2">No ongoing CSR campaigns</p>
                              <p className="text-sm mb-4">Campaigns you volunteer for will appear here as Yet to start, then Started.</p>
                              <Link href="/csr-campaigns">
                                <Button variant="outline">Browse CSR Campaigns</Button>
                              </Link>
                            </div>
                          ) : ongoingCampaignVolunteerAssignments.map((assignment) => (
                            <CampaignVolunteerAssignmentCard
                              key={`individual-campaign-volunteer-${assignment.id}`}
                              assignment={assignment}
                            />
                          ))}
                        </TabsContent>

                        <TabsContent value="completed" className="mt-4 space-y-3">
                          {loadingCampaignVolunteerAssignments ? (
                            <div className="p-6 text-center text-muted-foreground">Loading CSR campaigns...</div>
                          ) : completedCampaignVolunteerAssignments.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground">
                              <p className="text-lg font-medium mb-2">No completed CSR campaigns yet</p>
                              <p className="text-sm">Finished campaigns will appear here for reference.</p>
                            </div>
                          ) : completedCampaignVolunteerAssignments.map((assignment) => (
                            <CampaignVolunteerAssignmentCard
                              key={`individual-campaign-volunteer-completed-${assignment.id}`}
                              assignment={assignment}
                            />
                          ))}
                        </TabsContent>
                        </Tabs>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
          </div>
        </DashboardBodyLayout>
      </div>
    </ProtectedRoute>
  );
}

export default function IndividualDashboard() {
  return (
    <Suspense fallback={<DashboardPageSkeleton userType="individual" />}>
      <IndividualDashboardContent />
    </Suspense>
  );
}
