'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { formatStatusLabel } from '@/lib/format-date';
import { VerifiedAccountName } from '@/components/verification-badge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getStatusBadgeClass } from '@/components/dashboard-status';
import type { CompanyProjectOpportunity } from './types';

interface ProjectOpportunitiesSectionProps {
  opportunities: CompanyProjectOpportunity[];
  loading: boolean;
  allVerified: boolean;
  applicationNote: string;
  onApplicationNoteChange: (value: string) => void;
  applyingProjectId: string | null;
  onApply: (projectId: string) => void;
  onRefresh: () => void;
}

export function ProjectOpportunitiesSection({
  opportunities,
  loading,
  allVerified,
  applicationNote,
  onApplicationNoteChange,
  applyingProjectId,
  onApply,
  onRefresh,
}: ProjectOpportunitiesSectionProps) {
  return (
    <div className="rounded-md border bg-slate-50 p-4 space-y-3">
      <div>
        <p className="font-semibold text-slate-900">NGO Project Opportunities</p>
        <p className="text-sm text-slate-600">Apply to take over a full CSR project package. NGO approval locks the project to your company.</p>
      </div>

      {!allVerified ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-sm text-amber-900">
            Complete email, phone, and document verification before applying for takeover.
          </p>
          <Link href="/verification">
            <Button size="sm" variant="outline">Complete Verification</Button>
          </Link>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <Label htmlFor="project-apply-note">Application note (optional)</Label>
          <Input
            id="project-apply-note"
            value={applicationNote}
            onChange={(event) => onApplicationNoteChange(event.target.value)}
            placeholder="Scope, timeline, logistics plan, payment controls"
            disabled={!allVerified}
          />
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>Refresh Opportunities</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Loading opportunities...
        </div>
      ) : opportunities.length === 0 ? (
        <p className="text-sm text-slate-600">No project opportunities currently available.</p>
      ) : (
        <div className="space-y-3">
          {opportunities.map((opportunity) => (
            <div key={opportunity.project_id} className="rounded-md border bg-white p-3 space-y-2">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="font-semibold">{opportunity.project_title}</p>
                  <div className="flex min-w-0 items-center gap-1.5 text-sm text-slate-600">
                    <span className="shrink-0">NGO:</span>
                    <VerifiedAccountName
                      name={opportunity.ngo_name}
                      verified={Boolean(opportunity.ngo_verified)}
                      status={opportunity.ngo_verification_status}
                      size="xs"
                      nameClassName="text-sm text-slate-600"
                    />
                  </div>
                  <p className="text-xs text-slate-500">{opportunity.project_location || 'Location not set'} • {opportunity.project_timeline || 'Timeline not set'}</p>
                </div>
                <Badge variant="outline" className={`w-fit ${getStatusBadgeClass(opportunity.company_application_status)}`}>
                  {formatStatusLabel(opportunity.company_application_status)}
                </Badge>
              </div>

              <p className="text-xs text-slate-600">Projects are standalone CSR packages — open the project page for budget, impact, and package details.</p>

              <div className="flex flex-wrap gap-2 pt-1">
                <Link href={`/service-requests/projects/${opportunity.project_id}`}>
                  <Button size="sm" variant="outline">View Project</Button>
                </Link>
                <Button
                  size="sm"
                  onClick={() => onApply(opportunity.project_id)}
                  disabled={
                    !allVerified ||
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
                  ) : !allVerified || opportunity.company_application_eligible === false ? (
                    !allVerified ? 'Verify to Apply' : 'Not Eligible'
                  ) : (
                    'Apply for Takeover'
                  )}
                </Button>
              </div>

              {(!allVerified || opportunity.company_application_eligible === false) && (
                <p className="text-xs text-red-600">
                  {!allVerified
                    ? 'Complete email, phone, and document verification before applying for takeover.'
                    : opportunity.company_application_reason || 'Not eligible for takeover.'}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
