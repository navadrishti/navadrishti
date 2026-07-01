'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { formatDisplayDate, formatCampaignLeadLifecycleLabel, type CampaignLeadLifecycle } from '@/lib/format-date'
import { cn } from '@/lib/utils'

export interface CampaignVolunteerAssignmentItem {
  id: string
  campaign_id: string
  campaign_title: string
  campaign_description?: string
  campaign_location?: string
  campaign_category?: string
  campaign_status?: string
  start_date?: string | null
  end_date?: string | null
  lifecycle: CampaignLeadLifecycle
  volunteer_capacity?: number
  company_name?: string
  company_email?: string
  applied_at?: string | null
  assignment_id?: string | null
  attendance_summary?: {
    last_attendance_at?: string | null
    days_attended?: number
    total_entries?: number
  }
}

function getLifecycleBadgeClass(lifecycle: CampaignLeadLifecycle) {
  if (lifecycle === 'yet_to_start') return 'border-amber-300 bg-amber-50 text-amber-700'
  if (lifecycle === 'started') return 'border-blue-300 bg-blue-50 text-blue-700'
  return 'border-green-300 bg-green-50 text-green-700'
}

function getCampaignStatusBadgeClass(status: string) {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'published' || normalized === 'active') return 'border-green-300 bg-green-50 text-green-700'
  if (normalized === 'draft') return 'border-amber-300 bg-amber-50 text-amber-700'
  return 'border-slate-300 bg-white text-slate-700'
}

function formatCampaignStatusLabel(status: string) {
  const normalized = String(status || '').trim().toLowerCase()
  if (!normalized) return 'Unknown'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function StaticStatusBadge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold pointer-events-none select-none',
        className
      )}
    >
      {children}
    </span>
  )
}

export function CampaignVolunteerAssignmentCard({
  assignment,
  today,
  markingAttendanceId,
  onMarkAttendance,
}: {
  assignment: CampaignVolunteerAssignmentItem
  today: string
  markingAttendanceId: string | null
  onMarkAttendance: (assignment: CampaignVolunteerAssignmentItem) => void
}) {
  const attendanceSummary = assignment.attendance_summary || {}
  const alreadyMarkedToday = String(attendanceSummary.last_attendance_at || '') === today
  const attendanceCount = Number(assignment.volunteer_capacity || 1) || 1
  const canMarkAttendance = assignment.lifecycle === 'started' && Boolean(assignment.assignment_id)

  return (
    <div className="rounded-md border bg-white p-4">
      {canMarkAttendance ? (
        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="font-medium text-slate-900">Self attendance</p>
              <p className="text-sm text-slate-600">
                {alreadyMarkedToday
                  ? `Marked today${attendanceCount > 1 ? ` for ${attendanceCount} people` : ''}`
                  : 'Share your location to record today\'s attendance.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StaticStatusBadge className={alreadyMarkedToday ? 'border-green-300 bg-green-50 text-green-700' : 'border-amber-300 bg-amber-50 text-amber-700'}>
                {alreadyMarkedToday ? 'Marked' : 'Pending'}
              </StaticStatusBadge>
              <Button
                size="sm"
                onClick={() => onMarkAttendance(assignment)}
                disabled={alreadyMarkedToday || markingAttendanceId === String(assignment.assignment_id || '')}
              >
                {markingAttendanceId === String(assignment.assignment_id || '') ? 'Marking…' : 'Mark Attendance'}
              </Button>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-500 md:grid-cols-3">
            <p>Counts as: {attendanceCount} {attendanceCount === 1 ? 'person' : 'people'}</p>
            <p>Last marked: {attendanceSummary.last_attendance_at || 'Not yet'}</p>
            <p>Days attended: {attendanceSummary.days_attended ?? attendanceSummary.total_entries ?? 0}</p>
          </div>
        </div>
      ) : assignment.lifecycle === 'yet_to_start' ? (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Attendance will open once the campaign starts.
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{assignment.campaign_title}</p>
            <p className="text-sm text-slate-600">Volunteer • {assignment.company_name || 'Company'}</p>
            <p className="text-xs text-slate-500">
              {assignment.company_email || 'No email'}
              {assignment.applied_at ? ` • Joined ${formatDisplayDate(assignment.applied_at)}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <StaticStatusBadge className={getLifecycleBadgeClass(assignment.lifecycle)}>
              {formatCampaignLeadLifecycleLabel(assignment.lifecycle)}
            </StaticStatusBadge>
            {assignment.campaign_status ? (
              <StaticStatusBadge className={getCampaignStatusBadgeClass(assignment.campaign_status)}>
                Campaign: {formatCampaignStatusLabel(assignment.campaign_status)}
              </StaticStatusBadge>
            ) : null}
          </div>
        </div>

        {assignment.campaign_description ? (
          <p className="text-sm text-muted-foreground line-clamp-3">{assignment.campaign_description}</p>
        ) : null}

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Category</p>
            <p className="font-medium text-slate-800">{assignment.campaign_category || 'Not set'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Location</p>
            <p className="font-medium text-slate-800">{assignment.campaign_location || 'Not set'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Timeline</p>
            <p className="font-medium text-slate-800">
              {formatDisplayDate(assignment.start_date) || 'Start TBD'} → {formatDisplayDate(assignment.end_date) || 'End TBD'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild variant="outline" size="sm">
            <Link href={`/csr-campaigns/${assignment.campaign_id}`}>View Campaign</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
