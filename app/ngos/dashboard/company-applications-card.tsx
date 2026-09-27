'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SkeletonOrderItem } from '@/components/ui/skeleton';
import { VerifiedAccountName } from '@/components/verification-badge';
import { getStatusBadgeClass } from '@/components/dashboard-status';
import { formatStatusLabel } from '@/lib/format-date';
import { getGramAvatarFallbackStyle } from '@/lib/gram-avatar';
import { getInitials, isActionableProjectApplicationStatus, joinPresent } from './helpers';
import type { CompanyProjectApplication } from './types';

interface CompanyApplicationsCardProps {
  applications: CompanyProjectApplication[];
  loading: boolean;
  reviewingKey: string | null;
  onRefresh: () => void;
  onReview: (projectId: string, companyId: number, decision: 'accepted' | 'rejected') => void;
}

export function CompanyApplicationsCard({ applications, loading, reviewingKey, onRefresh, onReview }: CompanyApplicationsCardProps) {
  return (
    <div className="rounded-md border border-gram-border bg-white p-4 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-gram-ink">Company Takeover Applications</p>
          <p className="text-sm text-gram-muted">
            Companies apply to take over a CSR project package. Accept to lock the project to that company.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>Refresh</Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <SkeletonOrderItem />
          <SkeletonOrderItem />
        </div>
      ) : applications.length === 0 ? (
        <p className="text-sm text-gram-muted">No company takeover applications yet.</p>
      ) : (
        <div className="space-y-3">
          {applications.map((application) => {
            const appKey = `${application.project_id}:${application.company_id}`;
            const isPending = isActionableProjectApplicationStatus(application.status);
            const isReviewing = reviewingKey === appKey;
            const companyName = application.company_name || 'Company';
            const companyInitials = getInitials(companyName, 'C');
            const companySecondary = joinPresent([application.company_industry, application.company_location]);
            const companyContact = joinPresent([application.company_email, application.company_phone]);
            return (
              <div key={appKey} className="rounded-md border bg-white p-3 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Project for takeover</p>
                    <p className="font-semibold text-gram-ink truncate">{application.project_title}</p>
                  </div>
                  <Badge variant="outline" className={`shrink-0 ${getStatusBadgeClass(application.status)}`}>
                    {formatStatusLabel(application.status)}
                  </Badge>
                </div>

                <div className="rounded-md border border-gram-border bg-slate-50 p-2.5">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-11 w-11 shrink-0">
                      {application.company_profile_image ? (
                        <AvatarImage src={application.company_profile_image} alt={companyName} />
                      ) : null}
                      <AvatarFallback
                        className="text-sm font-medium"
                        style={getGramAvatarFallbackStyle(companyName)}
                      >
                        {companyInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <VerifiedAccountName
                        name={companyName}
                        verified={application.company_verified}
                        size="sm"
                        nameClassName="text-sm font-semibold text-gram-ink"
                        className="max-w-full"
                      />
                      {companySecondary ? (
                        <p className="text-xs text-gram-muted truncate">{companySecondary}</p>
                      ) : null}
                      {companyContact ? (
                        <p className="text-xs text-gram-muted break-words">{companyContact}</p>
                      ) : null}
                      {!companySecondary && !companyContact ? (
                        <p className="text-xs text-gram-muted">Company details not available</p>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => onReview(application.project_id, application.company_id, 'accepted')}
                    disabled={!isPending || isReviewing}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isReviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Accept Takeover'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onReview(application.project_id, application.company_id, 'rejected')}
                    disabled={!isPending || isReviewing}
                    className="border-red-300 text-red-600 hover:bg-red-50"
                  >
                    {isReviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reject'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
