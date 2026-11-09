'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatDisplayDate } from '@/lib/format-date'
import type { CAReviewHistoryEntry } from '@/lib/ca-review/history-types'

const KIND_LABEL: Record<CAReviewHistoryEntry['kind'], string> = {
  verification: 'First verification',
  resubmission: 'Resubmission after a previous decision',
  reverification: 'Reverification while already verified',
}

const TYPE_LABEL: Record<CAReviewHistoryEntry['entity_type'], string> = {
  individuals: 'Individual',
  companies: 'Company',
  ngos: 'NGO',
}

export function CAReviewHistoryFeed({
  entries,
  loading,
}: {
  entries: CAReviewHistoryEntry[]
  loading: boolean
}) {
  if (loading) {
    return <p className="text-sm text-slate-500">Loading your review history…</p>
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-slate-500">
          No review history yet. Approved and rejected accounts will appear here, including later
          resubmissions and reverifications.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const approved = entry.action === 'approve'
        return (
          <Card key={`${entry.user_id}-${entry.at}-${entry.action}-${entry.attempt}`}>
            <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-medium text-slate-900">{entry.stakeholder_name}</p>
                <p className="text-xs text-slate-500">
                  {TYPE_LABEL[entry.entity_type]} · {KIND_LABEL[entry.kind]}
                  {entry.attempt > 1 ? ` · review ${entry.attempt}` : ''}
                </p>
                {entry.reason ? <p className="text-xs text-slate-600">Reason: {entry.reason}</p> : null}
                {entry.badge ? <p className="text-xs text-slate-600">Badge {entry.badge}</p> : null}
              </div>
              <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                <Badge
                  variant="outline"
                  className={
                    approved
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }
                >
                  {approved ? 'Approved' : 'Rejected'}
                </Badge>
                <span className="text-xs text-slate-400">{formatDisplayDate(entry.at)}</span>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
