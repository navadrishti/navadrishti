'use client'

import { formatStatusLabel } from '@/lib/format-date'
import { InfoMeter, InfoMeterGrid } from '@/components/info-meter'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { KeyRound, Power, RefreshCw, UserRound } from 'lucide-react'
import type { FieldOfficersState } from './use-field-officers'
import { FieldOfficerResetPasswordDialog } from './reset-password-dialog'
import { FieldOfficerProjectAssignmentsPanel } from './project-assignments-panel'
import {
  assignmentProject,
  formatLockWhen,
  formatOfficerActivityLabel,
  officerDisplayName,
  officerEmail,
  type EligibleFieldProject,
  type FieldOfficerProjectAssignment,
} from './types'

function isAssignmentLocked(
  row: Pick<FieldOfficerProjectAssignment, 'assignment_editable' | 'assignment_lock'>
) {
  return row.assignment_editable === false || row.assignment_lock?.locked === true
}

function isProjectAssignLocked(
  project: Pick<EligibleFieldProject, 'assignment_editable' | 'assignment_lock'>
) {
  return project.assignment_editable === false || project.assignment_lock?.locked === true
}

function formatWhen(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function PasswordBadge({ required }: { required: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        required
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }
    >
      {required ? 'Password change required' : 'Password configured'}
    </Badge>
  )
}

function StatusBadge({ status }: { status: string }) {
  const active = String(status).toLowerCase() === 'active'
  return (
    <Badge
      variant="outline"
      className={
        active
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-slate-200 bg-slate-50 text-slate-700'
      }
    >
      {active ? 'Active' : formatStatusLabel(status || 'inactive')}
    </Badge>
  )
}

