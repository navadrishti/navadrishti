'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDisplayDate, formatCampaignLeadLifecycleLabel, type CampaignLeadLifecycle } from '@/lib/format-date'

export interface CampaignVolunteerAssignmentItem {
  id: string
  campaign_id: string
  campaign_title: string
  campaign_location?: string
  campaign_category?: string
  campaign_status?: string
  start_date?: string | null
  end_date?: string | null
  lifecycle: CampaignLeadLifecycle
  volunteer_capacity?: number
  company_name?: string
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
              <Badge variant="outline" className={alreadyMarkedToday ? 'border-green-300 bg-green-50 text-green-700' : 'border-amber-300 bg-amber-50 text-amber-700'}>
                {alreadyMarkedToday ? 'Marked' : 'Pending'}
              </Badge>
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

      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-semibold">{assignment.campaign_title}</p>
          <p className="text-sm text-muted-foreground">Volunteer • {assignment.company_name || 'Company'}</p>
          <p className="text-xs text-muted-foreground">{assignment.campaign_location || 'Location not set'}</p>
        </div>
        <Badge variant="outline" className={`w-fit ${getLifecycleBadgeClass(assignment.lifecycle)}`}>
          {formatCampaignLeadLifecycleLabel(assignment.lifecycle)}
        </Badge>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-2">
        <p>Category: {assignment.campaign_category || 'Not set'}</p>
        <p>
          Timeline: {formatDisplayDate(assignment.start_date) || 'Start TBD'} → {formatDisplayDate(assignment.end_date) || 'End TBD'}
        </p>
      </div>

      <div className="mt-3">
        <Button asChild variant="outline" size="sm">
          <Link href={`/csr-campaigns/${assignment.campaign_id}`}>View Campaign</Link>
        </Button>
      </div>
    </div>
  )
}
