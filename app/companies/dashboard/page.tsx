'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient as createSupabaseClient } from '@/lib/supabase';
import { Building, CheckCircle, HandHeart, MailCheck, Phone, Loader2, XCircle, Power, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { Header } from '@/components/header';
import { VerificationBadge } from '@/components/verification-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ProfileDashboardTab } from '@/components/profile-dashboard-tab';
import { DashboardQuickSidebar } from '@/components/dashboard-quick-sidebar';
import { ImpactReportsPanel } from '@/components/companies/impact-reports-panel';
import { useToast } from '@/hooks/use-toast';
import {
  formatAttendanceSummary,
  getSkillServiceDailyRate,
  isDailyRentalEngagementMeta,
} from '@/lib/ngo-need-fulfillment';
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

interface CompanyProjectOpportunity {
  project_id: string;
  project_title: string;
  project_description?: string;
  project_location?: string;
  project_timeline?: string;
  ngo_id: number;
  ngo_name: string;
  ngo_email?: string;
  needs: Array<{
    id: number;
    title: string;
    status: string;
    request_type?: string;
    estimated_budget?: number | null;
    target_amount?: number | null;
    target_quantity?: number | null;
    beneficiary_count?: number | null;
  }>;
  company_application_status: 'none' | 'pending' | 'accepted' | 'rejected' | string;
  company_application_eligible?: boolean;
  company_application_reason?: string;
  latest_application_at?: string | null;
  note?: string;
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

interface CSRTrackingAssignment {
  project_id: string;
  project_title: string;
  project_location?: string;
  project_timeline?: string;
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
  lead_ngo_invites?: Array<{
    id: string;
    ngo_id: number;
    ngo_name: string;
    ngo_email?: string;
    status: string;
    note?: string;
    selected_as_lead?: boolean;
  }>;
  needs: Array<{
    id: number;
    title: string;
    status: string;
    request_type?: string;
  }>;
}

interface PublishedCsrCampaign {
  id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  location: string | null;
  budget_inr: number | null;
  schedule_vii: string | null;
  start_date: string | null;
  end_date: string | null;
  status?: string | null;
  impact_metrics?: Record<string, any> | null;
  company_id?: number | null;
  created_at?: string | null;
}

interface NgoDirectoryItem {
  id: number;
  name: string;
  email?: string;
}

const formatStatusLabel = (status: string): string => {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return 'Unknown';
  return normalized
    .replace(/_/g, ' ')
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

const getInitials = (name: string): string => {
  if (!name) return 'N';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
};

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

function CompanyDashboardContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const requestedTab = searchParams.get('tab') || 'profile';
  const activeTab = (() => {
    if (requestedTab === 'service-requests') return 'csr-projects';
    if (requestedTab === 'services-hired') return 'capability-offers';
    if (requestedTab === 'csr-budget' || requestedTab === 'csr-health') return 'impact-reports';
    return requestedTab;
  })();
  const [serviceOffers, setServiceOffers] = useState<any[]>([]);
  const [offerApplications, setOfferApplications] = useState<any[]>([]);
  const [offerRequests, setOfferRequests] = useState<OfferRequestItem[]>([]);
  const [loadingServiceOffers, setLoadingServiceOffers] = useState(false);
  const [loadingOfferApplications, setLoadingOfferApplications] = useState(false);
  const [loadingOfferRequests, setLoadingOfferRequests] = useState(false);
  const [updatingOfferRequestId, setUpdatingOfferRequestId] = useState<number | null>(null);
  const [capabilityOffersTab, setCapabilityOffersTab] = useState<'your-capabilities' | 'your-applications' | 'requests'>('your-capabilities');
  const [offerRequestsTab, setOfferRequestsTab] = useState<'pending' | 'in-progress' | 'history'>('pending');
  const [csrProjects, setCsrProjects] = useState<any[]>([]);
  const [projectEvidenceById, setProjectEvidenceById] = useState<Record<string, any>>({});
  const [loadingEvidenceProjectId, setLoadingEvidenceProjectId] = useState<string | null>(null);
  const [projectOpportunities, setProjectOpportunities] = useState<CompanyProjectOpportunity[]>([]);
  const [loadingProjectOpportunities, setLoadingProjectOpportunities] = useState(false);
  const [applyingProjectId, setApplyingProjectId] = useState<string | null>(null);
  const [projectApplicationNote, setProjectApplicationNote] = useState('');
  const [csrTrackingAssignments, setCsrTrackingAssignments] = useState<CSRTrackingAssignment[]>([]);
  const [loadingCSRTrackingAssignments, setLoadingCSRTrackingAssignments] = useState(false);
  const [publishedCsrCampaigns, setPublishedCsrCampaigns] = useState<PublishedCsrCampaign[]>([]);
  const [loadingPublishedCsrCampaigns, setLoadingPublishedCsrCampaigns] = useState(false);
  const [ngoDirectory, setNgoDirectory] = useState<NgoDirectoryItem[]>([]);
  const [loadingNgoDirectory, setLoadingNgoDirectory] = useState(false);
  const [inviteSearchByProject, setInviteSearchByProject] = useState<Record<string, string>>({});
  const [inviteNoteByProject, setInviteNoteByProject] = useState<Record<string, string>>({});
  const [invitingProjectId, setInvitingProjectId] = useState<string | null>(null);
  const [loadingCSRProjects, setLoadingCSRProjects] = useState(false);
  const [companyCAAccounts, setCompanyCAAccounts] = useState<any[]>([]);
  const [loadingCompanyCAAccounts, setLoadingCompanyCAAccounts] = useState(false);
  const [creatingCompanyCA, setCreatingCompanyCA] = useState(false);
  const [companyCAForm, setCompanyCAForm] = useState({ name: '', email: '', password: '', ca_id: '', auto_generate_ca_id: true });
  const [companyCAFeedback, setCompanyCAFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [lastCreatedCompanyCA, setLastCreatedCompanyCA] = useState<{ email: string; password: string; ca_id: string } | null>(null);
  const [availableCompanyCaIds, setAvailableCompanyCaIds] = useState<any[]>([]);
  const highlightedRequestId = Number(searchParams.get('requestId') || '');

  useEffect(() => {
    setMounted(true);
  }, []);

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

      const payload = await response.json();
      if (response.ok && payload?.success) {
        setCsrProjects(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setCsrProjects([]);
      }
    } catch (error) {
      console.error('Failed to fetch CSR projects:', error);
      setCsrProjects([]);
    } finally {
      setLoadingCSRProjects(false);
    }
  };

  const fetchProjectOpportunities = async () => {
    try {
      setLoadingProjectOpportunities(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setProjectOpportunities([]);
        return;
      }

      const query = Number.isFinite(highlightedRequestId)
        ? `?mode=company-projects&requestId=${highlightedRequestId}`
        : '?mode=company-projects';

      const response = await fetch(`/api/service-request-assignments${query}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const payload = await response.json();
      if (response.ok && payload?.success) {
        setProjectOpportunities(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setProjectOpportunities([]);
      }
    } catch (error) {
      console.error('Failed to fetch project opportunities:', error);
      setProjectOpportunities([]);
    } finally {
      setLoadingProjectOpportunities(false);
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
      console.error('Failed to fetch CSR tracking assignments:', error);
      setCsrTrackingAssignments([]);
    } finally {
      setLoadingCSRTrackingAssignments(false);
    }
  };

  const fetchPublishedCsrCampaigns = async () => {
    try {
      setLoadingPublishedCsrCampaigns(true);
      const token = localStorage.getItem('token');
      if (!token || !user?.id) {
        setPublishedCsrCampaigns([]);
        return;
      }

      const response = await fetch(`/api/campaigns?company_id=${user.id}`);
      const payload = await response.json();
      if (response.ok && payload?.success) {
        setPublishedCsrCampaigns(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setPublishedCsrCampaigns([]);
      }
    } catch (error) {
      console.error('Failed to fetch published CSR campaigns:', error);
      setPublishedCsrCampaigns([]);
    } finally {
      setLoadingPublishedCsrCampaigns(false);
    }
  };

  const fetchNgoDirectory = async () => {
    try {
      setLoadingNgoDirectory(true);
      const response = await fetch('/api/ngos/list');
      const payload = await response.json();
      if (response.ok && payload?.success) {
        setNgoDirectory(Array.isArray(payload.ngos) ? payload.ngos : []);
      } else {
        setNgoDirectory([]);
      }
    } catch (error) {
      setNgoDirectory([]);
    } finally {
      setLoadingNgoDirectory(false);
    }
  };

  const inviteLeadNgosFromDashboard = async (projectId: string, ngoIds: number[]) => {
    try {
      setInvitingProjectId(projectId);
      const token = localStorage.getItem('token');
      if (!token) {
        toast({ title: 'Error', description: 'Please login again', variant: 'destructive' });
        return;
      }

      if (ngoIds.length === 0) {
        toast({ title: 'Select NGO', description: 'Choose at least one NGO to invite.', variant: 'destructive' });
        return;
      }

      const response = await fetch('/api/service-request-assignments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'invite-lead-ngo',
          projectId,
          ngoIds,
          note: inviteNoteByProject[projectId] || ''
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        toast({ title: 'Invite failed', description: payload?.error || 'Could not send invitations', variant: 'destructive' });
        return;
      }

      toast({ title: 'Invites sent', description: payload?.data?.message || 'Lead NGO invitations sent.' });
      setInviteNoteByProject((prev) => ({ ...prev, [projectId]: '' }));
      fetchCSRTrackingAssignments();
    } catch (error) {
      toast({ title: 'Invite failed', description: 'Could not send invitations', variant: 'destructive' });
    } finally {
      setInvitingProjectId(null);
    }
  };

  const applyToProjectOpportunity = async (projectId: string) => {
    try {
      setApplyingProjectId(projectId);
      const token = localStorage.getItem('token');
      if (!token) {
        toast({ title: 'Error', description: 'Please login again', variant: 'destructive' });
        return;
      }

      const response = await fetch('/api/service-request-assignments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'apply-project',
          projectId,
          note: projectApplicationNote
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        toast({ title: 'Application failed', description: payload?.error || 'Could not apply for project', variant: 'destructive' });
        return;
      }

      toast({
        title: 'Application submitted',
        description: payload?.data?.message || 'Sent to NGO for review.'
      });

      setProjectApplicationNote('');
      fetchProjectOpportunities();
      fetchCSRTrackingAssignments();
    } catch (error) {
      toast({ title: 'Application failed', description: 'Could not apply for project', variant: 'destructive' });
    } finally {
      setApplyingProjectId(null);
    }
  };

  const fetchServiceOffers = async () => {
    try {
      setLoadingServiceOffers(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setServiceOffers([]);
        return;
      }

      const response = await fetch('/api/service-offers?view=my-offers&limit=20', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const payload = await response.json();
      setServiceOffers(payload.success ? (payload.data || []) : []);
    } catch {
      setServiceOffers([]);
    } finally {
      setLoadingServiceOffers(false);
    }
  };

  const pendingOfferRequests = offerRequests.filter((request) => getOfferRequestBucket(request) === 'pending');
  const inProgressOfferRequests = offerRequests.filter((request) => getOfferRequestBucket(request) === 'in-progress');
  const historyOfferRequests = offerRequests.filter((request) => getOfferRequestBucket(request) === 'history');

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

      const payload = await response.json();
      setOfferApplications(payload.success ? (payload.data || []) : []);
    } catch {
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

      const payload = await response.json();
      console.debug('fetchOfferRequests payload:', payload);
      if (!payload?.success) {
        console.debug('fetchOfferRequests returned no success flag', payload);
      }
      if (payload?.success && Array.isArray(payload.data) && payload.data.length === 0) {
        console.debug('fetchOfferRequests: owner has 0 requests (payload.data empty)');
      }

      setOfferRequests(payload.success ? (payload.data || []) : []);
    } catch {
      setOfferRequests([]);
    } finally {
      setLoadingOfferRequests(false);
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

      const payload = await response.json();
      if (!payload.success) {
        toast({
          title: 'Error',
          description: payload.error || 'Failed to update request status',
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
            request.service_offer_id === payload.data.service_offer_id &&
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

      const payload = await response.json();
      if (response.ok && payload?.success) {
        setProjectEvidenceById((prev) => ({ ...prev, [projectId]: payload.data }));
      }
    } catch (error) {
      console.error('Failed to fetch project evidence timeline:', error);
    } finally {
      setLoadingEvidenceProjectId(null);
    }
  };

  const fetchAvailableCompanyCaIds = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('/api/companies/ca/accounts?query=available-ca-ids', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setAvailableCompanyCaIds(Array.isArray(data.data) ? data.data : []);
      }
    } catch (error) {
      console.error('Failed to fetch available CA IDs:', error);
    }
  };

  const fetchCompanyCAAccounts = async () => {
    try {
      setLoadingCompanyCAAccounts(true);
      const token = localStorage.getItem('token');

      if (!token) {
        setCompanyCAAccounts([]);
        return;
      }

      const response = await fetch('/api/companies/ca/accounts', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const payload = await response.json();
      if (response.ok && payload?.success) {
        setCompanyCAAccounts(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setCompanyCAAccounts([]);
      }
    } catch (error) {
      console.error('Failed to fetch company CA accounts:', error);
      setCompanyCAAccounts([]);
    } finally {
      setLoadingCompanyCAAccounts(false);
    }
  };

  const refreshDashboardData = async () => {
    if (!user?.id) return;

    await Promise.all([
      fetchServiceOffers(),
      fetchOfferApplications(),
      fetchOfferRequests(),
      fetchProjectOpportunities(),
      fetchCSRTrackingAssignments(),
      fetchPublishedCsrCampaigns(),
      fetchCSRProjects(),
      fetchNgoDirectory(),
      fetchCompanyCAAccounts()
    ]);
  };

  // Realtime subscriptions (Supabase) — update lists when relevant DB tables change
  useEffect(() => {
    if (!user?.id) return;

    const realtime = createSupabaseClient();
    const channel = realtime.channel('realtime-dashboard');

    const handleChange = (table: string) => {
      if (table === 'csr_projects') fetchCSRProjects();
      else if (table === 'service_request_projects') fetchProjectOpportunities();
      else if (table === 'service_engagement_assignments') fetchCSRTrackingAssignments();
      else if (table === 'campaigns') fetchPublishedCsrCampaigns();
    }

    ['csr_projects', 'service_request_projects', 'service_engagement_assignments', 'campaigns'].forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => handleChange(table));
    });

    // subscribe
    void channel.subscribe();

    return () => {
      try {
        realtime.removeChannel(channel);
      } catch (e) {
        // ignore
      }
    };
  }, [user?.id]);

  const createCompanyCAAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCompanyCAFeedback(null);

    if (!companyCAForm.name || !companyCAForm.email || !companyCAForm.password) {
      setCompanyCAFeedback({ type: 'error', message: 'Name, email and password are required.' });
      return;
    }

    if (!companyCAForm.auto_generate_ca_id && !companyCAForm.ca_id) {
      setCompanyCAFeedback({ type: 'error', message: 'Please select a CA ID or enable auto-generation.' });
      return;
    }

    try {
      setCreatingCompanyCA(true);
      const token = localStorage.getItem('token');

      if (!token) {
        setCompanyCAFeedback({ type: 'error', message: 'Please login again to continue.' });
        return;
      }

      const response = await fetch('/api/companies/ca/accounts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: companyCAForm.name,
          email: companyCAForm.email,
          password: companyCAForm.password,
          ca_id: companyCAForm.auto_generate_ca_id ? undefined : companyCAForm.ca_id,
          auto_generate_ca_id: companyCAForm.auto_generate_ca_id
        })
      });

      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        setCompanyCAFeedback({ type: 'error', message: payload?.error || 'Failed to create Company CA account.' });
        return;
      }

      setLastCreatedCompanyCA({ email: companyCAForm.email, password: companyCAForm.password, ca_id: payload.data.identity.ca_id });
      setCompanyCAFeedback({ type: 'success', message: 'Company CA account created successfully.' });
      setCompanyCAForm({ name: '', email: '', password: '', ca_id: '', auto_generate_ca_id: true });
      await fetchCompanyCAAccounts();
    } catch (error) {
      setCompanyCAFeedback({ type: 'error', message: 'Failed to create Company CA account.' });
    } finally {
      setCreatingCompanyCA(false);
    }
  };

  const updateCompanyCAStatus = async (identityId: string, status: 'active' | 'inactive') => {
    setCompanyCAFeedback(null);

    if (!identityId) {
      setCompanyCAFeedback({ type: 'error', message: 'Invalid Company CA identity.' });
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setCompanyCAFeedback({ type: 'error', message: 'Please login again to continue.' });
        return;
      }

      const response = await fetch(`/api/companies/ca/accounts/${encodeURIComponent(identityId)}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        setCompanyCAFeedback({ type: 'error', message: payload?.error || 'Failed to update Company CA status.' });
        return;
      }

      setCompanyCAFeedback({ type: 'success', message: `Company CA ${status === 'active' ? 'activated' : 'deactivated'} successfully.` });
      await fetchCompanyCAAccounts();
    } catch {
      setCompanyCAFeedback({ type: 'error', message: 'Failed to update Company CA status.' });
    }
  };

  const deleteCompanyCAAccount = async (identityId: string, caName: string) => {
    const confirmed = window.confirm(
      `⚠️ PERMANENTLY DELETE Company CA account "${caName}"?\n\nThis action cannot be undone. All data associated with this account will be permanently removed.`
    );
    if (!confirmed) return;

    setCompanyCAFeedback(null);

    if (!identityId) {
      setCompanyCAFeedback({ type: 'error', message: 'Invalid Company CA identity.' });
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setCompanyCAFeedback({ type: 'error', message: 'Please login again to continue.' });
        return;
      }

      const response = await fetch(`/api/companies/ca/accounts/${encodeURIComponent(identityId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        setCompanyCAFeedback({ type: 'error', message: payload?.error || 'Failed to delete Company CA account.' });
        return;
      }

      setCompanyCAFeedback({ type: 'success', message: 'Company CA account permanently deleted.' });
      await fetchCompanyCAAccounts();
    } catch {
      setCompanyCAFeedback({ type: 'error', message: 'Failed to delete Company CA account.' });
    }
  };

  useEffect(() => {
    if (!user?.id) return;

    // Run a single refresh on mount / when highlightedRequestId changes.
    // Removed frequent background refresh (focus/visibility listeners) to avoid noisy polling.
    refreshDashboardData();
  }, [user?.id, highlightedRequestId]);

  const allVerified = Boolean(
    user?.email_verified &&
    user?.phone_verified &&
    user?.verification_status === 'verified'
  );

  const activeCompanyCAAccounts = companyCAAccounts.filter((account: any) => account.status === 'active');
  const inactiveCompanyCAAccounts = companyCAAccounts.filter((account: any) => account.status !== 'active');
  const sidebarItems = [
    { value: 'profile', label: 'Profile' },
    { value: 'capability-offers', label: 'Capability Offers' },
    { value: 'csr-projects', label: 'CSR Projects' },
    { value: 'company-ca', label: 'CA Access' },
    { value: 'impact-reports', label: 'Impact Reports' },
  ];

  const navigateToTab = (value: string) => {
    if (value === 'capability-offers') {
      setCapabilityOffersTab('your-capabilities');
    }
    router.replace(`/companies/dashboard?tab=${value}`, { scroll: false });
  };

  if (!mounted) {
    return (
      <ProtectedRoute userTypes={['company']}>
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex-1 p-4 md:p-6 lg:p-8 bg-gray-50">
            <div className="mx-auto max-w-7xl space-y-8">
              <Card>
                <CardHeader>
                  <CardTitle>Loading Dashboard</CardTitle>
                  <CardDescription>Preparing your company workspace...</CardDescription>
                </CardHeader>
              </Card>
            </div>
          </main>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute userTypes={['company']}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 p-4 md:p-6 lg:p-8 bg-gray-50">
          <div className="mx-auto max-w-7xl space-y-8">
            {/* Dashboard Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                <p className="text-gray-500 mt-1">
                  Manage your company CSR activities and service engagements
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
                <Card className="min-h-[420px]">
                  <CardContent className="pt-6">
                    <Tabs value={activeTab} onValueChange={(value) => {
                      window.history.replaceState(null, '', `/companies/dashboard?tab=${value}`);
                      router.replace(`/companies/dashboard?tab=${value}`, { scroll: false });
                    }} className="w-full">
                  <TabsContent value="profile" className="mt-4 space-y-4">
                    <ProfileDashboardTab />
                  </TabsContent>

                  <TabsContent value="capability-offers" className="mt-4 space-y-4">
                    <Tabs value={capabilityOffersTab} onValueChange={(value) => setCapabilityOffersTab(value as 'your-capabilities' | 'your-applications' | 'requests')} className="w-full">
                      <TabsList className="grid w-full grid-cols-3 h-auto">
                        <TabsTrigger value="your-capabilities">Your Capabilities</TabsTrigger>
                        <TabsTrigger value="your-applications">Your Applications</TabsTrigger>
                        <TabsTrigger value="requests">Offer Applications</TabsTrigger>
                      </TabsList>

                      <TabsContent value="your-capabilities" className="mt-4 space-y-3">
                        {loadingServiceOffers ? (
                          <div className="p-6 text-center text-muted-foreground">Loading capability offers...</div>
                        ) : serviceOffers.length === 0 ? (
                          <div className="p-8 text-center text-muted-foreground">
                            <p className="text-lg font-medium mb-2">No capability offers yet</p>
                            <p className="text-sm mb-4">Create capability offers to support NGO needs and partnerships.</p>
                            <Link href="/service-offers/create">
                              <Button variant="outline">Create Capability Offer</Button>
                            </Link>
                          </div>
                        ) : serviceOffers.map((offer) => (
                          <div key={offer.id} className="rounded-md border bg-white p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold">{offer.title}</p>
                                <p className="text-sm text-muted-foreground">{offer.category || 'Capability'}</p>
                              </div>
                              <Badge variant="outline">{offer.status || 'active'}</Badge>
                            </div>
                            <div className="flex gap-2">
                              <Link href={`/service-offers/${offer.id}`}>
                                <Button variant="outline" size="sm">View</Button>
                              </Link>
                              <Link href={`/service-offers/edit/${offer.id}`}>
                                <Button variant="outline" size="sm">Edit</Button>
                              </Link>
                            </div>
                              <div className="text-xs text-slate-500">Valid until: {formatDisplayDate(offer.valid_until)}</div>
                          </div>
                        ))}
                      </TabsContent>

                      <TabsContent value="your-applications" className="mt-4 space-y-3">
                        {loadingOfferApplications ? (
                          <div className="p-6 text-center text-muted-foreground">Loading your applications...</div>
                        ) : offerApplications.length === 0 ? (
                          <div className="p-8 text-center text-muted-foreground">
                            <p className="text-lg font-medium mb-2">No applications yet</p>
                            <p className="text-sm mb-4">Your applications on capability offers will appear here.</p>
                            <Link href="/service-offers">
                              <Button variant="outline">Browse Capability Offers</Button>
                            </Link>
                          </div>
                        ) : offerApplications.map((offer) => (
                          <div key={offer.id} className="rounded-md border bg-white p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold">{offer.title}</p>
                                <p className="text-sm text-muted-foreground">{offer.provider_name || offer.ngo_name || 'Provider not available'}</p>
                              </div>
                              <Badge variant="outline">{offer.status || 'active'}</Badge>
                            </div>
                            <div className="flex gap-2">
                              <Link href={`/service-offers/${offer.id}`}>
                                <Button variant="outline" size="sm">View Offer</Button>
                              </Link>
                            </div>
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
                                <p className="text-sm">Incoming requests on your capability offers will appear here.</p>
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
                                    disabled={updatingOfferRequestId === request.id || request.status !== 'pending'}
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
                                    disabled={updatingOfferRequestId === request.id || request.status !== 'pending'}
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
                                    <p>This decision is final. Use tracking screens to manage the engagement.</p>
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
                                  {/* View Offer removed for pending requests */}
                                </div>
                              </div>
                            ))}
                          </TabsContent>
                        </Tabs>
                      </TabsContent>
                    </Tabs>
                  </TabsContent>

                  <TabsContent value="csr-projects" className="mt-4 space-y-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="font-medium">Active CSR Projects</h3>
                      <Button variant="outline" size="sm" onClick={fetchCSRProjects} className="w-full sm:w-auto">Refresh</Button>
                    </div>

                    <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                      <div>
                        <p className="font-semibold text-slate-900">NGO Project Opportunities</p>
                        <p className="text-sm text-slate-600">Apply once to cover all active needs in a project. NGO approval starts tracking for the full project scope.</p>
                      </div>

                      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto] md:items-end">
                        <div>
                          <Label htmlFor="project-apply-note">Application note (optional)</Label>
                          <Input
                            id="project-apply-note"
                            value={projectApplicationNote}
                            onChange={(event) => setProjectApplicationNote(event.target.value)}
                            placeholder="Scope, timeline, logistics plan (Delhivery), payment controls (Razorpay)"
                          />
                        </div>
                        <Button variant="outline" size="sm" onClick={fetchProjectOpportunities}>Refresh Opportunities</Button>
                      </div>

                      {loadingProjectOpportunities ? (
                        <div className="flex items-center justify-center py-8 text-sm text-slate-600">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Loading opportunities...
                        </div>
                      ) : projectOpportunities.length === 0 ? (
                        <p className="text-sm text-slate-600">No project opportunities currently available.</p>
                      ) : (
                        <div className="space-y-3">
                          {projectOpportunities.map((opportunity) => (
                            <div key={opportunity.project_id} className="rounded-md border bg-white p-3 space-y-2">
                              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                <div>
                                  <p className="font-semibold">{opportunity.project_title}</p>
                                  <p className="text-sm text-slate-600">NGO: {opportunity.ngo_name}</p>
                                  <p className="text-xs text-slate-500">{opportunity.project_location || 'Location not set'} • {opportunity.project_timeline || 'Timeline not set'}</p>
                                </div>
                                <Badge variant="outline" className={`w-fit ${getStatusBadgeClass(opportunity.company_application_status)}`}>
                                  {formatStatusLabel(opportunity.company_application_status)}
                                </Badge>
                              </div>

                              <p className="text-xs text-slate-600">Project needs are visible only on the project detail page.</p>

                              <div className="flex flex-wrap gap-2 pt-1">
                                <Link href={`/service-requests/projects/${opportunity.project_id}`}>
                                  <Button size="sm" variant="outline">View Project</Button>
                                </Link>
                                <Button
                                  size="sm"
                                  onClick={() => applyToProjectOpportunity(opportunity.project_id)}
                                  disabled={
                                    applyingProjectId === opportunity.project_id ||
                                    opportunity.company_application_eligible === false ||
                                    opportunity.company_application_status === 'pending' ||
                                    opportunity.company_application_status === 'accepted'
                                  }
                                >
                                  {applyingProjectId === opportunity.project_id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : opportunity.company_application_status === 'accepted' ? (
                                    'Accepted by NGO'
                                  ) : opportunity.company_application_status === 'pending' ? (
                                    'Pending NGO Review'
                                  ) : opportunity.company_application_eligible === false ? (
                                    'Not Eligible'
                                  ) : (
                                    'Apply For Full Project'
                                  )}
                                </Button>
                              </div>

                              {opportunity.company_application_eligible === false && opportunity.company_application_reason ? (
                                <p className="text-xs text-red-600">{opportunity.company_application_reason}</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">NGO Project CSR Tracking</p>
                          <p className="text-sm text-slate-600">Approved project handoffs are tracked here with lead NGO visibility.</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={fetchCSRTrackingAssignments}>Refresh Tracking</Button>
                      </div>

                      {loadingCSRTrackingAssignments ? (
                        <div className="flex items-center justify-center py-6 text-sm text-slate-600">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Loading tracking assignments...
                        </div>
                      ) : csrTrackingAssignments.length === 0 ? (
                        <p className="text-sm text-slate-600">No accepted handoffs yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {csrTrackingAssignments.map((assignment) => {
                            return (
                            <div key={`${assignment.project_id}:${assignment.assigned_company_id}`} className="rounded-md border bg-white p-3 space-y-3">
                              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                <div>
                                  <p className="font-semibold">{assignment.project_title}</p>
                                  <p className="text-sm text-slate-600">Lead NGO: {assignment.lead_ngo_name}</p>
                                  <p className="text-xs text-slate-500">{assignment.lead_ngo_email || 'No email'} • {assignment.project_location || 'Location not set'}</p>
                                </div>
                                <Badge variant="outline" className={`w-fit ${getStatusBadgeClass(assignment.assignment_status)}`}>
                                  {formatStatusLabel(assignment.assignment_status)}
                                </Badge>
                              </div>

                              <p className="text-xs text-slate-600">Need-level tracking is available only in the project detail page.</p>

                              {assignment.selected_lead_ngo_id ? (
                                <div className="rounded-md border bg-emerald-50 p-2 text-xs text-emerald-800">
                                  Selected Lead NGO: {assignment.selected_lead_ngo_name || 'NGO'} {assignment.selected_lead_ngo_email ? `(${assignment.selected_lead_ngo_email})` : ''}
                                </div>
                              ) : null}

                              <div className="rounded-md border bg-slate-50 p-3 space-y-3">
                                <p className="text-sm font-medium text-slate-900">Invite Lead NGOs</p>
                                <p className="text-xs text-slate-600">Suggested NGOs appear first. You can also search and invite directly from results.</p>

                                {(() => {
                                  const term = String(inviteSearchByProject[assignment.project_id] || '').toLowerCase().trim();
                                  const hasSelectedLeadNgo = Number(assignment.selected_lead_ngo_id || 0) > 0;
                                  const inviteEntries: Array<[number, any]> = (assignment.lead_ngo_invites || [])
                                    .map((invite) => [Number(invite.ngo_id), invite] as [number, any])
                                    .filter(([ngoId]) => Number.isFinite(ngoId) && ngoId > 0);

                                  const inviteByNgoId = new Map<number, any>(inviteEntries);

                                  const availableNgos = ngoDirectory
                                    .filter((ngo) => ngo.id !== Number(assignment.lead_ngo_id));

                                  const suggestedNgos = availableNgos.slice(0, 4);
                                  const matchedNgos = term
                                    ? availableNgos.filter((ngo) =>
                                        String(ngo.name || '').toLowerCase().includes(term) ||
                                        String(ngo.email || '').toLowerCase().includes(term)
                                      )
                                    : [];

                                  const renderNgoRow = (ngo: NgoDirectoryItem) => (
                                    (() => {
                                      const inviteRecord = inviteByNgoId.get(ngo.id);
                                      const inviteStatus = String(inviteRecord?.status || '').toLowerCase();
                                      const alreadyInvited = !!inviteRecord;
                                      const isInviteActionable = ['pending', 'invited', 'pending_acceptance', 'awaiting_acceptance', 'offered', 'assigned'].includes(inviteStatus);
                                      const isAlreadyFinal = ['accepted', 'expired', 'rejected'].includes(inviteStatus);
                                      const canInvite = !hasSelectedLeadNgo && !alreadyInvited;

                                      return (
                                    <div key={`${assignment.project_id}-${ngo.id}`} className="flex items-center justify-between gap-3 rounded-md border bg-white p-3 hover:bg-[#eaf4ff] transition-colors">
                                      <Link href={`/profile/${ngo.id}`} target="_blank" className="flex min-w-0 items-center gap-3 no-underline">
                                        <Avatar className="h-9 w-9">
                                          <AvatarFallback className="bg-udaan-orange text-white text-xs font-semibold">
                                            {getInitials(ngo.name || 'NGO')}
                                          </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-medium text-slate-900">{ngo.name}</p>
                                          <p className="truncate text-xs text-slate-500">{ngo.email || 'No email'}</p>
                                        </div>
                                      </Link>
                                      <div className="flex items-center gap-2">
                                        {alreadyInvited && !['pending','invited','pending_acceptance','awaiting_acceptance'].includes(inviteStatus) ? (
                                          <Badge variant="outline" className={getStatusBadgeClass(inviteStatus)}>
                                            {formatStatusLabel(inviteStatus)}
                                          </Badge>
                                        ) : null}
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          disabled={!allVerified || !canInvite || invitingProjectId === assignment.project_id}
                                          onClick={() => inviteLeadNgosFromDashboard(assignment.project_id, [ngo.id])}
                                        >
                                          {hasSelectedLeadNgo
                                            ? 'Lead Finalized'
                                            : invitingProjectId === assignment.project_id
                                              ? 'Inviting...'
                                              : alreadyInvited
                                                ? isAlreadyFinal
                                                  ? formatStatusLabel(inviteStatus)
                                                  : isInviteActionable
                                                    ? 'Invited'
                                                    : 'Invited'
                                                : 'Invite'}
                                        </Button>
                                      </div>
                                    </div>
                                      );
                                    })()
                                  );

                                  return (
                                    <>
                                      <Input
                                        placeholder="Search NGOs by name or email"
                                        value={inviteSearchByProject[assignment.project_id] || ''}
                                        onChange={(event) =>
                                          setInviteSearchByProject((prev) => ({
                                            ...prev,
                                            [assignment.project_id]: event.target.value
                                          }))
                                        }
                                      />

                                      {loadingNgoDirectory ? (
                                        <p className="text-xs text-slate-600">Loading NGO directory...</p>
                                      ) : availableNgos.length === 0 ? (
                                        <p className="text-xs text-slate-500">No NGOs available to suggest right now.</p>
                                      ) : (
                                        <div className="space-y-3">
                                          {!term && suggestedNgos.length > 0 ? (
                                            <div className="space-y-2">
                                              <p className="text-xs font-medium text-slate-600">Suggested NGOs</p>
                                              <div className="space-y-2">{suggestedNgos.slice(0,5).map(renderNgoRow)}</div>
                                            </div>
                                          ) : null}

                                          {term ? (
                                            <div className="space-y-2">
                                              <p className="text-xs font-medium text-slate-600">Search Results ({matchedNgos.length})</p>
                                              {matchedNgos.length > 0 ? (
                                                <div className="max-h-64 space-y-2 overflow-auto">{matchedNgos.map(renderNgoRow)}</div>
                                              ) : (
                                                <p className="text-xs text-slate-500">No NGOs found for "{inviteSearchByProject[assignment.project_id]}"</p>
                                              )}
                                            </div>
                                          ) : null}

                                          {hasSelectedLeadNgo ? (
                                            <p className="text-xs text-emerald-700">Lead NGO is already finalized for this project. New invites are disabled.</p>
                                          ) : null}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}

                                {/* Optional note removed per product request */}
                              </div>

                                {(assignment.lead_ngo_invites || []).length > 0 ? (
                                <div className="rounded-md border bg-slate-50 p-3 space-y-2">
                                  <p className="text-sm font-medium text-slate-900">Lead NGO Invitation Status</p>
                                  {(assignment.lead_ngo_invites || []).map((invite) => {
                                    const ngoFromDirectory = ngoDirectory.find(n => Number(n.id) === Number(invite.ngo_id));
                                    const displayName = invite.ngo_name || ngoFromDirectory?.name || 'NGO';
                                    const displayEmail = invite.ngo_email || ngoFromDirectory?.email || 'No email';
                                    return (
                                      <div key={invite.id} className="flex items-center justify-between gap-3 rounded-md border bg-white p-3 hover:bg-[#eaf4ff] transition-colors">
                                        <Link href={`/profile/${invite.ngo_id}`} target="_blank" className="flex min-w-0 items-center gap-3 no-underline">
                                          <Avatar className="h-9 w-9">
                                            <AvatarFallback className="bg-udaan-orange text-white text-xs font-semibold">
                                              {getInitials(displayName)}
                                            </AvatarFallback>
                                          </Avatar>
                                          <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-slate-900">{displayName}</p>
                                            <p className="truncate text-xs text-slate-500">{displayEmail}</p>
                                          </div>
                                        </Link>
                                        <div className="flex items-center gap-2">
                                          <Badge variant="outline" className={getStatusBadgeClass(invite.status)}>
                                            {formatStatusLabel(invite.status)}
                                          </Badge>
                                          {invite.selected_as_lead ? <Badge variant="secondary">Lead NGO</Badge> : null}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : null}

                              <div className="flex justify-end">
                                <Link href={`/service-requests/projects/${assignment.project_id}`}>
                                  <Button size="sm" variant="outline">Open Project Detail</Button>
                                </Link>
                              </div>
                            </div>
                          )})}
                        </div>
                      )}
                    </div>

                    <div className="rounded-md border bg-white p-4 space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">Published CSR Campaigns</p>
                          <p className="text-sm text-slate-600">Campaigns created in the CSR AI Agent and published into the campaigns table.</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={fetchPublishedCsrCampaigns}>Refresh Campaigns</Button>
                      </div>

                      {loadingPublishedCsrCampaigns ? (
                        <div className="flex items-center justify-center py-6 text-sm text-slate-600">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Loading campaigns...
                        </div>
                      ) : publishedCsrCampaigns.length === 0 ? (
                        <p className="text-sm text-slate-600">No published CSR campaigns yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {publishedCsrCampaigns.map((campaign) => {
                            const volunteerRequirement = String(campaign.impact_metrics?.volunteer_requirement || 'Not set');
                            const invitedOffers = Array.isArray(campaign.impact_metrics?.invited_offer_ids) ? campaign.impact_metrics?.invited_offer_ids.length : 0;

                            return (
                              <div key={campaign.id} className="rounded-md border bg-slate-50 p-4">
                                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                  <div className="min-w-0">
                                    <p className="font-semibold text-slate-900">{campaign.title || campaign.category || 'CSR Campaign'}</p>
                                    <p className="text-sm text-slate-600 break-words">{campaign.description || 'No description provided.'}</p>
                                  </div>
                                  <Badge variant="outline" className="w-fit">{campaign.status || 'draft'}</Badge>
                                </div>
                                <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-slate-600 md:grid-cols-4">
                                  <p>Location: {campaign.location || 'Not set'}</p>
                                  <p>Budget: INR {Number(campaign.budget_inr || 0).toLocaleString('en-IN')}</p>
                                  <p>Volunteers: {volunteerRequirement}</p>
                                  <p>Offers invited: {invitedOffers}</p>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <Button size="sm" asChild>
                                    <Link href={`/csr-campaigns/${campaign.id}`}>Open Detail</Link>
                                  </Button>
                                  <Button size="sm" variant="outline" asChild>
                                    <Link href="/companies/csr-agent">Open CSR Agent</Link>
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Active CSR Projects block removed per request */}
                  </TabsContent>

                  <TabsContent value="company-ca" className="mt-4 space-y-4">
                    <div className="space-y-4 pt-1">
                      <h3 className="font-semibold text-slate-900">Generate Company CA Panel Credentials</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Create a scoped Company CA login for your internal compliance reviewer.
                      </p>

                      <form className="mt-4 space-y-4" onSubmit={createCompanyCAAccount}>
                        <div className="space-y-3 rounded-lg border border-slate-200 p-4">
                          <p className="text-sm font-medium text-slate-700">CA ID Assignment</p>
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
                            <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                              <input
                                type="radio"
                                checked={companyCAForm.auto_generate_ca_id}
                                onChange={() => {
                                  setCompanyCAForm((prev) => ({ ...prev, auto_generate_ca_id: true, ca_id: '' }));
                                }}
                              />
                              Auto-generate CA ID
                            </label>
                            <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                              <input
                                type="radio"
                                checked={!companyCAForm.auto_generate_ca_id}
                                onChange={() => {
                                  setCompanyCAForm((prev) => ({ ...prev, auto_generate_ca_id: false }));
                                  fetchAvailableCompanyCaIds();
                                }}
                              />
                              Use existing CA ID
                            </label>
                          </div>
                          <p className="text-xs text-slate-600">
                            {companyCAForm.auto_generate_ca_id
                              ? 'A unique CA ID will be generated by the backend.'
                              : 'Select an existing CA ID to assign the same ID to this new CA account (for succession).'}
                          </p>
                        </div>

                        {!companyCAForm.auto_generate_ca_id && (
                          <div className="space-y-2">
                            <Label htmlFor="company-ca-id-select">Select CA ID</Label>
                            <select
                              id="company-ca-id-select"
                              value={companyCAForm.ca_id}
                              onChange={(e) => setCompanyCAForm((prev) => ({ ...prev, ca_id: e.target.value }))}
                              className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-900 outline-none"
                            >
                              <option value="">-- Select a CA ID --</option>
                              {availableCompanyCaIds.map((caIdEntry: any) => (
                                <option key={caIdEntry.ca_id} value={caIdEntry.ca_id}>
                                  {caIdEntry.ca_id} ({caIdEntry.users?.name || 'Unknown'})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <div className="space-y-1">
                            <Label htmlFor="company-ca-name">Name</Label>
                            <Input
                              id="company-ca-name"
                              value={companyCAForm.name}
                              onChange={(event) => setCompanyCAForm((prev) => ({ ...prev, name: event.target.value }))}
                              placeholder="CA Name"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="company-ca-email">Email</Label>
                            <Input
                              id="company-ca-email"
                              type="email"
                              value={companyCAForm.email}
                              onChange={(event) => setCompanyCAForm((prev) => ({ ...prev, email: event.target.value }))}
                              placeholder="ca@yourcompany.com"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="company-ca-password">Password</Label>
                            <Input
                              id="company-ca-password"
                              type="password"
                              value={companyCAForm.password}
                              onChange={(event) => setCompanyCAForm((prev) => ({ ...prev, password: event.target.value }))}
                              placeholder="Minimum 8 characters"
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <Button type="submit" disabled={creatingCompanyCA} className="w-full sm:w-auto">
                            {creatingCompanyCA ? 'Creating...' : 'Create Company CA Credentials'}
                          </Button>
                          <Link href="/companies/ca/login" className="w-full sm:w-auto">
                            <Button type="button" variant="outline" className="h-auto w-full whitespace-normal text-center sm:w-auto">
                              Open Company CA Panel Login
                            </Button>
                          </Link>
                        </div>
                      </form>

                      {companyCAFeedback && (
                        <p className={`mt-3 text-sm ${companyCAFeedback.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                          {companyCAFeedback.message}
                        </p>
                      )}

                      {lastCreatedCompanyCA && (
                        <div className="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-800">
                          <p className="font-medium">Generated credentials:</p>
                          <p>CA ID: {lastCreatedCompanyCA.ca_id}</p>
                          <p>Email: {lastCreatedCompanyCA.email}</p>
                          <p>Password: {lastCreatedCompanyCA.password}</p>
                          <p className="mt-1">Panel URL: /companies/ca/login</p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 pt-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <h4 className="font-semibold text-slate-900">Existing Active Company CA Accounts</h4>
                        <Button variant="outline" size="sm" onClick={fetchCompanyCAAccounts} className="w-full sm:w-auto">Refresh</Button>
                      </div>
                      {loadingCompanyCAAccounts ? (
                        <p className="mt-3 text-sm text-slate-600">Loading accounts...</p>
                      ) : activeCompanyCAAccounts.length === 0 ? (
                        <p className="mt-3 text-sm text-slate-600">No active Company CA accounts.</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {activeCompanyCAAccounts.map((account: any) => (
                            <div key={account.id} className="rounded-md border bg-slate-50 p-3 text-sm">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <p className="font-medium text-slate-900">{account.users?.name || 'Company CA'}</p>
                                <Badge variant="outline">{account.status}</Badge>
                              </div>
                              <p className="text-slate-600">{account.users?.email || 'No email'}</p>
                              {account.ca_id && <p className="mt-1 font-mono text-xs text-slate-500">CA ID: {account.ca_id}</p>}
                              <div className="mt-2 flex items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-slate-500 hover:bg-orange-50 hover:text-orange-600"
                                  onClick={() => updateCompanyCAStatus(String(account.id ?? ''), 'inactive')}
                                >
                                  <Power className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-slate-500 hover:bg-red-50 hover:text-red-600"
                                  onClick={() => deleteCompanyCAAccount(String(account.id ?? ''), account.users?.name || 'Company CA')}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {!loadingCompanyCAAccounts && inactiveCompanyCAAccounts.length > 0 && (
                        <div className="mt-5 border-t pt-4">
                          <h5 className="font-medium text-slate-900">Inactive Company CA Accounts</h5>
                          <div className="mt-3 space-y-2">
                            {inactiveCompanyCAAccounts.map((account: any) => (
                              <div key={account.id} className="rounded-md border bg-slate-50 p-3 text-sm">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <p className="font-medium text-slate-900">{account.users?.name || 'Company CA'}</p>
                                  <Badge variant="outline">{account.status}</Badge>
                                </div>
                                <p className="text-slate-600">{account.users?.email || 'No email'}</p>
                                {account.ca_id && <p className="mt-1 font-mono text-xs text-slate-500">CA ID: {account.ca_id}</p>}
                                <div className="mt-2 flex items-center gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 text-slate-500 hover:bg-orange-50 hover:text-orange-600"
                                    onClick={() => updateCompanyCAStatus(String(account.id ?? ''), 'active')}
                                  >
                                    <Power className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 text-slate-500 hover:bg-red-50 hover:text-red-600"
                                    onClick={() => deleteCompanyCAAccount(String(account.id ?? ''), account.users?.name || 'Company CA')}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="impact-reports" className="mt-4">
                    <ImpactReportsPanel />
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

export default function CompanyDashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50"><Header /><div className="container mx-auto px-4 py-8 text-gray-600">Loading dashboard...</div></div>}>
      <CompanyDashboardContent />
    </Suspense>
  );
}