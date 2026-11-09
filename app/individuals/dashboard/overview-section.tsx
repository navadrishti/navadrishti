'use client'

import { useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import { isFullyVerifiedAccount } from '@/lib/auth'
import { formatStatusLabel } from '@/lib/format-date'
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
import { meterPercent } from '@/components/info-meter'
import { Progress } from '@/components/ui/progress'
import type { IndividualDashboardData } from './use-individual-dashboard-data'

export function IndividualOverviewSection({
  data,
  onNavigate,
}: {
  data: IndividualDashboardData
  onNavigate: (tab: string) => void
}) {
  const { user } = useAuth()
  const verified = isFullyVerifiedAccount(user)
  const verificationStatus = formatStatusLabel(user?.verification_status || 'unverified')

  const profileBits = useMemo(() => {
    const checks = [
      Boolean(user?.name),
      Boolean(user?.email),
      Boolean(user?.phone),
      Boolean(user?.profile_image),
      Boolean(user?.city || user?.state_province),
      verified,
    ]
    const done = checks.filter(Boolean).length
    return { done, total: checks.length }
  }, [user, verified])

  const loading =
    data.loadingServiceOffers ||
    data.loadingOfferRequests ||
    data.loadingApplications ||
    data.loadingCampaignVolunteerAssignments

  const activeEngagements =
    data.inProgressOfferRequests.length +
    data.inProgressNgoRequests.length +
    data.ongoingCampaignVolunteerAssignments.length

  const pendingCount =
    data.pendingOfferRequests.length +
    data.pendingNgoRequests.length +
    data.ongoingCampaignVolunteerAssignments.filter((item) => item.lifecycle === 'yet_to_start').length

  const attendanceReady = data.ongoingCampaignVolunteerAssignments.filter(
    (item) => item.lifecycle === 'started'
  ).length

  const actions = useMemo(() => {
    const items = []
    if (!verified) {
      items.push({
        id: 'verify',
        title: 'Complete account verification',
        detail: `Current status: ${verificationStatus}`,
        onClick: () => onNavigate('profile'),
        tone: 'attention' as const,
      })
    }
    if (data.pendingOfferRequests.length > 0) {
      items.push({
        id: 'offer-requests',
        title: `${data.pendingOfferRequests.length} capability request(s) awaiting your response`,
        detail: 'Review hire/apply requests on your capability offers.',
        onClick: () => onNavigate('capability-offers'),
        tone: 'attention' as const,
      })
    }
    if (data.pendingNgoRequests.length > 0) {
      items.push({
        id: 'ngo-pending',
        title: `${data.pendingNgoRequests.length} NGO need application(s) pending`,
        detail: 'Waiting for NGO acceptance.',
        onClick: () => onNavigate('ngo-requests'),
        tone: 'attention' as const,
      })
    }
    if (attendanceReady > 0) {
      items.push({
        id: 'attendance',
        title: `${attendanceReady} active CSR volunteer engagement(s)`,
        detail: 'Mark attendance in the GRAM Field App when on site.',
        onClick: () => onNavigate('csr-campaigns'),
        tone: 'attention' as const,
      })
    }
    return items
  }, [
    verified,
    verificationStatus,
    data.pendingOfferRequests.length,
    data.pendingNgoRequests.length,
    attendanceReady,
    onNavigate,
  ])

  const activity = useMemo(() => {
    const rows: Array<{ id: string; title: string; detail?: string; at?: string | null }> = []

    for (const offer of data.serviceOffers.slice(0, 3)) {
      const offerDates = offer as { updated_at?: string | null; created_at?: string | null }
      rows.push({
        id: `offer-${offer.id}`,
        title: `Capability: ${offer.title}`,
        detail: `Status ${formatStatusLabel(offer.status || 'active')}`,
        at: offerDates.updated_at || offerDates.created_at || null,
      })
    }
    for (const request of [...data.pendingOfferRequests, ...data.inProgressOfferRequests].slice(0, 3)) {
      rows.push({
        id: `oreq-${request.id}`,
        title: `Capability request · ${formatStatusLabel(request.status)}`,
        detail: request.offer_title || request.message || 'Capability engagement',
        at: request.assigned_at || request.accepted_at || null,
      })
    }
    for (const app of [...data.inProgressNgoRequests, ...data.pendingNgoRequests].slice(0, 3)) {
      rows.push({
        id: `ngo-${app.id}`,
        title: `Need application · ${formatStatusLabel(app.status)}`,
        detail: app.request?.title || 'NGO need',
      })
    }
    for (const assignment of data.ongoingCampaignVolunteerAssignments.slice(0, 3)) {
      rows.push({
        id: `csr-${assignment.id}`,
        title: `CSR volunteering · ${formatStatusLabel(assignment.lifecycle)}`,
        detail: assignment.campaign_title || 'Campaign assignment',
        at: assignment.attendance_summary?.last_attendance_at || assignment.applied_at || null,
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
        title="Your activity overview"
        description="What is active, pending, or needs attention across marketplace work, volunteering, and payments."
      />

      {loading ? (
        <DashboardEmptyNote>Loading your latest activity…</DashboardEmptyNote>
      ) : (
        <DashboardStatGrid
          items={[
            {
              label: 'Verification',
              value: verificationStatus,
              detail: verified ? 'Ready to participate' : 'Complete verification in Profile',
              tone: verified ? 'success' : 'attention',
            },
            {
              label: 'Active engagements',
              value: activeEngagements,
              detail: 'In-progress offers, NGO needs, and CSR volunteering',
            },
            {
              label: 'Awaiting action',
              value: pendingCount,
              detail: 'Pending requests, applications, or yet-to-start CSR work',
              tone: pendingCount > 0 ? 'attention' : 'default',
            },
            {
              label: 'Capabilities listed',
              value: data.serviceOffers.length,
              detail: `${data.historyOfferRequests.length} historical capability requests`,
            },
          ]}
        />
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-gram-border bg-white p-3 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Profile completeness</p>
          <p className="text-sm font-semibold tabular-nums text-slate-900">
            {profileBits.done} of {profileBits.total} basics
          </p>
          {meterPercent(profileBits.done, profileBits.total) != null ? (
            <Progress value={meterPercent(profileBits.done, profileBits.total) ?? 0} className="h-1.5" />
          ) : null}
          <p className="text-xs text-slate-600">Name, contact, photo, location, and verification</p>
        </div>
        <div className="rounded-md border border-gram-border bg-white p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">NGO need applications</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {data.inProgressNgoRequests.length} active · {data.pendingNgoRequests.length} pending
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {data.historyApplications.length} in history
          </p>
        </div>
        <div className="rounded-md border border-gram-border bg-white p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">CSR volunteering</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {data.ongoingCampaignVolunteerAssignments.length} ongoing
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {data.completedCampaignVolunteerAssignments.length} completed
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardSectionCard
          title="Action centre"
          description="Items that need your attention before work can progress."
        >
          <DashboardActionCentre items={actions} />
        </DashboardSectionCard>

        <DashboardSectionCard
          title="Recent activity"
          description="Latest updates from your offers, applications, and volunteering."
        >
          <DashboardActivityFeed items={activity} />
        </DashboardSectionCard>
      </div>

      <DashboardPaymentSnapshot
        roles={['received', 'sent']}
        title="Payment summary"
        description="Received and sent amounts from your ledger."
        detailHref="/individuals/dashboard?tab=payments"
      />

      <DashboardSectionCard title="Quick actions" description="Jump to the workspace section you need.">
        <DashboardQuickLinks
          links={[
            { href: '/individuals/dashboard?tab=capability-offers', label: 'Capability offers', detail: 'Manage listings and requests' },
            { href: '/individuals/dashboard?tab=ngo-requests', label: 'NGO requests', detail: 'Applications and engagements' },
            { href: '/individuals/dashboard?tab=csr-campaigns', label: 'CSR campaigns', detail: 'Volunteer assignments' },
            { href: '/individuals/dashboard?tab=payments', label: 'Payments', detail: 'Full ledger' },
            { href: '/individuals/dashboard?tab=profile', label: 'Profile', detail: 'Verification and payout' },
          ]}
        />
      </DashboardSectionCard>
    </div>
  )
}
