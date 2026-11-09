'use client'

import { useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import { isFullyVerifiedAccount } from '@/lib/auth'
import { formatStatusLabel } from '@/lib/format-date'
import { formatMeterInr, meterPercent } from '@/components/info-meter'
import {
  DashboardActionCentre,
  DashboardActivityFeed,
  DashboardEmptyNote,
  DashboardOverviewHeader,
  DashboardQuickLinks,
  DashboardSectionCard,
  DashboardStatGrid,
} from '@/components/dashboard-overview'
import { DashboardPaymentSnapshot } from '@/components/dashboard-payment-snapshot'
import { getOfferRequestBucket } from '@/lib/offer-requests'
import { summarizeNeedProgress } from '@/components/csr-tracking-project-details'
import { useOpsFinanceOverview } from '@/hooks/use-ops-finance-overview'
import type { CompanyDashboardData } from './use-company-dashboard-data'

export function CompanyOverviewSection({
  data,
  onNavigate,
  caAccountCount,
}: {
  data: CompanyDashboardData
  onNavigate: (tab: string) => void
  caAccountCount?: number | null
}) {
  const { user } = useAuth()
  const verified = isFullyVerifiedAccount(user)
  const verificationStatus = formatStatusLabel(user?.verification_status || 'unverified')
  const opsFinance = useOpsFinanceOverview(Boolean(user?.id))

  const pendingOfferRequests = data.offerRequests.filter((item) => getOfferRequestBucket(item) === 'pending')
  const activeTracking = useMemo(() => data.csrTrackingAssignments.filter((assignment) => {
    const status = String(assignment.project_status || assignment.assignment_status || '').toLowerCase()
    return !['completed', 'closed', 'cancelled', 'canceled'].includes(status)
  }), [data.csrTrackingAssignments])

  const opportunityBuckets = useMemo(() => {
    const buckets = { none: 0, pending: 0, accepted: 0, rejected: 0, other: 0 }
    for (const opportunity of data.projectOpportunities) {
      const status = String(opportunity.company_application_status || 'none').toLowerCase()
      if (status in buckets) {
        buckets[status as keyof typeof buckets] += 1
      } else {
        buckets.other += 1
      }
    }
    return buckets
  }, [data.projectOpportunities])

  const campaignStats = useMemo(() => {
    let withTracking = 0
    let attention = 0
    for (const campaign of data.publishedCsrCampaigns) {
      if (campaign.tracking) withTracking += 1
      const status = String(campaign.status || '').toLowerCase()
      if (['paused', 'at_risk', 'delayed'].includes(status)) attention += 1
    }
    return { withTracking, attention, published: data.publishedCsrCampaigns.length, drafts: data.draftCsrCampaigns.length }
  }, [data.publishedCsrCampaigns, data.draftCsrCampaigns])

  const financeProjects = opsFinance.data?.projects
  const financeByProjectId = useMemo(() => {
    const map = new Map<string, NonNullable<typeof financeProjects>[number]>()
    for (const row of financeProjects || []) {
      map.set(row.project_id, row)
    }
    return map
  }, [financeProjects])

  const projectBreakdown = activeTracking.slice(0, 8).map((assignment) => {
    const progress = assignment.need_progress || summarizeNeedProgress(assignment.needs || [])
    const ops = financeByProjectId.get(assignment.project_id)
    return {
      id: assignment.project_id,
      title: assignment.project_title || 'CSR project',
      status: formatStatusLabel(assignment.project_status || assignment.assignment_status || 'active'),
      partner: assignment.selected_lead_ngo_name || assignment.lead_ngo_name || null,
      progress: meterPercent(progress.completed, progress.total),
      detail:
        progress.total > 0
          ? `${progress.completed} of ${progress.total} needs completed · ${progress.in_progress} in progress · ${progress.open} open`
          : 'Need progress not available yet',
      finance: ops?.finance || null,
    }
  })

  const actions = useMemo(() => {
    const items = []
    if (!verified) {
      items.push({
        id: 'verify',
        title: 'Company verification incomplete',
        detail: `Status: ${verificationStatus}`,
        onClick: () => onNavigate('profile'),
        tone: 'attention' as const,
      })
    }
    if (pendingOfferRequests.length > 0) {
      items.push({
        id: 'capability',
        title: `${pendingOfferRequests.length} capability request(s) awaiting response`,
        onClick: () => onNavigate('capability-offers'),
        tone: 'attention' as const,
      })
    }
    if (opportunityBuckets.pending > 0) {
      items.push({
        id: 'apps',
        title: `${opportunityBuckets.pending} project application(s) pending NGO decision`,
        onClick: () => onNavigate('csr-projects'),
        tone: 'attention' as const,
      })
    }
    if (campaignStats.attention > 0) {
      items.push({
        id: 'campaign-attn',
        title: `${campaignStats.attention} campaign(s) flagged for attention`,
        detail: 'Review campaign tracking in CSR Projects.',
        onClick: () => onNavigate('csr-projects'),
        tone: 'attention' as const,
      })
    }
    if (caAccountCount === 0) {
      items.push({
        id: 'ca',
        title: 'No Evidence Verifier configured',
        detail: 'Create an Evidence Verifier in Team Management so evidence and expenses can be reviewed.',
        onClick: () => onNavigate('team'),
        tone: 'attention' as const,
      })
    }
    // Action centre is only for company follow-ups. Portal access lives under Quick actions.
    return items
  }, [
    verified,
    verificationStatus,
    pendingOfferRequests.length,
    opportunityBuckets.pending,
    campaignStats.attention,
    caAccountCount,
    onNavigate,
  ])

  const activity = useMemo(() => {
    const rows: Array<{ id: string; title: string; detail?: string; at?: string | null }> = []
    for (const campaign of data.publishedCsrCampaigns.slice(0, 4)) {
      rows.push({
        id: `camp-${campaign.id}`,
        title: `Campaign · ${campaign.title || 'Untitled'}`,
        detail: formatStatusLabel(campaign.status || 'published'),
        at: campaign.created_at || null,
      })
    }
    for (const opportunity of data.projectOpportunities.slice(0, 4)) {
      rows.push({
        id: `opp-${opportunity.project_id}`,
        title: `Opportunity · ${opportunity.project_title}`,
        detail: `Application ${formatStatusLabel(opportunity.company_application_status)}`,
        at: opportunity.latest_application_at || null,
      })
    }
    for (const assignment of activeTracking.slice(0, 3)) {
      rows.push({
        id: `track-${assignment.project_id}`,
        title: `Active project · ${assignment.project_title || 'CSR project'}`,
        detail: formatStatusLabel(assignment.project_status || assignment.assignment_status || 'active'),
      })
    }
    return rows
      .sort((a, b) => {
        const aTime = a.at ? new Date(String(a.at)).getTime() : 0
        const bTime = b.at ? new Date(String(b.at)).getTime() : 0
        return bTime - aTime
      })
      .slice(0, 8)
  }, [data.publishedCsrCampaigns, data.projectOpportunities, activeTracking])

  return (
    <div className="space-y-6">
      <DashboardOverviewHeader
        title="CSR portfolio overview"
        description="Active projects, campaign status, and items that need company attention. Approval actions remain with assigned Evidence Verifiers."
      />

      <DashboardStatGrid
        items={[
          {
            label: 'Verification',
            value: verificationStatus,
            detail: verified ? undefined : 'Complete verification in Profile',
            tone: verified ? 'success' : 'attention',
          },
          {
            label: 'Active CSR projects',
            value: activeTracking.length,
            detail: `${data.csrTrackingAssignments.length} total tracked assignments`,
          },
          {
            label: 'Published campaigns',
            value: campaignStats.published,
            detail: `${campaignStats.drafts} draft(s) · ${campaignStats.withTracking} with tracking data`,
          },
          {
            label: 'Project opportunities',
            value: data.projectOpportunities.length,
            detail: `${opportunityBuckets.pending} pending · ${opportunityBuckets.accepted} accepted`,
            tone: opportunityBuckets.pending > 0 ? 'attention' : 'default',
          },
        ]}
      />

      <DashboardSectionCard
        title="Project status distribution"
        description="Company applications against NGO project opportunities."
      >
        <DashboardStatGrid
          className="xl:grid-cols-4"
          items={[
            { label: 'Not applied', value: opportunityBuckets.none },
            { label: 'Pending', value: opportunityBuckets.pending, tone: opportunityBuckets.pending ? 'attention' : 'default' },
            { label: 'Accepted', value: opportunityBuckets.accepted, tone: 'success' },
            { label: 'Rejected', value: opportunityBuckets.rejected, tone: 'muted' },
          ]}
        />
      </DashboardSectionCard>

      <DashboardSectionCard
        title="Project-wise progress"
        description="Need completion and ops ledger summaries for active tracked CSR projects. Proposed expenses are never treated as approved or actual. Approvals remain CA-only."
        action={
          <button type="button" className="text-sm font-medium text-udaan-blue hover:underline" onClick={() => onNavigate('csr-projects')}>
            Open CSR projects
          </button>
        }
      >
        {data.loadingCSRTrackingAssignments || opsFinance.loading ? (
          <p className="text-sm text-slate-500">Loading project tracking and finance…</p>
        ) : projectBreakdown.length === 0 ? (
          <DashboardEmptyNote>No active CSR project assignments yet.</DashboardEmptyNote>
        ) : (
          <ul className="space-y-3">
            {projectBreakdown.map((row) => (
              <li key={row.id} className="rounded-md border border-gram-border bg-white px-3 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{row.title}</p>
                  <span className="text-xs text-slate-500">{row.status}</span>
                </div>
                {row.partner ? <p className="mt-0.5 text-xs text-slate-600">Lead / partner: {row.partner}</p> : null}
                <p className="mt-1 text-xs text-slate-600">{row.detail}</p>
                {row.progress != null ? (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>Need completion</span>
                      <span className="tabular-nums">{row.progress}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded bg-slate-200">
                      <div className="h-full bg-udaan-blue" style={{ width: `${row.progress}%` }} />
                    </div>
                  </div>
                ) : null}
                {row.finance ? (
                  <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                    <p>
                      Approved / actual:{' '}
                      <span className="tabular-nums text-slate-900">
                        {row.finance.ledger_available
                          ? formatMeterInr(row.finance.actual_expenditure)
                          : 'Unavailable'}
                      </span>
                    </p>
                    <p>
                      Paid / outstanding:{' '}
                      <span className="tabular-nums text-slate-900">
                        {row.finance.ledger_available
                          ? `${formatMeterInr(row.finance.amount_paid)} / ${formatMeterInr(row.finance.unpaid_approved_amount)}`
                          : 'Unavailable'}
                      </span>
                    </p>
                    <p>
                      Proposed (not actual):{' '}
                      <span className="tabular-nums text-slate-900">
                        {formatMeterInr(row.finance.proposed_expenditure)}
                      </span>
                    </p>
                    <p>
                      Unreconciled:{' '}
                      <span className="tabular-nums text-slate-900">
                        {formatMeterInr(row.finance.unreconciled_amount)}
                      </span>
                    </p>
                    <p>
                      Materials:{' '}
                      <span className="tabular-nums text-slate-900">
                        {row.finance.materials.approved}/{row.finance.materials.total} approved
                        {row.finance.materials.receipt_progress_available
                          ? ` · received ${row.finance.materials.received_quantity}/${row.finance.materials.required_quantity}`
                          : ''}
                      </span>
                    </p>
                  </div>
                ) : opsFinance.error ? (
                  <p className="mt-2 text-xs text-amber-700">Ops finance unavailable for this row.</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {opsFinance.data?.portfolio ? (
          <DashboardStatGrid
            className="mt-4 xl:grid-cols-4"
            items={[
              {
                label: 'Portfolio approved',
                value: opsFinance.data.portfolio.ledger_available
                  ? formatMeterInr(opsFinance.data.portfolio.approved_amount)
                  : 'Unavailable',
                detail: opsFinance.data.truncated
                  ? `Capped to ${opsFinance.data.project_cap} projects`
                  : 'Company portfolio scope',
              },
              {
                label: 'Portfolio paid',
                value: opsFinance.data.portfolio.ledger_available
                  ? formatMeterInr(opsFinance.data.portfolio.amount_paid)
                  : 'Unavailable',
              },
              {
                label: 'Portfolio outstanding',
                value: opsFinance.data.portfolio.ledger_available
                  ? formatMeterInr(opsFinance.data.portfolio.unpaid_approved_amount)
                  : 'Unavailable',
                tone:
                  opsFinance.data.portfolio.unpaid_approved_amount > 0 ? 'attention' : 'default',
              },
              {
                label: 'Proposed (excluded)',
                value: formatMeterInr(opsFinance.data.portfolio.proposed_expenditure),
                tone: 'muted',
              },
            ]}
          />
        ) : null}
      </DashboardSectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardSectionCard title="Action centre" description="Company-side follow-ups. No approval controls are added here.">
          <DashboardActionCentre items={actions} />
        </DashboardSectionCard>
        <DashboardSectionCard title="Recent portfolio activity">
          <DashboardActivityFeed items={activity} />
        </DashboardSectionCard>
      </div>

      <DashboardPaymentSnapshot
        roles={['sent']}
        title="Outbound payment summary"
        description="Confirmed, pending, and refunded amounts from this company account."
        detailHref="/companies/dashboard?tab=payments"
      />

      <DashboardSectionCard title="Quick actions">
        <DashboardQuickLinks
          links={[
            { href: '/companies/dashboard?tab=csr-projects', label: 'CSR projects', detail: 'Tracking and campaigns' },
            { href: '/companies/dashboard?tab=capability-offers', label: 'Capability offers', detail: 'Listings and requests' },
            { href: '/companies/dashboard?tab=team', label: 'Team Management', detail: 'Employees and Evidence Verifiers' },
            { href: '/evidence-verification/login', label: 'Evidence Verification portal', detail: 'Review assigned project evidence' },
            { href: '/companies/dashboard?tab=impact-reports', label: 'Impact reports', detail: 'Outcomes and metrics' },
            { href: '/companies/dashboard?tab=payments', label: 'Payments', detail: 'Ledger and refunds' },
            { href: '/companies/csr-agent', label: 'Catalyst', detail: 'CSR Intelligence · drafting' },
          ]}
        />
      </DashboardSectionCard>
    </div>
  )
}
