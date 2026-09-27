import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { VerifiedAccountName } from '@/components/verification-badge';
import { NeedDetailLink, StaticStatusBadge, getStatusBadgeClass } from '@/components/dashboard-status';
import { formatDisplayDate, formatStatusLabel } from '@/lib/format-date';

export interface CSRTrackingAssignment {
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
  lead_ngo_verification_status?: string | null;
  lead_ngo_verified?: boolean;
  assigned_company_id: number;
  assigned_company_name: string;
  assigned_company_email?: string;
  assigned_company_verification_status?: string | null;
  assigned_company_verified?: boolean;
  selected_lead_ngo_id?: number | null;
  selected_lead_ngo_name?: string | null;
  selected_lead_ngo_email?: string | null;
  selected_lead_ngo_verification_status?: string | null;
  selected_lead_ngo_verified?: boolean;
  assignment_status: string;
  assigned_at?: string | null;
  review_note?: string;
  lead_ngo_invites?: Array<{
    id: string;
    ngo_id: number;
    ngo_name: string;
    ngo_email?: string;
    ngo_verification_status?: string | null;
    ngo_verified?: boolean;
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

export function CsrTrackingProjectDetails({
  assignment,
  partnerLabel,
  partnerName,
  partnerEmail,
  partnerStatus,
  partnerVerified,
}: {
  assignment: CSRTrackingAssignment;
  partnerLabel: string;
  partnerName: string;
  partnerEmail?: string;
  partnerStatus?: string | null;
  partnerVerified?: boolean | null;
}) {
  const beneficiaries =
    assignment.project_expected_beneficiaries != null && assignment.project_expected_beneficiaries > 0
      ? Number(assignment.project_expected_beneficiaries).toLocaleString('en-IN')
      : null;
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
          <p className="flex flex-wrap items-center gap-1 text-sm text-slate-600">
            <span>{partnerLabel}:</span>
            <VerifiedAccountName
              name={partnerName}
              status={partnerStatus}
              verified={partnerVerified}
              size="xs"
              nameClassName="font-medium text-slate-800"
            />
          </p>
          <p className="text-xs text-slate-500">
            {partnerEmail || 'No email'}
            {assignment.assigned_at ? ` • Handoff ${formatDisplayDate(assignment.assigned_at)}` : ''}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
            <span>Owner NGO:</span>
            <VerifiedAccountName
              name={assignment.lead_ngo_name}
              status={assignment.lead_ngo_verification_status}
              verified={assignment.lead_ngo_verified}
              size="xs"
              nameClassName="font-medium text-slate-700"
            />
            {hasDistinctLeadNgo && assignment.selected_lead_ngo_name ? (
              <>
                <span>•</span>
                <span>Lead NGO:</span>
                <VerifiedAccountName
                  name={assignment.selected_lead_ngo_name}
                  status={assignment.selected_lead_ngo_verification_status}
                  verified={assignment.selected_lead_ngo_verified}
                  size="xs"
                  nameClassName="font-medium text-slate-700"
                />
              </>
            ) : null}
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
          <p className="text-xs uppercase tracking-wide text-slate-500">Category</p>
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
      </div>

      {needs.length > 0 ? (
        <div>
          <p className="mb-1.5 text-xs uppercase tracking-wide text-slate-500">Legacy linked listings ({needs.length})</p>
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
