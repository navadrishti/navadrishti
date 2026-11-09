'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { InfoMeter, InfoMeterGrid, meterPercent } from '@/components/info-meter';
import { formatDisplayDate, formatStatusLabel } from '@/lib/format-date';
import { deriveMilestoneLifecycleStage, formatMoneyInr } from '@/lib/csr-agent/project-metrics';
import type { CsrProjectEvidence, NgoCsrProject } from './types';
import { CsrProjectOpsPanel } from './csr-project-ops-panel';
import { projectSchedule } from '@/lib/csr-agent/ngo-project-schedule';
import { ProjectCardHeader } from './project-card-header';

interface CsrProjectCardProps {
  project: NgoCsrProject;
  variant: 'ongoing' | 'completed';
  evidence: CsrProjectEvidence | undefined;
  loadingEvidence: boolean;
  onViewEvidence: (projectId: string) => void;
  hideOps?: boolean;
}

function moneyOrUnavailable(amount: number | null | undefined) {
  return formatMoneyInr(amount) ?? 'Not available';
}

export function CsrProjectCard({
  project,
  variant,
  evidence,
  loadingEvidence,
  onViewEvidence,
  hideOps = false,
}: CsrProjectCardProps) {
  const autoLoadAttempted = useRef(false);
  useEffect(() => {
    if (project.financial_access !== true) return;
    if (evidence || loadingEvidence || autoLoadAttempted.current) return;
    autoLoadAttempted.current = true;
    onViewEvidence(project.id);
  }, [evidence, loadingEvidence, onViewEvidence, project.id, project.financial_access]);

  const overallPct = useMemo(() => {
    if (project.overall_completion_percentage != null) {
      return Math.max(0, Math.min(100, Number(project.overall_completion_percentage) || 0));
    }
    const total = Number(project.milestones_count || 0);
    const done = Number(project.paid_completed_milestones_count || 0);
    if (total <= 0) return null;
    return Math.round((done / total) * 100);
  }, [project]);

  const finance = evidence?.summary?.finance || project.finance;
  const timeline = evidence?.timeline || [];
  const currentItem =
    timeline.find((row) => row.lifecycle?.stage && row.lifecycle.stage !== 'completed') ||
    timeline.find((row) => row.milestone?.id === project.next_milestone?.id) ||
    timeline[0] ||
    null;

  const currentLifecycle =
    currentItem?.lifecycle ||
    evidence?.summary?.current_lifecycle ||
    (currentItem
      ? deriveMilestoneLifecycleStage({
          milestoneStatus: currentItem.milestone?.status,
          hasEvidence: (currentItem.evidence?.length || 0) > 0,
          reviewDecision: currentItem.latest_review?.decision || currentItem.latest_review?.status,
          paymentStatus: currentItem.latest_payment?.payment_status,
        })
      : null);

  const latestEvidence = currentItem?.evidence?.[0];
  const previewMedia = (latestEvidence?.media || []).filter((m) => m.media_url).slice(0, 4);
  const reviewDecision = String(
    currentItem?.latest_review?.decision || currentItem?.latest_review?.status || ''
  ).toLowerCase();
  const rejectionReason =
    reviewDecision === 'rejected' ? currentItem?.latest_review?.comments || null : null;

  const totalMilestones = Number(
    evidence?.summary?.total_milestones ?? project.milestones_count ?? 0
  );
  const paidComplete = Number(
    evidence?.summary?.paid_completed_milestones ?? project.paid_completed_milestones_count ?? 0
  );
  const pendingMilestones = Number(
    evidence?.summary?.pending_milestones ??
      project.pending_milestones_count ??
      Math.max(0, totalMilestones - paidComplete)
  );
  const schedule = projectSchedule({
    projectStatus: project.project_status, campaignStatus: project.campaign_status,
    startDate: project.schedule_start, endDate: project.schedule_end,
  });

  if (project.financial_access !== true) {
    return (
      <div className="rounded-md border bg-white p-4 space-y-2">
        <ProjectCardHeader title={project.title} location={project.region} status={project.project_status}
          role={project.ngo_role === 'participant' ? 'Participating NGO' : 'NGO role not confirmed'}
          schedule={schedule} start={project.schedule_start} end={project.schedule_end} />
        <p className="text-sm text-muted-foreground">Financial and expense details are not available for this assignment.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-white p-4 space-y-5">
      <ProjectCardHeader title={project.title} location={project.region} status={project.project_status}
        role="Lead NGO" schedule={schedule} start={project.schedule_start} end={project.schedule_end} />

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-sm">
          <p className="font-medium text-slate-900">Overall project progress</p>
          <p className="text-muted-foreground tabular-nums">
            {paidComplete}/{totalMilestones} completed
            {overallPct != null ? ` · ${overallPct}%` : ''}
          </p>
        </div>
        <Progress value={overallPct ?? 0} className="h-1.5" />
        <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
          <p>Total: {totalMilestones}</p>
          <p>Completed: {paidComplete}</p>
          <p>Pending: {pendingMilestones}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Completion counts milestones with confirmed payment only. Approval alone does not complete a milestone.
        </p>
      </section>

      <section className="space-y-3 rounded-md border border-slate-200 bg-slate-50/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current milestone</p>
            <p className="font-medium text-slate-900">
              {currentItem?.milestone?.title ||
                evidence?.summary?.current_milestone?.title ||
                project.next_milestone?.title ||
                'No open milestone'}
            </p>
          </div>
          {currentLifecycle ? (
            <Badge variant="outline" className="w-fit font-normal">
              {currentLifecycle.label}
            </Badge>
          ) : null}
        </div>

        {currentLifecycle?.steps?.length ? (
          <ol className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {currentLifecycle.steps.map((step) => (
              <li
                key={step.id}
                className={`rounded-md border px-2.5 py-2 text-xs ${
                  step.state === 'current'
                    ? 'border-slate-800 bg-white text-slate-900'
                    : step.state === 'done'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 bg-white text-slate-500'
                }`}
              >
                <p className="font-semibold uppercase tracking-wide">{step.label}</p>
                <p className="mt-1 capitalize text-[11px] opacity-80">{step.state}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">
            {loadingEvidence ? 'Loading milestone status…' : 'Open the timeline to refresh milestone status.'}
          </p>
        )}

        {rejectionReason ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <p className="font-medium">Rejection reason</p>
            <p className="mt-1 text-amber-900/90">{rejectionReason}</p>
            <p className="mt-2 text-xs">Resubmit corrected evidence from the GRAM App. This milestone does not advance until approved.</p>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <p className="text-sm font-medium text-slate-900">Financial overview</p>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Approved budget</p>
            <p className="mt-1 font-semibold tabular-nums text-slate-900">{moneyOrUnavailable(finance?.budget)}</p>
            <p className="mt-1 text-xs text-slate-600">Company-approved project budget</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Awaiting payment</p>
            <p className="mt-1 font-semibold tabular-nums text-slate-900">
              {formatMoneyInr(
                finance?.approved_awaiting_payment ?? project.approved_awaiting_payment_funds ?? 0
              ) ?? 'Rs 0'}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Approved evidence not yet paid · initiated pending{' '}
              {formatMoneyInr(finance?.pending_payments ?? project.pending_payment_funds ?? 0) ?? 'Rs 0'}
            </p>
          </div>
        </div>
        <InfoMeterGrid className="xl:grid-cols-2">
          <InfoMeter
            title="Funds disbursed"
            value={
              finance?.disbursed_available === false || project.confirmed_funds_available === false
                ? 'Unreconciled'
                : formatMoneyInr(finance?.disbursed ?? project.confirmed_funds ?? 0) ?? 'Rs 0'
            }
            progress={
              finance?.budget != null &&
              finance?.disbursed_available !== false &&
              project.confirmed_funds_available !== false
                ? meterPercent(Number(finance?.disbursed ?? project.confirmed_funds ?? 0), Number(finance.budget))
                : null
            }
            detail={
              finance?.disbursed_available === false || project.confirmed_funds_available === false
                ? 'Unreconciled — confirm refund ledger before trusting this total'
                : finance?.budget != null
                  ? `Against budget ${moneyOrUnavailable(finance.budget)}`
                  : undefined
            }
          />
          <InfoMeter
            title="Actual expenditure"
            value={
              finance?.utilised_available
                ? moneyOrUnavailable(finance.utilised)
                : 'Not recorded'
            }
            progress={
              finance?.utilised_available && finance?.budget != null
                ? meterPercent(Number(finance.utilised || 0), Number(finance.budget))
                : finance?.utilisation_percentage ?? null
            }
            detail={
              finance?.utilised_available
                ? `Remaining ${moneyOrUnavailable(finance.remaining)}`
                : undefined
            }
          />
        </InfoMeterGrid>
        <div className="grid grid-cols-1 gap-2 text-sm text-slate-700 md:grid-cols-2">
          <p>
            Funds allocated:{' '}
            <span className="font-medium text-slate-900">
              {finance?.allocated_available
                ? moneyOrUnavailable(finance.allocated)
                : 'Not available'}
            </span>
          </p>
          <p>
            Beneficiaries:{' '}
            <span className="font-medium text-slate-900">
              {project.latest_impact?.beneficiaries != null
                ? project.latest_impact.beneficiaries
                : project.expected_beneficiaries != null
                  ? `${project.expected_beneficiaries} (expected)`
                  : 'Not available'}
            </span>
          </p>
        </div>
      </section>

      {variant === 'ongoing' && !hideOps ? (
        <CsrProjectOpsPanel projectId={project.id} campaignId={project.campaign_id} />
      ) : null}

      <section className="space-y-3 rounded-md border bg-slate-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-900">Evidence timeline</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewEvidence(project.id)}
            disabled={loadingEvidence}
          >
            {loadingEvidence ? 'Refreshing…' : evidence ? 'Refresh timeline and finances' : 'Load timeline'}
          </Button>
        </div>

        {latestEvidence ? (
          <div className="rounded-md border bg-white p-3 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  Latest submission · {currentItem?.milestone?.title || 'Milestone'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDisplayDate(
                    latestEvidence.uploaded_at || latestEvidence.captured_at || latestEvidence.created_at
                  ) || 'Time not available'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Submitted by:{' '}
                  {latestEvidence.submitted_by_label ||
                    (latestEvidence.uploaded_by != null
                      ? `User ${latestEvidence.uploaded_by}`
                      : 'Unknown')}
                </p>
                {latestEvidence.gps_lat != null && latestEvidence.gps_long != null ? (
                  <p className="text-xs text-muted-foreground">
                    GPS: {Number(latestEvidence.gps_lat).toFixed(5)},{' '}
                    {Number(latestEvidence.gps_long).toFixed(5)}
                    {latestEvidence.gps_accuracy_meters != null
                      ? ` (±${latestEvidence.gps_accuracy_meters}m)`
                      : ''}
                  </p>
                ) : null}
              </div>
              <Badge variant="outline" className="font-normal">
                {formatStatusLabel(latestEvidence.submission_status || 'submitted')}
              </Badge>
            </div>
            {latestEvidence.description ? (
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{latestEvidence.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No notes on this submission.</p>
            )}
            {previewMedia.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {previewMedia.map((media) => (
                  <a
                    key={media.id}
                    href={media.media_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-md border bg-slate-100"
                    title={media.file_name || 'Evidence photo'}
                  >
                    <img
                      src={media.media_url}
                      alt={media.file_name || 'Evidence'}
                      className="h-16 w-16 object-cover"
                    />
                  </a>
                ))}
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-1 text-xs text-muted-foreground md:grid-cols-2">
              <p>
                Review:{' '}
                {reviewDecision
                  ? formatStatusLabel(reviewDecision)
                  : currentLifecycle?.stage === 'awaiting_review'
                    ? 'Pending'
                    : 'Not reviewed'}
              </p>
              <p>
                Payment:{' '}
                {currentItem?.latest_payment?.payment_status
                  ? formatStatusLabel(currentItem.latest_payment.payment_status)
                  : currentLifecycle?.stage === 'payment_pending'
                    ? 'Pending'
                    : 'Not started'}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {loadingEvidence
              ? 'Loading evidence submitted from the GRAM App…'
              : 'No field evidence submitted yet. Field officers submit from the GRAM App.'}
          </p>
        )}

        {timeline.length > 0 ? (
          <ul className="space-y-2">
            {timeline.map((item) => {
              const lifecycle =
                item.lifecycle ||
                deriveMilestoneLifecycleStage({
                  milestoneStatus: item.milestone?.status,
                  hasEvidence: (item.evidence?.length || 0) > 0,
                  reviewDecision: item.latest_review?.decision || item.latest_review?.status,
                  paymentStatus: item.latest_payment?.payment_status,
                });
              return (
                <li
                  key={String(item.milestone?.id || item.milestone?.title)}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-white px-3 py-2 text-sm"
                >
                  <span className="font-medium text-slate-900">
                    {item.milestone?.title || 'Milestone'}
                  </span>
                  <Badge variant="outline" className="w-fit font-normal">
                    {lifecycle.label}
                  </Badge>
                </li>
              );
            })}
          </ul>
        ) : null}

        {variant === 'ongoing' ? (
          <p className="text-xs text-muted-foreground">
            Next open milestone: {project.next_milestone?.title || 'None — project milestones are closed or awaiting payment completion.'}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Deadline: {project.deadline_at || 'N/A'}</p>
        )}
      </section>
    </div>
  );
}
