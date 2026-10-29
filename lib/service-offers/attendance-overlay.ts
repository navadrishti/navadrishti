import { parseJsonObject } from '@/lib/utils'
import { summarizeServiceAttendanceEntries } from '@/lib/service-request-allocation/skill-service'

export function overlayLiveAttendanceSummary(
  meta: Record<string, unknown>,
  entries: Parameters<typeof summarizeServiceAttendanceEntries>[0]
): Record<string, unknown> {
  const rows = Array.isArray(entries) ? entries : []
  if (rows.length === 0) return meta

  const live = summarizeServiceAttendanceEntries(rows)
  const stored = parseJsonObject(meta.attendance_summary)
  return {
    ...meta,
    attendance_summary: {
      ...stored,
      days_attended: live.days_attended,
      total_entries: live.total_entries,
      last_attendance_at: live.last_attendance_at || stored.last_attendance_at || null,
      source: live.source || stored.source || stored.last_source || null,
      total_due: live.total_due > 0 ? live.total_due : stored.total_due,
      paid_total: live.paid_total > 0 ? live.paid_total : stored.paid_total,
    },
  }
}
