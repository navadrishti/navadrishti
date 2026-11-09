'use client'

import Link from 'next/link'
import { KeyRound, Power, RefreshCw, Trash2 } from 'lucide-react'
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
import type {
  CompanyCaAccountsState,
  EvidenceVerifierAccountsState,
} from './use-evidence-verifier-accounts'

export function EvidenceVerifierTab({
  ca,
}: {
  ca: EvidenceVerifierAccountsState | CompanyCaAccountsState
}) {
  const {
    companyCAForm,
    setCompanyCAForm,
    reusableCompanyCaIds,
    fetchAvailableCompanyCaIds,
    creatingCompanyCA,
    createCompanyCAAccount,
    formError,
    lastCreatedCompanyCA,
    loadingCompanyCAAccounts,
    companyCAAccounts,
    activeCompanyCAAccounts,
    fetchCompanyCAAccounts,
    openCaResetPasswordDialog,
    updateCompanyCAStatus,
    deleteCompanyCAAccount,
    eligibleProjects,
    assignDraftByVerifier,
    setAssignDraftByVerifier,
    assigningProjects,
    mutatingAssignmentId,
    saveAssignmentDraft,
    setAssignmentStatus,
    activeAssignments,
    inactiveAssignments,
  } = ca

  return (
    <div className="space-y-6 pt-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Evidence Verifiers</h3>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Create Evidence Verifier accounts for CSR evidence review, milestone payments, and
            expense/material reconciliation. They can only access projects you assign. This is
            separate from platform identity verification at /ca. Sign-in:{' '}
            <Link
              href="/evidence-verification/login"
              className="font-medium text-udaan-blue underline-offset-2 hover:underline"
            >
              /evidence-verification/login
            </Link>
            .
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void fetchCompanyCAAccounts()}
          disabled={loadingCompanyCAAccounts}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loadingCompanyCAAccounts ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        <p className="font-medium text-slate-900">What Evidence Verifiers review</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Milestone evidence on assigned projects only</li>
          <li>Proposed NGO expenses (approve, reject, or mark unreconciled)</li>
          <li>Materials and quantity reconciliation</li>
          <li>Assigned project financial summaries and audit history</li>
        </ul>
        <Button asChild size="sm" variant="outline" className="mt-3">
          <Link href="/evidence-verification/login">Open Evidence Verification portal</Link>
        </Button>
      </div>

      <form className="space-y-4 rounded-lg border border-slate-200 p-4" onSubmit={createCompanyCAAccount}>
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Create Evidence Verifier</h4>
          <p className="mt-1 text-xs text-slate-600">
            Assign CSR projects after creation. Publication of new projects also requires selecting an
            Evidence Verifier once the Lead NGO is finalized.
          </p>
        </div>

        <div className="space-y-3 rounded-md border border-slate-100 bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-700">Verifier ID assignment</p>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <input
                type="radio"
                checked={companyCAForm.auto_generate_ca_id}
                onChange={() => {
                  setCompanyCAForm((prev) => ({ ...prev, auto_generate_ca_id: true, ca_id: '' }))
                }}
              />
              Auto-generate Verifier ID
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <input
                type="radio"
                checked={!companyCAForm.auto_generate_ca_id}
                onChange={() => {
                  setCompanyCAForm((prev) => ({ ...prev, auto_generate_ca_id: false }))
                  void fetchAvailableCompanyCaIds()
                }}
              />
              Reuse existing Verifier ID
            </label>
          </div>
          {!companyCAForm.auto_generate_ca_id ? (
            <div className="space-y-2">
              <Label htmlFor="company-ca-id-select">Select Verifier ID</Label>
              {reusableCompanyCaIds.length === 0 ? (
                <p className="text-xs text-amber-700">
                  No IDs available for succession. Deactivate an existing verifier first, or
                  auto-generate a new ID.
                </p>
              ) : (
                <select
                  id="company-ca-id-select"
                  value={companyCAForm.ca_id}
                  onChange={(e) => setCompanyCAForm((prev) => ({ ...prev, ca_id: e.target.value }))}
                  className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                >
                  <option value="">-- Select a Verifier ID --</option>
                  {reusableCompanyCaIds.map((entry) => (
                    <option key={entry.ca_id} value={entry.ca_id}>
                      {entry.ca_id}
                      {entry.holder_name ? ` (previously: ${entry.holder_name})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="company-ca-name">Full name</Label>
            <Input
              id="company-ca-name"
              value={companyCAForm.name}
              onChange={(event) => setCompanyCAForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Verifier name"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="company-ca-email">Email</Label>
            <Input
              id="company-ca-email"
              type="email"
              value={companyCAForm.email}
              onChange={(event) => setCompanyCAForm((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="verifier@yourcompany.com"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="company-ca-password">Initial password</Label>
            <Input
              id="company-ca-password"
              type="password"
              value={companyCAForm.password}
              onChange={(event) =>
                setCompanyCAForm((prev) => ({ ...prev, password: event.target.value }))
              }
              placeholder="Minimum 8 characters"
              minLength={8}
              required
            />
          </div>
        </div>

        {formError ? <p className="text-sm text-rose-700">{formError}</p> : null}

        <Button type="submit" disabled={creatingCompanyCA}>
          {creatingCompanyCA ? 'Creating…' : 'Create Evidence Verifier'}
        </Button>
      </form>

      {lastCreatedCompanyCA ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-medium">Generated credentials</p>
          <p>Verifier ID: {lastCreatedCompanyCA.ca_id}</p>
          <p>Email: {lastCreatedCompanyCA.email}</p>
          <p>Password: {lastCreatedCompanyCA.password}</p>
          <p className="mt-1">Portal: /evidence-verification/login</p>
        </div>
      ) : null}

      {loadingCompanyCAAccounts ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
          Loading Evidence Verifiers…
        </div>
      ) : companyCAAccounts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          <p className="font-medium text-slate-900">No Evidence Verifiers yet</p>
          <p className="mt-1">
            Create an Evidence Verifier above before publishing CSR projects. Every published project
            needs an assigned verifier.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Verifier</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Projects</th>
                <th className="px-3 py-2 font-medium">Password</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {companyCAAccounts.map((account) => {
                const active = String(account.status).toLowerCase() === 'active'
                const assigned = activeAssignments(account)
                const removed = inactiveAssignments(account)
                const activeIds = new Set(assigned.map((row) => row.project_id))
                const options = eligibleProjects.filter((project) => !activeIds.has(project.id))
                const draft = assignDraftByVerifier[account.id] || ''
                const displayName = account.users?.name || 'Evidence Verifier'
                return (
                  <tr key={account.id}>
                    <td className="px-3 py-3 align-top">
                      <p className="font-medium text-slate-900">{displayName}</p>
                      <p className="text-xs text-slate-500">{account.users?.email}</p>
                      {account.ca_id ? (
                        <p className="mt-1 font-mono text-[11px] text-slate-500">{account.ca_id}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <Badge
                        variant="outline"
                        className={
                          active
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-slate-50 text-slate-700'
                        }
                      >
                        {active ? 'Active' : formatStatusLabel(account.status)}
                      </Badge>
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
                                    void setAssignmentStatus(account.id, row.id, 'inactive')
                                  }
                                >
                                  Remove
                                </Button>
                              </li>
                            ))}
                          </ul>
                        )}
                        {removed.length > 0 ? (
                          <div className="space-y-2 border-t border-slate-100 pt-2">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                              Removed assignments
                            </p>
                            <ul className="space-y-2">
                              {removed.map((row) => (
                                <li
                                  key={row.id}
                                  className="flex items-start justify-between gap-3 text-xs text-slate-600"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate font-medium text-slate-700">
                                      {row.project?.title || 'Project'}
                                    </p>
                                    <p className="text-slate-500">Inactive · can be restored</p>
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 shrink-0"
                                    disabled={!active || mutatingAssignmentId === row.id}
                                    title={
                                      active
                                        ? 'Restore assignment'
                                        : 'Activate the Evidence Verifier before restoring assignments'
                                    }
                                    onClick={() =>
                                      void setAssignmentStatus(account.id, row.id, 'active')
                                    }
                                  >
                                    Restore
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                          <div className="min-w-0 flex-1">
                            <Select
                              value={draft || undefined}
                              onValueChange={(value) =>
                                setAssignDraftByVerifier((prev) => ({
                                  ...prev,
                                  [account.id]: value === '__none' ? '' : value,
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
                            onClick={() => void saveAssignmentDraft(account.id)}
                          >
                            Save
                          </Button>
                        </div>
                        {!active ? (
                          <p className="text-xs text-slate-500">
                            Activate the Evidence Verifier before assigning projects.
                          </p>
                        ) : options.length === 0 ? (
                          <p className="text-xs text-slate-500">
                            No eligible projects available to assign.
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <Badge
                        variant="outline"
                        className={
                          account.must_change_password
                            ? 'border-amber-200 bg-amber-50 text-amber-800'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        }
                      >
                        {account.must_change_password
                          ? 'Password change required'
                          : 'Password configured'}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          title="Reset password"
                          onClick={() => openCaResetPasswordDialog(account)}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          title={active ? 'Deactivate' : 'Activate'}
                          onClick={() =>
                            void updateCompanyCAStatus(account.id, active ? 'inactive' : 'active')
                          }
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                          title="Delete"
                          onClick={() =>
                            void deleteCompanyCAAccount(account.id, displayName)
                          }
                        >
                          <Trash2 className="h-4 w-4" />
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

      {!loadingCompanyCAAccounts && activeCompanyCAAccounts.length === 0 && companyCAAccounts.length > 0 ? (
        <p className="text-sm text-amber-800">
          No active Evidence Verifiers. Activate one before publishing CSR projects.
        </p>
      ) : null}
    </div>
  )
}

/** @deprecated Prefer EvidenceVerifierTab */
export const CompanyCaTab = EvidenceVerifierTab
