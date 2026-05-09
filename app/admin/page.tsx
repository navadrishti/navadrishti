'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { DashboardQuickSidebar } from '@/components/dashboard-quick-sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast as sonnerToast } from 'sonner';
import { GovernmentAdminManagement } from '@/components/government-admin-management';
import { NavadrishtCAManagement } from '@/components/navadrishti-ca-management';
import {
  Gauge,
  LogOut,
  PencilLine,
  RefreshCw,
  Trash2,
  MessageSquare,
  Search,
} from 'lucide-react';

type ServiceOffer = {
  id: number;
  title: string;
  description: string;
  organization?: { id?: number; name?: string; email?: string; profile_image?: string | null } | null;
  admin_status: 'pending' | 'approved' | 'rejected';
  admin_comments?: string | null;
  created_at: string;
  submitted_for_review_at?: string | null;
  category?: string | null;
  location?: string | null;
  status?: string | null;
};

type AdminUserItem = {
  id: number;
  name: string;
  email: string;
  user_type: 'individual' | 'ngo' | 'company' | 'admin';
  verification_status: 'unverified' | 'pending' | 'verified';
  city?: string | null;
  state_province?: string | null;
  profile_image?: string | null;
  created_at?: string;
  updated_at?: string;
};

type OverviewData = {
  summary: Record<string, number>;
  counts: Record<string, any>;
  recent: {
    service_requests: Array<any>;
    service_request_projects: Array<any>;
    posts: Array<any>;
    support_tickets: Array<any>;
    announcements: Array<any>;
  };
};

type HealthData = {
  status?: string;
  checks?: {
    database?: string;
    external_services?: string;
  };
  timestamp?: string;
};

type SupportTicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

type SupportTicket = {
  id: number;
  ticket_id: string;
  user_id: number;
  user_name?: string | null;
  user_email?: string | null;
  user_type?: string | null;
  title: string;
  description: string;
  proof_url?: string | null;
  status: SupportTicketStatus;
  admin_notes?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at?: string | null;
  user?: any;
};

type SupportTicketMessage = {
  id: number;
  ticket_id: string;
  sender_id: number;
  sender_type: 'user' | 'admin' | string;
  message_type: string;
  content: string;
  attachment_url?: string | null;
  created_at: string;
  sender?: any;
};

const emptyRequestDraft = {
  title: '',
  description: '',
  category: '',
  request_type: '',
  location: '',
  status: '',
  timeline: '',
  estimated_budget: '',
  beneficiary_count: '',
  impact_description: '',
  contact_info: '',
};

const emptyProjectDraft = {
  title: '',
  description: '',
  location: '',
  exact_address: '',
  timeline: '',
  status: '',
};

const emptyUserDraft = {
  user_type: 'individual',
  verification_status: 'unverified',
};

const emptyPostDraft = {
  content: '',
  category: '',
  visibility: '',
  location: '',
  tags: '',
};

const userTypeOptions = [
  { value: 'individual', label: 'Individual' },
  { value: 'ngo', label: 'NGO' },
  { value: 'company', label: 'Company' },
  { value: 'admin', label: 'Admin' },
];

const verificationStatusOptions = [
  { value: 'unverified', label: 'Unverified' },
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
];

const projectStatusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

const requestStatusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const postVisibilityOptions = [
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
  { value: 'connections', label: 'Connections' },
  { value: 'draft', label: 'Draft' },
];

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [serviceOffers, setServiceOffers] = useState<ServiceOffer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<ServiceOffer | null>(null);
  const [reviewComments, setReviewComments] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [requestDraft, setRequestDraft] = useState(emptyRequestDraft);
  const [savingRequest, setSavingRequest] = useState(false);
  const [deletingRequest, setDeletingRequest] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [projectDraft, setProjectDraft] = useState(emptyProjectDraft);
  const [savingProject, setSavingProject] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminUserItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUserItem | null>(null);
  const [userDraft, setUserDraft] = useState(emptyUserDraft);
  const [savingUser, setSavingUser] = useState(false);
  const [adminProjects, setAdminProjects] = useState<any[]>([]);
  const [adminRequests, setAdminRequests] = useState<any[]>([]);
  const [adminPosts, setAdminPosts] = useState<any[]>([]);
  const [adminTickets, setAdminTickets] = useState<any[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [offerQuery, setOfferQuery] = useState('');
  const [projectQuery, setProjectQuery] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [requestQuery, setRequestQuery] = useState('');
  const [postQuery, setPostQuery] = useState('');
  const [supportQuery, setSupportQuery] = useState('');
  const [supportStatusFilter, setSupportStatusFilter] = useState<SupportTicketStatus | 'all'>('all');
  const [selectedTicketDetail, setSelectedTicketDetail] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusUpdate, setStatusUpdate] = useState<SupportTicketStatus>('open');
  const [adminNotes, setAdminNotes] = useState('');
  const [replyMessage, setReplyMessage] = useState('');
  const [replying, setReplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [refundRequestId, setRefundRequestId] = useState('');
  const [refundPaymentId, setRefundPaymentId] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('admin_support_refund');
  const [trackingLookupId, setTrackingLookupId] = useState('');
  const [trackingLookupLoading, setTrackingLookupLoading] = useState(false);
  const [trackingSnapshot, setTrackingSnapshot] = useState<any | null>(null);
  const [selectedPost, setSelectedPost] = useState<any | null>(null);
  const [postDraft, setPostDraft] = useState(emptyPostDraft);
  const [savingPost, setSavingPost] = useState(false);
  const [deletingPost, setDeletingPost] = useState(false);

  const verifyAdmin = async () => {
    try {
      const hasTab = typeof window !== 'undefined' && sessionStorage.getItem('admin_tab_session');
      if (!hasTab) {
        setIsAdmin(false);
        router.push('/admin/login');
        return false;
      }
    } catch (e) {
      // ignore sessionStorage errors
    }

    const response = await fetch('/api/admin/verify', { credentials: 'include' });
    if (!response.ok) {
      setIsAdmin(false);
      router.push('/admin/login');
      return false;
    }

    setIsAdmin(true);
    return true;
  };

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const [overviewResponse, offersResponse, healthResponse] = await Promise.all([
        fetch('/api/admin/overview', { credentials: 'include' }),
        fetch('/api/admin/service-offers', { credentials: 'include' }),
        fetch('/api/health'),
      ]);

      const overviewData = await overviewResponse.json();
      const offersData = await offersResponse.json();
      const healthData = await healthResponse.json();

      if (overviewResponse.ok && overviewData?.success) {
        setOverview(overviewData.data || null);
      } else {
        throw new Error(overviewData?.error || 'Failed to load admin overview');
      }

      if (offersResponse.ok && offersData?.success) {
        setServiceOffers(Array.isArray(offersData.offers) ? offersData.offers : []);
      } else {
        throw new Error(offersData?.error || 'Failed to load service offers');
      }

      setHealth(healthResponse.ok ? healthData : null);

      const usersResponse = await fetch('/api/admin/users?limit=200', { credentials: 'include' });
      const usersData = await usersResponse.json();
      if (usersResponse.ok && usersData?.success) {
        setAdminUsers(Array.isArray(usersData.users) ? usersData.users : []);
      } else {
        setAdminUsers([]);
      }

      const [projectsResponse, requestsResponse, postsResponse, ticketsResponse] = await Promise.all([
        fetch('/api/admin/service-request-projects?limit=200', { credentials: 'include' }),
        fetch('/api/admin/service-requests?limit=200', { credentials: 'include' }),
        fetch('/api/admin/posts?limit=200', { credentials: 'include' }),
        fetch('/api/admin/support-tickets?limit=200', { credentials: 'include' }),
      ]);

      const [projectsData, requestsData, postsData, ticketsData] = await Promise.all([
        projectsResponse.json(),
        requestsResponse.json(),
        postsResponse.json(),
        ticketsResponse.json(),
      ]);

      setAdminProjects(projectsResponse.ok && projectsData?.success ? (Array.isArray(projectsData.projects) ? projectsData.projects : []) : []);
      setAdminRequests(requestsResponse.ok && requestsData?.success ? (Array.isArray(requestsData.requests) ? requestsData.requests : []) : []);
      setAdminPosts(postsResponse.ok && postsData?.success ? (Array.isArray(postsData.posts) ? postsData.posts : []) : []);
      setAdminTickets(ticketsResponse.ok && ticketsData?.success ? (Array.isArray(ticketsData.tickets) ? ticketsData.tickets : []) : []);
      // initialize small tickets list for support UI
      setTickets(ticketsResponse.ok && ticketsData?.success ? (Array.isArray(ticketsData.tickets) ? ticketsData.tickets : []) : []);
    } catch (error: any) {
      sonnerToast.error(error?.message || 'Failed to load admin dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchTickets = async (status?: SupportTicketStatus, q?: string) => {
    try {
      setSupportLoading(true);
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (q) params.set('q', q);
      const response = await fetch(`/api/admin/support-tickets?${params.toString()}`, { credentials: 'include' });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || 'Failed to fetch tickets');
      setTickets(Array.isArray(data.tickets) ? data.tickets : []);
    } catch (err: any) {
      sonnerToast.error(err?.message || 'Failed to load tickets');
      setTickets([]);
    } finally {
      setSupportLoading(false);
    }
  };

  const loadTicketDetails = async (ticketId: string) => {
    try {
      setDetailLoading(true);
      const response = await fetch(`/api/admin/support-tickets/${encodeURIComponent(ticketId)}`, { credentials: 'include' });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || 'Failed to load ticket details');
      setSelectedTicketDetail(data.ticket || null);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setStatusUpdate((data.ticket?.status || 'open') as SupportTicketStatus);
      setAdminNotes(data.ticket?.admin_notes || '');
    } catch (err: any) {
      sonnerToast.error(err?.message || 'Failed to load ticket');
    } finally {
      setDetailLoading(false);
    }
  };

  const selectTicket = (ticket: SupportTicket) => {
    setSelectedTicketDetail(ticket);
    setReplyMessage('');
    setRefundRequestId('');
    setRefundPaymentId('');
    setRefundAmount('');
    setRefundReason('admin_support_refund');
    setTrackingLookupId('');
    setTrackingSnapshot(null);
    loadTicketDetails(ticket.ticket_id);
  };

  const lookupDeliveryTracking = async () => {
    const trackingId = trackingLookupId.trim();
    if (!trackingId) {
      sonnerToast.error('Tracking ID required');
      return;
    }
    try {
      setTrackingLookupLoading(true);
      const response = await fetch('/api/admin/delivery/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ trackingId }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || 'Failed to fetch tracking');
      setTrackingSnapshot(data.data || null);
      sonnerToast.success('Tracking synced');
    } catch (err: any) {
      sonnerToast.error(err?.message || 'Tracking lookup failed');
      setTrackingSnapshot(null);
    } finally {
      setTrackingLookupLoading(false);
    }
  };

  const sendReply = async () => {
    if (!selectedTicketDetail || !replyMessage.trim()) {
      sonnerToast.error('Reply message required');
      return;
    }
    try {
      setReplying(true);
      const response = await fetch(`/api/admin/support-tickets/${encodeURIComponent(selectedTicketDetail.ticket_id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: statusUpdate, admin_notes: adminNotes, reply_message: replyMessage }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || 'Failed to send reply');
      sonnerToast.success('Reply sent');
      setSelectedTicketDetail(data.ticket || null);
      setTickets((prev) => prev.map((t) => (t.ticket_id === data.ticket.ticket_id ? data.ticket : t)));
      setReplyMessage('');
      await loadTicketDetails(selectedTicketDetail.ticket_id);
    } catch (err: any) {
      sonnerToast.error(err?.message || 'Reply failed');
    } finally {
      setReplying(false);
    }
  };

  const initiateRefund = async () => {
    if (!selectedTicketDetail) return;
    if (!refundRequestId.trim() || !refundPaymentId.trim()) {
      sonnerToast.error('Refund details required');
      return;
    }
    try {
      setRefunding(true);
      const response = await fetch(`/api/admin/support-tickets/${encodeURIComponent(selectedTicketDetail.ticket_id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ service_request_id: refundRequestId, razorpay_payment_id: refundPaymentId, amount: refundAmount, reason: refundReason }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || 'Failed to initiate refund');
      sonnerToast.success('Refund initiated');
      setSelectedTicketDetail((prev) => (prev ? { ...prev, status: 'resolved' } : prev));
      setTickets((prev) => prev.map((t) => (t.ticket_id === selectedTicketDetail.ticket_id ? { ...t, status: 'resolved' } : t)));
      await loadTicketDetails(selectedTicketDetail.ticket_id);
    } catch (err: any) {
      sonnerToast.error(err?.message || 'Refund failed');
    } finally {
      setRefunding(false);
    }
  };

  const updateSelectedTicket = async () => {
    if (!selectedTicketDetail) return;
    try {
      setSaving(true);
      const response = await fetch(`/api/admin/support-tickets/${encodeURIComponent(selectedTicketDetail.ticket_id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: statusUpdate, admin_notes: adminNotes }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || 'Failed to update ticket');
      sonnerToast.success('Ticket updated');
      setSelectedTicketDetail(data.ticket || null);
      setTickets((prev) => prev.map((t) => (t.ticket_id === data.ticket.ticket_id ? data.ticket : t)));
      await loadTicketDetails(selectedTicketDetail.ticket_id);
    } catch (err: any) {
      sonnerToast.error(err?.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const boot = async () => {
      const ok = await verifyAdmin();
      if (ok) {
        await loadDashboard();
      } else {
        setLoading(false);
      }
    };

    boot();

    const sessionCheck = setInterval(async () => {
      const response = await fetch('/api/admin/verify', { credentials: 'include' });
      if (!response.ok) {
        sonnerToast.error('Session expired. Please login again.');
        router.push('/admin/login');
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(sessionCheck);
  }, [router]);

  const handleLogout = async () => {
    const authCookieNames = ['token', 'user', 'ca-token', 'company-ca-token', 'navadrishti-ca-token', 'admin-token', 'govt-admin-token'];
    const clearAuthCookies = () => {
      try {
        authCookieNames.forEach((name) => {
          document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax;`;
          document.cookie = `${name}=; Path=/api/admin; Max-Age=0; SameSite=Lax;`;
        });
      } catch (e) {}
    };

    try {
      await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
    } finally {
      clearAuthCookies();
      router.push('/admin/login');
    }
  };

  const refreshDashboard = async () => {
    await loadDashboard();
  };

  const handleReview = async (offerId: number, action: 'approve' | 'reject') => {
    if (!reviewComments.trim()) {
      sonnerToast.error('Please add review comments');
      return;
    }

    try {
      setIsReviewing(true);
      const response = await fetch(`/api/admin/service-offers/${offerId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, comments: reviewComments }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Failed to ${action} service offer`);
      }

      sonnerToast.success(`Service offer ${action}d successfully`);
      setReviewComments('');
      setSelectedOffer(null);
      await loadDashboard();
    } catch (error: any) {
      sonnerToast.error(error?.message || `Failed to ${action} service offer`);
    } finally {
      setIsReviewing(false);
    }
  };

  const selectRequest = (requestItem: any) => {
    setSelectedRequest(requestItem);
    setRequestDraft({
      title: requestItem?.title || '',
      description: requestItem?.description || '',
      category: requestItem?.category || '',
      request_type: requestItem?.request_type || '',
      location: requestItem?.location || '',
      status: requestItem?.status || '',
      timeline: requestItem?.timeline || '',
      estimated_budget: requestItem?.estimated_budget?.toString?.() || '',
      beneficiary_count: requestItem?.beneficiary_count?.toString?.() || '',
      impact_description: requestItem?.impact_description || '',
      contact_info: requestItem?.contact_info || '',
    });
  };

  const selectProject = (projectItem: any) => {
    setSelectedProject(projectItem);
    setProjectDraft({
      title: projectItem?.title || '',
      description: projectItem?.description || '',
      location: projectItem?.location || '',
      exact_address: projectItem?.exact_address || '',
      timeline: projectItem?.timeline || '',
      status: projectItem?.status || '',
    });
  };

  const selectUser = (userItem: AdminUserItem) => {
    setSelectedUser(userItem);
    setUserDraft({
      user_type: userItem.user_type || 'individual',
      verification_status: userItem.verification_status || 'unverified',
    });
  };

  const saveUser = async () => {
    if (!selectedUser) return;

    try {
      setSavingUser(true);
      const response = await fetch(`/api/admin/users/${encodeURIComponent(selectedUser.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(userDraft),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to update user');
      }

      sonnerToast.success('User updated');
      setSelectedUser(data.data);
      setAdminUsers((current) => current.map((item) => (item.id === data.data.id ? data.data : item)));
    } catch (error: any) {
      sonnerToast.error(error?.message || 'Failed to update user');
    } finally {
      setSavingUser(false);
    }
  };

  const saveProject = async () => {
    if (!selectedProject) return;
    try {
      setSavingProject(true);
      const response = await fetch(`/api/admin/service-request-projects/${encodeURIComponent(selectedProject.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(projectDraft),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to update project');
      }

      sonnerToast.success('CSR project updated');
      setSelectedProject(data.data);
      setOverview((current) => current ? {
        ...current,
        recent: {
          ...current.recent,
          service_request_projects: current.recent.service_request_projects.map((item) => (item.id === data.data.id ? data.data : item)),
        },
      } : current);
    } catch (error: any) {
      sonnerToast.error(error?.message || 'Failed to update project');
    } finally {
      setSavingProject(false);
    }
  };

  const deleteProject = async () => {
    if (!selectedProject) return;
    if (!window.confirm(`Delete CSR project ${selectedProject.id}? This will permanently delete all linked requests.`)) return;

    try {
      setDeletingProject(true);
      const response = await fetch(`/api/admin/service-request-projects/${encodeURIComponent(selectedProject.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to delete project');
      }

      sonnerToast.success('CSR project deleted');
      setSelectedProject(null);
      await loadDashboard();
    } catch (error: any) {
      sonnerToast.error(error?.message || 'Failed to delete project');
    } finally {
      setDeletingProject(false);
    }
  };

  const saveRequest = async () => {
    if (!selectedRequest) return;
    try {
      setSavingRequest(true);
      const response = await fetch(`/api/admin/service-requests/${encodeURIComponent(selectedRequest.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestDraft),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to update request');
      }

      sonnerToast.success('Service request updated');
      setSelectedRequest(data.data);
      setOverview((current) => current ? {
        ...current,
        recent: {
          ...current.recent,
          service_requests: current.recent.service_requests.map((item) => (item.id === data.data.id ? data.data : item)),
        },
      } : current);
    } catch (error: any) {
      sonnerToast.error(error?.message || 'Failed to update request');
    } finally {
      setSavingRequest(false);
    }
  };

  const deleteRequest = async () => {
    if (!selectedRequest) return;
    if (!window.confirm(`Delete service request ${selectedRequest.id}? This cannot be undone.`)) return;

    try {
      setDeletingRequest(true);
      const response = await fetch(`/api/admin/service-requests/${encodeURIComponent(selectedRequest.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to delete request');
      }

      sonnerToast.success('Service request deleted');
      setSelectedRequest(null);
      await loadDashboard();
    } catch (error: any) {
      sonnerToast.error(error?.message || 'Failed to delete request');
    } finally {
      setDeletingRequest(false);
    }
  };

  const selectPost = (post: any) => {
    setSelectedPost(post);
    setPostDraft({
      content: post?.content || '',
      category: post?.category || '',
      visibility: post?.visibility || '',
      location: post?.location || '',
      tags: Array.isArray(post?.tags) ? post.tags.join(', ') : '',
    });
  };

  const savePost = async () => {
    if (!selectedPost) return;
    try {
      setSavingPost(true);
      const response = await fetch(`/api/admin/posts/${encodeURIComponent(selectedPost.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...postDraft,
          tags: postDraft.tags,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to update post');
      }

      sonnerToast.success('Post updated');
      setSelectedPost(data.post);
      setOverview((current) => current ? {
        ...current,
        recent: {
          ...current.recent,
          posts: current.recent.posts.map((item) => (item.id === data.post.id ? data.post : item)),
        },
      } : current);
    } catch (error: any) {
      sonnerToast.error(error?.message || 'Failed to update post');
    } finally {
      setSavingPost(false);
    }
  };

  const deletePost = async () => {
    if (!selectedPost) return;
    if (!window.confirm(`Delete post ${selectedPost.id}? This cannot be undone.`)) return;

    try {
      setDeletingPost(true);
      const response = await fetch(`/api/admin/posts/${encodeURIComponent(selectedPost.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to delete post');
      }

      sonnerToast.success('Post deleted');
      setSelectedPost(null);
      await loadDashboard();
    } catch (error: any) {
      sonnerToast.error(error?.message || 'Failed to delete post');
    } finally {
      setDeletingPost(false);
    }
  };

  const stats = overview?.summary || {};
  const userCount = adminUsers.length;
  const requestCount = adminRequests.length;
  const postCount = adminPosts.length;
  const supportCount = adminTickets.length;

  const statusTone = (value?: string) => {
    const normalized = String(value || '').toLowerCase();
    if (normalized === 'healthy' || normalized === 'approved' || normalized === 'verified') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (normalized === 'degraded' || normalized === 'pending' || normalized === 'in_progress') return 'bg-amber-100 text-amber-800 border-amber-200';
    if (normalized === 'unhealthy' || normalized === 'rejected' || normalized === 'closed') return 'bg-rose-100 text-rose-800 border-rose-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const badgeClassName = 'pointer-events-none select-none cursor-default';

  const textMatch = (value: unknown, query: string) => String(value || '').toLowerCase().includes(query.toLowerCase());

  const recentActivities = useMemo(() => {
    const recent = overview?.recent;
    if (!recent) return [];

    const activities: Array<{
      id: string;
      title: string;
      detail: string;
      timestamp: number;
    }> = [];

    const pushActivities = (
      items: Array<any> | undefined,
      type: string,
      titleForItem: (item: any) => string,
      detailForItem: (item: any) => string,
    ) => {
      if (!Array.isArray(items)) return;

      items.forEach((item) => {
        const timestampValue = item?.created_at || item?.updated_at || item?.submitted_for_review_at;
        const timestamp = timestampValue ? new Date(timestampValue).getTime() : Number.NaN;
        if (Number.isNaN(timestamp)) return;

        activities.push({
          id: `${type}-${item?.id ?? item?.ticket_id ?? timestamp}`,
          title: titleForItem(item),
          detail: detailForItem(item),
          timestamp,
        });
      });
    };

    pushActivities(recent.service_requests, 'service-request', (item) => 'Service request posted', (item) => item?.title || item?.requester?.name || 'New request created');
    pushActivities(recent.service_request_projects, 'project', (item) => 'CSR project added', (item) => item?.title || item?.ngo?.name || 'New project created');
    pushActivities(recent.posts, 'post', (item) => 'Post published', (item) => item?.content || item?.author?.name || 'New post created');
    pushActivities(recent.support_tickets, 'ticket', (item) => 'Support ticket opened', (item) => item?.title || item?.user_name || 'New ticket created');
    pushActivities(recent.announcements, 'announcement', (item) => 'Announcement posted', (item) => item?.title || item?.content || 'New announcement created');

    return activities
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);
  }, [overview]);

  const filteredOffers = useMemo(() => {
    const query = offerQuery.trim();
    if (!query) return serviceOffers;
    return serviceOffers.filter((offer) => (
      textMatch(offer.title, query)
      || textMatch(offer.description, query)
      || textMatch(offer.organization?.name, query)
      || textMatch(offer.category, query)
      || textMatch(offer.location, query)
    ));
  }, [serviceOffers, offerQuery]);

  const filteredProjects = useMemo(() => {
    const query = projectQuery.trim();
    if (!query) return adminProjects;
    return adminProjects.filter((project) => (
      textMatch(project.title, query)
      || textMatch(project.description, query)
      || textMatch(project.ngo?.name, query)
      || textMatch(project.location, query)
      || textMatch(project.status, query)
      || textMatch(project.id, query)
    ));
  }, [adminProjects, projectQuery]);

  const filteredUsers = useMemo(() => {
    const query = userQuery.trim();
    if (!query) return adminUsers;
    return adminUsers.filter((item) => (
      textMatch(item.name, query)
      || textMatch(item.email, query)
      || textMatch(item.user_type, query)
      || textMatch(item.verification_status, query)
      || textMatch(item.city, query)
      || textMatch(item.state_province, query)
      || textMatch(item.id, query)
    ));
  }, [adminUsers, userQuery]);

  const filteredRequests = useMemo(() => {
    const query = requestQuery.trim();
    if (!query) return adminRequests;
    return adminRequests.filter((item) => (
      textMatch(item.title, query)
      || textMatch(item.description, query)
      || textMatch(item.requester?.name, query)
      || textMatch(item.category, query)
      || textMatch(item.status, query)
      || textMatch(item.location, query)
      || textMatch(item.id, query)
    ));
  }, [adminRequests, requestQuery]);

  const filteredPosts = useMemo(() => {
    const query = postQuery.trim();
    if (!query) return adminPosts;
    return adminPosts.filter((item) => (
      textMatch(item.author?.name, query)
      || textMatch(item.content, query)
      || textMatch(item.category, query)
      || textMatch(item.visibility, query)
      || textMatch(item.location, query)
      || textMatch(item.id, query)
    ));
  }, [adminPosts, postQuery]);

  const visibleTickets = useMemo(() => {
    const query = supportQuery.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const statusPass = supportStatusFilter === 'all' || ticket.status === supportStatusFilter;
      if (!statusPass) return false;
      if (!query) return true;
      return (
        String(ticket.title || '').toLowerCase().includes(query)
        || String(ticket.description || '').toLowerCase().includes(query)
        || String(ticket.ticket_id || '').toLowerCase().includes(query)
        || String(ticket.user_name || ticket.user?.name || '').toLowerCase().includes(query)
      );
    });
  }, [tickets, supportQuery, supportStatusFilter]);

  if (loading && !overview) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 via-slate-50 to-white text-slate-900">
        <header className="sticky top-0 z-50 border-b border-blue-700 bg-blue-600/95 backdrop-blur">
          <div className="mx-auto max-w-6xl px-6">
            <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <Skeleton className="h-3 w-24 rounded-full bg-blue-200/70" />
                <Skeleton className="h-5 w-40 rounded-full bg-blue-200/70" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-9 w-20 rounded-full bg-blue-200/70" />
                <Skeleton className="h-9 w-24 rounded-full bg-blue-200/70" />
                <Skeleton className="h-9 w-24 rounded-full bg-blue-200/70" />
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto h-[calc(100vh-88px)] max-w-7xl overflow-hidden px-6 pt-6 pb-6">
          <div className="grid h-full grid-cols-1 items-start gap-6 overflow-hidden lg:grid-cols-12">
            <div className="flex h-auto flex-col gap-2 rounded-3xl border border-blue-100 bg-white p-2.5 lg:col-span-3 lg:sticky lg:top-6">
              <Skeleton className="h-10 w-full rounded-xl bg-slate-200/80" />
              <Skeleton className="h-10 w-full rounded-xl bg-slate-200/80" />
              <Skeleton className="h-10 w-full rounded-xl bg-slate-200/80" />
              <Skeleton className="h-10 w-full rounded-xl bg-slate-200/80" />
              <Skeleton className="h-10 w-full rounded-xl bg-slate-200/80" />
              <Skeleton className="h-10 w-full rounded-xl bg-slate-200/80" />
              <Skeleton className="h-10 w-full rounded-xl bg-slate-200/80" />
            </div>

            <Card className="h-full min-w-0 overflow-hidden border-blue-200/80 bg-white text-slate-900 lg:col-span-9">
              <CardContent className="h-full overflow-hidden pt-6">
                <div className="grid h-full gap-6 overflow-y-auto pr-1 xl:grid-cols-[0.95fr_1.05fr]">
                  <Card className="border-blue-100 bg-white text-slate-900">
                    <CardHeader>
                      <Skeleton className="h-6 w-40 rounded-full bg-slate-200" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Skeleton className="h-20 w-full rounded-xl bg-slate-200" />
                      <Skeleton className="h-20 w-full rounded-xl bg-slate-200" />
                      <Skeleton className="h-20 w-full rounded-xl bg-slate-200" />
                      <Skeleton className="h-20 w-full rounded-xl bg-slate-200" />
                    </CardContent>
                  </Card>

                  <div className="grid min-w-0 gap-6">
                    <Card className="border-blue-100 bg-white text-slate-900">
                      <CardHeader>
                        <Skeleton className="h-6 w-36 rounded-full bg-slate-200" />
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <Skeleton className="h-12 w-full rounded-lg bg-slate-200" />
                        <Skeleton className="h-12 w-full rounded-lg bg-slate-200" />
                        <Skeleton className="h-12 w-full rounded-lg bg-slate-200" />
                        <Skeleton className="h-3 w-56 rounded-full bg-slate-200" />
                      </CardContent>
                    </Card>

                    <Card className="border-blue-100 bg-white text-slate-900">
                      <CardHeader>
                        <Skeleton className="h-6 w-32 rounded-full bg-slate-200" />
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <Skeleton className="h-12 w-full rounded-lg bg-slate-200" />
                        <Skeleton className="h-12 w-full rounded-lg bg-slate-200" />
                        <Skeleton className="h-12 w-full rounded-lg bg-slate-200" />
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-b from-blue-50 via-slate-50 to-white text-slate-900">
      <header className="sticky top-0 z-50 border-b border-blue-700 bg-blue-600/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 text-white">
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-blue-100">Signed in as</span>
              <span className="text-sm font-semibold leading-5 text-white">{user?.name || 'admin'}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" className="text-white hover:bg-blue-700 hover:text-white" onClick={refreshDashboard}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button variant="ghost" size="sm" className="text-white hover:bg-blue-700 hover:text-white" onClick={() => setActiveTab('support')}>
                Support
              </Button>
              <Button variant="outline" size="sm" className="border-white/40 bg-blue-600 text-white hover:bg-transparent hover:text-white" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto h-[calc(100vh-88px)] max-w-7xl overflow-hidden px-6 pt-6 pb-6">
        <div className="grid h-full grid-cols-1 items-start gap-6 overflow-hidden lg:grid-cols-12">
          <DashboardQuickSidebar
            items={[
              { value: 'overview', label: 'Overview' },
              { value: 'offers', label: 'Offers' },
              { value: 'projects', label: 'Projects' },
              { value: 'users', label: 'People' },
              { value: 'requests', label: 'Requests' },
              { value: 'posts', label: 'Posts' },
              { value: 'support', label: 'Support' },
              { value: 'government-admins', label: 'Govt Admins' },
              { value: 'ca-credentials', label: 'CA Credentials' },
            ]}
            activeTab={activeTab}
            onSelect={setActiveTab}
            desktopClassName="lg:col-span-3 lg:sticky lg:top-6"
            triggerLabel="Admin Menu"
          />

          <Card className="h-full min-h-0 overflow-hidden border-blue-200/80 bg-white text-slate-900 lg:col-span-9">
            <CardContent className="h-full min-h-0 overflow-y-auto pt-6 pr-4 lg:overflow-y-auto">
            {activeTab === 'overview' && (
            <div className="mt-0 h-full min-h-0 space-y-6 overflow-y-auto pr-1">
              <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                <Card className="min-w-0 border-blue-100 bg-white text-slate-900">
                  <CardHeader>
                    <CardTitle className="text-slate-900">Executive index</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-blue-100 bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">All users</p>
                        <p className="mt-1 text-2xl font-bold text-slate-900">{stats.total_users ?? userCount}</p>
                      </div>
                      <div className="rounded-lg border border-blue-100 bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">All offers</p>
                        <p className="mt-1 text-2xl font-bold text-slate-900">{stats.total_offers ?? serviceOffers.length}</p>
                      </div>
                      <div className="rounded-lg border border-blue-100 bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">All requests</p>
                        <p className="mt-1 text-2xl font-bold text-slate-900">{stats.total_requests ?? requestCount}</p>
                      </div>
                      <div className="rounded-lg border border-blue-100 bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">All projects</p>
                        <p className="mt-1 text-2xl font-bold text-slate-900">{stats.total_projects ?? adminProjects.length}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-slate-50 p-3">
                      <span>Pending offers</span>
                      <Badge className={`${badgeClassName} ${statusTone(overview?.counts?.offers_by_status?.pending ? 'pending' : 'healthy')}`}>{overview?.counts?.offers_by_status?.pending ?? 0}</Badge>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-slate-50 p-3">
                      <span>Open support tickets</span>
                      <Badge className={`${badgeClassName} ${statusTone('healthy')}`}>{(overview?.counts?.tickets_by_status?.open || 0) + (overview?.counts?.tickets_by_status?.in_progress || 0)}</Badge>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-slate-50 p-3">
                      <span>Verified users</span>
                      <Badge className={`${badgeClassName} ${statusTone('verified')}`}>{overview?.counts?.users_by_verification?.verified || 0}</Badge>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-slate-50 p-3">
                      <span>Health status</span>
                      <Badge className={`${badgeClassName} ${statusTone(health?.status)}`}>{health?.status || 'unknown'}</Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card className="min-w-0 border-blue-100 bg-white text-slate-900">
                  <CardHeader>
                    <CardTitle className="text-slate-900">Platform health & Activity</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div>
                      <p className="mb-2 font-semibold text-slate-900">Health Status</p>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-slate-50 p-3"><span>Overall</span><Badge className={statusTone(health?.status)}>{health?.status || 'unknown'}</Badge></div>
                        <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-slate-50 p-3"><span>Database</span><Badge className={statusTone(health?.checks?.database)}>{health?.checks?.database || 'unknown'}</Badge></div>
                        <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-slate-50 p-3"><span>External services</span><Badge className={statusTone(health?.checks?.external_services)}>{health?.checks?.external_services || 'unknown'}</Badge></div>
                      </div>
                    </div>
                    <div className="border-t border-blue-100 pt-4">
                      <p className="mb-2 font-semibold text-slate-900">Recent Activity</p>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {recentActivities.length === 0 ? (
                          <p className="text-xs text-slate-500">No recent activity yet.</p>
                        ) : recentActivities.map((activity) => (
                          <div key={activity.id} className="rounded-lg border border-blue-100 bg-slate-50 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-slate-900 truncate">{activity.title}</p>
                                <p className="mt-0.5 line-clamp-1 text-xs text-slate-600">{activity.detail}</p>
                              </div>
                              <span className="shrink-0 whitespace-nowrap text-[10px] text-slate-500">{new Date(activity.timestamp).toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
            )}

            {activeTab === 'offers' && (
            <div className="h-full min-h-0 space-y-6 overflow-y-auto overflow-x-hidden pr-1">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Service Offers</h2>
                </div>
                <div className="w-full md:w-80">
                  <Input
                    value={offerQuery}
                    onChange={(e) => setOfferQuery(e.target.value)}
                    placeholder="Search offer by title, org, category, location"
                    className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div className="grid gap-6 overflow-x-hidden xl:grid-cols-[0.9fr_1.1fr]">
              <Card className="border-blue-100 bg-white text-slate-900 min-w-0">
                <CardHeader>
                  <CardTitle className="text-slate-900">Review queue</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {filteredOffers.length === 0 ? (
                    <p className="text-sm text-slate-500">No offers found.</p>
                  ) : filteredOffers.map((offer) => (
                    <button key={offer.id} onClick={() => setSelectedOffer(offer)} className={`w-full rounded-xl border p-4 text-left transition duration-200 ${selectedOffer?.id === offer.id ? 'border-blue-400 bg-blue-50' : 'border-blue-100 bg-white hover:bg-slate-50'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{offer.title}</p>
                          <p className="text-xs text-slate-500">{offer.organization?.name || 'Unknown organization'}</p>
                        </div>
                        <Badge className={statusTone(offer.admin_status)}>{offer.admin_status}</Badge>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-slate-600">{offer.description}</p>
                    </button>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-blue-100 bg-white text-slate-900">
                <CardHeader>
                  <CardTitle className="text-slate-900">Offer details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!selectedOffer ? (
                    <p className="text-sm text-slate-500">Select an offer to review it.</p>
                  ) : (
                    <>
                      <div className="space-y-2 rounded-lg border border-blue-100 bg-slate-50 p-4 text-sm">
                        <p className="font-semibold text-slate-900">{selectedOffer.title}</p>
                        <p className="text-slate-700">{selectedOffer.description}</p>
                        <div className="flex flex-wrap gap-2 pt-2 text-xs text-slate-500">
                          <span>ID #{selectedOffer.id}</span>
                          <span>•</span>
                          <span>{new Date(selectedOffer.created_at || Date.now()).toLocaleString('en-IN')}</span>
                          <span>•</span>
                          <span>{selectedOffer.organization?.name || 'Unknown org'}</span>
                          {selectedOffer.category ? <span>• {selectedOffer.category}</span> : null}
                          {selectedOffer.location ? <span>• {selectedOffer.location}</span> : null}
                        </div>
                      </div>
                      <Textarea value={reviewComments} onChange={(e) => setReviewComments(e.target.value)} rows={5} placeholder="Write admin review notes" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                      <div className="flex flex-wrap gap-3">
                        <Button onClick={() => handleReview(selectedOffer.id, 'approve')} disabled={isReviewing} className="bg-emerald-600 hover:bg-emerald-500">Approve</Button>
                        <Button onClick={() => handleReview(selectedOffer.id, 'reject')} disabled={isReviewing} variant="destructive">Reject</Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
            </div>
            )}

            {activeTab === 'projects' && (
            <div className="grid h-full min-h-0 gap-6 overflow-x-hidden overflow-y-auto pr-1 xl:grid-cols-[0.85fr_1.15fr]">
              <Card className="min-w-0 border-blue-100 bg-white text-slate-900">
                <CardHeader>
                  <CardTitle className="text-slate-900">CSR projects</CardTitle>
                  <Input
                    value={projectQuery}
                    onChange={(e) => setProjectQuery(e.target.value)}
                    placeholder="Search project by id, title, NGO, status, location"
                    className="mt-3 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400"
                  />
                </CardHeader>
                <CardContent className="space-y-3">
                  {filteredProjects.map((project) => (
                    <button key={project.id} onClick={() => selectProject(project)} className={`w-full rounded-2xl border p-4 text-left transition duration-200 ${selectedProject?.id === project.id ? 'border-blue-400 bg-blue-50' : 'border-blue-100 bg-white hover:bg-slate-50'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{project.title}</p>
                          <p className="text-xs text-slate-500">{project.ngo?.name || 'Unknown NGO'}</p>
                        </div>
                        <Badge className={statusTone(project.status)}>{project.status || 'unknown'}</Badge>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-slate-600">{project.description}</p>
                    </button>
                  ))}
                  {filteredProjects.length === 0 ? <p className="text-sm text-slate-500">No projects match your search.</p> : null}
                </CardContent>
              </Card>

              <Card className="min-w-0 border-blue-100 bg-white text-slate-900">
                <CardHeader>
                  <CardTitle className="text-slate-900">Project editor</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 overflow-x-hidden">
                  {!selectedProject ? (
                    <p className="text-sm text-slate-500">Select a project to edit it.</p>
                  ) : (
                    <>
                      <div className="rounded-lg border border-blue-100 bg-slate-50 p-3 text-xs text-slate-600">
                        <div className="flex flex-wrap gap-2">
                          <span>ID #{selectedProject.id}</span>
                          <span>• NGO: {selectedProject.ngo?.name || 'Unknown'}</span>
                          <span>• Created: {new Date(selectedProject.created_at || Date.now()).toLocaleString('en-IN')}</span>
                          {selectedProject.updated_at ? <span>• Updated: {new Date(selectedProject.updated_at).toLocaleString('en-IN')}</span> : null}
                        </div>
                      </div>
                      <div className="grid gap-3 xl:grid-cols-2">
                        <Input value={projectDraft.title} onChange={(e) => setProjectDraft((prev) => ({ ...prev, title: e.target.value }))} placeholder="Title" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                        <Select value={projectDraft.status} onValueChange={(value) => setProjectDraft((prev) => ({ ...prev, status: value }))}>
                          <SelectTrigger className="border-blue-200 bg-white text-slate-900">
                            <SelectValue placeholder="Project status" />
                          </SelectTrigger>
                          <SelectContent>
                            {projectStatusOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input value={projectDraft.location} onChange={(e) => setProjectDraft((prev) => ({ ...prev, location: e.target.value }))} placeholder="Location" className="md:col-span-2 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                        <Input value={projectDraft.exact_address} onChange={(e) => setProjectDraft((prev) => ({ ...prev, exact_address: e.target.value }))} placeholder="Exact address" className="md:col-span-2 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                        <Input value={projectDraft.timeline} onChange={(e) => setProjectDraft((prev) => ({ ...prev, timeline: e.target.value }))} placeholder="Timeline" className="md:col-span-2 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                      </div>
                      <Textarea value={projectDraft.description} onChange={(e) => setProjectDraft((prev) => ({ ...prev, description: e.target.value }))} rows={6} placeholder="Project description" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                      <div className="flex flex-wrap gap-3">
                        <Button onClick={saveProject} disabled={savingProject} className="bg-blue-600 hover:bg-blue-500"><PencilLine className="mr-2 h-4 w-4" />{savingProject ? 'Saving...' : 'Save changes'}</Button>
                        <Button onClick={deleteProject} disabled={deletingProject} variant="destructive"><Trash2 className="mr-2 h-4 w-4" />{deletingProject ? 'Deleting...' : 'Delete project'}</Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
            )}

            {activeTab === 'users' && (
            <div className="grid h-full min-h-0 gap-6 overflow-x-hidden overflow-y-auto pr-1 xl:grid-cols-[0.85fr_1.15fr]">
              <Card className="border-blue-100 bg-white text-slate-900 min-w-0">
                <CardHeader>
                  <CardTitle className="text-slate-900">People</CardTitle>
                  <Input
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    placeholder="Search user by id, name, email, type, status"
                    className="mt-3 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400"
                  />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-2xl border border-blue-100 bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-700">Loaded users</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{userCount}</p>
                  </div>
                  {filteredUsers.map((adminUser) => (
                    <button key={adminUser.id} onClick={() => selectUser(adminUser)} className={`w-full rounded-2xl border p-4 text-left transition duration-200 overflow-hidden ${selectedUser?.id === adminUser.id ? 'border-blue-400 bg-blue-50' : 'border-blue-100 bg-white hover:bg-slate-50'}`}>
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{adminUser.name}</p>
                          <p className="text-xs text-slate-500 truncate">{adminUser.email}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <Badge className={statusTone(adminUser.verification_status)}>{adminUser.verification_status}</Badge>
                          <span className="text-xs text-slate-500">{adminUser.user_type}</span>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-slate-500 truncate">{adminUser.city || 'Unknown city'}{adminUser.state_province ? `, ${adminUser.state_province}` : ''}</p>
                    </button>
                  ))}
                  {filteredUsers.length === 0 ? <p className="text-sm text-slate-500">No users match your search.</p> : null}
                </CardContent>
              </Card>

              <Card className="border-blue-100 bg-white text-slate-900 min-w-0">
                <CardHeader>
                  <CardTitle className="text-slate-900">People editor</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!selectedUser ? (
                    <p className="text-sm text-slate-500">Select a user to edit it.</p>
                  ) : (
                    <>
                      <div className="rounded-2xl border border-blue-100 bg-slate-50 p-4 text-sm">
                        <p className="font-semibold text-slate-900">{selectedUser.name}</p>
                        <p className="text-slate-600">{selectedUser.email}</p>
                        <p className="mt-2 text-xs text-slate-500">ID #{selectedUser.id} • Joined {new Date(selectedUser.created_at || Date.now()).toLocaleString('en-IN')}</p>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Select value={userDraft.user_type} onValueChange={(value) => setUserDraft((prev) => ({ ...prev, user_type: value as any }))}>
                          <SelectTrigger className="border-blue-200 bg-white text-slate-900">
                            <SelectValue placeholder="User type" />
                          </SelectTrigger>
                          <SelectContent>
                            {userTypeOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={userDraft.verification_status} onValueChange={(value) => setUserDraft((prev) => ({ ...prev, verification_status: value as any }))}>
                          <SelectTrigger className="border-blue-200 bg-white text-slate-900">
                            <SelectValue placeholder="Verification status" />
                          </SelectTrigger>
                          <SelectContent>
                            {verificationStatusOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button onClick={saveUser} disabled={savingUser} className="bg-blue-600 hover:bg-blue-500"><PencilLine className="mr-2 h-4 w-4" />{savingUser ? 'Saving...' : 'Save changes'}</Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
            )}

            {activeTab === 'requests' && (
            <div className="grid h-full min-h-0 gap-6 overflow-x-hidden overflow-y-auto pr-1 xl:grid-cols-[0.85fr_1.15fr]">
              <Card className="border-blue-100 bg-white text-slate-900 min-w-0">
                <CardHeader>
                  <CardTitle className="text-slate-900">All requests</CardTitle>
                  <Input
                    value={requestQuery}
                    onChange={(e) => setRequestQuery(e.target.value)}
                    placeholder="Search request by id, title, NGO, status, category"
                    className="mt-3 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400"
                  />
                </CardHeader>
                <CardContent className="space-y-3">
                  {filteredRequests.map((requestItem) => (
                    <button key={requestItem.id} onClick={() => selectRequest(requestItem)} className={`w-full rounded-xl border p-4 text-left transition duration-200 ${selectedRequest?.id === requestItem.id ? 'border-blue-400 bg-blue-50' : 'border-blue-100 bg-white hover:bg-slate-50'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{requestItem.title}</p>
                          <p className="text-xs text-slate-500">{requestItem.requester?.name || 'Unknown NGO'}</p>
                        </div>
                        <Badge className={statusTone(requestItem.status)}>{requestItem.status || 'unknown'}</Badge>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-slate-600">{requestItem.description}</p>
                    </button>
                  ))}
                  {filteredRequests.length === 0 ? <p className="text-sm text-slate-500">No requests match your search.</p> : null}
                </CardContent>
              </Card>

              <Card className="border-blue-100 bg-white text-slate-900">
                <CardHeader>
                  <CardTitle className="text-slate-900">Request editor</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!selectedRequest ? (
                    <p className="text-sm text-slate-500">Select a request to edit it.</p>
                  ) : (
                    <>
                      <div className="rounded-lg border border-blue-100 bg-slate-50 p-3 text-xs text-slate-600">
                        <div className="flex flex-wrap gap-2">
                          <span>ID #{selectedRequest.id}</span>
                          <span>• Requester: {selectedRequest.requester?.name || 'Unknown'}</span>
                          <span>• Created: {new Date(selectedRequest.created_at || Date.now()).toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input value={requestDraft.title} onChange={(e) => setRequestDraft((prev) => ({ ...prev, title: e.target.value }))} placeholder="Title" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                        <Input value={requestDraft.category} onChange={(e) => setRequestDraft((prev) => ({ ...prev, category: e.target.value }))} placeholder="Project category" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                        <Input value={requestDraft.request_type} onChange={(e) => setRequestDraft((prev) => ({ ...prev, request_type: e.target.value }))} placeholder="Request type" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                        <Select value={requestDraft.status} onValueChange={(value) => setRequestDraft((prev) => ({ ...prev, status: value }))}>
                          <SelectTrigger className="border-blue-200 bg-white text-slate-900">
                            <SelectValue placeholder="Request status" />
                          </SelectTrigger>
                          <SelectContent>
                            {requestStatusOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input value={requestDraft.location} onChange={(e) => setRequestDraft((prev) => ({ ...prev, location: e.target.value }))} placeholder="Location" className="md:col-span-2 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                        <Input value={requestDraft.timeline} onChange={(e) => setRequestDraft((prev) => ({ ...prev, timeline: e.target.value }))} placeholder="Timeline" className="md:col-span-2 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                        <Input value={requestDraft.estimated_budget} onChange={(e) => setRequestDraft((prev) => ({ ...prev, estimated_budget: e.target.value }))} placeholder="Estimated budget" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                        <Input value={requestDraft.beneficiary_count} onChange={(e) => setRequestDraft((prev) => ({ ...prev, beneficiary_count: e.target.value }))} placeholder="Beneficiary count" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                      </div>
                      <Textarea value={requestDraft.description} onChange={(e) => setRequestDraft((prev) => ({ ...prev, description: e.target.value }))} rows={4} placeholder="Description" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                      <Textarea value={requestDraft.impact_description} onChange={(e) => setRequestDraft((prev) => ({ ...prev, impact_description: e.target.value }))} rows={3} placeholder="Impact description" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                      <Input value={requestDraft.contact_info} onChange={(e) => setRequestDraft((prev) => ({ ...prev, contact_info: e.target.value }))} placeholder="Contact info" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                      <div className="flex flex-wrap gap-3">
                        <Button onClick={saveRequest} disabled={savingRequest} className="bg-cyan-600 hover:bg-cyan-500"><PencilLine className="mr-2 h-4 w-4" />{savingRequest ? 'Saving...' : 'Save changes'}</Button>
                        <Button onClick={deleteRequest} disabled={deletingRequest} variant="destructive"><Trash2 className="mr-2 h-4 w-4" />{deletingRequest ? 'Deleting...' : 'Delete request'}</Button>
                        <Button variant="outline" className="border-blue-200 bg-white text-blue-700 hover:bg-blue-50" onClick={() => router.push(`/service-requests/${selectedRequest.id}`)}>Open live page</Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
            )}

            {activeTab === 'posts' && (
            <div className="grid h-full min-h-0 gap-6 overflow-x-hidden overflow-y-auto pr-1 xl:grid-cols-[0.85fr_1.15fr]">
              <Card className="border-blue-100 bg-white text-slate-900 min-w-0">
                <CardHeader>
                  <CardTitle className="text-slate-900">All posts</CardTitle>
                  <Input
                    value={postQuery}
                    onChange={(e) => setPostQuery(e.target.value)}
                    placeholder="Search post by id, author, text, category, visibility"
                    className="mt-3 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400"
                  />
                </CardHeader>
                <CardContent className="space-y-3">
                  {filteredPosts.map((post) => (
                    <button key={post.id} onClick={() => selectPost(post)} className={`w-full rounded-xl border p-4 text-left transition duration-200 ${selectedPost?.id === post.id ? 'border-blue-400 bg-blue-50' : 'border-blue-100 bg-white hover:bg-slate-50'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{post.author?.name || 'Unknown author'}</p>
                          <p className="text-xs text-slate-500">{new Date(post.created_at || post.published_at || Date.now()).toLocaleString('en-IN')}</p>
                        </div>
                        <Badge className={statusTone(post.visibility)}>{post.visibility || 'public'}</Badge>
                      </div>
                      <p className="mt-2 line-clamp-3 text-sm text-slate-600">{post.content}</p>
                    </button>
                  ))}
                  {filteredPosts.length === 0 ? <p className="text-sm text-slate-500">No posts match your search.</p> : null}
                </CardContent>
              </Card>

              <Card className="border-blue-100 bg-white text-slate-900">
                <CardHeader>
                  <CardTitle className="text-slate-900">Post editor</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!selectedPost ? (
                    <p className="text-sm text-slate-500">Select a post to edit it.</p>
                  ) : (
                    <>
                      <div className="rounded-lg border border-blue-100 bg-slate-50 p-3 text-xs text-slate-600">
                        <div className="flex flex-wrap gap-2">
                          <span>ID #{selectedPost.id}</span>
                          <span>• Author: {selectedPost.author?.name || 'Unknown'}</span>
                          <span>• Created: {new Date(selectedPost.created_at || selectedPost.published_at || Date.now()).toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input value={postDraft.category} onChange={(e) => setPostDraft((prev) => ({ ...prev, category: e.target.value }))} placeholder="Category" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                        <Select value={postDraft.visibility} onValueChange={(value) => setPostDraft((prev) => ({ ...prev, visibility: value }))}>
                          <SelectTrigger className="border-blue-200 bg-white text-slate-900">
                            <SelectValue placeholder="Visibility" />
                          </SelectTrigger>
                          <SelectContent>
                            {postVisibilityOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input value={postDraft.location} onChange={(e) => setPostDraft((prev) => ({ ...prev, location: e.target.value }))} placeholder="Location" className="md:col-span-2 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                        <Input value={postDraft.tags} onChange={(e) => setPostDraft((prev) => ({ ...prev, tags: e.target.value }))} placeholder="Tags, comma separated" className="md:col-span-2 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                      </div>
                      <Textarea value={postDraft.content} onChange={(e) => setPostDraft((prev) => ({ ...prev, content: e.target.value }))} rows={8} placeholder="Post content" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                      <div className="flex flex-wrap gap-3">
                        <Button onClick={savePost} disabled={savingPost} className="bg-cyan-600 hover:bg-cyan-500"><PencilLine className="mr-2 h-4 w-4" />{savingPost ? 'Saving...' : 'Save changes'}</Button>
                        <Button onClick={deletePost} disabled={deletingPost} variant="destructive"><Trash2 className="mr-2 h-4 w-4" />{deletingPost ? 'Deleting...' : 'Delete post'}</Button>
                        <Button variant="outline" className="border-blue-200 bg-white text-blue-700 hover:bg-blue-50" onClick={() => router.push(`/posts/${selectedPost.id}`)}>Open live page</Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
            )}

            {activeTab === 'support' && (
            <div className="grid h-full min-h-0 gap-6 overflow-x-hidden overflow-y-auto pr-1 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="min-w-0">
                <Card className="border-blue-100 bg-white">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-900"><Search className="h-4 w-4" /> Search</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Input
                      value={supportQuery}
                      onChange={(e) => setSupportQuery(e.target.value)}
                      placeholder="Search title, description, ticket ID"
                      className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400"
                    />
                    <div className="grid grid-cols-4 gap-2">
                      <button onClick={() => setSupportStatusFilter('open')} className={`rounded-md border px-2 py-1 text-sm ${supportStatusFilter === 'open' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-blue-100 bg-white'}`}>Open</button>
                      <button onClick={() => setSupportStatusFilter('in_progress')} className={`rounded-md border px-2 py-1 text-sm ${supportStatusFilter === 'in_progress' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-blue-100 bg-white'}`}>In Progress</button>
                      <button onClick={() => setSupportStatusFilter('resolved')} className={`rounded-md border px-2 py-1 text-sm ${supportStatusFilter === 'resolved' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-blue-100 bg-white'}`}>Resolved</button>
                      <button onClick={() => setSupportStatusFilter('closed')} className={`rounded-md border px-2 py-1 text-sm ${supportStatusFilter === 'closed' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-blue-100 bg-white'}`}>Closed</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" className="border-blue-200 bg-white text-blue-700 hover:bg-blue-50" onClick={() => setSupportStatusFilter('all')}>Show all</Button>
                      <Button className="bg-blue-600 hover:bg-blue-500" onClick={() => fetchTickets(supportStatusFilter === 'all' ? undefined : supportStatusFilter, supportQuery.trim() || undefined)}>Refresh from server</Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="mt-4 space-y-3">
                  {supportLoading ? (
                    <Card>
                      <CardContent className="py-10 text-center text-gray-500">Loading tickets...</CardContent>
                    </Card>
                  ) : visibleTickets.length === 0 ? (
                    <Card>
                      <CardContent className="py-10 text-center text-gray-500">No tickets found for this filter.</CardContent>
                    </Card>
                  ) : (
                    visibleTickets.map((ticket) => (
                      <Card key={ticket.ticket_id} className="cursor-pointer border-blue-100 bg-white transition-all hover:border-blue-300" onClick={() => selectTicket(ticket)}>
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-gray-900">{ticket.title}</p>
                              <p className="text-xs text-gray-500">{ticket.ticket_id} • {ticket.user_name || ticket.user?.name || 'Unknown user'}</p>
                            </div>
                            <Badge className={`capitalize ${statusTone(ticket.status)}`}>{ticket.status}</Badge>
                          </div>
                          <p className="line-clamp-2 text-sm text-gray-600">{ticket.description}</p>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </div>

              <div className="min-w-0">
                <Card className="sticky top-6 border-blue-100 bg-white">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-900"><MessageSquare className="h-5 w-5 text-blue-600" /> Ticket Details</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6">
                    {!selectedTicketDetail ? (
                      <div className="rounded-md border bg-white p-4 text-sm text-slate-600">Select a ticket to review the issue, proof, and resolution controls.</div>
                    ) : (
                      <div className="space-y-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm text-slate-500">Ticket ID</p>
                            <p className="text-lg font-semibold">{selectedTicketDetail.ticket_id}</p>
                          </div>
                          <Badge className={`capitalize ${statusTone(selectedTicketDetail.status)}`}>{selectedTicketDetail.status}</Badge>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 text-sm">
                          <div>
                            <p className="text-slate-500">Raised By</p>
                            <p className="font-medium">{selectedTicketDetail.user_name || selectedTicketDetail.user?.name || 'Unknown'}</p>
                            <p className="text-slate-500">{selectedTicketDetail.user_email || selectedTicketDetail.user?.email || 'No email'}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">User Type</p>
                            <p className="font-medium capitalize">{selectedTicketDetail.user_type || selectedTicketDetail.user?.user_type || 'Unknown'}</p>
                            <p className="text-slate-500">Created {new Date(selectedTicketDetail.created_at).toLocaleString('en-IN', { timeZone: 'UTC' })}</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-sm font-medium text-slate-500">Title</p>
                          <p className="rounded-md border bg-white p-3 text-sm">{selectedTicketDetail.title}</p>
                        </div>

                        <div className="space-y-2">
                          <p className="text-sm font-medium text-slate-500">Description</p>
                          <p className="whitespace-pre-wrap rounded-md border bg-white p-3 text-sm">{selectedTicketDetail.description}</p>
                        </div>

                        {selectedTicketDetail.proof_url ? (
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-slate-500">Proof</p>
                            <a href={selectedTicketDetail.proof_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-blue-700 hover:bg-blue-50">Open attached proof</a>
                          </div>
                        ) : null}

                        <div className="space-y-2">
                          <p className="text-sm font-medium text-slate-500">Conversation Thread</p>
                          {detailLoading ? (
                            <p className="text-sm text-slate-500">Loading conversation...</p>
                          ) : messages.length === 0 ? (
                            <p className="text-sm text-slate-500">No messages yet.</p>
                          ) : (
                            <div className="space-y-3 rounded-lg border bg-slate-50 p-4">
                              {messages.map((message) => (
                                <div key={message.id} className={`rounded-lg border p-3 text-sm ${message.sender_type === 'admin' ? 'bg-blue-50 border-blue-200' : 'bg-white'}`}>
                                  <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                                    <span className="font-medium capitalize text-slate-700">{message.sender_type}</span>
                                    <span>{new Date(message.created_at).toLocaleString('en-IN', { timeZone: 'UTC' })}</span>
                                  </div>
                                  <p className="whitespace-pre-wrap text-slate-800">{message.content}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <p className="text-sm font-medium text-slate-500">Admin Notes</p>
                          <Textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} rows={4} placeholder="Internal resolution notes" />
                        </div>

                        <div className="space-y-2 rounded-lg border bg-white p-4">
                          <p className="text-sm font-semibold text-slate-900">Reply to User</p>
                          <Textarea value={replyMessage} onChange={(e) => setReplyMessage(e.target.value)} rows={4} placeholder="Write the message the user should receive" />
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Button onClick={sendReply} disabled={replying} className="sm:w-auto">{replying ? 'Sending...' : 'Send Reply'}</Button>
                            <Button variant="outline" onClick={() => setStatusUpdate('in_progress')} className="sm:w-auto">Mark In Progress</Button>
                            <Button variant="outline" onClick={() => setStatusUpdate('resolved')} className="sm:w-auto">Mark Resolved</Button>
                          </div>
                        </div>

                        <div className="space-y-3 rounded-lg border bg-amber-50 p-4">
                          <p className="text-sm font-semibold text-amber-900">Refund Initiation</p>
                          <p className="text-xs text-amber-800">Admin can initiate refunds directly from here. Users cannot initiate refunds from the platform.</p>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2 md:col-span-2">
                              <label className="text-sm font-medium text-gray-700">Service Request ID</label>
                              <Input value={refundRequestId} onChange={(e) => setRefundRequestId(e.target.value)} placeholder="Enter request ID linked to the payment" />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-gray-700">Razorpay Payment ID</label>
                              <Input value={refundPaymentId} onChange={(e) => setRefundPaymentId(e.target.value)} placeholder="pay_xxxxx" />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-gray-700">Refund Amount (optional)</label>
                              <Input value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder="Leave blank for full refund" />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                              <label className="text-sm font-medium text-gray-700">Refund Reason</label>
                              <Input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="admin_support_refund" />
                            </div>
                          </div>
                          <Button variant="destructive" onClick={initiateRefund} disabled={refunding}>{refunding ? 'Initiating refund...' : 'Initiate Refund'}</Button>
                        </div>

                        <div className="space-y-3 rounded-lg border bg-blue-50 p-4">
                          <p className="text-sm font-semibold text-blue-900">Delhivery Tracking Lookup</p>
                          <p className="text-xs text-blue-800">Use this to fetch live shipment status for donor-to-NGO deliveries.</p>
                          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                            <Input value={trackingLookupId} onChange={(e) => setTrackingLookupId(e.target.value)} placeholder="Enter Delhivery tracking ID" />
                            <Button onClick={lookupDeliveryTracking} disabled={trackingLookupLoading}>{trackingLookupLoading ? 'Checking...' : 'Track Shipment'}</Button>
                          </div>

                          {trackingSnapshot ? (
                            <div className="space-y-2 rounded-md border bg-white p-3 text-sm">
                              <p><span className="font-medium text-gray-600">Provider:</span> {trackingSnapshot.provider || 'delhivery'}</p>
                              <p><span className="font-medium text-gray-600">Tracking ID:</span> {trackingSnapshot.trackingId || 'N/A'}</p>
                              <p><span className="font-medium text-gray-600">Current Status:</span> {trackingSnapshot.currentStatus || 'N/A'}</p>
                              <p><span className="font-medium text-gray-600">Last Location:</span> {trackingSnapshot.lastLocation || 'N/A'}</p>
                              <p><span className="font-medium text-gray-600">Last Event:</span> {trackingSnapshot.lastEventAt ? new Date(trackingSnapshot.lastEventAt).toLocaleString('en-IN', { timeZone: 'UTC' }) : 'N/A'}</p>
                              {Array.isArray(trackingSnapshot.events) && trackingSnapshot.events.length > 0 ? (
                                <div className="mt-3 space-y-2">
                                  <p className="font-medium text-gray-700">Recent Events</p>
                                  <div className="max-h-48 space-y-2 overflow-auto pr-1">
                                    {trackingSnapshot.events.slice(0, 6).map((event: any, index: number) => (
                                      <div key={`${event.timestamp || 'event'}-${index}`} className="rounded border bg-slate-50 p-2 text-xs">
                                        <p className="font-medium text-slate-800">{event.status || 'Update'}</p>
                                        <p className="text-slate-600">{event.location || 'Unknown location'}</p>
                                        <p className="text-slate-500">{event.timestamp ? new Date(event.timestamp).toLocaleString('en-IN', { timeZone: 'UTC' }) : 'Unknown time'}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-gray-500">Update Status</p>
                            <select value={statusUpdate} onChange={(e) => setStatusUpdate(e.target.value as SupportTicketStatus)} className="h-10 w-full rounded-md border bg-white px-3 text-sm">
                              <option value="open">Open</option>
                              <option value="in_progress">In Progress</option>
                              <option value="resolved">Resolved</option>
                              <option value="closed">Closed</option>
                            </select>
                          </div>
                          <div className="flex items-end">
                            <Button onClick={updateSelectedTicket} disabled={saving} className="w-full">{saving ? 'Saving...' : 'Save Changes'}</Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
            )}

            {activeTab === 'government-admins' && (
            <GovernmentAdminManagement embedded />
            )}

            {activeTab === 'ca-credentials' && (
            <NavadrishtCAManagement />
            )}
            </CardContent>
            </Card>
          </div>
      </div>
    </div>
  );
}

