'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { clientAuthHeaders, getClientSessionToken } from '@/lib/client-session'
import { readApiError } from '@/lib/user-facing-error'
import { useNow } from '@/hooks/use-now'
import { toast } from 'sonner'
import type {
  EligibleFieldProject,
  FieldOfficerAssignmentStatusFilter,
  FieldOfficerForm,
  FieldOfficerIdentity,
  FieldOfficerPasswordFilter,
  FieldOfficerProjectAssignment,
  FieldOfficerStatusFilter,
} from './types'
import { assignmentProject, officerDisplayName, officerEmail } from './types'

const emptyForm = (): FieldOfficerForm => ({
  name: '',
  email: '',
  password: '',
})

export function useFieldOfficers(userId: number | undefined, isTabActive: boolean, verified: boolean) {
  const now = useNow()
  const [officers, setOfficers] = useState<FieldOfficerIdentity[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [mutatingId, setMutatingId] = useState<string | null>(null)
  const [form, setForm] = useState<FieldOfficerForm>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<FieldOfficerStatusFilter>('all')
  const [passwordFilter, setPasswordFilter] = useState<FieldOfficerPasswordFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<FieldOfficerIdentity | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<FieldOfficerIdentity | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirmPassword, setResetConfirmPassword] = useState('')
  const [resettingPassword, setResettingPassword] = useState(false)
  const [editName, setEditName] = useState('')
  const [assignments, setAssignments] = useState<FieldOfficerProjectAssignment[]>([])
  const [assignmentsByOfficer, setAssignmentsByOfficer] = useState<
    Record<string, FieldOfficerProjectAssignment[]>
  >({})
  const [assignmentsLoading, setAssignmentsLoading] = useState(false)
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null)
  const [assignDraftByOfficer, setAssignDraftByOfficer] = useState<Record<string, string>>({})
  const [eligibleProjects, setEligibleProjects] = useState<EligibleFieldProject[]>([])
  const [eligibleLoading, setEligibleLoading] = useState(false)
  const [eligibleError, setEligibleError] = useState<string | null>(null)
  const [projectSearch, setProjectSearch] = useState('')
  const [assignmentStatusFilter, setAssignmentStatusFilter] =
    useState<FieldOfficerAssignmentStatusFilter>('all')
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
  const [assigningProjects, setAssigningProjects] = useState(false)
  const [mutatingAssignmentId, setMutatingAssignmentId] = useState<string | null>(null)

  const authHeaders = useCallback(() => {
    const token = getClientSessionToken()
    return {
      ...clientAuthHeaders({ 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
  }, [])

  const fetchOfficers = useCallback(async () => {
    if (!userId || !verified) {
      setOfficers([])
      setLoadError(null)
      return
    }

    try {
      setLoading(true)
      setLoadError(null)
      const response = await fetch('/api/ngo/field-officers', {
        credentials: 'include',
        headers: clientAuthHeaders(),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        setOfficers([])
        setLoadError(readApiError(payload, 'Unable to load field officers.'))
        return
      }
      setOfficers(Array.isArray(payload.data) ? payload.data : [])
    } catch {
      setOfficers([])
      setLoadError('Unable to load field officers.')
    } finally {
      setLoading(false)
    }
  }, [userId, verified])

  const fetchDetail = useCallback(
    async (identityId: string) => {
      if (!userId || !verified) return
      try {
        setDetailLoading(true)
        setDetailError(null)
        const response = await fetch(`/api/ngo/field-officers/${encodeURIComponent(identityId)}`, {
          credentials: 'include',
          headers: clientAuthHeaders(),
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload?.success) {
          setDetail(null)
          setDetailError(readApiError(payload, 'Unable to load officer details.'))
          return
        }
        const row = payload.data as FieldOfficerIdentity
        setDetail(row)
        setEditName(officerDisplayName(row))
      } catch {
        setDetail(null)
        setDetailError('Unable to load officer details.')
      } finally {
        setDetailLoading(false)
      }
    },
    [userId, verified]
  )

  const fetchAssignments = useCallback(
    async (identityId: string) => {
      if (!userId || !verified) {
        setAssignments([])
        return
      }
      try {
        setAssignmentsLoading(true)
        setAssignmentsError(null)
        const response = await fetch(
          `/api/ngo/field-officers/${encodeURIComponent(identityId)}/assignments`,
          {
            credentials: 'include',
            headers: clientAuthHeaders(),
          }
        )
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload?.success) {
          setAssignments([])
          setAssignmentsError(readApiError(payload, 'Unable to load project assignments.'))
          return
        }
        const rows = Array.isArray(payload.data) ? payload.data : []
        setAssignments(rows)
        setAssignmentsByOfficer((prev) => ({ ...prev, [identityId]: rows }))
      } catch {
        setAssignments([])
        setAssignmentsError('Unable to load project assignments.')
      } finally {
        setAssignmentsLoading(false)
      }
    },
    [userId, verified]
  )

  const fetchEligibleProjects = useCallback(async () => {
    if (!userId || !verified) {
      setEligibleProjects([])
      return
    }
    try {
      setEligibleLoading(true)
      setEligibleError(null)
      const response = await fetch('/api/ngo/field-officers/eligible-projects', {
        credentials: 'include',
        headers: clientAuthHeaders(),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        setEligibleProjects([])
        setEligibleError(readApiError(payload, 'Unable to load eligible projects.'))
        return
      }
      setEligibleProjects(Array.isArray(payload.data) ? payload.data : [])
    } catch {
      setEligibleProjects([])
      setEligibleError('Unable to load eligible projects.')
    } finally {
      setEligibleLoading(false)
    }
  }, [userId, verified])

  useEffect(() => {
    if (!isTabActive || !userId) return
    void fetchOfficers()
    void fetchEligibleProjects()
  }, [isTabActive, userId, fetchOfficers, fetchEligibleProjects])

  useEffect(() => {
    if (!isTabActive || !userId || !verified || officers.length === 0) return
    let cancelled = false
    const load = async () => {
      await Promise.all(
        officers.map(async (officer) => {
          try {
            const response = await fetch(
              `/api/ngo/field-officers/${encodeURIComponent(officer.id)}/assignments`,
              { credentials: 'include', headers: clientAuthHeaders() }
            )
            const payload = await response.json().catch(() => null)
            if (cancelled || !response.ok || !payload?.success) return
            const rows = Array.isArray(payload.data) ? payload.data : []
            setAssignmentsByOfficer((prev) => ({ ...prev, [officer.id]: rows }))
          } catch {
            /* detail view still loads */
          }
        })
      )
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [isTabActive, userId, verified, officers])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      setDetailError(null)
      setAssignments([])
      setAssignmentsError(null)
      setSelectedProjectIds([])
      return
    }
    void fetchDetail(selectedId)
    void fetchAssignments(selectedId)
    void fetchEligibleProjects()
  }, [selectedId, fetchDetail, fetchAssignments, fetchEligibleProjects])

  const metrics = useMemo(() => {
    const total = officers.length
    const active = officers.filter((o) => String(o.status).toLowerCase() === 'active').length
    const inactive = total - active
    const passwordRequired = officers.filter((o) => Boolean(o.must_change_password)).length
    const passwordConfigured = total - passwordRequired
    const recentlyCreated = officers.filter((o) => {
      if (!o.created_at) return false
      const created = new Date(o.created_at).getTime()
      if (!Number.isFinite(created)) return false
      return now > 0 && now - created <= 7 * 24 * 60 * 60 * 1000
    }).length
    return { total, active, inactive, passwordRequired, passwordConfigured, recentlyCreated }
  }, [officers, now])

  const filteredOfficers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return officers.filter((officer) => {
      const status = String(officer.status).toLowerCase()
      if (statusFilter === 'active' && status !== 'active') return false
      if (statusFilter === 'inactive' && status === 'active') return false
      if (passwordFilter === 'required' && !officer.must_change_password) return false
      if (passwordFilter === 'configured' && officer.must_change_password) return false
      if (!q) return true
      return (
        officerDisplayName(officer).toLowerCase().includes(q) ||
        officerEmail(officer).toLowerCase().includes(q)
      )
    })
  }, [officers, search, statusFilter, passwordFilter])

  const assignmentMetrics = useMemo(() => {
    const total = assignments.length
    const active = assignments.filter((row) => String(row.status).toLowerCase() === 'active').length
    const inactive = total - active
    return { total, active, inactive }
  }, [assignments])

  const filteredAssignments = useMemo(() => {
    return assignments.filter((row) => {
      const status = String(row.status).toLowerCase()
      if (assignmentStatusFilter === 'active' && status !== 'active') return false
      if (assignmentStatusFilter === 'inactive' && status === 'active') return false
      return true
    })
  }, [assignments, assignmentStatusFilter])

  const assignedProjectIds = useMemo(() => {
    return new Set(
      assignments
        .filter((row) => String(row.status).toLowerCase() === 'active')
        .map((row) => row.project_id)
    )
  }, [assignments])

  const filteredEligibleProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase()
    return eligibleProjects.filter((project) => {
      if (assignedProjectIds.has(project.id)) return false
      if (!q) return true
      return (
        project.title.toLowerCase().includes(q) ||
        String(project.project_status || '')
          .toLowerCase()
          .includes(q) ||
        String(project.region || '')
          .toLowerCase()
          .includes(q)
      )
    })
  }, [eligibleProjects, assignedProjectIds, projectSearch])

  const createOfficer = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)

    if (!verified) {
      setFormError('A verified NGO account is required to manage field officers.')
      return
    }

    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setFormError('Name, email, and initial password are required.')
      return
    }

    if (form.password.length < 8) {
      setFormError('Initial password must be at least 8 characters.')
      return
    }

    try {
      setCreating(true)
      const response = await fetch('/api/ngo/field-officers', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        toast.error(readApiError(payload, 'Failed to create field officer.'))
        return
      }

      toast.success(
        'Field officer account created with evidence submission enabled. Share the email and initial password securely — they must change the password on first field-app login, then can access assigned projects.'
      )
      setForm(emptyForm())
      await fetchOfficers()
      if (payload.data?.identity?.id) {
        setSelectedId(String(payload.data.identity.id))
      }
    } catch {
      toast.error('Failed to create field officer.')
    } finally {
      setCreating(false)
    }
  }

  const updateStatus = async (identityId: string, status: 'active' | 'inactive') => {
    const label = status === 'inactive' ? 'deactivate' : 'activate'
    if (
      !window.confirm(
        status === 'inactive'
          ? 'Deactivate this field officer? They will lose field-app access immediately.'
          : 'Activate this field officer so they can sign in to the field app again?'
      )
    ) {
      return
    }

    try {
      setMutatingId(identityId)
      
      const response = await fetch(`/api/ngo/field-officers/${encodeURIComponent(identityId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        toast.error(readApiError(payload, `Failed to ${label} officer.`))
        return
      }
      toast.success(`Field officer ${label}d.`)
      await fetchOfficers()
      if (selectedId === identityId) await fetchDetail(identityId)
    } catch {
      toast.error(`Failed to ${label} officer.`)
    } finally {
      setMutatingId(null)
    }
  }

  const saveProfile = async () => {
    if (!selectedId) return
    if (editName.trim().length < 2) {
      setFormError('Name must be at least 2 characters.')
      return
    }
    try {
      setMutatingId(selectedId)
      
      const response = await fetch(`/api/ngo/field-officers/${encodeURIComponent(selectedId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify({ name: editName.trim() }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        toast.error(readApiError(payload, 'Failed to update profile.'))
        return
      }
      toast.success('Officer profile updated.')
      await Promise.all([fetchOfficers(), fetchDetail(selectedId)])
    } catch {
      toast.error('Failed to update profile.')
    } finally {
      setMutatingId(null)
    }
  }

  const openResetDialog = (officer: FieldOfficerIdentity) => {
    setResetTarget(officer)
    setResetPassword('')
    setResetConfirmPassword('')
    setResetError(null)
    setResetDialogOpen(true)
  }

  const closeResetDialog = () => {
    setResetDialogOpen(false)
    setResetTarget(null)
    setResetPassword('')
    setResetConfirmPassword('')
    setResetError(null)
  }

  const toggleProjectSelection = (projectId: string) => {
    setSelectedProjectIds((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]
    )
  }

  const assignProjectsToOfficer = async (identityId: string, projectIds: string[]) => {
    const uniqueIds = [...new Set(projectIds.filter(Boolean))]
    if (!identityId || uniqueIds.length === 0) return
    try {
      setAssigningProjects(true)
      
      const response = await fetch(
        `/api/ngo/field-officers/${encodeURIComponent(identityId)}/assignments`,
        {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders(),
          body: JSON.stringify({ projectIds: uniqueIds }),
        }
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        toast.error(readApiError(payload, 'Failed to assign project'))
        return
      }
      const assignedCount = Number(payload.data?.assigned || 0)
      const failedCount = Number(payload.data?.failed || 0)
      const firstFailure = Array.isArray(payload.data?.results)
        ? payload.data.results.find((row: { ok?: boolean; error?: string }) => !row.ok)?.error
        : null
      ;(failedCount > 0 ? toast.error : toast.success)(
        failedCount > 0
            ? firstFailure ||
              `Assigned ${assignedCount} project(s); ${failedCount} could not be assigned.`
            : `Assigned ${assignedCount} project${assignedCount === 1 ? '' : 's'} to this officer.`,
      )
      setSelectedProjectIds([])
      setAssignDraftByOfficer((prev) => ({ ...prev, [identityId]: '' }))
      await Promise.all([
        fetchAssignments(identityId),
        selectedId === identityId ? fetchDetail(identityId) : Promise.resolve(),
      ])
    } catch {
      toast.error('Failed to assign project.')
    } finally {
      setAssigningProjects(false)
    }
  }

  const assignSelectedProjects = async () => {
    if (!selectedId || selectedProjectIds.length === 0) return
    await assignProjectsToOfficer(selectedId, selectedProjectIds)
  }

  const saveAssignmentDraft = async (identityId: string) => {
    const projectId = String(assignDraftByOfficer[identityId] || '').trim()
    if (!projectId) {
      toast.error('Select a project before saving the assignment.')
      return
    }
    await assignProjectsToOfficer(identityId, [projectId])
  }

  const updateAssignmentStatus = async (
    assignmentId: string,
    status: 'active' | 'inactive',
    identityIdOverride?: string
  ) => {
    const identityId =
      identityIdOverride ||
      assignments.find((row) => row.id === assignmentId)?.field_officer_identity_id ||
      selectedId
    if (!identityId) return
    const label = status === 'inactive' ? 'deactivate' : 'reactivate'
    const roster = assignmentsByOfficer[identityId] || assignments
    const assignment = roster.find((row) => row.id === assignmentId)
    const project = assignment ? assignmentProject(assignment) : null
    if (assignment?.assignment_editable === false || assignment?.assignment_lock?.locked) {
      toast.error(
        assignment.assignment_lock?.lockAt
          ? `Project assignments are locked (since ${assignment.assignment_lock.lockAt}).`
          : 'Project assignments are locked because the project starts within 48 hours.'
      )
      return
    }
    if (
      !window.confirm(
        status === 'inactive'
          ? `Remove assignment${project ? ` for “${project.title}”` : ''}? The officer will lose field-app access to this project immediately.`
          : `Reactivate assignment${project ? ` for “${project.title}”` : ''}? The officer will regain field-app access to this project.`
      )
    ) {
      return
    }

    try {
      setMutatingAssignmentId(assignmentId)
      
      const response = await fetch(
        `/api/ngo/field-officers/${encodeURIComponent(identityId)}/assignments/${encodeURIComponent(assignmentId)}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: authHeaders(),
          body: JSON.stringify({ status }),
        }
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        toast.error(readApiError(payload, `Failed to ${label} assignment.`))
        return
      }
      toast.success(`Assignment ${label}d.`)
      await Promise.all([
        fetchAssignments(identityId),
        selectedId === identityId ? fetchDetail(identityId) : Promise.resolve(),
      ])
    } catch {
      toast.error(`Failed to ${label} assignment.`)
    } finally {
      setMutatingAssignmentId(null)
    }
  }

  const handleResetPassword = async () => {
    if (!resetTarget?.id) return
    if (resetPassword.length < 8) {
      setResetError('Password must be at least 8 characters.')
      return
    }
    if (resetPassword !== resetConfirmPassword) {
      setResetError('Passwords do not match.')
      return
    }
    if (
      !window.confirm(
        'Reset this officer’s password? They must set a new password on their next field app login.'
      )
    ) {
      return
    }

    try {
      setResettingPassword(true)
      
      const response = await fetch(`/api/ngo/field-officers/${encodeURIComponent(String(resetTarget.id))}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify({
          action: 'reset_password',
          password: resetPassword,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        toast.error(readApiError(payload, 'Failed to reset password.'))
        return
      }
      toast.success('Temporary password set. The officer must change it on next login.')
      closeResetDialog()
      await fetchOfficers()
      if (selectedId === resetTarget.id) await fetchDetail(resetTarget.id)
    } catch {
      toast.error('Failed to reset password.')
    } finally {
      setResettingPassword(false)
    }
  }

  return {
    officers,
    filteredOfficers,
    metrics,
    loading,
    loadError,
    creating,
    mutatingId,
    form,
    setForm,
    formError,
    resetError,
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
    resetDialogOpen,
    setResetDialogOpen,
    resetTarget,
    resetPassword,
    setResetPassword,
    resetConfirmPassword,
    setResetConfirmPassword,
    resettingPassword,
    fetchOfficers,
    createOfficer,
    updateStatus,
    saveProfile,
    openResetDialog,
    closeResetDialog,
    handleResetPassword,
    assignments,
    assignmentsByOfficer,
    filteredAssignments,
    assignmentMetrics,
    assignmentsLoading,
    assignmentsError,
    eligibleProjects,
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
    assignProjectsToOfficer,
    assignDraftByOfficer,
    setAssignDraftByOfficer,
    saveAssignmentDraft,
    mutatingAssignmentId,
    updateAssignmentStatus,
    fetchAssignments,
    fetchEligibleProjects,
    verified,
  }
}

export type FieldOfficersState = ReturnType<typeof useFieldOfficers>
