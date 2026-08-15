'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { DashboardQuickSidebar } from '@/components/dashboard-quick-sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast as sonnerToast } from 'sonner';
import { NavadrishtCAManagement } from '@/components/navadrishti-ca-management';
import { DocumentFileViewer } from '@/components/ca-verification-review';
import { AdminConsoleHeader, AdminPortalMain, AdminPortalShell } from './admin-layout-client';
import {
  AdminConsoleSkeleton,
  AdminDetailItems,
  AdminDetailSection,
  AdminListItemSkeleton,
  AdminMessagesSkeleton,
  AdminSplitViewSkeleton,
  AdminTicketDetailSkeleton,
  formatAdminDetailValue,
  safeParseRecordJson,
} from '@/components/evidence-verification/portal-ui';
import { cn } from '@/lib/utils';
import {
  getAccountLockUntil,
  getAdminModeration,
  isPermanentlyBannedAccount,
} from '@/lib/auth';
import {
  PencilLine,
  Trash2,
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
  phone?: string | null;
  user_type: 'individual' | 'ngo' | 'company' | 'admin';
  verification_status: 'unverified' | 'pending' | 'verified' | 'suspended';
  account_status?: string | null;
  locked_until?: string | null;
  city?: string | null;
  state_province?: string | null;
  profile_image?: string | null;
  profile_data?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  reverification_pending?: boolean;
};

type ReverificationSummary = {
  user_id: number;
  name: string;
  email: string;
  user_type: string;
  verification_status: string;
  submitted_at: string | null;
  reverification_status: string;
  current_documents: Record<string, string>;
  pending_documents: Record<string, string>;
  pending_compliance_documents: Record<string, string>;
};

