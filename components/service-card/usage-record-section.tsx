import Link from 'next/link'
import { formatDisplayDate } from '@/lib/format-date'
import { formatNeedLabel } from '@/lib/service-offers/formatting'
import type { CapabilityOfferUsageRecord } from '@/lib/service-offers/types'
import {
  dedupeSelectedNeedSummaries,
  getUsageEngagementOverview,
} from '@/lib/service-offers/usage-records'
import { DetailItem } from './detail-item'

function applicationNote(message?: string | null) {
  const trimmed = String(message || '').trim()
  if (!trimmed) return null
  if (/^applying for:/i.test(trimmed)) return null
  return trimmed
}

export function UsageRecordSection({
  usage,
}: {
  usage: CapabilityOfferUsageRecord
}) {
  const overview = getUsageEngagementOverview(usage)
  const needs = dedupeSelectedNeedSummaries(Array.isArray(usage.selected_needs) ? usage.selected_needs : [], 3)
  const note = applicationNote(usage.message)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <DetailItem
          label="Used by"
          value={
            usage.client_name
              ? `${usage.client_name}${usage.client_type ? ` (${usage.client_type})` : ''}`
              : 'Unknown'
          }
        />
        <DetailItem label="Assigned on" value={formatDisplayDate(usage.assigned_at) || 'Not set'} />
        {usage.completed_at ? (
          <DetailItem label="Completed on" value={formatDisplayDate(usage.completed_at)} />
        ) : null}
        <DetailItem label="Billing" value={overview.billingLabel} />
        <DetailItem label="Amount" value={overview.amountLabel} />
        <DetailItem label="Payment status" value={overview.paymentStatusLabel} />
        <DetailItem label="Paying" value={overview.payerLabel} />
        <DetailItem label="Receiving" value={overview.payeeLabel} />
        <DetailItem label="Days present" value={String(overview.daysPresent)} />
        <DetailItem
          label="Last attendance"
          value={formatDisplayDate(overview.lastAttendanceAt) || 'None yet'}
        />
        {overview.attendanceSourceLabel ? (
          <DetailItem label="Attendance source" value={overview.attendanceSourceLabel} />
        ) : (
          <DetailItem
            label="Attendance source"
            value={overview.isDailyRental ? 'GRAM App · daily delivery' : 'GRAM App'}
          />
        )}
        <DetailItem
          label="Delivery"
          value={overview.showDelivery ? overview.deliveryStatusLabel : 'Not started'}
        />
        {usage.fulfilled_quantity != null && Number(usage.fulfilled_quantity) > 0 ? (
          <DetailItem
            label="Quantity fulfilled"
            value={String(usage.fulfilled_quantity)}
          />
        ) : null}
      </div>

      {needs.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-500">Linked need</p>
          <div className="flex flex-wrap gap-2">
            {needs.map((need) => {
              const requestId = Number(need.service_request_id)
              const label = formatNeedLabel(need)
              if (!(requestId > 0)) {
                return <span key={need.id} className="text-sm font-medium text-slate-800">{label}</span>
              }
              return (
                <Link
                  key={need.id}
                  href={`/service-requests/${requestId}`}
                  className="text-sm font-medium text-slate-800 underline-offset-4 hover:underline"
                >
                  {label}
                </Link>
              )
            })}
          </div>
        </div>
      ) : usage.linked_service_request_id ? (
        <DetailItem
          label="Linked need"
          value={`Need #${usage.linked_service_request_id}`}
        />
      ) : null}

      {note ? (
        <p className="text-sm text-slate-600 break-words">{note}</p>
      ) : null}
    </div>
  )
}
