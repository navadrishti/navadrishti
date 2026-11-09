'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { InlineSkillServiceFulfillment } from '@/components/engagement-fulfillment'
import { formatDisplayDate } from '@/lib/format-date'
import {
  getOfferEngagementOverview,
  offerRequestDetailHref,
  toOfferRentalApplication,
  type OfferRequestItem,
} from '@/lib/offer-requests'

function OverviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="truncate text-sm font-medium text-slate-800">{value || 'Not set'}</p>
    </div>
  )
}

export function OfferEngagementOverview({
  request,
  onUpdated,
  interactive = true,
  perspective = 'offering',
  counterpartyName,
}: {
  request: OfferRequestItem
  onUpdated?: () => void | Promise<void>
  interactive?: boolean
  perspective?: 'offering' | 'applying'
  counterpartyName?: string
}) {
  const overview = getOfferEngagementOverview(request, { perspective, counterpartyName })
  const lastAttendance = formatDisplayDate(overview.lastAttendanceAt) || 'None yet'

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-3">
        <OverviewField label="Assigned" value={formatDisplayDate(overview.assignedAt) || 'Not set'} />
        <OverviewField label="Billing" value={overview.billingLabel} />
        <OverviewField label="Amount" value={overview.amountLabel} />
        <OverviewField label="Payment status" value={overview.paymentStatusLabel} />
        <OverviewField label="Paying" value={overview.payerLabel} />
        <OverviewField label="Receiving" value={overview.payeeLabel} />
        <OverviewField label="Days present" value={String(overview.daysPresent)} />
        <OverviewField
          label="Last attendance"
          value={overview.todayPresent && lastAttendance !== 'None yet' ? `${lastAttendance} · today` : lastAttendance}
        />
        {overview.attendanceSourceLabel ? (
          <OverviewField label="Attendance source" value={overview.attendanceSourceLabel} />
        ) : (
          <OverviewField
            label="Attendance source"
            value={overview.isDailyRental ? 'GRAM App · daily delivery' : 'GRAM App'}
          />
        )}
        <OverviewField
          label="Delivery"
          value={overview.showDelivery ? overview.deliveryStatusLabel : 'Not started'}
        />
      </div>

      {overview.linkedNeeds.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-500">Linked need</p>
          <div className="flex flex-wrap gap-2">
            {overview.linkedNeeds.map((need) => (
              need.href ? (
                <Link
                  key={`${need.id}-${need.label}`}
                  href={need.href}
                  className="text-sm font-medium text-slate-800 underline-offset-4 hover:underline"
                >
                  {need.label}
                </Link>
              ) : (
                <span key={`${need.id}-${need.label}`} className="text-sm font-medium text-slate-800">
                  {need.label}
                </span>
              )
            ))}
          </div>
        </div>
      ) : null}

      {overview.applicationNote ? (
        <p className="break-words text-sm text-slate-600">{overview.applicationNote}</p>
      ) : null}

      {interactive && overview.isDailyRental && onUpdated ? (
        <InlineSkillServiceFulfillment
          application={toOfferRentalApplication(request)}
          role={perspective === 'applying' ? 'payer' : 'payee'}
          title="Capability offer rental"
          onUpdated={onUpdated}
        />
      ) : null}

      <Button size="sm" variant="outline" asChild>
        <Link href={offerRequestDetailHref(request)}>Open Detail</Link>
      </Button>
    </div>
  )
}
