'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SkeletonOrderItem } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VerifiedAccountName } from '@/components/verification-badge';
import { getStatusBadgeClass } from '@/components/dashboard-status';
import { formatStatusLabel } from '@/lib/format-date';
import { getGramAvatarFallbackStyle } from '@/lib/gram-avatar';
import { getInitials, isActionableProjectApplicationStatus, joinPresent, partitionCompanyApplications } from './helpers';
import type { CompanyProjectApplication } from './types';

interface CompanyApplicationsCardProps {
  applications: CompanyProjectApplication[];
  loading: boolean;
  reviewingKey: string | null;
  onRefresh: () => void;
  onReview: (projectId: string, companyId: number, decision: 'accepted' | 'rejected') => void;
}

function applicationStatusCopy(status: string) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'accepted') {
    return 'Accepted. This project is locked to the company and appears under Taken-in tracking.'
  }
  if (normalized === 'rejected') {
    return 'Rejected. The company can apply again if the project is still open.'
  }
  if (normalized === 'expired') {
    return 'This application expired after another company was accepted.'
  }
  return ''
}

function ApplicationRow({
  application,
  reviewingKey,
  showActions,
  onReview,
}: {
  application: CompanyProjectApplication;
  reviewingKey: string | null;
  showActions: boolean;
  onReview: CompanyApplicationsCardProps['onReview'];
}) {
  const appKey = `${application.project_id}:${application.company_id}`;
  const isPending = isActionableProjectApplicationStatus(application.status);
  const isReviewing = reviewingKey === appKey;
  const companyName = application.company_name || 'Company';
  const companyInitials = getInitials(companyName, 'C');
  const companySecondary = joinPresent([application.company_industry, application.company_location]);
  const companyContact = joinPresent([application.company_email, application.company_phone]);
  const statusCopy = applicationStatusCopy(application.status);

  return (
    <div className="rounded-md border bg-white p-3 space-y-3">
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

      {statusCopy ? <p className="text-sm text-slate-600">{statusCopy}</p> : application.note ? (
        <p className="text-sm text-slate-600">{application.note}</p>
      ) : null}

      {showActions ? (
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
      ) : null}
    </div>
  );
}

export function CompanyApplicationsCard({ applications, loading, reviewingKey, onRefresh, onReview }: CompanyApplicationsCardProps) {
  const { review, history } = partitionCompanyApplications(applications);

  return (
    <div className="rounded-md border border-gram-border bg-white p-4 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-gram-ink">Company Takeover Applications</p>
          <p className="text-sm text-gram-muted">
            Review new applications here. Accepted and rejected ones move to History.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>Refresh</Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <SkeletonOrderItem />
          <SkeletonOrderItem />
        </div>
      ) : (
        <Tabs defaultValue="review" className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-auto">
            <TabsTrigger value="review">To review ({review.length})</TabsTrigger>
            <TabsTrigger value="history">History ({history.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="review" className="mt-4 space-y-3">
            {review.length === 0 ? (
              <p className="text-sm text-gram-muted">No takeover applications waiting for a decision.</p>
            ) : (
              review.map((application) => (
                <ApplicationRow
                  key={`${application.project_id}:${application.company_id}`}
                  application={application}
                  reviewingKey={reviewingKey}
                  showActions
                  onReview={onReview}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-3">
            {history.length === 0 ? (
              <p className="text-sm text-gram-muted">No accepted or rejected applications yet.</p>
            ) : (
              history.map((application) => (
                <ApplicationRow
                  key={`${application.project_id}:${application.company_id}`}
                  application={application}
                  reviewingKey={reviewingKey}
                  showActions={false}
                  onReview={onReview}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
