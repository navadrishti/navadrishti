'use client'

import { formatStatusLabel } from '@/lib/format-date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { KeyRound, Power, RefreshCw } from 'lucide-react'
import type { CompanyEmployeesState } from './use-company-employees'

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

export function EmployeesTab({ state }: { state: CompanyEmployeesState }) {
  const {
    employees,
    filteredEmployees,
    loading,
    creating,
    form,
    setForm,
    formError,
    resetError,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    eligibleProjects,
    assignDraftByEmployee,
    setAssignDraftByEmployee,
    assigningProjects,
    mutatingAssignmentId,
    mutatingId,
    saveAssignmentDraft,
    setAssignmentStatus,
    createEmployee,
    updateStatus,
    resetTarget,
    setResetTarget,
    resetPassword,
    setResetPassword,
    resetConfirm,
    setResetConfirm,
    resetting,
    submitPasswordReset,
    activeAssignments,
    fetchEmployees,
  } = state

  return (
    <div className="space-y-6 pt-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Company employees</h3>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Create subordinate monitoring accounts and assign CSR projects inline. Employees can view
            only projects you assign — they cannot approve evidence, manage payments, or administer
            the company.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void fetchEmployees()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <form onSubmit={createEmployee} className="space-y-4 rounded-lg border border-slate-200 p-4">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Create employee</h4>
          <p className="mt-1 text-xs text-slate-600">
            Creates a separate login for CSR project monitoring. Assign projects after creation. The
            employee must change the initial password on first sign-in.
          </p>
        </div>
        {formError ? <p className="text-sm text-rose-700">{formError}</p> : null}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="employee-name">Full name</Label>
            <Input
              id="employee-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Enter full name..."
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="employee-email">Email</Label>
            <Input
              id="employee-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="Enter work email..."
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="employee-password">Initial password</Label>
            <Input
              id="employee-password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
        </div>
        <Button type="submit" disabled={creating}>
          {creating ? 'Creating…' : 'Create employee'}
        </Button>
      </form>

      <div className="space-y-3">
        <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="employee-search">Search</Label>
            <Input
              id="employee-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or email"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="employee-status-filter">Status</Label>
            <select
              id="employee-status-filter"
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
            Loading employees…
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            <p className="font-medium text-slate-900">No employees match these filters</p>
            <p className="mt-1">
              {employees.length === 0
                ? 'Create your first employee account above to start assigning CSR monitoring work.'
                : 'Adjust search or filters to see other employees.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Projects</th>
                  <th className="px-3 py-2 font-medium">Password</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredEmployees.map((employee) => {
                  const active = String(employee.status).toLowerCase() === 'active'
                  const assigned = activeAssignments(employee)
                  const activeIds = new Set(assigned.map((row) => row.project_id))
                  const options = eligibleProjects.filter((project) => !activeIds.has(project.id))
                  const draft = assignDraftByEmployee[employee.id] || ''
                  const displayName = employee.users?.name || 'Employee'
                  return (
                    <tr key={employee.id}>
                      <td className="px-3 py-3 align-top">
                        <p className="font-medium text-slate-900">{displayName}</p>
                        <p className="text-xs text-slate-500">{employee.users?.email}</p>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <StatusBadge status={employee.status} />
                      </td>
                      <td className="min-w-[18rem] max-w-[28rem] px-3 py-3 align-top">
                        <div className="min-w-0 space-y-2">
                          {assigned.length === 0 ? (
                            <p className="text-xs text-slate-500">No active project assignments</p>
                          ) : (
                            <ul className="space-y-2">
                              {assigned.map((row) => (
                                <li
                                  key={row.id}
                                  className="flex items-start justify-between gap-3 text-xs text-slate-700"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate font-medium">
                                      {row.project?.title || 'Project'}
                                    </p>
                                    {row.project?.project_status ? (
                                      <p className="text-slate-500">
                                        {formatStatusLabel(row.project.project_status)}
                                      </p>
                                    ) : null}
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 shrink-0"
                                    disabled={mutatingAssignmentId === row.id}
                                    onClick={() =>
                                      void setAssignmentStatus(employee.id, row.id, 'inactive')
                                    }
                                  >
                                    Remove
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          )}
                          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="min-w-0 flex-1">
                              <Select
                                value={draft || undefined}
                                onValueChange={(value) =>
                                  setAssignDraftByEmployee((prev) => ({
                                    ...prev,
                                    [employee.id]: value === '__none' ? '' : value,
                                  }))
                                }
                                disabled={!active || options.length === 0 || assigningProjects}
                              >
                                <SelectTrigger
                                  className="h-9 w-full min-w-0 overflow-hidden border-slate-200 bg-white text-xs shadow-none [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate"
                                  aria-label={`Assign project to ${displayName}`}
                                >
                                  <SelectValue placeholder="Select project…">
                                    {draft
                                      ? eligibleProjects.find((project) => project.id === draft)
                                          ?.title || 'Selected project'
                                      : undefined}
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
                              disabled={!active || !draft || assigningProjects}
                              onClick={() => void saveAssignmentDraft(employee.id)}
                            >
                              Save
                            </Button>
                          </div>
                          {!active ? (
                            <p className="text-xs text-slate-500">
                              Activate the employee before assigning projects.
                            </p>
                          ) : options.length === 0 ? (
                            <p className="text-xs text-slate-500">
                              No eligible projects available to assign.
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <PasswordBadge required={Boolean(employee.must_change_password)} />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            title="Reset password"
                            onClick={() => setResetTarget(employee)}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            title={active ? 'Deactivate' : 'Activate'}
                            disabled={mutatingId === employee.id}
                            onClick={() =>
                              void updateStatus(employee.id, active ? 'inactive' : 'active')
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

      {resetTarget ? (
        <form onSubmit={submitPasswordReset} className="space-y-3 rounded-lg border border-slate-200 p-4">
          <p className="text-sm font-medium text-slate-900">
            Reset password for {resetTarget.users?.name || resetTarget.users?.email}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="reset-password">New password</Label>
              <Input
                id="reset-password"
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reset-confirm">Confirm password</Label>
              <Input
                id="reset-confirm"
                type="password"
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value)}
                minLength={8}
                required
              />
            </div>
          </div>
          {resetError ? <p className="text-sm text-rose-700">{resetError}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={resetting}>
              {resetting ? 'Resetting…' : 'Reset password'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
