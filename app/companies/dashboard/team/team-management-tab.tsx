'use client'

import { useState } from 'react'
import { EmployeesTab } from '../employees/employees-tab'
import type { CompanyEmployeesState } from '../employees/use-company-employees'
import { EvidenceVerifierTab } from '../evidence-verifier-tab'
import type { EvidenceVerifierAccountsState } from '../use-evidence-verifier-accounts'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type TeamRoleFilter = 'all' | 'employees' | 'evidence-verifiers'

export function TeamManagementTab({
  employees,
  evidenceVerifiers,
}: {
  employees: CompanyEmployeesState
  evidenceVerifiers: EvidenceVerifierAccountsState
}) {
  const [roleFilter, setRoleFilter] = useState<TeamRoleFilter>('all')

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-slate-900">Team Management</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Manage Company Employees (read-only CSR monitoring) and Evidence Verifiers (project evidence
            review) in one place. Each role keeps its own login and permissions.
          </p>
        </div>
        <div className="w-full shrink-0 space-y-1.5 sm:w-[14rem]">
          <Label htmlFor="team-role-filter">Role</Label>
          <Select
            value={roleFilter}
            onValueChange={(value) => setRoleFilter(value as TeamRoleFilter)}
          >
            <SelectTrigger id="team-role-filter" className="border-slate-200 bg-white">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="employees">Employees</SelectItem>
              <SelectItem value="evidence-verifiers">Evidence Verifiers</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {roleFilter === 'all' || roleFilter === 'employees' ? (
        <EmployeesTab state={employees} />
      ) : null}

      {roleFilter === 'all' || roleFilter === 'evidence-verifiers' ? (
        <EvidenceVerifierTab ca={evidenceVerifiers} />
      ) : null}
    </div>
  )
}