export function FieldOfficersTab({ fo }: { fo: FieldOfficersState }) {
  const {
    metrics,
    filteredOfficers,
    loading,
    loadError,
    creating,
    mutatingId,
    form,
    setForm,
    formError,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    passwordFilter,
    setPasswordFilter,
    selectedId,
    setSelectedId,
    detail,
    detailLoading,
    detailError,
    editName,
    setEditName,
    verified,
    fetchOfficers,
    createOfficer,
    updateStatus,
    saveProfile,
    openResetDialog,
    eligibleProjects,
    assignmentsByOfficer = {},
    assignDraftByOfficer = {},
    setAssignDraftByOfficer,
    saveAssignmentDraft,
    assigningProjects,
    updateAssignmentStatus,
    mutatingAssignmentId,
  } = fo

  if (!verified) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Verification required</p>
        <p className="mt-1">
          Complete NGO identity verification before creating or managing Field Officer accounts. The
          management API only accepts verified NGO main accounts.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pt-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Field Officers</h3>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Create field accounts and assign CSR projects. Field Officers sign in from any compatible
            device, access only assigned projects, and submit milestone evidence.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void fetchOfficers()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <InfoMeterGrid className="xl:grid-cols-4">
        <InfoMeter
          title="Total officers"
          value={String(metrics.total)}
          detail="All Field Officer identities owned by this NGO."
        />
        <InfoMeter
          title="Active"
          value={String(metrics.active)}
          detail={
            metrics.total > 0
              ? `${metrics.active} of ${metrics.total} can currently sign in.`
              : 'No officers created yet.'
          }
        />
        <InfoMeter
          title="Inactive"
          value={String(metrics.inactive)}
          detail="Deactivated accounts cannot authenticate to the field app."
        />
        <InfoMeter
          title="Password setup"
          value={`${metrics.passwordConfigured}/${metrics.total || 0}`}
          detail={
            metrics.passwordRequired > 0
              ? `${metrics.passwordRequired} still must change password on first login.`
              : metrics.total > 0
                ? 'All officers have completed password setup.'
                : 'Password completion appears after officers are created.'
          }
        />
      </InfoMeterGrid>

      {metrics.recentlyCreated > 0 ? (
        <p className="text-xs text-slate-500">
          {metrics.recentlyCreated} officer{metrics.recentlyCreated === 1 ? '' : 's'} created in the
          last 7 days.
        </p>
      ) : null}

      <form className="space-y-4 rounded-lg border border-slate-200 p-4" onSubmit={createOfficer}>
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Create Field Officer</h4>
          <p className="mt-1 text-xs text-slate-600">
            Creates a separate login for milestone evidence collection. Evidence submission is enabled
            automatically. Assign projects after creation. The officer must change the initial password
            on first field-app sign-in and may use any compatible device.
          </p>
        </div>
        {formError ? <p className="text-sm text-rose-700">{formError}</p> : null}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="fo-name">Full name</Label>
            <Input
              id="fo-name"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Officer name"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fo-email">Email</Label>
            <Input
              id="fo-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="officer@example.org"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fo-password">Initial password</Label>
            <Input
              id="fo-password"
              type="password"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>
        </div>
        <Button type="submit" disabled={creating}>
          {creating ? 'Creating…' : 'Create Field Officer'}
        </Button>
      </form>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="fo-search">Search</Label>
              <Input
                id="fo-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fo-status-filter">Status</Label>
              <select
                id="fo-status-filter"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fo-password-filter">Password setup</Label>
              <select
                id="fo-password-filter"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={passwordFilter}
                onChange={(e) => setPasswordFilter(e.target.value as typeof passwordFilter)}
              >
                <option value="all">All password states</option>
                <option value="required">Password change required</option>
                <option value="configured">Password configured</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
            Loading field officers…
          </div>
        ) : loadError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            <p className="font-medium">Could not load officers</p>
            <p className="mt-1">{loadError}</p>
            <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void fetchOfficers()}>
              Try again
            </Button>
          </div>
        ) : filteredOfficers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            <p className="font-medium text-slate-900">No field officers match these filters</p>
            <p className="mt-1">
              {fo.officers.length === 0
                ? 'Create your first Field Officer account above to start assigning field work later.'
                : 'Adjust search or filters to see other officers.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Officer</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Projects</th>
                  <th className="px-3 py-2 font-medium">Password</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredOfficers.map((officer) => {
                  const active = String(officer.status).toLowerCase() === 'active'
                  return (
                    <tr
                      key={officer.id}
                      className={selectedId === officer.id ? 'bg-orange-50/40' : undefined}
                    >
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          className="text-left"
                          onClick={() => setSelectedId(officer.id)}
                        >
                          <p className="font-medium text-slate-900">{officerDisplayName(officer)}</p>
                          <p className="text-xs text-slate-500">{officerEmail(officer)}</p>
                        </button>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <StatusBadge status={officer.status} />
                      </td>
                      <td className="min-w-[18rem] max-w-[28rem] px-3 py-3 align-top">
                        {(() => {
                          const roster: FieldOfficerProjectAssignment[] =
                            assignmentsByOfficer[officer.id] || []
                          const active = roster.filter(
                            (row) => String(row.status).toLowerCase() === 'active'
                          )
                          const lockedIn =
                            active.length > 0 && active.every((row) => isAssignmentLocked(row))
                          const activeIds = new Set(active.map((row) => row.project_id))
                          const options = (eligibleProjects || []).filter(
                            (project) =>
                              !activeIds.has(project.id) && !isProjectAssignLocked(project)
                          )
                          const draft = assignDraftByOfficer[officer.id] || ''
                          const draftTitle =
                            (eligibleProjects || []).find((project) => project.id === draft)
                              ?.title || 'Selected project'
                          const showAssignControls = !lockedIn
                          return (
                            <div className="min-w-0 space-y-2">
                              {active.length === 0 ? (
                                <p className="text-xs text-slate-500">No active project assignments</p>
                              ) : (
                                <ul className="space-y-2">
                                  {active.map((row) => {
                                    const project = assignmentProject(row)
                                    const locked = isAssignmentLocked(row)
                                    return (
                                      <li
                                        key={row.id}
                                        className="flex items-start justify-between gap-3 text-xs text-slate-700"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <p className="truncate font-medium">
                                            {project?.title || 'Project'}
                                          </p>
                                          <p
                                            className={
                                              locked ? 'text-amber-700' : 'text-emerald-700'
                                            }
                                          >
                                            {locked ? 'Locked' : 'Editable'}
                                            {project?.start_date
                                              ? ` · starts ${project.start_date}`
                                              : ''}
                                          </p>
                                          {row.assignment_lock?.lockAt ? (
                                            <p className="text-slate-500">
                                              Lock {locked ? 'since' : 'at'}{' '}
                                              {formatLockWhen(row.assignment_lock.lockAt)}
                                            </p>
                                          ) : null}
                                        </div>
                                        {!locked ? (
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-8 shrink-0"
                                            disabled={mutatingAssignmentId === row.id}
                                            onClick={() =>
                                              void updateAssignmentStatus?.(
                                                row.id,
                                                'inactive',
                                                officer.id
                                              )
                                            }
                                          >
                                            Remove
                                          </Button>
                                        ) : null}
                                      </li>
                                    )
                                  })}
                                </ul>
                              )}
                              {showAssignControls ? (
                                <>
                                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                                    <div className="min-w-0 flex-1">
                                      <Select
                                        value={draft || undefined}
                                        onValueChange={(value) =>
                                          setAssignDraftByOfficer?.((prev) => ({
                                            ...prev,
                                            [officer.id]: value === '__none' ? '' : value,
                                          }))
                                        }
                                        disabled={options.length === 0 || assigningProjects}
                                      >
                                        <SelectTrigger
                                          className="h-9 w-full min-w-0 overflow-hidden border-slate-200 bg-white text-xs shadow-none [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate"
                                          aria-label={`Assign project to ${officerDisplayName(officer)}`}
                                        >
                                          <SelectValue placeholder="Select project…">
                                            {draft ? draftTitle : undefined}
                                          </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent className="max-h-72 min-w-[18rem]">
                                          {options.length === 0 ? (
                                            <SelectItem value="__none" disabled>
                                              No projects available
                                            </SelectItem>
                                          ) : (
                                            options.map((project) => (
                                              <SelectItem
                                                key={project.id}
                                                value={project.id}
                                                textValue={project.title}
                                                className="items-start py-2.5 pl-8 pr-3"
                                              >
                                                <span className="flex min-w-0 flex-col gap-0.5 text-left">
                                                  <span className="truncate text-sm font-medium text-slate-900">
                                                    {project.title}
                                                  </span>
                                                  <span className="truncate text-[11px] font-normal text-slate-500">
                                                    {project.start_date
                                                      ? `Starts ${project.start_date}`
                                                      : 'No start date'}
                                                    {project.region ? ` · ${project.region}` : ''}
                                                    {project.project_status
                                                      ? ` · ${formatStatusLabel(project.project_status)}`
                                                      : ''}
                                                  </span>
                                                </span>
                                              </SelectItem>
                                            ))
                                          )}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="h-9 shrink-0"
                                      disabled={!draft || assigningProjects}
                                      onClick={() => void saveAssignmentDraft?.(officer.id)}
                                    >
                                      Save
                                    </Button>
                                  </div>
                                  {options.length === 0 ? (
                                    <p className="text-xs text-slate-500">
                                      No eligible projects available to assign.
                                    </p>
                                  ) : null}
                                </>
                              ) : null}
                            </div>
                          )
                        })()}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <PasswordBadge required={Boolean(officer.must_change_password)} />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            title="View details"
                            onClick={() => setSelectedId(officer.id)}
                          >
                            <UserRound className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            title="Reset password"
                            onClick={() => openResetDialog(officer)}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            title={active ? 'Deactivate' : 'Activate'}
                            disabled={mutatingId === officer.id}
                            onClick={() =>
                              void updateStatus(officer.id, active ? 'inactive' : 'active')
                            }
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedId ? (
        <div className="space-y-4 rounded-lg border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Officer detail</h4>
              <p className="mt-1 text-xs text-slate-600">
                Account overview, permissions, and lifecycle activity for the selected Field Officer.
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedId(null)}>
              Close
            </Button>
          </div>

          {detailLoading ? (
            <p className="text-sm text-slate-600">Loading officer details…</p>
          ) : detailError ? (
            <p className="text-sm text-rose-700">{detailError}</p>
          ) : detail ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <section className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Account overview
                </h5>
                <div className="space-y-2 text-sm">
                  <div className="space-y-1">
                    <Label htmlFor="fo-edit-name">Name</Label>
                    <Input
                      id="fo-edit-name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                  <p>
                    <span className="text-slate-500">Email:</span> {officerEmail(detail)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status={detail.status} />
                    <PasswordBadge required={Boolean(detail.must_change_password)} />
                  </div>
                  <p className="text-xs text-slate-600">Created: {formatWhen(detail.created_at)}</p>
                  <p className="text-xs text-slate-600">Last login: {formatWhen(detail.last_login_at)}</p>
                  <p className="text-xs text-slate-600">
                    Deactivated: {formatWhen(detail.deactivated_at)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void saveProfile()}
                    disabled={mutatingId === detail.id}
                  >
                    Save name
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void updateStatus(
                        detail.id,
                        String(detail.status).toLowerCase() === 'active' ? 'inactive' : 'active'
                      )
                    }
                    disabled={mutatingId === detail.id}
                  >
                    {String(detail.status).toLowerCase() === 'active' ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => openResetDialog(detail)}>
                    Reset password
                  </Button>
                </div>
              </section>

              <section className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Role
                </h5>
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-emerald-800"
                >
                  Evidence submission enabled
                </Badge>
                <p className="text-sm text-slate-700">
                  Field Officers collect and submit milestone evidence for assigned projects. Evidence
                  permission is always enabled for active officers. Device registration is not
                  required. Assignment editing locks 48 hours before each project&apos;s scheduled
                  start (Asia/Kolkata).
                </p>
              </section>

              <FieldOfficerProjectAssignmentsPanel fo={fo} />

              <section className="space-y-3 rounded-md border border-slate-200 bg-white p-3 lg:col-span-2">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Account activity
                </h5>
                {Array.isArray(detail.activity) && detail.activity.length > 0 ? (
                  <ul className="space-y-2">
                    {detail.activity.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-col gap-0.5 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="font-medium text-slate-900">
                          {formatOfficerActivityLabel(item.event_type)}
                        </span>
                        <span className="text-xs text-slate-500">{formatWhen(item.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-600">
                    No audit events are recorded for this officer yet. Create, activate, deactivate,
                    profile, permission, and password-reset actions appear here when they occur.
                  </p>
                )}
              </section>
            </div>
          ) : null}
        </div>
      ) : null}

      <FieldOfficerResetPasswordDialog fo={fo} />
    </div>
  )
}
