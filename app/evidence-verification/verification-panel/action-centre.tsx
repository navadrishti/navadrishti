'use client'

import Link from 'next/link'
import {
  DashboardActionCentre,
  DashboardSectionCard,
  DashboardStatGrid,
} from '@/components/dashboard-overview'
import { formatMeterInr } from '@/components/info-meter'
import { pendingItemAmount } from './helpers'
import type { MilestonePaymentItem, PendingEvidenceItem, PendingPaymentItem } from './types'

export function CaActionCentre({
  pendingEvidenceItems,
  pendingMilestonePayments,
  pendingOfferPayments,
  projectCount,
}: {
  pendingEvidenceItems: PendingEvidenceItem[]
  pendingMilestonePayments: MilestonePaymentItem[]
  pendingOfferPayments: PendingPaymentItem[]
  projectCount: number
}) {
  const evidenceCount = pendingEvidenceItems.length
  const milestoneCount = pendingMilestonePayments.length
  const offerCount = pendingOfferPayments.length
  const offerTotal = pendingOfferPayments.reduce((sum, item) => sum + pendingItemAmount(item), 0)

  const actions = [
    ...(evidenceCount > 0
      ? [
          {
            id: 'evidence',
            title: `${evidenceCount} milestone evidence item(s) awaiting review`,
            detail: pendingEvidenceItems[0]
              ? `Next: ${pendingEvidenceItems[0].milestoneTitle}`
              : 'Open the first submitted milestone',
            href: `/evidence-verification/review/${pendingEvidenceItems[0].milestoneId}`,
            tone: 'attention' as const,
          },
        ]
      : []),
    ...(milestoneCount > 0
      ? [
          {
            id: 'milestone-pay',
            title: `${milestoneCount} approved milestone payment(s) outstanding`,
            detail: 'Confirm payment only after evidence review is complete.',
            tone: 'attention' as const,
          },
        ]
      : []),
    ...(offerCount > 0
      ? [
          {
            id: 'offer-pay',
            title: `${offerCount} offer/attendance payment item(s) pending`,
            detail: `About ${formatMeterInr(offerTotal)} across pending settlement groups`,
            tone: 'attention' as const,
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-4">
      <DashboardStatGrid
        className="xl:grid-cols-4"
        items={[
          {
            label: 'Projects in scope',
            value: projectCount,
            detail: 'Active CSR projects available for this CA',
          },
          {
            label: 'Evidence to review',
            value: evidenceCount,
            detail: 'Milestones with status submitted',
            tone: evidenceCount > 0 ? 'attention' : 'success',
          },
          {
            label: 'Milestone payments',
            value: milestoneCount,
            detail: 'Approved work awaiting payment confirmation',
            tone: milestoneCount > 0 ? 'attention' : 'default',
          },
          {
            label: 'Offer settlements',
            value: offerCount,
            detail: offerCount > 0 ? formatMeterInr(offerTotal) : 'No pending offer payments',
            tone: offerCount > 0 ? 'attention' : 'default',
          },
        ]}
      />

      <DashboardSectionCard
        title="Action centre"
        description="Pending review and payment work for this company scope. Expense and material approvals are in Project ops review below."
        action={
          <Link href="/evidence-verification/history" className="text-sm font-medium text-udaan-blue hover:underline">
            Review history
          </Link>
        }
      >
        <DashboardActionCentre
          items={actions}
          emptyMessage="No pending evidence or payment actions right now. Use Project ops review for expense and material queues."
        />
      </DashboardSectionCard>
    </div>
  )
}
