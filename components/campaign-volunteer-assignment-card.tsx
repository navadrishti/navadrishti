'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { formatDisplayDate, formatCampaignLeadLifecycleLabel, type CampaignLeadLifecycle } from '@/lib/format-date'
import { cn } from '@/lib/utils'
import { VerifiedAccountName } from '@/components/verification-badge'

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
  company_verification_status?: string | null
  company_verified?: boolean
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
}: {
  assignment: CampaignVolunteerAssignmentItem
}) {
  const daysPresent =
    assignment.attendance_summary?.days_attended ?? assignment.attendance_summary?.total_entries ?? 0
  const lifecycleProgress =
    assignment.lifecycle === 'completed'
      ? 100
      : assignment.lifecycle === 'started'
        ? Math.min(90, 40 + Number(daysPresent) * 8)
        : 20

  return (
    <div className="rounded-md border bg-white p-4">
      <div className="space-y-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{assignment.campaign_title}</p>
            <p className="flex flex-wrap items-center gap-1 text-sm text-slate-600">
              <span>Volunteer organisation / individual •</span>
              <VerifiedAccountName
                name={assignment.company_name || 'Company'}
                status={assignment.company_verification_status}
                verified={assignment.company_verified}
                size="xs"
                nameClassName="font-medium text-slate-800"
              />
            </p>
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

        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/80 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Assignment progress</p>
            <p className="text-xs tabular-nums text-slate-600">{lifecycleProgress}%</p>
          </div>
          <Progress value={lifecycleProgress} className="h-1.5" />
          <p className="text-xs text-slate-600">
            {assignment.lifecycle === 'yet_to_start'
              ? 'Campaign has not started yet. Attendance unlocks when the campaign window begins.'
              : assignment.lifecycle === 'started'
                ? 'Campaign is live. Mark sealed present days in the GRAM App.'
                : 'Campaign assignment is complete.'}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Campaign schedule</p>
            <p className="mt-1 font-medium text-slate-900">
              {formatDisplayDate(assignment.start_date) || 'Start TBD'} → {formatDisplayDate(assignment.end_date) || 'End TBD'}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {assignment.campaign_category || 'Category not set'} · {assignment.campaign_location || 'Location not set'}
            </p>
            <p className="mt-2 text-xs text-slate-600">
              Status: {formatCampaignLeadLifecycleLabel(assignment.lifecycle)}. Attendance is recorded in the GRAM App.
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Attendance</p>
            <p className="mt-1 font-medium tabular-nums text-slate-900">
              {daysPresent} day(s) marked present
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Declared participants {Math.max(1, Number(assignment.volunteer_capacity) || 1)} · last check-in{' '}
              {formatDisplayDate(assignment.attendance_summary?.last_attendance_at) || 'none yet'} · sealed
              present days only
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Organisation volunteers check in once per day for the declared headcount in GRAM — team members do not need individual accounts.
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild variant="outline" size="sm">
            <Link href={`/csr-campaigns/${assignment.campaign_id}`}>View Campaign</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
