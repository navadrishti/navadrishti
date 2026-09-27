import { formatDisplayDate } from "@/lib/format-date"
import { ProfileSection } from "./profile-fields"
import type { VolunteeringHistoryEntry } from "./types"

interface VolunteeringHistorySectionProps {
  history?: VolunteeringHistoryEntry[]
  showTeamCapacity?: boolean
}

export function VolunteeringHistorySection({ history, showTeamCapacity = false }: VolunteeringHistorySectionProps) {
  return (
    <ProfileSection
      title="Volunteering History"
      empty={!Array.isArray(history) || history.length === 0}
    >
      <div className="space-y-3">
        {(history || []).map((entry) => (
          <div
            key={entry.campaign_id}
            className="rounded-lg border border-slate-200 bg-slate-50 p-4"
          >
            <p className="font-medium text-slate-900">{entry.campaign_title}</p>
            <p className="mt-1 text-sm text-slate-600">
              Attended {entry.days_present} of {entry.project_days} project days
              {entry.attendance_rate != null ? ` (${entry.attendance_rate}%)` : ''}
              {showTeamCapacity && entry.capacity && entry.capacity > 1
                ? ` · Team capacity ×${entry.capacity}`
                : ''}
            </p>
            {(entry.start_date || entry.end_date) && (
              <p className="mt-1 text-xs text-slate-500">
                {formatDisplayDate(entry.start_date) || '—'} →{' '}
                {formatDisplayDate(entry.end_date) || '—'}
              </p>
            )}
          </div>
        ))}
      </div>
    </ProfileSection>
  )
}
