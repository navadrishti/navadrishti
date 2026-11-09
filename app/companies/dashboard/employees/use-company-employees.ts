'use client'

import { useCallback, useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { toast } from 'sonner'
import { clientAuthHeaders } from '@/lib/client-session'
import { readApiError } from '@/lib/user-facing-error'
import type {
  CompanyEmployeeAssignment,
  CompanyEmployeeIdentity,
  EligibleEmployeeProject,
} from './types'

export function useCompanyEmployees(userId: number | undefined, isTabActive: boolean) {
  const [employees, setEmployees] = useState<CompanyEmployeeIdentity[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [formError, setFormError] = useState<string | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [eligibleProjects, setEligibleProjects] = useState<EligibleEmployeeProject[]>([])
  const [assignDraftByEmployee, setAssignDraftByEmployee] = useState<Record<string, string>>({})
  const [assigningProjects, setAssigningProjects] = useState(false)
  const [mutatingAssignmentId, setMutatingAssignmentId] = useState<string | null>(null)
  const [mutatingId, setMutatingId] = useState<string | null>(null)
  const [resetTarget, setResetTarget] = useState<CompanyEmployeeIdentity | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetting, setResetting] = useState(false)

  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/company/employees', {
        credentials: 'include',
        headers: clientAuthHeaders(),
      })
      const payload = await response.json().catch(() => null)
      if (response.ok && payload?.success) {
        setEmployees(Array.isArray(payload.data) ? payload.data : [])
      } else {
        setEmployees([])
        toast.error(readApiError(payload, 'Failed to load employees'))
      }
    } catch {
      setEmployees([])
      toast.error('Failed to load employees')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchEligibleProjects = useCallback(async () => {
    try {
      const response = await fetch('/api/company/employees/eligible-projects', {
        credentials: 'include',
        headers: clientAuthHeaders(),
      })
      const payload = await response.json().catch(() => null)
      if (response.ok && payload?.success) {
        setEligibleProjects(Array.isArray(payload.data) ? payload.data : [])
      }
    } catch {
      setEligibleProjects([])
    }
  }, [])

  useEffect(() => {
    if (!userId || !isTabActive) return
    void fetchEmployees()
    void fetchEligibleProjects()
  }, [userId, isTabActive, fetchEmployees, fetchEligibleProjects])

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees.filter((employee) => {
      if (statusFilter !== 'all' && String(employee.status).toLowerCase() !== statusFilter) {
        return false
      }
      if (!q) return true
      const name = String(employee.users?.name || '').toLowerCase()
      const email = String(employee.users?.email || '').toLowerCase()
      return name.includes(q) || email.includes(q)
    })
  }, [employees, search, statusFilter])

  const createEmployee = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    if (!form.name || !form.email || !form.password) {
      setFormError('Name, email and password are required.')
      return
    }
    try {
      setCreating(true)
      const response = await fetch('/api/company/employees', {
        method: 'POST',
        credentials: 'include',
        headers: { ...clientAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        toast.error(readApiError(payload, 'Failed to create employee'))
        return
      }
      setForm({ name: '', email: '', password: '' })
      toast.success('Employee created. They must change the password on first login.')
      await fetchEmployees()
    } catch {
      toast.error('Failed to create employee')
    } finally {
      setCreating(false)
    }
  }

  const updateStatus = async (identityId: string, status: 'active' | 'inactive') => {
    setMutatingId(identityId)
    try {
      const response = await fetch(`/api/company/employees/${encodeURIComponent(identityId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { ...clientAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        toast.error(readApiError(payload, 'Failed to update status'))
        return
      }
      toast.success(status === 'active' ? 'Employee activated.' : 'Employee deactivated.')
      await fetchEmployees()
    } finally {
      setMutatingId(null)
    }
  }

  const saveAssignmentDraft = async (identityId: string) => {
    const projectId = String(assignDraftByEmployee[identityId] || '').trim()
    if (!projectId) return
    setAssigningProjects(true)
    try {
      const response = await fetch(
        `/api/company/employees/${encodeURIComponent(identityId)}/assignments`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { ...clientAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectIds: [projectId] }),
        }
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        toast.error(readApiError(payload, 'Failed to assign project'))
        return
      }
      setAssignDraftByEmployee((prev) => ({ ...prev, [identityId]: '' }))
      toast.success('Project assigned.')
      await fetchEmployees()
    } finally {
      setAssigningProjects(false)
    }
  }

  const setAssignmentStatus = async (
    identityId: string,
    assignmentId: string,
    status: 'active' | 'inactive'
  ) => {
    setMutatingAssignmentId(assignmentId)
    try {
      const response = await fetch(
        `/api/company/employees/${encodeURIComponent(identityId)}/assignments/${encodeURIComponent(assignmentId)}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { ...clientAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        }
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        toast.error(readApiError(payload, 'Failed to update assignment'))
        return
      }
      toast.success(status === 'active' ? 'Assignment restored.' : 'Assignment removed.')
      await fetchEmployees()
    } finally {
      setMutatingAssignmentId(null)
    }
  }

  const submitPasswordReset = async (event: FormEvent) => {
    event.preventDefault()
    if (!resetTarget) return
    if (resetPassword.length < 8 || resetPassword !== resetConfirm) {
      setResetError('Passwords must match and be at least 8 characters.')
      return
    }
    setResetting(true)
    setResetError(null)
    try {
      const response = await fetch(`/api/company/employees/${encodeURIComponent(resetTarget.id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { ...clientAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_password', password: resetPassword }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        toast.error(readApiError(payload, 'Failed to reset password'))
        return
      }
      setResetTarget(null)
      setResetPassword('')
      setResetConfirm('')
      toast.success('Password reset. The employee must change it on next login.')
      await fetchEmployees()
    } finally {
      setResetting(false)
    }
  }

  const activeAssignments = (employee: CompanyEmployeeIdentity): CompanyEmployeeAssignment[] =>
    (employee.assignments ?? []).filter((row) => String(row.status).toLowerCase() === 'active')

  return {
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
    setAssignDraftByEmployee: setAssignDraftByEmployee as Dispatch<SetStateAction<Record<string, string>>>,
    assigningProjects,
    mutatingAssignmentId,
    mutatingId,
    saveAssignmentDraft,
    setAssignmentStatus,
    updateStatus,
    createEmployee,
    resetTarget,
    setResetTarget: (target: CompanyEmployeeIdentity | null) => {
      setResetTarget(target)
      setResetError(null)
      if (!target) {
        setResetPassword('')
        setResetConfirm('')
      }
    },
    resetPassword,
    setResetPassword,
    resetConfirm,
    setResetConfirm,
    resetting,
    submitPasswordReset,
    activeAssignments,
    fetchEmployees,
  }
}

export type CompanyEmployeesState = ReturnType<typeof useCompanyEmployees>
