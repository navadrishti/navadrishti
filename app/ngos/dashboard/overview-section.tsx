'use client'

import { useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import { isFullyVerifiedAccount } from '@/lib/auth'
import { formatStatusLabel } from '@/lib/format-date'
import { formatMeterInr, InfoMeter, meterPercent } from '@/components/info-meter'
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
import { useOpsFinanceOverview } from '@/hooks/use-ops-finance-overview'
import type { NgoDashboardData } from './use-ngo-dashboard-data'

export function NgoOverviewSection({
  data,
  onNavigate,
  canListCapabilities,
}: {
  data: NgoDashboardData
  onNavigate: (tab: string) => void
  canListCapabilities: boolean
}) {
  const { user } = useAuth()
  const verified = isFullyVerifiedAccount(user)
  const verificationStatus = formatStatusLabel(user?.verification_status || 'unverified')
  const opsFinance = useOpsFinanceOverview(Boolean(user?.id))

  const pendingOfferRequests = data.offerRequests.filter((item) => getOfferRequestBucket(item) === 'pending')
  const activeOfferRequests = data.offerRequests.filter((item) => getOfferRequestBucket(item) === 'in-progress')
  const pendingIncomingApplications = data.serviceOffers.reduce(
    (sum, offer) => sum + Math.max(0, Number(offer.pending_applications || 0)),
    0
  )
  const pendingOutgoingApplications = data.offerApplications.filter(
    (item) => String(item.my_application?.status || item.status || '').toLowerCase() === 'pending'
  ).length

  const finance = useMemo(() => {
    let budget = 0
    let budgetKnown = false
    let disbursed = 0
    let disbursedKnown = true
    let utilised = 0
    let utilisedKnown = false
    let pendingPayments = 0
    let awaitingPayment = 0
    let milestones = 0
    let completedMilestones = 0

    for (const project of data.csrProjects) {
      const f = project.finance
      if (f?.budget != null && Number.isFinite(Number(f.budget))) {
        budget += Number(f.budget)
        budgetKnown = true
      }
      const disbursedAvailable =
        f?.disbursed_available !== false && project.confirmed_funds_available !== false
      const net = f?.disbursed ?? project.confirmed_funds
      if (!disbursedAvailable || net == null || !Number.isFinite(Number(net))) {
        // Missing enrichment — never invent gross-as-net in the rollup.
        if (
          project.refunds_reconciled === false ||
          f?.disbursed_available === false ||
          project.confirmed_funds_available === false ||
          Number(project.gross_confirmed_funds || 0) > 0
        ) {
          disbursedKnown = false
        }
      } else {
        disbursed += Number(net)
      }
      if (f?.utilised != null && Number.isFinite(Number(f.utilised)) && f.utilised_available !== false) {
        utilised += Number(f.utilised)
        utilisedKnown = true
      }
      pendingPayments += Number(f?.pending_payments || project.pending_payment_funds || 0)
      awaitingPayment += Number(f?.approved_awaiting_payment || project.approved_awaiting_payment_funds || 0)
      milestones += Number(project.milestones_count || 0)
      completedMilestones += Number(project.completed_milestones_count || 0)
    }

    return {
      budget,
      budgetKnown,
      disbursed,
      disbursedKnown,
      utilised,
      utilisedKnown,
      pendingPayments,
      awaitingPayment,
      milestones,
      completedMilestones,
    }
  }, [data.csrProjects])

  const pendingInvites =
    data.campaignLeadInvitations.length +
    data.projectLeadInvitations.length +
    data.companyProjectApplications.filter((item) =>
      ['pending', 'invited', 'pending_acceptance'].includes(String(item.status || '').toLowerCase())
    ).length

  const actions = useMemo(() => {
    const items = []
    if (!verified) {
      items.push({
        id: 'verify',
        title: 'Organisation verification incomplete',
        detail: `Status: ${verificationStatus}`,
        onClick: () => onNavigate('profile'),
        tone: 'attention' as const,
      })
    }
    if (!canListCapabilities) {
      items.push({
        id: 'payout',
        title: 'Connect payout account to list capabilities',
        detail: 'Required before publishing capability offers.',
        onClick: () => onNavigate('profile'),
        tone: 'attention' as const,
      })
    }
    if (pendingOfferRequests.length > 0) {
      items.push({
        id: 'offer-req',
        title: `${pendingOfferRequests.length} capability request(s) awaiting response`,
        onClick: () => onNavigate('service-offers'),
        tone: 'attention' as const,
      })
    }
    if (pendingInvites > 0) {
      items.push({
        id: 'invites',
        title: `${pendingInvites} CSR invitation(s) or company application(s) pending`,
        onClick: () => onNavigate('csr-projects'),
        tone: 'attention' as const,
      })
    }
    if (finance.awaitingPayment > 0) {
      items.push({
        id: 'awaiting-pay',
        title: `${formatMeterInr(finance.awaitingPayment)} approved and awaiting payment`,
        onClick: () => onNavigate('csr-projects'),
        tone: 'attention' as const,
      })
    }
    return items
  }, [
    verified,
    verificationStatus,
    canListCapabilities,
    pendingOfferRequests.length,
    pendingInvites,
    finance.awaitingPayment,
    onNavigate,
  ])

  const projectRows = data.csrProjects.slice(0, 6).map((project) => {
    const progress =
      project.milestone_progress_percentage != null
        ? Number(project.milestone_progress_percentage)
        : meterPercent(
            Number(project.completed_milestones_count || 0),
            Number(project.milestones_count || 0)
          )
    return {
      id: String(project.id),
      title: project.title || 'CSR project',
      status: formatStatusLabel(project.project_status || 'active'),
      progress,
      detail: [
        `${Number(project.completed_milestones_count || 0)}/${Number(project.milestones_count || 0)} milestones complete`,
        project.finance?.budget != null ? `Budget ${formatMeterInr(Number(project.finance.budget))}` : null,
        project.finance?.disbursed_available === false
          ? 'Disbursed unreconciled'
          : project.finance?.disbursed != null
            ? `Disbursed ${formatMeterInr(Number(project.finance.disbursed))}`
            : null,
      ]
        .filter(Boolean)
        .join(' · '),
    }
  })

  const activity = useMemo(() => {
    const rows: Array<{ id: string; title: string; detail?: string; at?: string | null }> = []
    for (const need of data.ongoingNeeds.slice(0, 4)) {
      rows.push({
        id: `need-${need.id}`,
        title: `Need · ${need.title || 'Untitled'}`,
        detail: formatStatusLabel(need.status || 'open'),
      })
    }
    for (const project of data.csrProjects.slice(0, 4)) {
      rows.push({
        id: `proj-${project.id}`,
        title: `Project · ${project.title || 'Untitled'}`,
        detail: formatStatusLabel(project.project_status || 'active'),
        at: project.updated_at || project.created_at || null,
      })
    }
    for (const assignment of data.csrTrackingAssignments.slice(0, 3)) {
      rows.push({
        id: `track-${assignment.project_id}`,
        title: `Taken-in project · ${assignment.project_title || 'CSR project'}`,
        detail: formatStatusLabel(assignment.assignment_status || assignment.project_status || 'active'),
      })
    }
    return rows
      .sort((a, b) => {
        const aTime = a.at ? new Date(String(a.at)).getTime() : 0
        const bTime = b.at ? new Date(String(b.at)).getTime() : 0
        return bTime - aTime
      })
      .slice(0, 8)
  }, [data])

  return (
    <div className="space-y-6">
      <DashboardOverviewHeader
        title="Organisation workspace"
        description="Operational overview of verification, marketplace listings, CSR projects, and financial status."
      />

      {data.loadingData ? (
        <DashboardEmptyNote>Loading organisation workspace…</DashboardEmptyNote>
      ) : (
        <DashboardStatGrid
          items={[
            {
              label: 'Verification',
              value: verificationStatus,
              detail: verified ? 'Organisation verified' : 'Complete verification in Profile',
              tone: verified ? 'success' : 'attention',
            },
            {
              label: 'Active needs',
              value: data.loadingNeeds ? '—' : data.ongoingNeeds.length,
              detail: data.loadingNeeds
                ? 'Loading owned standalone needs…'
                : `${data.ongoingNeeds.length} ongoing · ${data.historyNeeds.length} in history`,
            },
            {
              label: 'Capability offers',
              value: data.serviceOffers.length,
              detail: `${pendingIncomingApplications} pending on your offers · ${activeOfferRequests.length} active requests`,
            },
            {
              label: 'CSR projects',
              value: data.csrProjects.length,
              detail: `${data.csrTrackingAssignments.length} taken-in · ${pendingInvites} invite(s) pending`,
              tone: pendingInvites > 0 ? 'attention' : 'default',
            },
          ]}
        />
      )}

      <DashboardSectionCard
        title="Financial overview"
        description="Milestone disbursements from CSR project finance, plus ops expense ledger rollups for your portfolio (proposed/unreconciled excluded from actual)."
      >
        {data.loadingCSRProjects ? (
          <p className="text-sm text-slate-500">Loading project finance…</p>
        ) : data.csrProjects.length === 0 ? (
          <DashboardEmptyNote>No CSR projects yet. Financial totals appear once projects are active.</DashboardEmptyNote>
        ) : (
          <div className="space-y-3">
            {finance.budgetKnown ? (
              <InfoMeter
                title="Disbursement against budget"
                value={
                  finance.disbursedKnown
                    ? `${formatMeterInr(finance.disbursed)} of ${formatMeterInr(finance.budget)}`
                    : `Unreconciled of ${formatMeterInr(finance.budget)}`
                }
                progress={finance.disbursedKnown ? meterPercent(finance.disbursed, finance.budget) : null}
                detail={
                  finance.disbursedKnown
                    ? undefined
                    : 'Unreconciled — confirm refund ledger before trusting this total'
                }
              />
            ) : null}
            <DashboardStatGrid
              className="xl:grid-cols-3"
              items={[
                {
                  label: 'Approved budget',
                  value: finance.budgetKnown ? formatMeterInr(finance.budget) : 'Not set',
                },
                {
                  label: 'Actual utilised',
                  value: finance.utilisedKnown ? formatMeterInr(finance.utilised) : 'Not available',
                },
                {
                  label: 'Awaiting payment',
                  value: formatMeterInr(finance.awaitingPayment),
                  detail:
                    finance.pendingPayments > 0
                      ? `${formatMeterInr(finance.pendingPayments)} pending`
                      : undefined,
                  tone: finance.awaitingPayment > 0 ? 'attention' : 'default',
                },
              ]}
            />
            {opsFinance.loading ? (
              <p className="text-sm text-slate-500">Loading ops expense ledger…</p>
            ) : opsFinance.error ? (
              <p className="text-sm text-amber-700">Ops ledger unavailable: {opsFinance.error}</p>
            ) : opsFinance.data ? (
              <div className="space-y-3 border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-500">
                  Ops rollup scope: your CSR portfolio
                  {opsFinance.data.truncated ? ` (first ${opsFinance.data.project_cap} projects)` : ''}
                  {!opsFinance.data.expense_table_available
                    ? ' · expense table not installed — migration pending'
                    : ''}
                </p>
                <DashboardStatGrid
                  className="xl:grid-cols-4"
                  items={[
                    {
                      label: 'Approved expenses',
                      value: opsFinance.data.portfolio.ledger_available
                        ? formatMeterInr(opsFinance.data.portfolio.approved_amount)
                        : 'Unavailable',
                    },
                    {
                      label: 'Paid',
                      value: opsFinance.data.portfolio.ledger_available
                        ? formatMeterInr(opsFinance.data.portfolio.amount_paid)
                        : 'Unavailable',
                    },
                    {
                      label: 'Unpaid approved',
                      value: opsFinance.data.portfolio.ledger_available
                        ? formatMeterInr(opsFinance.data.portfolio.unpaid_approved_amount)
                        : 'Unavailable',
                      tone:
                        opsFinance.data.portfolio.unpaid_approved_amount > 0 ? 'attention' : 'default',
                    },
                    {
                      label: 'Proposed (not actual)',
                      value: formatMeterInr(opsFinance.data.portfolio.proposed_expenditure),
                      detail:
                        opsFinance.data.portfolio.unreconciled_amount > 0
                          ? `Unreconciled ${formatMeterInr(opsFinance.data.portfolio.unreconciled_amount)} excluded`
                          : undefined,
                      tone: 'muted',
                    },
                  ]}
                />
                <DashboardStatGrid
                  className="xl:grid-cols-4"
                  items={[
                    {
                      label: 'Logistics outbound',
                      value: formatMeterInr(opsFinance.data.portfolio.logistics_outbound_net),
                      detail: 'Confirmed freight net',
                    },
                    {
                      label: 'Logistics return',
                      value: formatMeterInr(opsFinance.data.portfolio.logistics_return_net),
                      detail: opsFinance.data.portfolio.logistics_unreconciled
                        ? 'Some legs unreconciled'
                        : undefined,
                      tone: opsFinance.data.portfolio.logistics_unreconciled ? 'attention' : 'default',
                    },
                    {
                      label: 'Wages paid',
                      value: formatMeterInr(opsFinance.data.portfolio.wages_paid),
                      detail: `Waived ${formatMeterInr(opsFinance.data.portfolio.wages_waived)} (not spend)`,
                    },
                    {
                      label: 'Wages outstanding',
                      value: formatMeterInr(opsFinance.data.portfolio.wages_outstanding),
                      tone:
                        opsFinance.data.portfolio.wages_outstanding > 0 ? 'attention' : 'default',
                    },
                  ]}
                />
                <DashboardStatGrid
                  className="xl:grid-cols-3"
                  items={[
                    {
                      label: 'Materials submitted',
                      value: opsFinance.data.material_table_available
                        ? opsFinance.data.portfolio.materials.submitted
                        : 'Unavailable',
                    },
                    {
                      label: 'Materials approved',
                      value: opsFinance.data.material_table_available
                        ? `${opsFinance.data.portfolio.materials.approved} / ${opsFinance.data.portfolio.materials.total}`
                        : 'Unavailable',
                    },
                    {
                      label: 'Material receipt',
                      value:
                        opsFinance.data.material_table_available &&
                        opsFinance.data.portfolio.materials.receipt_progress_available
                          ? `${opsFinance.data.portfolio.materials.received_quantity} / ${opsFinance.data.portfolio.materials.required_quantity}`
                          : opsFinance.data.material_table_available
                            ? 'No quantity targets'
                            : 'Unavailable',
                      detail: 'Catalog cost is not treated as an expense',
                    },
                  ]}
                />
              </div>
            ) : null}
          </div>
        )}
      </DashboardSectionCard>

      <DashboardSectionCard
        title="Project tracking"
        description="Milestone completion for your CSR projects."
      >
        {projectRows.length === 0 ? (
          <DashboardEmptyNote>No CSR projects to track yet.</DashboardEmptyNote>
        ) : (
          <div className="space-y-3">
            <InfoMeter
              title="Overall milestone progress"
              value={`${finance.completedMilestones} of ${finance.milestones} complete`}
              progress={meterPercent(finance.completedMilestones, finance.milestones)}
              detail="Completed/approved milestones only"
            />
            <ul className="space-y-2">
              {projectRows.map((row) => (
                <li key={row.id} className="rounded-md border border-gram-border bg-slate-50 px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">{row.title}</p>
                    <span className="text-xs text-slate-500">{row.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{row.detail}</p>
                  {row.progress != null ? (
                    <div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-200">
                      <div className="h-full bg-udaan-blue" style={{ width: `${row.progress}%` }} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="text-sm font-medium text-udaan-blue hover:underline"
              onClick={() => onNavigate('csr-projects')}
            >
              Open full project workspace
            </button>
          </div>
        )}
      </DashboardSectionCard>

      <DashboardSectionCard
        title="Workforce and marketplace"
        description="Volunteers, capability demand, and needs currently open."
      >
        <DashboardStatGrid
          className="xl:grid-cols-3"
          items={[
            {
              label: 'Campaign volunteer assignments',
              value: data.campaignVolunteerAssignments.length,
              detail: 'Volunteers assigned under your lead campaigns',
            },
            {
              label: 'Capability rentals / CSR capability rows',
              value: data.csrCapabilityRentals.length,
              detail: 'Tracked capability engagements linked to CSR work',
            },
            {
              label: 'Pending capability applications',
              value: pendingIncomingApplications,
              detail: `${pendingOutgoingApplications} of your outbound applications still pending`,
              tone: pendingIncomingApplications > 0 ? 'attention' : 'default',
            },
          ]}
        />
      </DashboardSectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardSectionCard title="Action centre" description="Pending organisation work.">
          <DashboardActionCentre items={actions} />
        </DashboardSectionCard>
        <DashboardSectionCard title="Recent activity" description="Needs and projects updated recently.">
          <DashboardActivityFeed items={activity} />
        </DashboardSectionCard>
      </div>

      <DashboardPaymentSnapshot
        roles={['received']}
        title="Payments received"
        description="Receipts from your payment history."
        detailHref="/ngos/dashboard?tab=payments"
      />

      <DashboardSectionCard title="Quick actions">
        <DashboardQuickLinks
          links={[
            { href: '/ngos/dashboard?tab=service-requests', label: 'My needs', detail: 'Track open needs' },
            { href: '/ngos/dashboard?tab=service-offers', label: 'Capability offers', detail: 'Listings and requests' },
            { href: '/ngos/dashboard?tab=field-officers', label: 'Field officers', detail: 'Create and manage field accounts' },
            { href: '/ngos/dashboard?tab=csr-projects', label: 'CSR projects', detail: 'Evidence and tracking' },
            { href: '/ngos/dashboard?tab=impact-reports', label: 'Impact reports' },
            { href: '/ngos/dashboard?tab=payments', label: 'Payments' },
            { href: '/ngos/dashboard?tab=profile', label: 'Profile & verification' },
            { href: '/ngos/ai-agent', label: 'Atlas', detail: 'NGO Intelligence · guided drafting' },
          ]}
        />
      </DashboardSectionCard>
    </div>
  )
}
