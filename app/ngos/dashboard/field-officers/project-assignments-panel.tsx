'use client'

import { formatStatusLabel } from '@/lib/format-date'
import { InfoMeter, InfoMeterGrid, meterPercent } from '@/components/info-meter'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { assignmentProject, formatLockWhen } from './types'
import type { FieldOfficersState } from './use-field-officers'

function isAssignmentLocked(row: {
  assignment_editable?: boolean
  assignment_lock?: { locked?: boolean } | null
}) {
  return row.assignment_editable === false || row.assignment_lock?.locked === true
}

function isProjectAssignLocked(project: {
  assignment_editable?: boolean
  assignment_lock?: { locked?: boolean } | null
}) {
  return project.assignment_editable === false || project.assignment_lock?.locked === true
}

export function FieldOfficerProjectAssignmentsPanel({ fo }: { fo: FieldOfficersState }) {
  const {
    assignmentMetrics,
    filteredAssignments,
    assignmentsLoading,
    assignmentsError,
    filteredEligibleProjects,
    eligibleLoading,
    eligibleError,
    projectSearch,
    setProjectSearch,
    assignmentStatusFilter,
    setAssignmentStatusFilter,
    selectedProjectIds,
    toggleProjectSelection,
    assigningProjects,
    assignSelectedProjects,
    mutatingAssignmentId,
    updateAssignmentStatus,
    fetchEligibleProjects,
    selectedId,
    fetchAssignments,
  } = fo

  if (!selectedId) return null

  const activeAssignments = filteredAssignments.filter(
    (row) => String(row.status).toLowerCase() === 'active'
  )
  const lockedIn =
    activeAssignments.length > 0 && activeAssignments.every((row) => isAssignmentLocked(row))
  const assignableProjects = filteredEligibleProjects.filter(
    (project) => !isProjectAssignLocked(project)
  )

  return (
    <section className="space-y-4 rounded-md border border-slate-200 bg-white p-3 lg:col-span-2">
      <div>
        <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Project assignments
        </h5>
        <p className="mt-1 text-xs text-slate-600">
          Field Officers can access only CSR projects you explicitly assign here. Assignment editing
          locks 48 hours before each project&apos;s scheduled start (Asia/Kolkata; start-of-day when
          only a date is stored).
        </p>
      </div>

      <InfoMeterGrid className="md:grid-cols-3">
        <InfoMeter
          title="Assigned projects"
          value={String(assignmentMetrics.total)}
          detail="Active and inactive assignment rows for this officer."
        />
        <InfoMeter
          title="Active access"
          value={String(assignmentMetrics.active)}
          progress={meterPercent(assignmentMetrics.active, assignmentMetrics.total)}
          detail={
            assignmentMetrics.total > 0
              ? `${assignmentMetrics.active} of ${assignmentMetrics.total} assignments currently grant field access.`
              : 'No projects assigned yet.'
          }
        />
        <InfoMeter
          title="Inactive"
          value={String(assignmentMetrics.inactive)}
          detail="Deactivated assignments are retained for history and can be reactivated when eligible."
        />
      </InfoMeterGrid>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <h6 className="text-sm font-semibold text-slate-900">Current assignments</h6>
            <select
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs"
              value={assignmentStatusFilter}
              onChange={(e) =>
                setAssignmentStatusFilter(e.target.value as typeof assignmentStatusFilter)
              }
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {assignmentsLoading ? (
            <div className="space-y-2">
              <div className="h-10 animate-pulse rounded bg-slate-200" />
              <div className="h-10 animate-pulse rounded bg-slate-200" />
            </div>
          ) : assignmentsError ? (
            <div className="space-y-2 text-sm text-rose-700">
              <p>{assignmentsError}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void fetchAssignments(selectedId)}
              >
                Try again
              </Button>
            </div>
          ) : filteredAssignments.length === 0 ? (
            <p className="text-sm text-slate-600">
              No project assignments yet. Select eligible projects on the right to grant field access.
            </p>
          ) : (
            <ul className="space-y-2">
              {filteredAssignments.map((row) => {
                const project = assignmentProject(row)
                const active = String(row.status).toLowerCase() === 'active'
                const locked = isAssignmentLocked(row)
                return (
                  <li
                    key={row.id}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium text-slate-900">
                          {project?.title || 'Project unavailable'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {project?.start_date
                            ? `Start: ${project.start_date}`
                            : 'No scheduled start date'}
                          {project?.region ? ` · ${project.region}` : ''}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Badge
                            variant="outline"
                            className={
                              active
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-slate-200 bg-slate-50 text-slate-700'
                            }
                          >
                            {active ? 'Assignment active' : 'Assignment inactive'}
                          </Badge>
                          {locked ? (
                            <Badge
                              variant="outline"
                              className="border-amber-200 bg-amber-50 text-amber-900"
                            >
                              Locked
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-emerald-200 bg-emerald-50 text-emerald-800"
                            >
                              Editable
                            </Badge>
                          )}
                        </div>
                        {row.assignment_lock?.lockAt ? (
                          <p className="mt-1 text-xs text-slate-500">
                            Lock{locked ? 'ed' : 's'} at {formatLockWhen(row.assignment_lock.lockAt)}{' '}
                            (Asia/Kolkata)
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-slate-500">
                            No assignment lock (project has no valid start date).
                          </p>
                        )}
                      </div>
                      {!locked ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={mutatingAssignmentId === row.id}
                          onClick={() =>
                            void updateAssignmentStatus(row.id, active ? 'inactive' : 'active')
                          }
                        >
                          {active ? 'Remove' : 'Reactivate'}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {lockedIn ? (
          <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/70 p-3">
            <h6 className="text-sm font-semibold text-amber-950">Assignment locked</h6>
            <p className="text-xs text-amber-900/80">
              This Field Officer is locked into their active project assignment. Select project and
              remove controls are hidden until the lock window no longer applies.
            </p>
          </div>
        ) : (
          <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h6 className="text-sm font-semibold text-slate-900">Assign eligible projects</h6>
                <p className="mt-0.5 text-xs text-slate-600">
                  Only CSR projects owned by your NGO in planning, active, on-hold, or in-progress
                  status can be newly assigned.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void fetchEligibleProjects()}
                disabled={eligibleLoading}
              >
                Refresh
              </Button>
            </div>

            <div className="space-y-1">
              <Label htmlFor="fo-project-search">Search projects</Label>
              <Input
                id="fo-project-search"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder="Title, status, or region"
              />
            </div>

            {eligibleLoading ? (
              <div className="space-y-2">
                <div className="h-10 animate-pulse rounded bg-slate-200" />
                <div className="h-10 animate-pulse rounded bg-slate-200" />
              </div>
            ) : eligibleError ? (
              <p className="text-sm text-rose-700">{eligibleError}</p>
            ) : assignableProjects.length === 0 ? (
              <p className="text-sm text-slate-600">
                No eligible projects available to assign. Completed, cancelled, or locked projects are
                excluded.
              </p>
            ) : (
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {assignableProjects.map((project) => {
                  const checked = selectedProjectIds.includes(project.id)
                  return (
                    <li key={project.id}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm transition hover:border-slate-300 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-slate-300"
                          checked={checked}
                          onChange={() => toggleProjectSelection(project.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-slate-900">{project.title}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {project.start_date
                              ? `Starts ${project.start_date}`
                              : 'No start date'}
                            {project.region ? ` · ${project.region}` : ''}
                            {` · ${formatStatusLabel(project.project_status)}`}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}

            <Button
              type="button"
              size="sm"
              disabled={assigningProjects || selectedProjectIds.length === 0}
              onClick={() => void assignSelectedProjects()}
            >
              {assigningProjects
                ? 'Assigning…'
                : `Assign ${selectedProjectIds.length || ''} selected`.trim()}
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
