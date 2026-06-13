'use client';

import { useState, useEffect, Suspense } from 'react';
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
import { Clock, CheckCircle, AlertTriangle, HeartHandshake, Trash2, Plus, Building, TicketCheck, MailCheck, Phone, Loader2, XCircle } from 'lucide-react';
import { formatDisplayDate, formatCampaignLeadLifecycleLabel, type CampaignLeadLifecycle } from '@/lib/format-date';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { SkeletonOrderItem } from '@/components/ui/skeleton';
import { ProfileDashboardTab } from '@/components/profile-dashboard-tab';
import { DashboardQuickSidebar } from '@/components/dashboard-quick-sidebar';
import { CampaignVolunteerAssignmentCard, type CampaignVolunteerAssignmentItem } from '@/components/campaign-volunteer-assignment-card';

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
  lead_ngo_id: number;
  lead_ngo_name: string;
  lead_ngo_email?: string;
  assigned_company_id: number;
  assigned_company_name: string;
  assigned_company_email?: string;
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
  campaign_location?: string;
  campaign_category?: string;
  campaign_status?: string;
  start_date?: string | null;
  end_date?: string | null;
  lifecycle: CampaignLeadLifecycle;
  volunteer_capacity?: number;
  company_name?: string;
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
      const response = await fetch('/api/service-offers?view=my-offers&limit=5', {
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

      console.log('Fetching service requests...');
      const response = await fetch('/api/service-requests?view=my-requests&limit=5', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      console.log('Service requests response:', data);
      if (data.success) {
        const requests = data.data || [];
        setOngoingNeeds(requests.filter((request: any) => !isHistoryNeed(request)));
        setHistoryNeeds(requests.filter((request: any) => isHistoryNeed(request)));
        console.log('Service requests set:', data.data?.length || 0, 'items');
        console.log('Detailed service requests:', (data.data || []).map((req: any) => ({
          id: req.id,
          title: req.title,
          status: req.status,
          volunteers_count: req.volunteers_count
        })));
      } else {
        console.error('Service requests fetch failed:', data.error);
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
                <Card className="min-h-[420px]">
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

                      <TabsContent value="your-capabilities" className="mt-4">
                        <div className="grid grid-cols-1 md:grid-cols-5 p-4 text-sm font-medium text-gray-500 border-b">
                          <div>Service</div>
                          <div>Category</div>
                          <div>Status</div>
                          <div>Requests</div>
                          <div className="text-right">Actions</div>
                        </div>
                        <div className="divide-y">
                          {loadingData ? (
                            <div className="p-4 text-center">
                              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                              <p className="text-sm text-muted-foreground mt-2">Loading capability offers...</p>
                            </div>
                          ) : serviceOffers.length === 0 ? (
                            <div className="p-4 text-center text-muted-foreground">
                              <p>No capability offers yet</p>
                              <Link href="/service-offers/create">
                                <Button size="sm" className="mt-2">Create Your First Service Offer</Button>
                              </Link>
                            </div>
                          ) : (
                            serviceOffers.map((offer) => (
                              <div key={offer.id} className="grid grid-cols-1 md:grid-cols-4 p-4 text-sm items-center">
                                <div className="font-medium">{offer.title}</div>
                                <div>{offer.category}</div>
                                <div>
                                  <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                    offer.status === 'active'
                                    ? 'bg-green-50 text-green-700'
                                      : offer.status === 'paused'
                                      ? 'bg-amber-50 text-amber-700'
                                      : 'bg-gray-50 text-gray-700'
                                  }`}>
                                    {offer.status === 'active' ? 'Available' : offer.status?.charAt(0).toUpperCase() + offer.status?.slice(1) || 'Unknown'}
                                  </span>
                                </div>
                                <div className="flex justify-end gap-2">
                                  <Link href={`/service-offers/${offer.id}`}>
                                    <Button variant="ghost" size="sm">View</Button>
                                  </Link>
                                  <Link href={`/service-offers/edit/${offer.id}`}>
                                    <Button variant="outline" size="sm">Edit</Button>
                                  </Link>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
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
                          <div key={request.id} className="rounded-md border bg-white p-4 space-y-3">
                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                              <div>
                                <p className="font-semibold">{request.title}</p>
                                <p className="text-sm text-muted-foreground">{request.project?.title || request.location}</p>
                              </div>
                              <Badge variant="outline">{request.status}</Badge>
                            </div>
                            <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-4 text-muted-foreground">
                              <p>Accepted: {request.accepted_count || 0}</p>
                              <p>Completed: {request.completed_count || 0}</p>
                              <p>Location: {request.project?.exact_address || request.project?.location || request.location || 'Not set'}</p>
                              <p>Target: {request.category?.toLowerCase().includes('financial') ? `INR ${Number(request.estimated_budget || 0).toLocaleString('en-IN')}` : request.beneficiary_count || 0}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Link href={`/service-requests/${request.id}`}>
                                <Button variant="outline" size="sm">View</Button>
                              </Link>
                              <Link href={`/service-requests/edit/${request.id}`}>
                                <Button variant="outline" size="sm">Edit</Button>
                              </Link>
                              <Link href={`/service-requests/applicants/${request.id}`}>
                                <Button variant="outline" size="sm">Applicants</Button>
                              </Link>
                            </div>
                          </div>
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
                          <div key={request.id} className="rounded-md border bg-white p-4 space-y-3">
                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                              <div>
                                <p className="font-semibold">{request.title}</p>
                                <p className="text-sm text-muted-foreground">{request.project?.title || request.location}</p>
                              </div>
                              <Badge variant="outline">{request.status}</Badge>
                            </div>
                            <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-3 text-muted-foreground">
                              <p>Accepted: {request.accepted_count || 0}</p>
                              <p>Completed: {request.completed_count || 0}</p>
                              <p>Location: {request.project?.exact_address || request.project?.location || request.location || 'Not set'}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Link href={`/service-requests/${request.id}`}>
                                <Button variant="outline" size="sm">View</Button>
                              </Link>
                            </div>
                          </div>
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
                                <div key={`${assignment.project_id}:${assignment.assigned_company_id}`} className="rounded-md border bg-white p-3 space-y-3">
                                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                    <div>
                                      <p className="font-semibold">{assignment.project_title}</p>
                                      <p className="text-sm text-slate-600">Company: {assignment.assigned_company_name}</p>
                                      <p className="text-xs text-slate-500">{assignment.assigned_company_email || 'No email'} • {assignment.project_location || 'Location not set'}</p>
                                    </div>
                                    <Badge variant="outline" className={`w-fit ${getStatusBadgeClass(assignment.assignment_status)}`}>
                                      {formatStatusLabel(assignment.assignment_status)}
                                    </Badge>
                                  </div>

                                  <div className="flex flex-wrap gap-2">
                                    <Link href={`/service-requests/projects/${assignment.project_id}`}>
                                      <Button size="sm" variant="outline">View Project</Button>
                                    </Link>
                                  </div>
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
                                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                    <div>
                                      <p className="font-semibold">{assignment.campaign_title}</p>
                                      <p className="text-sm text-muted-foreground">Lead NGO • {assignment.company_name}</p>
                                      <p className="text-xs text-muted-foreground">{assignment.campaign_location || 'Location not set'}</p>
                                    </div>
                                    <Badge variant="outline" className={`w-fit ${getCampaignLifecycleBadgeClass(assignment.lifecycle)}`}>
                                      {formatCampaignLeadLifecycleLabel(assignment.lifecycle)}
                                    </Badge>
                                  </div>
                                  <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-2">
                                    <p>Category: {assignment.campaign_category || 'Not set'}</p>
                                    <p>
                                      Timeline: {formatDisplayDate(assignment.start_date) || 'Start TBD'} → {formatDisplayDate(assignment.end_date) || 'End TBD'}
                                    </p>
                                    {assignment.campaign_status === 'draft' && assignment.lifecycle === 'yet_to_start' ? (
                                      <p className="md:col-span-2 text-amber-700">Waiting for the company to publish this campaign.</p>
                                    ) : null}
                                  </div>
                                  <div className="mt-3">
                                    <Button asChild variant="outline" size="sm">
                                      <Link href={`/csr-campaigns/${assignment.campaign_id}`}>View Campaign</Link>
                                    </Button>
                                  </div>
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
                                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                    <div>
                                      <p className="font-semibold">{assignment.campaign_title}</p>
                                      <p className="text-sm text-muted-foreground">Lead NGO • {assignment.company_name}</p>
                                      <p className="text-xs text-muted-foreground">{assignment.campaign_location || 'Location not set'}</p>
                                    </div>
                                    <Badge variant="outline" className={`w-fit ${getCampaignLifecycleBadgeClass(assignment.lifecycle)}`}>
                                      {formatCampaignLeadLifecycleLabel(assignment.lifecycle)}
                                    </Badge>
                                  </div>
                                  <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-2">
                                    <p>Category: {assignment.campaign_category || 'Not set'}</p>
                                    <p>
                                      Timeline: {formatDisplayDate(assignment.start_date) || 'Start TBD'} → {formatDisplayDate(assignment.end_date) || 'End TBD'}
                                    </p>
                                  </div>
                                  <div className="mt-3">
                                    <Button asChild variant="outline" size="sm">
                                      <Link href={`/csr-campaigns/${assignment.campaign_id}`}>View Campaign</Link>
                                    </Button>
                                  </div>
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