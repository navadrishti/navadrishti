import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDisplayDate } from '@/lib/format-date'
import {
  dedupeSelectedNeedSummaries,
  formatNeedLabel,
  formatOfferInrAmount,
  formatUsageStatusLabel,
  type CapabilityOfferUsageRecord,
} from '@/lib/service-offers'
import { DetailItem } from './detail-item'

export function UsageRecordSection({ usage }: { usage: CapabilityOfferUsageRecord }) {
  const needs = dedupeSelectedNeedSummaries(Array.isArray(usage.selected_needs) ? usage.selected_needs : [], 3)
  const trackHref = usage.assignment_id
    ? `/service-request-assignments/${usage.assignment_id}`
    : usage.linked_service_request_id
      ? `/service-requests/${usage.linked_service_request_id}`
      : null

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/80 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-slate-900">Usage details</p>
        <Badge variant="outline" className="capitalize">
          {formatUsageStatusLabel(usage.status)}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <DetailItem
          label="Used by"
          value={
            usage.client_name
              ? `${usage.client_name}${usage.client_type ? ` (${usage.client_type})` : ''}`
              : 'Unknown'
          }
        />
        {usage.assigned_at ? (
          <DetailItem label="Assigned on" value={formatDisplayDate(usage.assigned_at)} />
        ) : null}
        {usage.completed_at ? (
          <DetailItem label="Completed on" value={formatDisplayDate(usage.completed_at)} />
        ) : null}
        {usage.billing_cycle || usage.payment_mode ? (
          <DetailItem
            label="Billing"
            value={`${usage.billing_cycle || 'one_time'} · ${usage.payment_mode || 'prepaid'}`}
          />
        ) : null}
        {usage.payment_amount_inr != null || usage.fulfilled_amount != null ? (
          <DetailItem
            label="Amount"
            value={
              usage.fulfilled_amount != null && Number(usage.fulfilled_amount) > 0
                ? `${formatOfferInrAmount(usage.fulfilled_amount)} fulfilled`
                : `${formatOfferInrAmount(usage.payment_amount_inr)}${usage.payment_required ? ' · due' : ''}`
            }
          />
        ) : null}
        {usage.fulfilled_quantity != null && Number(usage.fulfilled_quantity) > 0 ? (
          <DetailItem
            label="Quantity fulfilled"
            value={String(usage.fulfilled_quantity)}
          />
        ) : null}
      </div>

      {needs.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">Linked needs</p>
          <div className="flex flex-wrap gap-2">
            {needs.map((need) => (
              <Link key={need.id} href={`/service-requests/${need.service_request_id ?? need.id}`}>
                <Badge
                  variant="secondary"
                  className="border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                >
                  {formatNeedLabel(need)}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      ) : usage.linked_service_request_id ? (
        <DetailItem
          label="Linked need"
          value={`Need #${usage.linked_service_request_id}`}
        />
      ) : null}

      {usage.is_daily_rental ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
          <p className="text-sm font-medium text-emerald-950">Daily rental payment</p>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <p>
              Daily rate:{' '}
              <span className="font-medium">{formatOfferInrAmount(usage.payment_amount_inr)}</span>
            </p>
            <p>
              Days present: <span className="font-medium">{usage.days_present ?? 0}</span>
            </p>
            <p>
              Cumulative due:{' '}
              <span className="font-medium">{formatOfferInrAmount(usage.cumulative_due)}</span>
            </p>
          </div>
          {usage.settled_amount != null && Number(usage.settled_amount) >= 0 ? (
            <p className="text-xs font-medium text-emerald-800">
              Settled · {formatOfferInrAmount(usage.settled_amount)}
              {usage.settlement_mode ? ` (${usage.settlement_mode})` : ''}
            </p>
          ) : usage.cumulative_due != null && Number(usage.cumulative_due) > 0 ? (
            <p className="text-xs text-slate-600">
              Outstanding: {formatOfferInrAmount(Number(usage.cumulative_due) - Number(usage.paid_total || 0))}
            </p>
          ) : null}
        </div>
      ) : null}

      {usage.message ? (
        <p className="text-sm text-slate-600 break-words">{usage.message}</p>
      ) : null}

      {trackHref ? (
        <Button size="sm" variant="outline" asChild>
          <Link href={trackHref}>Track engagement</Link>
        </Button>
      ) : null}
    </div>
  )
}