type OverviewData = {
  summary: Record<string, number>;
  counts: Record<string, any>;
  recent: {
    service_requests: Array<any>;
    service_request_projects: Array<any>;
    posts: Array<any>;
    support_tickets: Array<any>;
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

const supportFilterButtonClass = (active: boolean) =>
  cn(
    'inline-flex h-10 w-full items-center justify-center rounded-md border px-3 text-sm font-medium',
    active
      ? 'border-udaan-blue bg-udaan-blue text-white'
      : 'border-slate-200 bg-white text-slate-700'
  );

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

function adminUserVerificationLabel(user: Pick<AdminUserItem, 'verification_status' | 'reverification_pending'>) {
  if (user.reverification_pending) return 'reverification pending';
  const status = String(user.verification_status || 'unverified').toLowerCase();
  if (status === 'verified') return 'verified';
  if (status === 'pending') return 'pending';
  return 'unverified';
}

function adminUserVerificationBadgeClass(label: string) {
  const normalized = label.toLowerCase();
  if (normalized === 'verified') {
    return 'pointer-events-none border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100';
  }
  if (normalized === 'pending' || normalized === 'reverification pending') {
    return 'pointer-events-none border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100';
  }
  return 'pointer-events-none border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100';
}

function adminUserModerationLabel(user: AdminUserItem) {
  if (isPermanentlyBannedAccount(user)) return 'banned';
  const until = getAccountLockUntil(user);
  if (until) return `suspended until ${until.toISOString().slice(0, 10)}`;
  if (String(user.account_status || '').toLowerCase() === 'suspended') return 'suspended';
  return null;
}

const emptyPostDraft = {
  content: '',
  category: '',
  visibility: '',
  location: '',
  tags: '',
};

const emptyCampaignDraft = {
  title: '',
  description: '',
  category: '',
  location: '',
  schedule_vii: '',
  status: '',
  budget_inr: '',
  start_date: '',
  end_date: '',
  volunteer_requirement: '',
  impact_metrics: '',
  milestones: '',
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

const campaignStatusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'closed', label: 'Closed' },
];

const postVisibilityOptions = [
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
  { value: 'connections', label: 'Connections' },
  { value: 'draft', label: 'Draft' },
];

const ADMIN_ACTIVE_TAB_KEY = 'admin_active_tab';

const ADMIN_TAB_VALUES = new Set([
  'overview',
  'offers',
  'projects',
  'users',
  'requests',
  'campaigns',
  'support',
  'refunds',
  'ca-credentials',
]);

function readAdminActiveTab(): string {
  if (typeof window === 'undefined') return 'overview';
  try {
    const stored = sessionStorage.getItem(ADMIN_ACTIVE_TAB_KEY);
    if (stored && ADMIN_TAB_VALUES.has(stored)) return stored;
  } catch {
    // ignore sessionStorage errors
  }
  return 'overview';
}

const adminActiveTabListeners = new Set<() => void>();

function subscribeAdminActiveTab(onStoreChange: () => void) {
  adminActiveTabListeners.add(onStoreChange);
  return () => {
    adminActiveTabListeners.delete(onStoreChange);
  };
}

function persistAdminActiveTab(tab: string) {
  try {
    sessionStorage.setItem(ADMIN_ACTIVE_TAB_KEY, tab);
    adminActiveTabListeners.forEach((listener) => listener());
  } catch {
    // ignore sessionStorage errors
  }
}

function OfferFullDetails({ offer }: { offer: any }) {
  if (!offer) return null;
  return (
    <AdminDetailSection title="Full offer record">
      <AdminDetailItems
        items={[
          { label: 'Offer ID', value: formatAdminDetailValue(offer.id) },
          { label: 'Admin status', value: formatAdminDetailValue(offer.admin_status) },
          { label: 'Platform status', value: formatAdminDetailValue(offer.status) },
          { label: 'Category', value: formatAdminDetailValue(offer.category) },
          { label: 'Location', value: formatAdminDetailValue(offer.location) },
          { label: 'Organization', value: formatAdminDetailValue(offer.organization?.name) },
          { label: 'Org email', value: formatAdminDetailValue(offer.organization?.email) },
          { label: 'Org ID', value: formatAdminDetailValue(offer.organization?.id || offer.creator_id) },
          { label: 'Submitted for review', value: formatAdminDetailValue(offer.submitted_for_review_at) },
          { label: 'Admin reviewed at', value: formatAdminDetailValue(offer.admin_reviewed_at) },
          { label: 'Admin comments', value: formatAdminDetailValue(offer.admin_comments) },
          { label: 'Created', value: formatAdminDetailValue(offer.created_at) },
          { label: 'Updated', value: formatAdminDetailValue(offer.updated_at) },
          { label: 'Description', value: formatAdminDetailValue(offer.description) },
        ]}
      />
    </AdminDetailSection>
  );
}

function RequestFullDetails({ request }: { request: any }) {
  if (!request) return null;
  const requirements = safeParseRecordJson(request.requirements);
  const projectContext = safeParseRecordJson(request.project_context);
  const transactions = Array.isArray(requirements.financial_transactions) ? requirements.financial_transactions : [];

  return (
    <div className="space-y-4">
      <AdminDetailSection title="Request overview">
        <AdminDetailItems
          items={[
            { label: 'Request ID', value: formatAdminDetailValue(request.id) },
            { label: 'Title', value: formatAdminDetailValue(request.title) },
            { label: 'Status', value: formatAdminDetailValue(request.status) },
            { label: 'Category', value: formatAdminDetailValue(request.category) },
            { label: 'Request type', value: formatAdminDetailValue(request.request_type || requirements.request_type) },
            { label: 'Location', value: formatAdminDetailValue(request.location) },
            { label: 'Timeline', value: formatAdminDetailValue(request.timeline) },
            { label: 'Estimated budget', value: formatAdminDetailValue(request.estimated_budget) },
            { label: 'Beneficiary count', value: formatAdminDetailValue(request.beneficiary_count) },
            { label: 'Impact description', value: formatAdminDetailValue(request.impact_description) },
            { label: 'Contact info', value: formatAdminDetailValue(request.contact_info) },
            { label: 'Requester', value: formatAdminDetailValue(request.requester?.name) },
            { label: 'Requester email', value: formatAdminDetailValue(request.requester?.email) },
            { label: 'Project', value: formatAdminDetailValue(request.project?.title) },
            { label: 'Project status', value: formatAdminDetailValue(request.project?.status) },
            { label: 'Created', value: formatAdminDetailValue(request.created_at) },
            { label: 'Updated', value: formatAdminDetailValue(request.updated_at) },
          ]}
        />
      </AdminDetailSection>

      {(requirements.funds_raised_inr || requirements.funding_target_inr || transactions.length > 0) ? (
        <AdminDetailSection title="Financial details">
          <AdminDetailItems
            items={[
              { label: 'Funds raised (INR)', value: formatAdminDetailValue(requirements.funds_raised_inr) },
              { label: 'Funding target (INR)', value: formatAdminDetailValue(requirements.funding_target_inr ?? requirements.estimated_budget) },
              { label: 'Funds remaining (INR)', value: formatAdminDetailValue(requirements.funds_remaining_inr) },
              { label: 'Payment transactions', value: transactions.length ? `${transactions.length} recorded` : '—' },
            ]}
          />
          {transactions.length > 0 ? (
            <pre className="max-h-48 overflow-auto rounded-md border bg-white p-3 text-xs text-slate-700">
              {JSON.stringify(transactions, null, 2)}
            </pre>
          ) : null}
        </AdminDetailSection>
      ) : null}

      {Object.keys(projectContext).length > 0 ? (
        <AdminDetailSection title="Project context">
          <pre className="max-h-40 overflow-auto rounded-md border bg-white p-3 text-xs text-slate-700">
            {JSON.stringify(projectContext, null, 2)}
          </pre>
        </AdminDetailSection>
      ) : null}
    </div>
  );
}

function ProjectFullDetails({ project }: { project: any }) {
  if (!project) return null;
  return (
    <AdminDetailSection title="Full project record">
      <AdminDetailItems
        items={[
          { label: 'Project ID', value: formatAdminDetailValue(project.id) },
          { label: 'Title', value: formatAdminDetailValue(project.title) },
          { label: 'Status', value: formatAdminDetailValue(project.status) },
          { label: 'Location', value: formatAdminDetailValue(project.location) },
          { label: 'Exact address', value: formatAdminDetailValue(project.exact_address) },
          { label: 'Timeline', value: formatAdminDetailValue(project.timeline) },
          { label: 'NGO', value: formatAdminDetailValue(project.ngo?.name) },
          { label: 'NGO email', value: formatAdminDetailValue(project.ngo?.email) },
          { label: 'NGO ID', value: formatAdminDetailValue(project.ngo?.id || project.ngo_id) },
          { label: 'Created', value: formatAdminDetailValue(project.created_at) },
          { label: 'Updated', value: formatAdminDetailValue(project.updated_at) },
          { label: 'Description', value: formatAdminDetailValue(project.description) },
        ]}
      />
    </AdminDetailSection>
  );
}

function CampaignFullDetails({ campaign }: { campaign: any }) {
  if (!campaign) return null;
  const impactMetrics = campaign.impact_metrics && typeof campaign.impact_metrics === 'object' ? campaign.impact_metrics : safeParseRecordJson(campaign.impact_metrics);
  return (
    <div className="space-y-4">
      <AdminDetailSection title="Full campaign record">
        <AdminDetailItems
          items={[
            { label: 'Campaign ID', value: formatAdminDetailValue(campaign.id) },
            { label: 'Title', value: formatAdminDetailValue(campaign.title) },
            { label: 'Status', value: formatAdminDetailValue(campaign.status) },
            { label: 'Category', value: formatAdminDetailValue(campaign.category || campaign.cause) },
            { label: 'Schedule VII', value: formatAdminDetailValue(campaign.schedule_vii) },
            { label: 'Location', value: formatAdminDetailValue(campaign.location || campaign.region) },
            { label: 'Budget (INR)', value: formatAdminDetailValue(campaign.budget_inr) },
            { label: 'Start date', value: formatAdminDetailValue(campaign.start_date) },
            { label: 'End date', value: formatAdminDetailValue(campaign.end_date) },
            { label: 'Company', value: formatAdminDetailValue(campaign.company?.name) },
            { label: 'Company email', value: formatAdminDetailValue(campaign.company?.email) },
            { label: 'Company ID', value: formatAdminDetailValue(campaign.company_id) },
            { label: 'Created', value: formatAdminDetailValue(campaign.created_at) },
            { label: 'Updated', value: formatAdminDetailValue(campaign.updated_at) },
            { label: 'Description', value: formatAdminDetailValue(campaign.description) },
          ]}
        />
      </AdminDetailSection>
      {Object.keys(impactMetrics).length > 0 ? (
        <AdminDetailSection title="Impact metrics">
          <pre className="max-h-40 overflow-auto rounded-md border bg-white p-3 text-xs text-slate-700">
            {JSON.stringify(impactMetrics, null, 2)}
          </pre>
        </AdminDetailSection>
      ) : null}
      {Array.isArray(campaign.milestones) && campaign.milestones.length > 0 ? (
        <AdminDetailSection title="Milestones">
          <pre className="max-h-40 overflow-auto rounded-md border bg-white p-3 text-xs text-slate-700">
            {JSON.stringify(campaign.milestones, null, 2)}
          </pre>
        </AdminDetailSection>
      ) : null}
    </div>
  );
}

function PostFullDetails({ post }: { post: any }) {
  if (!post) return null;
  return (
    <AdminDetailSection title="Full post record">
      <AdminDetailItems
        items={[
          { label: 'Post ID', value: formatAdminDetailValue(post.id) },
          { label: 'Author', value: formatAdminDetailValue(post.author?.name) },
          { label: 'Author email', value: formatAdminDetailValue(post.author?.email) },
          { label: 'Category', value: formatAdminDetailValue(post.category) },
          { label: 'Visibility', value: formatAdminDetailValue(post.visibility) },
          { label: 'Location', value: formatAdminDetailValue(post.location) },
          { label: 'Tags', value: formatAdminDetailValue(post.tags) },
          { label: 'Reactions', value: formatAdminDetailValue(post.reaction_count) },
          { label: 'Comments', value: formatAdminDetailValue(post.comment_count) },
          { label: 'Shares', value: formatAdminDetailValue(post.share_count) },
          { label: 'Views', value: formatAdminDetailValue(post.view_count) },
          { label: 'Published', value: formatAdminDetailValue(post.published_at) },
          { label: 'Created', value: formatAdminDetailValue(post.created_at) },
          { label: 'Updated', value: formatAdminDetailValue(post.updated_at) },
          { label: 'Content', value: formatAdminDetailValue(post.content) },
        ]}
      />
    </AdminDetailSection>
  );
}

function UserFullDetails({ user }: { user: any }) {
  if (!user) return null;
  return (
    <AdminDetailSection title="Full user record">
      <AdminDetailItems
        items={[
          { label: 'User ID', value: formatAdminDetailValue(user.id) },
          { label: 'Name', value: formatAdminDetailValue(user.name) },
          { label: 'Email', value: formatAdminDetailValue(user.email) },
          { label: 'User type', value: formatAdminDetailValue(user.user_type) },
          { label: 'Verification', value: formatAdminDetailValue(user.verification_status) },
          { label: 'City', value: formatAdminDetailValue(user.city) },
          { label: 'State', value: formatAdminDetailValue(user.state_province) },
          { label: 'Country', value: formatAdminDetailValue(user.country) },
          { label: 'Phone', value: formatAdminDetailValue(user.phone) },
          { label: 'Email verified', value: formatAdminDetailValue(user.email_verified) },
          { label: 'Phone verified', value: formatAdminDetailValue(user.phone_verified) },
          { label: 'Joined', value: formatAdminDetailValue(user.created_at) },
          { label: 'Updated', value: formatAdminDetailValue(user.updated_at) },
        ]}
      />
    </AdminDetailSection>
  );
}

const REVERIFICATION_DOCUMENT_LABELS: Record<string, string> = {
  individualAadhaar: 'Aadhaar Card',
  individualPanCard: 'PAN Card',
  bankStatement: 'Bank Statement (Last 6 months)',
  ngoRegistrationCertificate: 'Registration Certificate',
  ngoPanCard: 'PAN Card of NGO',
  ngoAddressProof: 'Address Proof',
  ngoTrustOrMoaAoa: 'Trust Deed / MOA / AOA',
  ngoFcraPhoto: 'FCRA Registration Document',
  ngoTwelveACertificate: '12A Certificate',
  ngoEightyGCertificate: '80G Certificate',
  ngoCsr1Certificate: 'CSR-1 Certificate',
  companyIncorporationCertificate: 'Certificate of Incorporation',
  companyPanCard: 'PAN Card of Company',
  companyGstCertificate: 'GST Certificate',
  companyAddressProof: 'Company Address Proof',
  twelve_a: '12A Certificate',
  eighty_g: '80G Certificate',
  csr1: 'CSR-1 Certificate',
};

function ReverificationDocumentList({
  title,
  documents,
}: {
  title: string;
  documents: Record<string, string>;
}) {
  const entries = Object.entries(documents || {}).filter(([, url]) => typeof url === 'string' && url.trim());

  return (
    <AdminDetailSection title={title}>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">No documents in this set.</p>
      ) : (
        <div className="space-y-2">
          {entries.map(([key, url]) => (
            <div key={key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-100 bg-slate-50 px-3 py-2">
              <span className="text-sm font-medium text-slate-800">
                {REVERIFICATION_DOCUMENT_LABELS[key] || key}
              </span>
              <a href={url} target="_blank" rel="noreferrer" className="text-sm text-blue-700 hover:underline">
                Open document
              </a>
            </div>
          ))}
        </div>
      )}
    </AdminDetailSection>
  );
}

