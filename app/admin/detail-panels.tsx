'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AdminDetailItems, AdminDetailSection, formatAdminDetailValue } from '@/components/evidence-verification/portal-ui';
import { formatStatusLabel } from '@/lib/format-date';
import { formatProjectExactAddress } from '@/lib/service-request-allocation';
import { cn, parseJsonObject } from '@/lib/utils';
import type {
  AdminCampaign,
  AdminProject,
  AdminServiceRequest,
  AdminUserItem,
  ReverificationSummary,
  ServiceOffer,
  SupportTicket,
} from './types';

export function OfferFullDetails({ offer }: { offer: ServiceOffer }) {
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

export function RequestFullDetails({ request }: { request: AdminServiceRequest }) {
  if (!request) return null;
  const requirements = parseJsonObject(request.requirements);
  const projectContext = parseJsonObject(request.project_context);
  const fundingTarget = request.target_amount ?? requirements.funding_target_inr;

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

      {(fundingTarget || Number(request.current_amount) > 0) ? (
        <AdminDetailSection title="Financial details">
          <AdminDetailItems
            items={[
              { label: 'Funds raised (INR)', value: formatAdminDetailValue(request.current_amount) },
              { label: 'Funding target (INR)', value: formatAdminDetailValue(fundingTarget) },
              { label: 'Funds remaining (INR)', value: formatAdminDetailValue(request.remaining_amount) },
            ]}
          />
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

export function ProjectFullDetails({ project }: { project: AdminProject }) {
  if (!project) return null;
  return (
    <AdminDetailSection title="Full project record">
      <AdminDetailItems
        items={[
          { label: 'Project ID', value: formatAdminDetailValue(project.id) },
          { label: 'Title', value: formatAdminDetailValue(project.title) },
          { label: 'Status', value: formatAdminDetailValue(project.status) },
          { label: 'Location', value: formatAdminDetailValue(project.location) },
          { label: 'Exact address', value: formatAdminDetailValue(project.exact_address ? formatProjectExactAddress(project.exact_address) : null) },
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

export function CampaignFullDetails({ campaign }: { campaign: AdminCampaign }) {
  if (!campaign) return null;
  const impactMetrics = parseJsonObject(campaign.impact_metrics);
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

export function UserFullDetails({ user }: { user: AdminUserItem }) {
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

export const REVERIFICATION_DOCUMENT_LABELS: Record<string, string> = {
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

export function ReverificationReviewPanel({
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

export function SupportStatusTag({ status }: { status?: string | null }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        supportStatusTone(status)
      )}
    >
      {formatStatusLabel(status || 'unknown')}
    </span>
  );
}

export function TicketFullDetails({
  ticket,
  onViewProof,
}: {
  ticket: SupportTicket;
  onViewProof?: (url: string) => void;
}) {
  if (!ticket) return null;
  const proofUrl = ticket.proof_url;
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
            value: proofUrl ? (
              <button
                type="button"
                onClick={() => onViewProof?.(proofUrl)}
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