function ReverificationReviewPanel({
  summary,
  rejectReason,
  onRejectReasonChange,
  onApprove,
  onReject,
  processing,
}: {
  summary: ReverificationSummary;
  rejectReason: string;
  onRejectReasonChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
  processing: boolean;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-amber-900">Pending reverification</p>
          <p className="mt-1 text-xs text-amber-800">
            Submitted {summary.submitted_at ? new Date(summary.submitted_at).toLocaleString('en-IN') : 'recently'}.
            User stays verified until you approve or reject.
          </p>
        </div>
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Review required</Badge>
      </div>

      <ReverificationDocumentList title="Current documents on file" documents={summary.current_documents} />
      <ReverificationDocumentList title="Updated documents submitted" documents={summary.pending_documents} />
      {Object.keys(summary.pending_compliance_documents || {}).length > 0 ? (
        <ReverificationDocumentList title="Updated compliance certificates" documents={summary.pending_compliance_documents} />
      ) : null}

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">Rejection reason (optional)</label>
        <Textarea
          value={rejectReason}
          onChange={(e) => onRejectReasonChange(e.target.value)}
          rows={3}
          placeholder="Explain why the updated documents were rejected"
          className="border-amber-200 bg-white text-slate-900 placeholder:text-slate-400"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          onClick={onApprove}
          disabled={processing}
          className="bg-emerald-600 hover:bg-emerald-500"
        >
          {processing ? 'Processing...' : 'Approve reverification'}
        </Button>
        <Button
          onClick={onReject}
          disabled={processing}
          variant="destructive"
        >
          {processing ? 'Processing...' : 'Reject reverification'}
        </Button>
      </div>
    </div>
  );
}

function supportStatusTone(status?: string | null) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'open') return 'border-udaan-blue/30 bg-udaan-blue/10 text-udaan-blue';
  if (normalized === 'in_progress') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (normalized === 'resolved') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (normalized === 'closed') return 'border-slate-200 bg-slate-100 text-slate-700';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

function SupportStatusTag({ status }: { status?: string | null }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize',
        supportStatusTone(status)
      )}
    >
      {String(status || 'unknown').replace('_', ' ')}
    </span>
  );
}

function TicketFullDetails({
  ticket,
  onViewProof,
}: {
  ticket: any;
  onViewProof?: (url: string) => void;
}) {
  if (!ticket) return null;
  return (
    <AdminDetailSection title="Full ticket record">
      <AdminDetailItems
        items={[
          { label: 'Ticket ID', value: formatAdminDetailValue(ticket.ticket_id) },
          { label: 'Title', value: formatAdminDetailValue(ticket.title) },
          { label: 'Status', value: formatAdminDetailValue(ticket.status) },
          { label: 'User', value: formatAdminDetailValue(ticket.user_name || ticket.user?.name) },
          { label: 'User email', value: formatAdminDetailValue(ticket.user_email || ticket.user?.email) },
          { label: 'User type', value: formatAdminDetailValue(ticket.user_type || ticket.user?.user_type) },
          {
            label: 'Proof',
            value: ticket.proof_url ? (
              <button
                type="button"
                onClick={() => onViewProof?.(ticket.proof_url)}
                className="text-udaan-blue"
              >
                Open proof
              </button>
            ) : (
              '—'
            ),
          },
          { label: 'Created', value: formatAdminDetailValue(ticket.created_at) },
          { label: 'Updated', value: formatAdminDetailValue(ticket.updated_at) },
          { label: 'Resolved', value: formatAdminDetailValue(ticket.resolved_at) },
          { label: 'Description', value: formatAdminDetailValue(ticket.description) },
        ]}
      />
    </AdminDetailSection>
  );
}

type AdminPaymentRow = {
  id: string;
  razorpay_payment_id: string;
  razorpay_order_id?: string | null;
  amount_inr?: number | string | null;
  currency?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  service_request_id?: number | null;
  service_request?: any;
  refunds?: any[];
  latest_refund_status?: string | null;
  refundable?: boolean;
  source?: string;
};

const filterButtonClass = (active: boolean) =>
  cn(
    'inline-flex h-10 w-full items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors',
    active
      ? 'border-udaan-blue bg-udaan-blue text-white'
      : 'border-slate-200 bg-white text-slate-700 hover:border-udaan-blue/40 hover:bg-udaan-blue/[0.04] hover:text-udaan-blue'
  );

const statusTone = (value?: string | null) => {
  const normalized = String(value || '').toLowerCase();
  if (['processed', 'paid', 'approved', 'verified'].includes(normalized)) return 'bg-emerald-100 text-emerald-800';
  if (['pending', 'in_progress', 'partially_refunded'].includes(normalized)) return 'bg-amber-100 text-amber-800';
  if (['failed', 'rejected', 'refunded'].includes(normalized)) return 'bg-red-100 text-red-800';
  return 'bg-slate-100 text-slate-700';
};

export function AdminRefundsPanel() {
  const [payments, setPayments] = useState<AdminPaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'refundable' | 'refunded'>('all');
  const [query, setQuery] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<AdminPaymentRow | null>(null);
  const [refundRequestId, setRefundRequestId] = useState('');
  const [refundPaymentId, setRefundPaymentId] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('admin_refund');
  const [refunding, setRefunding] = useState(false);

  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('filter', filter);
      if (query.trim()) params.set('q', query.trim());
      const response = await fetch(`/api/admin/payments?${params.toString()}`, { credentials: 'include' });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || 'Failed to load payments');
      setPayments(Array.isArray(data.payments) ? data.payments : []);
    } catch (error: any) {
      sonnerToast.error(error?.message || 'Failed to load payments');
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [filter, query]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  const visiblePayments = useMemo(() => payments, [payments]);

  const selectPayment = (payment: AdminPaymentRow) => {
    setSelectedPayment(payment);
    setRefundPaymentId(payment.razorpay_payment_id || '');
    setRefundRequestId(payment.service_request_id ? String(payment.service_request_id) : '');
    setRefundAmount(payment.amount_inr ? String(payment.amount_inr) : '');
    setRefundReason('admin_refund');
  };

  const discoverPayment = async (paymentId: string) => {
    if (!paymentId) return;
    try {
      const res = await fetch(`/api/admin/payments/discover?paymentId=${encodeURIComponent(paymentId)}`, { credentials: 'include' });
      const payload = await res.json();
      if (res.ok && payload?.success && payload.data) {
        const { service_request_id, amount_inr } = payload.data;
        if (service_request_id) setRefundRequestId(String(service_request_id));
        if (amount_inr) setRefundAmount(String(amount_inr));
      }
    } catch {
      // ignore
    }
  };

  const initiateRefund = async () => {
    if (!refundRequestId.trim() || !refundPaymentId.trim()) {
      sonnerToast.error('Service request ID and payment ID are required');
      return;
    }
    try {
      setRefunding(true);
      const response = await fetch('/api/admin/payments/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          service_request_id: refundRequestId,
          razorpay_payment_id: refundPaymentId,
          amount: refundAmount,
          reason: refundReason,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || 'Failed to initiate refund');
      sonnerToast.success(data?.data?.message || 'Refund initiated');
      await loadPayments();
    } catch (error: any) {
      sonnerToast.error(error?.message || 'Refund failed');
    } finally {
      setRefunding(false);
    }
  };

  if (loading && payments.length === 0) {
    return <AdminSplitViewSkeleton inboxTitleWidth="w-44" detailWithEditor={false} inboxMode="refunds" />;
  }

  return (
    <div className="grid min-h-0 gap-6 overflow-x-hidden xl:grid-cols-2 xl:items-stretch">
      <Card className="flex min-h-[36rem] flex-col border-blue-100 bg-white">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-slate-900">Payments &amp; Refunds</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4 pt-6">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search payment ID, request ID, title, payer"
            className="h-10 border-blue-200 bg-white"
          />
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => setFilter('all')} className={filterButtonClass(filter === 'all')}>All</button>
            <button type="button" onClick={() => setFilter('refundable')} className={filterButtonClass(filter === 'refundable')}>Refundable</button>
            <button type="button" onClick={() => setFilter('refunded')} className={filterButtonClass(filter === 'refunded')}>Refunded</button>
          </div>
          <Button type="button" className="h-10 w-full bg-udaan-blue text-white hover:bg-udaan-blue/90" onClick={loadPayments} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh payments'}
          </Button>

          <div className="flex min-h-[14rem] flex-1 flex-col border-t border-slate-100 pt-4">
            {loading ? (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-10 text-sm text-slate-500">
                Loading payments...
              </div>
            ) : visiblePayments.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-10 text-center text-sm text-slate-500">
                No payments found for this filter.
              </div>
            ) : (
              <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                {visiblePayments.map((payment) => (
                  <button
                    key={`${payment.id}-${payment.razorpay_payment_id}`}
                    type="button"
                    onClick={() => selectPayment(payment)}
                    className={cn(
                      'w-full rounded-lg border bg-white p-4 text-left transition-all hover:border-blue-300 hover:shadow-sm',
                      selectedPayment?.razorpay_payment_id === payment.razorpay_payment_id
                        ? 'border-blue-400 ring-1 ring-blue-200'
                        : 'border-blue-100'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{payment.razorpay_payment_id}</p>
                        <p className="text-xs text-slate-500">
                          Request #{payment.service_request_id || '—'} • {payment.service_request?.title || 'Unknown request'}
                        </p>
                      </div>
                      <Badge className={cn('shrink-0 capitalize', statusTone(payment.latest_refund_status || payment.payment_status))}>
                        {payment.latest_refund_status || payment.payment_status || 'unknown'}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      INR {formatAdminDetailValue(payment.amount_inr)} • {payment.service_request?.requester?.name || 'Unknown payer'}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="flex min-h-[36rem] flex-col border-blue-100 bg-white">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-slate-900">Refund controls</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4 pt-6">
          {!selectedPayment ? (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-sm text-slate-600">
              Select a payment to review full details and initiate a Razorpay refund. Only admins can issue refunds.
            </div>
          ) : (
            <div className="flex-1 space-y-5 overflow-y-auto pr-1">
              <AdminDetailSection title="Payment details">
                <AdminDetailItems
                  items={[
                    { label: 'Payment ID', value: formatAdminDetailValue(selectedPayment.razorpay_payment_id) },
                    { label: 'Order ID', value: formatAdminDetailValue(selectedPayment.razorpay_order_id) },
                    { label: 'Amount (INR)', value: formatAdminDetailValue(selectedPayment.amount_inr) },
                    { label: 'Payment status', value: formatAdminDetailValue(selectedPayment.payment_status) },
                    { label: 'Refund status', value: formatAdminDetailValue(selectedPayment.latest_refund_status) },
                    { label: 'Paid at', value: formatAdminDetailValue(selectedPayment.paid_at) },
                    { label: 'Source', value: formatAdminDetailValue(selectedPayment.source) },
                    { label: 'Service request', value: formatAdminDetailValue(selectedPayment.service_request?.title) },
                    { label: 'Requester', value: formatAdminDetailValue(selectedPayment.service_request?.requester?.name) },
                    { label: 'Request status', value: formatAdminDetailValue(selectedPayment.service_request?.status) },
                  ]}
                />
              </AdminDetailSection>

              {Array.isArray(selectedPayment.refunds) && selectedPayment.refunds.length > 0 ? (
                <AdminDetailSection title="Refund history">
                  <pre className="max-h-40 overflow-auto rounded-md border bg-white p-3 text-xs text-slate-700">
                    {JSON.stringify(selectedPayment.refunds, null, 2)}
                  </pre>
                </AdminDetailSection>
              ) : null}

              <AdminDetailSection title="Initiate Razorpay refund">
                <p className="text-xs text-amber-800">
                  Refunds apply to financial service requests only. Users cannot initiate refunds from the platform.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">Service Request ID</label>
                    <Input value={refundRequestId} onChange={(e) => setRefundRequestId(e.target.value)} placeholder="Request ID linked to payment" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Razorpay Payment ID</label>
                    <Input
                      value={refundPaymentId}
                      onChange={(e) => setRefundPaymentId(e.target.value)}
                      onBlur={(e) => discoverPayment(e.target.value)}
                      placeholder="pay_xxxxx"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Refund amount (optional)</label>
                    <Input value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder="Leave blank for full refund" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">Refund reason</label>
                    <Textarea value={refundReason} onChange={(e) => setRefundReason(e.target.value)} rows={3} placeholder="admin_refund" />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  className="h-10 w-full"
                  onClick={initiateRefund}
                  disabled={refunding || !selectedPayment.refundable}
                >
                  {refunding ? 'Initiating refund...' : selectedPayment.refundable ? 'Initiate Refund' : 'Already refunded'}
                </Button>
              </AdminDetailSection>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const activeTab = useSyncExternalStore(
    subscribeAdminActiveTab,
    readAdminActiveTab,
    () => 'overview',
  );

  const setActiveTab = useCallback((tab: string) => {
    if (!ADMIN_TAB_VALUES.has(tab)) return;
    persistAdminActiveTab(tab);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, []);
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
  const [selectedReverification, setSelectedReverification] = useState<ReverificationSummary | null>(null);
  const [reverificationRejectReason, setReverificationRejectReason] = useState('');
  const [processingReverification, setProcessingReverification] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserItem | null>(null);
  const [userDraft, setUserDraft] = useState(emptyUserDraft);
  const [savingUser, setSavingUser] = useState(false);
  const [suspendDays, setSuspendDays] = useState('7');
  const [moderatingUser, setModeratingUser] = useState(false);
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
  const [supportBucketFilter, setSupportBucketFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [selectedTicketDetail, setSelectedTicketDetail] = useState<SupportTicket | null>(null);
  const [viewingSupportProof, setViewingSupportProof] = useState<{ url: string; label: string } | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusUpdate, setStatusUpdate] = useState<SupportTicketStatus>('open');
  const [replyMessage, setReplyMessage] = useState('');
  const [replying, setReplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [trackingLookupId, setTrackingLookupId] = useState('');
  const [trackingLookupLoading, setTrackingLookupLoading] = useState(false);
  const [trackingSnapshot, setTrackingSnapshot] = useState<any | null>(null);
  const [selectedPost, setSelectedPost] = useState<any | null>(null);
  const [postDraft, setPostDraft] = useState(emptyPostDraft);
  const [savingPost, setSavingPost] = useState(false);
  const [deletingPost, setDeletingPost] = useState(false);
  const [adminCampaigns, setAdminCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null);
  const [campaignDraft, setCampaignDraft] = useState(emptyCampaignDraft);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [deletingCampaign, setDeletingCampaign] = useState(false);
  const [campaignQuery, setCampaignQuery] = useState('');

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
      const reverificationsResponse = await fetch('/api/admin/reverifications?limit=200', { credentials: 'include' });
      const reverificationsData = await reverificationsResponse.json();
      const reverificationItems: ReverificationSummary[] = reverificationsResponse.ok && reverificationsData?.success
        ? (Array.isArray(reverificationsData.reverifications) ? reverificationsData.reverifications : [])
        : [];
      const reverificationIds = new Set(reverificationItems.map((item) => item.user_id));

      if (usersResponse.ok && usersData?.success) {
        const nextUsers = (Array.isArray(usersData.users) ? usersData.users : []).map((item: AdminUserItem) => ({
          ...item,
          reverification_pending: reverificationIds.has(item.id),
        }));
        setAdminUsers(nextUsers);
      } else {
        setAdminUsers([]);
      }

      const [projectsResponse, requestsResponse, postsResponse, ticketsResponse, campaignsResponse] = await Promise.all([
        fetch('/api/admin/service-request-projects?limit=200', { credentials: 'include' }),
        fetch('/api/admin/service-requests?limit=200', { credentials: 'include' }),
        fetch('/api/admin/posts?limit=200', { credentials: 'include' }),
        fetch('/api/admin/support-tickets?limit=200', { credentials: 'include' }),
        fetch('/api/admin/campaigns?limit=200', { credentials: 'include' }),
      ]);

      const [projectsData, requestsData, postsData, ticketsData, campaignsData] = await Promise.all([
        projectsResponse.json(),
        requestsResponse.json(),
        postsResponse.json(),
        ticketsResponse.json(),
        campaignsResponse.json(),
      ]);

      setAdminProjects(projectsResponse.ok && projectsData?.success ? (Array.isArray(projectsData.projects) ? projectsData.projects : []) : []);
      setAdminRequests(requestsResponse.ok && requestsData?.success ? (Array.isArray(requestsData.requests) ? requestsData.requests : []) : []);
      setAdminPosts(postsResponse.ok && postsData?.success ? (Array.isArray(postsData.posts) ? postsData.posts : []) : []);
      setAdminTickets(ticketsResponse.ok && ticketsData?.success ? (Array.isArray(ticketsData.tickets) ? ticketsData.tickets : []) : []);
      setAdminCampaigns(campaignsResponse.ok && campaignsData?.success ? (Array.isArray(campaignsData.campaigns) ? campaignsData.campaigns : []) : []);
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
    } catch (err: any) {
      sonnerToast.error(err?.message || 'Failed to load ticket');
    } finally {
      setDetailLoading(false);
    }
  };

  const selectTicket = (ticket: SupportTicket) => {
    setSelectedTicketDetail(ticket);
    setViewingSupportProof(null);
    setReplyMessage('');
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
        body: JSON.stringify({ status: statusUpdate, reply_message: replyMessage }),
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

  const updateSelectedTicket = async () => {
    if (!selectedTicketDetail) return;
    try {
      setSaving(true);
      const response = await fetch(`/api/admin/support-tickets/${encodeURIComponent(selectedTicketDetail.ticket_id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: statusUpdate }),
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

  useEffect(() => {
    if (activeTab !== 'support') return;
    const delay = supportQuery.trim() ? 300 : 0;
    const timer = window.setTimeout(() => {
      fetchTickets(
        supportStatusFilter === 'all' ? undefined : supportStatusFilter,
        supportQuery.trim() || undefined
      );
    }, delay);
    return () => window.clearTimeout(timer);
  }, [activeTab, supportStatusFilter, supportQuery]);

  const handleLogout = async () => {
    const authCookieNames = ['token', 'user', 'ca-token', 'evidence-verification-token', 'navadrishti-ca-token', 'admin-token', 'govt-admin-token'];
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

  const selectRequest = async (requestItem: any) => {
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

    try {
      const response = await fetch(`/api/admin/service-requests/${requestItem.id}`, { credentials: 'include' });
      const data = await response.json();
      if (response.ok && data?.data) {
        const full = data.data;
        setSelectedRequest(full);
        setRequestDraft({
          title: full?.title || '',
          description: full?.description || '',
          category: full?.category || '',
          request_type: full?.request_type || '',
          location: full?.location || '',
          status: full?.status || '',
          timeline: full?.timeline || '',
          estimated_budget: full?.estimated_budget?.toString?.() || '',
          beneficiary_count: full?.beneficiary_count?.toString?.() || '',
          impact_description: full?.impact_description || '',
          contact_info: full?.contact_info || '',
        });
      }
    } catch {
      // keep list snapshot
    }
  };

  const selectProject = async (projectItem: any) => {
    setSelectedProject(projectItem);
    setProjectDraft({
      title: projectItem?.title || '',
      description: projectItem?.description || '',
      location: projectItem?.location || '',
      exact_address: projectItem?.exact_address || '',
      timeline: projectItem?.timeline || '',
      status: projectItem?.status || '',
    });

    try {
      const response = await fetch(`/api/admin/service-request-projects/${projectItem.id}`, { credentials: 'include' });
      const data = await response.json();
      if (response.ok && data?.data) {
        const full = data.data;
        setSelectedProject(full);
        setProjectDraft({
          title: full?.title || '',
          description: full?.description || '',
          location: full?.location || '',
          exact_address: full?.exact_address || '',
          timeline: full?.timeline || '',
          status: full?.status || '',
        });
      }
    } catch {
      // keep list snapshot
    }
  };

  const selectCampaign = (campaignItem: any) => {
    setSelectedCampaign(campaignItem);
    const impactMetrics = campaignItem?.impact_metrics && typeof campaignItem.impact_metrics === 'object'
      ? campaignItem.impact_metrics
      : {};
    setCampaignDraft({
      title: campaignItem?.title || '',
      description: campaignItem?.description || '',
      category: campaignItem?.category || campaignItem?.cause || '',
      location: campaignItem?.location || campaignItem?.region || '',
      schedule_vii: campaignItem?.schedule_vii || '',
      status: campaignItem?.status || 'draft',
      budget_inr: campaignItem?.budget_inr?.toString?.() || '',
      start_date: campaignItem?.start_date || '',
      end_date: campaignItem?.end_date || '',
      volunteer_requirement: String(impactMetrics?.volunteer_requirement || ''),
      impact_metrics: JSON.stringify(impactMetrics, null, 2),
      milestones: JSON.stringify(Array.isArray(campaignItem?.milestones) ? campaignItem.milestones : [], null, 2),
    });
  };

  const selectUser = async (userItem: AdminUserItem) => {
    setSelectedUser(userItem);
    setUserDraft({
      user_type: userItem.user_type || 'individual',
      verification_status: userItem.verification_status || 'unverified',
    });
    setReverificationRejectReason('');
    setSelectedReverification(null);

    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userItem.id)}/reverification`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (response.ok && data?.success && data?.reverification) {
        setSelectedReverification(data.reverification);
      }
    } catch {
      // keep list snapshot only
    }
  };

  const refreshReverificationState = async (userId: number) => {
    const [usersResponse, reverificationsResponse] = await Promise.all([
      fetch('/api/admin/users?limit=200', { credentials: 'include' }),
      fetch('/api/admin/reverifications?limit=200', { credentials: 'include' }),
    ]);

    const usersData = await usersResponse.json();
    const reverificationsData = await reverificationsResponse.json();
    const reverificationItems: ReverificationSummary[] = reverificationsResponse.ok && reverificationsData?.success
      ? (Array.isArray(reverificationsData.reverifications) ? reverificationsData.reverifications : [])
      : [];
    const reverificationIds = new Set(reverificationItems.map((item) => item.user_id));

    if (usersResponse.ok && usersData?.success) {
      const nextUsers = (Array.isArray(usersData.users) ? usersData.users : []).map((item: AdminUserItem) => ({
        ...item,
        reverification_pending: reverificationIds.has(item.id),
      }));
      setAdminUsers(nextUsers);
      setSelectedUser((current) => current?.id === userId
        ? nextUsers.find((item) => item.id === userId) || current
        : current);
    }

    setSelectedReverification(null);
    setReverificationRejectReason('');
  };

  const handleReverificationAction = async (action: 'approve' | 'reject') => {
    if (!selectedUser) return;

    try {
      setProcessingReverification(true);
      const response = await fetch(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/reverification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action,
          reason: action === 'reject' ? reverificationRejectReason : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to process reverification');
      }

      sonnerToast.success(data.message || (action === 'approve' ? 'Reverification approved' : 'Reverification rejected'));
      await refreshReverificationState(selectedUser.id);
    } catch (error: any) {
      sonnerToast.error(error?.message || 'Failed to process reverification');
    } finally {
      setProcessingReverification(false);
    }
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
      setSelectedUser({ ...data.data, reverification_pending: selectedUser.reverification_pending });
      setAdminUsers((current) =>
        current.map((item) =>
          item.id === data.data.id
            ? { ...data.data, reverification_pending: item.reverification_pending }
            : item
        )
      );
    } catch (error: any) {
      sonnerToast.error(error?.message || 'Failed to update user');
    } finally {
      setSavingUser(false);
    }
  };

  const moderateUser = async (action: 'suspend' | 'unsuspend' | 'ban' | 'unban' | 'delete') => {
    if (!selectedUser) return;

    if (action === 'delete') {
      const confirmed = window.confirm(
        `Delete ${selectedUser.name}? This cannot be undone. Related records may block deletion — use Ban instead if needed.`
      );
      if (!confirmed) return;
    }
    if (action === 'ban') {
      const confirmed = window.confirm(
        `Permanently ban ${selectedUser.name}? The same email and phone will be blocked from registering again.`
      );
      if (!confirmed) return;
    }

    try {
      setModeratingUser(true);
      if (action === 'delete') {
        const response = await fetch(`/api/admin/users/${encodeURIComponent(selectedUser.id)}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        const data = await response.json();
        if (!response.ok || !data?.success) {
          throw new Error(data?.error || 'Failed to delete user');
        }
        sonnerToast.success(data.message || 'Account deleted');
        setAdminUsers((current) => current.filter((item) => item.id !== selectedUser.id));
        setSelectedUser(null);
        return;
      }

      const response = await fetch(`/api/admin/users/${encodeURIComponent(selectedUser.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action,
          days: action === 'suspend' ? Number(suspendDays || 7) : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to update account status');
      }

      sonnerToast.success(data.message || 'Account updated');
      const nextUser = {
        ...data.data,
        reverification_pending: selectedUser.reverification_pending,
      } as AdminUserItem;
      setSelectedUser(nextUser);
      setAdminUsers((current) => current.map((item) => (item.id === nextUser.id ? nextUser : item)));
    } catch (error: any) {
      sonnerToast.error(error?.message || 'Failed to update account');
    } finally {
      setModeratingUser(false);
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

  const saveCampaign = async () => {
    if (!selectedCampaign) return;

    try {
      setSavingCampaign(true);
      const response = await fetch(`/api/admin/campaigns/${encodeURIComponent(selectedCampaign.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: campaignDraft.title,
          description: campaignDraft.description,
          category: campaignDraft.category,
          location: campaignDraft.location,
          schedule_vii: campaignDraft.schedule_vii,
          status: campaignDraft.status,
          budget_inr: campaignDraft.budget_inr,
          start_date: campaignDraft.start_date,
          end_date: campaignDraft.end_date,
          volunteer_requirement: campaignDraft.volunteer_requirement,
          impact_metrics: campaignDraft.impact_metrics,
          milestones: campaignDraft.milestones,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to update campaign');
      }

      sonnerToast.success('CSR campaign updated');
      setSelectedCampaign(data.data);
      setAdminCampaigns((current) => current.map((item) => (item.id === data.data.id ? data.data : item)));
    } catch (error: any) {
      sonnerToast.error(error?.message || 'Failed to update campaign');
    } finally {
      setSavingCampaign(false);
    }
  };

  const deleteCampaign = async () => {
    if (!selectedCampaign) return;
    if (!window.confirm(`Delete CSR campaign "${selectedCampaign.title || selectedCampaign.id}"? This cannot be undone.`)) return;

    try {
      setDeletingCampaign(true);
      const response = await fetch(`/api/admin/campaigns/${encodeURIComponent(selectedCampaign.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to delete campaign');
      }

      sonnerToast.success('CSR campaign deleted');
      setSelectedCampaign(null);
      await loadDashboard();
    } catch (error: any) {
      sonnerToast.error(error?.message || 'Failed to delete campaign');
    } finally {
      setDeletingCampaign(false);
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

  const filteredCampaigns = useMemo(() => {
    const query = campaignQuery.trim();
    if (!query) return adminCampaigns;
    return adminCampaigns.filter((item) => (
      textMatch(item.title, query)
      || textMatch(item.description, query)
      || textMatch(item.category, query)
      || textMatch(item.location, query)
      || textMatch(item.schedule_vii, query)
      || textMatch(item.status, query)
      || textMatch(item.company?.name, query)
      || textMatch(item.id, query)
    ));
  }, [adminCampaigns, campaignQuery]);

  const visibleTickets = useMemo(() => {
    const query = supportQuery.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const bucketPass =
        supportBucketFilter === 'all'
          ? true
          : supportBucketFilter === 'open'
            ? ['open', 'in_progress'].includes(ticket.status)
            : ['resolved', 'closed'].includes(ticket.status);
      if (!bucketPass) return false;

      const statusPass = supportStatusFilter === 'all' || ticket.status === supportStatusFilter;
      if (!statusPass) return false;
      if (!query) return true;
      return (
        String(ticket.title || '').toLowerCase().includes(query)
        || String(ticket.description || '').toLowerCase().includes(query)
        || String(ticket.ticket_id || '').toLowerCase().includes(query)
        || String(ticket.user_name || ticket.user?.name || '').toLowerCase().includes(query)
        || String(ticket.user_email || ticket.user?.email || '').toLowerCase().includes(query)
      );
    });
  }, [tickets, supportQuery, supportStatusFilter, supportBucketFilter]);

  if (loading && !overview) {
    return (
      <AdminPortalShell>
        <AdminConsoleHeader
          accountName={user?.name}
          onLogout={handleLogout}
          onRefresh={refreshDashboard}
        />

        <AdminPortalMain className="max-w-7xl">
          <AdminConsoleSkeleton activeTab={activeTab} />
        </AdminPortalMain>
      </AdminPortalShell>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <AdminPortalShell>
      <AdminConsoleHeader
        accountName={user?.name}
        onLogout={handleLogout}
        onRefresh={refreshDashboard}
      />

      <AdminPortalMain className="max-w-7xl">
        <div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-6 overflow-hidden lg:grid-cols-12">
          <DashboardQuickSidebar
            items={[
              { value: 'overview', label: 'Overview' },
              { value: 'offers', label: 'Offers' },
              { value: 'projects', label: 'Projects' },
              { value: 'users', label: 'People' },
              { value: 'requests', label: 'Requests' },
              { value: 'campaigns', label: 'CSR Campaigns' },
              { value: 'support', label: 'Support' },
              { value: 'refunds', label: 'Refunds' },
              { value: 'ca-credentials', label: 'CA Credentials' },
            ]}
            activeTab={activeTab}
            onSelect={setActiveTab}
            desktopClassName="lg:col-span-3"
            triggerLabel="Admin Menu"
          />

          <Card className="h-full min-h-0 overflow-hidden border-slate-200 bg-white text-slate-900 shadow-sm lg:col-span-9">
            <CardContent className="h-full min-h-0 overflow-y-auto pt-6 pr-4 [scrollbar-gutter:stable] lg:overflow-y-auto">
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
                      <OfferFullDetails offer={selectedOffer} />
                      <Textarea value={reviewComments} onChange={(e) => setReviewComments(e.target.value)} rows={5} placeholder="Write admin review notes" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                      <div className="flex flex-wrap gap-3">
                        <Button onClick={() => handleReview(selectedOffer.id, 'approve')} disabled={isReviewing} className="bg-emerald-600 hover:bg-emerald-500">Approve</Button>
                        <Button onClick={() => handleReview(selectedOffer.id, 'reject')} disabled={isReviewing} variant="destructive">Reject</Button>
                        <Button variant="outline" className="border-blue-200 bg-white text-blue-700 hover:bg-blue-50" onClick={() => router.push(`/service-offers/${selectedOffer.id}`)}>Open live page</Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
            </div>
            )}

            {activeTab === 'projects' && (
            <div className="grid h-full min-h-0 gap-6 overflow-x-hidden pr-1 xl:grid-cols-[0.85fr_1.15fr]">
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
                      <ProjectFullDetails project={selectedProject} />
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
                          {(() => {
                            const verificationLabel = adminUserVerificationLabel(adminUser);
                            return (
                              <Badge className={adminUserVerificationBadgeClass(verificationLabel)}>
                                {verificationLabel}
                              </Badge>
                            );
                          })()}
                          {adminUserModerationLabel(adminUser) ? (
                            <Badge className="pointer-events-none border-rose-200 bg-rose-100 text-rose-800 hover:bg-rose-100">
                              {adminUserModerationLabel(adminUser)}
                            </Badge>
                          ) : null}
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
                      {selectedReverification ? (
                        <ReverificationReviewPanel
                          summary={selectedReverification}
                          rejectReason={reverificationRejectReason}
                          onRejectReasonChange={setReverificationRejectReason}
                          onApprove={() => handleReverificationAction('approve')}
                          onReject={() => handleReverificationAction('reject')}
                          processing={processingReverification}
                        />
                      ) : null}
                      <UserFullDetails user={selectedUser} />
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
                        <Button onClick={saveUser} disabled={savingUser || moderatingUser} className="bg-blue-600 hover:bg-blue-500"><PencilLine className="mr-2 h-4 w-4" />{savingUser ? 'Saving...' : 'Save changes'}</Button>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Account moderation</p>
                          {adminUserModerationLabel(selectedUser) ? (
                            <p className="mt-2 text-xs font-medium text-rose-700">
                              Current status: {adminUserModerationLabel(selectedUser)}
                              {getAdminModeration(selectedUser.profile_data).reason
                                ? ` · ${getAdminModeration(selectedUser.profile_data).reason}`
                                : ''}
                            </p>
                          ) : (
                            <p className="mt-2 text-xs text-slate-600">No active suspension or ban.</p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="w-28">
                            <label className="mb-1 block text-xs text-slate-600">Suspend days</label>
                            <Input
                              type="number"
                              min={1}
                              max={90}
                              value={suspendDays}
                              onChange={(event) => setSuspendDays(event.target.value)}
                              className="border-blue-200 bg-white text-slate-900"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={moderatingUser}
                            className="border-amber-300 bg-white text-amber-800 hover:bg-amber-50"
                            onClick={() => moderateUser('suspend')}
                          >
                            Suspend
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={moderatingUser}
                            className="border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                            onClick={() => moderateUser('unsuspend')}
                          >
                            Clear suspension
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={moderatingUser}
                            className="border-rose-300 bg-white text-rose-700 hover:bg-rose-50"
                            onClick={() => moderateUser('ban')}
                          >
                            Permanently ban
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={moderatingUser}
                            className="border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                            onClick={() => moderateUser('unban')}
                          >
                            Clear ban
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            disabled={moderatingUser}
                            onClick={() => moderateUser('delete')}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete account
                          </Button>
                        </div>
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
                      <RequestFullDetails request={selectedRequest} />
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

            {activeTab === 'campaigns' && (
            <div className="grid h-full min-h-0 gap-6 overflow-x-hidden pr-1 xl:grid-cols-[0.85fr_1.15fr]">
              <Card className="min-w-0 border-blue-100 bg-white text-slate-900">
                <CardHeader>
                  <CardTitle className="text-slate-900">All CSR campaigns</CardTitle>
                  <Input
                    value={campaignQuery}
                    onChange={(e) => setCampaignQuery(e.target.value)}
                    placeholder="Search by title, company, category, location, status"
                    className="mt-3 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400"
                  />
                </CardHeader>
                <CardContent className="space-y-3">
                  {filteredCampaigns.map((campaignItem) => (
                    <button
                      key={campaignItem.id}
                      onClick={() => selectCampaign(campaignItem)}
                      className={`w-full rounded-xl border p-4 text-left transition duration-200 ${selectedCampaign?.id === campaignItem.id ? 'border-blue-400 bg-blue-50' : 'border-blue-100 bg-white hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{campaignItem.title || 'Untitled campaign'}</p>
                          <p className="text-xs text-slate-500">{campaignItem.company?.name || `Company #${campaignItem.company_id || '?'}`}</p>
                        </div>
                        <Badge className={statusTone(campaignItem.status)}>{campaignItem.status || 'draft'}</Badge>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-slate-600">{campaignItem.description || campaignItem.category || 'No description'}</p>
                    </button>
                  ))}
                  {filteredCampaigns.length === 0 ? <p className="text-sm text-slate-500">No CSR campaigns match your search.</p> : null}
                </CardContent>
              </Card>

              <Card className="border-blue-100 bg-white text-slate-900">
                <CardHeader>
                  <CardTitle className="text-slate-900">Campaign editor</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!selectedCampaign ? (
                    <p className="text-sm text-slate-500">Select a CSR campaign to edit or delete it.</p>
                  ) : (
                    <>
                      <CampaignFullDetails campaign={selectedCampaign} />
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input value={campaignDraft.title} onChange={(e) => setCampaignDraft((prev) => ({ ...prev, title: e.target.value }))} placeholder="Title" className="md:col-span-2 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                        <Input value={campaignDraft.category} onChange={(e) => setCampaignDraft((prev) => ({ ...prev, category: e.target.value }))} placeholder="Category" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                        <Input value={campaignDraft.schedule_vii} onChange={(e) => setCampaignDraft((prev) => ({ ...prev, schedule_vii: e.target.value }))} placeholder="Schedule VII" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                        <Select value={campaignDraft.status} onValueChange={(value) => setCampaignDraft((prev) => ({ ...prev, status: value }))}>
                          <SelectTrigger className="border-blue-200 bg-white text-slate-900">
                            <SelectValue placeholder="Campaign status" />
                          </SelectTrigger>
                          <SelectContent>
                            {campaignStatusOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input value={campaignDraft.budget_inr} onChange={(e) => setCampaignDraft((prev) => ({ ...prev, budget_inr: e.target.value }))} placeholder="Budget (INR)" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                        <Input value={campaignDraft.volunteer_requirement} onChange={(e) => setCampaignDraft((prev) => ({ ...prev, volunteer_requirement: e.target.value }))} placeholder="Volunteer requirement" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                        <Input value={campaignDraft.location} onChange={(e) => setCampaignDraft((prev) => ({ ...prev, location: e.target.value }))} placeholder="Location" className="md:col-span-2 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                        <Input value={campaignDraft.start_date} onChange={(e) => setCampaignDraft((prev) => ({ ...prev, start_date: e.target.value }))} placeholder="Start date (YYYY-MM-DD)" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                        <Input value={campaignDraft.end_date} onChange={(e) => setCampaignDraft((prev) => ({ ...prev, end_date: e.target.value }))} placeholder="End date (YYYY-MM-DD)" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                      </div>
                      <Textarea value={campaignDraft.description} onChange={(e) => setCampaignDraft((prev) => ({ ...prev, description: e.target.value }))} rows={4} placeholder="Description" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                      <Textarea value={campaignDraft.impact_metrics} onChange={(e) => setCampaignDraft((prev) => ({ ...prev, impact_metrics: e.target.value }))} rows={6} placeholder="Impact metrics (JSON)" className="font-mono text-xs border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                      <Textarea value={campaignDraft.milestones} onChange={(e) => setCampaignDraft((prev) => ({ ...prev, milestones: e.target.value }))} rows={6} placeholder="Milestones (JSON)" className="font-mono text-xs border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                      <div className="flex flex-wrap gap-3">
                        <Button onClick={saveCampaign} disabled={savingCampaign} className="bg-cyan-600 hover:bg-cyan-500"><PencilLine className="mr-2 h-4 w-4" />{savingCampaign ? 'Saving...' : 'Save changes'}</Button>
                        <Button onClick={deleteCampaign} disabled={deletingCampaign} variant="destructive"><Trash2 className="mr-2 h-4 w-4" />{deletingCampaign ? 'Deleting...' : 'Delete campaign'}</Button>
                        <Button variant="outline" className="border-blue-200 bg-white text-blue-700 hover:bg-blue-50" onClick={() => router.push(`/csr-campaigns/${selectedCampaign.id}`)}>Open live page</Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
            )}

            {activeTab === 'support' && (
            <div className="grid min-h-0 gap-6 overflow-x-hidden xl:grid-cols-2 xl:items-stretch">
              <Card className="flex min-h-[36rem] flex-col border-udaan-blue/15 bg-white">
                <CardHeader className="border-b border-slate-100 pb-4">
                  <CardTitle className="text-slate-900">
                    Ticket Inbox
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4 pt-6">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ticket bucket</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSupportBucketFilter('open');
                          setSupportStatusFilter('all');
                        }}
                        className={supportFilterButtonClass(supportBucketFilter === 'open')}
                      >
                        Open Tickets
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSupportBucketFilter('closed');
                          setSupportStatusFilter('all');
                        }}
                        className={supportFilterButtonClass(supportBucketFilter === 'closed')}
                      >
                        Closed Tickets
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <button
                        type="button"
                        onClick={() => {
                          setSupportStatusFilter('open');
                          setSupportBucketFilter('open');
                        }}
                        className={supportFilterButtonClass(supportStatusFilter === 'open')}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSupportStatusFilter('in_progress');
                          setSupportBucketFilter('open');
                        }}
                        className={supportFilterButtonClass(supportStatusFilter === 'in_progress')}
                      >
                        In Progress
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSupportStatusFilter('resolved');
                          setSupportBucketFilter('closed');
                        }}
                        className={supportFilterButtonClass(supportStatusFilter === 'resolved')}
                      >
                        Resolved
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSupportStatusFilter('closed');
                          setSupportBucketFilter('closed');
                        }}
                        className={supportFilterButtonClass(supportStatusFilter === 'closed')}
                      >
                        Closed
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-full border-slate-200 bg-white text-slate-700"
                      onClick={() => {
                        setSupportBucketFilter('all');
                        setSupportStatusFilter('all');
                      }}
                    >
                      Show all
                    </Button>
                    <Button
                      type="button"
                      className="h-10 w-full bg-udaan-blue text-white hover:bg-udaan-blue/90"
                      onClick={() => fetchTickets(supportStatusFilter === 'all' ? undefined : supportStatusFilter, supportQuery.trim() || undefined)}
                    >
                      Refresh
                    </Button>
                  </div>

                  <Input
                    value={supportQuery}
                    onChange={(e) => setSupportQuery(e.target.value)}
                    placeholder="Search title, description, ticket ID, user"
                    className="h-10 border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"
                  />

                  <div className="flex min-h-[14rem] flex-1 flex-col border-t border-slate-100 pt-4">
            {supportLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <AdminListItemSkeleton key={`support-skeleton-${index}`} />
                ))}
              </div>
            ) : visibleTickets.length === 0 ? (
                      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-10 text-center text-sm text-slate-500">
                        No tickets found for this filter.
                      </div>
                    ) : (
                      <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                        {visibleTickets.map((ticket) => (
                          <button
                            key={ticket.ticket_id}
                            type="button"
                            onClick={() => selectTicket(ticket)}
                            className={cn(
                              'w-full rounded-lg border border-slate-200 bg-white p-4 text-left outline-none focus-visible:outline-none',
                              selectedTicketDetail?.ticket_id === ticket.ticket_id
                                ? 'border-udaan-blue bg-udaan-blue/[0.04]'
                                : 'border-slate-200'
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-gray-900">{ticket.title}</p>
                                <p className="text-xs text-gray-500">
                                  {ticket.ticket_id} • {ticket.user_name || ticket.user?.name || 'Unknown user'}
                                </p>
                              </div>
                              <SupportStatusTag status={ticket.status} />
                            </div>
                            <p className="mt-2 line-clamp-2 text-sm text-gray-600">{ticket.description}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="flex min-h-[36rem] flex-col border-udaan-blue/15 bg-white">
                <CardHeader className="border-b border-slate-100 pb-4">
                  <CardTitle className="text-slate-900">Ticket Details</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col pt-6">
                  {!selectedTicketDetail ? (
                    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-sm text-slate-600">
                      Select a ticket to review the issue, proof, and resolution controls.
                    </div>
                  ) : detailLoading ? (
                    <AdminTicketDetailSkeleton />
                  ) : viewingSupportProof ? (
                    <DocumentFileViewer
                      url={viewingSupportProof.url}
                      label={viewingSupportProof.label}
                      onBack={() => setViewingSupportProof(null)}
                    />
                  ) : (
                    <div className="flex-1 space-y-5 overflow-y-auto pr-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm text-slate-500">Ticket ID</p>
                            <p className="text-lg font-semibold">{selectedTicketDetail.ticket_id}</p>
                          </div>
                          <SupportStatusTag status={selectedTicketDetail.status} />
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

                        <TicketFullDetails
                          ticket={selectedTicketDetail}
                          onViewProof={(url) =>
                            setViewingSupportProof({
                              url,
                              label: `Proof · ${selectedTicketDetail.ticket_id}`,
                            })
                          }
                        />

                        <div className="space-y-2">
                          <p className="text-sm font-medium text-slate-500">Messages</p>
                          {messages.length === 0 ? (
                            <p className="text-sm text-slate-500">No messages yet.</p>
                          ) : (
                            <div className="space-y-3 rounded-lg border bg-slate-50 p-4">
                              {messages.map((message) => (
                                <div key={message.id} className={`rounded-lg border p-3 text-sm ${message.sender_type === 'admin' ? 'bg-udaan-blue/5 border-udaan-blue/20' : 'bg-white'}`}>
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

                        <div className="space-y-2 rounded-lg border bg-white p-4">
                          <p className="text-sm font-semibold text-slate-900">Reply to User</p>
                          <Textarea value={replyMessage} onChange={(e) => setReplyMessage(e.target.value)} rows={4} placeholder="Write the message the user should receive" />
                          <Button onClick={sendReply} disabled={replying} className="h-10 w-full bg-udaan-blue text-white hover:bg-udaan-blue/90">
                            {replying ? 'Sending...' : 'Send Reply'}
                          </Button>
                        </div>

                        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                          <p className="text-sm font-semibold text-slate-900">Delhivery Tracking Lookup</p>
                          <p className="text-xs text-slate-600">Use this to fetch live shipment status for donor-to-NGO deliveries.</p>
                          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                            <Input value={trackingLookupId} onChange={(e) => setTrackingLookupId(e.target.value)} placeholder="Enter Delhivery tracking ID" className="border-slate-200 bg-white" />
                            <Button onClick={lookupDeliveryTracking} disabled={trackingLookupLoading} className="bg-udaan-blue text-white hover:bg-udaan-blue/90">{trackingLookupLoading ? 'Checking...' : 'Track Shipment'}</Button>
                          </div>

                          {trackingSnapshot ? (
                            <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3 text-sm">
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
                                      <div key={`${event.timestamp || 'event'}-${index}`} className="rounded border border-slate-200 bg-white p-2 text-xs">
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
                            <Select
                              value={statusUpdate}
                              onValueChange={(value) => setStatusUpdate(value as SupportTicketStatus)}
                            >
                              <SelectTrigger className="h-10 border-blue-200 bg-white text-slate-900">
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                              <SelectContent className="border-blue-100 bg-white">
                                <SelectItem value="open">Open</SelectItem>
                                <SelectItem value="in_progress">In Progress</SelectItem>
                                <SelectItem value="resolved">Resolved</SelectItem>
                                <SelectItem value="closed">Closed</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-end">
                            <Button onClick={updateSelectedTicket} disabled={saving} className="h-10 w-full bg-udaan-blue text-white hover:bg-udaan-blue/90">
                              {saving ? 'Saving...' : 'Save Changes'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                </CardContent>
              </Card>
            </div>
            )}

            {activeTab === 'refunds' && (
            <AdminRefundsPanel />
            )}

            {activeTab === 'ca-credentials' && (
            <NavadrishtCAManagement />
            )}
            </CardContent>
            </Card>
        </div>
      </AdminPortalMain>
    </AdminPortalShell>
  );
}

